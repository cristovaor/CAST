import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FaceLandmarker, FilesetResolver, type NormalizedLandmark } from '@mediapipe/tasks-vision';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { apiClient } from '@/lib/api';

type Phase = 'fit' | 'validation' | 'drift';
type ProtocolPoint = { x: number; y: number; phase: Phase; label: string };
type Proxy = { x: number | null; y: number | null; valid: boolean; flags: string[] };

interface CalibrationDetail { id: string; status: string; verdict?: string; metrics?: Record<string, number> }
interface Props { sessionId: string | null; open: boolean; onOpenChange: (open: boolean) => void }

const STABILIZE_MS = 500;
const COLLECT_MS = 1500;
const GRID = [0.1, 0.5, 0.9].flatMap((y) => [0.1, 0.5, 0.9].map((x) => ({ x, y })));
const VALIDATION = [{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.25 }, { x: 0.25, y: 0.75 }, { x: 0.75, y: 0.75 }, { x: 0.5, y: 0.3 }];

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

function average(points: NormalizedLandmark[], indices: number[]) {
  const selected = indices.map((index) => points[index]).filter(Boolean);
  return { x: selected.reduce((sum, point) => sum + point.x, 0) / selected.length, y: selected.reduce((sum, point) => sum + point.y, 0) / selected.length };
}

function proxyFromLandmarks(points?: NormalizedLandmark[]): Proxy {
  if (!points || points.length < 478) return { x: null, y: null, valid: false, flags: ['face_or_iris_missing'] };
  const right = average(points, [469, 470, 471, 472]);
  const left = average(points, [474, 475, 476, 477]);
  const rightCorners = [points[33], points[133]];
  const leftCorners = [points[362], points[263]];
  const normalize = (iris: { x: number; y: number }, corners: NormalizedLandmark[]) => {
    const width = Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y) || 1;
    const midpoint = { x: (corners[0].x + corners[1].x) / 2, y: (corners[0].y + corners[1].y) / 2 };
    return { x: (iris.x - midpoint.x) / width, y: (iris.y - midpoint.y) / width };
  };
  const r = normalize(right, rightCorners); const l = normalize(left, leftCorners);
  return { x: (r.x + l.x) / 2, y: (r.y + l.y) / 2, valid: true, flags: [] };
}

export function GazeCalibrationConsole({ sessionId, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const cancelRef = useRef(false);
  const [state, setState] = useState<'intro' | 'loading' | 'running' | 'uploading' | 'done' | 'error'>('intro');
  const [pointIndex, setPointIndex] = useState(0);
  const [collecting, setCollecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CalibrationDetail | null>(null);
  const protocol = useMemo<ProtocolPoint[]>(() => [
    ...shuffle(GRID).map((point, index) => ({ ...point, phase: 'fit' as const, label: `grade A${index + 1}` })),
    ...shuffle(GRID).map((point, index) => ({ ...point, phase: 'fit' as const, label: `grade B${index + 1}` })),
    ...shuffle(VALIDATION).map((point, index) => ({ ...point, phase: 'validation' as const, label: `validação ${index + 1}` })),
    { x: 0.5, y: 0.5, phase: 'drift' as const, label: 'drift final' },
  ], []);

  const cleanup = useCallback(() => {
    cancelRef.current = true;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    landmarkerRef.current?.close(); landmarkerRef.current = null;
  }, []);
  useEffect(() => cleanup, [cleanup]);

  const start = async () => {
    if (!sessionId) return;
    setState('loading'); setError(null); cancelRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, frameRate: 30 }, audio: false });
      streamRef.current = stream;
      if (!videoRef.current) throw new Error('Elemento de vídeo indisponível.');
      videoRef.current.srcObject = stream; await videoRef.current.play();
      const resolver = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
      landmarkerRef.current = await FaceLandmarker.createFromOptions(resolver, {
        baseOptions: { modelAssetPath: '/mediapipe/face_landmarker.task' }, runningMode: 'VIDEO', numFaces: 1,
        outputFaceBlendshapes: false, outputFacialTransformationMatrixes: true,
      });
      const calibration = await apiClient.post<CalibrationDetail>(`/sessions/${sessionId}/gaze-calibrations`, {
        screen_width_px: window.screen.width, screen_height_px: window.screen.height,
        pixels_per_degree: 40, random_seed: Date.now(), configuration: { web_runtime: '@mediapipe/tasks-vision@0.10.35' },
      });
      setState('running');
      const samples: Record<string, unknown>[] = [];
      for (let index = 0; index < protocol.length; index += 1) {
        if (cancelRef.current) return;
        setPointIndex(index); setCollecting(false);
        const point = protocol[index]; const started = performance.now();
        while (performance.now() - started < STABILIZE_MS + COLLECT_MS) {
          if (cancelRef.current) return;
          const now = performance.now();
          if (now - started >= STABILIZE_MS) {
            setCollecting(true);
            const detection = landmarkerRef.current.detectForVideo(videoRef.current, now);
            const proxy = proxyFromLandmarks(detection.faceLandmarks[0]);
            samples.push({
              client_sample_id: `${index}-${Math.round(now * 1000)}`, phase: point.phase, target_x: point.x, target_y: point.y,
              iris_offset_x: proxy.x, iris_offset_y: proxy.y, head_yaw_deg: null, head_pitch_deg: null,
              source_time_us: Math.round(now * 1000), source_clock_id: 'browser-performance', canonical_time_us: null,
              uncertainty_us: 1000, quality_flags: proxy.flags, valid: proxy.valid,
            });
          }
          await new Promise(requestAnimationFrame);
        }
      }
      setState('uploading');
      for (let offset = 0; offset < samples.length; offset += 1000) {
        await apiClient.post(`/gaze-calibrations/${calibration.id}/samples/batch`, { samples: samples.slice(offset, offset + 1000) });
      }
      let completed = await apiClient.post<CalibrationDetail>(`/gaze-calibrations/${calibration.id}/complete`);
      for (let attempt = 0; attempt < 80 && !['ready','no_go','failed'].includes(completed.status); attempt += 1) {
        if (cancelRef.current) return;
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
        completed = await apiClient.get<CalibrationDetail>(`/gaze-calibrations/${calibration.id}`);
      }
      if (!['ready','no_go'].includes(completed.status)) throw new Error(completed.status === 'failed' ? 'Worker de gaze falhou.' : 'Tempo limite aguardando calibração.');
      setResult(completed); setState('done'); cleanup();
      await queryClient.invalidateQueries({ queryKey: ['explorer-manifest', sessionId] });
    } catch (cause) {
      cleanup(); setError(cause instanceof Error ? cause.message : 'Falha na calibração.'); setState('error');
    }
  };

  if (!open) return null;
  const point = protocol[pointIndex];
  return (
    <div className="fixed inset-0 z-[100] bg-slate-950 text-white" role="dialog" aria-modal="true" aria-label="Calibração experimental de gaze">
      <video ref={videoRef} muted playsInline className="absolute bottom-4 right-4 h-28 rounded-lg border border-white/20 opacity-60" />
      <button type="button" onClick={() => onOpenChange(false)} className="absolute right-5 top-5 z-10 rounded-full bg-white/10 p-2"><X /></button>
      {state === 'running' && point ? (
        <>
          <div className="absolute left-5 top-5 text-sm text-white/70">{pointIndex + 1}/{protocol.length} · {point.label} · {collecting ? 'coletando' : 'estabilize'}</div>
          <div className={`absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white shadow-[0_0_30px_white] ${collecting ? 'bg-emerald-400' : 'bg-amber-400'}`} style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} />
        </>
      ) : (
        <div className="mx-auto flex min-h-full max-w-xl flex-col items-center justify-center p-8 text-center">
          {state === 'intro' && <><h2 className="text-2xl font-semibold">Calibração experimental de gaze</h2><p className="mt-4 text-sm text-white/70">Grade 3×3 em duas repetições, cinco pontos de validação e drift final. Mantenha a cabeça estável e olhe para cada alvo. Resultado não representa atenção.</p><button type="button" onClick={start} className="mt-7 rounded-lg bg-blue-500 px-5 py-3 font-semibold">Iniciar em tela cheia</button></>}
          {(state === 'loading' || state === 'uploading') && <><Loader2 className="animate-spin"/><p className="mt-3">{state === 'loading' ? 'Preparando câmera e MediaPipe…' : 'Preservando amostras e iniciando validação…'}</p></>}
          {state === 'done' && <><h2 className="text-xl font-semibold">Calibração concluída</h2><p className="mt-3 text-white/70">Veredito: {result?.verdict ?? result?.status}. Erro mediano: {typeof result?.metrics?.median_error_deg === 'number' ? `${result.metrics.median_error_deg.toFixed(2)}°` : '—'}. O Explorer foi atualizado.</p></>}
          {state === 'error' && <><AlertTriangle className="text-amber-400"/><p className="mt-3">{error}</p><button type="button" onClick={start} className="mt-5 rounded-lg bg-white/10 px-4 py-2">Tentar novamente</button></>}
        </div>
      )}
    </div>
  );
}

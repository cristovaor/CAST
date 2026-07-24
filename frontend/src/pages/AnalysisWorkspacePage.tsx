import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Play, Pause, ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react';
import { ProvenanceLegend } from '@/components/data-display/ProvenanceLegend';
import { ScientificCaveat } from '@/components/ui/ScientificCaveat';
import { PROVENANCE_META, type ProvenanceKind } from '@/types/research';
import { useSessionDetail } from '@/features/multimodal/useMultimodal';
import { useEEGData } from '@/features/eeg/useEEG';
import { useVideoTimeline } from '@/features/videos/useVideos';

// Main analytical screen (docs §12–13): video + EEG on ONE time axis, with a
// multimodal timeline of synchronized lanes. Analyses are configurable, not a
// fixed dashboard, and every lane keeps its data provenance distinguishable.
// Uses real EEG timeseries and video timeline when the session has them,
// falling back to synthetic lanes so the screen is never empty.

type Lane = { key: string; label: string; kind: ProvenanceKind; segments: [number, number][] };

const FALLBACK_LANES: Lane[] = [
  { key: 'video', label: 'Vídeo', kind: 'video_observed', segments: [[0, 100]] },
  { key: 'facial', label: 'Eventos faciais', kind: 'detected_event', segments: [[12, 18], [40, 44], [70, 76]] },
  { key: 'annot', label: 'Anotações', kind: 'human_annotation', segments: [[14, 17], [72, 75]] },
  { key: 'eeg', label: 'EEG (Cz)', kind: 'eeg_observed', segments: [[0, 100]] },
  { key: 'artifact', label: 'Artefatos EEG', kind: 'excluded', segments: [[30, 34], [88, 91]] },
  { key: 'alpha', label: 'Banda alfa', kind: 'derived_feature', segments: [[0, 100]] },
  { key: 'stim', label: 'Estímulos', kind: 'detected_event', segments: [[10, 11], [38, 39], [66, 67]] },
  { key: 'pred', label: 'Estimativa de modelo', kind: 'model_estimate', segments: [[40, 46], [70, 78]] },
];

const ANALYSES = ['Temporal', 'Vídeo', 'EEG', 'Multimodal', 'Estatística'];

export function AnalysisWorkspacePage() {
  const { sessionId } = useParams();
  const [playing, setPlaying] = useState(false);
  const [analysis, setAnalysis] = useState('Multimodal');
  const [cursor, setCursor] = useState(42);

  // Live data: session → EEG timeseries + video timeline.
  const { data: session } = useSessionDetail(sessionId);
  const { data: eeg } = useEEGData(session?.eeg_asset_id ?? undefined);
  const { data: timeline } = useVideoTimeline(session?.video_asset_id ?? '');

  const isLive = !!(eeg || timeline);
  const eegSpanS = eeg?.data.length
    ? (eeg.data[eeg.data.length - 1].timestamp_ms - eeg.data[0].timestamp_ms) / 1000
    : 0;
  const durationS = timeline?.duration_seconds ?? eegSpanS ?? 0;

  // Build real timeline lanes from the video timeline events, aligned by the
  // EEG sync offset. Percentages are relative to the session duration.
  const lanes: Lane[] = useMemo(() => {
    if (!isLive || durationS <= 0) return FALLBACK_LANES;
    const offsetS = (eeg?.sync_offset_ms ?? 0) / 1000;
    const toPct = (s: number) => Math.max(0, Math.min(100, (s / durationS) * 100));
    const facial: [number, number][] = (timeline?.events ?? []).map(
      (ev) => [toPct(ev.start_time), toPct(ev.end_time)] as [number, number],
    );
    const built: Lane[] = [
      { key: 'video', label: 'Vídeo', kind: 'video_observed', segments: [[0, 100]] },
    ];
    if (facial.length) built.push({ key: 'facial', label: 'Eventos faciais', kind: 'detected_event', segments: facial });
    if (eeg) {
      built.push({ key: 'eeg', label: `EEG (${eeg.data.length} amostras)`, kind: 'eeg_observed', segments: [[toPct(offsetS), 100]] });
      const bandKeys = ['alpha', 'beta', 'theta', 'delta', 'gamma'];
      if (eeg.data[0] && bandKeys.some((b) => b in eeg.data[0])) {
        built.push({ key: 'alpha', label: 'Bandas EEG', kind: 'derived_feature', segments: [[toPct(offsetS), 100]] });
      }
    }
    return built;
  }, [isLive, durationS, eeg, timeline]);

  // Real EEG waveform per band for the chart (downsampled for rendering).
  const eegSeries: number[][] = useMemo(() => {
    if (!eeg?.data.length) return [];
    const bands = ['delta', 'theta', 'alpha', 'beta', 'gamma'];
    const step = Math.max(1, Math.floor(eeg.data.length / 120));
    return bands.map((b) => {
      const vals = eeg.data.filter((_, i) => i % step === 0).map((r) => Number(r[b] ?? 0));
      return vals.length ? vals : [];
    }).filter((s) => s.length);
  }, [eeg]);

  return (
    <div className="min-h-full bg-slate-900 pb-8">
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Link to={`/app/sessions/${sessionId}`} className="text-slate-400 hover:text-white"><ArrowLeft size={16} /></Link>
              <h1 className="text-lg font-semibold text-white">Workspace de análise sincronizada</h1>
            </div>
            <p className="text-[12px] text-slate-400 mt-1">
              Vídeo e EEG no mesmo eixo temporal · Sessão {sessionId?.slice(0, 8)}
              {isLive
                ? ` · dados reais${eeg ? ` · offset ${eeg.sync_offset_ms} ms` : ''}${durationS ? ` · ${durationS.toFixed(0)}s` : ''}`
                : ' · dados sintéticos (sessão sem vídeo/EEG conectados)'}
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-slate-800 p-1">
            {ANALYSES.map((a) => (
              <button
                key={a}
                onClick={() => setAnalysis(a)}
                className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${analysis === a ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {/* Video + EEG side by side */}
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title="Player de vídeo">
            <div className="relative aspect-video rounded-lg bg-black flex items-center justify-center">
              <span className="text-slate-600 text-sm">Vídeo facial</span>
              <span className="absolute bottom-2 left-2 text-[10px] font-mono text-slate-400 bg-black/50 px-1.5 py-0.5 rounded">
                {String(Math.floor(cursor / 60 * 7.4)).padStart(2, '0')}:{String(Math.floor((cursor * 7.4) % 60)).padStart(2, '0')} · frame {Math.round(cursor * 22)}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <button onClick={() => setCursor((c) => Math.max(0, c - 1))} className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800"><ChevronLeft size={16} /></button>
              <button onClick={() => setPlaying((p) => !p)} className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700">{playing ? <Pause size={16} /> : <Play size={16} />}</button>
              <button onClick={() => setCursor((c) => Math.min(100, c + 1))} className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800"><ChevronRight size={16} /></button>
              <div className="flex-1" />
              <span className="text-[11px] text-slate-500">Velocidade 1×</span>
              <button className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800"><Maximize2 size={14} /></button>
            </div>
          </Panel>

          <Panel title="Visualização de EEG">
            <div className="rounded-lg bg-slate-950 p-3 h-[calc(100%-0px)] min-h-[210px]">
              {(eegSeries.length ? ['delta', 'theta', 'alpha', 'beta', 'gamma'] : ['Fz', 'Cz', 'C3', 'C4', 'O1']).map((ch, i) => (
                <div key={ch} className="flex items-center gap-2 mb-1.5">
                  <span className="w-10 text-[10px] font-mono text-slate-500">{ch}</span>
                  <svg viewBox="0 0 300 20" className="flex-1 h-5" preserveAspectRatio="none">
                    <path
                      d={eegSeries.length ? seriesPath(eegSeries[i] ?? []) : eegPath(i)}
                      fill="none"
                      stroke={i === 2 ? '#22d3ee' : '#475569'}
                      strokeWidth="1"
                    />
                  </svg>
                </div>
              ))}
              <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-500">
                {eeg ? (
                  <><span>{eeg.data.length} amostras</span><span>offset {eeg.sync_offset_ms} ms</span><span>bandas espectrais</span></>
                ) : (
                  <><span>Filtro: 1–40 Hz</span><span>Notch 60 Hz</span><span>Escala 50 µV</span><span>sintético</span></>
                )}
              </div>
            </div>
          </Panel>
        </div>

        {/* Multimodal timeline */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">Timeline multimodal</h3>
            <ProvenanceLegend
              kinds={['video_observed', 'eeg_observed', 'human_annotation', 'detected_event', 'derived_feature', 'model_estimate', 'excluded']}
              className="[&_span]:text-slate-400"
            />
          </div>

          <div className="relative">
            {/* cursor */}
            <div className="absolute top-0 bottom-0 w-px bg-red-500/70 z-10 pointer-events-none" style={{ left: `calc(88px + ${cursor}% * (100% - 88px) / 100)` }} />
            {lanes.map((lane) => (
              <div key={lane.key} className="flex items-center gap-2 mb-1.5">
                <span className="w-20 text-[10px] text-slate-400 truncate shrink-0">{lane.label}</span>
                <div
                  className="relative flex-1 h-6 rounded bg-slate-800/60 cursor-pointer"
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    setCursor(Math.round(((e.clientX - r.left) / r.width) * 100));
                  }}
                >
                  {lane.segments.map(([a, b], i) => (
                    <div
                      key={i}
                      className="absolute inset-y-1 rounded-sm"
                      style={{ left: `${a}%`, width: `${b - a}%`, backgroundColor: PROVENANCE_META[lane.kind].color, opacity: lane.kind === 'video_observed' || lane.kind === 'eeg_observed' || lane.kind === 'derived_feature' ? 0.4 : 0.85 }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-3 text-[10px] text-slate-500">
            <button className="rounded border border-slate-700 px-2 py-1 hover:bg-slate-800">Zoom temporal</button>
            <button className="rounded border border-slate-700 px-2 py-1 hover:bg-slate-800">Selecionar intervalo</button>
            <button className="rounded border border-slate-700 px-2 py-1 hover:bg-slate-800">Criar evento</button>
            <button className="rounded border border-slate-700 px-2 py-1 hover:bg-slate-800">Exportar intervalo</button>
            <button className="rounded border border-slate-700 px-2 py-1 hover:bg-slate-800">Comparar sessões</button>
          </div>
        </div>

        <div className="rounded-lg bg-slate-800/40 border border-slate-800 p-1">
          <ScientificCaveat variant="association" compact className="!bg-slate-800/60 !border-slate-700 !text-slate-300">
            Coincidências temporais observadas entre eventos faciais e alterações do EEG indicam associação no intervalo selecionado, não causalidade. Os resultados dependem do método de sincronização e requerem validação pelo pesquisador.
          </ScientificCaveat>
        </div>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <h3 className="text-sm font-semibold text-white mb-3">{title}</h3>
      {children}
    </div>
  );
}

// Deterministic pseudo-waveform so lanes render without real data.
function eegPath(seed: number): string {
  let d = 'M 0 10';
  for (let x = 0; x <= 300; x += 4) {
    const y = 10 + Math.sin((x + seed * 30) / 9) * 4 + Math.sin((x + seed * 11) / 3) * 2;
    d += ` L ${x} ${y.toFixed(1)}`;
  }
  return d;
}

// Maps a real value series into a normalized SVG path (0..300 × 0..20 viewBox).
function seriesPath(values: number[]): string {
  if (!values.length) return 'M 0 10 L 300 10';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1 || 1)) * 300;
      const y = 18 - ((v - min) / range) * 16; // pad top/bottom
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

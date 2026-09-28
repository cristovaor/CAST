import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Camera, CheckCircle2, HardDrive, Loader2, RotateCcw, Square } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { ActionButton } from '@/components/ui/ActionButton';
import { useLiveCapture } from './useLiveCapture';

interface LiveCaptureConsoleProps {
  sessionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface FaceObservation {
  boundingBox: DOMRectReadOnly;
}

interface FaceDetectorLike {
  detect(source: CanvasImageSource): Promise<FaceObservation[]>;
}

type FaceDetectorConstructor = new (options?: { fastMode?: boolean; maxDetectedFaces?: number }) => FaceDetectorLike;

interface QualityState {
  luminance: number | null;
  facePresent: boolean | null;
  framingOk: boolean | null;
}

export function LiveCaptureConsole({ sessionId, open, onOpenChange }: LiveCaptureConsoleProps) {
  const { t } = useTranslation('acquisition');
  const videoRef = useRef<HTMLVideoElement>(null);
  const { phase, stream, progress, error, pending, start, stop, retry, discard } = useLiveCapture(sessionId);
  const [storage, setStorage] = useState<{ quota: number; usage: number } | null>(null);
  const [quality, setQuality] = useState<QualityState>({
    luminance: null,
    facePresent: null,
    framingOk: null,
  });

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  useEffect(() => {
    navigator.storage?.estimate().then((estimate) => {
      setStorage({ quota: estimate.quota ?? 0, usage: estimate.usage ?? 0 });
    }).catch(() => setStorage(null));
  }, [phase]);

  useEffect(() => {
    if (!stream) return;
    const detectorConstructor = (window as Window & { FaceDetector?: FaceDetectorConstructor }).FaceDetector;
    const detector = detectorConstructor
      ? new detectorConstructor({ fastMode: true, maxDetectedFaces: 1 })
      : null;
    const timer = window.setInterval(async () => {
      const video = videoRef.current;
      if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 90;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let sum = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        sum += (pixels[index] * 0.2126) + (pixels[index + 1] * 0.7152) + (pixels[index + 2] * 0.0722);
      }
      const luminance = sum / (pixels.length / 4);
      if (!detector) {
        setQuality({ luminance, facePresent: null, framingOk: null });
        return;
      }
      try {
        const faces = await detector.detect(video);
        const face = faces[0];
        if (!face) {
          setQuality({ luminance, facePresent: false, framingOk: false });
          return;
        }
        const box = face.boundingBox;
        const centerX = (box.x + box.width / 2) / video.videoWidth;
        const centerY = (box.y + box.height / 2) / video.videoHeight;
        const areaRatio = (box.width * box.height) / (video.videoWidth * video.videoHeight);
        setQuality({
          luminance,
          facePresent: true,
          framingOk: Math.abs(centerX - 0.5) < 0.22
            && Math.abs(centerY - 0.45) < 0.25
            && areaRatio > 0.04
            && areaRatio < 0.55,
        });
      } catch {
        setQuality({ luminance, facePresent: null, framingOk: null });
      }
    }, 1500);
    return () => window.clearInterval(timer);
  }, [stream]);

  const settings = stream?.getVideoTracks()[0]?.getSettings();
  const busy = ['requesting', 'stopped', 'uploading'].includes(phase);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && phase === 'recording') return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-3xl border-border bg-surface text-text-primary">
        <DialogHeader>
          <DialogTitle className="text-text-primary">{t('capture.title')}</DialogTitle>
          <DialogDescription className="text-text-secondary">
            {t('capture.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(220px,1fr)]">
          <div className="aspect-video overflow-hidden rounded-xl border border-border bg-slate-950">
            {stream ? (
              <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                <Camera className="mr-2" size={18} aria-hidden="true" /> {t('capture.preview')}
              </div>
            )}
          </div>

          <div className="space-y-2 text-xs">
            <StatusRow
              label={t('capture.camera')}
              value={settings ? `${settings.width ?? '?'}×${settings.height ?? '?'} · ${settings.frameRate ?? '?'} fps` : t('capture.awaitingPermission')}
              ok={Boolean(settings)}
            />
            <StatusRow
              label={t('capture.lighting')}
              value={quality.luminance == null ? t('capture.awaitingSample') : `${Math.round(quality.luminance)}/255`}
              ok={quality.luminance == null ? null : quality.luminance >= 45 && quality.luminance <= 220}
            />
            <StatusRow
              label={t('capture.facePresent')}
              value={quality.facePresent == null ? t('capture.validatedLater') : quality.facePresent ? t('capture.detected') : t('capture.notDetected')}
              ok={quality.facePresent}
            />
            <StatusRow
              label={t('capture.framing')}
              value={quality.framingOk == null ? t('capture.validatedLater') : quality.framingOk ? t('capture.framingOk') : t('capture.adjustPosition')}
              ok={quality.framingOk}
            />
            <StatusRow
              label={t('capture.storage')}
              value={storage ? t('capture.storageFree', { size: formatBytes(Math.max(storage.quota - storage.usage, 0)) }) : t('capture.storageUnknown')}
              ok={storage ? storage.quota - storage.usage > 100 * 1024 * 1024 : null}
              icon="storage"
            />
          </div>
        </div>

        {(phase === 'uploading' || phase === 'validating') && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-text-secondary">
              <span>{phase === 'uploading' ? t('capture.uploadingParts') : t('capture.validating')}</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
              <div className="h-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {pending && phase === 'idle' && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            {t('capture.pending')}
          </div>
        )}
        {error && (
          <div role="alert" className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            <AlertTriangle size={17} className="mt-0.5 shrink-0" aria-hidden="true" /> {error}
          </div>
        )}
        {phase === 'validating' && (
          <div role="status" className="flex gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
            <CheckCircle2 size={17} className="mt-0.5 shrink-0" aria-hidden="true" /> {t('capture.confirmed')}
          </div>
        )}

        <DialogFooter>
          {pending && phase !== 'recording' && phase !== 'validating' && (
            <ActionButton type="button" variant="ghost" onClick={discard} disabled={busy}>
              {t('capture.discard')}
            </ActionButton>
          )}
          {(phase === 'idle' || phase === 'error') && pending && (
            <ActionButton type="button" variant="secondary" onClick={retry} disabled={busy}>
              <RotateCcw size={16} aria-hidden="true" /> {t('capture.resume')}
            </ActionButton>
          )}
          {(phase === 'idle' || phase === 'error') && !pending && (
            <ActionButton type="button" variant="primary" onClick={start} disabled={!sessionId || busy}>
              <Camera size={16} aria-hidden="true" /> {t('capture.start')}
            </ActionButton>
          )}
          {phase === 'recording' && (
            <ActionButton type="button" variant="danger" onClick={stop}>
              <Square size={15} fill="currentColor" aria-hidden="true" /> {t('capture.stop')}
            </ActionButton>
          )}
          {busy && (
            <ActionButton type="button" variant="primary" disabled>
              <Loader2 size={16} className="animate-spin" aria-hidden="true" /> {t('capture.processing')}
            </ActionButton>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusRow({ label, value, ok, icon }: {
  label: string;
  value: string;
  ok: boolean | null;
  icon?: 'storage';
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-muted p-2.5">
      <div className="flex items-center gap-1.5 font-medium text-text-primary">
        {icon === 'storage' && <HardDrive size={13} aria-hidden="true" />}
        {label}
        <span aria-hidden="true" className={`ml-auto h-2 w-2 rounded-full ${ok == null ? 'bg-slate-300' : ok ? 'bg-emerald-500' : 'bg-amber-500'}`} />
      </div>
      <div className="mt-1 text-text-secondary">{value}</div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

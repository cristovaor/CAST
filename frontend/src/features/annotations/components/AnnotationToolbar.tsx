import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { useAnnotationStore } from '../store/useAnnotationStore';
import { usePlaybackStore } from '@/features/playback/usePlaybackStore';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import type { LandmarkOverlayMode } from './landmarkOverlayGeometry';

interface AnnotationToolbarProps {
  annotationMode: 'interval' | 'point';
  onAnnotationModeChange: (mode: 'interval' | 'point') => void;
  overlayMode: LandmarkOverlayMode;
  onOverlayModeChange: (mode: LandmarkOverlayMode) => void;
  canShowLandmarks: boolean;
}

export function AnnotationToolbar({
  annotationMode,
  onAnnotationModeChange,
  overlayMode,
  onOverlayModeChange,
  canShowLandmarks,
}: AnnotationToolbarProps) {
  const draft = useAnnotationStore((state) => state.draft);
  const {
    isPlaying,
    setIsPlaying,
    playbackRate,
    setPlaybackRate,
    currentTimeMs,
    durationMs,
    fps,
    requestSeek,
  } = usePlaybackStore();
  const rates = [0.25, 0.5, 1, 2];

  const stepFrame = (direction: -1 | 1) => {
    setIsPlaying(false);
    requestSeek(
      Math.max(
        0,
        Math.min(durationMs, currentTimeMs + direction * (1000 / fps)),
      ),
    );
  };

  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => stepFrame(-1)}>
          <SkipBack className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setIsPlaying(!isPlaying)}
        >
          {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </Button>
        <Button variant="outline" size="icon" onClick={() => stepFrame(1)}>
          <SkipForward className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const index = rates.indexOf(playbackRate);
            setPlaybackRate(rates[(index + 1) % rates.length]);
          }}
          className="w-16 font-mono"
        >
          {playbackRate}x
        </Button>
      </div>

      <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1">
        {(['interval', 'point'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => onAnnotationModeChange(mode)}
            className={`rounded px-3 py-1.5 text-xs ${
              annotationMode === mode
                ? 'bg-primary text-text-inverse'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            {mode === 'interval' ? 'Intervalo' : 'Ponto'}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1">
        {(['off', 'roi', 'area', 'mesh'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            disabled={!canShowLandmarks && mode !== 'off'}
            onClick={() => onOverlayModeChange(mode)}
            className={`rounded px-2.5 py-1.5 text-xs disabled:opacity-30 ${
              overlayMode === mode
                ? 'bg-info text-text-inverse'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            {mode === 'off'
              ? 'Desligado'
              : mode === 'roi'
                ? 'Pontos'
                : mode === 'area'
                  ? 'Área'
                  : 'Malha'}
          </button>
        ))}
      </div>

      {draft ? (
        <Badge variant="destructive">Intervalo em aberto</Badge>
      ) : (
        <Badge variant="secondary">Aguardando</Badge>
      )}
    </div>
  );
}

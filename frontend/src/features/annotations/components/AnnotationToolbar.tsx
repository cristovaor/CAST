import { useTranslation } from 'react-i18next';
import {
  Pause,
  Play,
  Redo2,
  SkipBack,
  SkipForward,
  Undo2,
} from 'lucide-react';
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
  canUndo?: boolean;
  canRedo?: boolean;
  historyPending?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}

export function AnnotationToolbar({
  annotationMode,
  onAnnotationModeChange,
  overlayMode,
  onOverlayModeChange,
  canShowLandmarks,
  canUndo = false,
  canRedo = false,
  historyPending = false,
  onUndo,
  onRedo,
}: AnnotationToolbarProps) {
  const { t } = useTranslation('annotations');
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
        <Button variant="outline" size="icon" onClick={() => stepFrame(-1)} aria-label={t('toolbar.previousFrame')} title={t('toolbar.previousFrame')}>
          <SkipBack className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setIsPlaying(!isPlaying)}
          aria-label={isPlaying ? t('toolbar.pause') : t('toolbar.play')}
          title={isPlaying ? t('toolbar.pause') : t('toolbar.play')}
        >
          {isPlaying ? <Pause className="h-5 w-5" aria-hidden="true" /> : <Play className="h-5 w-5" aria-hidden="true" />}
        </Button>
        <Button variant="outline" size="icon" onClick={() => stepFrame(1)} aria-label={t('toolbar.nextFrame')} title={t('toolbar.nextFrame')}>
          <SkipForward className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const index = rates.indexOf(playbackRate);
            setPlaybackRate(rates[(index + 1) % rates.length]);
          }}
          className="w-16 font-mono"
          aria-label={t('toolbar.speed', { rate: playbackRate })}
        >
          {playbackRate}x
        </Button>
        <span className="mx-1 h-5 w-px bg-border" />
        <Button
          variant="outline"
          size="icon"
          disabled={!canUndo || historyPending}
          onClick={onUndo}
          title={t('toolbar.undo')}
          aria-label={t('toolbar.undo')}
        >
          <Undo2 className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          disabled={!canRedo || historyPending}
          onClick={onRedo}
          title={t('toolbar.redo')}
          aria-label={t('toolbar.redo')}
        >
          <Redo2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1">
        {(['interval', 'point'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={annotationMode === mode}
            onClick={() => onAnnotationModeChange(mode)}
            className={`rounded px-3 py-1.5 text-xs ${
              annotationMode === mode
                ? 'bg-primary text-text-inverse'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            {mode === 'interval' ? t('toolbar.interval') : t('toolbar.point')}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1">
        {(['off', 'roi', 'area', 'mesh'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            disabled={!canShowLandmarks && mode !== 'off'}
            aria-pressed={overlayMode === mode}
            onClick={() => onOverlayModeChange(mode)}
            className={`rounded px-2.5 py-1.5 text-xs disabled:opacity-30 ${
              overlayMode === mode
                ? 'bg-info text-text-inverse'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            {t(`toolbar.overlay.${mode}`)}
          </button>
        ))}
      </div>

      {draft ? (
        <Badge variant="destructive">{t('toolbar.openInterval')}</Badge>
      ) : (
        <Badge variant="secondary">{t('toolbar.waiting')}</Badge>
      )}
    </div>
  );
}

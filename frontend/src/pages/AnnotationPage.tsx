import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { AnnotationSidebarList } from '@/features/annotations/components/AnnotationSidebarList';
import { AnnotationTimeline } from '@/features/annotations/components/AnnotationTimeline';
import { AnnotationToolbar } from '@/features/annotations/components/AnnotationToolbar';
import { SuggestionReviewPanel } from '@/features/annotations/components/SuggestionReviewPanel';
import { VideoAnnotatorPlayer } from '@/features/annotations/components/VideoAnnotatorPlayer';
import {
  useAnnotationContext,
  useAnnotationSuggestions,
  useCreateVideoAnnotation,
  useReviewSuggestion,
  useVideoAnnotations,
} from '@/features/annotations/api/useAnnotationEditor';
import { useAnnotationStore } from '@/features/annotations/store/useAnnotationStore';
import {
  useProcessVideo,
  useVideoPlaybackUrl,
} from '@/features/videos/useVideos';
import { usePlaybackStore } from '@/features/playback/usePlaybackStore';
import { Button } from '@/components/ui/Button';
import type { AnnotationSuggestion } from '@/types/annotation';
import { timeToFrame } from '@/features/annotations/annotationFrame';

export function AnnotationPage() {
  const { videoId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const taskId = searchParams.get('taskId') ?? undefined;
  const { data: playback } = useVideoPlaybackUrl(videoId);
  const contextQuery = useAnnotationContext(videoId, taskId);
  const annotationsQuery = useVideoAnnotations(videoId, taskId);
  const suggestionsQuery = useAnnotationSuggestions(videoId, taskId);
  const createAnnotation = useCreateVideoAnnotation(videoId, taskId);
  const reviewSuggestion = useReviewSuggestion(videoId, taskId);
  const processVideo = useProcessVideo();

  const { draft, startDraft, cancelDraft, setEvents } = useAnnotationStore();
  const {
    currentTimeMs,
    durationMs,
    fps,
    isPlaying,
    setFps,
    setDurationMs,
    setIsPlaying,
    requestSeek,
    reset,
  } = usePlaybackStore();

  const [annotationMode, setAnnotationMode] = useState<'interval' | 'point'>(
    'interval',
  );
  const [overlayMode, setOverlayMode] = useState<'off' | 'roi' | 'mesh'>('roi');
  const [selectedAction, setSelectedAction] = useState('');
  const [pointSize, setPointSize] = useState(2);
  const [opacity, setOpacity] = useState(0.85);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const context = contextQuery.data;
  const categories = context?.categories ?? [];
  const artifact =
    context?.landmarkArtifact?.status === 'ready'
      ? context.landmarkArtifact
      : undefined;
  const suggestions = suggestionsQuery.data?.suggestions ?? [];

  useEffect(() => {
    if (!context) return;
    setFps(context.video.fps || 30);
    if (context.video.durationSeconds != null) {
      setDurationMs(context.video.durationSeconds * 1000);
    }
  }, [context, setDurationMs, setFps]);

  useEffect(() => {
    setEvents(annotationsQuery.data ?? []);
  }, [annotationsQuery.data, setEvents]);

  useEffect(() => {
    if (!selectedAction && categories[0]) {
      setSelectedAction(categories[0].code);
    }
  }, [categories, selectedAction]);

  useEffect(() => {
    if (!artifact) setOverlayMode('off');
  }, [artifact]);

  useEffect(() => () => reset(), [reset, videoId]);

  const selectedCategory = useMemo(
    () => categories.find((category) => category.code === selectedAction),
    [categories, selectedAction],
  );

  const savePoint = useCallback(
    (actionCode: string, actionLabel: string) => {
      const frame = timeToFrame(currentTimeMs, fps);
      createAnnotation.mutate(
        {
          kind: 'point',
          actionCode,
          actionLabel,
          startFrame: frame,
          endFrame: frame,
        },
        {
          onError: (error) => setMessage(error.message),
        },
      );
    },
    [createAnnotation, currentTimeMs, fps],
  );

  const finishInterval = useCallback(() => {
    if (!draft) return;
    const endFrame = timeToFrame(currentTimeMs, fps);
    createAnnotation.mutate(
      {
        kind: 'interval',
        actionCode: draft.actionCode,
        actionLabel: draft.actionLabel,
        startFrame: Math.min(draft.startFrame, endFrame),
        endFrame: Math.max(draft.startFrame, endFrame),
      },
      {
        onSuccess: () => cancelDraft(),
        onError: (error) => setMessage(error.message),
      },
    );
  }, [cancelDraft, createAnnotation, currentTimeMs, draft, fps]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.matches('input, textarea, select, button')
        || target?.isContentEditable
      ) {
        return;
      }
      if (event.code === 'Space') {
        event.preventDefault();
        setIsPlaying(!isPlaying);
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        setIsPlaying(false);
        const direction = event.key === 'ArrowLeft' ? -1 : 1;
        requestSeek(
          Math.max(
            0,
            Math.min(
              durationMs,
              currentTimeMs + direction * (1000 / Math.max(1, fps)),
            ),
          ),
        );
        return;
      }
      if (event.key === 'Escape') {
        cancelDraft();
        return;
      }
      if (event.key === 'Enter' && draft) {
        event.preventDefault();
        finishInterval();
        return;
      }
      if (/^[1-9]$/.test(event.key)) {
        const category = categories.find(
          (item) => item.shortcut === Number(event.key),
        );
        if (!category) return;
        event.preventDefault();
        setSelectedAction(category.code);
        if (event.shiftKey || annotationMode === 'point') {
          savePoint(category.code, category.label);
        } else {
          startDraft(
            category.code,
            category.label,
            currentTimeMs / 1000,
            timeToFrame(currentTimeMs, fps),
          );
        }
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [
    annotationMode,
    cancelDraft,
    categories,
    currentTimeMs,
    draft,
    durationMs,
    finishInterval,
    fps,
    isPlaying,
    requestSeek,
    savePoint,
    setIsPlaying,
    startDraft,
  ]);

  const review = (
    suggestion: AnnotationSuggestion,
    decision: 'accepted' | 'corrected' | 'rejected',
    correction?: {
      kind: 'interval' | 'point';
      actionCode: string;
      actionLabel: string;
      startFrame: number;
      endFrame: number;
    },
  ) => {
    const predictionId = suggestionsQuery.data?.predictionId;
    if (!predictionId) return;
    reviewSuggestion.mutate(
      {
        modelEventKey: suggestion.modelEventKey,
        predictionId,
        decision,
        correction,
      },
      { onError: (error) => setMessage(error.message) },
    );
  };

  if (!videoId) {
    return <div className="p-8">Vídeo não informado.</div>;
  }
  if (contextQuery.isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }
  if (contextQuery.isError || !context) {
    return (
      <div className="m-8 rounded-lg border border-red-200 bg-red-50 p-5 text-red-700">
        Não foi possível abrir o contexto de anotação.
      </div>
    );
  }

  const extracting = context.processing.some(
    (job) =>
      job.type === 'extract_landmarks'
      && (job.status === 'queued' || job.status === 'running'),
  );

  return (
    <div className="flex h-[calc(100vh-theme(spacing.16))] flex-col bg-slate-950 text-slate-100">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-3">
        <div>
          <h1 className="text-base font-semibold">Anotação · {context.video.filename}</h1>
          <p className="text-xs text-slate-500">
            {fps.toFixed(2)} fps · quadro {timeToFrame(currentTimeMs, fps)}
            {context.task ? ` · tarefa ${context.task.id.slice(0, 8)}` : ''}
          </p>
        </div>
        {!artifact && (
          <Button
            disabled={extracting || processVideo.isPending}
            onClick={() =>
              processVideo.mutate(videoId, {
                onSuccess: () => void contextQuery.refetch(),
                onError: (error) => setMessage(error.message),
              })
            }
          >
            {extracting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {extracting ? 'Processando landmarks' : 'Processar landmarks'}
          </Button>
        )}
      </header>

      {message && (
        <div className="flex items-center justify-between border-b border-amber-700/40 bg-amber-950/60 px-5 py-2 text-xs text-amber-200">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> {message}
          </span>
          <button type="button" onClick={() => setMessage(null)}>Fechar</button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-4">
            <VideoAnnotatorPlayer
              videoId={videoId}
              videoUrl={playback?.url ?? ''}
              artifactId={artifact?.id}
              chunkSizeFrames={artifact?.chunkSizeFrames ?? Math.max(1, Math.round(fps))}
              overlayMode={overlayMode}
              overlayAction={selectedAction || undefined}
              pointSize={pointSize}
              opacity={opacity}
            />

            <div className="mt-3 flex w-full max-w-5xl flex-wrap items-center gap-3 text-xs text-slate-400">
              <label>
                Ação/ROI{' '}
                <select
                  value={selectedAction}
                  onChange={(event) => setSelectedAction(event.target.value)}
                  className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200"
                >
                  {categories.map((category) => (
                    <option key={category.code} value={category.code}>
                      {category.shortcut ? `${category.shortcut}. ` : ''}
                      {category.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tamanho{' '}
                <input
                  type="range"
                  min={1}
                  max={6}
                  step={0.5}
                  value={pointSize}
                  onChange={(event) => setPointSize(Number(event.target.value))}
                />
              </label>
              <label>
                Opacidade{' '}
                <input
                  type="range"
                  min={0.2}
                  max={1}
                  step={0.05}
                  value={opacity}
                  onChange={(event) => setOpacity(Number(event.target.value))}
                />
              </label>
              <span className="ml-auto">
                {selectedCategory?.label ?? selectedAction} · número marca ·
                Shift+número cria ponto
              </span>
            </div>
          </div>

          <div className="border-t border-slate-800 bg-slate-950 px-4 py-2">
            <AnnotationToolbar
              annotationMode={annotationMode}
              onAnnotationModeChange={setAnnotationMode}
              overlayMode={overlayMode}
              onOverlayModeChange={setOverlayMode}
              canShowLandmarks={Boolean(artifact)}
            />
          </div>
          <AnnotationTimeline
            suggestions={suggestions}
            showSuggestions={showSuggestions}
          />
        </main>

        <aside className="w-96 shrink-0 overflow-y-auto border-l border-slate-800 bg-slate-900">
          <AnnotationSidebarList />
          <div className="border-t border-slate-800">
            <SuggestionReviewPanel
              suggestions={suggestions}
              predictionId={suggestionsQuery.data?.predictionId ?? null}
              categories={categories}
              visible={showSuggestions}
              onVisibleChange={setShowSuggestions}
              onReview={review}
              pending={reviewSuggestion.isPending}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

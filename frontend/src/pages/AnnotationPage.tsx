import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Download, Loader2, RefreshCw, Upload } from 'lucide-react';
import { AnnotationSidebarList } from '@/features/annotations/components/AnnotationSidebarList';
import { AnnotationTimeline } from '@/features/annotations/components/AnnotationTimeline';
import { AnnotationToolbar } from '@/features/annotations/components/AnnotationToolbar';
import { SuggestionReviewPanel } from '@/features/annotations/components/SuggestionReviewPanel';
import { VideoAnnotatorPlayer } from '@/features/annotations/components/VideoAnnotatorPlayer';
import {
  useAnalyzeAnnotationInterval,
  useAnnotationContext,
  useAnnotationHistory,
  useAnnotationSuggestions,
  useCreateVideoAnnotation,
  useRedoAnnotation,
  useReviewSuggestion,
  useUndoAnnotation,
  useVideoAnnotations,
} from '@/features/annotations/api/useAnnotationEditor';
import { useAnnotationStore } from '@/features/annotations/store/useAnnotationStore';
import {
  useProcessVideo,
  useVideoPlaybackUrl,
} from '@/features/videos/useVideos';
import { usePlaybackStore } from '@/features/playback/usePlaybackStore';
import { Button } from '@/components/ui/Button';
import type {
  AnnotationIntervalAnalysis,
  AnnotationDraft,
  AnnotationSide,
  AnnotationSuggestion,
} from '@/types/annotation';
import { timeToFrame } from '@/features/annotations/annotationFrame';
import { downloadCsv, eventsToCsv, parseAnnotationCsv } from '@/features/annotations/annotationCsv';
import type { LandmarkOverlayMode } from '@/features/annotations/components/landmarkOverlayGeometry';
import type { FacialRegionSelection } from '@/features/annotations/components/LandmarkOverlay';
import { SmartIntervalProposal } from '@/features/annotations/components/SmartIntervalProposal';
import { AnnotationComparisonPanel } from '@/features/annotations/components/AnnotationComparisonPanel';
import type { TimelineEventDTO } from '@/features/videos/types';

const BILATERAL_ACTIONS = new Set(['OF', 'OC', 'MSO']);

function defaultSideForAction(actionCode: string): AnnotationSide {
  if (BILATERAL_ACTIONS.has(actionCode)) return 'both';
  if (actionCode === 'ML') return 'center';
  if (actionCode === 'VR') return 'whole';
  return 'unspecified';
}

function regionForAction(
  actionCode: string,
  side: AnnotationSide,
): string | undefined {
  const prefix =
    side === 'left' ? 'left' : side === 'right' ? 'right' : '';
  if (actionCode === 'OF') return prefix ? `${prefix}Eye` : 'eyes';
  if (actionCode === 'OC') return prefix ? `${prefix}Iris` : 'irises';
  if (actionCode === 'MSO') {
    return prefix ? `${prefix}Eyebrow` : 'eyebrows';
  }
  if (actionCode === 'ML') return 'lips';
  if (actionCode === 'VR') return 'face';
  return undefined;
}

export function AnnotationPage() {
  const { videoId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const taskId = searchParams.get('taskId') ?? undefined;
  const { data: playback } = useVideoPlaybackUrl(videoId);
  const contextQuery = useAnnotationContext(videoId, taskId);
  const annotationsQuery = useVideoAnnotations(videoId, taskId);
  const historyQuery = useAnnotationHistory(videoId, taskId);
  const suggestionsQuery = useAnnotationSuggestions(videoId, taskId);
  const createAnnotation = useCreateVideoAnnotation(videoId, taskId);
  const analyzeInterval = useAnalyzeAnnotationInterval(videoId);
  const reviewSuggestion = useReviewSuggestion(videoId, taskId);
  const undoAnnotation = useUndoAnnotation(videoId, taskId);
  const redoAnnotation = useRedoAnnotation(videoId, taskId);
  const processVideo = useProcessVideo();

  const {
    draft,
    events,
    startDraft,
    cancelDraft,
    restoreDraft,
    setEvents,
  } = useAnnotationStore();
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
  const [overlayMode, setOverlayMode] = useState<LandmarkOverlayMode>('area');
  const [selectedAction, setSelectedAction] = useState('');
  const [selectedSide, setSelectedSide] = useState<AnnotationSide>('both');
  const [pointSize, setPointSize] = useState(2);
  const [opacity, setOpacity] = useState(0.85);
  const [showMotionVectors, setShowMotionVectors] = useState(true);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [intervalProposal, setIntervalProposal] =
    useState<AnnotationIntervalAnalysis | null>(null);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const context = contextQuery.data;
  const categories = useMemo(
    () => context?.categories ?? [],
    [context?.categories],
  );
  const artifact =
    context?.landmarkArtifact?.status === 'ready'
      ? context.landmarkArtifact
      : undefined;
  const suggestions = useMemo(
    () => suggestionsQuery.data?.suggestions ?? [],
    [suggestionsQuery.data?.suggestions],
  );
  const effectiveSelectedAction =
    selectedAction || categories[0]?.code || '';
  const effectiveOverlayMode: LandmarkOverlayMode = artifact
    ? overlayMode
    : 'off';
  const draftStorageKey = `cast:annotation-draft:${videoId}:${taskId ?? 'current'}`;
  const comparisonOverlayEvents = useMemo<TimelineEventDTO[]>(() => {
    const humanEvents: TimelineEventDTO[] = events.map((event) => ({
      event_id: event.id,
      action: event.actionCode,
      start_frame: event.startFrame,
      end_frame: event.endFrame,
      start_time: event.startTime,
      end_time: event.endTime,
      confidence_mean: event.confidence ?? 1,
      origin: 'annotator',
      region: event.region,
      side: event.side,
    }));
    if (!showSuggestions) return humanEvents;
    const modelEvents: TimelineEventDTO[] = suggestions
      .filter((suggestion) => suggestion.review?.decision !== 'rejected')
      .map((suggestion) => ({
        event_id: suggestion.modelEventKey,
        action: suggestion.actionCode,
        start_frame: suggestion.startFrame,
        end_frame: suggestion.endFrame,
        start_time: suggestion.startTime,
        end_time: suggestion.endTime,
        confidence_mean: suggestion.confidence,
        origin: 'model',
      }));
    return [...humanEvents, ...modelEvents];
  }, [events, showSuggestions, suggestions]);

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
    const saved = localStorage.getItem(draftStorageKey);
    if (saved && !useAnnotationStore.getState().draft) {
      try {
        const payload = JSON.parse(saved) as { draft?: AnnotationDraft };
        if (payload.draft) restoreDraft(payload.draft);
      } catch {
        localStorage.removeItem(draftStorageKey);
      }
    }
    const persist = (savedDraft: AnnotationDraft | null) => {
      if (savedDraft) {
        localStorage.setItem(
          draftStorageKey,
          JSON.stringify({
            draft: savedDraft,
            savedAt: new Date().toISOString(),
          }),
        );
      } else {
        localStorage.removeItem(draftStorageKey);
      }
    };
    persist(useAnnotationStore.getState().draft);
    const unsubscribe = useAnnotationStore.subscribe((state) =>
      persist(state.draft),
    );
    return () => {
      unsubscribe();
      // Keep the saved draft for this task, but do not leak it into the next
      // video/task opened in the same single-page application session.
      useAnnotationStore.setState({
        draft: null,
        activeActionCode: null,
      });
    };
  }, [draftStorageKey, restoreDraft]);

  useEffect(() => () => reset(), [reset, videoId]);

  const selectedCategory = useMemo(
    () =>
      categories.find(
        (category) => category.code === effectiveSelectedAction,
      ),
    [categories, effectiveSelectedAction],
  );

  const savePoint = useCallback(
    (
      actionCode: string,
      actionLabel: string,
      spatial?: {
        region?: string;
        side: AnnotationSide;
        spatialMetadata?: Record<string, unknown>;
      },
    ) => {
      const frame = timeToFrame(currentTimeMs, fps);
      const side = spatial?.side ?? selectedSide;
      createAnnotation.mutate(
        {
          kind: 'point',
          actionCode,
          actionLabel,
          startFrame: frame,
          endFrame: frame,
          region: spatial?.region ?? regionForAction(actionCode, side),
          side,
          spatialMetadata: spatial?.spatialMetadata,
        },
        {
          onError: (error) => setMessage(error.message),
        },
      );
    },
    [createAnnotation, currentTimeMs, fps, selectedSide],
  );

  const commitInterval = useCallback(
    (
      startFrame: number,
      endFrame: number,
      analysis?: AnnotationIntervalAnalysis,
    ) => {
      if (!draft) return;
      createAnnotation.mutate(
        {
          kind: 'interval',
          actionCode: draft.actionCode,
          actionLabel: draft.actionLabel,
          startFrame: Math.min(startFrame, endFrame),
          endFrame: Math.max(startFrame, endFrame),
          region: draft.region,
          side: draft.side,
          spatialMetadata: {
            ...draft.spatialMetadata,
            boundaryAnalysis: analysis
              ? {
                  confidence: analysis.boundaryConfidence,
                  originalStartFrame: analysis.originalStartFrame,
                  originalEndFrame: analysis.originalEndFrame,
                  warnings:
                    analysis.quality?.warnings.map((warning) => warning.code)
                    ?? [],
                }
              : undefined,
          },
        },
        {
          onSuccess: () => {
            setIntervalProposal(null);
            cancelDraft();
          },
          onError: (error) => setMessage(error.message),
        },
      );
    },
    [cancelDraft, createAnnotation, draft],
  );

  const finishInterval = useCallback(() => {
    if (!draft) return;
    const endFrame = timeToFrame(currentTimeMs, fps);
    const startFrame = Math.min(draft.startFrame, endFrame);
    const finalFrame = Math.max(draft.startFrame, endFrame);
    if (!artifact) {
      commitInterval(startFrame, finalFrame);
      return;
    }
    analyzeInterval.mutate(
      {
        actionCode: draft.actionCode,
        startFrame,
        endFrame: finalFrame,
      },
      {
        onSuccess: (analysis) => {
          if (analysis.available) setIntervalProposal(analysis);
          else commitInterval(startFrame, finalFrame);
        },
        onError: (error) => setMessage(error.message),
      },
    );
  }, [
    analyzeInterval,
    artifact,
    commitInterval,
    currentTimeMs,
    draft,
    fps,
  ]);

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
      if (
        (event.ctrlKey || event.metaKey)
        && event.key.toLowerCase() === 'z'
      ) {
        event.preventDefault();
        const mutation = event.shiftKey ? redoAnnotation : undoAnnotation;
        mutation.mutate(undefined, {
          onError: (error) => setMessage(error.message),
        });
        return;
      }
      if (
        (event.ctrlKey || event.metaKey)
        && event.key.toLowerCase() === 'y'
      ) {
        event.preventDefault();
        redoAnnotation.mutate(undefined, {
          onError: (error) => setMessage(error.message),
        });
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
        setIntervalProposal(null);
        cancelDraft();
        return;
      }
      if (event.key === 'Enter' && draft && !intervalProposal) {
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
        const side = defaultSideForAction(category.code);
        setSelectedSide(side);
        if (event.shiftKey || annotationMode === 'point') {
          savePoint(category.code, category.label, {
            region: regionForAction(category.code, side),
            side,
            spatialMetadata: { selectionSource: 'keyboard' },
          });
        } else {
          startDraft(
            category.code,
            category.label,
            currentTimeMs / 1000,
            timeToFrame(currentTimeMs, fps),
            regionForAction(category.code, side),
            side,
            { selectionSource: 'keyboard' },
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
    intervalProposal,
    requestSeek,
    redoAnnotation,
    savePoint,
    setIsPlaying,
    startDraft,
    undoAnnotation,
  ]);

  const exportCsv = useCallback(() => {
    const csv = eventsToCsv(events);
    downloadCsv(`anotacoes-${videoId}.csv`, csv);
  }, [events, videoId]);

  const selectFacialRegion = useCallback(
    (selection: FacialRegionSelection) => {
      const category = categories.find(
        (item) => item.code === selection.actionCode,
      );
      if (!category) return;
      setSelectedAction(selection.actionCode);
      setSelectedSide(selection.side);
      setIsPlaying(false);
      const spatial = {
        region: selection.region,
        side: selection.side,
        spatialMetadata: {
          selectionSource: 'facemesh_click',
          landmarkRegion: selection.region,
        },
      };
      if (annotationMode === 'point') {
        savePoint(selection.actionCode, category.label, spatial);
      } else {
        startDraft(
          selection.actionCode,
          category.label,
          currentTimeMs / 1000,
          timeToFrame(currentTimeMs, fps),
          spatial.region,
          spatial.side,
          spatial.spatialMetadata,
        );
      }
    },
    [
      annotationMode,
      categories,
      currentTimeMs,
      fps,
      savePoint,
      setIsPlaying,
      startDraft,
    ],
  );

  const triggerImport = useCallback(() => {
    importInputRef.current?.click();
  }, []);

  const importCsv = useCallback(
    async (file: File) => {
      const text = await file.text();
      const { rows, errors } = parseAnnotationCsv(text);
      if (rows.length === 0) {
        setMessage(errors[0] ?? 'Nenhuma linha válida encontrada no CSV.');
        return;
      }
      setImporting(true);
      let created = 0;
      let failed = 0;
      for (const row of rows) {
        const category = categories.find((item) => item.code === row.actionCode);
        try {
          await createAnnotation.mutateAsync({
            kind: row.kind,
            actionCode: row.actionCode,
            actionLabel: category?.label ?? row.actionLabel,
            startFrame: row.startFrame,
            endFrame: row.endFrame,
            notes: row.notes,
          });
          created += 1;
        } catch {
          failed += 1;
        }
      }
      setImporting(false);
      const parts = [`${created} anotações importadas`];
      if (failed > 0) parts.push(`${failed} falharam`);
      if (errors.length > 0) parts.push(`${errors.length} linhas inválidas ignoradas`);
      setMessage(parts.join(' · '));
    },
    [categories, createAnnotation],
  );

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
    return <div className="p-8 text-text-primary">Vídeo não informado.</div>;
  }
  if (contextQuery.isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (contextQuery.isError || !context) {
    return (
      <div className="m-8 rounded-lg border border-danger-border bg-danger-light p-5 text-danger">
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
    <div className="flex h-[calc(100vh-theme(spacing.16))] flex-col bg-app-bg text-text-primary">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div>
          <h1 className="text-base font-semibold">Anotação · {context.video.filename}</h1>
          <p className="text-xs text-text-muted">
            {fps.toFixed(2)} fps · quadro {timeToFrame(currentTimeMs, fps)}
            {context.task ? ` · tarefa ${context.task.id.slice(0, 8)}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void importCsv(file);
            }}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={importing}
            onClick={triggerImport}
            title="Importar anotações de um CSV"
          >
            {importing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            Importar CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={events.length === 0}
            onClick={exportCsv}
            title="Exportar anotações para CSV"
          >
            <Download className="mr-2 h-4 w-4" />
            Exportar CSV
          </Button>
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
        </div>
      </header>

      {message && (
        <div className="flex items-center justify-between border-b border-warning-border bg-warning-light px-5 py-2 text-xs text-warning">
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
              overlayMode={effectiveOverlayMode}
              overlayAction={effectiveSelectedAction || undefined}
              overlayActionLabel={selectedCategory?.label}
              selectedSide={selectedSide}
              onRegionSelect={selectFacialRegion}
              showMotionVectors={showMotionVectors}
              events={comparisonOverlayEvents}
              pointSize={pointSize}
              opacity={opacity}
            />

            <div className="mt-3 flex w-full max-w-5xl flex-wrap items-center gap-3 text-xs text-text-secondary">
              <label>
                Ação/área{' '}
                <select
                  value={effectiveSelectedAction}
                  onChange={(event) => {
                    setSelectedAction(event.target.value);
                    setSelectedSide(defaultSideForAction(event.target.value));
                  }}
                  className="rounded border border-border bg-surface px-2 py-1 text-text-primary"
                >
                  {categories.map((category) => (
                    <option key={category.code} value={category.code}>
                      {category.shortcut ? `${category.shortcut}. ` : ''}
                      {category.label}
                    </option>
                  ))}
                </select>
              </label>
              {BILATERAL_ACTIONS.has(effectiveSelectedAction) && (
                <label>
                  Lado{' '}
                  <select
                    value={selectedSide}
                    onChange={(event) =>
                      setSelectedSide(event.target.value as AnnotationSide)
                    }
                    className="rounded border border-border bg-surface px-2 py-1 text-text-primary"
                  >
                    <option value="both">Ambos</option>
                    <option value="right">Direito</option>
                    <option value="left">Esquerdo</option>
                  </select>
                </label>
              )}
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
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={showMotionVectors}
                  onChange={(event) =>
                    setShowMotionVectors(event.target.checked)
                  }
                />
                Vetores de movimento
              </label>
              <span className="ml-auto">
                {selectedCategory?.label ?? effectiveSelectedAction}
                {effectiveOverlayMode === 'area'
                  ? ' · área acompanha o rosto'
                  : ''}
                {' · '}número marca · Shift+número cria ponto
              </span>
            </div>
            {analyzeInterval.isPending && (
              <div className="mt-3 flex w-full max-w-5xl items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text-muted">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                Analisando movimento e qualidade do intervalo…
              </div>
            )}
            {intervalProposal && (
              <SmartIntervalProposal
                analysis={intervalProposal}
                onApply={(startFrame, endFrame) =>
                  commitInterval(startFrame, endFrame, intervalProposal)
                }
                onKeepOriginal={() =>
                  commitInterval(
                    intervalProposal.originalStartFrame,
                    intervalProposal.originalEndFrame,
                    intervalProposal,
                  )
                }
                onCancel={() => {
                  setIntervalProposal(null);
                  cancelDraft();
                }}
              />
            )}
          </div>

          <div className="border-t border-border bg-app-bg px-4 py-2">
            <AnnotationToolbar
              annotationMode={annotationMode}
              onAnnotationModeChange={setAnnotationMode}
              overlayMode={effectiveOverlayMode}
              onOverlayModeChange={setOverlayMode}
              canShowLandmarks={Boolean(artifact)}
              canUndo={historyQuery.data?.canUndo}
              canRedo={historyQuery.data?.canRedo}
              historyPending={
                undoAnnotation.isPending || redoAnnotation.isPending
              }
              onUndo={() =>
                undoAnnotation.mutate(undefined, {
                  onError: (error) => setMessage(error.message),
                })
              }
              onRedo={() =>
                redoAnnotation.mutate(undefined, {
                  onError: (error) => setMessage(error.message),
                })
              }
            />
          </div>
          <AnnotationTimeline
            suggestions={suggestions}
            showSuggestions={showSuggestions}
          />
        </main>

        <aside className="w-96 shrink-0 overflow-y-auto border-l border-border bg-surface">
          <AnnotationSidebarList
            videoId={videoId}
            taskId={taskId}
            categories={categories}
            fps={fps}
          />
          <AnnotationComparisonPanel
            events={events}
            suggestions={suggestions}
            onSeek={requestSeek}
          />
          <div className="border-t border-border">
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

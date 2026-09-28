import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { Trash2, Play, Sparkles, Pencil, Check, X } from 'lucide-react';
import { useAnnotationStore } from '../store/useAnnotationStore';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { Button } from '@/components/ui/Button';
import { CorrectionModal } from './CorrectionModal';
import type {
  AnnotationCategory,
  AnnotationEvent,
  AnnotationSide,
} from '@/types/annotation';
import { usePlaybackStore } from '@/features/playback/usePlaybackStore';
import {
  useDeleteVideoAnnotation,
  useUpdateVideoAnnotation,
} from '../api/useAnnotationEditor';

interface AnnotationSidebarListProps {
  videoId: string;
  taskId?: string;
  categories: AnnotationCategory[];
  fps: number;
}

interface EditState {
  actionCode: string;
  startFrame: number;
  endFrame: number;
  notes: string;
  region: string;
  side: AnnotationSide;
}

export function AnnotationSidebarList({
  videoId,
  taskId,
  categories,
  fps,
}: AnnotationSidebarListProps) {
  const { t } = useTranslation('annotations');
  const events = useAnnotationStore((state) => state.events);
  const requestSeek = usePlaybackStore((state) => state.requestSeek);
  const [correctionEvent, setCorrectionEvent] = useState<AnnotationEvent | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const updateAnnotation = useUpdateVideoAnnotation(videoId, taskId);
  const deleteAnnotation = useDeleteVideoAnnotation(videoId, taskId);

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    const ms = Math.floor((time % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const sortedEvents = [...events].sort((a, b) => a.startTime - b.startTime);

  const startEditing = (event: AnnotationEvent) => {
    setEditingId(event.id);
    setEdit({
      actionCode: event.actionCode,
      startFrame: event.startFrame,
      endFrame: event.endFrame,
      notes: event.notes ?? '',
      region: event.region ?? '',
      side: event.side ?? 'unspecified',
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEdit(null);
  };

  const saveEditing = (event: AnnotationEvent) => {
    if (!edit) return;
    const category = categories.find((item) => item.code === edit.actionCode);
    const startFrame = Math.max(0, edit.startFrame);
    const endFrame =
      event.kind === 'point' ? startFrame : Math.max(startFrame, edit.endFrame);
    updateAnnotation.mutate(
      {
        annotationId: event.id,
        data: {
          actionCode: edit.actionCode,
          actionLabel: category?.label ?? edit.actionCode,
          startFrame,
          endFrame,
          startTime: startFrame / fps,
          endTime: endFrame / fps,
          notes: edit.notes || undefined,
          region: edit.region || undefined,
          side: edit.side,
        },
      },
      { onSuccess: () => cancelEditing() },
    );
  };

  return (
    <div className="w-80 border-l border-border bg-app-bg flex flex-col h-full">
      <div className="h-14 border-b border-border flex items-center px-4 shrink-0">
        <h2 className="font-semibold text-text-primary">{t('sidebar.title', { count: events.length })}</h2>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-2">
          {sortedEvents.length === 0 ? (
            <p className="text-sm text-text-muted text-center p-4 italic">
              {t('sidebar.empty')}
            </p>
          ) : (
            sortedEvents.map((event) => {
              const isEditing = editingId === event.id;
              return (
                <div
                  key={event.id}
                  data-testid="annotation-event"
                  className="group p-3 rounded-lg border border-border bg-surface hover:border-border-strong hover:bg-surface-hover transition-colors"
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-medium text-sm text-text-primary">
                      {event.actionLabel}
                    </span>
                    {!isEditing && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-text-muted hover:text-primary hover:bg-primary-light"
                          onClick={() => requestSeek(event.startTime * 1000)}
                          title={t('sidebar.seek')}
                          aria-label={t('sidebar.seek')}
                        >
                          <Play className="h-3 w-3" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-text-muted hover:text-primary hover:bg-primary-light"
                          onClick={() => startEditing(event)}
                          title={t('sidebar.edit')}
                          aria-label={t('sidebar.edit')}
                        >
                          <Pencil className="h-3 w-3" aria-hidden="true" />
                        </Button>
                        {event.confidence !== null && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-text-muted hover:text-accent hover:bg-accent-light"
                            onClick={() => setCorrectionEvent(event)}
                            title={t('sidebar.correct')}
                            aria-label={t('sidebar.correct')}
                          >
                            <Sparkles className="h-3 w-3" aria-hidden="true" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-text-muted hover:text-danger hover:bg-danger-light"
                          disabled={deleteAnnotation.isPending}
                          onClick={() => deleteAnnotation.mutate(event.id)}
                          title={t('sidebar.delete')}
                          aria-label={t('sidebar.delete')}
                        >
                          <Trash2 className="h-3 w-3" aria-hidden="true" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {isEditing && edit ? (
                    <div className="space-y-2">
                      <select
                        value={edit.actionCode}
                        onChange={(e) =>
                          setEdit({ ...edit, actionCode: e.target.value })
                        }
                        className="w-full rounded border border-border bg-surface px-2 py-1 text-xs text-text-primary"
                      >
                        {categories.map((category) => (
                          <option key={category.code} value={category.code}>
                            {category.label}
                          </option>
                        ))}
                      </select>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="text-[10px] text-text-muted">
                          {t('sidebar.startFrame')}
                          <input
                            type="number"
                            min={0}
                            value={edit.startFrame}
                            onChange={(e) =>
                              setEdit({ ...edit, startFrame: Number(e.target.value) })
                            }
                            className="mt-0.5 w-full rounded border border-border bg-surface px-2 py-1 text-xs text-text-primary"
                          />
                        </label>
                        <label className="text-[10px] text-text-muted">
                          {t('sidebar.endFrame')}
                          <input
                            type="number"
                            min={edit.startFrame}
                            disabled={event.kind === 'point'}
                            value={event.kind === 'point' ? edit.startFrame : edit.endFrame}
                            onChange={(e) =>
                              setEdit({ ...edit, endFrame: Number(e.target.value) })
                            }
                            className="mt-0.5 w-full rounded border border-border bg-surface px-2 py-1 text-xs text-text-primary disabled:opacity-50"
                          />
                        </label>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="text-[10px] text-text-muted">
                          {t('page.side')}
                          <select
                            value={edit.side}
                            onChange={(event) =>
                              setEdit({
                                ...edit,
                                side: event.target.value as AnnotationSide,
                              })
                            }
                            className="mt-0.5 w-full rounded border border-border bg-surface px-2 py-1 text-xs text-text-primary"
                          >
                            <option value="both">{t('sides.both')}</option>
                            <option value="right">{t('sides.right')}</option>
                            <option value="left">{t('sides.left')}</option>
                            <option value="center">{t('sides.center')}</option>
                            <option value="whole">{t('sides.whole')}</option>
                            <option value="unspecified">{t('sides.unspecified')}</option>
                          </select>
                        </label>
                        <label className="text-[10px] text-text-muted">
                          {t('sidebar.region')}
                          <input
                            value={edit.region}
                            onChange={(event) =>
                              setEdit({ ...edit, region: event.target.value })
                            }
                            className="mt-0.5 w-full rounded border border-border bg-surface px-2 py-1 text-xs text-text-primary"
                          />
                        </label>
                      </div>
                      <input
                        type="text"
                        placeholder={t('sidebar.notes')}
                        aria-label={t('sidebar.notes')}
                        value={edit.notes}
                        onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
                        className="w-full rounded border border-border bg-surface px-2 py-1 text-xs text-text-primary"
                      />
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-text-muted hover:text-text-primary"
                          onClick={cancelEditing}
                          title={t('sidebar.cancel')}
                          aria-label={t('sidebar.cancel')}
                        >
                          <X className="h-3 w-3" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={updateAnnotation.isPending}
                          className="h-6 w-6 text-success hover:bg-success-light"
                          onClick={() => saveEditing(event)}
                          title={t('sidebar.save')}
                          aria-label={t('sidebar.save')}
                        >
                          <Check className="h-3 w-3" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between text-xs text-text-muted font-mono bg-surface-muted p-1.5 rounded">
                        <span>{formatTime(event.startTime)}</span>
                        <span>{formatTime(event.endTime)}</span>
                      </div>
                      {event.side && event.side !== 'unspecified' && (
                        <div className="mt-1.5 text-[10px] text-text-muted">
                          {event.region ?? t('sidebar.faceRegion')} · {t(`sides.${event.side}`, { defaultValue: event.side })}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
      <CorrectionModal
        event={correctionEvent}
        isOpen={correctionEvent !== null}
        onClose={() => setCorrectionEvent(null)}
      />
    </div>
  );
}

import { useMemo, useRef } from 'react';
import { useAnnotationStore } from '../store/useAnnotationStore';
import { usePlaybackStore } from '@/features/playback/usePlaybackStore';
import type { AnnotationEvent, AnnotationSuggestion } from '@/types/annotation';

interface AnnotationTimelineProps {
  suggestions: AnnotationSuggestion[];
  showSuggestions: boolean;
}

export function AnnotationTimeline({
  suggestions,
  showSuggestions,
}: AnnotationTimelineProps) {
  const { events, draft } = useAnnotationStore();
  const { durationMs, currentTimeMs, requestSeek } = usePlaybackStore();
  const timelineRef = useRef<HTMLDivElement>(null);
  const duration = durationMs / 1000;
  const currentTime = currentTimeMs / 1000;

  const tracks = useMemo(() => {
    const result = new Map<
      string,
      { events: AnnotationEvent[]; suggestions: AnnotationSuggestion[] }
    >();
    const ensure = (code: string) => {
      if (!result.has(code)) result.set(code, { events: [], suggestions: [] });
      return result.get(code)!;
    };
    events.forEach((event) => ensure(event.actionCode).events.push(event));
    if (showSuggestions) {
      suggestions
        .filter((suggestion) => suggestion.review?.decision !== 'rejected')
        .forEach((suggestion) =>
          ensure(suggestion.actionCode).suggestions.push(suggestion),
        );
    }
    if (draft) ensure(draft.actionCode);
    return [...result.entries()];
  }, [draft, events, showSuggestions, suggestions]);

  const seekFromClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current || duration <= 0) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const percentage = Math.max(
      0,
      Math.min(1, (event.clientX - rect.left) / rect.width),
    );
    requestSeek(percentage * durationMs);
  };

  const position = (seconds: number) =>
    duration > 0 ? `${(seconds / duration) * 100}%` : '0%';

  return (
    <div className="flex h-52 select-none flex-col border-t border-border bg-surface">
      <div className="flex h-8 items-center justify-between border-b border-border bg-app-bg px-4 font-mono text-xs text-text-muted">
        <span>{currentTime.toFixed(2)}s</span>
        <span>{duration.toFixed(2)}s</span>
      </div>
      <div className="relative flex-1 space-y-1 overflow-y-auto p-2">
        {tracks.map(([actionCode, track]) => (
          <div key={actionCode} className="group flex h-8 items-center gap-4">
            <div className="w-28 truncate text-xs text-text-muted">{actionCode}</div>
            <div
              ref={timelineRef}
              className="relative h-full flex-1 cursor-pointer rounded-sm bg-surface-muted"
              onClick={seekFromClick}
            >
              {track.suggestions.map((suggestion) => (
                <div
                  key={suggestion.modelEventKey}
                  className={`absolute bottom-1 top-1 rounded border-2 ${
                    suggestion.review
                      ? 'border-emerald-400/70 bg-emerald-500/15'
                      : 'border-dashed border-violet-400/80 bg-violet-500/10'
                  }`}
                  style={{
                    left: position(suggestion.startTime),
                    width: `max(2px, ${position(
                      suggestion.endTime - suggestion.startTime,
                    )})`,
                  }}
                  title={`Sugestão ${Math.round(suggestion.confidence * 100)}%`}
                />
              ))}
              {track.events.map((event) =>
                event.kind === 'point' ? (
                  <div
                    key={event.id}
                    className="absolute bottom-0 top-0 w-0.5 bg-amber-300"
                    style={{ left: position(event.startTime) }}
                    title={`${event.actionLabel} · ponto`}
                  />
                ) : (
                  <div
                    key={event.id}
                    className={`absolute bottom-1 top-1 rounded ${
                      event.source === 'model_review'
                        ? 'bg-emerald-500'
                        : 'bg-blue-500'
                    }`}
                    style={{
                      left: position(event.startTime),
                      width: `max(2px, ${position(event.endTime - event.startTime)})`,
                    }}
                    title={event.actionLabel}
                  />
                ),
              )}
              {draft?.actionCode === actionCode && (
                <div
                  className="absolute bottom-1 top-1 animate-pulse rounded bg-red-500/70"
                  style={{
                    left: position(Math.min(draft.startTime, currentTime)),
                    width: `max(2px, ${position(
                      Math.abs(currentTime - draft.startTime),
                    )})`,
                  }}
                />
              )}
              <div
                className="pointer-events-none absolute bottom-0 top-0 z-10 w-0.5 bg-text-primary"
                style={{ left: position(currentTime) }}
              />
            </div>
          </div>
        ))}
        {tracks.length === 0 && (
          <div className="flex h-full items-center justify-center text-sm italic text-text-muted">
            Nenhuma anotação. Use 1–9 para marcar.
          </div>
        )}
      </div>
    </div>
  );
}

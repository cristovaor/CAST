import { AlertTriangle, CheckCircle2, Layers3 } from 'lucide-react';
import type {
  AnnotationEvent,
  AnnotationSuggestion,
} from '@/types/annotation';
import { Button } from '@/components/ui/Button';

interface AnnotationComparisonPanelProps {
  events: AnnotationEvent[];
  suggestions: AnnotationSuggestion[];
  onSeek: (timeMs: number) => void;
}

function overlapRatio(
  first: { startFrame: number; endFrame: number },
  second: { startFrame: number; endFrame: number },
) {
  const intersection = Math.max(
    0,
    Math.min(first.endFrame, second.endFrame)
      - Math.max(first.startFrame, second.startFrame)
      + 1,
  );
  const union =
    Math.max(first.endFrame, second.endFrame)
    - Math.min(first.startFrame, second.startFrame)
    + 1;
  return union > 0 ? intersection / union : 0;
}

export function AnnotationComparisonPanel({
  events,
  suggestions,
  onSeek,
}: AnnotationComparisonPanelProps) {
  const activeSuggestions = suggestions.filter(
    (suggestion) => suggestion.review?.decision !== 'rejected',
  );
  const comparisons = events.map((event) => {
    const candidates = activeSuggestions
      .map((suggestion) => ({
        suggestion,
        overlap: overlapRatio(event, suggestion),
      }))
      .filter((item) => item.overlap > 0)
      .sort((first, second) => second.overlap - first.overlap);
    const best = candidates[0];
    return {
      event,
      suggestion: best?.suggestion,
      overlap: best?.overlap ?? 0,
      actionMatches: best?.suggestion.actionCode === event.actionCode,
    };
  });
  const matches = comparisons.filter(
    (item) => item.actionMatches && item.overlap >= 0.5,
  );
  const conflicts = comparisons.filter(
    (item) =>
      item.suggestion
      && (!item.actionMatches || item.overlap < 0.5),
  );
  const humanOnly = comparisons.filter((item) => !item.suggestion);
  const matchedSuggestionKeys = new Set(
    comparisons
      .map((item) => item.suggestion?.modelEventKey)
      .filter(Boolean),
  );
  const modelOnly = activeSuggestions.filter(
    (suggestion) => !matchedSuggestionKeys.has(suggestion.modelEventKey),
  );

  return (
    <div className="space-y-3 border-t border-border p-4">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <Layers3 className="h-4 w-4 text-primary" />
          Modelo × humano
        </h3>
        <p className="mt-0.5 text-xs text-text-muted">
          Sobreposição temporal e concordância da ação
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 text-center text-[11px]">
        <div className="rounded bg-success-light p-2 text-success">
          <strong className="block text-base">{matches.length}</strong>
          concordantes
        </div>
        <div className="rounded bg-warning-light p-2 text-warning">
          <strong className="block text-base">{conflicts.length}</strong>
          divergências
        </div>
        <div className="rounded bg-surface-muted p-2 text-text-muted">
          <strong className="block text-base">{humanOnly.length}</strong>
          somente humano
        </div>
        <div className="rounded bg-surface-muted p-2 text-text-muted">
          <strong className="block text-base">{modelOnly.length}</strong>
          somente modelo
        </div>
      </div>
      {conflicts.slice(0, 5).map(({ event, suggestion, overlap }) => (
        <Button
          key={event.id}
          variant="ghost"
          size="sm"
          className="h-auto w-full justify-start px-2 py-1.5 text-left"
          onClick={() => onSeek(event.startTime * 1000)}
        >
          <AlertTriangle className="mr-2 h-3.5 w-3.5 shrink-0 text-warning" />
          <span className="min-w-0">
            <span className="block truncate text-xs">
              {event.actionCode} × {suggestion?.actionCode}
            </span>
            <span className="block text-[10px] text-text-muted">
              sobreposição {Math.round(overlap * 100)}%
            </span>
          </span>
        </Button>
      ))}
      {events.length > 0 && conflicts.length === 0 && (
        <p className="flex items-center gap-2 text-xs text-success">
          <CheckCircle2 className="h-4 w-4" />
          Nenhuma divergência sobreposta.
        </p>
      )}
    </div>
  );
}

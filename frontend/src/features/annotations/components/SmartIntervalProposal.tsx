import { AlertTriangle, Check, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { AnnotationIntervalAnalysis } from '@/types/annotation';

interface SmartIntervalProposalProps {
  analysis: AnnotationIntervalAnalysis;
  onApply: (startFrame: number, endFrame: number) => void;
  onKeepOriginal: () => void;
  onCancel: () => void;
}

export function SmartIntervalProposal({
  analysis,
  onApply,
  onKeepOriginal,
  onCancel,
}: SmartIntervalProposalProps) {
  const motion = analysis.motionSeries ?? [];
  const maxMotion = Math.max(...motion.map((item) => item.motion), 0.000001);
  const suggestedStart =
    analysis.suggestedStartFrame ?? analysis.originalStartFrame;
  const suggestedEnd =
    analysis.suggestedEndFrame ?? analysis.originalEndFrame;
  const changed =
    suggestedStart !== analysis.originalStartFrame
    || suggestedEnd !== analysis.originalEndFrame;

  return (
    <div className="mt-3 w-full max-w-5xl rounded-lg border border-primary/30 bg-primary-light/40 p-3 text-xs text-text-secondary">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-semibold text-text-primary">
            <Sparkles className="h-4 w-4 text-primary" />
            Ajuste inteligente do intervalo
          </p>
          <p className="mt-1">
            Original: {analysis.originalStartFrame}–{analysis.originalEndFrame}
            {' · '}
            Sugestão: {suggestedStart}–{suggestedEnd}
            {analysis.boundaryConfidence != null
              ? ` · confiança ${Math.round(analysis.boundaryConfidence * 100)}%`
              : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancelar anotação"
          className="rounded p-1 text-text-muted hover:bg-surface-hover"
          title="Cancelar anotação"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {motion.length > 0 && (
        <div
          className="mt-3 flex h-10 items-end gap-px rounded bg-surface-muted px-2 py-1"
          aria-label="Intensidade de movimento dos landmarks"
        >
          {motion.map((item) => (
            <span
              key={item.frameIndex}
              className="min-w-px flex-1 rounded-t bg-primary/70"
              style={{
                height: `${Math.max(6, (item.motion / maxMotion) * 100)}%`,
              }}
              title={`Quadro ${item.frameIndex}: ${item.motion.toFixed(5)}`}
            />
          ))}
        </div>
      )}

      {(analysis.quality?.warnings.length ?? 0) > 0 && (
        <div className="mt-3 space-y-1">
          {analysis.quality?.warnings.map((warning) => (
            <p
              key={warning.code}
              className="flex items-center gap-2 text-warning"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              {warning.message}
            </p>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onKeepOriginal}>
          Manter original
        </Button>
        <Button
          size="sm"
          disabled={!analysis.available}
          onClick={() => onApply(suggestedStart, suggestedEnd)}
        >
          <Check className="mr-1 h-3.5 w-3.5" />
          {changed ? 'Aplicar ajuste' : 'Confirmar intervalo'}
        </Button>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Check, EyeOff, Pencil, X } from 'lucide-react';
import type {
  AnnotationCategory,
  AnnotationSuggestion,
} from '@/types/annotation';
import { Button } from '@/components/ui/Button';

interface SuggestionReviewPanelProps {
  suggestions: AnnotationSuggestion[];
  predictionId: string | null;
  categories: AnnotationCategory[];
  visible: boolean;
  onVisibleChange: (visible: boolean) => void;
  onReview: (
    suggestion: AnnotationSuggestion,
    decision: 'accepted' | 'corrected' | 'rejected',
    correction?: {
      kind: 'interval' | 'point';
      actionCode: string;
      actionLabel: string;
      startFrame: number;
      endFrame: number;
    },
  ) => void;
  pending: boolean;
}

export function SuggestionReviewPanel({
  suggestions,
  predictionId,
  categories,
  visible,
  onVisibleChange,
  onReview,
  pending,
}: SuggestionReviewPanelProps) {
  const [correcting, setCorrecting] = useState<string | null>(null);
  const [actionCode, setActionCode] = useState('');
  const [startFrame, setStartFrame] = useState(0);
  const [endFrame, setEndFrame] = useState(0);
  const pendingSuggestions = suggestions.filter((item) => !item.review);

  if (!predictionId) {
    return (
      <div className="p-4 text-sm text-text-muted">
        Nenhum modelo disponível. A anotação manual continua ativa.
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Sugestões do modelo</h3>
          <p className="text-xs text-text-muted">{pendingSuggestions.length} pendentes</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onVisibleChange(!visible)}
        >
          <EyeOff className="mr-1 h-4 w-4" />
          {visible ? 'Ocultar' : 'Mostrar'}
        </Button>
      </div>

      {pendingSuggestions.slice(0, 20).map((suggestion) => {
        const category = categories.find(
          (item) => item.code === suggestion.actionCode,
        );
        const isCorrecting = correcting === suggestion.modelEventKey;
        return (
          <div
            key={suggestion.modelEventKey}
            data-testid={`suggestion-${suggestion.modelEventKey}`}
            className="rounded-lg border border-border bg-surface-muted p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {category?.label ?? suggestion.actionCode}
                </p>
                <p className="text-xs text-text-muted">
                  quadros {suggestion.startFrame}–{suggestion.endFrame} ·{' '}
                  {Math.round(suggestion.confidence * 100)}% ·{' '}
                  {suggestion.modelVersion ?? 'versão desconhecida'}
                </p>
              </div>
            </div>

            {isCorrecting && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                <select
                  value={actionCode}
                  onChange={(event) => setActionCode(event.target.value)}
                  className="col-span-3 rounded border border-border bg-surface px-2 py-1.5 text-xs text-text-primary"
                >
                  {categories.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <input
                  aria-label="Quadro inicial"
                  type="number"
                  min={0}
                  value={startFrame}
                  onChange={(event) => setStartFrame(Number(event.target.value))}
                  className="rounded border border-border bg-surface px-2 py-1.5 text-xs text-text-primary"
                />
                <input
                  aria-label="Quadro final"
                  type="number"
                  min={startFrame}
                  value={endFrame}
                  onChange={(event) => setEndFrame(Number(event.target.value))}
                  className="rounded border border-border bg-surface px-2 py-1.5 text-xs text-text-primary"
                />
                <Button
                  size="sm"
                  disabled={pending || endFrame < startFrame}
                  onClick={() => {
                    const selected = categories.find(
                      (item) => item.code === actionCode,
                    );
                    onReview(suggestion, 'corrected', {
                      kind: 'interval',
                      actionCode,
                      actionLabel: selected?.label ?? actionCode,
                      startFrame,
                      endFrame,
                    });
                    setCorrecting(null);
                  }}
                >
                  Salvar
                </Button>
              </div>
            )}

            <div className="mt-3 flex gap-1">
              <Button
                size="sm"
                disabled={pending}
                onClick={() => onReview(suggestion, 'accepted')}
              >
                <Check className="mr-1 h-3.5 w-3.5" /> Aceitar
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  setCorrecting(suggestion.modelEventKey);
                  setActionCode(suggestion.actionCode);
                  setStartFrame(suggestion.startFrame);
                  setEndFrame(suggestion.endFrame);
                }}
              >
                <Pencil className="mr-1 h-3.5 w-3.5" /> Corrigir
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => onReview(suggestion, 'rejected')}
              >
                <X className="mr-1 h-3.5 w-3.5" /> Rejeitar
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

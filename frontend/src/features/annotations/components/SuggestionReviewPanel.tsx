import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, EyeOff, Filter, Pencil, X } from 'lucide-react';
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
    reviewDurationMs?: number,
  ) => void;
  pending: boolean;
}

const directionLabel = (suggestion: AnnotationSuggestion) => {
  const direction = suggestion.direction;
  if (!direction) return null;
  return [direction.horizontal, direction.vertical, direction.tilt]
    .filter((value) => value && value !== 'center')
    .join(' · ');
};

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
  const [actionFilter, setActionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'pending' | 'all'>('pending');
  const [minConfidence, setMinConfidence] = useState(0);
  const reviewStartedAt = useRef(new Map<string, number>());

  const filteredSuggestions = useMemo(
    () =>
      suggestions.filter((item) => {
        if (statusFilter === 'pending' && item.review) return false;
        if (actionFilter !== 'all' && item.actionCode !== actionFilter) return false;
        return item.confidence >= minConfidence;
      }),
    [actionFilter, minConfidence, statusFilter, suggestions],
  );
  const pendingSuggestions = filteredSuggestions.filter((item) => !item.review);

  const durationFor = (modelEventKey: string) => {
    const now = Date.now();
    const started = reviewStartedAt.current.get(modelEventKey) ?? now;
    reviewStartedAt.current.set(modelEventKey, now);
    return Math.max(0, now - started);
  };
  const submitReview = (
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
    if (
      suggestion.side
      || suggestion.direction
      || suggestion.subtype
      || suggestion.quality
    ) {
      onReview(
        suggestion,
        decision,
        correction,
        durationFor(suggestion.modelEventKey),
      );
    } else {
      // Preserve the V6 component callback contract.
      if (correction) onReview(suggestion, decision, correction);
      else onReview(suggestion, decision);
    }
  };

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
        <Button variant="ghost" size="sm" onClick={() => onVisibleChange(!visible)}>
          <EyeOff className="mr-1 h-4 w-4" />
          {visible ? 'Ocultar' : 'Mostrar'}
        </Button>
      </div>

      <div className="space-y-2 rounded-lg border border-border bg-app-bg p-2">
        <p className="flex items-center gap-1 text-xs font-medium text-text-secondary">
          <Filter className="h-3.5 w-3.5" /> Filtros
        </p>
        <div className="grid grid-cols-2 gap-2">
          <select
            aria-label="Filtrar por ação"
            value={actionFilter}
            onChange={(event) => setActionFilter(event.target.value)}
            className="rounded border border-border bg-surface px-2 py-1.5 text-xs"
          >
            <option value="all">Todas as ações</option>
            {categories.map((item) => (
              <option key={item.code} value={item.code}>{item.label}</option>
            ))}
          </select>
          <select
            aria-label="Filtrar por status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as 'pending' | 'all')}
            className="rounded border border-border bg-surface px-2 py-1.5 text-xs"
          >
            <option value="pending">Somente pendentes</option>
            <option value="all">Todos os estados</option>
          </select>
        </div>
        <label className="block text-xs text-text-muted">
          Confiança mínima: {Math.round(minConfidence * 100)}%
          <input
            type="range"
            min={0}
            max={0.95}
            step={0.05}
            value={minConfidence}
            onChange={(event) => setMinConfidence(Number(event.target.value))}
            className="mt-1 w-full"
          />
        </label>
        {pendingSuggestions.length > 0 && (
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                pendingSuggestions.forEach((suggestion) =>
                  submitReview(suggestion, 'accepted'),
                )
              }
            >
              Aprovar filtradas
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                pendingSuggestions.forEach((suggestion) =>
                  submitReview(suggestion, 'rejected'),
                )
              }
            >
              Descartar filtradas
            </Button>
          </div>
        )}
      </div>

      {filteredSuggestions.slice(0, 50).map((suggestion) => {
        if (!reviewStartedAt.current.has(suggestion.modelEventKey)) {
          reviewStartedAt.current.set(suggestion.modelEventKey, Date.now());
        }
        const category = categories.find((item) => item.code === suggestion.actionCode);
        const isCorrecting = correcting === suggestion.modelEventKey;
        const direction = directionLabel(suggestion);
        const lowCoverage =
          suggestion.quality?.faceDetectionRate != null
          && suggestion.quality.faceDetectionRate < 0.9;
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
                <div className="mt-1 flex flex-wrap gap-1">
                  {suggestion.side && suggestion.side !== 'unspecified' && (
                    <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-700">
                      {suggestion.side}
                    </span>
                  )}
                  {direction && (
                    <span className="rounded bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-700">
                      {direction}
                    </span>
                  )}
                  {suggestion.subtype && (
                    <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-700">
                      {suggestion.subtype}
                    </span>
                  )}
                </div>
                {(lowCoverage || suggestion.quality?.directionAmbiguous) && (
                  <p className="mt-1 flex items-center gap-1 text-[10px] text-warning">
                    <AlertTriangle className="h-3 w-3" />
                    {lowCoverage ? 'Baixa cobertura facial' : 'Direção ambígua'}
                  </p>
                )}
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
                    <option key={item.code} value={item.code}>{item.label}</option>
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
                    const selected = categories.find((item) => item.code === actionCode);
                    submitReview(
                      suggestion,
                      'corrected',
                      {
                        kind: 'interval',
                        actionCode,
                        actionLabel: selected?.label ?? actionCode,
                        startFrame,
                        endFrame,
                      },
                    );
                    setCorrecting(null);
                  }}
                >
                  Salvar
                </Button>
              </div>
            )}

            {!suggestion.review && (
              <div className="mt-3 flex gap-1">
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    submitReview(suggestion, 'accepted')
                  }
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
                  onClick={() =>
                    submitReview(suggestion, 'rejected')
                  }
                >
                  <X className="mr-1 h-3.5 w-3.5" /> Rejeitar
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

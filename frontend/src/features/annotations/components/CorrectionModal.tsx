import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { AlertCircle, CheckCircle2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useCorrectionExport } from '../api/useCorrectionExport';
import type { AnnotationEvent } from '@/types/annotation';

// Stored values (sent to the retraining export). Only their display labels are
// translated, from `annotations:correction.actions.<key>`.
const MICRO_ACTIONS = [
  { value: 'Olho Fechado', key: 'eyeClosed' },
  { value: 'Boca Aberta', key: 'mouthOpen' },
  { value: 'Olhando para o lado', key: 'lookingAside' },
  { value: 'Inclinado', key: 'tilted' },
  { value: 'Movimento Brusco', key: 'abrupt' },
] as const;

interface CorrectionModalProps {
  event: AnnotationEvent | null;
  isOpen: boolean;
  onClose: () => void;
}

export function CorrectionModal({ event, isOpen, onClose }: CorrectionModalProps) {
  if (!isOpen || !event) return null;
  return (
    <CorrectionModalContent
      key={event.id}
      event={event}
      onClose={onClose}
    />
  );
}

function CorrectionModalContent({
  event,
  onClose,
}: {
  event: AnnotationEvent;
  onClose: () => void;
}) {
  const { t } = useTranslation('annotations');
  const correction = useCorrectionExport();
  const [correctedAction, setCorrectedAction] = useState(event.actionCode);
  const [correctedStart, setCorrectedStart] = useState(event.startTime);
  const [correctedEnd, setCorrectedEnd] = useState(event.endTime);
  const [success, setSuccess] = useState(false);

  const handleSubmit = () => {
    correction.mutate(
      {
        annotationId: event.id,
        payload: {
          corrected_action: correctedAction,
          corrected_start_time: correctedStart,
          corrected_end_time: correctedEnd,
        },
      },
      {
        onSuccess: () => {
          setSuccess(true);
          setTimeout(() => {
            setSuccess(false);
            setCorrectedAction('');
            onClose();
          }, 2000);
        },
      }
    );
  };

  const handleClose = () => {
    setCorrectedAction('');
    setSuccess(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="correction-modal-title"
        className="relative z-10 w-full max-w-md mx-4 bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-border bg-gradient-to-r from-accent-light to-primary-light">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-accent" aria-hidden="true" />
            <h2 id="correction-modal-title" className="text-lg font-semibold text-text-primary">{t('correction.title')}</h2>
          </div>
          <p className="text-xs text-text-secondary mt-1">
            {t('correction.description')}
          </p>
        </div>

        {success ? (
          <div className="p-8 flex flex-col items-center gap-3 animate-fade-in">
            <CheckCircle2 size={48} className="text-success" aria-hidden="true" />
            <p role="status" className="text-sm font-medium text-success">{t('correction.success')}</p>
          </div>
        ) : (
          <>
            {/* Body */}
            <div className="p-6 space-y-4">
              {/* Current prediction info */}
              <div className="p-3 rounded-lg bg-surface-muted border border-border">
                <p className="text-[11px] text-text-muted uppercase tracking-wide font-medium mb-1">{t('correction.original')}</p>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-text-secondary">{event.actionLabel}</span>
                  <span className="text-xs font-mono text-accent">{t('correction.confidence', { value: ((event.confidence || 0) * 100).toFixed(1) })}</span>
                </div>
              </div>

              {/* Corrected action */}
              <div>
                <label htmlFor="correction-action" className="block text-xs font-medium text-text-secondary mb-1.5">{t('correction.action')}</label>
                <select
                  id="correction-action"
                  value={correctedAction}
                  onChange={(e) => setCorrectedAction(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                >
                  {MICRO_ACTIONS.map((action) => (
                    <option key={action.value} value={action.value}>{t(`correction.actions.${action.key}`)}</option>
                  ))}
                </select>
              </div>

              {/* Time range */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="correction-start" className="block text-xs font-medium text-text-secondary mb-1.5">{t('correction.start')}</label>
                  <input
                    id="correction-start"
                    type="number"
                    step="0.01"
                    value={correctedStart}
                    onChange={(e) => setCorrectedStart(parseFloat(e.target.value))}
                    className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary font-mono focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                  />
                </div>
                <div>
                  <label htmlFor="correction-end" className="block text-xs font-medium text-text-secondary mb-1.5">{t('correction.end')}</label>
                  <input
                    id="correction-end"
                    type="number"
                    step="0.01"
                    value={correctedEnd}
                    onChange={(e) => setCorrectedEnd(parseFloat(e.target.value))}
                    className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary font-mono focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                  />
                </div>
              </div>

              {/* Warning */}
              <div className="flex items-start gap-2 p-3 rounded-lg bg-warning-light border border-warning-border">
                <AlertCircle size={14} className="text-warning shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-[11px] text-warning leading-relaxed">
                  {t('correction.warning')}
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
              <Button
                variant="ghost"
                onClick={handleClose}
                className="text-text-secondary hover:text-text-primary"
              >
                {t('correction.cancel')}
              </Button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={correction.isPending}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-accent to-primary hover:opacity-90 rounded-lg transition-all shadow-lg disabled:opacity-50"
              >
                <Sparkles size={14} aria-hidden="true" />
                {correction.isPending ? t('correction.exporting') : t('correction.submit')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

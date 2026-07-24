import { useState } from 'react';
import { AlertCircle, CheckCircle2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useCorrectionExport } from '../api/useCorrectionExport';
import type { AnnotationEvent } from '@/types/annotation';

const MICRO_ACTIONS = [
  'Olho Fechado',
  'Boca Aberta',
  'Olhando para o lado',
  'Inclinado',
  'Movimento Brusco',
];

interface CorrectionModalProps {
  event: AnnotationEvent | null;
  isOpen: boolean;
  onClose: () => void;
}

export function CorrectionModal({ event, isOpen, onClose }: CorrectionModalProps) {
  const correction = useCorrectionExport();
  const [correctedAction, setCorrectedAction] = useState('');
  const [correctedStart, setCorrectedStart] = useState(0);
  const [correctedEnd, setCorrectedEnd] = useState(0);
  const [success, setSuccess] = useState(false);

  // Sync state when event changes
  if (event && correctedAction === '' && !success) {
    setCorrectedAction(event.microActionType);
    setCorrectedStart(event.startTime);
    setCorrectedEnd(event.endTime);
  }

  const handleSubmit = () => {
    if (!event) return;
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

  if (!isOpen || !event) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
      
      {/* Modal */}
      <div className="relative z-10 w-full max-w-md mx-4 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-gradient-to-r from-violet-500/10 to-blue-500/10">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-violet-400" />
            <h2 className="text-lg font-semibold text-slate-100">Corrigir Predição da IA</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            A correção será exportada automaticamente para o dataset de retreino (Active Learning).
          </p>
        </div>

        {success ? (
          <div className="p-8 flex flex-col items-center gap-3 animate-fade-in">
            <CheckCircle2 size={48} className="text-emerald-400" />
            <p className="text-sm font-medium text-emerald-300">Correção aplicada e exportada para retreino!</p>
          </div>
        ) : (
          <>
            {/* Body */}
            <div className="p-6 space-y-4">
              {/* Current prediction info */}
              <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                <p className="text-[11px] text-slate-500 uppercase tracking-wide font-medium mb-1">Predição Original</p>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-300">{event.microActionType}</span>
                  <span className="text-xs font-mono text-violet-400">conf: {((event.confidence || 0) * 100).toFixed(1)}%</span>
                </div>
              </div>

              {/* Corrected action */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Ação Corrigida</label>
                <select
                  value={correctedAction}
                  onChange={(e) => setCorrectedAction(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                >
                  {MICRO_ACTIONS.map((action) => (
                    <option key={action} value={action}>{action}</option>
                  ))}
                </select>
              </div>

              {/* Time range */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Início (s)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={correctedStart}
                    onChange={(e) => setCorrectedStart(parseFloat(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Fim (s)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={correctedEnd}
                    onChange={(e) => setCorrectedEnd(parseFloat(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Warning */}
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <AlertCircle size={14} className="text-amber-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-300/80 leading-relaxed">
                  Esta ação exportará os dados corrigidos para o bucket de retreino do modelo.
                  Certifique-se de que a correção está precisa.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-800 flex justify-end gap-3">
              <Button
                variant="ghost"
                onClick={handleClose}
                className="text-slate-400 hover:text-slate-200"
              >
                Cancelar
              </Button>
              <button
                onClick={handleSubmit}
                disabled={correction.isPending}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 rounded-lg transition-all shadow-lg shadow-violet-500/20 disabled:opacity-50"
              >
                <Sparkles size={14} />
                {correction.isPending ? 'Exportando...' : 'Corrigir e Exportar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

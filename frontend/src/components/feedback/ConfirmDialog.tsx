import { type ReactNode, useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  isLoading?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  destructive = false,
  isLoading = false,
}: ConfirmDialogProps) {
  // Unique per instance: a static id would make aria-labelledby resolve to the
  // wrong heading when two dialogs are mounted at once.
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [open]);

  // Escape closes the dialog, matching standard modal behaviour.
  useEffect(() => {
    if (!open || isLoading) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, isLoading, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-fade-in"
        onClick={!isLoading ? onClose : undefined}
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className={cn(
          'relative bg-surface rounded-xl shadow-2xl w-full max-w-md overflow-hidden',
          'animate-scale-in',
        )}
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div
              className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-0.5',
                destructive ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600',
              )}
            >
              <AlertTriangle size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 id={titleId} className="text-lg font-semibold text-text-primary mb-1.5 leading-tight">
                {title}
              </h2>
              <div id={descriptionId} className="text-sm text-text-muted leading-relaxed">
                {description}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-app-bg flex items-center justify-end gap-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-muted rounded-lg transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            aria-busy={isLoading || undefined}
            className={cn(
              'flex items-center justify-center min-w-[100px] px-4 py-2 text-sm font-semibold text-white rounded-lg transition-colors shadow-sm disabled:opacity-70',
              destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700',
            )}
          >
            {isLoading ? (
              <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            ) : (
              confirmLabel
            )}
          </button>
        </div>

        {/* Close icon */}
        <button
          onClick={onClose}
          disabled={isLoading}
          aria-label="Fechar diálogo"
          className="absolute top-4 right-4 p-1 rounded-md text-text-muted hover:bg-surface-muted hover:text-text-secondary transition-colors disabled:opacity-50"
        >
          <X size={16} />
        </button>
      </div>
    </div>,
    document.body
  );
}

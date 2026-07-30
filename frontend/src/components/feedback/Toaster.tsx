import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToastStore, type Toast, type ToastTone } from '@/app/stores/useToastStore';

const TONE_CONFIG: Record<
  ToastTone,
  { icon: React.ComponentType<{ size?: number; className?: string }>; accent: string; iconColor: string }
> = {
  success: { icon: CheckCircle2,  accent: 'bg-emerald-500', iconColor: 'text-emerald-500' },
  error:   { icon: XCircle,       accent: 'bg-red-500',     iconColor: 'text-red-500'     },
  warning: { icon: AlertTriangle, accent: 'bg-amber-500',   iconColor: 'text-amber-500'   },
  info:    { icon: Info,          accent: 'bg-blue-500',    iconColor: 'text-blue-500'    },
};

function ToastCard({ toast }: { toast: Toast }) {
  const dismiss = useToastStore((state) => state.dismiss);
  const config = TONE_CONFIG[toast.tone];
  const Icon = config.icon;
  // Pause auto-dismiss while hovered so users can finish reading / click actions.
  const pausedRef = useRef(false);
  const remainingRef = useRef(toast.duration);

  useEffect(() => {
    if (toast.duration <= 0) return;

    let start = Date.now();
    let timer: ReturnType<typeof setTimeout>;

    const run = () => {
      timer = setTimeout(() => {
        if (pausedRef.current) {
          // Re-check shortly after the pointer leaves.
          run();
          return;
        }
        dismiss(toast.id);
      }, remainingRef.current);
    };

    const tick = setInterval(() => {
      if (!pausedRef.current) {
        remainingRef.current -= Date.now() - start;
      }
      start = Date.now();
    }, 100);

    run();
    return () => {
      clearTimeout(timer);
      clearInterval(tick);
    };
  }, [toast.duration, toast.id, dismiss]);

  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => { pausedRef.current = true; }}
      onMouseLeave={() => { pausedRef.current = false; }}
      className={cn(
        'pointer-events-auto relative flex w-full gap-3 overflow-hidden',
        'rounded-xl border border-border bg-surface p-3.5 pr-10 shadow-dropdown',
        'animate-slide-top',
      )}
    >
      {/* Tone accent bar */}
      <span className={cn('absolute inset-y-0 left-0 w-1', config.accent)} aria-hidden="true" />

      <Icon size={17} className={cn('mt-0.5 shrink-0', config.iconColor)} aria-hidden="true" />

      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold leading-tight text-text-primary">{toast.title}</p>
        {toast.description && (
          <p className="mt-1 text-[12px] leading-relaxed text-text-secondary break-words">
            {toast.description}
          </p>
        )}
        {toast.action && (
          <button
            type="button"
            onClick={() => {
              toast.action?.onClick();
              dismiss(toast.id);
            }}
            className="mt-2 text-[12px] font-semibold text-blue-600 hover:text-blue-700 hover:underline"
          >
            {toast.action.label}
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => dismiss(toast.id)}
        aria-label="Fechar notificação"
        className={cn(
          'absolute right-2 top-2 rounded-md p-1 text-text-muted',
          'hover:bg-surface-muted hover:text-text-secondary transition-colors',
        )}
      >
        <X size={14} />
      </button>
    </div>
  );
}

/**
 * Global toast viewport. Mounted once by Providers; renders through a portal so
 * it is never clipped by page-level overflow containers.
 */
export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      // aria-live so screen readers announce toasts as they arrive.
      aria-live="polite"
      aria-relevant="additions"
      className={cn(
        'pointer-events-none fixed z-[100] flex flex-col gap-2',
        'bottom-4 right-4 w-[min(24rem,calc(100vw-2rem))]',
      )}
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>,
    document.body,
  );
}

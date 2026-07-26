import { AlertTriangle, RefreshCw, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ErrorStateProps {
  title?: string;
  message?: string;
  code?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = 'Ocorreu um erro',
  message = 'Não foi possível completar a operação. Tente novamente.',
  code,
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 px-8 text-center', className)}>
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-danger-border bg-danger-light">
        <AlertTriangle size={24} className="text-red-500" />
      </div>

      <h3 className="mb-1 text-base font-semibold text-text-primary">{title}</h3>
      <p className="mb-2 max-w-sm text-sm leading-relaxed text-text-secondary">{message}</p>

      {code && (
        <code className="text-[11px] font-mono text-red-500 bg-red-50 px-2 py-0.5 rounded mb-4">
          Código: {code}
        </code>
      )}

      <div className="flex items-center gap-3 mt-4">
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
          >
            <RefreshCw size={14} />
            Tentar novamente
          </button>
        )}
        <a
          href="https://github.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-text-primary"
        >
          <ExternalLink size={12} />
          Reportar problema
        </a>
      </div>
    </div>
  );
}

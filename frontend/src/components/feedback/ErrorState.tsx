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
      <div className="w-14 h-14 rounded-full bg-red-50 border border-red-100 flex items-center justify-center mb-4">
        <AlertTriangle size={24} className="text-red-500" />
      </div>

      <h3 className="text-base font-semibold text-slate-800 mb-1">{title}</h3>
      <p className="text-sm text-slate-500 max-w-sm leading-relaxed mb-2">{message}</p>

      {code && (
        <code className="text-[11px] font-mono text-red-500 bg-red-50 px-2 py-0.5 rounded mb-4">
          Código: {code}
        </code>
      )}

      <div className="flex items-center gap-3 mt-4">
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-700 transition-colors"
          >
            <RefreshCw size={14} />
            Tentar novamente
          </button>
        )}
        <a
          href="https://github.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          <ExternalLink size={12} />
          Reportar problema
        </a>
      </div>
    </div>
  );
}

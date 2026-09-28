import { AlertTriangle, RefreshCw, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface ErrorStateProps {
  title?: string;
  message?: string;
  code?: string;
  onRetry?: () => void;
  className?: string;
  /**
   * Where "Reportar problema" points. Configure per deployment via
   * VITE_SUPPORT_URL; the link is hidden when neither is set, so it never
   * dead-ends on an unrelated page.
   */
  supportUrl?: string;
}

export function ErrorState({
  title,
  message,
  code,
  onRetry,
  className,
  supportUrl,
}: ErrorStateProps) {
  const { t } = useTranslation('ui');
  const reportUrl = supportUrl ?? (import.meta.env.VITE_SUPPORT_URL as string | undefined);

  return (
    <div className={cn('flex flex-col items-center justify-center py-16 px-8 text-center', className)}>
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-danger-border bg-danger-light">
        <AlertTriangle size={24} className="text-red-500" />
      </div>

      <h3 className="mb-1 text-base font-semibold text-text-primary">{title ?? t('errorState.title')}</h3>
      <p className="mb-2 max-w-sm text-sm leading-relaxed text-text-secondary">{message ?? t('errorState.message')}</p>

      {code && (
        <code className="text-[11px] font-mono text-red-500 bg-red-50 px-2 py-0.5 rounded mb-4">
          {t('errorState.code', { code })}
        </code>
      )}

      <div className="flex items-center gap-3 mt-4">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
          >
            <RefreshCw size={14} aria-hidden="true" />
            {t('errorState.retry')}
          </button>
        )}
        {reportUrl && (
          <a
            href={reportUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-text-primary"
          >
            <ExternalLink size={12} aria-hidden="true" />
            {t('errorState.report')}
          </a>
        )}
      </div>
    </div>
  );
}

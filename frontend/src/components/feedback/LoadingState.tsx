import { cn } from '@/lib/utils';

interface LoadingStateProps {
  variant?: 'spinner' | 'skeleton-cards' | 'skeleton-table' | 'skeleton-page';
  message?: string;
  rows?: number;
  cols?: number;
  className?: string;
}

export function LoadingState({ variant = 'spinner', message, rows = 5, className }: LoadingStateProps) {
  if (variant === 'spinner') {
    return (
      <div className={cn('flex flex-col items-center justify-center py-16 gap-3', className)}>
        <div className="h-8 w-8 animate-spin-slow rounded-full border-2 border-border border-t-blue-500" role="status" aria-label={message ?? 'Carregando'} />
        {message && <p className="text-sm text-text-muted">{message}</p>}
      </div>
    );
  }

  if (variant === 'skeleton-cards') {
    return (
      <div className={cn('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5', className)}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="card p-5 flex flex-col gap-3">
            <div className="flex items-start justify-between">
              <div className="skeleton w-9 h-9 rounded-lg" />
              <div className="skeleton w-16 h-4 rounded-full" />
            </div>
            <div className="space-y-2">
              <div className="skeleton w-3/4 h-5 rounded" />
              <div className="skeleton w-full h-3 rounded" />
              <div className="skeleton w-2/3 h-3 rounded" />
            </div>
            <div className="flex gap-2 border-t border-border pt-2">
              <div className="skeleton w-16 h-4 rounded" />
              <div className="skeleton w-16 h-4 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'skeleton-table') {
    return (
      <div className={cn('space-y-2', className)}>
        <div className="skeleton h-10 rounded-lg w-full" />
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-4 border-b border-border px-4 py-3">
            <div className="skeleton w-1/4 h-4 rounded" />
            <div className="skeleton w-1/6 h-4 rounded" />
            <div className="skeleton w-1/6 h-4 rounded" />
            <div className="skeleton flex-1 h-4 rounded" />
            <div className="skeleton w-16 h-4 rounded" />
          </div>
        ))}
      </div>
    );
  }

  // skeleton-page
  return (
    <div className={cn('p-6 space-y-6', className)}>
      <div className="space-y-2">
        <div className="skeleton w-48 h-7 rounded" />
        <div className="skeleton w-96 h-4 rounded" />
      </div>
      <div className="grid grid-cols-3 gap-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card p-5">
            <div className="skeleton w-9 h-9 rounded-lg mb-3" />
            <div className="skeleton w-16 h-6 rounded mb-1" />
            <div className="skeleton w-24 h-4 rounded" />
          </div>
        ))}
      </div>
      <div className="card p-5">
        <div className="skeleton w-full h-48 rounded" />
      </div>
    </div>
  );
}

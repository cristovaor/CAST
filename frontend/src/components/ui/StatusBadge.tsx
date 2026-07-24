import { cn, getStatusClasses } from '@/lib/utils';
import { statusLabel } from '@/lib/formatters';
import type { StatusVariant } from '@/types/domain';

interface StatusBadgeProps {
  status: StatusVariant;
  size?: 'sm' | 'md' | 'lg';
  showDot?: boolean;
  className?: string;
}

export function StatusBadge({
  status,
  size = 'md',
  showDot = true,
  className,
}: StatusBadgeProps) {
  const { bg, text, border, dot } = getStatusClasses(status);

  const sizes = {
    sm: 'text-[10px] px-1.5 py-0.5 gap-1',
    md: 'text-xs    px-2   py-0.5 gap-1.5',
    lg: 'text-sm    px-2.5 py-1   gap-1.5',
  };

  const dotSizes = {
    sm: 'w-1.5 h-1.5',
    md: 'w-1.5 h-1.5',
    lg: 'w-2   h-2',
  };

  const isPulsing = status === 'running';

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-medium',
        bg, text, border,
        sizes[size],
        className,
      )}
      aria-label={`Status: ${statusLabel(status)}`}
    >
      {showDot && (
        <span
          className={cn(
            'rounded-full shrink-0',
            dot,
            dotSizes[size],
            isPulsing && 'badge-pulse',
          )}
        />
      )}
      {statusLabel(status)}
    </span>
  );
}

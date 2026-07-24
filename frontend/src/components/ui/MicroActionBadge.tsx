import { cn, getMicroActionConfig } from '@/lib/utils';
import type { MicroAction } from '@/types/domain';

interface MicroActionBadgeProps {
  action: MicroAction;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function MicroActionBadge({
  action,
  showLabel = true,
  size = 'md',
  className,
}: MicroActionBadgeProps) {
  const config = getMicroActionConfig(action);

  const sizes = {
    sm: 'text-[10px] px-1.5 py-0.5 gap-1',
    md: 'text-xs    px-2   py-0.5 gap-1.5',
    lg: 'text-sm    px-2.5 py-1   gap-2',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md font-mono font-semibold border',
        config.bgColor, config.textColor,
        sizes[size],
        className,
      )}
      title={config.label}
      aria-label={config.label}
    >
      <span className="font-bold tracking-wider">{config.shortLabel}</span>
      {showLabel && (
        <span className="font-normal opacity-80 truncate max-w-[120px]">{config.label}</span>
      )}
    </span>
  );
}

import { cn } from '@/lib/utils';
import type { DataTone } from '@/types/research';

// Neutral, science-grade status pill driven by a DataTone.
// Keeps status language consistent across sessions, quality and sync states.

const TONE_CLASSES: Record<DataTone, { bg: string; text: string; border: string; dot: string }> = {
  neutral: { bg: 'bg-surface-muted', text: 'text-text-secondary', border: 'border-border', dot: 'bg-slate-400' },
  info: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-blue-500' },
  success: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  warning: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' },
  danger: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', dot: 'bg-red-500' },
};

interface ToneBadgeProps {
  tone: DataTone;
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}

export function ToneBadge({ tone, children, dot = true, className }: ToneBadgeProps) {
  const c = TONE_CLASSES[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap',
        c.bg, c.text, c.border, className,
      )}
    >
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', c.dot)} />}
      {children}
    </span>
  );
}

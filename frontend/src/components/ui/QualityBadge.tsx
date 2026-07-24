import { cn, getQualityClasses, scoreToQuality } from '@/lib/utils';
import { qualityLabel } from '@/lib/formatters';
import type { QualityLevel } from '@/types/domain';
import { ShieldCheck, ShieldAlert, ShieldX, Shield, AlertTriangle } from 'lucide-react';

interface QualityBadgeProps {
  level?: QualityLevel;
  score?: number; // 0–1 (auto-computes level if level not given)
  showScore?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

const ICONS = {
  excellent: ShieldCheck,
  good:      Shield,
  warning:   AlertTriangle,
  poor:      ShieldAlert,
  rejected:  ShieldX,
};

export function QualityBadge({
  level,
  score,
  showScore = true,
  size = 'md',
  className,
}: QualityBadgeProps) {
  const resolvedLevel: QualityLevel = level ?? (score !== undefined ? scoreToQuality(score) : 'good');
  const { bg, text, border } = getQualityClasses(resolvedLevel);
  const Icon = ICONS[resolvedLevel];

  const sizes = {
    sm: 'text-[10px] px-1.5 py-0.5 gap-1',
    md: 'text-xs    px-2   py-0.5 gap-1.5',
  };

  const displayScore = score !== undefined ? `${Math.round(score * 100)}%` : '';

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-medium',
        bg, text, border,
        sizes[size],
        className,
      )}
      aria-label={`Qualidade: ${qualityLabel(resolvedLevel)}${displayScore ? ` (${displayScore})` : ''}`}
    >
      <Icon size={10} className="shrink-0" />
      {qualityLabel(resolvedLevel)}
      {showScore && displayScore && (
        <span className="opacity-70">· {displayScore}</span>
      )}
    </span>
  );
}

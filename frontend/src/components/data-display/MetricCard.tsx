import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { KPICardData } from '@/types/domain';

interface MetricCardProps {
  data: KPICardData;
  isLoading?: boolean;
  className?: string;
  variant?: 'default' | 'hero';
}

// Icon map — resolved at render time to avoid dynamic imports
import {
  FolderKanban, FlaskConical, Users, Video,
  ShieldCheck, AlertTriangle, BarChart3, Cpu,
} from 'lucide-react';

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  FolderKanban, FlaskConical, Users, Video,
  ShieldCheck, AlertTriangle, BarChart3, Cpu,
};

const COLOR_CONFIGS = {
  default: {
    iconBg: 'bg-slate-100',
    iconText: 'text-slate-600',
  },
  info: {
    iconBg: 'bg-blue-50',
    iconText: 'text-blue-600',
  },
  success: {
    iconBg: 'bg-emerald-50',
    iconText: 'text-emerald-600',
  },
  warning: {
    iconBg: 'bg-amber-50',
    iconText: 'text-amber-600',
  },
  danger: {
    iconBg: 'bg-red-50',
    iconText: 'text-red-600',
  },
};

export function MetricCard({ data, isLoading, className, variant = 'default' }: MetricCardProps) {
  if (isLoading) return <MetricCardSkeleton className={className} />;

  const Icon = ICON_MAP[data.icon] ?? BarChart3;
  const color = COLOR_CONFIGS[data.color] ?? COLOR_CONFIGS.default;
  const isHero = variant === 'hero';

  return (
    <div
      className={cn(
        'card card-hover flex flex-col gap-3 animate-fade-in transition-all',
        isHero ? 'p-6 bg-gradient-to-br from-white to-slate-50 border-blue-100 shadow-md ring-1 ring-blue-500/10' : 'p-5',
        className,
      )}
    >
      {/* Header row: icon + trend */}
      <div className="flex items-start justify-between">
        <div className={cn(
          'rounded-lg flex items-center justify-center shrink-0',
          isHero ? 'w-10 h-10' : 'w-9 h-9',
          color.iconBg
        )}>
          <Icon size={isHero ? 20 : 18} className={color.iconText} />
        </div>

        {data.trend && (
          <TrendIndicator
            value={data.trend.value}
            direction={data.trend.direction}
            isPositive={data.trend.isPositive}
          />
        )}
      </div>

      {/* Value */}
      <div className={isHero ? 'mt-2' : ''}>
        <div className={cn(
          'font-bold text-slate-900 leading-none tracking-tight',
          isHero ? 'text-3xl lg:text-4xl' : 'text-2xl'
        )}>
          {data.value}
        </div>
        <div className={cn(
          'mt-1 font-medium text-slate-600',
          isHero ? 'text-sm' : 'text-[13px]'
        )}>{data.label}</div>
      </div>

      {/* Description */}
      <p className={cn(
        'text-slate-400 leading-relaxed border-t border-slate-100 pt-3',
        isHero ? 'text-xs' : 'text-[11px]'
      )}>
        {data.description}
      </p>
    </div>
  );
}

function TrendIndicator({
  value,
  direction,
  isPositive,
}: {
  value: string;
  direction: 'up' | 'down' | 'neutral';
  isPositive: boolean;
}) {
  const Icon = direction === 'up' ? TrendingUp : direction === 'down' ? TrendingDown : Minus;
  const colorClass = isPositive ? 'text-emerald-600' : 'text-red-600';
  const bgClass = isPositive ? 'bg-emerald-50' : 'bg-red-50';

  return (
    <div className={cn('flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium', bgClass, colorClass)}>
      <Icon size={11} />
      <span>{value}</span>
    </div>
  );
}

export function MetricCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('card p-5 flex flex-col gap-3', className)}>
      <div className="flex items-start justify-between">
        <div className="skeleton w-9 h-9 rounded-lg" />
        <div className="skeleton w-24 h-5 rounded-full" />
      </div>
      <div>
        <div className="skeleton w-16 h-7 rounded mb-1.5" />
        <div className="skeleton w-32 h-4 rounded" />
      </div>
      <div className="border-t border-slate-100 pt-3">
        <div className="skeleton w-full h-3 rounded mb-1" />
        <div className="skeleton w-3/4 h-3 rounded" />
      </div>
    </div>
  );
}

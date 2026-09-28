import { Info, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

// Reusable, non-deterministic language banner.
// Communicates the platform's core scientific principle (docs §4):
// associations are not causes; results require researcher validation.

type Variant = 'association' | 'privacy' | 'model' | 'quality';

// Title and body text come from `ui:caveat.<variant>`.
const VARIANTS: Record<Variant, { icon: typeof Info; cls: string }> = {
  association: {
    icon: Info,
    cls: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/40 dark:border-blue-900 dark:text-blue-200',
  },
  privacy: {
    icon: ShieldAlert,
    cls: 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-200',
  },
  model: {
    icon: Info,
    cls: 'bg-violet-50 border-violet-200 text-violet-800 dark:bg-violet-950/40 dark:border-violet-900 dark:text-violet-200',
  },
  quality: {
    icon: Info,
    cls: 'bg-app-bg border-border text-text-secondary',
  },
};

interface ScientificCaveatProps {
  variant?: Variant;
  children?: React.ReactNode;
  className?: string;
  compact?: boolean;
}

export function ScientificCaveat({ variant = 'association', children, className, compact }: ScientificCaveatProps) {
  const { t } = useTranslation('ui');
  const v = VARIANTS[variant];
  const Icon = v.icon;
  return (
    <div
      role="note"
      className={cn('flex gap-3 rounded-lg border px-3.5 py-3', v.cls, compact && 'py-2', className)}
    >
      <Icon size={16} className="shrink-0 mt-0.5 opacity-80" aria-hidden="true" />
      <div className="min-w-0">
        {!compact && <p className="text-[12px] font-semibold leading-tight">{t(`caveat.${variant}.title`)}</p>}
        <p className={cn('text-[12px] leading-relaxed', !compact && 'mt-0.5 opacity-90')}>
          {children ?? t(`caveat.${variant}.body`)}
        </p>
      </div>
    </div>
  );
}

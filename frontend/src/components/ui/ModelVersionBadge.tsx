import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Cpu } from 'lucide-react';

interface ModelVersionBadgeProps {
  name?: string;
  version: string;
  framework?: string;
  active?: boolean;
  className?: string;
}

export function ModelVersionBadge({
  name,
  version,
  framework = 'torch',
  active,
  className,
}: ModelVersionBadgeProps) {
  const { t } = useTranslation('ui');
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-medium',
        'px-2 py-0.5 rounded-md border',
        'bg-app-bg text-text-secondary border-border',
        className,
      )}
      aria-label={t(active ? 'badges.modelActive' : 'badges.model', { name: name ?? '', version, framework })}
    >
      <Cpu size={10} className="text-violet-500 shrink-0" />
      {name && <span className="text-text-secondary font-semibold">{name}</span>}
      <span className="font-mono text-text-muted">v{version}</span>
      {active !== undefined && (
        <span
          className={cn(
            'w-1.5 h-1.5 rounded-full shrink-0',
            active ? 'bg-emerald-500' : 'bg-slate-300',
          )}
          title={active ? 'Ativo' : 'Inativo'}
        />
      )}
    </span>
  );
}

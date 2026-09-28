import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  SearchX, AlertTriangle, ShieldOff, FolderOpen,
} from 'lucide-react';

type EmptyVariant = 'empty' | 'no-results' | 'error' | 'no-access';

interface EmptyStateProps {
  variant?: EmptyVariant;
  title?: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
  icon?: ReactNode;
  className?: string;
}

// Titles and descriptions come from `ui:emptyState.<key>`.
const DEFAULTS: Record<EmptyVariant, { key: 'empty' | 'noResults' | 'error' | 'noAccess'; icon: ReactNode }> = {
  'empty': {
    key: 'empty',
    icon: <FolderOpen size={40} className="text-text-disabled" />,
  },
  'no-results': {
    key: 'noResults',
    icon: <SearchX size={40} className="text-text-disabled" />,
  },
  'error': {
    key: 'error',
    icon: <AlertTriangle size={40} className="text-red-300" />,
  },
  'no-access': {
    key: 'noAccess',
    icon: <ShieldOff size={40} className="text-text-disabled" />,
  },
};

export function EmptyState({
  variant = 'empty',
  title,
  description,
  action,
  secondaryAction,
  icon,
  className,
}: EmptyStateProps) {
  const { t } = useTranslation('ui');
  const defaults = DEFAULTS[variant];

  return (
    <div className={cn('flex flex-col items-center justify-center py-16 px-8 text-center', className)}>
      <div className="mb-4">{icon ?? defaults.icon}</div>
      <h3 className="text-base font-semibold text-text-secondary mb-1">
        {title ?? t(`emptyState.${defaults.key}.title`)}
      </h3>
      <p className="text-sm text-text-muted max-w-sm leading-relaxed">
        {description ?? t(`emptyState.${defaults.key}.description`)}
      </p>

      {(action || secondaryAction) && (
        <div className="flex items-center gap-3 mt-6">
          {action && (
            <button
              onClick={action.onClick}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
            >
              {action.label}
            </button>
          )}
          {secondaryAction && (
            <button
              onClick={secondaryAction.onClick}
              className="px-4 py-2 text-text-secondary text-sm font-medium hover:text-text-primary transition-colors"
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

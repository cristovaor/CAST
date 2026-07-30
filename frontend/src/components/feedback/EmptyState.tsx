import { type ReactNode } from 'react';
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

const DEFAULTS: Record<EmptyVariant, { title: string; description: string; icon: ReactNode }> = {
  'empty': {
    title: 'Nenhum item encontrado',
    description: 'Comece criando o primeiro item.',
    icon: <FolderOpen size={40} className="text-text-disabled" />,
  },
  'no-results': {
    title: 'Nenhum resultado',
    description: 'Tente ajustar os filtros ou termos de busca.',
    icon: <SearchX size={40} className="text-text-disabled" />,
  },
  'error': {
    title: 'Erro ao carregar',
    description: 'Não foi possível carregar os dados. Tente novamente.',
    icon: <AlertTriangle size={40} className="text-red-300" />,
  },
  'no-access': {
    title: 'Acesso restrito',
    description: 'Você não tem permissão para visualizar este conteúdo.',
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
  const defaults = DEFAULTS[variant];

  return (
    <div className={cn('flex flex-col items-center justify-center py-16 px-8 text-center', className)}>
      <div className="mb-4">{icon ?? defaults.icon}</div>
      <h3 className="text-base font-semibold text-text-secondary mb-1">
        {title ?? defaults.title}
      </h3>
      <p className="text-sm text-text-muted max-w-sm leading-relaxed">
        {description ?? defaults.description}
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

import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  description?: string;
  context?: ReactNode;
  actions?: ReactNode;
  tabs?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, context, actions, tabs, className }: PageHeaderProps) {
  return (
    <div className={cn('bg-surface border-b border-border', className)}>
      <div className="px-4 pt-5 pb-0 sm:px-6 sm:pt-6">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl lg:text-[28px] font-bold text-text-primary leading-tight tracking-tight">{title}</h1>
            {description && (
              <p className="mt-1.5 text-sm text-text-secondary leading-relaxed max-w-2xl">
                {description}
              </p>
            )}
            {context && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {context}
              </div>
            )}
          </div>
          {actions && (
            <div className="flex items-center gap-2 shrink-0 pt-0.5">
              {actions}
            </div>
          )}
        </div>

        {/* Tab navigation below title */}
        {tabs && (
          <div className="mt-5">
            {tabs}
          </div>
        )}
      </div>
    </div>
  );
}

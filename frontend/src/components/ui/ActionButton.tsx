import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'tertiary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  fullWidth?: boolean;
}

export const ActionButton = forwardRef<HTMLButtonElement, ActionButtonProps>(
  (
    {
      className,
      variant = 'secondary',
      size = 'md',
      icon: Icon,
      fullWidth,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const baseStyles = 'inline-flex items-center justify-center gap-1.5 font-medium rounded-lg transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500/50';

    const variants = {
      primary: 'bg-blue-600 text-white shadow-sm hover:bg-blue-700 hover:shadow-md',
      secondary: 'bg-surface text-text-secondary border border-border shadow-sm hover:bg-surface-hover hover:border-border-strong',
      tertiary: 'bg-surface-muted text-text-secondary border border-transparent hover:bg-surface-hover',
      ghost: 'bg-transparent text-text-secondary hover:bg-surface-muted',
    };

    const sizes = {
      sm: 'px-2.5 py-1.5 text-xs',
      md: 'px-3.5 py-2 text-sm',
      lg: 'px-4 py-2.5 text-sm',
    };

    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          baseStyles,
          variants[variant],
          sizes[size],
          fullWidth && 'w-full',
          className
        )}
        {...props}
      >
        {Icon && <Icon size={size === 'sm' ? 14 : 16} className={cn(variant === 'primary' ? 'text-white/80' : 'text-text-secondary')} />}
        {children}
      </button>
    );
  }
);

ActionButton.displayName = 'ActionButton';

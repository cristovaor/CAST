import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'tertiary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  fullWidth?: boolean;
  /** Shows a spinner and blocks interaction while an async action runs. */
  isLoading?: boolean;
  /** Replaces the label while loading (falls back to children). */
  loadingText?: string;
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
      isLoading = false,
      loadingText,
      type = 'button',
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
      danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700 hover:shadow-md',
    };

    const sizes = {
      sm: 'px-2.5 py-1.5 text-xs',
      md: 'px-3.5 py-2 text-sm',
      lg: 'px-4 py-2.5 text-sm',
    };

    const iconSize = size === 'sm' ? 14 : 16;
    const onSolid = variant === 'primary' || variant === 'danger';

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        className={cn(
          baseStyles,
          variants[variant],
          sizes[size],
          fullWidth && 'w-full',
          className
        )}
        {...props}
      >
        {isLoading ? (
          <Loader2
            size={iconSize}
            className={cn('animate-spin', onSolid ? 'text-white/90' : 'text-text-secondary')}
            aria-hidden="true"
          />
        ) : (
          Icon && <Icon size={iconSize} className={cn(onSolid ? 'text-white/80' : 'text-text-secondary')} />
        )}
        {isLoading ? (loadingText ?? children) : children}
      </button>
    );
  }
);

ActionButton.displayName = 'ActionButton';

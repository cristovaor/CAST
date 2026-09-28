import { useId } from 'react';
import { cn } from '@/lib/utils';

interface BrandMarkProps {
  className?: string;
  /** Accessible name; omit when a visible "CAST Pro" wordmark sits beside it. */
  title?: string;
}

/**
 * The CAST mark: a "C" around a focus point on the blue→violet brand
 * gradient. `public/favicon.svg` draws the same shape — keep the two in sync.
 */
export function BrandMark({ className, title }: BrandMarkProps) {
  const gradientId = useId();

  return (
    <svg
      viewBox="0 0 32 32"
      className={cn('h-8 w-8 shrink-0', className)}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2563EB" />
          <stop offset="1" stopColor="#7C3AED" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={`url(#${gradientId})`} />
      <path
        d="M20.9 11.2a6.8 6.8 0 1 0 0 9.6"
        fill="none"
        stroke="#fff"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <circle cx="22.4" cy="16" r="1.9" fill="#fff" />
    </svg>
  );
}

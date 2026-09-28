import { useRef, type KeyboardEvent } from 'react';
import { Check, Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useTranslation } from 'react-i18next';
import { type ThemeMode, useThemeStore } from '@/app/stores/useThemeStore';
import { cn } from '@/lib/utils';

const OPTIONS: { mode: ThemeMode; icon: LucideIcon }[] = [
  { mode: 'light', icon: Sun },
  { mode: 'dark', icon: Moon },
  { mode: 'system', icon: Monitor },
];

/**
 * Three-way theme choice (light / dark / follow the OS) as a segmented radio
 * group. Arrow keys move and select, like a native radio set.
 */
export function ThemeSwitcher({ className }: { className?: string }) {
  const { t } = useTranslation();
  const mode = useThemeStore((state) => state.mode);
  const setMode = useThemeStore((state) => state.setMode);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const current = OPTIONS.findIndex((option) => option.mode === mode);
    const next = (current + step + OPTIONS.length) % OPTIONS.length;
    setMode(OPTIONS[next].mode);
    buttons.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={t('theme.label')}
      onKeyDown={onKeyDown}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface-muted p-0.5',
        className,
      )}
    >
      {OPTIONS.map(({ mode: option, icon: Icon }, index) => {
        const selected = mode === option;
        const label = t(`theme.${option}`);
        return (
          <button
            key={option}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            title={label}
            tabIndex={selected ? 0 : -1}
            onClick={() => setMode(option)}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-md transition-colors',
              selected
                ? 'bg-surface text-text-primary shadow-card'
                : 'text-text-muted hover:text-text-primary',
            )}
          >
            <Icon size={15} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

/** Icon-button variant for the crowded app top bar. */
export function ThemeMenu() {
  const { t } = useTranslation();
  const mode = useThemeStore((state) => state.mode);
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const setMode = useThemeStore((state) => state.setMode);
  const TriggerIcon = resolvedTheme === 'dark' ? Moon : Sun;
  const label = t('theme.change', { theme: t(`theme.${mode}`) });

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-muted transition-colors"
        >
          <TriggerIcon size={17} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-40 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-dropdown animate-scale-in"
        >
          <DropdownMenu.Label className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            {t('theme.label')}
          </DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={mode} onValueChange={(value) => setMode(value as ThemeMode)}>
            {OPTIONS.map(({ mode: option, icon: Icon }) => (
              <DropdownMenu.RadioItem
                key={option}
                value={option}
                className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm text-text-secondary outline-none transition-colors data-[highlighted]:bg-surface-hover data-[highlighted]:text-text-primary data-[state=checked]:text-text-primary"
              >
                <Icon size={14} className="text-text-muted" aria-hidden="true" />
                <span className="flex-1">{t(`theme.${option}`)}</span>
                <DropdownMenu.ItemIndicator>
                  <Check size={14} className="text-primary" aria-hidden="true" />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

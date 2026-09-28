import { Check, ChevronDown, Globe } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '@/i18n/types';
import { useLocale } from '@/i18n/useLocale';
import { cn } from '@/lib/utils';

const SHORT_CODE = { 'pt-BR': 'PT', en: 'EN' } as const;

/**
 * Language picker. Each language is listed under its own name ("English",
 * "Português") and tagged with `lang`, so it is recognisable — and correctly
 * pronounced by screen readers — whatever the current UI language is.
 */
export function LanguageSwitcher({ className, compact = false }: { className?: string; compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const language = useLocale();
  const label = t('language.change', { language: t(`language.${language}`) });

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary',
            compact ? 'p-2' : 'h-9 border border-border bg-surface-muted px-2.5',
            className,
          )}
        >
          <Globe size={compact ? 17 : 15} aria-hidden="true" />
          <span className={cn(compact && 'text-xs font-semibold')}>{SHORT_CODE[language]}</span>
          {!compact && <ChevronDown size={13} className="text-text-muted" aria-hidden="true" />}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-44 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-dropdown animate-scale-in"
        >
          <DropdownMenu.Label className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            {t('language.label')}
          </DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={language} onValueChange={(value) => void i18n.changeLanguage(value)}>
            {SUPPORTED_LANGUAGES.map((option) => (
              <DropdownMenu.RadioItem
                key={option}
                value={option}
                lang={option}
                className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm text-text-secondary outline-none transition-colors data-[highlighted]:bg-surface-hover data-[highlighted]:text-text-primary data-[state=checked]:text-text-primary"
              >
                <span className="w-6 text-[11px] font-semibold text-text-muted">{SHORT_CODE[option]}</span>
                <span className="flex-1">{t(`language.${option}`)}</span>
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

import { useTranslation } from 'react-i18next';
import { type AppLanguage, DEFAULT_LANGUAGE, isSupportedLanguage } from './types';

/**
 * The active language, re-rendering the caller when it changes. Components
 * that show only formatted dates, numbers or enum labels (no `t()` of their
 * own) use this so they follow a language switch.
 */
export function useLocale(): AppLanguage {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  return isSupportedLanguage(language) ? language : DEFAULT_LANGUAGE;
}

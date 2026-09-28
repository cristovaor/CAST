import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resources } from './resources';
import {
  type AppLanguage,
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  SUPPORTED_LANGUAGES,
  isSupportedLanguage,
} from './types';

/**
 * Saved choice first, then the browser language. Anything that is not
 * Portuguese gets English — a closer match for a foreign researcher than the
 * pt-BR default.
 */
function detectLanguage(): AppLanguage {
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (isSupportedLanguage(saved)) return saved;
  } catch {
    // Storage blocked (private mode, sandboxed iframe): fall through.
  }
  const browser = typeof navigator !== 'undefined' ? navigator.language : '';
  if (!browser) return DEFAULT_LANGUAGE;
  return browser.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en';
}

/** Keeps the document itself in step with the UI language. */
function syncDocument(language: string) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = language;
  document.title = i18n.t('common:meta.title');
  document
    .querySelector('meta[name="description"]')
    ?.setAttribute('content', i18n.t('common:meta.description'));
}

i18n.on('languageChanged', (language) => {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Not persisted; the choice still applies to this tab.
  }
  syncDocument(language);
});

void i18n.use(initReactI18next).init({
  resources,
  lng: detectLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: [...SUPPORTED_LANGUAGES],
  defaultNS: 'common',
  ns: Object.keys(resources[DEFAULT_LANGUAGE]),
  // Resources are bundled, so init resolves synchronously and the first
  // render already has its strings.
  initAsync: false,
  interpolation: { escapeValue: false },
  returnNull: false,
});

syncDocument(i18n.language);

/** The active UI language, for code outside React (formatters, stores). */
export function currentLanguage(): AppLanguage {
  const language = i18n.resolvedLanguage ?? i18n.language;
  return isSupportedLanguage(language) ? language : DEFAULT_LANGUAGE;
}

export default i18n;

/**
 * Shape a translation must have to mirror the pt-BR source: same keys, any
 * string values. `satisfies Translation<typeof ptX>` on each locale file turns
 * a missing or misspelled key into a compile error instead of a blank label.
 */
export type Translation<T> = {
  [K in keyof T]: T[K] extends string ? string : Translation<T[K]>;
};

export const SUPPORTED_LANGUAGES = ['pt-BR', 'en'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: AppLanguage = 'pt-BR';
export const LANGUAGE_STORAGE_KEY = 'cast-locale';

export function isSupportedLanguage(value: unknown): value is AppLanguage {
  return SUPPORTED_LANGUAGES.includes(value as AppLanguage);
}

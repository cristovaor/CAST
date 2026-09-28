import i18n from './index';

type LooseT = (key: string, options?: Record<string, unknown>) => string;

/**
 * `t()` for keys built at runtime (`domain:status.${value}`), which the typed
 * `t` cannot check. Prefer the typed `t` whenever the key is a literal.
 */
export const translate: LooseT = (key, options) => (i18n.t as unknown as LooseT)(key, options);

/**
 * A `Record<K, string>` whose values are looked up in the locale on every
 * read, so module-level label maps follow a language switch. Components that
 * read them must still re-render on the switch (`useTranslation`/`useLocale`).
 */
export function lazyLabels<K extends string>(
  prefix: string,
  keys: readonly K[],
  suffix = '',
): Record<K, string> {
  const labels = {} as Record<K, string>;
  for (const key of keys) {
    Object.defineProperty(labels, key, {
      enumerable: true,
      get: () => translate(`${prefix}.${key}${suffix}`),
    });
  }
  return labels;
}

/**
 * Like `lazyLabels`, for meta records that carry a translated `label` next to
 * fixed fields (tone, colour…): `{ draft: { tone: 'neutral' } }` becomes
 * `{ draft: { tone: 'neutral', label: <domain:prefix.draft> } }`.
 */
export function lazyMeta<K extends string, M extends object>(
  prefix: string,
  meta: Record<K, M>,
): Record<K, M & { readonly label: string }> {
  const result = {} as Record<K, M & { readonly label: string }>;
  for (const key of Object.keys(meta) as K[]) {
    result[key] = Object.defineProperty({ ...meta[key] }, 'label', {
      enumerable: true,
      get: () => translate(`${prefix}.${key}`),
    }) as M & { readonly label: string };
  }
  return result;
}

/**
 * Option lists (`[{ value, label, hint }]`): the listed text fields resolve
 * from `${prefix}.${value}.${field}` on each read.
 */
export function lazyOptions<V extends string, F extends string, E extends object = object>(
  prefix: string,
  fields: readonly F[],
  options: readonly ({ value: V } & E)[],
): ({ value: V } & E & { readonly [P in F]: string })[] {
  return options.map((option) => {
    const copy = { ...option } as { value: V } & E & { readonly [P in F]: string };
    for (const field of fields) {
      Object.defineProperty(copy, field, {
        enumerable: true,
        get: () => translate(`${prefix}.${option.value}.${field}`),
      });
    }
    return copy;
  });
}

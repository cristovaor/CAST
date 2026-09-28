import { useId, useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import { toast, toErrorMessage } from '@/app/stores/useToastStore';
import {
  type OrganizationSettings,
  type OrganizationSettingsUpdate,
  useUpdateOrganizationSettings,
} from './useSettings';

const FALLBACK_TIMEZONES = [
  'America/Sao_Paulo',
  'America/Manaus',
  'America/Recife',
  'America/Belem',
  'America/Fortaleza',
  'America/Cuiaba',
  'America/Porto_Velho',
  'America/Rio_Branco',
  'America/Noronha',
  'Europe/Lisbon',
  'UTC',
];

function timezones(current: string): string[] {
  let zones = FALLBACK_TIMEZONES;
  try {
    const supported = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone');
    if (supported?.length) zones = supported;
  } catch {
    // Older engines: keep the short list.
  }
  return zones.includes(current) ? zones : [current, ...zones];
}

type FormState = Required<{
  [K in keyof OrganizationSettingsUpdate]: string;
}>;

function toForm(org: OrganizationSettings): FormState {
  return {
    name: org.name,
    display_name: org.display_name ?? '',
    institution: org.institution ?? '',
    contact_email: org.contact_email ?? '',
    timezone: org.timezone,
    default_locale: org.default_locale,
  };
}

const inputClass =
  'mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-surface-muted disabled:text-text-secondary';

/**
 * Editable organization profile. Admins save through PATCH
 * /settings/organization, which records the change in the audit trail;
 * everyone else sees the same fields read-only.
 */
export function OrganizationSettingsForm({
  organization,
  canEdit,
}: {
  organization: OrganizationSettings;
  canEdit: boolean;
}) {
  const initial = useMemo(() => toForm(organization), [organization]);
  const [form, setForm] = useState<FormState>(initial);
  const [baseline, setBaseline] = useState<FormState>(initial);
  const update = useUpdateOrganizationSettings();
  const id = useId();
  const zones = useMemo(() => timezones(form.timezone), [form.timezone]);

  // Adopt fresh server data when nothing is being edited.
  if (initial !== baseline && JSON.stringify(form) === JSON.stringify(baseline)) {
    setForm(initial);
    setBaseline(initial);
  }

  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  const nameValid = form.name.trim().length >= 2;
  const set = (key: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!dirty || !nameValid) return;
    const payload: OrganizationSettingsUpdate = {};
    for (const key of Object.keys(form) as (keyof FormState)[]) {
      if (form[key] !== baseline[key]) {
        (payload as Record<string, string>)[key] = form[key].trim();
      }
    }
    update.mutate(payload, {
      onSuccess: (saved) => {
        const next = toForm(saved);
        setForm(next);
        setBaseline(next);
        toast.success('Configurações da organização salvas');
      },
    });
  };

  const field = (key: keyof FormState, label: string, hint?: string, type = 'text', maxLength?: number) => (
    <div>
      <label htmlFor={`${id}-${key}`} className="text-sm text-text-muted">{label}</label>
      <input
        id={`${id}-${key}`}
        type={type}
        value={form[key]}
        onChange={set(key)}
        disabled={!canEdit || update.isPending}
        maxLength={maxLength}
        className={inputClass}
      />
      {hint && <p className="mt-1 text-xs text-text-muted">{hint}</p>}
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {field('name', 'Nome da organização', undefined, 'text', 120)}
        {field('display_name', 'Nome de exibição', 'Nome curto mostrado no menu lateral (máx. 40 caracteres).', 'text', 40)}
        {field('institution', 'Instituição', undefined, 'text', 200)}
        {field('contact_email', 'E-mail de contato', undefined, 'email')}
        <div>
          <label htmlFor={`${id}-timezone`} className="text-sm text-text-muted">Fuso horário</label>
          <select
            id={`${id}-timezone`}
            value={form.timezone}
            onChange={set('timezone')}
            disabled={!canEdit || update.isPending}
            className={inputClass}
          >
            {zones.map((zone) => (
              <option key={zone} value={zone}>{zone}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-locale`} className="text-sm text-text-muted">Idioma padrão</label>
          <select
            id={`${id}-locale`}
            value={form.default_locale}
            onChange={set('default_locale')}
            disabled={!canEdit || update.isPending}
            className={inputClass}
          >
            <option value="pt-BR">Português (Brasil)</option>
            <option value="en">English</option>
          </select>
        </div>
      </div>

      {!nameValid && <p className="text-sm text-red-600 dark:text-red-400">O nome precisa ter pelo menos 2 caracteres.</p>}
      {update.isError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">{toErrorMessage(update.error)}</p>
      )}

      {canEdit ? (
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setForm(baseline)}
            disabled={!dirty || update.isPending}
            className="rounded-lg px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-muted disabled:opacity-50"
          >
            Descartar
          </button>
          <button
            type="submit"
            disabled={!dirty || !nameValid || update.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Save size={15} aria-hidden="true" />
            {update.isPending ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </div>
      ) : (
        <p className="text-xs text-text-muted">Somente administradores podem alterar estes dados.</p>
      )}
    </form>
  );
}

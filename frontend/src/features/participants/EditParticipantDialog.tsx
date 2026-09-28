import { Trans, useTranslation } from 'react-i18next';
import { AGE_RANGES, EDUCATION_LEVELS, GENDERS, HANDEDNESS } from './profileOptions';
import { useLocale } from '@/i18n/useLocale';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileClock,
  RotateCcw,
  UserRoundCog,
  UserRoundX,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/Dialog';
import { ActionButton } from '@/components/ui/ActionButton';
import { cn } from '@/lib/utils';
import type { ConsentStatus, Participant, ParticipantUpdate } from '@/types/domain';
import {
  useActivateParticipant,
  useDeactivateParticipant,
  useUpdateParticipant,
} from './useParticipants';

const PROFILE_KEYS = [
  'cohort',
  'grupo',
  'age_range',
  'gender',
  'education_level',
  'handedness',
  'recruitment_source',
  'enrollment',
] as const;

type EditForm = {
  external_code: string;
  cohort: string;
  age_range: string;
  gender: string;
  education_level: string;
  handedness: string;
  recruitment_source: string;
  consent_status: ConsentStatus;
  consent_version: string;
  eligibility_confirmed: boolean;
  identifiers_excluded: boolean;
};

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function booleanValue(value: unknown) {
  return value === true;
}

function formFromParticipant(participant: Participant): EditForm {
  const demographics = participant.demographic_group ?? {};
  const enrollment = (
    demographics.enrollment && typeof demographics.enrollment === 'object'
      ? demographics.enrollment
      : {}
  ) as Record<string, unknown>;

  return {
    external_code: participant.external_code,
    cohort: stringValue(demographics.cohort) || stringValue(demographics.grupo),
    age_range: stringValue(demographics.age_range),
    gender: stringValue(demographics.gender),
    education_level: stringValue(demographics.education_level),
    handedness: stringValue(demographics.handedness),
    recruitment_source: stringValue(demographics.recruitment_source),
    consent_status: participant.consent_status,
    consent_version: '',
    eligibility_confirmed: booleanValue(enrollment.eligibility_confirmed),
    identifiers_excluded: booleanValue(enrollment.direct_identifiers_excluded),
  };
}

function buildDemographicGroup(participant: Participant, form: EditForm) {
  const current = participant.demographic_group ?? {};
  const preserved = Object.fromEntries(
    Object.entries(current).filter(
      ([key]) => !PROFILE_KEYS.includes(key as (typeof PROFILE_KEYS)[number]),
    ),
  );
  const existingEnrollment = (
    current.enrollment && typeof current.enrollment === 'object'
      ? current.enrollment
      : {}
  ) as Record<string, unknown>;
  const profile = Object.fromEntries(
    Object.entries({
      cohort: form.cohort,
      age_range: form.age_range,
      gender: form.gender,
      education_level: form.education_level,
      handedness: form.handedness,
      recruitment_source: form.recruitment_source,
    }).filter(([, value]) => value.trim()),
  );

  return {
    ...preserved,
    ...profile,
    enrollment: {
      ...existingEnrollment,
      eligibility_confirmed: form.eligibility_confirmed,
      direct_identifiers_excluded: form.identifiers_excluded,
    },
  };
}

export function EditParticipantDialog({
  participant,
  children,
}: {
  participant: Participant;
  children: ReactNode;
}) {
  const { t } = useTranslation('participants');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'edit' | 'deactivate'>('edit');
  const [form, setForm] = useState<EditForm>(() => formFromParticipant(participant));
  const [deactivationReason, setDeactivationReason] = useState('');
  const [deactivationConfirmed, setDeactivationConfirmed] = useState(false);
  const updateParticipant = useUpdateParticipant();
  const deactivateParticipant = useDeactivateParticipant();
  const activateParticipant = useActivateParticipant();

  const consentChanged = form.consent_status !== participant.consent_status;
  const requiresConsentVersion = consentChanged && form.consent_status !== 'pending';
  const isPending = updateParticipant.isPending
    || deactivateParticipant.isPending
    || activateParticipant.isPending;
  const mutationError = updateParticipant.error
    || deactivateParticipant.error
    || activateParticipant.error;

  const statusLabel = participant.is_active ? t('edit.statusActive') : t('edit.statusInactive');
  const deactivatedDate = useMemo(
    () => participant.deactivated_at
      ? new Date(participant.deactivated_at).toLocaleDateString(locale)
      : null,
    [locale, participant.deactivated_at],
  );

  const setField = <Key extends keyof EditForm>(key: Key, value: EditForm[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (updateParticipant.isError) updateParticipant.reset();
  };

  const reset = () => {
    setMode('edit');
    setForm(formFromParticipant(participant));
    setDeactivationReason('');
    setDeactivationConfirmed(false);
    updateParticipant.reset();
    deactivateParticipant.reset();
    activateParticipant.reset();
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) reset();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const payload: ParticipantUpdate & { id: string } = {
      id: participant.id,
      external_code: form.external_code.trim().toUpperCase(),
      demographic_group: buildDemographicGroup(participant, form),
    };
    if (consentChanged) {
      payload.consent_status = form.consent_status;
      if (form.consent_status !== 'pending') {
        payload.consent_version = form.consent_version.trim();
      }
    }

    updateParticipant.mutate(payload, {
      onSuccess: () => setOpen(false),
    });
  };

  const confirmDeactivation = () => {
    deactivateParticipant.mutate(
      { id: participant.id, reason: deactivationReason.trim() },
      { onSuccess: () => setOpen(false) },
    );
  };

  const reactivate = () => {
    activateParticipant.mutate(participant.id, {
      onSuccess: () => setOpen(false),
    });
  };

  const canSave = form.external_code.trim().length >= 2
    && (!requiresConsentVersion || form.consent_version.trim().length > 0);
  const canDeactivate = deactivationReason.trim().length >= 10 && deactivationConfirmed;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="flex max-h-[92vh] max-w-4xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border bg-surface-muted/60 px-5 py-5 pr-12 sm:px-7">
          <div className="flex items-start gap-3 text-left">
            <div className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm',
              mode === 'deactivate' ? 'bg-red-600' : 'bg-blue-600',
            )}>
              {mode === 'deactivate'
                ? <UserRoundX size={20} aria-hidden="true" />
                : <UserRoundCog size={20} aria-hidden="true" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="text-xl">
                  {mode === 'deactivate' ? t('edit.titleDeactivate') : t('edit.titleEdit')}
                </DialogTitle>
                <StatusPill active={participant.is_active} label={statusLabel} />
              </div>
              <DialogDescription className="mt-1 max-w-2xl">
                {mode === 'deactivate'
                  ? t('edit.descriptionDeactivate', { code: participant.external_code })
                  : t('edit.descriptionEdit')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {mode === 'deactivate' ? (
          <DeactivatePanel
            participant={participant}
            reason={deactivationReason}
            confirmed={deactivationConfirmed}
            error={mutationError}
            pending={deactivateParticipant.isPending}
            canSubmit={canDeactivate}
            onReasonChange={(value) => {
              setDeactivationReason(value);
              if (deactivateParticipant.isError) deactivateParticipant.reset();
            }}
            onConfirmedChange={setDeactivationConfirmed}
            onCancel={() => {
              setMode('edit');
              setDeactivationReason('');
              setDeactivationConfirmed(false);
              deactivateParticipant.reset();
            }}
            onConfirm={confirmDeactivation}
          />
        ) : (
          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
              {!participant.is_active && (
                <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex gap-3">
                    <FileClock className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
                    <div>
                      <p className="text-sm font-semibold">
                        {deactivatedDate ? t('edit.inactiveSince', { date: deactivatedDate }) : t('edit.inactive')}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed">
                        {participant.deactivation_reason || t('edit.noReason')}
                      </p>
                    </div>
                  </div>
                  <ActionButton
                    type="button"
                    variant="secondary"
                    disabled={activateParticipant.isPending}
                    onClick={reactivate}
                    className="shrink-0 border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                  >
                    <RotateCcw size={15} aria-hidden="true" />
                    {activateParticipant.isPending ? t('edit.reactivating') : t('edit.reactivate')}
                  </ActionButton>
                </div>
              )}

              <FormSection
                eyebrow={t('edit.identification.eyebrow')}
                title={t('edit.identification.title')}
                description={t('edit.identification.description')}
              >
                <Field
                  label={t('edit.identification.code')}
                  htmlFor={`participant-code-${participant.id}`}
                  hint={t('edit.identification.codeHint')}
                >
                  <input
                    id={`participant-code-${participant.id}`}
                    required
                    minLength={2}
                    maxLength={80}
                    value={form.external_code}
                    onChange={(event) => setField('external_code', event.target.value.toUpperCase())}
                    className={cn(fieldClassName, 'font-mono uppercase tracking-wide')}
                  />
                </Field>
              </FormSection>

              <FormSection
                eyebrow={t('edit.sample.eyebrow')}
                title={t('edit.sample.title')}
                description={t('edit.sample.description')}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t('profile.cohort')} htmlFor={`participant-cohort-${participant.id}`}>
                    <input
                      id={`participant-cohort-${participant.id}`}
                      value={form.cohort}
                      onChange={(event) => setField('cohort', event.target.value)}
                      placeholder={t('profile.cohortPlaceholder')}
                      className={fieldClassName}
                    />
                  </Field>
                  <Field label={t('profile.ageRange')} htmlFor={`participant-age-${participant.id}`}>
                    <select
                      id={`participant-age-${participant.id}`}
                      value={form.age_range}
                      onChange={(event) => setField('age_range', event.target.value)}
                      className={fieldClassName}
                    >
                      <option value="">{t('profile.notInformed')}</option>
                      {AGE_RANGES.map((value) => (
                        <option key={value} value={value}>{t(`profile.ageRanges.${value}`)}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t('profile.gender')} htmlFor={`participant-gender-${participant.id}`}>
                    <select
                      id={`participant-gender-${participant.id}`}
                      value={form.gender}
                      onChange={(event) => setField('gender', event.target.value)}
                      className={fieldClassName}
                    >
                      <option value="">{t('profile.notInformed')}</option>
                      {GENDERS.map((value) => (
                        <option key={value} value={value}>{t(`profile.genders.${value}`)}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t('profile.education')} htmlFor={`participant-education-${participant.id}`}>
                    <select
                      id={`participant-education-${participant.id}`}
                      value={form.education_level}
                      onChange={(event) => setField('education_level', event.target.value)}
                      className={fieldClassName}
                    >
                      <option value="">{t('profile.notInformed')}</option>
                      {EDUCATION_LEVELS.map((value) => (
                        <option key={value} value={value}>{t(`profile.educationLevels.${value}`)}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t('profile.handedness')} htmlFor={`participant-handedness-${participant.id}`}>
                    <select
                      id={`participant-handedness-${participant.id}`}
                      value={form.handedness}
                      onChange={(event) => setField('handedness', event.target.value)}
                      className={fieldClassName}
                    >
                      <option value="">{t('profile.notInformed')}</option>
                      {HANDEDNESS.map((value) => (
                        <option key={value} value={value}>{t(`profile.handednessOptions.${value}`)}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t('profile.recruitment')} htmlFor={`participant-source-${participant.id}`}>
                    <input
                      id={`participant-source-${participant.id}`}
                      value={form.recruitment_source}
                      onChange={(event) => setField('recruitment_source', event.target.value)}
                      placeholder={t('profile.recruitmentPlaceholder')}
                      className={fieldClassName}
                    />
                  </Field>
                </div>
              </FormSection>

              <FormSection
                eyebrow={t('edit.ethics.eyebrow')}
                title={t('edit.ethics.title')}
                description={t('edit.ethics.description')}
              >
                <fieldset className="space-y-3">
                  <legend className="text-sm font-semibold text-text-primary">{t('edit.ethics.consentStatus')}</legend>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <ConsentCard
                      checked={form.consent_status === 'pending'}
                      label={t('edit.ethics.pending')}
                      description={t('edit.ethics.pendingDescription')}
                      onChange={() => setField('consent_status', 'pending')}
                    />
                    <ConsentCard
                      checked={form.consent_status === 'accepted'}
                      label={t('edit.ethics.accepted')}
                      description={t('edit.ethics.acceptedDescription')}
                      onChange={() => setField('consent_status', 'accepted')}
                    />
                    <ConsentCard
                      checked={form.consent_status === 'revoked'}
                      label={t('edit.ethics.revoked')}
                      description={t('edit.ethics.revokedDescription')}
                      onChange={() => setField('consent_status', 'revoked')}
                    />
                  </div>
                </fieldset>

                {requiresConsentVersion && (
                  <Field
                    label={form.consent_status === 'revoked' ? t('edit.ethics.versionRevoked') : t('edit.ethics.versionAccepted')}
                    htmlFor={`participant-consent-version-${participant.id}`}
                    hint={t('edit.ethics.versionHint')}
                  >
                    <input
                      id={`participant-consent-version-${participant.id}`}
                      required
                      value={form.consent_version}
                      onChange={(event) => setField('consent_version', event.target.value)}
                      placeholder={t('edit.ethics.versionPlaceholder')}
                      className={fieldClassName}
                    />
                  </Field>
                )}

                <div className="grid gap-3 rounded-xl border border-border bg-surface-muted/60 p-4 sm:grid-cols-2">
                  <Attestation
                    checked={form.eligibility_confirmed}
                    onChange={(checked) => setField('eligibility_confirmed', checked)}
                    label={t('edit.ethics.eligibility')}
                    description={t('edit.ethics.eligibilityDescription')}
                  />
                  <Attestation
                    checked={form.identifiers_excluded}
                    onChange={(checked) => setField('identifiers_excluded', checked)}
                    label={t('edit.ethics.identifiers')}
                    description={t('edit.ethics.identifiersDescription')}
                  />
                </div>
              </FormSection>

              {participant.is_active && (
                <section className="rounded-xl border border-red-200 bg-red-50/60 p-4 dark:border-red-950 dark:bg-red-950/20">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-red-900 dark:text-red-200">{t('edit.stop.title')}</p>
                      <p className="mt-1 text-xs leading-relaxed text-red-800 dark:text-red-300">
                        {t('edit.stop.description')}
                      </p>
                    </div>
                    <ActionButton
                      type="button"
                      variant="secondary"
                      onClick={() => setMode('deactivate')}
                      className="shrink-0 border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
                    >
                      <UserRoundX size={15} aria-hidden="true" />
                      {t('edit.stop.action')}
                    </ActionButton>
                  </div>
                </section>
              )}

              {mutationError && (
                <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                  {t('edit.failed', { message: (mutationError as Error).message })}
                </p>
              )}
            </div>

            <DialogFooter className="mt-0 flex-row items-center justify-end gap-2 border-t border-border bg-surface px-5 py-4 sm:px-7">
              <ActionButton type="button" variant="ghost" onClick={() => setOpen(false)}>
                {t('edit.cancel')}
              </ActionButton>
              <ActionButton type="submit" variant="primary" disabled={isPending || !canSave}>
                {updateParticipant.isPending ? t('edit.saving') : t('edit.save')}
              </ActionButton>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DeactivatePanel({
  participant,
  reason,
  confirmed,
  error,
  pending,
  canSubmit,
  onReasonChange,
  onConfirmedChange,
  onCancel,
  onConfirm,
}: {
  participant: Participant;
  reason: string;
  confirmed: boolean;
  error: Error | null;
  pending: boolean;
  canSubmit: boolean;
  onReasonChange: (value: string) => void;
  onConfirmedChange: (checked: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation('participants');
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
        <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-950 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100">
          <AlertTriangle className="mt-0.5 shrink-0" size={20} aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold">{t('edit.deactivate.warningTitle')}</p>
            <p className="mt-1 text-sm leading-relaxed">
              <Trans
                t={t}
                i18nKey="edit.deactivate.warningBody"
                values={{ code: participant.external_code }}
                components={{ strong: <strong /> }}
              />
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <ImpactItem title={t('edit.deactivate.existingData')} description={t('edit.deactivate.existingDataDetail')} />
          <ImpactItem title={t('edit.deactivate.previousSessions')} description={t('edit.deactivate.previousSessionsDetail')} />
          <ImpactItem title={t('edit.deactivate.newCollections')} description={t('edit.deactivate.newCollectionsDetail')} warning />
        </div>

        <Field
          label={t('edit.deactivate.reason')}
          htmlFor={`participant-deactivation-reason-${participant.id}`}
          hint={t('edit.deactivate.reasonHint', { count: reason.trim().length })}
        >
          <textarea
            id={`participant-deactivation-reason-${participant.id}`}
            required
            minLength={10}
            maxLength={500}
            rows={5}
            autoFocus
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder={t('edit.deactivate.reasonPlaceholder')}
            className={cn(fieldClassName, 'h-auto min-h-28 resize-y py-3')}
          />
        </Field>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-surface-muted/60 p-4">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => onConfirmedChange(event.target.checked)}
            className="mt-1 size-4 rounded accent-red-600"
          />
          <span>
            <span className="block text-sm font-semibold text-text-primary">{t('edit.deactivate.confirm')}</span>
            <span className="mt-1 block text-xs leading-relaxed text-text-secondary">
              {t('edit.deactivate.confirmDetail')}
            </span>
          </span>
        </label>

        {error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            {t('edit.deactivate.failed', { message: error.message })}
          </p>
        )}
      </div>

      <DialogFooter className="mt-0 flex-row items-center justify-end gap-2 border-t border-border bg-surface px-5 py-4 sm:px-7">
        <ActionButton type="button" variant="ghost" onClick={onCancel}>
          {t('edit.deactivate.back')}
        </ActionButton>
        <button
          type="button"
          disabled={pending || !canSubmit}
          onClick={onConfirm}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:pointer-events-none disabled:opacity-50"
        >
          <UserRoundX size={16} aria-hidden="true" />
          {pending ? t('edit.deactivate.submitting') : t('edit.deactivate.submit')}
        </button>
      </DialogFooter>
    </div>
  );
}

const fieldClassName = 'h-10 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-text-primary outline-none transition placeholder:text-text-disabled focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-surface-muted dark:focus:ring-blue-950';

function FormSection({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-xl border border-border bg-surface p-4 sm:p-5">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">{eyebrow}</p>
        <h3 className="mt-1 text-base font-semibold text-text-primary">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-text-secondary">{description}</p>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-text-primary">{label}</label>
      {children}
      {hint && <p className="text-xs leading-relaxed text-text-muted">{hint}</p>}
    </div>
  );
}

function ConsentCard({
  checked,
  label,
  description,
  onChange,
}: {
  checked: boolean;
  label: string;
  description: string;
  onChange: () => void;
}) {
  return (
    <label className={cn(
      'flex cursor-pointer gap-2 rounded-xl border p-3 transition',
      checked
        ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500 dark:bg-blue-950/30'
        : 'border-border bg-surface hover:border-border-strong',
    )}>
      <input
        type="radio"
        name="participant-edit-consent"
        checked={checked}
        onChange={onChange}
        className="mt-1 accent-blue-600"
      />
      <span>
        <span className="block text-sm font-semibold text-text-primary">{label}</span>
        <span className="mt-0.5 block text-xs text-text-secondary">{description}</span>
      </span>
    </label>
  );
}

function Attestation({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 size-4 rounded accent-blue-600"
      />
      <span>
        <span className="block text-sm font-semibold text-text-primary">{label}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-text-secondary">{description}</span>
      </span>
    </label>
  );
}

function StatusPill({ active, label }: { active: boolean; label: string }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
      active
        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
        : 'bg-surface-muted text-text-secondary dark:bg-slate-800 dark:text-text-disabled',
    )}>
      {active ? <CheckCircle2 size={13} aria-hidden="true" /> : <UserRoundX size={13} aria-hidden="true" />}
      {label}
    </span>
  );
}

function ImpactItem({
  title,
  description,
  warning = false,
}: {
  title: string;
  description: string;
  warning?: boolean;
}) {
  return (
    <div className={cn(
      'rounded-xl border p-3',
      warning ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30' : 'border-border bg-surface-muted/60',
    )}>
      <p className={cn('text-xs font-semibold', warning ? 'text-red-800 dark:text-red-200' : 'text-text-primary')}>{title}</p>
      <p className={cn('mt-1 text-xs', warning ? 'text-red-700 dark:text-red-300' : 'text-text-secondary')}>{description}</p>
    </div>
  );
}

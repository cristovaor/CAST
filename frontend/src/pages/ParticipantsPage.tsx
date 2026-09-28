import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import i18n from '@/i18n';
import { translate } from '@/i18n/labels';
import { useLocale } from '@/i18n/useLocale';
import { toast } from '@/app/stores/useToastStore';
import { useEffect, useMemo, useState } from 'react';
import { CirclePause, Clipboard, History, Pencil, Plus, ShieldAlert, ShieldCheck, Trash2, UserCheck, Users } from 'lucide-react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ListFilterBar } from '@/components/data-display/ListFilterBar';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { PageHeader } from '@/components/layout/PageHeader';
import { CreateParticipantDialog } from '@/features/participants/CreateParticipantDialog';
import { EditParticipantDialog } from '@/features/participants/EditParticipantDialog';
import { EntityHistoryDialog } from '@/features/audit/EntityHistoryDialog';
import { DeleteEntityDialog } from '@/features/deletion/DeleteEntityDialog';
import { useMe } from '@/features/auth/useAuth';
import { useParticipants } from '@/features/participants/useParticipants';
import { useStudies } from '@/features/studies/useStudies';
import { cn } from '@/lib/utils';
import type { Participant } from '@/types/domain';

export function ParticipantsPage() {
  const { t } = useTranslation('participants');
  const locale = useLocale();
  const { studyId: routeStudyId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    data: participantsData,
    isLoading,
    isError,
    refetch,
  } = useParticipants();
  const { data: studies = [] } = useStudies();
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '');
  const [consentStatus, setConsentStatus] = useState(() => searchParams.get('consent') ?? '');
  const [activityStatus, setActivityStatus] = useState(() => searchParams.get('status') ?? '');
  const [selectedStudyId, setSelectedStudyId] = useState(() => searchParams.get('study') ?? '');
  const [sort, setSort] = useState(() => searchParams.get('sort') ?? '');
  const participants = useMemo(() => participantsData?.items ?? [], [participantsData?.items]);
  const studyId = routeStudyId ?? selectedStudyId;

  const studyNames = useMemo(
    () => new Map(studies.map((study) => [study.id, study.name])),
    [studies],
  );

  const filteredParticipants = useMemo(() => {
    const term = search.trim().toLocaleLowerCase(locale);
    return participants.filter((participant) => {
      const matchesSearch = !term || [
        participant.external_code,
        participant.id,
        studyNames.get(participant.study_id),
        participant.demographic_group ? JSON.stringify(participant.demographic_group) : '',
      ].some((value) => value?.toLocaleLowerCase(locale).includes(term));
      const matchesStudy = !studyId || participant.study_id === studyId;
      const matchesConsent = !consentStatus || participant.consent_status === consentStatus;
      const matchesActivity = !activityStatus
        || (activityStatus === 'active' ? participant.is_active : !participant.is_active);
      return matchesSearch && matchesStudy && matchesConsent && matchesActivity;
    }).sort((a, b) => {
      if (sort === 'code') return a.external_code.localeCompare(b.external_code, locale);
      if (sort === 'oldest') return Date.parse(a.created_at) - Date.parse(b.created_at);
      return Date.parse(b.created_at) - Date.parse(a.created_at);
    });
  }, [activityStatus, consentStatus, locale, participants, search, sort, studyId, studyNames]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (search) next.set('q', search);
    if (!routeStudyId && selectedStudyId) next.set('study', selectedStudyId);
    if (consentStatus) next.set('consent', consentStatus);
    if (activityStatus) next.set('status', activityStatus);
    if (sort) next.set('sort', sort);
    setSearchParams(next, { replace: true });
  }, [activityStatus, consentStatus, routeStudyId, search, selectedStudyId, setSearchParams, sort]);

  const consentCounts = useMemo(() => ({
    accepted: participants.filter((participant) => participant.consent_status === 'accepted').length,
    pending: participants.filter((participant) => participant.consent_status === 'pending').length,
    active: participants.filter((participant) => participant.is_active).length,
    inactive: participants.filter((participant) => !participant.is_active).length,
  }), [participants]);

  return (
    <div className="min-h-full">
      <PageHeader
        title={t('list.title')}
        description={t('list.description')}
        actions={
          <CreateParticipantDialog>
            <button className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700">
              <Plus size={16} aria-hidden="true" />
              {t('list.register')}
            </button>
          </CreateParticipantDialog>
        }
      />

      <div className="space-y-4 p-4 sm:p-6">
        {isLoading ? (
          <LoadingState variant="skeleton-table" message={t('list.loading')} />
        ) : isError ? (
          <ErrorState
            title={t('list.loadFailed')}
            message={t('list.loadFailedHint')}
            onRetry={() => { void refetch(); }}
          />
        ) : participants.length === 0 ? (
          <EmptyState
            variant="empty"
            title={t('list.emptyTitle')}
            description={t('list.emptyDescription')}
            icon={<Users size={40} className="text-text-disabled" />}
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <ParticipantMetric icon={Users} label={t('list.metrics.total')} value={participants.length} />
              <ParticipantMetric icon={UserCheck} label={t('list.metrics.active')} value={consentCounts.active} tone="success" />
              <ParticipantMetric icon={CirclePause} label={t('list.metrics.inactive')} value={consentCounts.inactive} />
              <ParticipantMetric icon={ShieldCheck} label={t('list.metrics.accepted')} value={consentCounts.accepted} tone="success" />
              <ParticipantMetric icon={ShieldAlert} label={t('list.metrics.pending')} value={consentCounts.pending} tone="warning" />
            </div>

            <ListFilterBar
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder={t('list.searchPlaceholder')}
              resultCount={filteredParticipants.length}
              totalCount={participants.length}
              resultLabel={t('list.resultSingular')}
              resultLabelPlural={t('list.resultPlural')}
              filters={[
                {
                  id: 'study',
                  label: t('list.filters.study'),
                  value: studyId,
                  onChange: setSelectedStudyId,
                  disabled: !!routeStudyId,
                  options: [
                    { value: '', label: t('list.filters.allStudies') },
                    ...studies.map((study) => ({ value: study.id, label: study.name })),
                  ],
                },
                {
                  id: 'activity',
                  label: t('list.filters.activity'),
                  value: activityStatus,
                  onChange: setActivityStatus,
                  options: [
                    { value: '', label: t('list.filters.allActivity') },
                    { value: 'active', label: t('list.filters.active') },
                    { value: 'inactive', label: t('list.filters.inactive') },
                  ],
                },
                {
                  id: 'consent',
                  label: t('list.filters.consent'),
                  value: consentStatus,
                  onChange: setConsentStatus,
                  options: [
                    { value: '', label: t('list.filters.allConsents') },
                    { value: 'accepted', label: t('list.consent.accepted') },
                    { value: 'pending', label: t('list.consent.pending') },
                    { value: 'revoked', label: t('list.consent.revoked') },
                  ],
                },
                {
                  id: 'sort',
                  label: t('list.filters.sort'),
                  value: sort,
                  onChange: setSort,
                  options: [
                    { value: '', label: t('list.filters.newest') },
                    { value: 'oldest', label: t('list.filters.oldest') },
                    { value: 'code', label: t('list.filters.code') },
                  ],
                },
              ]}
            />

            {filteredParticipants.length === 0 ? (
              <EmptyState
                variant="empty"
                title={t('list.noMatchTitle')}
                description={t('list.noMatchDescription')}
                icon={<Users size={40} className="text-text-disabled" />}
              />
            ) : (
              <>
                <div className="space-y-3 md:hidden">
                  {filteredParticipants.map((participant) => (
                    <article key={participant.id} className="card space-y-4 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{t('list.columns.pseudonymisedCode')}</p>
                          <p className="mt-1 break-words font-semibold text-text-primary">{participant.external_code}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                          <ParticipantStatusBadge active={participant.is_active} />
                          <ConsentBadge status={participant.consent_status} />
                        </div>
                      </div>

                      <dl className="grid grid-cols-1 gap-3 text-sm">
                        {!routeStudyId && (
                          <div>
                            <dt className="text-xs text-text-muted">{t('list.columns.study')}</dt>
                            <dd className="mt-0.5 text-text-secondary">{studyNames.get(participant.study_id) ?? participant.study_id.slice(0, 8)}</dd>
                          </div>
                        )}
                        <div>
                          <dt className="text-xs text-text-muted">{t('list.columns.demographics')}</dt>
                          <dd className="mt-0.5 text-text-secondary">{formatDemographicGroup(participant.demographic_group, t)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-text-muted">{t('list.columns.createdAtShort')}</dt>
                          <dd className="mt-0.5 text-text-secondary">{formatDate(participant.created_at, locale)}</dd>
                        </div>
                      </dl>

                      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                        <CopyCodeButton code={participant.external_code} />
                        <ParticipantActions participant={participant} labeled />
                      </div>
                    </article>
                  ))}
                </div>

                <div className="card hidden overflow-x-auto md:block">
                  <table className="min-w-[920px] w-full text-left text-sm text-text-secondary">
                    <thead className="border-b border-border bg-surface-muted font-medium text-text-secondary">
                      <tr>
                        <th scope="col" className="px-6 py-3">{t('list.columns.code')}</th>
                        {!routeStudyId && <th scope="col" className="px-6 py-3">{t('list.columns.study')}</th>}
                        <th scope="col" className="px-6 py-3">{t('list.columns.demographics')}</th>
                        <th scope="col" className="px-6 py-3">{t('list.columns.status')}</th>
                        <th scope="col" className="px-6 py-3">{t('list.columns.consent')}</th>
                        <th scope="col" className="px-6 py-3">{t('list.columns.createdAt')}</th>
                        <th scope="col" className="px-6 py-3 text-right">{t('list.columns.actions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredParticipants.map((participant) => (
                        <tr
                          key={participant.id}
                          className={cn(
                            'transition-colors hover:bg-surface-hover',
                            !participant.is_active && 'bg-surface-muted/50',
                          )}
                        >
                          <td className="px-6 py-4 font-medium text-text-primary">
                            <div className="flex items-center gap-1.5">
                              <span>{participant.external_code}</span>
                              <CopyCodeButton code={participant.external_code} compact />
                            </div>
                          </td>
                          {!routeStudyId && (
                            <td className="px-6 py-4">
                              {studyNames.get(participant.study_id) ?? participant.study_id.slice(0, 8)}
                            </td>
                          )}
                          <td className="max-w-xs px-6 py-4">{formatDemographicGroup(participant.demographic_group, t)}</td>
                          <td className="px-6 py-4"><ParticipantStatusBadge active={participant.is_active} /></td>
                          <td className="px-6 py-4"><ConsentBadge status={participant.consent_status} /></td>
                          <td className="px-6 py-4">{formatDate(participant.created_at, locale)}</td>
                          <td className="px-6 py-4"><ParticipantActions participant={participant} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ParticipantMetric({
  icon: Icon,
  label,
  value,
  tone = 'default',
}: {
  icon: typeof Users;
  label: string;
  value: number;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const toneClass = {
    default: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
    success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
    warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
    danger: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300',
  }[tone];

  return (
    <div className="card flex items-center gap-3 p-3 sm:p-4">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${toneClass}`}>
        <Icon size={17} aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-xl font-semibold text-text-primary">{value}</p>
        <p className="truncate text-xs text-text-muted">{label}</p>
      </div>
    </div>
  );
}

function ConsentBadge({ status }: { status: Participant['consent_status'] }) {
  const { t } = useTranslation('participants');
  const className = {
    accepted: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    pending: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    revoked: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  }[status];

  return (
    <span className={`inline-flex shrink-0 rounded-full px-2 py-1 text-xs font-medium ${className}`}>
      {t(`list.consent.${status}`)}
    </span>
  );
}

function ParticipantStatusBadge({ active }: { active: boolean }) {
  const { t } = useTranslation('participants');
  return (
    <span className={cn(
      'inline-flex shrink-0 rounded-full px-2 py-1 text-xs font-medium',
      active
        ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
        : 'bg-surface-muted text-text-secondary dark:bg-slate-800 dark:text-text-disabled',
    )}>
      {active ? t('list.active') : t('list.inactive')}
    </span>
  );
}

function ParticipantActions({ participant, labeled = false }: { participant: Participant; labeled?: boolean }) {
  const { t } = useTranslation('participants');
  const isAdmin = useMe().data?.role === 'admin';
  const buttonClass = labeled
    ? 'inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-text-secondary transition hover:bg-surface-muted hover:text-text-primary'
    : 'inline-flex h-10 w-10 items-center justify-center rounded-lg text-text-secondary transition hover:bg-surface-muted hover:text-text-primary';

  return (
    <div className={`flex items-center gap-1 ${labeled ? 'flex-wrap' : 'justify-end'}`}>
      <EditParticipantDialog participant={participant}>
        <button type="button" aria-label={t('list.edit')} title={t('list.edit')} className={buttonClass}>
          <Pencil size={16} aria-hidden="true" />
          {labeled && (participant.consent_status === 'pending' ? t('list.reviewConsent') : t('list.editShort'))}
        </button>
      </EditParticipantDialog>
      <EntityHistoryDialog
        entityType="participant"
        entityId={participant.id}
        title={t('list.historyOf', { code: participant.external_code })}
      >
        <button type="button" aria-label={t('list.history')} title={t('list.history')} className={buttonClass}>
          <History size={16} aria-hidden="true" />
          {labeled && t('list.historyShort')}
        </button>
      </EntityHistoryDialog>
      {isAdmin && (
        <DeleteEntityDialog entityType="participant" entityId={participant.id}>
          <button
            type="button"
            aria-label={t('list.delete')}
            title={t('list.delete')}
            className={`${buttonClass} hover:text-red-600 dark:hover:text-red-400`}
          >
            <Trash2 size={16} aria-hidden="true" />
            {labeled && t('list.deleteShort')}
          </button>
        </DeleteEntityDialog>
      )}
    </div>
  );
}

function CopyCodeButton({ code, compact = false }: { code: string; compact?: boolean }) {
  const { t } = useTranslation('participants');
  return (
    <button
      type="button"
      aria-label={t('list.copyCode', { code })}
      title={t('list.copy')}
      onClick={() => {
        void navigator.clipboard.writeText(code).then(() => toast.success(t('list.copied'), code));
      }}
      className={compact
        ? 'inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition hover:bg-surface-muted hover:text-text-primary'
        : 'inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-text-secondary transition hover:bg-surface-muted hover:text-text-primary'}
    >
      <Clipboard size={15} aria-hidden="true" />
      {!compact && t('list.copy')}
    </button>
  );
}

// Known profile fields get their translated label and option name; anything
// else (legacy free-form keys) is humanised. Nested objects such as the
// enrolment attestations are bookkeeping, not demographics, so they are left out.
const PROFILE_FIELDS: Record<string, { label: string; options?: string }> = {
  cohort: { label: 'profile.cohort' },
  grupo: { label: 'profile.cohort' },
  age_range: { label: 'profile.ageRange', options: 'profile.ageRanges' },
  gender: { label: 'profile.gender', options: 'profile.genders' },
  education_level: { label: 'profile.education', options: 'profile.educationLevels' },
  handedness: { label: 'profile.handedness', options: 'profile.handednessOptions' },
  recruitment_source: { label: 'profile.recruitment' },
};

function formatDemographicGroup(group: Record<string, unknown> | undefined, t: TFunction<'participants'>) {
  const entries = Object.entries(group ?? {}).filter(
    ([, value]) => value !== null && value !== '' && typeof value !== 'object',
  );
  if (entries.length === 0) return t('list.notInformed');
  return entries
    .map(([key, value]) => {
      const field = PROFILE_FIELDS[key];
      const raw = String(value);
      const optionKey = field?.options ? `participants:${field.options}.${raw}` : '';
      const label = field ? translate(`participants:${field.label}`) : humanizeKey(key);
      const shown = optionKey && i18n.exists(optionKey) ? translate(optionKey) : raw;
      return `${label}: ${shown}`;
    })
    .join(' · ');
}

function humanizeKey(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

function formatDate(value: string, locale: string) {
  return new Date(value).toLocaleDateString(locale);
}

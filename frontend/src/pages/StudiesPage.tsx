import { useTranslation } from 'react-i18next';
import { useLocale } from '@/i18n/useLocale';
import { statusLabel } from '@/lib/formatters';
import { useEffect, useMemo, useState } from 'react';
import { Activity, CalendarClock, CheckCircle2, FlaskConical, Plus, Users, Video } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { ListFilterBar } from '@/components/data-display/ListFilterBar';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useProjects } from '@/features/projects/useProjects';
import { useStudies } from '@/features/studies/useStudies';
import type { Study } from '@/types/domain';
import { EXPERIMENTAL_DESIGNS, MODALITIES } from '@/types/research';

const designLabel = (value: string) =>
  EXPERIMENTAL_DESIGNS.find((design) => design.value === value)?.label;
const modalityLabel = (value: string) =>
  MODALITIES.find((modality) => modality.value === value)?.label ?? value;

export function StudiesPage() {
  const { t } = useTranslation('studies');
  const locale = useLocale();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    data: studies = [],
    isLoading,
    isError,
    refetch,
  } = useStudies();
  const { data: projects = [] } = useProjects();
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '');
  const [projectId, setProjectId] = useState(() => searchParams.get('project') ?? '');
  const [status, setStatus] = useState(() => searchParams.get('status') ?? '');
  const [modality, setModality] = useState(() => searchParams.get('modality') ?? '');
  const [sort, setSort] = useState(() => searchParams.get('sort') ?? '');

  const filteredStudies = useMemo(() => {
    const term = search.trim().toLocaleLowerCase(locale);
    return studies.filter((study) => {
      const matchesSearch = !term || [
        study.name,
        study.description,
        study.config?.researchQuestion,
        study.config?.program,
        study.config?.responsible,
      ].some((value) => value?.toLocaleLowerCase(locale).includes(term));
      const matchesProject = !projectId || study.project_id === projectId;
      const matchesStatus = !status || study.status === status;
      const matchesModality = !modality || study.config?.modalities?.includes(modality);
      return matchesSearch && matchesProject && matchesStatus && matchesModality;
    }).sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, locale);
      if (sort === 'oldest') return Date.parse(a.created_at) - Date.parse(b.created_at);
      return Date.parse(b.created_at) - Date.parse(a.created_at);
    });
  }, [locale, modality, projectId, search, sort, status, studies]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (search) next.set('q', search);
    if (projectId) next.set('project', projectId);
    if (status) next.set('status', status);
    if (modality) next.set('modality', modality);
    if (sort) next.set('sort', sort);
    setSearchParams(next, { replace: true });
  }, [modality, projectId, search, setSearchParams, sort, status]);

  const activeStudies = studies.filter((study) => study.status === 'active').length;
  const totalParticipants = studies.reduce((total, study) => total + (study.participant_count ?? 0), 0);
  const totalSessions = studies.reduce((total, study) => total + (study.session_count ?? 0), 0);

  return (
    <div className="min-h-full">
      <PageHeader
        title={t('list.title')}
        description={t('list.description')}
        actions={
          <Link
            to="/app/studies/new"
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            <Plus size={16} aria-hidden="true" />
            {t('list.newStudy')}
          </Link>
        }
      />

      <div className="space-y-4 p-4 sm:p-6">
        {isLoading ? (
          <LoadingState variant="skeleton-cards" rows={3} />
        ) : isError ? (
          <ErrorState
            title={t('list.loadFailed')}
            message={t('list.loadFailedHint')}
            onRetry={() => { void refetch(); }}
          />
        ) : studies.length === 0 ? (
          <EmptyState
            variant="empty"
            title={t('list.emptyTitle')}
            description={t('list.emptyDescription')}
            icon={<FlaskConical size={40} className="text-text-disabled" />}
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StudyMetric icon={FlaskConical} label={t('list.metrics.studies')} value={studies.length} />
              <StudyMetric icon={CheckCircle2} label={t('list.metrics.active')} value={activeStudies} tone="success" />
              <StudyMetric icon={Users} label={t('list.metrics.participants')} value={totalParticipants} tone="info" />
              <StudyMetric icon={CalendarClock} label={t('list.metrics.sessions')} value={totalSessions} tone="accent" />
            </div>

            <ListFilterBar
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder={t('list.searchPlaceholder')}
              resultCount={filteredStudies.length}
              totalCount={studies.length}
              resultLabel={t('list.resultSingular')}
              resultLabelPlural={t('list.resultPlural')}
              filters={[
                {
                  id: 'project',
                  label: t('list.filters.project'),
                  value: projectId,
                  onChange: setProjectId,
                  options: [
                    { value: '', label: t('list.filters.allProjects') },
                    ...projects.map((project) => ({ value: project.id, label: project.name })),
                  ],
                },
                {
                  id: 'status',
                  label: t('list.filters.status'),
                  value: status,
                  onChange: setStatus,
                  options: [
                    { value: '', label: t('list.filters.allStatuses') },
                    { value: 'draft', label: statusLabel('draft') },
                    { value: 'active', label: statusLabel('active') },
                    { value: 'completed', label: statusLabel('completed') },
                    { value: 'archived', label: statusLabel('archived') },
                  ],
                },
                {
                  id: 'modality',
                  label: t('list.filters.modality'),
                  value: modality,
                  onChange: setModality,
                  options: [
                    { value: '', label: t('list.filters.allModalities') },
                    ...MODALITIES.map((item) => ({ value: item.value, label: item.label })),
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
                    { value: 'name', label: t('list.filters.name') },
                  ],
                },
              ]}
            />

            {filteredStudies.length === 0 ? (
              <EmptyState
                variant="empty"
                title={t('list.noMatchTitle')}
                description={t('list.noMatchDescription')}
                icon={<FlaskConical size={40} className="text-text-disabled" />}
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredStudies.map((study) => (
                  <StudyCard key={study.id} study={study} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StudyCard({ study }: { study: Study }) {
  const { t } = useTranslation('studies');
  const config = study.config;
  const design = config?.design ? designLabel(config.design) : undefined;
  const modalities = config?.modalities ?? [];

  return (
    <Link
      to={`/app/studies/${study.id}/overview`}
      className="card card-hover flex flex-col p-5"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="line-clamp-1 font-semibold text-text-primary">{study.name}</h3>
        <StatusBadge status={study.status || 'draft'} />
      </div>

      {config?.researchQuestion ? (
        <p className="line-clamp-2 min-h-[40px] text-sm text-text-secondary">{config.researchQuestion}</p>
      ) : (
        <p className="line-clamp-2 min-h-[40px] text-sm text-text-muted">{study.description || t('list.noDescription')}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {design && (
          <span className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-muted px-1.5 py-0.5 text-[10.5px] font-medium text-text-secondary">
            <FlaskConical size={11} /> {design}
          </span>
        )}
        {modalities.includes('video') && (
          <span className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10.5px] font-medium text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
            <Video size={11} aria-hidden="true" /> {modalityLabel('video')}
          </span>
        )}
        {modalities.includes('eeg') && (
          <span className="inline-flex items-center gap-1 rounded-md border border-cyan-200 bg-cyan-50 px-1.5 py-0.5 text-[10.5px] font-medium text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/40 dark:text-cyan-300">
            <Activity size={11} aria-hidden="true" /> EEG
          </span>
        )}
        {modalities.filter((item) => item !== 'video' && item !== 'eeg').slice(0, 2).map((item) => (
          <span key={item} className="rounded-md border border-border bg-surface-muted px-1.5 py-0.5 text-[10.5px] font-medium text-text-secondary">
            {modalityLabel(item)}
          </span>
        ))}
      </div>

      {config?.responsible && (
        <p className="mt-3 text-xs text-text-muted">
          {t('list.responsible')} <span className="font-medium text-text-secondary">{config.responsible}</span>
        </p>
      )}

      <StudyReadiness study={study} />

      <div className="mt-4 flex items-center gap-4 border-t border-border pt-3 text-[11px] text-text-muted">
        <span className="inline-flex items-center gap-1"><Users size={12} aria-hidden="true" /> {t('list.participants', { count: study.participant_count ?? 0 })}</span>
        <span className="inline-flex items-center gap-1"><CalendarClock size={12} aria-hidden="true" /> {t('list.sessions', { count: study.session_count ?? 0 })}</span>
      </div>
    </Link>
  );
}

function StudyMetric({
  icon: Icon,
  label,
  value,
  tone = 'default',
}: {
  icon: typeof FlaskConical;
  label: string;
  value: number;
  tone?: 'default' | 'success' | 'info' | 'accent';
}) {
  const toneClass = {
    default: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
    success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
    info: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300',
    accent: 'bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300',
  }[tone];

  return (
    <div className="card flex items-center gap-3 p-3 sm:p-4">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${toneClass}`}>
        <Icon size={17} />
      </div>
      <div className="min-w-0">
        <p className="text-xl font-semibold text-text-primary">{value}</p>
        <p className="truncate text-xs text-text-muted">{label}</p>
      </div>
    </div>
  );
}

function StudyReadiness({ study }: { study: Study }) {
  const { t } = useTranslation('studies');
  const config = study.config;
  const checks = [
    !!config?.researchQuestion,
    !!config?.design,
    !!config?.modalities?.length,
    !!config?.responsible,
  ];
  const completed = checks.filter(Boolean).length;
  const percent = Math.round((completed / checks.length) * 100);

  return (
    <div className="mt-4" aria-label={t('list.readinessLabel', { percent })}>
      <div className="mb-1.5 flex items-center justify-between text-[11px]">
        <span className="text-text-muted">{t('list.readiness')}</span>
        <span className="font-medium text-text-secondary">{percent}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
        <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

import { NavLink, Outlet, useLocation, useNavigate, useParams, Link } from 'react-router-dom';
import {
  CalendarClock,
  ChevronRight,
  History,
  Pencil,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStudy } from '@/features/studies/useStudies';
import { useProject } from '@/features/projects/useProjects';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EditStudyDialog } from '@/features/studies/EditStudyDialog';
import { EntityHistoryDialog } from '@/features/audit/EntityHistoryDialog';
import { EXPERIMENTAL_DESIGNS, MODALITIES } from '@/types/research';
import { useTranslation } from 'react-i18next';
import { useLocale } from '@/i18n/useLocale';

// Contextual navigation inside a study (docs §6). The study header is loaded
// here so every nested page shares the same source of truth.
export function StudyLayout() {
  const { studyId } = useParams();
  const { t } = useTranslation('studies');
  const locale = useLocale();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    data: study,
    isLoading: isLoadingStudy,
    isError: isStudyError,
  } = useStudy(studyId ?? '');
  const {
    data: project,
    isLoading: isLoadingProject,
  } = useProject(study?.project_id ?? '');
  const base = `/app/studies/${studyId}`;

  const navGroups = [
    { title: t('layout.groups.planning'), items: [
      { name: t('layout.sections.overview'), path: `${base}/overview` },
      { name: t('layout.sections.protocol'), path: `${base}/protocol` },
      { name: t('layout.sections.hypotheses'), path: `${base}/hypotheses` },
      { name: t('layout.sections.conditions'), path: `${base}/conditions` },
      { name: t('layout.sections.variables'), path: `${base}/variables` },
    ] },
    { title: t('layout.groups.collection'), items: [
      { name: t('layout.sections.participants'), path: `${base}/participants` },
      { name: t('layout.sections.sessions'), path: `${base}/sessions` },
      { name: t('layout.sections.sync'), path: `${base}/sync` },
    ] },
    { title: t('layout.groups.results'), items: [
      { name: t('layout.sections.quality'), path: `${base}/quality` },
      { name: t('layout.sections.analysis'), path: `${base}/analysis` },
      { name: t('layout.sections.datasets'), path: `${base}/datasets` },
    ] },
    { title: t('layout.groups.management'), items: [
      { name: t('layout.sections.settings'), path: `${base}/settings` },
    ] },
  ];

  if (isLoadingStudy) {
    return (
      <div className="flex min-h-[320px] items-center justify-center bg-app-bg">
        <div
          className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-blue-600"
          role="status"
          aria-label={t('layout.loading')}
        />
      </div>
    );
  }

  if (isStudyError || !study) {
    return (
      <div className="min-h-full bg-app-bg px-6 py-12">
        <div className="mx-auto max-w-lg rounded-xl border border-border bg-surface p-8 text-center">
          <h1 className="text-xl font-semibold text-text-primary">{t('layout.notFound.title')}</h1>
          <p className="mt-2 text-sm text-text-muted">
            {t('layout.notFound.description')}
          </p>
          <Link
            to="/app/studies"
            className="mt-5 inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            {t('layout.notFound.back')}
          </Link>
        </div>
      </div>
    );
  }

  const designLabel = study.config?.design
    ? EXPERIMENTAL_DESIGNS.find((design) => design.value === study.config?.design)?.label
      ?? study.config.design
    : undefined;
  const modalityLabels = (study.config?.modalities ?? []).map(
    (modality) => MODALITIES.find((option) => option.value === modality)?.label ?? modality,
  );
  const scientificDetails = [
    designLabel ? t('layout.design', { design: designLabel.toLocaleLowerCase(locale) }) : undefined,
    modalityLabels.length > 0 ? modalityLabels.join(' + ') : undefined,
    study.protocol_version ? t('layout.protocol', { version: study.protocol_version }) : undefined,
  ].filter((detail): detail is string => Boolean(detail));
  const studySummary = scientificDetails.length > 0
    ? scientificDetails.join(' · ')
    : study.description?.trim() || t('layout.noDescription');

  const projectLabel = project?.name
    ?? (isLoadingProject ? t('layout.loadingProject') : t('layout.projectNotFound'));

  return (
    <div className="min-h-full bg-app-bg">
      <div className="border-b border-border bg-surface px-6 pt-5">
        <nav
          className="mb-3 flex items-center gap-1.5 text-[12px] text-text-muted"
          aria-label={t('layout.breadcrumb')}
        >
          <Link to="/app/projects" className="hover:text-text-secondary">{t('layout.projects')}</Link>
          <ChevronRight size={12} aria-hidden="true" />
          {project ? (
            <Link
              to={`/app/projects/${project.id}`}
              className="hover:text-text-secondary"
            >
              {project.name}
            </Link>
          ) : (
            <span>{projectLabel}</span>
          )}
          <ChevronRight size={12} aria-hidden="true" />
          <span className="font-medium text-text-secondary">{study.name}</span>
        </nav>

        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-bold tracking-tight text-text-primary">
                {study.name}
              </h1>
              <StatusBadge status={study.status} />
            </div>
            <p className="mt-0.5 text-sm text-text-muted">
              {studySummary} · ID {study.id}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[12px] text-text-muted lg:justify-end">
            <span className="mr-2 inline-flex items-center gap-1">
              <Users size={13} aria-hidden="true" />
              {t('layout.participantCount', { count: study.participant_count ?? 0 })}
            </span>
            <span className="mr-2 inline-flex items-center gap-1">
              <CalendarClock size={13} aria-hidden="true" />
              {t('layout.sessionCount', { count: study.session_count ?? 0 })}
            </span>
            <EntityHistoryDialog
              entityType="study"
              entityId={study.id}
              title={t('layout.historyOf', { name: study.name })}
            >
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-secondary transition hover:bg-surface-hover"
              >
                <History size={14} aria-hidden="true" />
                {t('layout.history')}
              </button>
            </EntityHistoryDialog>
            <EditStudyDialog study={study}>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                <Pencil size={14} aria-hidden="true" />
                {t('layout.edit')}
              </button>
            </EditStudyDialog>
          </div>
        </div>

        <div className="mt-5 border-t border-border py-3 md:hidden">
          <label htmlFor="study-section" className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{t('layout.area')}</label>
          <select
            id="study-section"
            value={location.pathname}
            onChange={(event) => navigate(event.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-text-primary"
          >
            {navGroups.map((group) => (
              <optgroup key={group.title} label={group.title}>
                {group.items.map((item) => <option key={item.path} value={item.path}>{item.name}</option>)}
              </optgroup>
            ))}
          </select>
        </div>

        <nav aria-label={t('layout.areas')} className="mt-5 hidden grid-cols-[1.5fr_1fr_1fr_auto] gap-6 border-t border-border py-3 md:grid">
          {navGroups.map((group) => (
            <div key={group.title}>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted">{group.title}</p>
              <div className="flex flex-wrap gap-1">
                {group.items.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) => cn(
                      'rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors',
                      isActive ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300' : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary',
                    )}
                  >
                    {item.name}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </div>

      <div className="px-6 py-6">
        <Outlet />
      </div>
    </div>
  );
}

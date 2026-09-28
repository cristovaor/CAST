import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Edit2, Download, AlertTriangle, ShieldCheck, History, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { QualityBadge } from '@/components/ui/QualityBadge';
import { MetricCard } from '@/components/data-display/MetricCard';
import { DataTable, type ColumnDef } from '@/components/data-display/DataTable';
import { EmptyState } from '@/components/feedback/EmptyState';
import { cn, scoreToQuality } from '@/lib/utils';
import { formatDate, formatRelativeTime, roleLabel } from '@/lib/formatters';
import { useExportProject, useProject } from '@/features/projects/useProjects';
import { useStudies } from '@/features/studies/useStudies';
import { EditProjectDialog } from '@/features/projects/EditProjectDialog';
import { EntityHistoryDialog } from '@/features/audit/EntityHistoryDialog';
import { DeleteEntityDialog } from '@/features/deletion/DeleteEntityDialog';
import { useMe } from '@/features/auth/useAuth';
import type { Study, KPICardData, Project } from '@/types/domain';

// ─── Tabs ─────────────────────────────────────────────────────

const TABS = ['overview', 'studies'] as const;

// ─── Study table columns ──────────────────────────────────────

function studyColumns(t: TFunction<'projects'>): ColumnDef<Study>[] {
  return [
  {
    key: 'name',
    header: t('detail.studies.columns.study'),
    sortable: true,
    render: (_, row) => (
      <div>
        <div className="text-[13px] font-semibold text-text-primary">{row.name}</div>
        {row.protocol_version && (
          <div className="text-[10px] font-mono text-text-muted mt-0.5">v{row.protocol_version}</div>
        )}
      </div>
    ),
  },
  {
    key: 'status',
    header: t('detail.studies.columns.status'),
    sortable: true,
    render: (_, row) => <StatusBadge status={row.status} size="sm" />,
  },
  {
    key: 'participant_count',
    header: t('detail.studies.columns.participants'),
    align: 'center',
    sortable: true,
    render: (v) => <span className="text-sm font-semibold text-text-primary">{String(v ?? 0)}</span>,
  },
  {
    key: 'session_count',
    header: t('detail.studies.columns.sessions'),
    align: 'center',
    sortable: true,
    render: (v) => <span className="text-sm font-semibold text-text-primary">{String(v ?? 0)}</span>,
  },
  {
    key: 'video_count',
    header: t('detail.studies.columns.videos'),
    align: 'center',
    sortable: true,
    render: (v) => <span className="text-sm font-semibold text-text-primary">{String(v ?? 0)}</span>,
  },
  {
    key: 'average_quality',
    header: t('detail.studies.columns.quality'),
    render: (_, row) => row.average_quality
      ? <QualityBadge level={scoreToQuality(row.average_quality)} score={row.average_quality} size="sm" />
      : <span className="text-xs text-text-muted">—</span>,
  },
  {
    key: 'created_at',
    header: t('detail.studies.columns.createdAt'),
    sortable: true,
    render: (v) => <span className="text-xs text-text-secondary">{formatDate(String(v))}</span>,
  },
  ];
}

// ─── Project Detail Page ──────────────────────────────────────

export function ProjectDetailPage() {
  const { t } = useTranslation('projects');
  const { projectId } = useParams<{ projectId: string }>();
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>('overview');

  const { data: project, isLoading, isError } = useProject(projectId ?? '');
  const { data: studies = [] } = useStudies();
  const exportProject = useExportProject();
  const navigate = useNavigate();
  const isAdmin = useMe().data?.role === 'admin';

  if (isLoading) return <div role="status" className="p-10 text-center text-sm text-text-secondary">{t('detail.loading')}</div>;
  if (isError || !project) return <div role="alert" className="m-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{t('detail.notFound')}</div>;

  const kpis: KPICardData[] = [
    {
      id: 'participants',
      label: t('detail.kpis.participants.label'),
      value: project.session_count ?? 0,
      description: t('detail.kpis.participants.description'),
      icon: 'Users',
      color: 'default',
    },
    {
      id: 'sessions',
      label: t('detail.kpis.sessions.label'),
      value: project.session_count ?? 0,
      description: t('detail.kpis.sessions.description'),
      icon: 'FlaskConical',
      color: 'info',
    },
    {
      id: 'videos',
      label: t('detail.kpis.videos.label'),
      value: project.video_count ?? 0,
      description: t('detail.kpis.videos.description'),
      icon: 'Video',
      color: 'success',
    },
    {
      id: 'quality',
      label: t('detail.kpis.quality.label'),
      value: project.average_quality ? `${Math.round(project.average_quality * 100)}%` : '—',
      description: t('detail.kpis.quality.description'),
      icon: 'ShieldCheck',
      color: project.average_quality && project.average_quality >= 0.85 ? 'success' : 'warning',
    },
  ];

  const tabNav = (
    <div role="tablist" className="flex items-center gap-0.5 overflow-x-auto">
      {TABS.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={activeTab === tab}
          onClick={() => setActiveTab(tab)}
          className={cn(
            'px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px',
            activeTab === tab
              ? 'text-blue-600 border-blue-600 dark:text-blue-400 dark:border-blue-400'
              : 'text-text-secondary border-transparent hover:text-text-primary hover:border-border-strong',
          )}
        >
          {t(`detail.tabs.${tab}`)}
        </button>
      ))}
    </div>
  );

  return (
    <div className="min-h-full bg-app-bg text-text-primary">
      <PageHeader
        title={project.name}
        description={project.description}
        actions={
          <>
            {project.status && <StatusBadge status={project.status} />}
            <EntityHistoryDialog entityType="project" entityId={project.id} title={t('detail.historyOf', { name: project.name })}>
              <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-text-secondary bg-surface border border-border rounded-lg hover:bg-surface-hover transition-colors">
                <History size={14} aria-hidden="true" />
                {t('detail.history')}
              </button>
            </EntityHistoryDialog>
            <button
              onClick={() => exportProject.mutate(project.id)}
              disabled={exportProject.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-text-secondary bg-surface border border-border rounded-lg hover:bg-surface-hover transition-colors disabled:opacity-60"
            >
              <Download size={14} />
              {exportProject.isPending ? t('detail.exporting') : t('detail.export')}
            </button>
            <EditProjectDialog project={project}>
              <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-text-secondary bg-surface border border-border rounded-lg hover:bg-surface-hover transition-colors">
                <Edit2 size={14} aria-hidden="true" />
                {t('detail.edit')}
              </button>
            </EditProjectDialog>
            {isAdmin && (
              <DeleteEntityDialog
                entityType="project"
                entityId={project.id}
                onDeleted={() => navigate('/app/projects', { replace: true })}
              >
                <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 bg-surface border border-red-200 rounded-lg hover:bg-red-50 transition-colors dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40">
                  <Trash2 size={14} aria-hidden="true" />
                  {t('actions.delete')}
                </button>
              </DeleteEntityDialog>
            )}
          </>
        }
        tabs={tabNav}
      />

      <div className="p-6 animate-fade-in">
        {exportProject.isError && (
          <p className="mb-4 text-sm text-red-600 dark:text-red-400" role="alert">
            {t('detail.exportFailed', { message: (exportProject.error as Error).message })}
          </p>
        )}
        {activeTab === 'overview' && (
          <OverviewTab project={project} kpis={kpis} />
        )}
        {activeTab === 'studies' && (
          <StudiesTab
            projectId={project.id}
            studies={studies.filter((study) => study.project_id === project.id)}
          />
        )}
      </div>
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────

function OverviewTab({ project, kpis }: { project: Project; kpis: KPICardData[] }) {
  const { t } = useTranslation('projects');
  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <MetricCard key={kpi.id} data={kpi} />
        ))}
      </div>

      {/* Info + quality alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Project info card */}
        <div className="card p-5 lg:col-span-2 space-y-4">
          <h3 className="text-sm font-semibold text-text-primary">{t('detail.info.title')}</h3>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <InfoItem label={t('detail.info.organization')} value="UFPE" />
            <InfoItem label={t('detail.info.createdAt')} value={formatDate(project.created_at)} />
            <InfoItem label={t('detail.info.lastActivity')} value={project.last_activity ? formatRelativeTime(project.last_activity) : '—'} />
            <InfoItem label={t('detail.info.responsible')} value={(project.responsible ?? []).map((u) => u.name).join(', ')} />
          </dl>

          {(project.responsible ?? []).length > 0 && (
            <div className="pt-3 border-t border-border">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-2">
                {t('detail.info.team')}
              </div>
              <div className="flex flex-col gap-2">
                {(project.responsible ?? []).map((user) => (
                  <div key={user.id} className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                      {user.avatar_url
                        ? <img src={user.avatar_url} alt={user.name} className="w-full h-full rounded-full" />
                        : <span className="text-[9px] font-bold text-blue-700">{user.name.slice(0, 2).toUpperCase()}</span>
                      }
                    </div>
                    <div>
                      <div className="text-[12px] font-medium text-text-primary">{user.name}</div>
                      <div className="text-[10px] text-text-muted">{roleLabel(user.role)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Quality alerts */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-4">{t('detail.quality.title')}</h3>
          {project.average_quality && project.average_quality >= 0.90 ? (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-50 border border-emerald-100 dark:bg-emerald-950/40 dark:border-emerald-900">
              <ShieldCheck size={16} className="text-emerald-600 shrink-0 mt-0.5 dark:text-emerald-400" aria-hidden="true" />
              <div>
                <div className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">{t('detail.quality.excellent')}</div>
                <div className="text-xs text-emerald-600 mt-0.5 dark:text-emerald-400">
                  {t('detail.quality.excellentDetail')}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-100 dark:bg-amber-950/40 dark:border-amber-900">
              <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5 dark:text-amber-400" aria-hidden="true" />
              <div>
                <div className="text-sm font-semibold text-amber-700 dark:text-amber-300">{t('detail.quality.moderate')}</div>
                <div className="text-xs text-amber-600 mt-0.5 dark:text-amber-400">
                  {t('detail.quality.moderateDetail')}
                </div>
              </div>
            </div>
          )}

          <div className="mt-4 space-y-2">
            <ConsentBar label={t('detail.quality.accepted')} value={85} color="bg-emerald-500" />
            <ConsentBar label={t('detail.quality.pending')}  value={10} color="bg-amber-500" />
            <ConsentBar label={t('detail.quality.revoked')}  value={5}  color="bg-red-400" />
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-0.5">{label}</dt>
      <dd className="text-sm text-text-primary font-medium">{value || '—'}</dd>
    </div>
  );
}

function ConsentBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-[11px] mb-1">
        <span className="text-text-secondary">{label}</span>
        <span className="font-semibold text-text-primary">{value}%</span>
      </div>
      <div className="h-1.5 bg-surface-muted rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

// ─── Studies Tab ──────────────────────────────────────────────

function StudiesTab({ studies, projectId }: { studies: Study[]; projectId: string }) {
  const { t } = useTranslation('projects');
  const navigate = useNavigate();
  const newStudyPath = `/app/studies/new?projectId=${encodeURIComponent(projectId)}`;

  if (studies.length === 0) {
    return (
      <EmptyState
        variant="empty"
        title={t('detail.studies.emptyTitle')}
        description={t('detail.studies.emptyDescription')}
        action={{ label: t('detail.studies.newStudy'), onClick: () => navigate(newStudyPath) }}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => navigate(newStudyPath)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {t('detail.studies.newStudy')}
        </button>
      </div>
      <div className="card overflow-hidden">
        <DataTable
          columns={studyColumns(t)}
          data={studies}
          onRowClick={(row) => navigate(`/app/studies/${row.id}/overview`)}
          rowActions={(row) => [
            { label: t('detail.studies.open'), onClick: () => navigate(`/app/studies/${row.id}/overview`) },
          ]}
        />
      </div>
    </div>
  );
}

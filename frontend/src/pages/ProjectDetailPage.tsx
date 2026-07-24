import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Edit2, Download, AlertTriangle, ShieldCheck, History } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { QualityBadge } from '@/components/ui/QualityBadge';
import { MetricCard } from '@/components/data-display/MetricCard';
import { DataTable, type ColumnDef } from '@/components/data-display/DataTable';
import { EmptyState } from '@/components/feedback/EmptyState';
import { cn, scoreToQuality } from '@/lib/utils';
import { formatDate, formatRelativeTime } from '@/lib/formatters';
import { useExportProject, useProject } from '@/features/projects/useProjects';
import { useStudies } from '@/features/studies/useStudies';
import { EditProjectDialog } from '@/features/projects/EditProjectDialog';
import { EntityHistoryDialog } from '@/features/audit/EntityHistoryDialog';
import type { Study, KPICardData, Project } from '@/types/domain';

// ─── Tabs ─────────────────────────────────────────────────────

const TABS = [
  { key: 'overview',       label: 'Visão Geral' },
  { key: 'studies',        label: 'Estudos' },
];

// ─── Study table columns ──────────────────────────────────────

const STUDY_COLUMNS: ColumnDef<Study>[] = [
  {
    key: 'name',
    header: 'Estudo',
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
    header: 'Status',
    sortable: true,
    render: (_, row) => <StatusBadge status={row.status} size="sm" />,
  },
  {
    key: 'participant_count',
    header: 'Participantes',
    align: 'center',
    sortable: true,
    render: (v) => <span className="text-sm font-semibold text-text-primary">{String(v ?? 0)}</span>,
  },
  {
    key: 'session_count',
    header: 'Sessões',
    align: 'center',
    sortable: true,
    render: (v) => <span className="text-sm font-semibold text-text-primary">{String(v ?? 0)}</span>,
  },
  {
    key: 'video_count',
    header: 'Vídeos',
    align: 'center',
    sortable: true,
    render: (v) => <span className="text-sm font-semibold text-text-primary">{String(v ?? 0)}</span>,
  },
  {
    key: 'average_quality',
    header: 'Qualidade',
    render: (_, row) => row.average_quality
      ? <QualityBadge level={scoreToQuality(row.average_quality)} score={row.average_quality} size="sm" />
      : <span className="text-xs text-text-muted">—</span>,
  },
  {
    key: 'created_at',
    header: 'Criado em',
    sortable: true,
    render: (v) => <span className="text-xs text-text-secondary">{formatDate(String(v))}</span>,
  },
];

// ─── Project Detail Page ──────────────────────────────────────

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [activeTab, setActiveTab] = useState('overview');

  const { data: project, isLoading, isError } = useProject(projectId ?? '');
  const { data: studies = [] } = useStudies();
  const exportProject = useExportProject();

  if (isLoading) return <div className="p-10 text-center text-sm text-text-secondary">Carregando projeto…</div>;
  if (isError || !project) return <div role="alert" className="m-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">Projeto não encontrado ou indisponível.</div>;

  const kpis: KPICardData[] = [
    {
      id: 'participants',
      label: 'Participantes',
      value: project.session_count ?? 0,
      description: 'Total de participantes com consentimento aceito',
      icon: 'Users',
      color: 'default',
    },
    {
      id: 'sessions',
      label: 'Sessões coletadas',
      value: project.session_count ?? 0,
      description: 'Sessões com vídeo registrado',
      icon: 'FlaskConical',
      color: 'info',
    },
    {
      id: 'videos',
      label: 'Vídeos processados',
      value: project.video_count ?? 0,
      description: 'Vídeos que passaram pelo pipeline',
      icon: 'Video',
      color: 'success',
    },
    {
      id: 'quality',
      label: 'Qualidade média',
      value: project.average_quality ? `${Math.round(project.average_quality * 100)}%` : '—',
      description: 'Taxa média de detecção facial',
      icon: 'ShieldCheck',
      color: project.average_quality && project.average_quality >= 0.85 ? 'success' : 'warning',
    },
  ];

  const tabNav = (
    <div className="flex items-center gap-0.5 overflow-x-auto">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          onClick={() => setActiveTab(tab.key)}
          className={cn(
            'px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px',
            activeTab === tab.key
              ? 'text-blue-600 border-blue-600'
              : 'text-text-secondary border-transparent hover:text-text-primary hover:border-border-strong',
          )}
        >
          {tab.label}
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
            <EntityHistoryDialog entityType="project" entityId={project.id} title={`Histórico de ${project.name}`}>
              <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-text-secondary bg-surface border border-border rounded-lg hover:bg-surface-hover transition-colors">
                <History size={14} />
                Histórico
              </button>
            </EntityHistoryDialog>
            <button
              onClick={() => exportProject.mutate(project.id)}
              disabled={exportProject.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-text-secondary bg-surface border border-border rounded-lg hover:bg-surface-hover transition-colors disabled:opacity-60"
            >
              <Download size={14} />
              {exportProject.isPending ? 'Exportando...' : 'Exportar'}
            </button>
            <EditProjectDialog project={project}>
              <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-text-secondary bg-surface border border-border rounded-lg hover:bg-surface-hover transition-colors">
                <Edit2 size={14} />
                Editar
              </button>
            </EditProjectDialog>
          </>
        }
        tabs={tabNav}
      />

      <div className="p-6 animate-fade-in">
        {exportProject.isError && (
          <p className="mb-4 text-sm text-red-600" role="alert">
            Não foi possível exportar o projeto: {(exportProject.error as Error).message}
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
          <h3 className="text-sm font-semibold text-text-primary">Informações do projeto</h3>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <InfoItem label="Organização"   value="UFPE" />
            <InfoItem label="Criado em"     value={formatDate(project.created_at)} />
            <InfoItem label="Última atividade" value={project.last_activity ? formatRelativeTime(project.last_activity) : '—'} />
            <InfoItem label="Responsáveis"  value={(project.responsible ?? []).map((u) => u.name).join(', ')} />
          </dl>

          {(project.responsible ?? []).length > 0 && (
            <div className="pt-3 border-t border-border">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-2">
                Equipe
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
                      <div className="text-[10px] text-text-muted capitalize">{user.role}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Quality alerts */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Alertas de qualidade</h3>
          {project.average_quality && project.average_quality >= 0.90 ? (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-50 border border-emerald-100">
              <ShieldCheck size={16} className="text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-semibold text-emerald-700">Qualidade excelente</div>
                <div className="text-xs text-emerald-600 mt-0.5">
                  Taxa de detecção facial média acima de 90% em todos os vídeos.
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-100">
              <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-semibold text-amber-700">Qualidade moderada</div>
                <div className="text-xs text-amber-600 mt-0.5">
                  Alguns vídeos apresentam taxa de detecção abaixo de 80%. Revise antes de publicar.
                </div>
              </div>
            </div>
          )}

          <div className="mt-4 space-y-2">
            <ConsentBar label="Consentimentos aceitos" value={85} color="bg-emerald-500" />
            <ConsentBar label="Pendentes"              value={10} color="bg-amber-500" />
            <ConsentBar label="Revogados"              value={5}  color="bg-red-400" />
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
  const navigate = useNavigate();
  const newStudyPath = `/app/studies/new?projectId=${encodeURIComponent(projectId)}`;

  if (studies.length === 0) {
    return (
      <EmptyState
        variant="empty"
        title="Nenhum estudo neste projeto"
        description="Adicione estudos para começar a coletar dados de participantes e vídeos."
        action={{ label: 'Novo Estudo', onClick: () => navigate(newStudyPath) }}
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
          Novo estudo
        </button>
      </div>
      <div className="card overflow-hidden">
        <DataTable
          columns={STUDY_COLUMNS}
          data={studies}
          onRowClick={(row) => navigate(`/app/studies/${row.id}/overview`)}
          rowActions={(row) => [
            { label: 'Abrir estudo', onClick: () => navigate(`/app/studies/${row.id}/overview`) },
          ]}
        />
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Edit2, Download, AlertTriangle, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { QualityBadge } from '@/components/ui/QualityBadge';
import { MetricCard } from '@/components/data-display/MetricCard';
import { DataTable, type ColumnDef } from '@/components/data-display/DataTable';
import { EmptyState } from '@/components/feedback/EmptyState';
import { cn, scoreToQuality } from '@/lib/utils';
import { formatDate, formatRelativeTime } from '@/lib/formatters';
import { MOCK_PROJECTS } from '@/lib/mocks/projectMocks';
import { RECENT_STUDIES } from '@/lib/mocks/dashboardMocks';
import { useProject } from '@/features/projects/useProjects';
import type { Study, KPICardData, Project } from '@/types/domain';

// ─── Tabs ─────────────────────────────────────────────────────

const TABS = [
  { key: 'overview',       label: 'Visão Geral' },
  { key: 'studies',        label: 'Estudos' },
  { key: 'sessions',       label: 'Sessões' },
  { key: 'videos',         label: 'Vídeos' },
  { key: 'processing',     label: 'Processamentos' },
  { key: 'reports',        label: 'Relatórios' },
  { key: 'settings',       label: 'Configurações' },
];

// ─── Study table columns ──────────────────────────────────────

const STUDY_COLUMNS: ColumnDef<Study>[] = [
  {
    key: 'name',
    header: 'Estudo',
    sortable: true,
    render: (_, row) => (
      <div>
        <div className="text-[13px] font-semibold text-slate-800">{row.name}</div>
        {row.protocol_version && (
          <div className="text-[10px] font-mono text-slate-400 mt-0.5">v{row.protocol_version}</div>
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
    render: (v) => <span className="text-sm font-semibold text-slate-700">{String(v ?? 0)}</span>,
  },
  {
    key: 'session_count',
    header: 'Sessões',
    align: 'center',
    sortable: true,
    render: (v) => <span className="text-sm font-semibold text-slate-700">{String(v ?? 0)}</span>,
  },
  {
    key: 'video_count',
    header: 'Vídeos',
    align: 'center',
    sortable: true,
    render: (v) => <span className="text-sm font-semibold text-slate-700">{String(v ?? 0)}</span>,
  },
  {
    key: 'average_quality',
    header: 'Qualidade',
    render: (_, row) => row.average_quality
      ? <QualityBadge level={scoreToQuality(row.average_quality)} score={row.average_quality} size="sm" />
      : <span className="text-xs text-slate-400">—</span>,
  },
  {
    key: 'created_at',
    header: 'Criado em',
    sortable: true,
    render: (v) => <span className="text-xs text-slate-500">{formatDate(String(v))}</span>,
  },
];

// ─── Project Detail Page ──────────────────────────────────────

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [activeTab, setActiveTab] = useState('overview');

  // Prefer the real project; fall back to mock only when nothing loaded yet
  // (e.g. offline dev) so the page never silently misrepresents live data.
  const { data: liveProject } = useProject(projectId ?? '');
  const project: Project = liveProject ?? MOCK_PROJECTS.find((p) => p.id === projectId) ?? MOCK_PROJECTS[0];

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
              : 'text-slate-500 border-transparent hover:text-slate-700 hover:border-slate-300',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="min-h-full">
      <PageHeader
        title={project.name}
        description={project.description}
        actions={
          <>
            {project.status && <StatusBadge status={project.status} />}
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
              <Download size={14} />
              Exportar
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
              <Edit2 size={14} />
              Editar
            </button>
          </>
        }
        tabs={tabNav}
      />

      <div className="p-6 animate-fade-in">
        {activeTab === 'overview' && (
          <OverviewTab project={project} kpis={kpis} />
        )}
        {activeTab === 'studies' && (
          <StudiesTab studies={RECENT_STUDIES.filter((s) => s.project_id === project.id)} />
        )}
        {(activeTab === 'sessions' || activeTab === 'videos' || activeTab === 'processing' || activeTab === 'reports') && (
          <EmptyState
            variant="empty"
            title={`${TABS.find((t) => t.key === activeTab)?.label} — Em breve`}
            description="Esta seção será populada com dados reais do pipeline."
          />
        )}
        {activeTab === 'settings' && (
          <EmptyState
            variant="empty"
            title="Configurações do projeto"
            description="Gerenciamento de acesso, pipeline e exportação disponível em breve."
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
          <h3 className="text-sm font-semibold text-slate-800">Informações do projeto</h3>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <InfoItem label="Organização"   value="UFPE" />
            <InfoItem label="Criado em"     value={formatDate(project.created_at)} />
            <InfoItem label="Última atividade" value={project.last_activity ? formatRelativeTime(project.last_activity) : '—'} />
            <InfoItem label="Responsáveis"  value={(project.responsible ?? []).map((u) => u.name).join(', ')} />
          </dl>

          {(project.responsible ?? []).length > 0 && (
            <div className="pt-3 border-t border-slate-100">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
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
                      <div className="text-[12px] font-medium text-slate-700">{user.name}</div>
                      <div className="text-[10px] text-slate-400 capitalize">{user.role}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Quality alerts */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">Alertas de qualidade</h3>
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
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">{label}</dt>
      <dd className="text-sm text-slate-700 font-medium">{value || '—'}</dd>
    </div>
  );
}

function ConsentBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-[11px] mb-1">
        <span className="text-slate-600">{label}</span>
        <span className="font-semibold text-slate-700">{value}%</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

// ─── Studies Tab ──────────────────────────────────────────────

function StudiesTab({ studies }: { studies: Study[] }) {
  const navigate = useNavigate();

  if (studies.length === 0) {
    return (
      <EmptyState
        variant="empty"
        title="Nenhum estudo neste projeto"
        description="Adicione estudos para começar a coletar dados de participantes e vídeos."
        action={{ label: 'Novo Estudo', onClick: () => {} }}
      />
    );
  }

  return (
    <div className="card overflow-hidden">
      <DataTable
        columns={STUDY_COLUMNS}
        data={studies}
        onRowClick={(row) => navigate(`/app/studies/${row.id}/overview`)}
        rowActions={(row) => [
          { label: 'Abrir estudo', onClick: () => navigate(`/app/studies/${row.id}/overview`) },
          { label: 'Editar', onClick: () => {} },
          { label: 'Arquivar', onClick: () => {}, destructive: true },
        ]}
      />
    </div>
  );
}

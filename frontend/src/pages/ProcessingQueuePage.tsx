import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import {
  RotateCcw,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { MetricCard } from '@/components/data-display/MetricCard';
import { DataTable, type ColumnDef } from '@/components/data-display/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/feedback/EmptyState';
import { cn } from '@/lib/utils';
import { formatDuration, shortId } from '@/lib/formatters';
import { RECENT_JOBS } from '@/lib/mocks/dashboardMocks';
import type { ProcessingJob, JobStatus, KPICardData } from '@/types/domain';

// ─── Augmented mock jobs ──────────────────────────────────────

const ALL_JOBS: ProcessingJob[] = [
  ...RECENT_JOBS,
  {
    id: 'a1b2c3d-0006', video_asset_id: 'vid-006', job_type: 'extract_landmarks',
    status: 'succeeded', progress: 100, elapsed_seconds: 650,
    started_at: '2026-06-13T14:00:00Z', finished_at: '2026-06-13T14:11:00Z',
    worker_id: 'worker-02', current_step: 'Gerando relatório',
    video_filename: 'sessao_P4012_bloco2.mp4', study_name: 'USP Cognitivo 2026',
  },
  {
    id: 'a1b2c3d-0007', video_asset_id: 'vid-007', job_type: 'extract_landmarks',
    status: 'canceled', progress: 42, elapsed_seconds: 120,
    started_at: '2026-06-13T13:00:00Z', finished_at: '2026-06-13T13:02:00Z',
    worker_id: 'worker-03', current_step: 'Cancelado',
    video_filename: 'sessao_P5100_bloco1.mp4', study_name: 'UNICAMP Bio 2026',
  },
];

// ─── Queue KPIs ───────────────────────────────────────────────

const QUEUE_KPIS: KPICardData[] = [
  { id: 'queued',     label: 'Na fila',         value: 1,   description: 'Jobs aguardando worker disponível', icon: 'Clock',         color: 'warning' },
  { id: 'running',    label: 'Em execução',      value: 1,   description: 'Jobs sendo processados agora',     icon: 'Cpu',           color: 'info'    },
  { id: 'succeeded',  label: 'Concluídos (24h)', value: 3,   description: 'Jobs finalizados com sucesso',     icon: 'ShieldCheck',   color: 'success' },
  { id: 'failed',     label: 'Falharam (24h)',   value: 1,   description: 'Jobs com erro que requerem ação', icon: 'AlertTriangle', color: 'danger'  },
  { id: 'avg_time',   label: 'Tempo médio',      value: '12m 30s', description: 'Duração média por job',    icon: 'BarChart3',     color: 'default' },
  { id: 'throughput', label: 'Throughput',        value: '18/h', description: 'Vídeos processados por hora', icon: 'Cpu',           color: 'default' },
];

// ─── Table columns ────────────────────────────────────────────

const JOB_COLUMNS: ColumnDef<ProcessingJob>[] = [
  {
    key: 'id',
    header: 'Job ID',
    render: (_, row) => <span className="font-mono text-xs text-slate-500">{shortId(row.id)}</span>,
  },
  {
    key: 'video_filename',
    header: 'Vídeo',
    sortable: true,
    render: (v) => <span className="text-[13px] font-medium text-slate-700 truncate max-w-[160px] block">{String(v ?? '—')}</span>,
  },
  {
    key: 'study_name',
    header: 'Estudo',
    sortable: true,
    render: (v) => <span className="text-xs text-slate-500 truncate max-w-[140px] block">{String(v ?? '—')}</span>,
  },
  {
    key: 'status',
    header: 'Status',
    sortable: true,
    render: (_, row) => <StatusBadge status={row.status} size="sm" />,
  },
  {
    key: 'progress',
    header: 'Progresso',
    render: (_, row) => (
      <div className="flex items-center gap-2 min-w-[80px]">
        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full progress-bar" style={{ width: `${row.progress}%` }} />
        </div>
        <span className="text-[11px] font-mono text-slate-500 w-8 text-right">{row.progress}%</span>
      </div>
    ),
  },
  {
    key: 'current_step',
    header: 'Etapa atual',
    render: (v) => <span className="text-xs text-slate-500 truncate max-w-[160px] block">{String(v ?? '—')}</span>,
  },
  {
    key: 'worker_id',
    header: 'Worker',
    render: (v) => v ? <span className="font-mono text-xs text-slate-400">{String(v)}</span> : <span className="text-xs text-slate-300">—</span>,
  },
  {
    key: 'elapsed_seconds',
    header: 'Tempo',
    sortable: true,
    render: (v) => {
      const secs = Number(v ?? 0);
      return <span className="text-xs text-slate-500">{secs > 0 ? formatDuration(secs) : '—'}</span>;
    },
  },
];

// ─── Tab config ───────────────────────────────────────────────

type TabKey = 'all' | JobStatus;

const JOB_TABS: { key: TabKey; label: string }[] = [
  { key: 'all',       label: 'Todos'     },
  { key: 'queued',    label: 'Na fila'   },
  { key: 'running',   label: 'Execução'  },
  { key: 'succeeded', label: 'Concluídos'},
  { key: 'failed',    label: 'Falhas'    },
];

// ─── Processing Queue Page ────────────────────────────────────

export function ProcessingQueuePage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>('all');

  const filtered = activeTab === 'all'
    ? ALL_JOBS
    : ALL_JOBS.filter((j) => j.status === activeTab);

  return (
    <div className="min-h-full">
      <PageHeader
        title="Pipeline de processamento"
        description="Monitore jobs, qualidade e throughput do pipeline de análise de microações."
        actions={
          <button
            onClick={() => {}}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
          >
            <RotateCcw size={14} />
            Reprocessar falhas
          </button>
        }
      />

      <div className="p-6 space-y-5 animate-fade-in">
        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {QUEUE_KPIS.map((kpi) => (
            <MetricCard key={kpi.id} data={kpi} />
          ))}
        </div>

        {/* Jobs table */}
        <div className="card overflow-hidden">
          {/* Tab bar */}
          <div className="flex items-center border-b border-slate-100 px-4 gap-1">
            {JOB_TABS.map((tab) => {
              const count = tab.key === 'all'
                ? ALL_JOBS.length
                : ALL_JOBS.filter((j) => j.status === tab.key).length;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
                    activeTab === tab.key
                      ? 'text-blue-600 border-blue-600'
                      : 'text-slate-500 border-transparent hover:text-slate-700',
                  )}
                >
                  {tab.label}
                  <span className={cn(
                    'text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
                    activeTab === tab.key ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500',
                  )}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <DataTable
            columns={JOB_COLUMNS}
            data={filtered}
            onRowClick={(row) => navigate(`/app/videos/${row.video_asset_id}/processing`)}
            rowActions={(row) => [
              { label: 'Ver detalhes', onClick: () => navigate(`/app/videos/${row.video_asset_id}/processing`) },
              ...(row.status === 'failed' ? [{ label: 'Reprocessar', onClick: () => {} }] : []),
              ...(row.status === 'running' ? [{ label: 'Cancelar', onClick: () => {}, destructive: true }] : []),
            ]}
            emptyState={
              <EmptyState variant="empty" title="Nenhum job nesta categoria" />
            }
          />
        </div>
      </div>
    </div>
  );
}

import { useNavigate } from 'react-router-dom';
import { useMemo, useState } from 'react';
import {
  RotateCcw,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { MetricCard } from '@/components/data-display/MetricCard';
import { DataTable, type ColumnDef } from '@/components/data-display/DataTable';
import { ListFilterBar } from '@/components/data-display/ListFilterBar';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/feedback/EmptyState';
import { cn } from '@/lib/utils';
import { formatDuration, shortId } from '@/lib/formatters';
import { useCancelJob, useJobs, useRetryJob } from '@/features/jobs/useJobActions';
import type { ProcessingJob, JobStatus, KPICardData } from '@/types/domain';

// ─── Augmented mock jobs ──────────────────────────────────────

// ─── Queue KPIs ───────────────────────────────────────────────

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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function ProcessingQueuePage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [search, setSearch] = useState('');
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [referenceTime] = useState(Date.now);
  const { data: jobs = [], isLoading, isError } = useJobs();
  const retryJob = useRetryJob();
  const cancelJob = useCancelJob();

  const tabFiltered = activeTab === 'all'
    ? jobs
    : jobs.filter((j) => j.status === activeTab);
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    if (!term) return tabFiltered;
    return tabFiltered.filter((job) => [
      job.id,
      job.video_filename,
      job.study_name,
      job.current_step,
      job.worker_id,
    ].some((value) => String(value ?? '').toLocaleLowerCase('pt-BR').includes(term)));
  }, [search, tabFiltered]);
  const retryableJobs = jobs.filter((job) => job.status === 'failed' && UUID_PATTERN.test(job.id));
  const queueKpis = useMemo<KPICardData[]>(() => {
    const last24Hours = referenceTime - 24 * 60 * 60 * 1000;
    const finishedRecently = jobs.filter(
      (job) => job.finished_at && new Date(job.finished_at).getTime() >= last24Hours,
    );
    const durations = finishedRecently
      .map((job) => job.elapsed_seconds ?? 0)
      .filter((duration) => duration > 0);
    const averageDuration = durations.length
      ? durations.reduce((sum, duration) => sum + duration, 0) / durations.length
      : 0;
    return [
      { id: 'queued', label: 'Na fila', value: jobs.filter((job) => job.status === 'queued').length, description: 'Jobs aguardando worker disponível', icon: 'Clock', color: 'warning' },
      { id: 'running', label: 'Em execução', value: jobs.filter((job) => job.status === 'running').length, description: 'Jobs sendo processados agora', icon: 'Cpu', color: 'info' },
      { id: 'succeeded', label: 'Concluídos (24h)', value: finishedRecently.filter((job) => job.status === 'succeeded').length, description: 'Finalizados com sucesso nas últimas 24h', icon: 'ShieldCheck', color: 'success' },
      { id: 'failed', label: 'Falharam (24h)', value: finishedRecently.filter((job) => job.status === 'failed').length, description: 'Erros que requerem ação', icon: 'AlertTriangle', color: 'danger' },
      { id: 'avg_time', label: 'Tempo médio', value: averageDuration ? formatDuration(averageDuration) : '—', description: 'Duração média dos jobs finalizados', icon: 'BarChart3', color: 'default' },
      { id: 'total', label: 'Total', value: jobs.length, description: 'Jobs visíveis nesta organização', icon: 'Cpu', color: 'default' },
    ];
  }, [jobs, referenceTime]);

  const runJobAction = async (job: ProcessingJob, action: 'retry' | 'cancel') => {
    if (!UUID_PATTERN.test(job.id)) {
      setActionFeedback('Este item é ilustrativo. A ação ficará disponível quando a fila consumir jobs reais.');
      return;
    }

    try {
      if (action === 'retry') {
        await retryJob.mutateAsync(job.id);
        setActionFeedback(`Job ${shortId(job.id)} reenviado para processamento.`);
      } else {
        await cancelJob.mutateAsync(job.id);
        setActionFeedback(`Cancelamento solicitado para o job ${shortId(job.id)}.`);
      }
    } catch (error) {
      setActionFeedback(`Falha ao ${action === 'retry' ? 'reprocessar' : 'cancelar'}: ${(error as Error).message}`);
    }
  };

  const retryAllFailed = async () => {
    const results = await Promise.allSettled(retryableJobs.map((job) => retryJob.mutateAsync(job.id)));
    const succeeded = results.filter((result) => result.status === 'fulfilled').length;
    setActionFeedback(`${succeeded} de ${retryableJobs.length} job(s) reenviado(s) para processamento.`);
  };

  return (
    <div className="min-h-full">
      <PageHeader
        title="Pipeline de processamento"
        description="Monitore jobs, qualidade e throughput do pipeline de análise de microações."
        actions={
          <button
            type="button"
            onClick={retryAllFailed}
            disabled={!retryableJobs.length || retryJob.isPending}
            title={retryableJobs.length ? 'Reprocessar todos os jobs reais com falha' : 'Disponível quando houver jobs reais com falha'}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw size={14} />
            {retryJob.isPending ? 'Reprocessando…' : 'Reprocessar falhas'}
          </button>
        }
      />

      <div className="p-6 space-y-5 animate-fade-in">
        {actionFeedback && (
          <p role="status" className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
            {actionFeedback}
          </p>
        )}
        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {queueKpis.map((kpi) => (
            <MetricCard key={kpi.id} data={kpi} />
          ))}
        </div>

        {/* Jobs table */}
        <div className="card overflow-hidden">
          {/* Tab bar */}
          <div className="flex items-center border-b border-slate-100 px-4 gap-1">
            {JOB_TABS.map((tab) => {
              const count = tab.key === 'all'
                ? jobs.length
                : jobs.filter((j) => j.status === tab.key).length;
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

          <div className="border-b border-slate-100 p-3">
            <ListFilterBar
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="Buscar por job, vídeo, estudo, etapa ou worker..."
              resultCount={filtered.length}
              totalCount={tabFiltered.length}
              resultLabel="job"
              resultLabelPlural="jobs"
            />
          </div>

          <DataTable
            columns={JOB_COLUMNS}
            data={filtered}
            onRowClick={(row) => navigate(`/app/videos/${row.video_asset_id}/processing`)}
            rowActions={(row) => [
              { label: 'Ver detalhes', onClick: () => navigate(`/app/videos/${row.video_asset_id}/processing`) },
              ...(row.status === 'failed' ? [{ label: 'Reprocessar', onClick: () => { void runJobAction(row, 'retry'); } }] : []),
              ...(row.status === 'running' ? [{ label: 'Cancelar', onClick: () => { void runJobAction(row, 'cancel'); }, destructive: true }] : []),
            ]}
            emptyState={
              <EmptyState
                variant={isError ? 'error' : 'empty'}
                title={isLoading ? 'Carregando jobs…' : isError ? 'Falha ao carregar a fila' : 'Nenhum job nesta categoria'}
              />
            }
          />
        </div>
      </div>
    </div>
  );
}

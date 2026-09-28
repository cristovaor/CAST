import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useLocale } from '@/i18n/useLocale';
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

function jobColumns(t: TFunction<'processing'>): ColumnDef<ProcessingJob>[] {
  return [
  {
    key: 'id',
    header: t('queue.columns.id'),
    render: (_, row) => <span className="font-mono text-xs text-text-muted">{shortId(row.id)}</span>,
  },
  {
    key: 'video_filename',
    header: t('queue.columns.video'),
    sortable: true,
    render: (v) => <span className="text-[13px] font-medium text-text-secondary truncate max-w-[160px] block">{String(v ?? '—')}</span>,
  },
  {
    key: 'study_name',
    header: t('queue.columns.study'),
    sortable: true,
    render: (v) => <span className="text-xs text-text-muted truncate max-w-[140px] block">{String(v ?? '—')}</span>,
  },
  {
    key: 'status',
    header: t('queue.columns.status'),
    sortable: true,
    render: (_, row) => <StatusBadge status={row.status} size="sm" />,
  },
  {
    key: 'progress',
    header: t('queue.columns.progress'),
    render: (_, row) => (
      <div className="flex items-center gap-2 min-w-[80px]">
        <div className="flex-1 h-1.5 bg-surface-muted rounded-full overflow-hidden">
          <div className="h-full progress-bar" style={{ width: `${row.progress}%` }} />
        </div>
        <span className="text-[11px] font-mono text-text-muted w-8 text-right">{row.progress}%</span>
      </div>
    ),
  },
  {
    key: 'current_step',
    header: t('queue.columns.step'),
    render: (v) => <span className="text-xs text-text-muted truncate max-w-[160px] block">{String(v ?? '—')}</span>,
  },
  {
    key: 'worker_id',
    header: t('queue.columns.worker'),
    render: (v) => v ? <span className="font-mono text-xs text-text-muted">{String(v)}</span> : <span className="text-xs text-text-disabled">—</span>,
  },
  {
    key: 'elapsed_seconds',
    header: t('queue.columns.time'),
    sortable: true,
    render: (v) => {
      const secs = Number(v ?? 0);
      return <span className="text-xs text-text-muted">{secs > 0 ? formatDuration(secs) : '—'}</span>;
    },
  },
  ];
}

// ─── Tab config ───────────────────────────────────────────────

type TabKey = 'all' | JobStatus;

const JOB_TABS = ['all', 'queued', 'running', 'succeeded', 'failed'] as const satisfies readonly TabKey[];

// ─── Processing Queue Page ────────────────────────────────────

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function ProcessingQueuePage() {
  const { t } = useTranslation('processing');
  const locale = useLocale();
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
    const term = search.trim().toLocaleLowerCase(locale);
    if (!term) return tabFiltered;
    return tabFiltered.filter((job) => [
      job.id,
      job.video_filename,
      job.study_name,
      job.current_step,
      job.worker_id,
    ].some((value) => String(value ?? '').toLocaleLowerCase(locale).includes(term)));
  }, [locale, search, tabFiltered]);
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
      { id: 'queued', label: t('queue.kpis.queued.label'), value: jobs.filter((job) => job.status === 'queued').length, description: t('queue.kpis.queued.description'), icon: 'Clock', color: 'warning' },
      { id: 'running', label: t('queue.kpis.running.label'), value: jobs.filter((job) => job.status === 'running').length, description: t('queue.kpis.running.description'), icon: 'Cpu', color: 'info' },
      { id: 'succeeded', label: t('queue.kpis.succeeded.label'), value: finishedRecently.filter((job) => job.status === 'succeeded').length, description: t('queue.kpis.succeeded.description'), icon: 'ShieldCheck', color: 'success' },
      { id: 'failed', label: t('queue.kpis.failed.label'), value: finishedRecently.filter((job) => job.status === 'failed').length, description: t('queue.kpis.failed.description'), icon: 'AlertTriangle', color: 'danger' },
      { id: 'avg_time', label: t('queue.kpis.avgTime.label'), value: averageDuration ? formatDuration(averageDuration) : '—', description: t('queue.kpis.avgTime.description'), icon: 'BarChart3', color: 'default' },
      { id: 'total', label: t('queue.kpis.total.label'), value: jobs.length, description: t('queue.kpis.total.description'), icon: 'Cpu', color: 'default' },
    ];
  }, [jobs, referenceTime, t]);

  const runJobAction = async (job: ProcessingJob, action: 'retry' | 'cancel') => {
    if (!UUID_PATTERN.test(job.id)) {
      setActionFeedback(t('queue.feedback.illustrative'));
      return;
    }

    try {
      if (action === 'retry') {
        await retryJob.mutateAsync(job.id);
        setActionFeedback(t('queue.feedback.retried', { id: shortId(job.id) }));
      } else {
        await cancelJob.mutateAsync(job.id);
        setActionFeedback(t('queue.feedback.cancelled', { id: shortId(job.id) }));
      }
    } catch (error) {
      const message = (error as Error).message;
      setActionFeedback(action === 'retry'
        ? t('queue.feedback.retryFailed', { message })
        : t('queue.feedback.cancelFailed', { message }));
    }
  };

  const retryAllFailed = async () => {
    const results = await Promise.allSettled(retryableJobs.map((job) => retryJob.mutateAsync(job.id)));
    const succeeded = results.filter((result) => result.status === 'fulfilled').length;
    setActionFeedback(t('queue.feedback.retriedAll', { succeeded, total: retryableJobs.length }));
  };

  return (
    <div className="min-h-full">
      <PageHeader
        title={t('queue.title')}
        description={t('queue.description')}
        actions={
          <button
            type="button"
            onClick={retryAllFailed}
            disabled={!retryableJobs.length || retryJob.isPending}
            title={retryableJobs.length ? t('queue.retryAllTitle') : t('queue.retryAllUnavailable')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw size={14} aria-hidden="true" />
            {retryJob.isPending ? t('queue.retrying') : t('queue.retryAll')}
          </button>
        }
      />

      <div className="p-6 space-y-5 animate-fade-in">
        {actionFeedback && (
          <p role="status" className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
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
          <div role="tablist" aria-label={t('queue.tabs.label')} className="flex items-center border-b border-border px-4 gap-1 overflow-x-auto">
            {JOB_TABS.map((tab) => {
              const count = tab === 'all'
                ? jobs.length
                : jobs.filter((j) => j.status === tab).length;
              return (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
                    activeTab === tab
                      ? 'text-blue-600 border-blue-600 dark:text-blue-400 dark:border-blue-400'
                      : 'text-text-muted border-transparent hover:text-text-secondary',
                  )}
                >
                  {t(`queue.tabs.${tab}`)}
                  <span className={cn(
                    'text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
                    activeTab === tab ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' : 'bg-surface-muted text-text-muted',
                  )}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="border-b border-border p-3">
            <ListFilterBar
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder={t('queue.searchPlaceholder')}
              resultCount={filtered.length}
              totalCount={tabFiltered.length}
              resultLabel={t('queue.resultSingular')}
              resultLabelPlural={t('queue.resultPlural')}
            />
          </div>

          <DataTable
            columns={jobColumns(t)}
            data={filtered}
            onRowClick={(row) => navigate(`/app/videos/${row.video_asset_id}/processing`)}
            rowActions={(row) => [
              { label: t('queue.actions.details'), onClick: () => navigate(`/app/videos/${row.video_asset_id}/processing`) },
              ...(row.status === 'failed' ? [{ label: t('queue.actions.retry'), onClick: () => { void runJobAction(row, 'retry'); } }] : []),
              ...(row.status === 'running' ? [{ label: t('queue.actions.cancel'), onClick: () => { void runJobAction(row, 'cancel'); }, destructive: true }] : []),
            ]}
            emptyState={
              <EmptyState
                variant={isError ? 'error' : 'empty'}
                title={isLoading ? t('queue.empty.loading') : isError ? t('queue.empty.error') : t('queue.empty.none')}
              />
            }
          />
        </div>
      </div>
    </div>
  );
}

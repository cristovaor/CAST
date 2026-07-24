import { useNavigate } from 'react-router-dom';
import { ExternalLink, CheckCircle2, AlertTriangle, Clock, Activity, FileWarning } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { QualityBadge } from '@/components/ui/QualityBadge';
import { ActionButton } from '@/components/ui/ActionButton';
import { cn, scoreToQuality } from '@/lib/utils';
import { formatDuration, shortId } from '@/lib/formatters';
import type { ProcessingJob } from '@/types/domain';

interface RecentProcessingListProps {
  jobs: ProcessingJob[];
}

export function RecentProcessingList({ jobs }: RecentProcessingListProps) {
  const navigate = useNavigate();

  return (
    <div className="card overflow-hidden flex flex-col h-full bg-surface shadow-sm ring-1 ring-border/50">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface-muted/50">
        <div>
          <h2 className="text-[15px] font-semibold text-text-primary tracking-tight">Processamentos recentes</h2>
          <p className="text-[13px] text-text-secondary mt-0.5">Jobs de extração de landmarks e inferência</p>
        </div>
        <ActionButton 
          variant="ghost" 
          size="sm" 
          onClick={() => navigate('/app/processing')}
          className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 -mr-2"
        >
          Ver todos <ExternalLink size={14} className="ml-1" />
        </ActionButton>
      </div>
      <div className="divide-y divide-slate-100 flex-1 overflow-y-auto">
        {jobs.length === 0 ? (
          <div className="p-8 text-center text-text-secondary text-sm">
            Nenhum processamento recente.
          </div>
        ) : (
          jobs.map((job) => <RecentJobRow key={job.id} job={job} />)
        )}
      </div>
    </div>
  );
}

function RecentJobRow({ job }: { job: ProcessingJob }) {
  // Determine if it has quality issue derived from error message (mock logic)
  const isRejected = job.error_message?.toLowerCase().includes('rejeitado');
  
  // Custom status visual logic
  let bgIconColor = 'bg-slate-100';
  let iconColor = 'text-slate-400';
  let Icon = Clock;

  if (job.status === 'succeeded') {
    bgIconColor = 'bg-emerald-50';
    iconColor = 'text-emerald-500';
    Icon = CheckCircle2;
  } else if (job.status === 'failed') {
    bgIconColor = 'bg-orange-50'; // Discreto em vez de red-50
    iconColor = 'text-orange-500';
    Icon = isRejected ? FileWarning : AlertTriangle;
  } else if (job.status === 'running') {
    bgIconColor = 'bg-blue-50';
    iconColor = 'text-blue-500';
    Icon = Activity;
  }

  // Derive mock quality based on status for demonstration
  const qualityScore = job.status === 'succeeded' ? 0.94 : job.status === 'failed' ? (isRejected ? 0.12 : undefined) : undefined;

  return (
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 px-6 py-4 hover:bg-surface-hover transition-colors group">
      {/* Icon */}
      <div className={cn(
        'w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border',
        bgIconColor,
        bgIconColor.replace('bg-', 'border-').replace('50', '100') // subtle border matching
      )}>
        {job.status === 'running' ? (
          <div className="w-3.5 h-3.5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
        ) : (
          <Icon size={16} className={iconColor} />
        )}
      </div>

      {/* Main Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
                    <span className="text-[14px] font-semibold text-text-primary truncate group-hover:text-blue-700 transition-colors cursor-pointer">
            {job.video_filename}
          </span>
          {qualityScore !== undefined && (
            <QualityBadge level={scoreToQuality(qualityScore)} score={qualityScore} size="sm" />
          )}
        </div>
                  <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-[12px] text-text-secondary font-medium">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[11px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{shortId(job.id)}</span>
          </div>
          <span>&bull;</span>
          <span className="truncate max-w-[200px] text-slate-600">{job.study_name}</span>
          <span>&bull;</span>
          <span className="text-slate-400 truncate max-w-[150px]">Mod: cast-lstm-v1</span>
        </div>
        
        {/* Error message discrete alert */}
        {job.status === 'failed' && job.error_message && (
          <div className="mt-2 text-[12px] text-orange-700 bg-orange-50/50 border border-orange-100 px-2 py-1 rounded w-fit">
            {job.error_message}
          </div>
        )}
      </div>

      {/* Right Info */}
      <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0">
        <StatusBadge status={job.status} size="sm" />
        <div className="flex flex-col items-end">
          {job.progress > 0 && job.status === 'running' && (
            <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden mb-1 ring-1 ring-slate-200 inset-ring">
              <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${job.progress}%` }} />
            </div>
          )}
          {job.elapsed_seconds !== undefined && job.elapsed_seconds > 0 && (
            <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
              <Clock size={10} /> {formatDuration(job.elapsed_seconds)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

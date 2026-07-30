import { useParams, useNavigate } from 'react-router-dom';
import { Terminal, CheckCircle2, AlertCircle } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { shortId } from '@/lib/formatters';
import { useVideoDetails } from '@/features/videos/useVideos';
import { useProcessingJobStream } from '@/features/jobs/useProcessingJobStream';
import { useCancelJob } from '@/features/jobs/useJobActions';
import { useEffect } from 'react';

export function ProcessingPage() {
  const { videoId } = useParams<{ videoId: string }>();
  const navigate = useNavigate();

  const { data: videoData } = useVideoDetails(videoId!);
  const jobId = videoData?.latest_job_id ?? undefined;

  const { data: jobStream, error } = useProcessingJobStream(jobId ?? '');
  const cancelJob = useCancelJob();

  // Redirecionamento automático quando terminar
  useEffect(() => {
    if (jobStream.status === 'succeeded') {
      const timer = setTimeout(() => {
        navigate(`/app/videos/${videoId}`);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [jobStream.status, navigate, videoId]);

  return (
    <div className="min-h-full">
      <PageHeader
        title={`Processamento de Vídeo`}
        description={`Acompanhe a extração de microações do vídeo ${videoId}`}
        actions={
          <>
            <StatusBadge status={jobStream.status} />
            {(jobStream.status === 'queued' || jobStream.status === 'running') && (
              <button
                type="button"
                onClick={() => jobId && cancelJob.mutate(jobId)}
                disabled={!jobId || cancelJob.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                {cancelJob.isPending ? 'Cancelando…' : 'Cancelar'}
              </button>
            )}
            {(jobStream.status === 'succeeded' || jobStream.status === 'failed') && (
              <button 
                onClick={() => navigate(`/app/videos/${videoId}`)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors">
                Voltar para Vídeo
              </button>
            )}
          </>
        }
      />
      
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 p-4 rounded-lg flex items-start gap-3">
            <AlertCircle className="text-red-500 mt-0.5" size={18} />
            <div>
              <h4 className="text-sm font-semibold text-red-800">Erro de Conexão</h4>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        )}
        {cancelJob.isError && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            Não foi possível cancelar o job: {(cancelJob.error as Error).message}
          </div>
        )}

        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-text-primary">Status da Extração</h3>
            <span className="font-mono text-sm text-text-muted">{jobStream.progress.toFixed(1)}%</span>
          </div>
          
          <div className="h-2 bg-surface-muted rounded-full overflow-hidden mb-4">
            <div 
              className={`h-full transition-all duration-500 ${jobStream.status === 'failed' ? 'bg-red-500' : jobStream.status === 'succeeded' ? 'bg-emerald-500' : 'bg-blue-500'}`} 
              style={{ width: `${jobStream.progress}%` }} 
            />
          </div>
          
          <div className="flex items-center gap-2 text-sm text-text-secondary bg-app-bg p-3 rounded-lg border border-border">
            {jobStream.status === 'succeeded' ? (
              <CheckCircle2 className="text-emerald-500" size={16} />
            ) : jobStream.status === 'failed' ? (
              <AlertCircle className="text-red-500" size={16} />
            ) : (
              <div className="w-4 h-4 rounded-full border-2 border-border-strong border-t-blue-500 animate-spin" />
            )}
            <span className="font-mono text-xs">{jobStream.currentStep}</span>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="bg-slate-900 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-text-muted">
              <Terminal size={14} />
              <span className="text-xs font-mono font-medium">Logs de execução {jobId ? `(Job: ${shortId(jobId)})` : ''}</span>
            </div>
          </div>
          <div className="bg-[#0F172A] p-4 h-64 overflow-y-auto font-mono text-[11px] space-y-1.5 flex flex-col-reverse">
             {/* Use flex-col-reverse and reverse the array to keep scroll at bottom */}
            {[...jobStream.logs].reverse().map((log, idx) => (
              <div key={idx} className={log.level === 'error' ? 'text-red-400' : log.level === 'warn' ? 'text-amber-400' : 'text-text-disabled'}>
                [{log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : '---'}] {log.message}
              </div>
            ))}
            {jobStream.logs.length === 0 && (
              <div className="text-text-muted italic">Aguardando logs...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useParams, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { Terminal, CheckCircle2, AlertCircle } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { shortId } from '@/lib/formatters';
import { useProcessingJobStream } from '@/features/jobs/useProcessingJobStream';
import { useCancelTrainJob } from '@/features/models/useModels';

export function ModelTrainingPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();

  const { data: jobStream, error } = useProcessingJobStream(
    jobId ?? '',
    (id) => `/models/train-jobs/${id}/stream`,
  );
  const cancelJob = useCancelTrainJob();

  useEffect(() => {
    if (jobStream.status === 'succeeded') {
      const timer = setTimeout(() => navigate('/app/models'), 3000);
      return () => clearTimeout(timer);
    }
  }, [jobStream.status, navigate]);

  return (
    <div className="min-h-full">
      <PageHeader
        title="Treinamento de modelo"
        description={`Acompanhe o treino do modelo ${jobId ? `(job ${shortId(jobId)})` : ''}`}
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
                onClick={() => navigate('/app/models')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors">
                Voltar para Modelos
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
            <h3 className="text-base font-semibold text-slate-800">Status do Treinamento</h3>
            <span className="font-mono text-sm text-slate-500">{jobStream.progress.toFixed(1)}%</span>
          </div>

          <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-4">
            <div
              className={`h-full transition-all duration-500 ${jobStream.status === 'failed' ? 'bg-red-500' : jobStream.status === 'succeeded' ? 'bg-emerald-500' : 'bg-blue-500'}`}
              style={{ width: `${jobStream.progress}%` }}
            />
          </div>

          <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100">
            {jobStream.status === 'succeeded' ? (
              <CheckCircle2 className="text-emerald-500" size={16} />
            ) : jobStream.status === 'failed' ? (
              <AlertCircle className="text-red-500" size={16} />
            ) : (
              <div className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-blue-500 animate-spin" />
            )}
            <span className="font-mono text-xs">{jobStream.currentStep}</span>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="bg-slate-900 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-400">
              <Terminal size={14} />
              <span className="text-xs font-mono font-medium">Logs de treinamento {jobId ? `(Job: ${shortId(jobId)})` : ''}</span>
            </div>
          </div>
          <div className="bg-[#0F172A] p-4 h-64 overflow-y-auto font-mono text-[11px] space-y-1.5 flex flex-col-reverse">
            {[...jobStream.logs].reverse().map((log, idx) => (
              <div key={idx} className={log.level === 'error' ? 'text-red-400' : log.level === 'warn' ? 'text-amber-400' : 'text-slate-300'}>
                [{log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : '---'}] {log.message}
              </div>
            ))}
            {jobStream.logs.length === 0 && (
              <div className="text-slate-500 italic">Aguardando logs...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

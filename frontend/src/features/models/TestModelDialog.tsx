import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/Dialog';
import { ActionButton } from '@/components/ui/ActionButton';
import { useGlobalVideos } from '@/features/videos/useVideos';
import { useStartModelTestRun } from './useModelTesting';

interface TestModelDialogProps {
  versionId: string;
  children: React.ReactNode;
  onStarted?: (jobId: string) => void;
}

// Runs inference with an explicit model version (any status — draft,
// candidate or active) against chosen videos, without touching promotion
// state. Lets a researcher preview a newly trained model before deciding
// whether to promote it.
export function TestModelDialog({ versionId, children, onStarted }: TestModelDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedVideoIds, setSelectedVideoIds] = useState<string[]>([]);
  const [persistAsPrediction, setPersistAsPrediction] = useState(false);
  const [thresholdOverride, setThresholdOverride] = useState('');

  const { data: videos, isLoading: videosLoading } = useGlobalVideos(0, 100);
  const startTestRun = useStartModelTestRun();

  const toggleVideo = (id: string) => {
    setSelectedVideoIds(prev =>
      prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id],
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTestRun.mutate(
      {
        versionId,
        videoAssetIds: selectedVideoIds,
        thresholdOverride: thresholdOverride ? Number(thresholdOverride) : undefined,
        persistAsPrediction,
      },
      {
        onSuccess: (data) => {
          setOpen(false);
          onStarted?.(data.job_id);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Testar modelo contra vídeo(s)</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-xs text-slate-500">
            Roda esta versão do modelo (independentemente do status) contra os vídeos
            selecionados. Por padrão o resultado não altera a timeline oficial do vídeo —
            marque a opção abaixo se quiser salvá-lo como predição visível.
          </p>

          {startTestRun.isError && (
            <div className="text-red-500 text-sm font-semibold">
              {(startTestRun.error as Error).message}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">
              Vídeos ({selectedVideoIds.length} selecionado{selectedVideoIds.length === 1 ? '' : 's'})
            </label>
            <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-md divide-y divide-slate-100">
              {videosLoading && <div className="p-3 text-xs text-slate-400">Carregando vídeos...</div>}
              {!videosLoading && (videos?.length ?? 0) === 0 && (
                <div className="p-3 text-xs text-slate-400">Nenhum vídeo encontrado.</div>
              )}
              {videos?.map(video => (
                <label key={video.id} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedVideoIds.includes(video.id)}
                    onChange={() => toggleVideo(video.id)}
                    className="rounded border-slate-300"
                  />
                  <span className="truncate">{video.filename}</span>
                  <span className="ml-auto text-xs text-slate-400">{video.status}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Threshold override (opcional)</label>
            <input
              type="number" min={0} max={1} step={0.01}
              value={thresholdOverride}
              onChange={e => setThresholdOverride(e.target.value)}
              placeholder="usa o threshold do manifesto"
              className="w-full px-3 py-2 border border-slate-200 rounded-md outline-none"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={persistAsPrediction}
              onChange={e => setPersistAsPrediction(e.target.checked)}
              className="rounded border-slate-300"
            />
            Salvar como predição oficial (aparece na timeline do vídeo)
          </label>

          <DialogFooter>
            <ActionButton variant="ghost" onClick={() => setOpen(false)} type="button">Cancelar</ActionButton>
            <ActionButton variant="primary" type="submit" disabled={startTestRun.isPending || selectedVideoIds.length === 0}>
              {startTestRun.isPending ? 'Iniciando...' : 'Rodar teste'}
            </ActionButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

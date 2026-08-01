import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/Dialog';
import { ActionButton } from '@/components/ui/ActionButton';
import { useTrainModel } from './useModels';

const ACTIONS = [
  ['OF', 'OF (Olhos Fechados)'],
  ['OC', 'OC (Olhando Canto)'],
  ['ML', 'ML (Mexendo Lábios)'],
  ['VR', 'VR (Virando Rosto)'],
  ['MSO', 'MSO (Mexeu Sobrancelha)'],
] as const;

// Trains on real annotated videos (landmarks + annotation events already in the
// system) instead of asking the user to supply a pre-trained artifact.
export function TrainModelDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [modelId, setModelId] = useState('cast-unified-v7');
  const [version, setVersion] = useState('');
  const [action, setAction] = useState('OF');
  const [unified, setUnified] = useState(true);
  const [multimodal, setMultimodal] = useState(false);
  const [epochs, setEpochs] = useState(40);
  const [batchSize, setBatchSize] = useState(34);

  const navigate = useNavigate();
  const trainModel = useTrainModel();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    trainModel.mutate(
      {
        model_id: modelId,
        version,
        ...(unified
          ? { unified: true }
          : { action }),
        training_config: {
          epochs,
          batch_size: batchSize,
          multimodal: unified && multimodal,
          modality_dropout_probability: 0.25,
          eeg_window_ms: 8000,
        },
      },
      {
        onSuccess: (data) => {
          setOpen(false);
          const [first, ...rest] = data.jobs;
          navigate(`/app/models/training/${first.job_id}`, {
            state: { batchJobIds: rest.map(j => j.job_id) },
          });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Treinar novo modelo</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {unified && (
            <label className="flex items-start gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={multimodal}
                onChange={e => {
                  const enabled = e.target.checked;
                  setMultimodal(enabled);
                  setModelId(enabled ? 'cast-multimodal-v8' : 'cast-unified-v7');
                }}
                className="mt-0.5 rounded border-border-strong"
              />
              <span>
                Multimodal V8: cabeÃ§a + EEG sincronizado. O EEG Ã© mascarado
                quando ausente, mas o treino exige ao menos duas sessÃµes com
                anÃ¡lise EEG e sincronizaÃ§Ã£o aprovadas.
              </span>
            </label>
          )}
          <p className="text-xs text-text-muted">
            O treino usa os vídeos já anotados no sistema (landmarks extraídos + eventos
            de anotação) para {unified ? 'todas as ações em um único artefato V7' : 'esta ação no modo V6'}. Não é
            necessário fornecer um artefato — ele é gerado e registrado automaticamente
            como <strong>draft</strong> ao final.
          </p>

          {trainModel.isError && (
            <div className="text-red-500 text-sm font-semibold">
              {(trainModel.error as Error).message}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-secondary">Model ID</label>
              <input required value={modelId} onChange={e => setModelId(e.target.value)} className="w-full px-3 py-2 border border-border rounded-md focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-secondary">Versão (ex: 1.0)</label>
              <input required value={version} onChange={e => setVersion(e.target.value)} className="w-full px-3 py-2 border border-border rounded-md focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-secondary">Ação</label>
              <select
                required={!unified}
                disabled={unified}
                value={action}
                onChange={e => setAction(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md outline-none bg-surface disabled:bg-app-bg disabled:text-text-muted"
              >
                {ACTIONS.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={unified}
              onChange={e => {
                const enabled = e.target.checked;
                setUnified(enabled);
                if (!enabled) setMultimodal(false);
                setModelId(enabled ? 'cast-unified-v7' : 'cast-lstm-v6');
              }}
              className="rounded border-border-strong"
            />
            Modelo unificado multirrótulo V7 ({ACTIONS.length} ações + movimentos observáveis)
          </label>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-secondary">Épocas</label>
              <input type="number" min={1} value={epochs} onChange={e => setEpochs(Number(e.target.value))} className="w-full px-3 py-2 border border-border rounded-md outline-none" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-secondary">Batch size</label>
              <input type="number" min={1} value={batchSize} onChange={e => setBatchSize(Number(e.target.value))} className="w-full px-3 py-2 border border-border rounded-md outline-none" />
            </div>
          </div>

          <DialogFooter>
            <ActionButton variant="ghost" onClick={() => setOpen(false)} type="button">Cancelar</ActionButton>
            <ActionButton variant="primary" type="submit" disabled={trainModel.isPending}>
              {trainModel.isPending ? 'Iniciando...' : 'Iniciar treino'}
            </ActionButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

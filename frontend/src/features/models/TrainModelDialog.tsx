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
] as const;

// Trains on real annotated videos (landmarks + annotation events already in the
// system) instead of asking the user to supply a pre-trained artifact.
export function TrainModelDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [modelId, setModelId] = useState('cast-lstm-v6');
  const [version, setVersion] = useState('');
  const [action, setAction] = useState('OF');
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
        action,
        training_config: { epochs, batch_size: batchSize },
      },
      {
        onSuccess: (data) => {
          setOpen(false);
          navigate(`/app/models/training/${data.job_id}`);
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
          <p className="text-xs text-slate-500">
            O treino usa os vídeos já anotados no sistema (landmarks extraídos + eventos
            de anotação) para esta ação. Não é necessário fornecer um artefato — ele é
            gerado e registrado automaticamente como <strong>draft</strong> ao final.
          </p>

          {trainModel.isError && (
            <div className="text-red-500 text-sm font-semibold">
              {(trainModel.error as Error).message}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Model ID</label>
              <input required value={modelId} onChange={e => setModelId(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Versão (ex: 1.0)</label>
              <input required value={version} onChange={e => setVersion(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Ação</label>
              <select required value={action} onChange={e => setAction(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-md outline-none bg-white">
                {ACTIONS.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Épocas</label>
              <input type="number" min={1} value={epochs} onChange={e => setEpochs(Number(e.target.value))} className="w-full px-3 py-2 border border-slate-200 rounded-md outline-none" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Batch size</label>
              <input type="number" min={1} value={batchSize} onChange={e => setBatchSize(Number(e.target.value))} className="w-full px-3 py-2 border border-slate-200 rounded-md outline-none" />
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

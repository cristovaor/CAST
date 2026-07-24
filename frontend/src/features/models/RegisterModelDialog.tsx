import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/Dialog';
import { useRegisterModel } from './useModels';
import { ActionButton } from '@/components/ui/ActionButton';

export function RegisterModelDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [modelId, setModelId] = useState('');
  const [version, setVersion] = useState('');
  const [action, setAction] = useState('OF');
  const [artifactUri, setArtifactUri] = useState('');
  const [manifestStr, setManifestStr] = useState('{\n  "feature_names": [],\n  "feature_count": 0,\n  "sequence_length": 7,\n  "threshold": 0.5,\n  "training_config": {\n    "epochs": 40,\n    "batch_size": 34,\n    "learning_rate": 0.0001,\n    "optimizer": "adam"\n  }\n}');
  const [error, setError] = useState('');
  
  const registerModel = useRegisterModel();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    let manifest: Record<string, unknown>;
    try {
      manifest = JSON.parse(manifestStr);
    } catch {
      setError('Manifesto deve ser um JSON válido');
      return;
    }

    registerModel.mutate(
      { model_id: modelId, version, action, manifest, artifact_uri: artifactUri },
      {
        onSuccess: () => {
          setOpen(false);
          setModelId('');
          setVersion('');
          setAction('OF');
          setArtifactUri('');
        },
        onError: (mutationError: Error) => {
          setError(mutationError.message || 'Erro ao registrar modelo');
        }
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Registrar Novo Modelo (v2)</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="text-red-500 text-sm font-semibold">{error}</div>}
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Model ID (ex: cast-lstm-v6)</label>
              <input required value={modelId} onChange={e => setModelId(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Versão (ex: 1.0)</label>
              <input required value={version} onChange={e => setVersion(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Ação</label>
              <select required value={action} onChange={e => setAction(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-md outline-none bg-white">
                <option value="OF">OF (Olhos Fechados)</option>
                <option value="OC">OC (Olhando Canto)</option>
                <option value="ML">ML (Mexendo Lábios)</option>
                <option value="VR">VR (Virando Rosto)</option>
                <option value="MSO">MSO (Mexeu Sobrancelha)</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Artifact URI (MinIO path ou Local)</label>
              <input required value={artifactUri} onChange={e => setArtifactUri(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-md outline-none" placeholder="s3://models/cast-lstm-v6-OF.keras" />
            </div>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Manifesto (JSON)</label>
            <textarea rows={8} value={manifestStr} onChange={e => setManifestStr(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono text-xs outline-none" />
          </div>
          
          <DialogFooter>
            <ActionButton variant="ghost" onClick={() => setOpen(false)} type="button">Cancelar</ActionButton>
            <ActionButton variant="primary" type="submit" disabled={registerModel.isPending}>
              {registerModel.isPending ? 'Registrando...' : 'Registrar'}
            </ActionButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

import { useState, type ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/Dialog';
import type { Study, StudyStatus } from '@/types/domain';
import { useUpdateStudy } from './useStudies';

export function EditStudyDialog({ study, children }: { study: Study; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(study.name);
  const [description, setDescription] = useState(study.description ?? '');
  const [status, setStatus] = useState<StudyStatus>(study.status);
  const [protocolVersion, setProtocolVersion] = useState(study.protocol_version ?? '');
  const updateStudy = useUpdateStudy();

  const reset = () => {
    setName(study.name);
    setDescription(study.description ?? '');
    setStatus(study.status);
    setProtocolVersion(study.protocol_version ?? '');
    updateStudy.reset();
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    updateStudy.mutate(
      {
        id: study.id,
        name: name.trim(),
        description: description.trim(),
        status,
        protocol_version: protocolVersion.trim(),
      },
      { onSuccess: () => setOpen(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (next) reset(); }}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar estudo</DialogTitle>
          <DialogDescription>
            Nome, descrição, situação e protocolo serão versionados no histórico.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm font-medium text-text-primary">
            Nome
            <input required value={name} onChange={(event) => setName(event.target.value)} className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2" />
          </label>
          <label className="block text-sm font-medium text-text-primary">
            Descrição
            <textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-text-primary">
              Status
              <select value={status} onChange={(event) => setStatus(event.target.value as StudyStatus)} className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2">
                <option value="draft">Rascunho</option>
                <option value="active">Ativo</option>
                <option value="completed">Concluído</option>
                <option value="archived">Arquivado</option>
              </select>
            </label>
            <label className="block text-sm font-medium text-text-primary">
              Versão do protocolo
              <input value={protocolVersion} onChange={(event) => setProtocolVersion(event.target.value)} placeholder="1.0" className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2" />
            </label>
          </div>
          {updateStudy.isError && <p role="alert" className="text-sm text-red-600">{(updateStudy.error as Error).message}</p>}
          <DialogFooter>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-4 py-2 text-sm text-text-secondary hover:bg-surface-muted">Cancelar</button>
            <button disabled={updateStudy.isPending || !name.trim()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {updateStudy.isPending ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

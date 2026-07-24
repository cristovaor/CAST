import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/Dialog';
import { ActionButton } from '@/components/ui/ActionButton';
import { useStudies } from '@/features/studies/useStudies';
import { useCreateParticipant } from './useParticipants';

const INITIAL_FORM = {
  study_id: '',
  external_code: '',
  demographic_group: '',
};

export function CreateParticipantDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const { data: studies, isLoading: isLoadingStudies } = useStudies();
  const createParticipant = useCreateParticipant();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    createParticipant.mutate(
      {
        study_id: form.study_id,
        external_code: form.external_code.trim(),
        demographic_group: form.demographic_group.trim()
          ? { grupo: form.demographic_group.trim() }
          : undefined,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setForm(INITIAL_FORM);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cadastrar participante</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="participant-study" className="text-xs font-medium text-text-secondary">
              Estudo
            </label>
            <select
              id="participant-study"
              required
              value={form.study_id}
              onChange={(event) => setForm((current) => ({ ...current, study_id: event.target.value }))}
              disabled={isLoadingStudies}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Selecione um estudo…</option>
              {studies?.map((study) => (
                <option key={study.id} value={study.id}>{study.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="participant-code" className="text-xs font-medium text-text-secondary">
              Código pseudonimizado
            </label>
            <input
              id="participant-code"
              required
              value={form.external_code}
              onChange={(event) => setForm((current) => ({ ...current, external_code: event.target.value }))}
              placeholder="Ex: P-0207"
              className="w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="participant-group" className="text-xs font-medium text-text-secondary">
              Grupo demográfico <span className="font-normal text-slate-400">(opcional)</span>
            </label>
            <input
              id="participant-group"
              value={form.demographic_group}
              onChange={(event) => setForm((current) => ({ ...current, demographic_group: event.target.value }))}
              placeholder="Ex: Grupo controle"
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {createParticipant.isError && (
            <p className="text-xs text-red-600" role="alert">
              Não foi possível cadastrar: {(createParticipant.error as Error).message}
            </p>
          )}

          <DialogFooter>
            <ActionButton type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </ActionButton>
            <ActionButton
              type="submit"
              variant="primary"
              disabled={createParticipant.isPending || !form.study_id || !form.external_code.trim()}
            >
              {createParticipant.isPending ? 'Cadastrando…' : 'Cadastrar'}
            </ActionButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

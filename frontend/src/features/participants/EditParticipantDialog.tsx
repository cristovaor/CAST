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
import type { ConsentStatus, Participant } from '@/types/domain';
import { useUpdateParticipant } from './useParticipants';

export function EditParticipantDialog({
  participant,
  children,
}: {
  participant: Participant;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [externalCode, setExternalCode] = useState(participant.external_code);
  const [demographics, setDemographics] = useState(
    participant.demographic_group ? JSON.stringify(participant.demographic_group, null, 2) : '',
  );
  const [consentStatus, setConsentStatus] = useState<ConsentStatus>(participant.consent_status);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const updateParticipant = useUpdateParticipant();

  const reset = () => {
    setExternalCode(participant.external_code);
    setDemographics(participant.demographic_group ? JSON.stringify(participant.demographic_group, null, 2) : '');
    setConsentStatus(participant.consent_status);
    setJsonError(null);
    updateParticipant.reset();
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    let demographicGroup: Record<string, unknown> | undefined;
    if (demographics.trim()) {
      try {
        demographicGroup = JSON.parse(demographics) as Record<string, unknown>;
      } catch {
        setJsonError('Informe os metadados como um objeto JSON válido.');
        return;
      }
    }
    setJsonError(null);
    updateParticipant.mutate(
      {
        id: participant.id,
        external_code: externalCode.trim(),
        demographic_group: demographicGroup,
        consent_status: consentStatus,
      },
      { onSuccess: () => setOpen(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (next) reset(); }}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar participante</DialogTitle>
          <DialogDescription>
            Toda alteração será registrada no histórico deste participante.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm font-medium text-text-primary">
            Código
            <input
              required
              value={externalCode}
              onChange={(event) => setExternalCode(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2"
            />
          </label>
          <label className="block text-sm font-medium text-text-primary">
            Grupo demográfico (JSON)
            <textarea
              rows={5}
              value={demographics}
              onChange={(event) => setDemographics(event.target.value)}
              placeholder={'{\n  "grupo": "controle"\n}'}
              className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs"
            />
          </label>
          <label className="block text-sm font-medium text-text-primary">
            Consentimento
            <select
              value={consentStatus}
              onChange={(event) => setConsentStatus(event.target.value as ConsentStatus)}
              className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2"
            >
              <option value="pending">Pendente</option>
              <option value="accepted">Aceito</option>
              <option value="revoked">Revogado</option>
            </select>
          </label>
          {(jsonError || updateParticipant.isError) && (
            <p role="alert" className="text-sm text-red-600">
              {jsonError ?? (updateParticipant.error as Error).message}
            </p>
          )}
          <DialogFooter>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-4 py-2 text-sm text-text-secondary hover:bg-surface-muted">
              Cancelar
            </button>
            <button
              disabled={updateParticipant.isPending || !externalCode.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {updateParticipant.isPending ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

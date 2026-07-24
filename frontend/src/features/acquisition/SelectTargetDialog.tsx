import { useMemo, useState, type ReactNode } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/Dialog';
import { ActionButton } from '@/components/ui/ActionButton';
import { useSessions, type SessionListItem } from '@/features/sessions/useSessions';
import { useStudies } from '@/features/studies/useStudies';

type TargetKind = 'study' | 'session';

interface SelectTargetDialogProps {
  children: ReactNode;
  target: TargetKind;
  title: string;
  description: string;
  confirmLabel?: string;
  onSelect: (id: string, session?: SessionListItem) => void;
}

export function SelectTargetDialog({
  children,
  target,
  title,
  description,
  confirmLabel = 'Continuar',
  onSelect,
}: SelectTargetDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const studiesQuery = useStudies();
  const sessionsQuery = useSessions();

  const isLoading = target === 'study' ? studiesQuery.isLoading : sessionsQuery.isLoading;
  const isError = target === 'study' ? studiesQuery.isError : sessionsQuery.isError;
  const options = useMemo(() => {
    if (target === 'study') {
      return (studiesQuery.data ?? []).map((study) => ({
        id: study.id,
        label: study.name,
        detail: study.status,
      }));
    }
    return (sessionsQuery.data ?? []).map((session) => ({
      id: session.id,
      label: `Sessão ${shortId(session.id)}`,
      detail: `Estudo ${shortId(session.study_id)} · participante ${shortId(session.participant_id)}`,
    }));
  }, [sessionsQuery.data, studiesQuery.data, target]);

  const handleConfirm = () => {
    if (!selectedId) return;
    const session = target === 'session'
      ? sessionsQuery.data?.find((item) => item.id === selectedId)
      : undefined;
    onSelect(selectedId, session);
    setOpen(false);
    setSelectedId('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="bg-surface text-text-primary border-border">
        <DialogHeader>
          <DialogTitle className="text-text-primary">{title}</DialogTitle>
          <DialogDescription className="text-text-secondary">{description}</DialogDescription>
        </DialogHeader>

        <div className="py-2">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-text-secondary">
              <Loader2 size={18} className="animate-spin" />
              Carregando opções…
            </div>
          ) : isError ? (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle size={17} />
              Não foi possível carregar as opções.
            </div>
          ) : options.length === 0 ? (
            <p className="rounded-lg border border-border bg-surface-muted p-4 text-sm text-text-secondary">
              {target === 'study'
                ? 'Nenhum estudo disponível. Crie um estudo antes de continuar.'
                : 'Nenhuma sessão disponível. Crie uma sessão antes de continuar.'}
            </p>
          ) : (
            <label className="block space-y-2 text-sm font-medium text-text-primary">
              {target === 'study' ? 'Estudo' : 'Sessão'}
              <select
                value={selectedId}
                onChange={(event) => setSelectedId(event.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text-primary outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Selecione…</option>
                {options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label} — {option.detail}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <DialogFooter>
          <ActionButton type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </ActionButton>
          <ActionButton
            type="button"
            variant="primary"
            disabled={!selectedId || isLoading}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </ActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function shortId(value: string) {
  return value.length > 8 ? `${value.slice(0, 8)}…` : value;
}

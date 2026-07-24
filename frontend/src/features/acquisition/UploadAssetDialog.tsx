import { useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, UploadCloud } from 'lucide-react';
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
import { useSessions } from '@/features/sessions/useSessions';
import { useProxyVideoUpload } from '@/features/videos/useVideos';
import { useUploadEEG } from '@/features/eeg/useEEG';

type AssetKind = 'video' | 'eeg';

interface UploadAssetDialogProps {
  children: ReactNode;
  kind: AssetKind;
  onUploaded?: (sessionId: string) => void;
}

export function UploadAssetDialog({ children, kind, onUploaded }: UploadAssetDialogProps) {
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const sessions = useSessions();
  const videoUpload = useProxyVideoUpload();
  const eegUpload = useUploadEEG();
  const mutation = kind === 'video' ? videoUpload : eegUpload;
  const label = kind === 'video' ? 'vídeo' : 'EEG';

  const reset = () => {
    setSessionId('');
    setFile(null);
    setError(null);
    setSuccess(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen && !mutation.isPending) reset();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const session = sessions.data?.find((item) => item.id === sessionId);
    if (!session || !file) return;

    setError(null);
    setSuccess(false);
    try {
      await mutation.mutateAsync({
        participant_id: session.participant_id,
        session_id: session.id,
        file,
      });
      setSuccess(true);
      onUploaded?.(session.id);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : `Falha no upload de ${label}.`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="bg-surface text-text-primary border-border">
        <DialogHeader>
          <DialogTitle className="text-text-primary">Importar {label}</DialogTitle>
          <DialogDescription className="text-text-secondary">
            Escolha a sessão de destino e envie o arquivo para a API do CAST.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block space-y-2 text-sm font-medium text-text-primary">
            Sessão de destino
            <select
              required
              value={sessionId}
              onChange={(event) => setSessionId(event.target.value)}
              disabled={sessions.isLoading || mutation.isPending}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text-primary outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Selecione…</option>
              {(sessions.data ?? []).map((session) => (
                <option key={session.id} value={session.id}>
                  Sessão {shortId(session.id)} — estudo {shortId(session.study_id)}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-2 text-sm font-medium text-text-primary">
            Arquivo
            <span className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border bg-surface-muted px-4 py-5 text-text-secondary hover:border-blue-400">
              <UploadCloud size={20} />
              <span className="min-w-0 truncate">
                {file?.name ?? (kind === 'video' ? 'Selecionar MP4, WebM ou outro vídeo' : 'Selecionar EDF, CSV, FIF ou BrainVision')}
              </span>
              <input
                required
                type="file"
                className="sr-only"
                accept={kind === 'video' ? 'video/*' : '.edf,.csv,.fif,.vhdr,.eeg,.set'}
                disabled={mutation.isPending}
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setError(null);
                  setSuccess(false);
                }}
              />
            </span>
          </label>

          {sessions.isError && (
            <p className="flex items-center gap-2 text-sm text-red-600">
              <AlertCircle size={16} /> Não foi possível carregar as sessões.
            </p>
          )}
          {error && (
            <p className="flex items-center gap-2 text-sm text-red-600">
              <AlertCircle size={16} /> {error}
            </p>
          )}
          {success && (
            <p className="flex items-center gap-2 text-sm text-emerald-600">
              <CheckCircle2 size={16} /> Upload concluído e vinculado à sessão.
            </p>
          )}

          <DialogFooter>
            <ActionButton type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
              {success ? 'Fechar' : 'Cancelar'}
            </ActionButton>
            {!success && (
              <ActionButton
                type="submit"
                variant="primary"
                disabled={!sessionId || !file || mutation.isPending}
              >
                {mutation.isPending ? 'Enviando…' : `Enviar ${label}`}
              </ActionButton>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function shortId(value: string) {
  return value.length > 8 ? `${value.slice(0, 8)}…` : value;
}

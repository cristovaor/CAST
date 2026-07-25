import { useState } from 'react';
import { CheckCircle2, RadioTower, ShieldAlert, ShieldCheck, ShieldQuestion, Wand2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EEGSyncControl } from '@/features/eeg/components/EEGSyncControl';
import { useDetectSync, useSync, useSyncDecision } from '../useMultimodal';
import { cn } from '@/lib/utils';

interface SyncStatusPanelProps {
  sessionId?: string;
  eegId?: string;
}

const STATE_META: Record<string, { label: string; icon: typeof ShieldCheck; className: string }> = {
  not_synced: { label: 'Não sincronizado', icon: ShieldQuestion, className: 'text-text-muted bg-surface-muted' },
  auto_available: { label: 'Sugestão automática disponível', icon: Wand2, className: 'text-amber-600 bg-amber-500/10' },
  in_review: { label: 'Em revisão', icon: ShieldAlert, className: 'text-amber-600 bg-amber-500/10' },
  synced: { label: 'Sincronizado', icon: ShieldCheck, className: 'text-emerald-600 bg-emerald-500/10' },
  synced_with_caveats: { label: 'Sincronizado (com ressalvas)', icon: ShieldAlert, className: 'text-amber-600 bg-amber-500/10' },
  sync_failed: { label: 'Falha na sincronização', icon: ShieldAlert, className: 'text-danger bg-danger-light' },
};

export function SyncStatusPanel({ sessionId, eegId }: SyncStatusPanelProps) {
  const { data: sync, isLoading } = useSync(sessionId);
  const detectSync = useDetectSync(sessionId);
  const syncDecision = useSyncDecision(sessionId);
  const [justification, setJustification] = useState('');

  if (!eegId) return null;

  const state = sync?.state ?? 'not_synced';
  const meta = STATE_META[state] ?? STATE_META.not_synced;
  const Icon = meta.icon;
  const canDecide = state === 'auto_available' || state === 'in_review';

  const handleDecision = (approve: boolean) => {
    if (!justification.trim()) return;
    syncDecision.mutate(
      { approve, justification: justification.trim() },
      { onSuccess: () => setJustification('') },
    );
  };

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <RadioTower size={15} className="text-primary" />
          Sincronização EEG × Vídeo
        </CardTitle>
        <p className="text-xs text-text-muted">
          Estado do offset temporal entre as duas fontes, com deteção automática opcional.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className={cn('flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold', meta.className)}>
          <Icon size={14} />
          {meta.label}
          {sync?.method && <span className="font-normal opacity-75">· método: {sync.method}</span>}
          {typeof sync?.confidence === 'number' && (
            <span className="font-normal opacity-75">· confiança {(sync.confidence * 100).toFixed(0)}%</span>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-muted px-3 py-2">
          <EEGSyncControl eegId={eegId} />
          <button
            type="button"
            onClick={() => detectSync.mutate()}
            disabled={!sessionId || detectSync.isPending || isLoading}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Wand2 size={13} />
            {detectSync.isPending ? 'Detectando…' : 'Detectar automaticamente'}
          </button>
        </div>

        {canDecide && (
          <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="text-xs text-text-secondary">
              {state === 'auto_available'
                ? 'Uma sugestão de offset foi calculada por correlação cruzada. Justifique e aprove ou rejeite.'
                : 'Este offset está em revisão e precisa de decisão do pesquisador.'}
            </p>
            <input
              type="text"
              value={justification}
              onChange={(event) => setJustification(event.target.value)}
              placeholder="Justificativa (obrigatória para aprovar ou rejeitar)"
              className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleDecision(true)}
                disabled={!justification.trim() || syncDecision.isPending}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCircle2 size={13} />
                Aprovar
              </button>
              <button
                type="button"
                onClick={() => handleDecision(false)}
                disabled={!justification.trim() || syncDecision.isPending}
                className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                Rejeitar
              </button>
            </div>
          </div>
        )}

        {sync && sync.anchors.length > 0 && (
          <p className="text-[11px] text-text-muted">
            {sync.anchors.length} âncora{sync.anchors.length === 1 ? '' : 's'} manual{sync.anchors.length === 1 ? '' : 'is'} registrada{sync.anchors.length === 1 ? '' : 's'}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

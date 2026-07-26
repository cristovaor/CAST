import { CheckCircle2, LockKeyhole } from 'lucide-react';
import { useEEGData } from '../useEEG';

interface EEGSyncControlProps {
  eegId?: string;
}

// The workspace mirrors the approved mapping. Fine adjustments must be
// submitted as a new audited manual/semi-automatic run on SyncPage.
export function EEGSyncControl({ eegId }: EEGSyncControlProps) {
  const { data } = useEEGData(eegId);
  if (!eegId || !data) return null;

  const mapping = data.sync_transform;
  return (
    <div className="flex items-center gap-2 text-[11px] text-slate-400" title="Ajustes são feitos por um novo run auditável na página de sincronização">
      {mapping.approved ? <CheckCircle2 className="text-emerald-400" size={13} /> : <LockKeyhole size={13} />}
      <span className="uppercase tracking-wide">Sync EEG</span>
      <span className="font-mono tabular-nums text-slate-200">
        {mapping.offset_ms > 0 ? '+' : ''}{mapping.offset_ms} ms
      </span>
      {mapping.drift_ms_per_min !== 0 && (
        <span className="font-mono tabular-nums text-slate-400">
          {mapping.drift_ms_per_min > 0 ? '+' : ''}{mapping.drift_ms_per_min} ms/min
        </span>
      )}
      <span className="text-slate-500">{mapping.approved ? 'aprovado' : 'sem aprovação'}</span>
    </div>
  );
}

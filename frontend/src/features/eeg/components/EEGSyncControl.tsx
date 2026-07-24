import { useEEGData, useUpdateEEGOffset } from '../useEEG';
import { Minus, Plus, RotateCcw } from 'lucide-react';

interface EEGSyncControlProps {
  eegId?: string;
}

// Fine/coarse nudges for aligning the EEG stream with the video timeline.
const STEPS = [-100, -10, 10, 100];

export function EEGSyncControl({ eegId }: EEGSyncControlProps) {
  const { data } = useEEGData(eegId);
  const { mutate, isPending } = useUpdateEEGOffset(eegId);

  if (!eegId || !data) return null;

  const offset = data.sync_offset_ms || 0;
  const nudge = (delta: number) => mutate(offset + delta);

  return (
    <div className="flex items-center gap-2 text-slate-300">
      <span className="text-[11px] uppercase tracking-wide text-slate-500">Sync EEG</span>
      <div className="flex items-center gap-1">
        {STEPS.slice(0, 2).map((s) => (
          <button
            key={s}
            onClick={() => nudge(s)}
            disabled={isPending}
            className="flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono bg-slate-800 hover:bg-slate-700 disabled:opacity-40 transition-colors"
            title={`${s} ms`}
          >
            <Minus size={9} />
            {Math.abs(s)}
          </button>
        ))}
        <span className="min-w-[4.5rem] text-center text-xs font-mono tabular-nums text-slate-200">
          {offset > 0 ? '+' : ''}{offset} ms
        </span>
        {STEPS.slice(2).map((s) => (
          <button
            key={s}
            onClick={() => nudge(s)}
            disabled={isPending}
            className="flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono bg-slate-800 hover:bg-slate-700 disabled:opacity-40 transition-colors"
            title={`+${s} ms`}
          >
            <Plus size={9} />
            {s}
          </button>
        ))}
      </div>
      {offset !== 0 && (
        <button
          onClick={() => mutate(0)}
          disabled={isPending}
          className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          title="Zerar offset"
        >
          <RotateCcw size={12} />
        </button>
      )}
    </div>
  );
}

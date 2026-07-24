import { PROVENANCE_META, type ProvenanceKind } from '@/types/research';
import { cn } from '@/lib/utils';

// Visual legend that keeps the seven kinds of data distinguishable (docs §4, §20):
// observed vs. detected vs. derived vs. model estimate vs. excluded/missing/imputed.

interface ProvenanceLegendProps {
  kinds?: ProvenanceKind[];
  className?: string;
}

const DEFAULT_KINDS: ProvenanceKind[] = [
  'video_observed', 'eeg_observed', 'human_annotation',
  'detected_event', 'derived_feature', 'model_estimate',
  'excluded', 'missing', 'imputed', 'aggregate',
];

export function ProvenanceLegend({ kinds = DEFAULT_KINDS, className }: ProvenanceLegendProps) {
  return (
    <div className={cn('flex flex-wrap gap-x-4 gap-y-1.5', className)}>
      {kinds.map((k) => {
        const m = PROVENANCE_META[k];
        return (
          <span key={k} className="inline-flex items-center gap-1.5 text-[11px] text-slate-600">
            <span
              className="w-2.5 h-2.5 rounded-sm shrink-0 border border-black/10"
              style={{ backgroundColor: m.color }}
            />
            {m.label}
          </span>
        );
      })}
    </div>
  );
}

export function ProvenanceDot({ kind }: { kind: ProvenanceKind }) {
  const m = PROVENANCE_META[kind];
  return (
    <span
      title={m.label}
      className="inline-block w-2 h-2 rounded-full shrink-0"
      style={{ backgroundColor: m.color }}
    />
  );
}

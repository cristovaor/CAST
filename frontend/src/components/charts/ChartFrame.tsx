import { cn } from '@/lib/utils';
import type { ChartMeta } from '@/types/research';

// Wraps any scientific visualization with the mandatory metadata contract
// (docs §20): title, source, unit, sample size, filters, granularity,
// modality, dataset/pipeline/model versions and missing-data notes.
// Charts must never be shown as bare numbers without this context.

interface ChartFrameProps {
  meta: ChartMeta;
  children: React.ReactNode;
  className?: string;
  footerExtra?: React.ReactNode;
}

function MetaItem({ label, value }: { label: string; value?: string | number }) {
  if (value === undefined || value === '') return null;
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-text-muted">{label}:</span>
      <span className="font-medium text-text-secondary tabular-nums">{value}</span>
    </span>
  );
}

export function ChartFrame({ meta, children, className, footerExtra }: ChartFrameProps) {
  return (
    <figure className={cn('rounded-xl border border-border bg-surface', className)}>
      <figcaption className="px-4 pt-4 pb-2 border-b border-border">
        <h3 className="text-sm font-semibold text-text-primary leading-tight">{meta.title}</h3>
        {meta.description && (
          <p className="mt-0.5 text-xs text-text-muted leading-relaxed">{meta.description}</p>
        )}
      </figcaption>

      <div className="p-4">{children}</div>

      <div className="px-4 py-2.5 border-t border-border bg-app-bg rounded-b-xl">
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] leading-tight">
          <MetaItem label="Fonte" value={meta.source} />
          <MetaItem label="Unidade" value={meta.unit} />
          <MetaItem label="n (part.)" value={meta.sampleSize} />
          <MetaItem label="Sessões" value={meta.sessionCount} />
          <MetaItem label="Granularidade" value={meta.granularity} />
          <MetaItem label="Modalidade" value={meta.modality} />
          <MetaItem label="Dataset" value={meta.datasetVersion} />
          <MetaItem label="Pipeline" value={meta.pipelineVersion} />
          <MetaItem label="Modelo" value={meta.modelVersion} />
          <MetaItem label="Ausentes" value={meta.missingData} />
          {meta.filters?.length ? <MetaItem label="Filtros" value={meta.filters.join(', ')} /> : null}
          {meta.params &&
            Object.entries(meta.params).map(([k, v]) => <MetaItem key={k} label={k} value={v} />)}
        </div>
        {footerExtra}
      </div>
    </figure>
  );
}

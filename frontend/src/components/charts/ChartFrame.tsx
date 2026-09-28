import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('ui');
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
          <MetaItem label={t('chart.source')} value={meta.source} />
          <MetaItem label={t('chart.unit')} value={meta.unit} />
          <MetaItem label={t('chart.sampleSize')} value={meta.sampleSize} />
          <MetaItem label={t('chart.sessions')} value={meta.sessionCount} />
          <MetaItem label={t('chart.granularity')} value={meta.granularity} />
          <MetaItem label={t('chart.modality')} value={meta.modality} />
          <MetaItem label={t('chart.dataset')} value={meta.datasetVersion} />
          <MetaItem label={t('chart.pipeline')} value={meta.pipelineVersion} />
          <MetaItem label={t('chart.model')} value={meta.modelVersion} />
          <MetaItem label={t('chart.missing')} value={meta.missingData} />
          {meta.filters?.length ? <MetaItem label={t('chart.filters')} value={meta.filters.join(', ')} /> : null}
          {meta.params &&
            Object.entries(meta.params).map(([k, v]) => <MetaItem key={k} label={k} value={v} />)}
        </div>
        {footerExtra}
      </div>
    </figure>
  );
}

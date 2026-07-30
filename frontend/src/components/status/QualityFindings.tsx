import type { QualityFinding } from '@/types/research';
import { ToneBadge } from '@/components/ui/ToneBadge';
import { RefreshCw } from 'lucide-react';

// Renders quality findings with the mandatory structure (docs §9, §10):
// problem → evidence → probable impact → recommended action → reprocessable.
// Quality is never reduced to a single unexplained score.

export function QualityFindings({ findings }: { findings: QualityFinding[] }) {
  if (!findings.length) {
    return <p className="text-sm text-text-muted">Nenhum problema de qualidade registrado.</p>;
  }
  return (
    <div className="space-y-3">
      {findings.map((f) => (
        <div key={f.id} className="rounded-lg border border-border bg-surface overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-3.5 py-2 border-b border-border bg-app-bg">
            <span className="text-sm font-semibold text-text-primary">{f.issue}</span>
            <div className="flex items-center gap-2">
              {f.reprocessable && (
                <span className="inline-flex items-center gap-1 text-[10px] text-blue-600">
                  <RefreshCw size={10} /> Reprocessável
                </span>
              )}
              <ToneBadge tone={f.tone}>{toneLabel(f.tone)}</ToneBadge>
            </div>
          </div>
          <dl className="grid gap-x-4 gap-y-1.5 px-3.5 py-3 sm:grid-cols-2 text-[12px]">
            <Row label="Evidência" value={f.evidence} />
            <Row label="Impacto provável" value={f.impact} />
            <Row label="Ação recomendada" value={f.recommendation} full />
          </dl>
        </div>
      ))}
    </div>
  );
}

function Row({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <dt className="text-text-muted font-medium">{label}</dt>
      <dd className="text-text-secondary mt-0.5">{value}</dd>
    </div>
  );
}

function toneLabel(tone: string) {
  return { info: 'Informativo', warning: 'Atenção', danger: 'Crítico', success: 'OK', neutral: '—' }[tone] ?? tone;
}

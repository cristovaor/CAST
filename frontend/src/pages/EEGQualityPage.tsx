import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Activity, Waypoints, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { ToneBadge } from '@/components/ui/ToneBadge';
import { ScientificCaveat } from '@/components/ui/ScientificCaveat';
import { QualityFindings } from '@/components/status/QualityFindings';
import { QUALITY_VERDICT_META, EEG_FORMATS, type EEGChannelQuality, type EEGImportReport, type QualityVerdict, type QualityFinding } from '@/types/research';
import { useState } from 'react';
import { useSessionDetail } from '@/features/multimodal/useMultimodal';
import { useEEGAsset, useEEGQualityCheck, useSetEEGQuality, useParseEEG } from '@/features/multimodal/useMultimodal';
import { QUALITY_VERDICT_META as VERDICTS } from '@/types/research';

const CHANNEL_TONE: Record<EEGChannelQuality['status'], { tone: 'success' | 'warning' | 'danger' | 'neutral'; label: string }> = {
  good: { tone: 'success', label: 'Bom' },
  noisy: { tone: 'warning', label: 'Ruidoso' },
  flat: { tone: 'danger', label: 'Plano' },
  bad: { tone: 'danger', label: 'Ruim' },
  missing: { tone: 'neutral', label: 'Ausente' },
};

export function EEGQualityPage() {
  const { sessionId } = useParams();
  const { data: session } = useSessionDetail(sessionId);
  const eegId = session?.eeg_asset_id ?? undefined;
  const { data: eeg } = useEEGAsset(eegId);
  const qualityCheck = useEEGQualityCheck(eegId);
  const parseEEG = useParseEEG(eegId);

  const r: EEGImportReport = eeg
    ? {
        format: (eeg.eeg_format as EEGImportReport['format']) ?? 'CSV',
        device: eeg.device, manufacturer: eeg.manufacturer, model: eeg.model,
        channelCount: eeg.channel_count ?? eeg.channel_names.length,
        channelNames: eeg.channel_names,
        montage: eeg.montage, reference: eeg.reference,
        samplingRateHz: eeg.sample_rate_hz ?? 0,
        resolutionBits: eeg.resolution_bits,
        durationSeconds: eeg.duration_seconds,
        units: eeg.units, eventCount: eeg.event_count,
        hasImpedance: eeg.channel_quality.some((c) => c.impedance_kohm != null),
        hasElectrodeFile: false,
        validRatio: eeg.valid_ratio ?? 0,
        channelQuality: eeg.channel_quality.map((c) => ({
          name: c.name, status: c.status as EEGChannelQuality['status'],
          impedanceKOhm: c.impedance_kohm ?? undefined, validRatio: c.valid_ratio, notes: c.notes ?? undefined,
        })),
        criteria: eeg.quality_criteria,
        verdict: (eeg.quality_verdict as QualityVerdict) ?? 'review_required',
        findings: eeg.quality_findings as unknown as QualityFinding[],
      }
    : {
        format: 'CSV',
        channelCount: 0,
        channelNames: [],
        samplingRateHz: 0,
        validRatio: 0,
        channelQuality: [],
        criteria: [],
        verdict: 'review_required',
        findings: [],
      };

  const verdict = QUALITY_VERDICT_META[r.verdict];

  const setQuality = useSetEEGQuality(eegId);
  const [reviewVerdict, setReviewVerdict] = useState<QualityVerdict>(r.verdict);

  // Persist the researcher's reviewed decision (docs §10) — the verdict is
  // theirs, not an automatic score. Reuses the derived channel data.
  const saveDecision = () => {
    if (!eeg) return;
    setQuality.mutate({
      quality_verdict: reviewVerdict,
      valid_ratio: eeg.valid_ratio ?? 0,
      channel_quality: eeg.channel_quality,
      quality_findings: eeg.quality_findings,
      quality_criteria: eeg.quality_criteria,
    });
  };

  return (
    <div className="min-h-full bg-app-bg pb-12">
      <PageHeader
        title="Importação & qualidade — EEG"
        description="Avaliação independente do sinal de eletroencefalografia, com métricas por canal, segmentos afetados, percentual válido e critérios explícitos."
        context={
          <>
            <ToneBadge tone={verdict.tone}>{verdict.label}</ToneBadge>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-text-muted"><Activity size={12} /> {r.device}</span>
            <span className="text-[11px] text-text-muted">{r.channelCount} canais · {r.samplingRateHz} Hz · {r.montage}</span>
          </>
        }
        actions={
          <div className="flex items-center gap-3">
            <Link to={`/app/sessions/${sessionId}`} className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary">
              <ArrowLeft size={15} /> Sessão
            </Link>
            {eegId && (
              <>
                <button
                  onClick={() => parseEEG.mutate({ sync: true })}
                  disabled={parseEEG.isPending}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-app-bg disabled:opacity-50"
                  title="Extrai metadados e qualidade do arquivo (EDF/BrainVision/FIF/CSV)"
                >
                  <RefreshCw size={14} className={parseEEG.isPending ? 'animate-spin' : ''} /> Reprocessar arquivo
                </button>
                <button
                  onClick={() => qualityCheck.mutate()}
                  disabled={qualityCheck.isPending}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-app-bg disabled:opacity-50"
                >
                  <RefreshCw size={14} className={qualityCheck.isPending ? 'animate-spin' : ''} /> Reavaliar qualidade
                </button>
              </>
            )}
            <Link to={`/app/sessions/${sessionId}/sync`} className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
              <Waypoints size={14} /> Sincronizar
            </Link>
          </div>
        }
      />

      <div className="px-6 pt-6 space-y-6">
        <ScientificCaveat variant="quality" compact />

        {/* Metadata + summary */}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-border bg-surface p-4 lg:col-span-2">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-text-muted mb-3">Metadados do registro</h3>
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-3 text-[12px]">
              <Meta label="Formato" value={r.format} />
              <Meta label="Fabricante" value={r.manufacturer} />
              <Meta label="Modelo" value={r.model} />
              <Meta label="Referência" value={r.reference} />
              <Meta label="Resolução" value={`${r.resolutionBits} bits`} />
              <Meta label="Unidades" value={r.units} />
              <Meta label="Início" value={r.startTimestamp?.slice(0, 19).replace('T', ' ')} />
              <Meta label="Duração" value={`${Math.round((r.durationSeconds ?? 0) / 60)} min`} />
              <Meta label="Eventos" value={r.eventCount} />
              <Meta label="Impedância" value={r.hasImpedance ? 'Disponível' : '—'} />
              <Meta label="Eletrodos" value={r.hasElectrodeFile ? 'Arquivo presente' : '—'} />
            </dl>
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-[11px] text-text-muted mb-1">Formatos suportados conceitualmente</p>
              <div className="flex flex-wrap gap-1.5">
                {EEG_FORMATS.map((f) => (
                  <span key={f} className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${f === r.format ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-app-bg border-border text-text-muted'}`}>{f}</span>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface p-4">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-text-muted mb-3">Percentual válido</h3>
            <div className="flex items-end gap-2">
              <span className="text-4xl font-bold text-text-primary tabular-nums">{Math.round(r.validRatio * 100)}</span>
              <span className="text-text-muted mb-1.5">% do registro</span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-surface-muted overflow-hidden">
              <div className="h-full bg-emerald-500" style={{ width: `${r.validRatio * 100}%` }} />
            </div>
            <div className="mt-4">
              <p className="text-[11px] text-text-muted mb-1.5">Critérios utilizados</p>
              <ul className="space-y-1">
                {r.criteria.map((c) => (
                  <li key={c} className="text-[11px] text-text-secondary font-mono leading-tight">• {c}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Per-channel quality */}
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-text-primary">Qualidade por canal</h3>
            <p className="text-[11px] text-text-muted">A qualidade não é reduzida a um único score — cada canal é avaliado separadamente.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-text-muted border-b border-border">
                  <th scope="col" className="px-4 py-2 font-medium">Canal</th>
                  <th scope="col" className="px-4 py-2 font-medium">Status</th>
                  <th scope="col" className="px-4 py-2 font-medium">Impedância</th>
                  <th scope="col" className="px-4 py-2 font-medium">Válido</th>
                  <th scope="col" className="px-4 py-2 font-medium">Observações</th>
                </tr>
              </thead>
              <tbody>
                {r.channelQuality.map((ch) => {
                  const t = CHANNEL_TONE[ch.status];
                  return (
                    <tr key={ch.name} className="border-b border-border last:border-0 hover:bg-app-bg">
                      <td className="px-4 py-2 font-mono font-semibold text-text-secondary">{ch.name}</td>
                      <td className="px-4 py-2"><ToneBadge tone={t.tone}>{t.label}</ToneBadge></td>
                      <td className="px-4 py-2 tabular-nums text-text-secondary">{ch.impedanceKOhm != null ? `${ch.impedanceKOhm.toFixed(1)} kΩ` : '—'}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 rounded-full bg-surface-muted overflow-hidden">
                            <div className={`h-full ${ch.validRatio > 0.85 ? 'bg-emerald-500' : ch.validRatio > 0.5 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${ch.validRatio * 100}%` }} />
                          </div>
                          <span className="tabular-nums text-text-muted">{Math.round(ch.validRatio * 100)}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-text-muted">{ch.notes ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Findings */}
        <div>
          <h3 className="text-sm font-semibold text-text-primary mb-3">Problemas identificados & decisões</h3>
          <QualityFindings findings={r.findings} />
        </div>

        {/* Reviewer decision — only when connected to a real EEG asset */}
        {eeg && (
          <div className="rounded-xl border border-border bg-surface p-4">
            <h3 className="text-sm font-semibold text-text-primary">Decisão do pesquisador</h3>
            <p className="text-[12px] text-text-muted mt-0.5 mb-3">
              O veredito de qualidade é uma decisão do pesquisador, registrada com os critérios utilizados — não um score automático.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {(Object.keys(VERDICTS) as QualityVerdict[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setReviewVerdict(v)}
                  className={`rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors ${reviewVerdict === v ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-border text-text-secondary hover:bg-app-bg'}`}
                >
                  {VERDICTS[v].label}
                </button>
              ))}
              <button
                onClick={saveDecision}
                disabled={setQuality.isPending}
                className="ml-auto rounded-md bg-slate-900 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {setQuality.isPending ? 'Salvando…' : 'Registrar decisão'}
              </button>
            </div>
            {setQuality.isSuccess && <p className="mt-2 text-[11px] text-emerald-600">Decisão registrada.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value?: string | number }) {
  return (
    <div>
      <dt className="text-text-muted">{label}</dt>
      <dd className="font-medium text-text-secondary mt-0.5">{value ?? '—'}</dd>
    </div>
  );
}

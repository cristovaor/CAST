import { useEEGCoactivation, type EEGBandStat } from '../useEEG';
import { EEG_BANDS } from '../bands';
import { getMicroActionConfig } from '@/lib/utils';
import type { MicroAction } from '@/types/domain';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { BrainCircuit, Loader2, ArrowUp, ArrowDown } from 'lucide-react';

interface CoactivationPanelProps {
  eegId?: string;
}

function formatP(p: number): string {
  if (p < 0.001) return 'p<0.001';
  return `p=${p.toFixed(3)}`;
}

function DeltaBar({ stat }: { stat: EEGBandStat }) {
  const { delta_pct: deltaPct, p_value, cohens_d, significant } = stat;
  if (deltaPct === null) {
    return <span className="text-[11px] text-text-muted">—</span>;
  }
  const up = deltaPct >= 0;
  const width = Math.min(100, Math.abs(deltaPct)); // clamp so extremes don't overflow
  const tooltip = [
    `${deltaPct.toFixed(1)}% vs baseline`,
    p_value !== null ? formatP(p_value) : null,
    cohens_d !== null ? `d=${cohens_d.toFixed(2)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="flex items-center gap-1.5" title={tooltip}>
      <div className="relative h-2 flex-1 rounded-full bg-surface-muted">
        <div
          className={`absolute top-0 h-full rounded-full ${up ? 'bg-emerald-500' : 'bg-rose-500'} ${
            significant ? '' : 'opacity-40'
          }`}
          style={{ width: `${width}%`, left: 0 }}
        />
      </div>
      <span
        className={`inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums ${
          up ? 'text-emerald-600' : 'text-rose-600'
        } ${significant ? '' : 'opacity-50'}`}
      >
        {up ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
        {Math.abs(deltaPct).toFixed(0)}%
      </span>
      {/* Significance marker: solid star = p<0.05, else dim */}
      <span
        className={`w-3 text-center text-[11px] ${significant ? 'text-amber-500' : 'text-text-muted'}`}
        title={significant ? 'Significativo (p<0.05)' : 'Não significativo'}
      >
        {significant ? '★' : '·'}
      </span>
    </div>
  );
}

export function CoactivationPanel({ eegId }: CoactivationPanelProps) {
  const { data, isLoading, error } = useEEGCoactivation(eegId);

  if (!eegId) return null;

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <BrainCircuit size={15} className="text-violet-500" />
          Co-ativação EEG × Microações
        </CardTitle>
        <p className="text-xs text-text-muted">
          Variação da potência média de cada banda durante as microações vs. linha de base.
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading && (
          <div className="h-24 flex items-center justify-center text-muted-foreground text-sm">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Calculando co-ativação...
          </div>
        )}

        {error && (
          <div className="h-24 flex items-center justify-center text-red-500 text-sm text-center px-4">
            Não foi possível calcular a co-ativação (é preciso EEG e eventos do modelo).
          </div>
        )}

        {data && data.actions.length === 0 && (
          <div className="h-20 flex items-center justify-center text-text-muted text-sm text-center px-4">
            Nenhuma microação detectada para cruzar com o EEG.
          </div>
        )}

        {data && data.actions.length > 0 && (
          <div className="space-y-4">
            {data.actions.map((row) => {
              const cfg = getMicroActionConfig(row.action as MicroAction);
              return (
                <div key={row.action} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-primary">
                      <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: cfg.color }} />
                      {cfg.label}
                    </span>
                    <span className="text-[11px] text-text-muted">
                      {row.n_events} evento{row.n_events === 1 ? '' : 's'} · {(row.total_ms / 1000).toFixed(1)}s
                    </span>
                  </div>
                  <div className="space-y-1.5 pl-1">
                    {EEG_BANDS.filter((b) => data.bands.includes(b.key)).map((band) => (
                      <div key={band.key} className="grid grid-cols-[3.5rem_1fr] items-center gap-2">
                        <span className="inline-flex items-center gap-1 text-[11px] text-text-secondary">
                          <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: band.color }} />
                          {band.label}
                        </span>
                        {row.bands[band.key] ? (
                          <DeltaBar stat={row.bands[band.key]} />
                        ) : (
                          <span className="text-[11px] text-text-muted">—</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            <p className="text-[10px] text-text-muted border-t border-border pt-2 leading-relaxed">
              <span className="text-amber-500">★</span> = diferença significativa (teste de permutação, p&lt;{data.alpha}).
              Barras esbatidas = não significativas. Linha de base: {data.baseline_sample_count.toLocaleString('pt-BR')} amostras
              fora de microações; transformação aprovada: offset {data.sync_transform.offset_ms} ms,
              drift {data.sync_transform.drift_ms_per_min} ms/min.
              Tooltip mostra p e o tamanho de efeito (Cohen&apos;s d).
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

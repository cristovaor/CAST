import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Download, Loader2, Play } from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { ChartFrame } from '@/components/charts/ChartFrame';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ScientificCaveat } from '@/components/ui/ScientificCaveat';
import { ToneBadge } from '@/components/ui/ToneBadge';
import { useProcessingJobStream } from '@/features/jobs/useProcessingJobStream';
import {
  downloadEEGArtifact,
  useCreateEEGAnalysisRun,
  useCreateStudyEEGAnalysisRun,
  useEEGAnalysisArtifacts,
  useEEGAnalysisResult,
  useEEGAnalysisRuns,
  useStudyEEGAnalysisRuns,
  type EEGAnalysisArtifact,
  type EEGAnalysisRun,
  type EEGResultEnvelope,
} from '../useEEG';
import { CoactivationPanel } from './CoactivationPanel';

const TABS = [
  'Sinal e qualidade',
  'Espectro e bandas',
  'Séries temporais',
  'Topografia',
  'Estatística',
  'MDMP',
  'Multimodal',
] as const;
type Tab = typeof TABS[number];

const STATUS_META = {
  queued: { label: 'Na fila', tone: 'neutral' },
  running: { label: 'Processando', tone: 'info' },
  succeeded: { label: 'Concluído', tone: 'success' },
  partial: { label: 'Parcial', tone: 'warning' },
  failed: { label: 'Falhou', tone: 'danger' },
  canceled: { label: 'Cancelado', tone: 'neutral' },
} as const;

export function EEGAnalysisWorkspace({
  eegId,
  studyId,
}: {
  eegId?: string;
  studyId?: string;
}) {
  const individualRuns = useEEGAnalysisRuns(eegId);
  const studyRuns = useStudyEEGAnalysisRuns(studyId);
  const createIndividualRun = useCreateEEGAnalysisRun(eegId);
  const createStudyRun = useCreateStudyEEGAnalysisRun(studyId);
  const runsQuery = eegId ? individualRuns : studyRuns;
  const createRun = eegId ? createIndividualRun : createStudyRun;
  const [selectedRunId, setSelectedRunId] = useState<string>();
  const [profile, setProfile] = useState<'custom' | 'pyp_eeg_v2'>('custom');
  const [parametersText, setParametersText] = useState('{}');
  const [activeTab, setActiveTab] = useState<Tab>('Sinal e qualidade');
  const parameters = useMemo(() => {
    try {
      const parsed = JSON.parse(parametersText);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  }, [parametersText]);
  const runs = runsQuery.data ?? [];
  const selectedRun = runs.find((run) => run.id === selectedRunId) ?? runs[0];

  useEffect(() => {
    if (!selectedRunId && runs[0]) setSelectedRunId(runs[0].id);
  }, [runs, selectedRunId]);

  return (
    <section className="space-y-4" aria-label="Análises EEG v2">
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Pipeline científico EEG</h2>
            <p className="mt-1 max-w-2xl text-xs text-text-muted">
              Crie uma execução reproduzível. O preset original só é aplicado quando selecionado;
              estudos genéricos permanecem configuráveis.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-text-secondary" htmlFor="eeg-profile">Perfil</label>
            <select
              id="eeg-profile"
              value={profile}
              onChange={(event) => setProfile(event.target.value as typeof profile)}
              className="rounded-md border border-border bg-surface px-2 py-1.5 text-xs"
            >
              <option value="custom">Personalizado</option>
              <option value="pyp_eeg_v2">Pyp-EEG v2 (preset explícito)</option>
            </select>
            <button
              type="button"
              onClick={() => createRun.mutate(
                {
                  profile,
                  pipeline: studyId ? 'study' : 'individual',
                  parameters: parameters ?? {},
                  reuse_completed: true,
                },
                { onSuccess: (run) => setSelectedRunId(run.id) },
              )}
              disabled={createRun.isPending || !parameters || (!eegId && !studyId)}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {createRun.isPending ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
              Criar análise
            </button>
          </div>
        </div>

        <details className="mt-3 rounded-lg border border-border bg-surface-muted p-3">
          <summary className="cursor-pointer text-xs font-medium text-text-secondary">
            Parâmetros avançados (JSON)
          </summary>
          <textarea
            value={parametersText}
            onChange={(event) => setParametersText(event.target.value)}
            spellCheck={false}
            aria-label="Parâmetros científicos em JSON"
            className="mt-2 min-h-28 w-full rounded-md border border-border bg-surface p-2 font-mono text-xs"
          />
          {!parameters && (
            <p role="alert" className="mt-1 text-xs text-danger">
              Informe um objeto JSON válido. Bandas, ROIs, blocos, grupos e contrastes não são inferidos silenciosamente.
            </p>
          )}
        </details>

        {createRun.isError && (
          <p role="alert" className="mt-3 text-xs text-danger">
            Não foi possível criar a análise. Verifique a feature flag e a completude do bundle.
          </p>
        )}

        {runs.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <span className="text-[11px] uppercase tracking-wide text-text-muted">Execução</span>
            <select
              value={selectedRun?.id ?? ''}
              onChange={(event) => setSelectedRunId(event.target.value)}
              className="min-w-60 rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-xs"
            >
              {runs.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.id.slice(0, 8)} · {STATUS_META[run.status].label} · {run.profile}
                </option>
              ))}
            </select>
            {selectedRun && (
              <ToneBadge tone={STATUS_META[selectedRun.status].tone}>
                {STATUS_META[selectedRun.status].label}
              </ToneBadge>
            )}
          </div>
        )}
        {selectedRun?.job_id && ['queued', 'running'].includes(selectedRun.status) && (
          <RunProgress jobId={selectedRun.job_id} />
        )}
      </div>

      {!selectedRun ? (
        <div className="rounded-xl border border-border bg-surface">
          <EmptyState
            variant="empty"
            title="Nenhuma análise executada"
            description="Crie uma análise individual para disponibilizar espectros, potência, séries, topografia e proveniência."
            className="py-12"
          />
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border bg-surface p-1">
            <div className="flex min-w-max gap-1" role="tablist" aria-label="Resultados EEG">
              {TABS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab}
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-lg px-3 py-2 text-xs font-medium ${
                    activeTab === tab ? 'bg-blue-50 text-blue-700' : 'text-text-secondary hover:bg-surface-muted'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
          <EEGRunResult tab={activeTab} run={selectedRun} eegId={eegId} />
        </>
      )}
    </section>
  );
}

function RunProgress({ jobId }: { jobId: string }) {
  const { data, error } = useProcessingJobStream(jobId);
  return (
    <div className="mt-3 rounded-lg bg-surface-muted p-3">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="inline-flex items-center gap-1.5 text-text-secondary">
          <Loader2 size={13} className="animate-spin" /> {data.currentStep}
        </span>
        <span className="font-mono tabular-nums">{Math.round(data.progress)}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
        <div className="h-full bg-blue-500" style={{ width: `${data.progress}%` }} />
      </div>
      {error && <p className="mt-2 text-[11px] text-danger">{error}</p>}
    </div>
  );
}

function EEGRunResult({ tab, run, eegId }: { tab: Tab; run: EEGAnalysisRun; eegId?: string }) {
  const artifactsQuery = useEEGAnalysisArtifacts(run.id);
  const power = useEEGAnalysisResult(run.id, 'power');
  const timeseries = useEEGAnalysisResult(run.id, 'timeseries');
  const stats = useEEGAnalysisResult(run.id, 'stats');
  const topomaps = useEEGAnalysisResult(run.id, 'topomaps');
  const mdmp = useEEGAnalysisResult(run.id, 'mdmp');

  if (['queued', 'running'].includes(run.status)) {
    return <ResultState title="Análise em processamento" description="Os artefatos aparecerão conforme cada etapa for persistida." loading />;
  }
  if (run.status === 'failed') {
    return <ResultState title="A análise falhou" description={run.error_message ?? 'Consulte os logs do job para detalhes.'} error />;
  }
  if (run.status === 'canceled') {
    return <ResultState title="Análise cancelada" description="Os artefatos completos produzidos antes do cancelamento permanecem disponíveis." />;
  }

  const artifacts = artifactsQuery.data ?? [];
  const provenance = <RunProvenance run={run} artifacts={artifacts} />;

  if (tab === 'Sinal e qualidade') {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Estado" value={STATUS_META[run.status].label} />
          <Metric label="Arquivos de entrada" value={run.input_manifest.length} />
          <Metric label="Artefatos" value={artifacts.length} />
        </div>
        {run.warnings.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-800">
              <AlertTriangle size={15} /> Ressalvas estruturadas
            </h3>
            <ul className="mt-2 space-y-1 text-xs text-amber-900">
              {run.warnings.map((warning, index) => <li key={`${warning}-${index}`}>• {warning}</li>)}
            </ul>
          </div>
        )}
        {provenance}
      </div>
    );
  }
  if (tab === 'Espectro e bandas') return <PowerResult query={power} run={run} footer={provenance} />;
  if (tab === 'Séries temporais') return <TimeseriesResult query={timeseries} run={run} footer={provenance} />;
  if (tab === 'Topografia') {
    return <ArtifactResult query={topomaps} run={run} artifacts={artifacts} kind="topomap-png" title="Topomapas científicos" footer={provenance} />;
  }
  if (tab === 'Estatística') return <StatsResult query={stats} run={run} footer={provenance} />;
  if (tab === 'MDMP') return <MDMPResult query={mdmp} run={run} artifacts={artifacts} footer={provenance} />;
  if (!eegId) {
    return (
      <ResultState
        title="Multimodal requer uma sessão"
        description="Selecione uma execução individual com EEG, vídeo e sincronização aprovada."
      />
    );
  }
  return (
    <div className="space-y-4">
      <CoactivationPanel eegId={eegId} runId={run.id} />
      <ScientificCaveat variant="association" compact>
        As janelas EEG × microações usam somente a transformação temporal aprovada. Associação temporal não implica causalidade.
      </ScientificCaveat>
      {provenance}
    </div>
  );
}

type ResultQuery = { data?: EEGResultEnvelope; isLoading: boolean; isError: boolean };

function PowerResult({ query, run, footer }: { query: ResultQuery; run: EEGAnalysisRun; footer: React.ReactNode }) {
  const rows = (query.data?.power ?? []) as {
    level?: string; roi?: string; channel?: string; band?: string;
    absolute_power?: number; relative_power?: number;
  }[];
  const roiRows = rows.filter((row) => row.level === 'roi');
  const chartRows = roiRows.length ? roiRows : rows.slice(0, 40);
  if (!chartRows.length) return <QueryState query={query} run={run} title="Potência indisponível" />;
  return (
    <div className="space-y-4">
      <ChartFrame meta={{
        title: 'Potência por banda e região',
        description: 'Potência absoluta derivada pelo método de Welch.',
        source: `run ${run.id.slice(0, 8)}`,
        unit: query.data?.units?.absolute_power ?? 'uV²',
        filters: [`perfil ${run.profile}`],
        modality: 'eeg',
        pipelineVersion: run.package_version ?? undefined,
      }}>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartRows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={(row) => `${row.roi ?? row.channel} · ${row.band}`} hide={chartRows.length > 16} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="absolute_power" name="Potência absoluta" fill="#2563eb" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartFrame>
      {footer}
    </div>
  );
}

function TimeseriesResult({ query, run, footer }: { query: ResultQuery; run: EEGAnalysisRun; footer: React.ReactNode }) {
  const points = query.data?.points ?? [];
  const series = useMemo(() => {
    const grouped = new Map<number, Record<string, number>>();
    for (const point of points.slice(0, 5000)) {
      const target = grouped.get(point.time_seconds) ?? { time_seconds: point.time_seconds };
      target[`${point.roi ?? point.channel ?? 'sinal'}:${point.band}`] = point.value;
      grouped.set(point.time_seconds, target);
    }
    return [...grouped.values()];
  }, [points]);
  const keys = series[0] ? Object.keys(series[0]).filter((key) => key !== 'time_seconds').slice(0, 6) : [];
  if (!series.length) return <QueryState query={query} run={run} title="Série temporal indisponível" />;
  return (
    <div className="space-y-4">
      <ChartFrame meta={{
        title: 'Potência deslizante',
        description: `Visualização limitada a ${points.length.toLocaleString('pt-BR')} pontos retornados pela API multirresolução.`,
        source: `run ${run.id.slice(0, 8)}`,
        unit: query.data?.units?.value ?? 'uV²',
        granularity: 'janela deslizante',
        modality: 'eeg',
        pipelineVersion: run.package_version ?? undefined,
      }}>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time_seconds" unit="s" />
              <YAxis />
              <Tooltip />
              <Legend />
              {keys.map((key, index) => (
                <Line key={key} type="monotone" dataKey={key} dot={false} stroke={['#2563eb', '#7c3aed', '#059669', '#dc2626', '#d97706', '#0891b2'][index]} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ChartFrame>
      {footer}
    </div>
  );
}

function StatsResult({ query, run, footer }: { query: ResultQuery; run: EEGAnalysisRun; footer: React.ReactNode }) {
  const rows = query.data?.results ?? [];
  if (!rows.length) return <QueryState query={query} run={run} title="Estatística incompatível ou ausente" />;
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-xs">
          <thead className="border-b border-border bg-surface-muted text-left text-text-muted">
            <tr>{['Contraste', 'Banda', 'ROI', 'Teste', 'n', 'Diferença', 'p', 'q', 'Cohen d_z'].map((label) => <th key={label} className="px-3 py-2">{label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-b border-border last:border-0">
                {['contrast', 'band', 'roi', 'test', 'n', 'difference', 'p', 'q', 'cohen_d_z'].map((key) => (
                  <td key={key} className="px-3 py-2 font-mono">{formatCell(row[key])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ScientificCaveat variant="association" compact>
        Resultados incluem premissas, correção FDR e tamanho de efeito; significância estatística não estabelece relevância clínica nem causalidade.
      </ScientificCaveat>
      {footer}
    </div>
  );
}

function ArtifactResult({ query, run, artifacts, kind, title, footer }: {
  query: ResultQuery; run: EEGAnalysisRun; artifacts: EEGAnalysisArtifact[];
  kind: string; title: string; footer: React.ReactNode;
}) {
  const matching = artifacts.filter((artifact) => artifact.kind === kind);
  if (!matching.length) return <QueryState query={query} run={run} title={`${title} indisponíveis`} />;
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface p-4">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-xs text-text-muted">Imagens renderizadas no backend com a montagem e as máscaras disponíveis.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {matching.map((artifact) => <ArtifactButton key={artifact.id} artifact={artifact} />)}
        </div>
      </div>
      {footer}
    </div>
  );
}

function MDMPResult({ query, run, artifacts, footer }: {
  query: ResultQuery; run: EEGAnalysisRun; artifacts: EEGAnalysisArtifact[]; footer: React.ReactNode;
}) {
  const network = query.data?.nodes?.length
    ? query.data
    : query.data?.networks?.find((item) => Array.isArray(item.nodes));
  const nodes = (network?.nodes ?? []) as { id: string; label: string }[];
  const edges = (network?.edges ?? []) as { source: string; target: string; directed: boolean }[];
  if (!nodes.length) return <QueryState query={query} run={run} title="MDMP incompatível ou indisponível" />;
  const positions = new Map(nodes.map((node, index) => {
    const angle = (index / nodes.length) * Math.PI * 2 - Math.PI / 2;
    return [node.id, { x: 200 + Math.cos(angle) * 135, y: 180 + Math.sin(angle) * 125 }] as const;
  }));
  return (
    <div className="space-y-4">
      <ChartFrame meta={{
        title: 'Rede direcionada MDMP',
        source: `run ${run.id.slice(0, 8)}`,
        sampleSize: typeof network?.sample_count === 'number' ? network.sample_count : 0,
        modality: 'eeg',
        modelVersion: run.mdmp_version ?? undefined,
        pipelineVersion: run.package_version ?? undefined,
      }}>
        <svg viewBox="0 0 400 360" className="mx-auto h-80 max-w-full" role="img" aria-label="Rede direcionada MDMP">
          <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#64748b" /></marker></defs>
          {edges.map((edge, index) => {
            const source = positions.get(edge.source);
            const target = positions.get(edge.target);
            return source && target ? <line key={index} x1={source.x} y1={source.y} x2={target.x} y2={target.y} stroke="#64748b" strokeWidth="1.5" markerEnd="url(#arrow)" /> : null;
          })}
          {nodes.map((node) => {
            const position = positions.get(node.id)!;
            return <g key={node.id}><circle cx={position.x} cy={position.y} r="24" fill="#dbeafe" stroke="#2563eb" /><text x={position.x} y={position.y + 4} textAnchor="middle" fontSize="11" fill="#1e3a8a">{node.label}</text></g>;
          })}
        </svg>
      </ChartFrame>
      <div className="flex flex-wrap gap-2">
        {artifacts.filter((artifact) => artifact.kind.startsWith('mdmp-')).map((artifact) => <ArtifactButton key={artifact.id} artifact={artifact} />)}
      </div>
      {footer}
    </div>
  );
}

function ArtifactButton({ artifact }: { artifact: EEGAnalysisArtifact }) {
  return (
    <button
      type="button"
      onClick={() => void downloadEEGArtifact(artifact)}
      className="inline-flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-left text-xs hover:bg-surface-muted"
    >
      <span><span className="block font-medium">{artifact.kind}</span><span className="font-mono text-[10px] text-text-muted">{artifact.checksum_sha256.slice(0, 12)} · {(artifact.size_bytes / 1024).toFixed(1)} KB</span></span>
      <Download size={14} />
    </button>
  );
}

function RunProvenance({ run, artifacts }: { run: EEGAnalysisRun; artifacts: EEGAnalysisArtifact[] }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold"><CheckCircle2 size={15} className="text-emerald-600" /> Proveniência</h3>
      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <Meta label="Método" value={`cast-pyp-eeg ${run.package_version ?? 'pendente'}`} />
        <Meta label="Upstream" value={run.upstream_commit?.slice(0, 12)} />
        <Meta label="MDMP" value={`${run.mdmp_version ?? '—'} · ${run.mdmp_commit?.slice(0, 8) ?? '—'}`} />
        <Meta label="Hash de entrada" value={run.input_hash.slice(0, 16)} />
        <Meta label="Perfil" value={run.profile} />
        <Meta label="Artefatos verificados" value={artifacts.length} />
        <Meta label="Exclusões/avisos" value={run.warnings.length} />
        <Meta label="Escopo" value={run.scope_type} />
      </dl>
    </div>
  );
}

function QueryState({ query, run, title }: { query: ResultQuery; run: EEGAnalysisRun; title: string }) {
  if (query.isLoading) return <ResultState title="Carregando resultado" description="Lendo o artefato versionado e seus metadados." loading />;
  return <ResultState title={title} description={run.status === 'partial' ? 'A execução terminou parcialmente; consulte as ressalvas e os artefatos válidos.' : 'Esta etapa não produziu um artefato compatível com os dados e parâmetros atuais.'} error={query.isError} />;
}

function ResultState({ title, description, loading, error }: { title: string; description: string; loading?: boolean; error?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-surface">
      <EmptyState
        variant={error ? 'error' : 'empty'}
        title={title}
        description={description}
        icon={loading ? <Loader2 size={36} className="animate-spin text-blue-500" /> : <Activity size={36} className="text-text-muted" />}
        className="py-12"
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl border border-border bg-surface p-4"><p className="text-[11px] uppercase tracking-wide text-text-muted">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{value}</p></div>;
}

function Meta({ label, value }: { label: string; value?: string | number }) {
  return <div><dt className="text-text-muted">{label}</dt><dd className="mt-0.5 break-all font-mono text-text-secondary">{value ?? '—'}</dd></div>;
}

function formatCell(value: unknown) {
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toPrecision(4);
  return value == null ? '—' : String(value);
}

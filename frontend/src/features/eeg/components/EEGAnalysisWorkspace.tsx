import { useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowRight, CheckCircle2, ChevronLeft, ChevronRight,
  CircleHelp, Download, ListFilter, Loader2, Play, RotateCcw, Search,
  SlidersHorizontal, Sparkles,
} from 'lucide-react';
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

const TAB_META: Record<Tab, { question: string; description: string }> = {
  'Sinal e qualidade': {
    question: 'O sinal é aproveitável?',
    description: 'Compare aquisição e pré-processamento e identifique os canais que merecem revisão.',
  },
  'Espectro e bandas': {
    question: 'Como a potência se distribui?',
    description: 'Explore a potência por banda e região para localizar padrões espectrais.',
  },
  'Séries temporais': {
    question: 'Como o sinal muda no tempo?',
    description: 'Observe a evolução das bandas ao longo da sessão e procure transições relevantes.',
  },
  Topografia: {
    question: 'Onde os efeitos aparecem?',
    description: 'Inspecione a distribuição espacial dos resultados na montagem de eletrodos.',
  },
  Estatística: {
    question: 'As diferenças são consistentes?',
    description: 'Revise contrastes, incerteza, correção por múltiplos testes e tamanho de efeito.',
  },
  MDMP: {
    question: 'Quais relações direcionadas emergem?',
    description: 'Explore a rede MDMP com atenção às premissas e à proveniência do modelo.',
  },
  Multimodal: {
    question: 'Como EEG e comportamento se alinham?',
    description: 'Cruze janelas EEG com microações somente quando a sincronização estiver aprovada.',
  },
};

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
  const [showSetup, setShowSetup] = useState(false);
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
  const pipelineSummary = {
    low: Number(parameters?.filter_low_hz ?? 0.5),
    high: Number(parameters?.filter_high_hz ?? 50),
    notch: Array.isArray(parameters?.notch_hz) ? parameters.notch_hz.join(', ') : '60',
    reference: String(parameters?.reference ?? 'average'),
    ica: parameters?.apply_ica === false ? 'desativada' : 'ICA/ICLabel',
  };
  const runs = runsQuery.data ?? [];
  const selectedRun = runs.find((run) => run.id === selectedRunId) ?? runs[0];
  const setupVisible = showSetup || runs.length === 0;

  return (
    <section className="space-y-4" aria-label="Análises EEG v2">
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-700">Área de análise</p>
            <h2 className="mt-1 text-sm font-semibold text-text-primary">Resultados EEG</h2>
            <p className="mt-1 max-w-2xl text-xs text-text-muted">
              Comece pela pergunta de pesquisa. Configuração e proveniência permanecem disponíveis sob demanda.
            </p>
          </div>
          {runs.length > 0 && <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSetup((current) => !current)}
              aria-expanded={setupVisible}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-muted"
            >
              <SlidersHorizontal size={13} /> {setupVisible ? 'Ocultar configuração' : 'Nova análise'}
            </button>
          </div>}
        </div>

        {setupVisible && (
          <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-text-muted" htmlFor="eeg-profile">Perfil de processamento</label>
                <select
                  id="eeg-profile"
                  value={profile}
                  onChange={(event) => setProfile(event.target.value as typeof profile)}
                  className="mt-1 block min-w-64 rounded-md border border-border bg-surface px-2 py-2 text-xs"
                >
                  <option value="custom">XDF recomendado · configurável</option>
                  <option value="pyp_eeg_v2">Pyp-EEG v2 · preset explícito</option>
                </select>
              </div>
              <button
                type="button"
                onClick={() => createRun.mutate(
                  {
                    profile,
                    pipeline: studyId ? 'study' : 'individual',
                    parameters: parameters ?? {},
                    reuse_completed: true,
                  },
                  { onSuccess: (run) => { setSelectedRunId(run.id); setShowSetup(false); } },
                )}
                disabled={createRun.isPending || !parameters || (!eegId && !studyId)}
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {createRun.isPending ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                Executar pipeline
              </button>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <PipelineStep label="Filtro" value={`${pipelineSummary.low}–${pipelineSummary.high} Hz`} />
              <PipelineStep label="Notch" value={`${pipelineSummary.notch} Hz`} />
              <PipelineStep label="Referência" value={pipelineSummary.reference === 'average' ? 'média comum' : pipelineSummary.reference} />
              <PipelineStep label="Artefatos" value={pipelineSummary.ica} />
              <PipelineStep label="Saída" value="FIF + métricas" />
            </div>

            <details className="mt-3 rounded-lg border border-border bg-surface p-3">
              <summary className="cursor-pointer text-xs font-medium text-text-secondary">
                Ajustes avançados e JSON
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
              <button
                type="button"
                onClick={() => { setProfile('custom'); setParametersText('{}'); }}
                className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-[11px] font-medium text-text-secondary hover:bg-app-bg"
              >
                <RotateCcw size={12} /> Restaurar padrão recomendado para XDF
              </button>
            </details>
          </div>
        )}

        {createRun.isError && (
          <p role="alert" className="mt-3 text-xs text-danger">
            Não foi possível criar a análise. Verifique a feature flag e a completude do bundle.
          </p>
        )}

        {runs.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <span className="text-[11px] uppercase tracking-wide text-text-muted">Resultados da execução</span>
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
          <ResearchQuestionNavigator activeTab={activeTab} onChange={setActiveTab} />
          <EEGRunResult tab={activeTab} run={selectedRun} eegId={eegId} onSelectTab={setActiveTab} />
        </>
      )}
    </section>
  );
}

export function ResearchQuestionNavigator({ activeTab, onChange }: {
  activeTab: Tab;
  onChange: (tab: Tab) => void;
}) {
  const currentIndex = TABS.indexOf(activeTab);
  const meta = TAB_META[activeTab];
  const previous = TABS[currentIndex - 1];
  const next = TABS[currentIndex + 1];

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_minmax(18rem,28rem)] md:items-end">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 rounded-lg bg-blue-50 p-2 text-blue-700"><CircleHelp size={17} /></span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-700">Explore por pergunta</p>
            <h3 className="mt-1 text-base font-semibold text-text-primary">{meta.question}</h3>
            <p className="mt-1 max-w-2xl text-xs text-text-muted">{meta.description}</p>
          </div>
        </div>
        <div>
          <label htmlFor="eeg-research-question" className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Pergunta atual</label>
          <select
            id="eeg-research-question"
            value={activeTab}
            onChange={(event) => onChange(event.target.value as Tab)}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-text-primary"
          >
            {TABS.map((tab) => <option key={tab} value={tab}>{TAB_META[tab].question}</option>)}
          </select>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface-muted px-4 py-2.5">
        <div className="flex items-center gap-1.5" aria-label={`Etapa ${currentIndex + 1} de ${TABS.length}`}>
          {TABS.map((tab, index) => (
            <button
              key={tab}
              type="button"
              onClick={() => onChange(tab)}
              aria-label={`${index + 1}. ${TAB_META[tab].question}`}
              aria-current={tab === activeTab ? 'step' : undefined}
              className={`h-1.5 rounded-full transition-all ${tab === activeTab ? 'w-8 bg-blue-600' : 'w-3 bg-slate-300 hover:bg-slate-400'}`}
            />
          ))}
          <span className="ml-2 text-[10px] font-medium text-text-muted">{currentIndex + 1}/{TABS.length}</span>
        </div>
        <div className="flex gap-1.5">
          <button type="button" disabled={!previous} onClick={() => previous && onChange(previous)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-text-secondary hover:bg-surface disabled:opacity-30"><ChevronLeft size={13} /> Anterior</button>
          <button type="button" disabled={!next} onClick={() => next && onChange(next)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-30">Próxima <ChevronRight size={13} /></button>
        </div>
      </div>
    </div>
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

function EEGRunResult({ tab, run, eegId, onSelectTab }: {
  tab: Tab;
  run: EEGAnalysisRun;
  eegId?: string;
  onSelectTab: (tab: Tab) => void;
}) {
  const artifactsQuery = useEEGAnalysisArtifacts(run.id);
  const preprocessing = useEEGAnalysisResult(run.id, 'preprocessing');
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
    return <SignalQualityResult query={preprocessing} run={run} artifacts={artifacts} footer={provenance} onSelectTab={onSelectTab} />;
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

function SignalQualityResult({ query, run, artifacts, footer, onSelectTab }: {
  query: ResultQuery;
  run: EEGAnalysisRun;
  artifacts: EEGAnalysisArtifact[];
  footer: React.ReactNode;
  onSelectTab: (tab: Tab) => void;
}) {
  const before = query.data?.quality_before;
  const after = query.data?.quality_after;
  const gain = query.data?.quality_gain_percentage_points;
  const configuration = (query.data?.provenance?.configuration ?? {}) as Record<string, unknown>;

  if (query.isLoading) {
    return <ResultState title="Carregando qualidade processada" description="Comparando o sinal antes e depois do pipeline." loading />;
  }

  return (
    <div className="space-y-4">
      {before && after ? (
        <>
          <EEGQualityBeforeAfter before={before} after={after} gain={gain} />
          <ResearchReadinessSummary
            after={after}
            warnings={run.warnings}
            onSelectTab={onSelectTab}
          />

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <details className="rounded-xl border border-border bg-surface p-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-sm font-semibold"><SlidersHorizontal size={15} className="text-blue-600" /> Método aplicado</span>
                <span className="text-[10px] text-text-muted">abrir detalhes</span>
              </summary>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <PipelineStep label="Passa-banda" value={`${configuration.filter_low_hz ?? 0.5}–${configuration.filter_high_hz ?? 50} Hz`} />
                <PipelineStep label="Notch" value={`${formatArray(configuration.notch_hz, '60')} Hz`} />
                <PipelineStep label="Referência" value={String(configuration.reference ?? 'average')} />
                <PipelineStep label="ICA removidos" value={query.data?.removed_components?.length ?? 0} />
              </div>
              {(query.data?.removed_components?.length ?? 0) > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {query.data?.removed_components?.map((component) => (
                    <span key={component.component} className="rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] text-violet-700">
                      IC{component.component} · {component.label} · {(component.probability * 100).toFixed(0)}%
                    </span>
                  ))}
                </div>
              )}
            </details>

            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Resumo da execução</p>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <CompactMeta label="Estado" value={STATUS_META[run.status].label} />
                <CompactMeta label="Amostragem" value={`${query.data?.sampling_frequency_hz ?? '—'} Hz`} />
                <CompactMeta label="Entradas" value={run.input_manifest.length} />
                <CompactMeta label="Artefatos" value={artifacts.length} />
              </dl>
            </div>
          </div>

          <ChannelQualityExplorer before={before} after={after} />
        </>
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
          Esta execução é anterior ao comparativo de qualidade. Crie uma nova análise para calcular o aproveitamento antes/depois.
        </div>
      )}

      {run.warnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-800"><AlertTriangle size={15} /> Ressalvas estruturadas</h3>
          <ul className="mt-2 space-y-1 text-xs text-amber-900">{run.warnings.map((warning, index) => <li key={`${warning}-${index}`}>• {warning}</li>)}</ul>
        </div>
      )}
      {footer}
    </div>
  );
}

function ResearchReadinessSummary({ after, warnings, onSelectTab }: {
  after: NonNullable<EEGResultEnvelope['quality_after']>;
  warnings: string[];
  onSelectTab: (tab: Tab) => void;
}) {
  const channelsBelow95 = after.channels.filter((channel) => channel.valid_ratio < 0.95).length;
  const ready = after.overall_valid_ratio >= 0.95 && channelsBelow95 === 0;
  const usableWithCaveats = after.overall_valid_ratio >= 0.8;
  const title = ready ? 'Boa cobertura para iniciar a exploração' : usableWithCaveats ? 'Explore com ressalvas visíveis' : 'Revise a qualidade antes de interpretar';
  const tone = ready
    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
    : usableWithCaveats
      ? 'border-amber-200 bg-amber-50 text-amber-950'
      : 'border-red-200 bg-red-50 text-red-950';

  return (
    <div className={`rounded-xl border p-4 ${tone}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-w-2xl items-start gap-3">
          <span className="rounded-lg bg-white/70 p-2"><Sparkles size={16} /></span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-70">Leitura orientada</p>
            <h3 className="mt-1 text-sm font-semibold">{title}</h3>
            <p className="mt-1 text-xs leading-relaxed opacity-80">
              {pct(after.overall_valid_ratio)} das amostras ficaram dentro do limiar após o pipeline;
              {' '}{channelsBelow95 === 0 ? 'nenhum canal ficou abaixo de 95%' : `${channelsBelow95} canal(is) ficaram abaixo de 95%`}.
              {warnings.length > 0 ? ` Há ${warnings.length} ressalva(s) registrada(s).` : ' Não há ressalvas estruturadas nesta execução.'}
            </p>
            <p className="mt-2 text-[10px] opacity-70">Orientação automática de navegação; a decisão de inclusão continua sendo do pesquisador.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onSelectTab('Espectro e bandas')} className="rounded-md border border-current/20 bg-white/70 px-3 py-1.5 text-xs font-medium hover:bg-white">Explorar bandas</button>
          <button type="button" onClick={() => onSelectTab('Séries temporais')} className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800">Ver evolução temporal <ArrowRight size={12} /></button>
        </div>
      </div>
    </div>
  );
}

export function ChannelQualityExplorer({ before, after }: {
  before: NonNullable<EEGResultEnvelope['quality_before']>;
  after: NonNullable<EEGResultEnvelope['quality_after']>;
}) {
  const [view, setView] = useState<'fragile' | 'all'>('fragile');
  const [search, setSearch] = useState('');
  const [selectedName, setSelectedName] = useState<string>();
  const sorted = useMemo(
    () => [...after.channels].sort((left, right) => left.valid_ratio - right.valid_ratio),
    [after.channels],
  );
  const filtered = sorted.filter((channel) => channel.name.toLowerCase().includes(search.trim().toLowerCase()));
  const visible = view === 'fragile' ? filtered.slice(0, 8) : filtered;
  const selected = after.channels.find((channel) => channel.name === selectedName);
  const selectedRaw = before.channels.find((channel) => channel.name === selectedName);

  if (!after.channels.length) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">Explorador de canais</h3>
          <p className="mt-0.5 text-[11px] text-text-muted">Comece pelos oito menores aproveitamentos ou pesquise um canal. Clique para comparar pré × pós.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-border bg-surface-muted p-0.5" aria-label="Escopo dos canais">
            <button type="button" onClick={() => setView('fragile')} aria-pressed={view === 'fragile'} className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium ${view === 'fragile' ? 'bg-white text-blue-700 shadow-sm' : 'text-text-muted'}`}><ListFilter size={12} className="mr-1 inline" /> Menor aproveitamento</button>
            <button type="button" onClick={() => setView('all')} aria-pressed={view === 'all'} className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium ${view === 'all' ? 'bg-white text-blue-700 shadow-sm' : 'text-text-muted'}`}>Todos ({after.channels.length})</button>
          </div>
          <label className="relative block">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-2.5 text-text-muted" />
            <span className="sr-only">Buscar canal</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar canal" className="w-36 rounded-lg border border-border bg-surface py-2 pl-8 pr-2 text-xs" />
          </label>
        </div>
      </div>

      {visible.length ? (
        <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
          {visible.map((channel) => {
            const raw = before.channels.find((item) => item.name === channel.name);
            const selectedChannel = selectedName === channel.name;
            return (
              <button
                type="button"
                key={channel.name}
                onClick={() => setSelectedName(selectedChannel ? undefined : channel.name)}
                aria-expanded={selectedChannel}
                className={`bg-surface p-3 text-left transition-colors hover:bg-blue-50 ${selectedChannel ? 'ring-2 ring-inset ring-blue-500' : ''}`}
              >
                <div className="flex items-center justify-between"><strong className="font-mono text-xs">{channel.name}</strong><span className="text-xs font-semibold tabular-nums">{pct(channel.valid_ratio)}</span></div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-muted"><div className={`h-full rounded-full ${channel.valid_ratio >= 0.95 ? 'bg-emerald-500' : channel.valid_ratio >= 0.8 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${channel.valid_ratio * 100}%` }} /></div>
                <p className="mt-1.5 text-[10px] text-text-muted">bruto {raw ? pct(raw.valid_ratio) : '—'} · p95 {channel.p95_abs_centered_uv?.toFixed(1) ?? '—'} µV</p>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="px-4 py-8 text-center text-xs text-text-muted">Nenhum canal corresponde à busca.</p>
      )}

      {selected && (
        <div className="border-t border-blue-100 bg-blue-50/60 px-4 py-3" role="region" aria-label={`Detalhes do canal ${selected.name}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-700">Canal selecionado</p>
              <p className="mt-0.5 font-mono text-sm font-semibold text-text-primary">{selected.name}</p>
            </div>
            <dl className="grid grid-cols-3 gap-x-6 gap-y-2 text-xs">
              <CompactMeta label="Bruto" value={selectedRaw ? pct(selectedRaw.valid_ratio) : '—'} />
              <CompactMeta label="Processado" value={pct(selected.valid_ratio)} />
              <CompactMeta label="Variação" value={selectedRaw ? `${signed((selected.valid_ratio - selectedRaw.valid_ratio) * 100)} pp` : '—'} />
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}

export function EEGQualityBeforeAfter({ before, after, gain }: {
  before: NonNullable<EEGResultEnvelope['quality_before']>;
  after: NonNullable<EEGResultEnvelope['quality_after']>;
  gain?: number;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-emerald-50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-700">Aproveitamento do sinal</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">Antes × depois do pré-processamento</h3>
          <p className="mt-1 max-w-2xl text-xs text-slate-600">Percentual de amostras dentro de ±{after.threshold_uv.toFixed(0)} µV após centralização. É um indicador transparente de QC, não um veredito clínico.</p>
        </div>
        {gain != null && (
          <div className="rounded-xl border border-emerald-200 bg-white/80 px-4 py-3 text-right shadow-sm">
            <p className="text-[10px] uppercase tracking-wide text-emerald-700">Ganho</p>
            <p className="text-2xl font-bold tabular-nums text-emerald-700">{signed(gain)} pp</p>
          </div>
        )}
      </div>
      <div className="mt-5 grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr]">
        <QualityStage title="Sinal bruto" subtitle="Antes de filtro e referência" snapshot={before} tone="raw" />
        <div className="hidden items-center text-blue-500 md:flex"><ArrowRight size={22} /></div>
        <QualityStage title="Sinal processado" subtitle="Filtro, referência e ICA" snapshot={after} tone="processed" />
      </div>
    </div>
  );
}

function QualityStage({ title, subtitle, snapshot, tone }: {
  title: string;
  subtitle: string;
  snapshot: NonNullable<EEGResultEnvelope['quality_before']>;
  tone: 'raw' | 'processed';
}) {
  const processed = tone === 'processed';
  return (
    <div className={`rounded-xl border p-4 ${processed ? 'border-emerald-200 bg-white shadow-sm' : 'border-slate-200 bg-white/70'}`}>
      <div className="flex items-start justify-between gap-3">
        <div><h4 className="text-sm font-semibold text-slate-900">{title}</h4><p className="text-[10px] text-slate-500">{subtitle}</p></div>
        <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${processed ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{processed ? 'PÓS' : 'PRÉ'}</span>
      </div>
      <div className="mt-4 flex items-end justify-between"><span className={`text-4xl font-bold tabular-nums ${processed ? 'text-emerald-700' : 'text-slate-700'}`}>{pct(snapshot.overall_valid_ratio)}</span><span className="pb-1 text-[11px] text-slate-500">p95 {snapshot.p95_abs_centered_uv?.toFixed(1) ?? '—'} µV</span></div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${processed ? 'bg-emerald-500' : 'bg-slate-400'}`} style={{ width: `${snapshot.overall_valid_ratio * 100}%` }} /></div>
    </div>
  );
}

type ResultQuery = { data?: EEGResultEnvelope; isLoading: boolean; isError: boolean };

export function PowerResult({ query, run, footer }: { query: ResultQuery; run: EEGAnalysisRun; footer: React.ReactNode }) {
  const [selectedBand, setSelectedBand] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<'roi' | 'channel'>('roi');
  const [metric, setMetric] = useState<'absolute_power' | 'relative_power'>('absolute_power');
  const rows = (query.data?.power ?? []) as {
    level?: string; roi?: string; channel?: string; band?: string;
    absolute_power?: number; relative_power?: number;
  }[];
  const roiRows = rows.filter((row) => row.level === 'roi');
  const channelRows = rows.filter((row) => row.level === 'channel' || (!row.level && Boolean(row.channel)));
  const level = selectedLevel === 'roi' && roiRows.length ? 'roi' : channelRows.length ? 'channel' : 'roi';
  const sourceRows = level === 'roi' ? roiRows : channelRows;
  const bands = [...new Set(sourceRows.map((row) => row.band).filter((band): band is string => Boolean(band)))];
  const regions = [...new Set(sourceRows.map((row) => row.roi ?? row.channel).filter((region): region is string => Boolean(region)))];
  const band = bands.includes(selectedBand) ? selectedBand : (bands[0] ?? '');
  const region = regions.includes(selectedRegion) ? selectedRegion : '';
  const matchingRows = sourceRows.filter((row) => row.band === band && (!region || (row.roi ?? row.channel) === region));
  const chartRows = matchingRows.filter((row) => Number.isFinite(row[metric])).slice(0, 24);
  if (!sourceRows.length) return <QueryState query={query} run={run} title="Potência indisponível" />;
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><h3 className="text-sm font-semibold">Explore por banda e região</h3><p className="mt-1 text-xs text-text-muted">Selecione uma banda para reduzir a sobreposição de valores no gráfico.</p></div>
          <span className="text-[11px] text-text-muted">{matchingRows.length} de {sourceRows.length} resultado{sourceRows.length === 1 ? '' : 's'}</span>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-[11px] font-medium text-text-secondary">Nível
            <select aria-label="Nível de agregação EEG" value={level} onChange={(event) => { setSelectedLevel(event.target.value as typeof level); setSelectedRegion(''); }} className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs">
              {roiRows.length > 0 && <option value="roi">Regiões</option>}
              {channelRows.length > 0 && <option value="channel">Canais</option>}
            </select>
          </label>
          <label className="text-[11px] font-medium text-text-secondary">Banda
            <select aria-label="Banda EEG" value={band} onChange={(event) => setSelectedBand(event.target.value)} className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs">
              {bands.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="text-[11px] font-medium text-text-secondary">Região ou canal
            <select aria-label="Região ou canal EEG" value={region} onChange={(event) => setSelectedRegion(event.target.value)} className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs">
              <option value="">Todas</option>
              {regions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="text-[11px] font-medium text-text-secondary">Medida
            <select aria-label="Medida de potência EEG" value={metric} onChange={(event) => setMetric(event.target.value as typeof metric)} className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs">
              <option value="absolute_power">Potência absoluta</option>
              <option value="relative_power">Potência relativa</option>
            </select>
          </label>
        </div>
      </div>
      <ChartFrame meta={{
        title: `${metric === 'absolute_power' ? 'Potência absoluta' : 'Potência relativa'} · ${band}`,
        description: 'Estimativa pelo método de Welch. Os filtros alteram apenas a visualização.',
        source: `run ${run.id.slice(0, 8)}`,
        unit: metric === 'absolute_power' ? (query.data?.units?.absolute_power ?? 'uV²') : (query.data?.units?.relative_power ?? 'proporção'),
        filters: [`banda ${band}`, level === 'roi' ? 'regiões' : 'canais', region || 'todos', `perfil ${run.profile}`],
        modality: 'eeg',
        pipelineVersion: run.package_version ?? undefined,
      }}>
        {chartRows.length ? <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartRows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={(row) => row.roi ?? row.channel} hide={chartRows.length > 16} />
              <YAxis />
              <Tooltip />
              <Bar dataKey={metric} name={metric === 'absolute_power' ? 'Potência absoluta' : 'Potência relativa'} fill="#2563eb" />
            </BarChart>
          </ResponsiveContainer>
        </div> : <p className="py-12 text-center text-xs text-text-muted">Nenhum valor numérico disponível para esta combinação.</p>}
      </ChartFrame>
      {matchingRows.length > chartRows.length && <p className="text-[11px] text-text-muted">O gráfico mostra os primeiros {chartRows.length} resultados desta seleção. Escolha uma região para restringir a visualização.</p>}
      {footer}
    </div>
  );
}

export function TimeseriesResult({ query, run, footer }: { query: ResultQuery; run: EEGAnalysisRun; footer: React.ReactNode }) {
  const [selectedBand, setSelectedBand] = useState('');
  const [selectedTarget, setSelectedTarget] = useState('');
  const points = useMemo(() => query.data?.points ?? [], [query.data?.points]);
  const bands = [...new Set(points.map((point) => point.band))];
  const targets = [...new Set(points.map((point) => point.roi ?? point.channel ?? 'sinal'))];
  const band = bands.includes(selectedBand) ? selectedBand : (bands[0] ?? '');
  const target = targets.includes(selectedTarget) ? selectedTarget : '';
  const filteredPoints = useMemo(
    () => points.filter((point) => point.band === band && (!target || (point.roi ?? point.channel ?? 'sinal') === target)),
    [points, band, target],
  );
  const series = useMemo(() => {
    const grouped = new Map<number, Record<string, number>>();
    for (const point of filteredPoints.slice(0, 5000)) {
      const target = grouped.get(point.time_seconds) ?? { time_seconds: point.time_seconds };
      target[point.roi ?? point.channel ?? 'sinal'] = point.value;
      grouped.set(point.time_seconds, target);
    }
    return [...grouped.values()].sort((left, right) => left.time_seconds - right.time_seconds);
  }, [filteredPoints]);
  const keys = [...new Set(filteredPoints.map((point) => point.roi ?? point.channel ?? 'sinal'))].slice(0, 6);
  if (!points.length) return <QueryState query={query} run={run} title="Série temporal indisponível" />;
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface p-4">
        <h3 className="text-sm font-semibold">Explore a evolução temporal</h3>
        <p className="mt-1 text-xs text-text-muted">Escolha uma banda e, se desejar, uma região ou canal para acompanhar.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-[11px] font-medium text-text-secondary">Banda
            <select aria-label="Banda da série EEG" value={band} onChange={(event) => setSelectedBand(event.target.value)} className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs">
              {bands.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="text-[11px] font-medium text-text-secondary">Região ou canal
            <select aria-label="Região ou canal da série EEG" value={target} onChange={(event) => setSelectedTarget(event.target.value)} className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs">
              <option value="">Até seis séries</option>
              {targets.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>
      </div>
      <ChartFrame meta={{
        title: `Potência deslizante · ${band}`,
        description: `${filteredPoints.length.toLocaleString('pt-BR')} ${filteredPoints.length === 1 ? 'ponto' : 'pontos'} na seleção; até 5.000 desenhados.`,
        source: `run ${run.id.slice(0, 8)}`,
        unit: query.data?.units?.value ?? 'uV²',
        granularity: 'janela deslizante',
        modality: 'eeg',
        pipelineVersion: run.package_version ?? undefined,
      }}>
        {series.length ? <div className="h-80">
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
        </div> : <p className="py-12 text-center text-xs text-text-muted">Sem pontos para a seleção atual.</p>}
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

function PipelineStep({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-lg border border-border bg-surface px-3 py-2"><p className="text-[9px] font-semibold uppercase tracking-wider text-text-muted">{label}</p><p className="mt-0.5 text-xs font-medium text-text-primary">{value}</p></div>;
}

function CompactMeta({ label, value }: { label: string; value: string | number }) {
  return <div><dt className="text-[10px] uppercase tracking-wide text-text-muted">{label}</dt><dd className="mt-0.5 font-semibold tabular-nums text-text-primary">{value}</dd></div>;
}

function Meta({ label, value }: { label: string; value?: string | number }) {
  return <div><dt className="text-text-muted">{label}</dt><dd className="mt-0.5 break-all font-mono text-text-secondary">{value ?? '—'}</dd></div>;
}

function formatCell(value: unknown) {
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toPrecision(4);
  return value == null ? '—' : String(value);
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function signed(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}`;
}

function formatArray(value: unknown, fallback: string) {
  return Array.isArray(value) ? value.join(', ') : fallback;
}

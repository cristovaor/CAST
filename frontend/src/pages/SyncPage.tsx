import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronRight,
  Clock3,
  FileUp,
  Loader2,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { ScientificCaveat } from '@/components/ui/ScientificCaveat';
import { ToneBadge } from '@/components/ui/ToneBadge';
import {
  useCancelSyncJob,
  useCreateSyncRun,
  useDeleteSyncEvidence,
  useRetrySyncJob,
  useSync,
  useSyncEvidence,
  useSyncJob,
  useSyncRun,
  useSyncRunDecision,
  useSyncRuns,
  useUploadSyncEvidence,
  useSessionDetail,
  type SyncEvidenceDTO,
  type SyncRunDTO,
} from '@/features/multimodal/useMultimodal';
import { MultimodalPlayer } from '@/features/inference/components/MultimodalPlayer';
import { usePlaybackStore } from '@/features/playback/usePlaybackStore';
import { useVideoPlaybackUrl, useVideoTimeline } from '@/features/videos/useVideos';
import { SYNC_METHODS, SYNC_STATE_META, type SyncMethod, type SyncState } from '@/types/research';

type Anchor = { label: string; video_time_ms: number; eeg_time_ms: number };
type Parameters = Record<string, string | number | boolean>;

const INPUT =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100';
const NO_EVIDENCE: SyncEvidenceDTO[] = [];
const NO_RUNS: SyncRunDTO[] = [];

const EVIDENCE_KIND: Record<SyncMethod, string> = {
  absolute_timestamp: 'clock_manifest',
  hardware_trigger: 'trigger_log',
  digital_marker: 'marker_log',
  visual_event: 'photodiode',
  audio_event: 'audio_reference',
  reference_frame: 'reference_pairs',
  manual: 'manual_notes',
  event_correlation: 'event_manifest',
  informed_offset: 'offset_source',
  semi_automatic: 'review_notes',
};

const METHOD_SHORT: Record<SyncMethod, string> = {
  absolute_timestamp: 'Compara relógios ISO-8601 e propaga a precisão informada.',
  hardware_trigger: 'Detecta e pareia bordas TTL/stim com rejeição de outliers.',
  digital_marker: 'Casa códigos e sequência de marcadores dos dois sistemas.',
  visual_event: 'Detecta pulsos de luminância em ROI e pareia com fotodiodo.',
  audio_event: 'Extrai áudio e estima o lag por correlação temporal.',
  reference_frame: 'Converte frames e amostras em âncoras temporais.',
  manual: 'Ajusta uma transformação real a partir de âncoras revisadas.',
  event_correlation: 'Correlaciona eventos faciais com energia temporal do EEG.',
  informed_offset: 'Normaliza unidade/sinal e mantém incerteza e proveniência.',
  semi_automatic: 'Refaz uma proposta automática com âncoras humanas.',
};

export function SyncPage() {
  const { sessionId } = useParams();
  const syncQuery = useSync(sessionId);
  const sessionQuery = useSessionDetail(sessionId);
  const evidenceQuery = useSyncEvidence(sessionId);
  const runsQuery = useSyncRuns(sessionId);
  const createRun = useCreateSyncRun(sessionId);
  const uploadEvidence = useUploadSyncEvidence(sessionId);
  const deleteEvidence = useDeleteSyncEvidence(sessionId);

  const [method, setMethod] = useState<SyncMethod>('event_correlation');
  const [parameters, setParameters] = useState<Parameters>({});
  const [anchors, setAnchors] = useState<Anchor[]>([]);
  const [evidenceKind, setEvidenceKind] = useState('event_manifest');
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [activeRunId, setActiveRunId] = useState<string>();
  const [activeJobId, setActiveJobId] = useState<string>();
  const [reviewRunId, setReviewRunId] = useState<string>();
  const [justification, setJustification] = useState('');

  const runQuery = useSyncRun(sessionId, activeRunId);
  const jobQuery = useSyncJob(activeJobId);
  const cancelJob = useCancelSyncJob(activeJobId);
  const retryJob = useRetrySyncJob(activeJobId);

  const sync = syncQuery.data;
  const session = sessionQuery.data;
  const playbackQuery = useVideoPlaybackUrl(session?.video_asset_id ?? '');
  const timelineQuery = useVideoTimeline(session?.video_asset_id ?? '');
  const runs = runsQuery.data ?? NO_RUNS;
  const evidence = evidenceQuery.data ?? NO_EVIDENCE;
  const latestRun = runQuery.data ?? sync?.latest_run ?? runs[0] ?? null;
  const reviewRun = runs.find((run) => run.id === reviewRunId) ?? latestRun;
  const decision = useSyncRunDecision(sessionId, reviewRun?.id);
  const capability = sync?.capabilities.find((item) => item.method === method);
  const durationMs = Math.max(sync?.duration_ms ?? 0, 1);
  const state = SYNC_STATE_META[(sync?.state ?? 'not_synced') as SyncState];

  const selectMethod = (nextMethod: SyncMethod) => {
    setMethod(nextMethod);
    setEvidenceKind(EVIDENCE_KIND[nextMethod]);
    setParameters({});
    setAnchors([]);
  };

  const refetchSync = syncQuery.refetch;
  const refetchRuns = runsQuery.refetch;
  const refetchRun = runQuery.refetch;

  useEffect(() => {
    if (!jobQuery.data || !['succeeded', 'failed', 'canceled'].includes(jobQuery.data.status)) return;
    void refetchSync();
    void refetchRuns();
    void refetchRun();
  }, [jobQuery.data, refetchRun, refetchRuns, refetchSync]);

  const submittedInputs = useMemo(
    () => evidence.map((item) => item.id),
    [evidence],
  );

  const startRun = () => {
    const runParameters: Record<string, unknown> = { ...parameters };
    if (method === 'visual_event') {
      runParameters.roi = {
        x: Number(parameters.roi_x ?? 0),
        y: Number(parameters.roi_y ?? 0),
        width: Number(parameters.roi_width ?? 1),
        height: Number(parameters.roi_height ?? 1),
      };
    }
    if (method === 'absolute_timestamp') {
      runParameters.video_precision_ms = Number(parameters.precision_ms ?? 0);
      runParameters.eeg_precision_ms = Number(parameters.precision_ms ?? 0);
    }
    createRun.mutate(
      {
        method,
        evidence_ids: submittedInputs,
        parameters: runParameters,
        anchors,
      },
      {
        onSuccess: (result) => {
          setActiveRunId(result.run_id);
          setReviewRunId(result.run_id);
          setActiveJobId(result.job_id);
        },
      },
    );
  };

  const submitEvidence = () => {
    uploadEvidence.mutate(
      {
        kind: evidenceKind.trim() || EVIDENCE_KIND[method],
        file: evidenceFile,
        metadata: evidenceFile
          ? { name: evidenceFile.name, size_bytes: evidenceFile.size, last_modified: evidenceFile.lastModified }
          : {},
      },
      { onSuccess: () => setEvidenceFile(null) },
    );
  };

  if (syncQuery.isLoading) {
    return <LoadingState />;
  }

  if (syncQuery.isError || !sync) {
    return (
      <div className="m-6 rounded-xl border border-amber-200 bg-amber-50 p-6" role="alert">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 text-amber-600" size={20} />
          <div>
            <h1 className="font-semibold text-amber-950">Sessão inexistente ou sem acesso</h1>
            <p className="mt-1 text-sm text-amber-800">
              Para proteger os dados entre organizações, não informamos qual dessas condições ocorreu.
            </p>
            <Link to="/app/sessions" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-amber-900 underline">
              <ArrowLeft size={14} /> Voltar para sessões
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-app-bg pb-14">
      <PageHeader
        title="Sincronização vídeo & EEG"
        description="Processamento assíncrono, rastreável e sujeito a revisão humana."
        context={
          <>
            <ToneBadge tone={state.tone}>{state.label}</ToneBadge>
            <span className="text-[11px] text-text-muted">Mapeamento {sync.mapping_version}</span>
            {sync.quality_grade && <QualityBadge grade={sync.quality_grade} />}
          </>
        }
        actions={
          <Link to={`/app/sessions/${sessionId}`} className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary">
            <ArrowLeft size={15} /> Sessão
          </Link>
        }
      />

      <main className="space-y-6 px-4 pt-6 sm:px-6">
        <ScientificCaveat variant="association" compact>
          Um resultado válido continua sendo uma proposta até aprovação. Evidência insuficiente nunca gera offset, confiança ou alinhamento oficial.
        </ScientificCaveat>

        <ol className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label="Etapas da sincronização">
          {['Método', 'Evidências e parâmetros', 'Processamento', 'Revisão'].map((label, index) => (
            <li key={label} className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-text-secondary">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-blue-50 text-blue-700">{index + 1}</span>
              {label}
              {index < 3 && <ChevronRight className="ml-auto hidden text-text-disabled lg:block" size={14} />}
            </li>
          ))}
        </ol>

        <section aria-labelledby="methods-heading">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 id="methods-heading" className="text-sm font-semibold text-text-primary">1. Escolha o método</h2>
              <p className="text-xs text-text-muted">Cada cartão informa exatamente o que já está disponível e o que ainda falta.</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {SYNC_METHODS.map((item) => {
              const itemCapability = sync.capabilities.find((entry) => entry.method === item.value);
              const selected = method === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => selectMethod(item.value)}
                  aria-pressed={selected}
                  className={`min-h-40 rounded-xl border p-3 text-left transition ${
                    selected
                      ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-100'
                      : 'border-border bg-surface hover:border-border-strong'
                  }`}
                >
                  <p className="text-sm font-semibold text-text-primary">{item.label}</p>
                  <p className="mt-1.5 text-[11px] leading-4 text-text-muted">{METHOD_SHORT[item.value]}</p>
                  <CapabilityStatus status={itemCapability?.status} />
                  {!!itemCapability?.missing_inputs.length && (
                    <ul className="mt-2 space-y-0.5 text-[10px] text-amber-700">
                      {itemCapability.missing_inputs.map((missing) => <li key={missing}>• {missing}</li>)}
                    </ul>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-6">
            <section className="rounded-xl border border-border bg-surface p-4" aria-labelledby="inputs-heading">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 id="inputs-heading" className="text-sm font-semibold text-text-primary">2. Evidências e parâmetros</h2>
                  <p className="mt-0.5 text-xs text-text-muted">{capability?.description ?? METHOD_SHORT[method]}</p>
                </div>
                <span className="rounded-full bg-surface-muted px-2 py-1 text-[10px] font-medium text-text-secondary">
                  {evidence.length} evidência(s) versionada(s)
                </span>
              </div>

              {['manual', 'reference_frame', 'semi_automatic'].includes(method) && (
                <div className="mt-4 overflow-hidden rounded-xl border border-border bg-slate-950">
                  {playbackQuery.data?.url ? (
                    <MultimodalPlayer
                      videoUrl={playbackQuery.data.url}
                      events={timelineQuery.data?.events ?? []}
                      eegId={session?.eeg_asset_id ?? undefined}
                      fps={timelineQuery.data?.fps}
                      videoId={session?.video_asset_id ?? undefined}
                    />
                  ) : (
                    <div className="grid min-h-40 place-items-center px-6 text-center text-xs text-text-muted">
                      O capturador interativo aparecerá quando a sessão possuir vídeo reproduzível. As âncoras também podem ser digitadas abaixo.
                    </div>
                  )}
                </div>
              )}

              <MethodFields
                method={method}
                parameters={parameters}
                setParameters={setParameters}
                anchors={anchors}
                setAnchors={setAnchors}
                runs={runs}
                mapping={{
                  offset_ms: sync.offset_ms,
                  drift_ms_per_min: sync.drift_ms_per_min ?? 0,
                }}
              />

              <div className="mt-5 border-t border-border pt-4">
                <h3 className="text-xs font-semibold text-text-primary">Adicionar evidência</h3>
                <div className="mt-2 grid gap-2 md:grid-cols-[180px_minmax(0,1fr)_auto]">
                  <label>
                    <span className="sr-only">Tipo da evidência</span>
                    <input value={evidenceKind} onChange={(event) => setEvidenceKind(event.target.value)} className={INPUT} placeholder="tipo_da_evidência" />
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border-strong px-3 py-2 text-sm text-text-secondary hover:bg-app-bg">
                    <FileUp size={16} />
                    <span className="truncate">{evidenceFile?.name ?? 'Selecionar CSV, JSON, WAV ou log'}</span>
                    <input
                      type="file"
                      className="sr-only"
                      accept=".csv,.tsv,.json,.txt,.wav,.edf,.bdf,.fif,.set,.vhdr"
                      onChange={(event) => setEvidenceFile(event.target.files?.[0] ?? null)}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={submitEvidence}
                    disabled={!evidenceFile || uploadEvidence.isPending}
                    className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                  >
                    {uploadEvidence.isPending ? 'Validando…' : 'Enviar'}
                  </button>
                </div>
                {evidenceFile && (
                  <p className="mt-1 text-[11px] text-text-muted">
                    {formatBytes(evidenceFile.size)} · checksum SHA-256 calculado no backend antes do processamento
                  </p>
                )}
                <MutationError error={uploadEvidence.error} />

                <ul className="mt-3 grid gap-2 md:grid-cols-2">
                  {evidence.map((item) => (
                    <li key={item.id} className="flex items-center gap-3 rounded-lg border border-border bg-app-bg px-3 py-2">
                      <FileUp className="shrink-0 text-text-muted" size={15} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-text-secondary">{item.filename ?? item.kind}</p>
                        <p className="truncate font-mono text-[9px] text-text-muted">{item.kind} · {item.checksum_sha256.slice(0, 16)}…</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteEvidence.mutate(item.id)}
                        className="rounded p-1 text-text-muted hover:bg-red-50 hover:text-red-600"
                        aria-label={`Excluir evidência ${item.filename ?? item.kind}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <p className="max-w-xl text-[11px] text-text-muted">
                  O job recebe um manifesto imutável com parâmetros, âncoras e hashes das evidências. Repetir a mesma entrada reutiliza o mesmo run.
                </p>
                <button
                  type="button"
                  onClick={startRun}
                  disabled={createRun.isPending}
                  className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {createRun.isPending ? <Loader2 className="animate-spin" size={15} /> : <Play size={15} />}
                  Iniciar processamento real
                </button>
              </div>
              <MutationError error={createRun.error} />
            </section>

            <Timeline
              durationMs={durationMs}
              official={sync.approved_run?.result ?? null}
              proposal={latestRun?.result ?? null}
            />
          </div>

          <aside className="space-y-6">
            <JobPanel
              job={jobQuery.data}
              run={latestRun}
              onCancel={() => cancelJob.mutate()}
              onRetry={() => retryJob.mutate()}
              cancelPending={cancelJob.isPending}
              retryPending={retryJob.isPending}
            />
            <ReviewPanel
              run={reviewRun}
              runs={runs}
              reviewRunId={reviewRun?.id}
              setReviewRunId={setReviewRunId}
              justification={justification}
              setJustification={setJustification}
              onDecision={(approve) => decision.mutate({ approve, justification })}
              pending={decision.isPending}
              error={decision.error}
              sessionId={sessionId}
              approvedRunId={sync.approved_run_id}
            />
          </aside>
        </div>

        <RunHistory runs={runs} selected={reviewRun?.id} onSelect={setReviewRunId} />
      </main>
    </div>
  );
}

function MethodFields({
  method,
  parameters,
  setParameters,
  anchors,
  setAnchors,
  runs,
  mapping,
}: {
  method: SyncMethod;
  parameters: Parameters;
  setParameters: (value: Parameters) => void;
  anchors: Anchor[];
  setAnchors: (value: Anchor[]) => void;
  runs: SyncRunDTO[];
  mapping: { offset_ms: number; drift_ms_per_min: number };
}) {
  const field = (name: string, fallback = '') => String(parameters[name] ?? fallback);
  const set = (name: string, value: string | number | boolean) => setParameters({ ...parameters, [name]: value });

  if (method === 'absolute_timestamp') {
    return (
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Field label="Início do vídeo (ISO-8601)"><input type="datetime-local" className={INPUT} value={field('video_start')} onChange={(e) => set('video_start', e.target.value)} /></Field>
        <Field label="Início do EEG (ISO-8601)"><input type="datetime-local" className={INPUT} value={field('eeg_start')} onChange={(e) => set('eeg_start', e.target.value)} /></Field>
        <Field label="Timezone IANA"><input className={INPUT} value={field('timezone', 'America/Fortaleza')} onChange={(e) => set('timezone', e.target.value)} /></Field>
        <Field label="Precisão dos relógios (ms)"><input type="number" min="0" className={INPUT} value={field('precision_ms', '10')} onChange={(e) => set('precision_ms', Number(e.target.value))} /></Field>
        <Field label="Fim do vídeo (opcional)"><input type="datetime-local" className={INPUT} value={field('video_end')} onChange={(e) => set('video_end', e.target.value)} /></Field>
        <Field label="Fim do EEG (opcional)"><input type="datetime-local" className={INPUT} value={field('eeg_end')} onChange={(e) => set('eeg_end', e.target.value)} /></Field>
      </div>
    );
  }

  if (method === 'informed_offset') {
    return (
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Field label="Offset"><input type="number" step="any" className={INPUT} value={field('offset', '0')} onChange={(e) => set('offset', Number(e.target.value))} /></Field>
        <Field label="Unidade">
          <select className={INPUT} value={field('unit', 'ms')} onChange={(e) => set('unit', e.target.value)}>
            <option value="ms">milissegundos</option><option value="s">segundos</option><option value="us">microssegundos</option>
          </select>
        </Field>
        <Field label="Incerteza (ms)"><input type="number" min="0" step="any" className={INPUT} value={field('uncertainty_ms', '100')} onChange={(e) => set('uncertainty_ms', Number(e.target.value))} /></Field>
        <Field label="Fonte"><input className={INPUT} value={field('source')} onChange={(e) => set('source', e.target.value)} placeholder="instrumento, protocolo ou registro" /></Field>
        <div className="md:col-span-2">
          <Field label="Justificativa técnica"><textarea rows={2} className={INPUT} value={field('justification')} onChange={(e) => set('justification', e.target.value)} /></Field>
        </div>
      </div>
    );
  }

  if (method === 'visual_event') {
    return (
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {(['x', 'y', 'width', 'height'] as const).map((name) => (
          <Field key={name} label={`ROI ${name} (0–1)`}>
            <input type="number" min="0" max="1" step="0.01" className={INPUT} value={field(`roi_${name}`, name === 'width' || name === 'height' ? '1' : '0')} onChange={(e) => set(`roi_${name}`, Number(e.target.value))} />
          </Field>
        ))}
      </div>
    );
  }

  if (method === 'audio_event') {
    return (
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Field label="Taxa de reamostragem (Hz)"><input type="number" min="1000" className={INPUT} value={field('audio_sample_rate_hz', '16000')} onChange={(e) => set('audio_sample_rate_hz', Number(e.target.value))} /></Field>
        <Field label="Lag máximo (ms)"><input type="number" min="1" className={INPUT} value={field('max_lag_ms', '10000')} onChange={(e) => set('max_lag_ms', Number(e.target.value))} /></Field>
      </div>
    );
  }

  if (method === 'semi_automatic') {
    const proposals = runs.filter((run) => run.outcome === 'proposal');
    return (
      <>
        <div className="mt-4">
          <Field label="Proposta automática base">
            <select className={INPUT} value={field('base_run_id')} onChange={(e) => set('base_run_id', e.target.value)}>
              <option value="">Selecione um run válido</option>
              {proposals.map((run) => <option key={run.id} value={run.id}>{run.method} · {formatDate(run.created_at)}</option>)}
            </select>
          </Field>
        </div>
        <AnchorEditor anchors={anchors} setAnchors={setAnchors} mapping={mapping} />
      </>
    );
  }

  if (method === 'manual' || method === 'reference_frame') {
    return <AnchorEditor anchors={anchors} setAnchors={setAnchors} mapping={mapping} frameMode={method === 'reference_frame'} />;
  }

  return (
    <div className="mt-4 rounded-lg bg-app-bg p-3 text-xs text-text-secondary">
      Use os uploads abaixo para fornecer os dois lados do pareamento. CSV/JSON são analisados no worker; sinais constantes, degenerados ou ambíguos terminam como <code>insufficient_evidence</code>.
    </div>
  );
}

function AnchorEditor({
  anchors,
  setAnchors,
  mapping,
  frameMode = false,
}: {
  anchors: Anchor[];
  setAnchors: (anchors: Anchor[]) => void;
  mapping: { offset_ms: number; drift_ms_per_min: number };
  frameMode?: boolean;
}) {
  const cursorMs = usePlaybackStore((state) => state.currentTimeMs);
  const [capturedVideoMs, setCapturedVideoMs] = useState<number | null>(null);
  const [capturedEegMs, setCapturedEegMs] = useState<number | null>(null);
  const toEegMs = (videoMs: number) =>
    videoMs * (1 + mapping.drift_ms_per_min / 60000) - mapping.offset_ms;
  const add = () => setAnchors([...anchors, { label: `âncora-${anchors.length + 1}`, video_time_ms: 0, eeg_time_ms: 0 }]);
  const addCaptured = () => {
    if (capturedVideoMs == null || capturedEegMs == null) return;
    setAnchors([
      ...anchors,
      {
        label: `captura-${anchors.length + 1}`,
        video_time_ms: capturedVideoMs,
        eeg_time_ms: capturedEegMs,
      },
    ]);
    setCapturedVideoMs(null);
    setCapturedEegMs(null);
  };
  const update = (index: number, patch: Partial<Anchor>) => setAnchors(anchors.map((anchor, itemIndex) => itemIndex === index ? { ...anchor, ...patch } : anchor));
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-semibold text-text-primary">Âncoras temporais</h3>
          <p className="text-[11px] text-text-muted">{frameMode ? 'Informe tempos já convertidos de frame/amostra.' : 'Capture ou edite pares no mesmo evento observável.'}</p>
        </div>
        <button type="button" onClick={add} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs font-medium text-text-secondary hover:bg-app-bg"><Plus size={13} /> Âncora</button>
      </div>
      <div className="mt-3 grid gap-2 rounded-lg border border-blue-100 bg-blue-50/50 p-3 sm:grid-cols-[1fr_1fr_auto]">
        <button type="button" onClick={() => setCapturedVideoMs(cursorMs)} className="rounded-md border border-blue-200 bg-surface px-3 py-2 text-xs font-medium text-blue-800">
          Capturar cursor do vídeo · {capturedVideoMs == null ? '—' : `${formatNumber(capturedVideoMs)} ms`}
        </button>
        <button type="button" onClick={() => setCapturedEegMs(toEegMs(cursorMs))} className="rounded-md border border-cyan-200 bg-surface px-3 py-2 text-xs font-medium text-cyan-800">
          Capturar cursor do EEG · {capturedEegMs == null ? '—' : `${formatNumber(capturedEegMs)} ms`}
        </button>
        <button type="button" onClick={addCaptured} disabled={capturedVideoMs == null || capturedEegMs == null} className="rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">
          Criar par
        </button>
      </div>
      <div className="mt-2 space-y-2">
        {anchors.map((anchor, index) => (
          <div key={`${anchor.label}-${index}`} className="grid gap-2 rounded-lg bg-app-bg p-2 sm:grid-cols-[1fr_150px_150px_auto]">
            <input aria-label={`Rótulo da âncora ${index + 1}`} className={INPUT} value={anchor.label} onChange={(e) => update(index, { label: e.target.value })} />
            <input aria-label={`Tempo de vídeo da âncora ${index + 1}`} type="number" step="any" className={INPUT} value={anchor.video_time_ms} onChange={(e) => update(index, { video_time_ms: Number(e.target.value) })} />
            <input aria-label={`Tempo de EEG da âncora ${index + 1}`} type="number" step="any" className={INPUT} value={anchor.eeg_time_ms} onChange={(e) => update(index, { eeg_time_ms: Number(e.target.value) })} />
            <button type="button" onClick={() => setAnchors(anchors.filter((_, itemIndex) => itemIndex !== index))} className="rounded p-2 text-text-muted hover:bg-red-50 hover:text-red-600" aria-label={`Remover âncora ${index + 1}`}><Trash2 size={15} /></button>
          </div>
        ))}
        {!anchors.length && <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-text-muted">Adicione ao menos uma âncora; duas ou mais permitem estimar drift.</p>}
      </div>
    </div>
  );
}

function Timeline({ durationMs, official, proposal }: { durationMs: number; official: Record<string, unknown> | null; proposal: Record<string, unknown> | null }) {
  const source = proposal?.offset_ms != null ? proposal : official;
  const offset = Number(source?.offset_ms ?? 0);
  const drift = Number(source?.drift_ms_per_min ?? 0);
  const scale = 1 + drift / 60000;
  const eegStartVideoMs = offset / scale;
  const left = Math.max(0, Math.min(100, eegStartVideoMs / durationMs * 100));
  const anchors = Array.isArray(source?.anchors) ? source.anchors as Array<Record<string, unknown>> : [];
  return (
    <section className="rounded-xl border border-border bg-surface p-4" aria-labelledby="timeline-heading">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="timeline-heading" className="text-sm font-semibold text-text-primary">Comparação temporal antes/depois</h2>
          <p className="text-xs text-text-muted">Convenção: EEG = vídeo × (1 + drift/60000) − offset.</p>
        </div>
        <span className="font-mono text-[11px] text-text-muted">0:00 — {formatDuration(durationMs)}</span>
      </div>
      <div className="mt-5 space-y-3">
        <Lane icon={<Video size={14} />} label="Vídeo" color="bg-blue-500" startPct={0} />
        <Lane icon={<Activity size={14} />} label="EEG bruto" color="bg-cyan-500" startPct={0} />
        <Lane icon={<Activity size={14} />} label="EEG alinhado" color="bg-emerald-500" startPct={left} />
      </div>
      <div className="relative ml-24 mt-2 h-9 border-t border-border">
        {anchors.map((anchor, index) => {
          const time = Number(anchor.video_time_ms ?? 0);
          const pct = Math.max(0, Math.min(100, time / durationMs * 100));
          return (
            <div key={index} className="absolute top-0 -translate-x-1/2" style={{ left: `${pct}%` }}>
              <div className={`h-3 w-px ${anchor.accepted === false ? 'bg-red-400' : 'bg-violet-500'}`} />
              <span className="block max-w-20 truncate text-[9px] text-text-muted">{String(anchor.label ?? index + 1)}</span>
            </div>
          );
        })}
      </div>
      {source && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Offset" value={`${formatNumber(offset)} ms`} />
          <Stat label="Drift" value={`${formatNumber(drift)} ms/min`} />
          <Stat label="Incerteza" value={source.uncertainty_ms == null ? '—' : `${formatNumber(Number(source.uncertainty_ms))} ms`} />
          <Stat label="Âncoras" value={String(anchors.length)} />
        </div>
      )}
    </section>
  );
}

function Lane({ icon, label, color, startPct }: { icon: ReactNode; label: string; color: string; startPct: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex w-20 items-center gap-1.5 text-[11px] font-medium text-text-secondary">{icon}{label}</div>
      <div className="relative h-8 flex-1 overflow-hidden rounded bg-app-bg">
        <div className={`absolute inset-y-2 rounded-sm opacity-35 ${color}`} style={{ left: `${startPct}%`, right: 0 }} />
        {startPct > 0 && <div className="absolute inset-y-0 left-0 bg-amber-100/60" style={{ width: `${startPct}%` }} title="Região sem sobreposição" />}
      </div>
    </div>
  );
}

function JobPanel({
  job,
  run,
  onCancel,
  onRetry,
  cancelPending,
  retryPending,
}: {
  job?: { status: string; progress: number; step: string; error?: string | null };
  run: SyncRunDTO | null;
  onCancel: () => void;
  onRetry: () => void;
  cancelPending: boolean;
  retryPending: boolean;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4" aria-labelledby="processing-heading">
      <h2 id="processing-heading" className="text-sm font-semibold text-text-primary">3. Processamento</h2>
      {!job && !run && <p className="mt-3 text-xs text-text-muted">Nenhum processamento iniciado nesta sessão.</p>}
      {(job || run) && (
        <>
          <div className="mt-3 flex items-center gap-2">
            {job && ['queued', 'running'].includes(job.status) ? <Loader2 className="animate-spin text-blue-600" size={16} /> : <Clock3 className="text-text-muted" size={16} />}
            <p className="text-xs font-medium text-text-secondary">{job?.step ?? statusLabel(run?.status)}</p>
            <span className="ml-auto font-mono text-xs text-text-muted">{Math.round(job?.progress ?? (run?.status === 'succeeded' ? 100 : 0))}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-muted">
            <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${job?.progress ?? (run?.status === 'succeeded' ? 100 : 0)}%` }} />
          </div>
          <p className="mt-2 break-words text-[11px] text-text-muted">Run {run?.id ?? '—'} · {run?.algorithm_version ?? 'aguardando versão'}</p>
          {(job?.error || run?.error_message) && <p className="mt-2 rounded bg-red-50 p-2 text-xs text-red-700">{job?.error ?? run?.error_message}</p>}
          <div className="mt-3 flex gap-2">
            {job && ['queued', 'running'].includes(job.status) && (
              <button type="button" onClick={onCancel} disabled={cancelPending} className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700"><X size={13} /> Cancelar</button>
            )}
            {job && ['failed', 'canceled'].includes(job.status) && (
              <button type="button" onClick={onRetry} disabled={retryPending} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-text-secondary"><RotateCcw size={13} /> Repetir</button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function ReviewPanel({
  run,
  runs,
  reviewRunId,
  setReviewRunId,
  justification,
  setJustification,
  onDecision,
  pending,
  error,
  sessionId,
  approvedRunId,
}: {
  run: SyncRunDTO | null;
  runs: SyncRunDTO[];
  reviewRunId?: string;
  setReviewRunId: (id: string) => void;
  justification: string;
  setJustification: (value: string) => void;
  onDecision: (approve: boolean) => void;
  pending: boolean;
  error: Error | null;
  sessionId?: string;
  approvedRunId?: string | null;
}) {
  const valid = (
    run?.status === 'succeeded'
    && run.outcome === 'proposal'
    && !run.review_decision
  );
  const result = run?.result ?? {};
  return (
    <section className="rounded-xl border border-border bg-surface p-4" aria-labelledby="review-heading">
      <h2 id="review-heading" className="text-sm font-semibold text-text-primary">4. Revisão humana</h2>
      {!!runs.length && (
        <select className={`${INPUT} mt-3`} value={reviewRunId ?? ''} onChange={(e) => setReviewRunId(e.target.value)}>
          {runs.map((item) => <option key={item.id} value={item.id}>{labelForMethod(item.method)} · {formatDate(item.created_at)}</option>)}
        </select>
      )}
      {!run && <p className="mt-3 text-xs text-text-muted">Execute um método para produzir uma proposta revisável.</p>}
      {run && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Stat label="Resultado" value={run.outcome === 'proposal' ? 'Proposta' : run.outcome ?? run.status} />
            <Stat label="Qualidade" value={run.quality_grade ?? '—'} />
            <Stat label="Offset" value={result.offset_ms == null ? '—' : `${formatNumber(Number(result.offset_ms))} ms`} />
            <Stat label="Incerteza" value={run.uncertainty_ms == null ? '—' : `${formatNumber(run.uncertainty_ms)} ms`} />
          </div>
          {run.outcome === 'insufficient_evidence' && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <p className="font-semibold">Dados insuficientes — aprovação bloqueada</p>
              <p className="mt-1">{String(result.reason ?? 'O algoritmo não encontrou evidência estável.')}</p>
            </div>
          )}
          <MetricList metrics={run.metrics} />
          {run.review_decision && (
            <p className={`mt-3 rounded-lg p-2 text-xs font-medium ${
              run.review_decision === 'approved'
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-red-50 text-red-700'
            }`}>
              Run {run.review_decision === 'approved' ? 'aprovado' : 'rejeitado'}
              {run.review_justification ? ` · ${run.review_justification}` : ''}
            </p>
          )}
          <label className="mt-3 block">
            <span className="text-xs font-medium text-text-secondary">Justificativa da decisão</span>
            <textarea className={`${INPUT} mt-1`} rows={3} value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="Obrigatória para aprovar ou rejeitar" />
          </label>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => onDecision(true)} disabled={!valid || !justification.trim() || pending} className="inline-flex items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"><Check size={14} /> Aprovar</button>
            <button type="button" onClick={() => onDecision(false)} disabled={!valid || !justification.trim() || pending} className="inline-flex items-center justify-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 disabled:opacity-40"><X size={14} /> Rejeitar</button>
          </div>
          {approvedRunId && (
            <Link to={`/app/sessions/${sessionId}/workspace`} className="mt-3 block text-center text-xs font-medium text-blue-700 underline">
              Abrir workspace com o mapeamento aprovado
            </Link>
          )}
          <MutationError error={error} />
        </>
      )}
    </section>
  );
}

function RunHistory({ runs, selected, onSelect }: { runs: SyncRunDTO[]; selected?: string; onSelect: (id: string) => void }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4" aria-labelledby="history-heading">
      <div>
        <h2 id="history-heading" className="text-sm font-semibold text-text-primary">Histórico versionado de runs</h2>
        <p className="text-xs text-text-muted">Resultados pendentes ou rejeitados nunca substituem a sincronização oficial.</p>
      </div>
      {!runs.length ? (
        <p className="mt-4 text-xs text-text-muted">Nenhum run registrado.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="border-b border-border text-[10px] uppercase tracking-wide text-text-muted">
              <tr><th scope="col" className="pb-2">Criado</th><th scope="col" className="pb-2">Método</th><th scope="col" className="pb-2">Status</th><th scope="col" className="pb-2">Offset</th><th scope="col" className="pb-2">Drift</th><th scope="col" className="pb-2">Incerteza</th><th scope="col" className="pb-2">Decisão</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {runs.map((run) => (
                <tr key={run.id} onClick={() => onSelect(run.id)} className={`cursor-pointer hover:bg-app-bg ${selected === run.id ? 'bg-blue-50/50' : ''}`}>
                  <td className="py-3 pr-4 text-text-muted">{formatDate(run.created_at)}</td>
                  <td className="py-3 pr-4 font-medium text-text-secondary">{labelForMethod(run.method)}</td>
                  <td className="py-3 pr-4">{run.outcome ?? run.status}</td>
                  <td className="py-3 pr-4 font-mono">{run.result.offset_ms == null ? '—' : `${formatNumber(Number(run.result.offset_ms))} ms`}</td>
                  <td className="py-3 pr-4 font-mono">{run.result.drift_ms_per_min == null ? '—' : formatNumber(Number(run.result.drift_ms_per_min))}</td>
                  <td className="py-3 pr-4 font-mono">{run.uncertainty_ms == null ? '—' : `${formatNumber(run.uncertainty_ms)} ms`}</td>
                  <td className="py-3">{run.review_decision ?? 'pendente'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function CapabilityStatus({ status }: { status?: string }) {
  const available = status === 'available';
  return (
    <span className={`mt-3 inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${available ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
      {available ? 'Disponível' : 'Requer entradas'}
    </span>
  );
}

function QualityBadge({ grade }: { grade: string }) {
  const color = grade === 'high' ? 'bg-emerald-50 text-emerald-700' : grade === 'medium' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700';
  return <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${color}`}>Qualidade {grade}</span>;
}

function MetricList({ metrics }: { metrics: Record<string, unknown> }) {
  const entries = Object.entries(metrics).filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value)).slice(0, 8);
  if (!entries.length) return null;
  return (
    <dl className="mt-3 divide-y divide-border rounded-lg border border-border px-3">
      {entries.map(([key, value]) => (
        <div key={key} className="flex items-center justify-between gap-3 py-1.5 text-[11px]">
          <dt className="truncate text-text-muted">{key.replaceAll('_', ' ')}</dt>
          <dd className="font-mono text-text-secondary">{typeof value === 'number' ? formatNumber(value) : String(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-app-bg px-3 py-2">
      <p className="text-[9px] uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-0.5 truncate text-xs font-semibold text-text-primary">{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1 block text-[11px] font-medium text-text-secondary">{label}</span>{children}</label>;
}

function MutationError({ error }: { error: Error | null }) {
  if (!error) return null;
  return <p className="mt-2 rounded-md bg-red-50 p-2 text-xs text-red-700" role="alert">{error.message}</p>;
}

function LoadingState() {
  return <div className="grid min-h-[40vh] place-items-center text-sm text-text-muted"><span className="inline-flex items-center gap-2"><Loader2 className="animate-spin" size={17} /> Carregando sincronização…</span></div>;
}

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function labelForMethod(method: string) {
  return SYNC_METHODS.find((item) => item.value === method)?.label ?? method;
}

function statusLabel(status?: string) {
  return status === 'succeeded' ? 'Processamento concluído' : status === 'failed' ? 'Falha no processamento' : status === 'canceled' ? 'Processamento cancelado' : 'Aguardando processamento';
}

import { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Database,
  Download,
  Eye,
  FileJson,
  GitBranch,
  Hammer,
  Layers3,
  Lock,
  RefreshCw,
  Search,
  Table2,
  Waypoints,
} from 'lucide-react';
import { BuildDatasetDialog } from '@/features/datasets/BuildDatasetDialog';
import { useLandmarkChunk } from '@/features/annotations/api/useAnnotationEditor';
import {
  useDatasetRecords,
  useDatasets,
  useFreezeDataset,
  type DatasetDTO,
  type DatasetRecord,
} from '@/features/multimodal/useMultimodal';
import { useSessions } from '@/features/sessions/useSessions';
import { PageHeader } from '@/components/layout/PageHeader';
import { ToneBadge } from '@/components/ui/ToneBadge';
import { ScientificCaveat } from '@/components/ui/ScientificCaveat';
import {
  DATASET_STATE_META,
  type DataTone,
  type DatasetState,
} from '@/types/research';
import { downloadApiFile } from '@/lib/api';

type DatasetTab = 'overview' | 'table' | 'points' | 'lineage';
type ExportFormat = 'manifest' | 'json' | 'csv';

const LEVEL_LABEL: Record<string, string> = {
  raw: 'Dados brutos',
  synced: 'Sincronizados',
  preprocessed: 'Pré-processados',
  features: 'Features',
  events: 'Eventos',
  analytic: 'Analítico',
  training: 'Treinamento',
  validation: 'Validação',
  publication: 'Publicação',
};

const SYNC_LABEL: Record<string, string> = {
  not_synced: 'Não sincronizada',
  auto_available: 'Proposta automática',
  in_review: 'Em revisão',
  synced: 'Sincronizada',
  synced_with_caveats: 'Com ressalvas',
  sync_failed: 'Falhou',
};

const SYNC_TONE: Record<string, DataTone> = {
  not_synced: 'neutral',
  auto_available: 'info',
  in_review: 'warning',
  synced: 'success',
  synced_with_caveats: 'warning',
  sync_failed: 'danger',
};

interface ManifestView {
  datasetVersion: string;
  sourceStudies: string[];
  participantCount: number;
  sessionCount: number;
  conditions: string[];
  modalities: string[];
  inclusionCriteria: string[];
  exclusionCriteria: string[];
  transformations: string[];
  pipelineVersions: string[];
  modelVersions: string[];
  missingDataPolicy?: string;
  generatedAt: string;
  owner: string;
  checksum?: string;
  schema: Record<string, string>;
}

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function manifestView(dataset: DatasetDTO): ManifestView {
  const manifest = dataset.manifest ?? {};
  return {
    datasetVersion: dataset.dataset_version,
    sourceStudies: list(manifest.sourceStudies),
    participantCount: dataset.participant_count,
    sessionCount: dataset.session_count,
    conditions: list(manifest.conditions),
    modalities: list(manifest.modalities),
    inclusionCriteria: list(manifest.inclusionCriteria),
    exclusionCriteria: list(manifest.exclusionCriteria),
    transformations: list(manifest.transformations),
    pipelineVersions: list(manifest.pipelineVersions),
    modelVersions: list(manifest.modelVersions),
    missingDataPolicy: String(manifest.missingDataPolicy ?? ''),
    generatedAt: String(manifest.generatedAt ?? dataset.built_at ?? dataset.created_at),
    owner: dataset.owner ?? String(manifest.owner ?? '—'),
    checksum: dataset.checksum ?? String(manifest.checksum ?? ''),
    schema: (
      manifest.schema && typeof manifest.schema === 'object'
        ? manifest.schema
        : {}
    ) as Record<string, string>,
  };
}

export function DatasetsPage() {
  const datasetsQuery = useDatasets();
  const sessionsQuery = useSessions();
  const freeze = useFreezeDataset();
  const datasets = datasetsQuery.data ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<DatasetTab>('overview');
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId && datasets.length > 0) setSelectedId(datasets[0].id);
    if (selectedId && !datasets.some((dataset) => dataset.id === selectedId)) {
      setSelectedId(datasets[0]?.id ?? null);
    }
  }, [datasets, selectedId]);

  const selected = datasets.find((dataset) => dataset.id === selectedId) ?? datasets[0];
  const recordsQuery = useDatasetRecords(
    selected?.storage_uri || selected?.build_status === 'built' ? selected.id : undefined,
  );

  const runExport = async (format: ExportFormat) => {
    if (!selected) return;
    setExporting(format);
    setExportError(null);
    try {
      await downloadApiFile(
        `/datasets/${selected.id}/export?format=${format}`,
        `${selected.name}_${selected.dataset_version}.${format === 'csv' ? 'csv' : 'json'}`,
      );
    } catch (error) {
      setExportError((error as Error).message);
    } finally {
      setExporting(null);
    }
  };

  const loading = datasetsQuery.isLoading || sessionsQuery.isLoading;
  if (loading) return <DatasetsSkeleton />;

  if (datasetsQuery.isError) {
    return (
      <div className="min-h-full bg-app-bg">
        <DatasetsHeader />
        <div className="p-6">
          <Notice
            tone="danger"
            title="Não foi possível sincronizar a lista de datasets"
            description="A API não respondeu. Verifique o serviço e tente atualizar a página."
          />
        </div>
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="min-h-full bg-app-bg pb-12">
        <DatasetsHeader />
        <ReadinessDashboard sessions={sessionsQuery.data ?? []} />
      </div>
    );
  }

  const manifest = manifestView(selected);
  const state = DATASET_STATE_META[selected.state as DatasetState] ?? {
    label: selected.state,
    tone: 'neutral' as DataTone,
  };
  const materialized = Boolean(selected.storage_uri || selected.build_status === 'built');

  return (
    <div className="min-h-full bg-app-bg pb-12">
      <DatasetsHeader />
      <main className="space-y-5 px-4 py-5 sm:px-6">
        <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-xl font-semibold text-text-primary">
                    {selected.name}
                  </h2>
                  <ToneBadge tone={state.tone}>{state.label}</ToneBadge>
                  {datasetsQuery.isFetching && (
                    <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                      <RefreshCw size={12} className="animate-spin" /> atualizando
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-text-secondary">
                  {manifest.datasetVersion} · {LEVEL_LABEL[selected.level ?? 'analytic'] ?? selected.level}
                  {selected.built_at ? ` · materializado em ${formatDate(selected.built_at)}` : ' · ainda não materializado'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!['frozen', 'published_internal'].includes(selected.state) && (
                  <BuildDatasetDialog datasetId={selected.id}>
                    <button className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-surface-hover">
                      <Hammer size={14} /> Construir
                    </button>
                  </BuildDatasetDialog>
                )}
                {!['frozen', 'published_internal'].includes(selected.state) && (
                  <button
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={freeze.isPending || !materialized}
                    onClick={() => freeze.mutate(selected.id)}
                    title={!materialized ? 'Materialize o dataset antes de congelar' : undefined}
                  >
                    <Lock size={14} /> {freeze.isPending ? 'Congelando…' : 'Congelar'}
                  </button>
                )}
                <ExportButtons
                  materialized={materialized}
                  exporting={exporting}
                  onExport={runExport}
                />
              </div>
            </div>

            {(selected.build_error || exportError) && (
              <p className="mt-4 rounded-lg border border-danger-border bg-danger-light px-3 py-2 text-xs text-danger">
                {selected.build_error ?? exportError}
              </p>
            )}

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Participantes" value={manifest.participantCount} />
              <Metric label="Sessões" value={manifest.sessionCount} />
              <Metric label="Estudos" value={manifest.sourceStudies.length} />
              <Metric
                label="Sincronização"
                value={
                  recordsQuery.data
                    ? `${Math.round(recordsQuery.data.summary.sync.coverage_ratio * 100)}%`
                    : '—'
                }
                detail={recordsQuery.data ? `${recordsQuery.data.summary.sync.approved}/${recordsQuery.data.total}` : undefined}
              />
            </div>
          </div>

          <DatasetPicker
            datasets={datasets}
            selectedId={selected.id}
            onSelect={(id) => {
              setSelectedId(id);
              setTab('overview');
            }}
          />
        </section>

        <nav className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-surface p-1" aria-label="Seções do dataset">
          <TabButton active={tab === 'overview'} onClick={() => setTab('overview')} icon={BarChart3}>
            Visão científica
          </TabButton>
          <TabButton active={tab === 'table'} onClick={() => setTab('table')} icon={Table2}>
            Tabela de registros
          </TabButton>
          <TabButton active={tab === 'points'} onClick={() => setTab('points')} icon={Waypoints}>
            Pontos faciais
          </TabButton>
          <TabButton active={tab === 'lineage'} onClick={() => setTab('lineage')} icon={GitBranch}>
            Proveniência
          </TabButton>
        </nav>

        {!materialized && (
          <Notice
            tone="warning"
            title="Dataset ainda não materializado"
            description="Defina os critérios, calcule a prévia e construa esta versão para liberar a tabela, os pontos e as exportações completas."
          />
        )}
        {recordsQuery.isError && materialized && (
          <Notice
            tone="danger"
            title="O artefato materializado não está acessível"
            description={(recordsQuery.error as Error).message}
          />
        )}

        {tab === 'overview' && (
          <OverviewTab
            dataset={selected}
            manifest={manifest}
            records={recordsQuery.data}
          />
        )}
        {tab === 'table' && (
          <RecordsTab
            records={recordsQuery.data?.records ?? []}
            excluded={recordsQuery.data?.excluded ?? selected.excluded_sessions ?? []}
            loading={recordsQuery.isLoading}
            onInspectPoints={() => setTab('points')}
          />
        )}
        {tab === 'points' && (
          <LandmarksTab records={recordsQuery.data?.records ?? []} loading={recordsQuery.isLoading} />
        )}
        {tab === 'lineage' && (
          <LineageTab dataset={selected} manifest={manifest} />
        )}
      </main>
    </div>
  );
}

function DatasetsHeader() {
  return (
    <PageHeader
      title="Datasets científicos"
      description="Inspecione sincronização, qualidade, registros e pontos antes de congelar uma versão reprodutível."
      actions={
        <BuildDatasetDialog>
          <button className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover">
            <GitBranch size={15} /> Criar dataset
          </button>
        </BuildDatasetDialog>
      }
    />
  );
}

function ReadinessDashboard({ sessions }: { sessions: Array<{
  id: string;
  state?: string | null;
  condition?: string | null;
  video_asset_id?: string | null;
  eeg_asset_id?: string | null;
  sync_state?: string | null;
}> }) {
  const multimodal = sessions.filter((session) => session.video_asset_id && session.eeg_asset_id).length;
  const synced = sessions.filter((session) =>
    session.sync_state === 'synced' || session.sync_state === 'synced_with_caveats'
  ).length;
  const readiness = sessions.length ? Math.round((synced / sessions.length) * 100) : 0;

  return (
    <main className="space-y-5 px-4 py-5 sm:px-6">
      <Notice
        tone="info"
        title="Nenhum dataset versionado foi criado"
        description="Os dados de origem continuam visíveis abaixo. Use este diagnóstico para corrigir lacunas de modalidade e sincronização antes da primeira materialização."
        action={
          <BuildDatasetDialog>
            <button className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover">
              <GitBranch size={14} /> Configurar primeiro dataset
            </button>
          </BuildDatasetDialog>
        }
      />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Sessões de origem" value={sessions.length} />
        <Metric label="Vídeo + EEG" value={multimodal} detail={`${percent(multimodal, sessions.length)} do total`} />
        <Metric label="Sincronizadas" value={synced} detail={`${readiness}% do total`} />
        <Metric
          label="Pendências"
          value={Math.max(0, sessions.length - synced)}
          detail="revisar antes de exigir sync"
        />
      </section>
      <section className="rounded-xl border border-border bg-surface shadow-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Prontidão das sessões</h2>
            <p className="mt-0.5 text-xs text-text-muted">Fonte viva da API · até 100 sessões mais recentes</p>
          </div>
          <span className="text-xs font-medium text-text-secondary">{readiness}% sincronizadas</span>
        </div>
        {sessions.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-text-muted">
            Ainda não há sessões de origem disponíveis.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th scope="col">Sessão</th><th scope="col">Condição</th><th scope="col">Vídeo</th><th scope="col">EEG</th><th scope="col">Sincronização</th><th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {sessions.slice(0, 20).map((session) => (
                  <tr key={session.id}>
                    <td className="font-mono text-xs">{session.id.slice(0, 8)}</td>
                    <td>{session.condition ?? '—'}</td>
                    <td><Presence present={Boolean(session.video_asset_id)} /></td>
                    <td><Presence present={Boolean(session.eeg_asset_id)} /></td>
                    <td><SyncBadge state={session.sync_state} /></td>
                    <td className="text-xs text-text-secondary">{session.state ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function OverviewTab({
  dataset,
  manifest,
  records,
}: {
  dataset: DatasetDTO;
  manifest: ManifestView;
  records?: ReturnType<typeof useDatasetRecords>['data'];
}) {
  const summary = records?.summary;
  return (
    <div className="space-y-5">
      <section className="grid gap-4 lg:grid-cols-3">
        <ScientificCard icon={Waypoints} title="Sincronização multimodal">
          <CoverageBar
            value={summary?.sync.approved ?? 0}
            total={summary?.record_count ?? manifest.sessionCount}
            label="Sessões com sincronização aprovada"
          />
          <StatRow label="Offset mediano" value={formatMetric(summary?.sync.offset_ms_median, ' ms')} />
          <StatRow label="Offset médio" value={formatMetric(summary?.sync.offset_ms_mean, ' ms')} />
          <StatRow label="Drift médio" value={formatMetric(summary?.sync.drift_ms_per_min_mean, ' ms/min')} />
          <StatRow
            label="Confiança média"
            value={summary?.sync.confidence_mean == null ? '—' : `${Math.round(summary.sync.confidence_mean * 100)}% (n=${summary.sync.confidence_n})`}
          />
        </ScientificCard>
        <ScientificCard icon={Layers3} title="Completude das modalidades">
          <CoverageBar
            value={summary?.modality_coverage.multimodal ?? 0}
            total={summary?.record_count ?? manifest.sessionCount}
            label="Registros com vídeo e EEG"
          />
          <StatRow label="Vídeo" value={countOf(summary?.modality_coverage.video, summary?.record_count)} />
          <StatRow label="EEG" value={countOf(summary?.modality_coverage.eeg, summary?.record_count)} />
          <StatRow label="Landmarks prontos" value={countOf(summary?.modality_coverage.landmarks_ready, summary?.record_count)} />
          <StatRow
            label="EEG válido médio"
            value={summary?.eeg.valid_ratio_mean == null ? '—' : `${Math.round(summary.eeg.valid_ratio_mean * 100)}% (n=${summary.eeg.valid_ratio_n})`}
          />
        </ScientificCard>
        <ScientificCard icon={Activity} title="Integridade da versão">
          <StatRow label="Estado" value={dataset.state} />
          <StatRow label="Build" value={dataset.build_status ?? 'rascunho'} />
          <StatRow label="Incluídas" value={String(dataset.lineage?.included ?? dataset.session_count)} />
          <StatRow label="Excluídas" value={String(dataset.lineage?.excluded ?? dataset.excluded_sessions?.length ?? 0)} />
          <StatRow label="Checksum" value={manifest.checksum || 'Disponível após materialização'} mono />
        </ScientificCard>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <ManifestBlock title="População e critérios">
          <Field label="Estudos" value={manifest.sourceStudies.join(', ')} />
          <Field label="Condições" value={manifest.conditions.join(', ')} />
          <Field label="Modalidades" value={manifest.modalities.join(', ')} />
          <Field label="Inclusão" value={manifest.inclusionCriteria.join('; ')} />
          <Field label="Exclusão" value={manifest.exclusionCriteria.join('; ')} />
        </ManifestBlock>
        <ManifestBlock title="Processamento declarado">
          <Field label="Transformações" value={manifest.transformations.join('; ')} />
          <Field label="Pipelines" value={manifest.pipelineVersions.join(', ')} mono />
          <Field label="Modelos" value={manifest.modelVersions.join(', ')} mono />
          <Field label="Dados ausentes" value={manifest.missingDataPolicy} />
          <Field label="Responsável" value={manifest.owner} />
        </ManifestBlock>
      </section>
      <ScientificCaveat variant="privacy" compact />
    </div>
  );
}

function RecordsTab({
  records,
  excluded,
  loading,
  onInspectPoints,
}: {
  records: DatasetRecord[];
  excluded: { session_id: string; reason: string }[];
  loading: boolean;
  onInspectPoints: () => void;
}) {
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLowerCase();
  const filtered = records.filter((record) =>
    !normalized || [
      record.session_id,
      record.participant_code,
      record.condition ?? '',
      record.sync?.state ?? '',
    ].some((value) => value.toLowerCase().includes(normalized))
  );

  if (loading) return <PanelLoading label="Carregando registros materializados…" />;
  if (!records.length) {
    return <Notice tone="neutral" title="Nenhum registro para analisar" description="Materialize o dataset ou revise os critérios de inclusão." />;
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-border bg-surface shadow-card">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Amostra tabular auditável</h2>
            <p className="mt-0.5 text-xs text-text-muted">
              {filtered.length} de {records.length} registros carregados · identificadores de participantes pseudonimizados
            </p>
          </div>
          <label className="relative block min-w-64">
            <Search className="absolute left-3 top-2.5 text-text-muted" size={14} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filtrar sessão, participante, condição…"
              className="w-full rounded-md border border-border bg-surface py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted"
            />
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th scope="col">Sessão</th><th scope="col">Participante</th><th scope="col">Condição</th><th scope="col">Modalidades</th>
                <th scope="col">Sync</th><th scope="col">Offset</th><th scope="col">Confiança</th><th scope="col">EEG válido</th><th scope="col">Landmarks</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((record) => (
                <tr key={record.session_id}>
                  <td className="font-mono text-xs">{record.session_id.slice(0, 8)}</td>
                  <td className="font-mono text-xs">{record.participant_code}</td>
                  <td>{record.condition ?? '—'}</td>
                  <td>
                    <span className="inline-flex gap-1">
                      <MiniTag active={Boolean(record.video)}>VÍDEO</MiniTag>
                      <MiniTag active={Boolean(record.eeg)}>EEG</MiniTag>
                    </span>
                  </td>
                  <td><SyncBadge state={record.sync?.state} /></td>
                  <td className="font-mono text-xs">{formatMetric(record.sync?.offset_ms, ' ms')}</td>
                  <td>{formatPercent(record.sync?.confidence)}</td>
                  <td>{formatPercent(record.eeg?.valid_ratio)}</td>
                  <td>
                    {record.video?.landmarks?.status === 'ready' ? (
                      <button onClick={onInspectPoints} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-hover">
                        <Eye size={13} /> {record.video.landmarks.point_count ?? '—'} pts
                      </button>
                    ) : (
                      <span className="text-xs text-text-muted">{record.video?.landmarks?.status ?? 'ausente'}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <ExcludedTable excluded={excluded} />
    </div>
  );
}

function LandmarksTab({ records, loading }: { records: DatasetRecord[]; loading: boolean }) {
  const candidates = records.filter((record) =>
    record.video?.id && record.video.landmarks?.status === 'ready'
  );
  const [selectedSession, setSelectedSession] = useState<string>('');
  const [framePosition, setFramePosition] = useState(0);
  const selected = candidates.find((record) => record.session_id === selectedSession) ?? candidates[0];
  const videoId = selected?.video?.id ?? '';
  const artifact = selected?.video?.landmarks;
  const landmarks = useLandmarkChunk(videoId, artifact?.artifact_id, 0, 'mesh');
  const frames = landmarks.data?.frames ?? [];
  const frame = frames[framePosition] ?? frames.find((item) => item.faceDetected) ?? frames[0];

  useEffect(() => {
    setFramePosition(0);
  }, [selected?.session_id]);

  if (loading) return <PanelLoading label="Carregando índice de landmarks…" />;
  if (!candidates.length) {
    return (
      <Notice
        tone="warning"
        title="Nenhum ponto facial disponível nesta versão"
        description="Os registros precisam conter vídeo e um artefato de landmarks com estado ready. Reconstrua a versão após concluir a extração."
      />
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,.75fr)]">
      <section className="rounded-xl border border-border bg-surface shadow-card">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Mapa de pontos normalizados</h2>
            <p className="mt-0.5 text-xs text-text-muted">Coordenadas x/y no espaço normalizado [0, 1] · chunk 0</p>
          </div>
          <select
            value={selected?.session_id ?? ''}
            onChange={(event) => setSelectedSession(event.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary"
            aria-label="Selecionar sessão para visualizar pontos"
          >
            {candidates.map((record) => (
              <option key={record.session_id} value={record.session_id}>
                {record.session_id.slice(0, 8)} · {record.participant_code}
              </option>
            ))}
          </select>
        </div>
        <div className="p-4">
          {landmarks.isLoading ? (
            <PanelLoading label="Carregando primeiro chunk…" />
          ) : landmarks.isError || !frame ? (
            <Notice tone="danger" title="Não foi possível ler os pontos" description={(landmarks.error as Error)?.message ?? 'Chunk indisponível'} />
          ) : (
            <>
              <div className="aspect-video overflow-hidden rounded-lg border border-border bg-[#07111f]">
                <svg viewBox="0 0 100 100" className="h-full w-full" role="img" aria-label={`Pontos faciais do frame ${frame.frameIndex}`}>
                  <rect width="100" height="100" fill="#07111f" />
                  <g stroke="#1e3a5f" strokeWidth=".2" opacity=".6">
                    {[20, 40, 60, 80].map((position) => (
                      <g key={position}>
                        <line x1={position} y1="0" x2={position} y2="100" />
                        <line x1="0" y1={position} x2="100" y2={position} />
                      </g>
                    ))}
                  </g>
                  {frame.points.map(([id, x, y]) => (
                    <circle key={id} cx={x * 100} cy={y * 100} r=".42" fill="#38bdf8" opacity=".88" />
                  ))}
                </svg>
              </div>
              <div className="mt-4 flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs text-text-secondary">
                  <span>Frame {frame.frameIndex} · {Math.round(frame.timestampMs)} ms</span>
                  <span>{frame.points.length} pontos · face {frame.faceDetected ? 'detectada' : 'não detectada'}</span>
                </div>
                {frames.length > 1 && (
                  <input
                    type="range"
                    min={0}
                    max={frames.length - 1}
                    value={Math.min(framePosition, frames.length - 1)}
                    onChange={(event) => setFramePosition(Number(event.target.value))}
                    aria-label="Selecionar frame do chunk"
                  />
                )}
              </div>
            </>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <ScientificCard icon={Waypoints} title="Artefato de landmarks">
          <StatRow label="Extrator" value={`${artifact?.extractor ?? '—'} ${artifact?.extractor_version ?? ''}`.trim()} />
          <StatRow label="Frames" value={String(artifact?.frame_count ?? '—')} />
          <StatRow label="Pontos esperados" value={String(artifact?.point_count ?? '—')} />
          <StatRow label="Detecção facial" value={formatPercent(artifact?.face_detection_rate)} />
          <StatRow label="Chunk" value={`${artifact?.chunk_size_frames ?? '—'} frames`} />
          <StatRow label="Checksum normalizado" value={artifact?.normalized_checksum ?? '—'} mono />
        </ScientificCard>
        {frame && (
          <div className="max-h-80 overflow-auto rounded-xl border border-border bg-surface shadow-card">
            <table className="data-table w-full">
              <thead><tr><th scope="col">ID</th><th scope="col">x</th><th scope="col">y</th></tr></thead>
              <tbody>
                {frame.points.slice(0, 80).map(([id, x, y]) => (
                  <tr key={id}>
                    <td className="font-mono text-xs">{id}</td>
                    <td className="font-mono text-xs">{x.toFixed(6)}</td>
                    <td className="font-mono text-xs">{y.toFixed(6)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function LineageTab({ dataset, manifest }: { dataset: DatasetDTO; manifest: ManifestView }) {
  const schema = Object.keys(manifest.schema).length
    ? manifest.schema
    : {
        session_id: 'str',
        participant_code: 'str (pseudonimizado)',
        video: 'observado | null',
        eeg: 'observado | null',
        sync: 'derivado | null',
      };
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <ManifestBlock title="Identidade imutável">
        <Field label="Dataset" value={dataset.name} />
        <Field label="Versão" value={dataset.dataset_version} mono />
        <Field label="Checksum" value={manifest.checksum} mono />
        <Field label="Criado em" value={formatDate(dataset.created_at)} />
        <Field label="Materializado em" value={dataset.built_at ? formatDate(dataset.built_at) : '—'} />
        <Field label="Congelado em" value={dataset.frozen_at ? formatDate(dataset.frozen_at) : '—'} />
        <Field label="Responsável" value={manifest.owner} />
      </ManifestBlock>
      <ManifestBlock title="Transformações e versões">
        <Field label="Transformações" value={manifest.transformations.join('; ')} />
        <Field label="Pipelines" value={manifest.pipelineVersions.join(', ')} mono />
        <Field label="Modelos" value={manifest.modelVersions.join(', ')} mono />
        <Field label="Política de ausentes" value={manifest.missingDataPolicy} />
      </ManifestBlock>
      <section className="rounded-xl border border-border bg-surface shadow-card lg:col-span-2">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">Dicionário do registro</h2>
          <p className="mt-0.5 text-xs text-text-muted">Campos observados e derivados permanecem explicitamente separados.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table w-full">
            <thead><tr><th scope="col">Campo</th><th scope="col">Definição</th><th scope="col">Origem</th></tr></thead>
            <tbody>
              {Object.entries(schema).map(([field, definition]) => (
                <tr key={field}>
                  <td className="font-mono text-xs">{field}</td>
                  <td>{definition}</td>
                  <td><MiniTag active>{field === 'sync' ? 'DERIVADO' : 'OBSERVADO/ID'}</MiniTag></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="lg:col-span-2">
        <ScientificCaveat variant="privacy" compact />
      </div>
    </div>
  );
}

function DatasetPicker({
  datasets,
  selectedId,
  onSelect,
}: {
  datasets: DatasetDTO[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <aside className="rounded-xl border border-border bg-surface p-3 shadow-card">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">Versões disponíveis</h2>
        <span className="text-xs text-text-muted">{datasets.length}</span>
      </div>
      <div className="max-h-56 space-y-1 overflow-auto">
        {datasets.map((dataset) => {
          const active = dataset.id === selectedId;
          const meta = DATASET_STATE_META[dataset.state as DatasetState];
          return (
            <button
              key={dataset.id}
              onClick={() => onSelect(dataset.id)}
              className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
                active
                  ? 'border-primary-border bg-primary-light'
                  : 'border-transparent hover:border-border hover:bg-surface-hover'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-text-primary">{dataset.name}</span>
                <span className="font-mono text-[10px] text-text-muted">{dataset.dataset_version}</span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-text-secondary">
                <span>{meta?.label ?? dataset.state}</span>
                <span>·</span>
                <span>{dataset.session_count} sessões</span>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function ExportButtons({
  materialized,
  exporting,
  onExport,
}: {
  materialized: boolean;
  exporting: ExportFormat | null;
  onExport: (format: ExportFormat) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-border">
      <button
        onClick={() => onExport('manifest')}
        disabled={Boolean(exporting)}
        className="inline-flex items-center gap-1.5 bg-surface px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover disabled:opacity-50"
        title="Manifesto JSON"
      >
        <FileJson size={13} /> Manifesto
      </button>
      {(['csv', 'json'] as const).map((format) => (
        <button
          key={format}
          onClick={() => onExport(format)}
          disabled={Boolean(exporting) || !materialized}
          className="inline-flex items-center gap-1 border-l border-border bg-surface px-2.5 py-1.5 text-xs font-medium uppercase text-text-secondary hover:bg-surface-hover disabled:opacity-40"
          title={!materialized ? 'Materialize o dataset para exportar os registros' : `Exportar registros em ${format.toUpperCase()}`}
        >
          <Download size={12} /> {exporting === format ? '…' : format}
        </button>
      ))}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Activity;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active ? 'bg-primary text-white' : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
      }`}
    >
      <Icon size={14} /> {children}
    </button>
  );
}

function ScientificCard({ icon: Icon, title, children }: { icon: typeof Activity; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <div className="mb-4 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary-light text-primary">
          <Icon size={16} />
        </span>
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function CoverageBar({ value, total, label }: { value: number; total: number; label: string }) {
  const ratio = total ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div className="mb-4">
      <div className="mb-1.5 flex items-end justify-between gap-2">
        <span className="text-xs text-text-secondary">{label}</span>
        <span className="font-mono text-sm font-semibold text-text-primary">{value}/{total} · {ratio}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${ratio}%` }} />
      </div>
    </div>
  );
}

function StatRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-t border-border/70 pt-2 text-xs">
      <span className="text-text-muted">{label}</span>
      <span className={`text-right text-text-primary ${mono ? 'break-all font-mono text-[10px]' : 'font-medium'}`}>{value}</span>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-muted p-3">
      <p className="text-2xl font-bold tabular-nums text-text-primary">{value}</p>
      <p className="mt-0.5 text-[11px] font-medium text-text-secondary">{label}</p>
      {detail && <p className="mt-1 text-[10px] text-text-muted">{detail}</p>}
    </div>
  );
}

function ManifestBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-text-muted">{title}</h2>
      <dl className="space-y-2">{children}</dl>
    </section>
  );
}

function Field({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 text-xs">
      <dt className="text-text-muted">{label}</dt>
      <dd className={`${mono ? 'break-all font-mono text-[11px]' : ''} text-text-primary`}>{value || '—'}</dd>
    </div>
  );
}

function Notice({
  tone,
  title,
  description,
  action,
}: {
  tone: DataTone;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  const styles: Record<DataTone, string> = {
    neutral: 'border-border bg-surface',
    info: 'border-info-border border-l-4 bg-surface',
    success: 'border-success-border border-l-4 bg-surface',
    warning: 'border-warning-border border-l-4 bg-surface',
    danger: 'border-danger-border border-l-4 bg-surface',
  };
  const Icon = tone === 'danger' || tone === 'warning' ? AlertTriangle : Database;
  return (
    <section className={`flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${styles[tone]}`}>
      <div className="flex gap-3">
        <Icon size={20} className="mt-0.5 shrink-0 text-text-secondary" />
        <div>
          <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-text-secondary">{description}</p>
        </div>
      </div>
      {action}
    </section>
  );
}

function Presence({ present }: { present: boolean }) {
  return present ? (
    <span className="inline-flex items-center gap-1 text-xs text-success"><CheckCircle2 size={13} /> presente</span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs text-text-muted">— ausente</span>
  );
}

function SyncBadge({ state }: { state?: string | null }) {
  const key = state ?? 'not_synced';
  return <ToneBadge tone={SYNC_TONE[key] ?? 'neutral'}>{SYNC_LABEL[key] ?? key}</ToneBadge>;
}

function MiniTag({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold tracking-wide ${
      active ? 'bg-primary-light text-primary' : 'bg-surface-muted text-text-muted'
    }`}>
      {children}
    </span>
  );
}

function ExcludedTable({ excluded }: { excluded: { session_id: string; reason: string }[] }) {
  if (!excluded.length) return null;
  return (
    <section className="rounded-xl border border-border bg-surface shadow-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-text-primary">Sessões excluídas</h2>
        <p className="mt-0.5 text-xs text-text-muted">Motivos persistidos na linhagem; não inferidos pela interface.</p>
      </div>
      <div className="max-h-72 overflow-auto">
        <table className="data-table w-full">
          <thead><tr><th scope="col">Sessão</th><th scope="col">Motivo explícito</th></tr></thead>
          <tbody>
            {excluded.map((item) => (
              <tr key={`${item.session_id}-${item.reason}`}>
                <td className="font-mono text-xs">{item.session_id.slice(0, 8)}</td>
                <td>{item.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PanelLoading({ label }: { label: string }) {
  return (
    <div className="flex min-h-48 items-center justify-center rounded-xl border border-border bg-surface text-sm text-text-muted">
      <RefreshCw size={15} className="mr-2 animate-spin" /> {label}
    </div>
  );
}

function DatasetsSkeleton() {
  return (
    <div className="min-h-full bg-app-bg">
      <DatasetsHeader />
      <div className="grid gap-4 p-6 lg:grid-cols-4">
        {[0, 1, 2, 3].map((key) => <div key={key} className="skeleton h-28" />)}
      </div>
    </div>
  );
}

function formatMetric(value?: number | null, suffix = '') {
  return value == null ? '—' : `${Number(value.toFixed(2)).toLocaleString('pt-BR')}${suffix}`;
}

function formatPercent(value?: number | null) {
  return value == null ? '—' : `${Math.round(value * 100)}%`;
}

function countOf(value?: number, total?: number) {
  return value == null || total == null ? '—' : `${value}/${total} · ${percent(value, total)}`;
}

function percent(value: number, total: number) {
  return `${total ? Math.round((value / total) * 100) : 0}%`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

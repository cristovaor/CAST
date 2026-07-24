import { useState, useMemo } from 'react';
import { Database, Download, GitBranch, Lock, FileJson, Hammer } from 'lucide-react';
import { BuildDatasetDialog } from '@/features/datasets/BuildDatasetDialog';
import { PageHeader } from '@/components/layout/PageHeader';
import { ToneBadge } from '@/components/ui/ToneBadge';
import { ScientificCaveat } from '@/components/ui/ScientificCaveat';
import { DATASET_STATE_META, type DatasetVersion, type DatasetState, type DatasetLevel, type DatasetManifest } from '@/types/research';
import { MOCK_DATASETS } from '@/lib/mocks/multimodalMocks';
import { useDatasets, useFreezeDataset, type DatasetDTO } from '@/features/multimodal/useMultimodal';
import { API_BASE_URL } from '@/lib/api';

// Reproducible, versioned multimodal datasets (docs §17). Each version carries
// a full manifest: sources, criteria, transformations, pipeline & model
// versions, schema, lineage and checksum. Every export ships the manifest.

const LEVEL_LABEL: Record<string, string> = {
  raw: 'Dados brutos', synced: 'Sincronizados', preprocessed: 'Pré-processados',
  features: 'Features', events: 'Eventos', analytic: 'Analítico',
  training: 'Treinamento', validation: 'Validação', publication: 'Publicação',
};

// Adapts a backend DatasetDTO to the view model, falling back to manifest data
// for the rich fields the list endpoint does not expand.
function toViewModel(d: DatasetDTO): DatasetVersion {
  const man = (d.manifest ?? {}) as Partial<DatasetManifest>;
  return {
    id: d.id,
    name: d.name,
    level: (d.level ?? 'analytic') as DatasetLevel,
    state: d.state as DatasetState,
    createdAt: d.created_at,
    manifest: {
      datasetVersion: d.dataset_version,
      level: (d.level ?? 'analytic') as DatasetLevel,
      sourceStudies: man.sourceStudies ?? [],
      participantCount: d.participant_count,
      sessionCount: d.session_count,
      conditions: man.conditions ?? [],
      modalities: man.modalities ?? [],
      inclusionCriteria: man.inclusionCriteria ?? [],
      exclusionCriteria: man.exclusionCriteria ?? [],
      temporalWindows: man.temporalWindows,
      minQuality: man.minQuality,
      transformations: man.transformations ?? [],
      pipelineVersions: man.pipelineVersions ?? [],
      modelVersions: man.modelVersions ?? [],
      schemaRef: man.schemaRef,
      dataDictionaryRef: man.dataDictionaryRef,
      lineageRef: man.lineageRef,
      checksum: d.checksum ?? man.checksum,
      missingDataPolicy: man.missingDataPolicy,
      generatedAt: d.created_at,
      owner: d.owner ?? man.owner ?? '—',
    },
  };
}

export function DatasetsPage() {
  const { data: live } = useDatasets();
  const freeze = useFreezeDataset();

  // Prefer live datasets; fall back to mock so the screen is never empty.
  const datasets = useMemo<DatasetVersion[]>(
    () => (live && live.length ? live.map(toViewModel) : MOCK_DATASETS),
    [live],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = datasets.find((d) => d.id === selectedId) ?? datasets[0];
  const m = selected.manifest;
  const state = DATASET_STATE_META[selected.state];
  const isLive = !!(live && live.length);

  return (
    <div className="min-h-full bg-slate-50/50 pb-12">
      <PageHeader
        title="Datasets científicos"
        description="Conjuntos multimodais sincronizados, versionados e reprodutíveis. Cada versão registra origem, critérios, transformações e versões de pipeline e modelo."
        actions={
          <button className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
            <GitBranch size={15} /> Nova versão
          </button>
        }
      />

      <div className="px-6 pt-6 grid gap-6 lg:grid-cols-[300px_1fr]">
        {/* List */}
        <div className="space-y-2">
          {datasets.map((ds) => {
            const s = DATASET_STATE_META[ds.state];
            const active = ds.id === selected.id;
            return (
              <button
                key={ds.id}
                onClick={() => setSelectedId(ds.id)}
                className={`w-full text-left rounded-xl border p-3.5 transition-colors ${active ? 'border-blue-300 bg-blue-50/50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                    <Database size={14} className="text-slate-400" /> {ds.name}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <ToneBadge tone={s.tone}>{s.label}</ToneBadge>
                  <span className="text-[10px] font-mono text-slate-500">{ds.manifest.datasetVersion}</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">{LEVEL_LABEL[ds.level]} · {ds.manifest.sessionCount} sessões</p>
              </button>
            );
          })}
        </div>

        {/* Manifest detail */}
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{selected.name}</h2>
                <div className="flex items-center gap-2 mt-1.5">
                  <ToneBadge tone={state.tone}>{state.label}</ToneBadge>
                  <span className="text-[11px] font-mono text-slate-500">{m.datasetVersion}</span>
                  <span className="text-[11px] text-slate-400">· {LEVEL_LABEL[selected.level]}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isLive && selected.state !== 'frozen' && selected.state !== 'published_internal' && (
                  <BuildDatasetDialog datasetId={selected.id}>
                    <button className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
                      <Hammer size={14} /> Construir
                    </button>
                  </BuildDatasetDialog>
                )}
                {selected.state !== 'frozen' && selected.state !== 'published_internal' && (
                  <button
                    disabled={!isLive || freeze.isPending}
                    onClick={() => isLive && freeze.mutate(selected.id)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <Lock size={14} /> {freeze.isPending ? 'Congelando…' : 'Congelar'}
                  </button>
                )}
                <a
                  href={isLive ? `${API_BASE_URL}/datasets/${selected.id}/export` : undefined}
                  onClick={(e) => { if (!isLive) e.preventDefault(); }}
                  className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
                >
                  <Download size={14} /> Exportar
                </a>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
              <Metric label="Participantes" value={m.participantCount} />
              <Metric label="Sessões" value={m.sessionCount} />
              <Metric label="Estudos" value={m.sourceStudies.length} />
              <Metric label="Modalidades" value={m.modalities.length} />
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <ManifestBlock title="Origem & escopo">
              <Field label="Estudos" value={m.sourceStudies.join(', ')} />
              <Field label="Condições" value={m.conditions.join(', ')} />
              <Field label="Modalidades" value={m.modalities.join(', ')} />
              <Field label="Janelas temporais" value={m.temporalWindows?.join('; ')} />
            </ManifestBlock>

            <ManifestBlock title="Critérios">
              <Field label="Inclusão" value={m.inclusionCriteria.join('; ')} />
              <Field label="Exclusão" value={m.exclusionCriteria.join('; ')} />
              <Field label="Qualidade mínima" value={m.minQuality} />
              <Field label="Dados ausentes" value={m.missingDataPolicy} />
            </ManifestBlock>

            <ManifestBlock title="Transformações & versões">
              <Field label="Transformações" value={m.transformations.join('; ')} />
              <Field label="Pipelines" value={m.pipelineVersions.join(', ')} />
              <Field label="Modelos" value={m.modelVersions.length ? m.modelVersions.join(', ') : '—'} />
            </ManifestBlock>

            <ManifestBlock title="Rastreabilidade">
              <Field label="Schema" value={m.schemaRef} mono />
              <Field label="Data dictionary" value={m.dataDictionaryRef} mono />
              <Field label="Lineage" value={m.lineageRef} mono />
              <Field label="Checksum" value={m.checksum} mono />
              <Field label="Responsável" value={m.owner} />
              <Field label="Gerado em" value={m.generatedAt.slice(0, 10)} />
            </ManifestBlock>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 mb-2">
              <FileJson size={15} className="text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-800">Manifesto de exportação</h3>
            </div>
            <p className="text-[12px] text-slate-500 mb-2">Toda exportação inclui versão do dataset, versões de pipelines e modelos, parâmetros, filtros, exclusões, schema, checksums, data e responsável.</p>
            <ScientificCaveat variant="privacy" compact />
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
      <p className="text-[11px] text-slate-400">{label}</p>
    </div>
  );
}

function ManifestBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">{title}</h3>
      <dl className="space-y-2">{children}</dl>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2 text-[12px]">
      <dt className="text-slate-400">{label}</dt>
      <dd className={mono ? 'text-slate-600 font-mono text-[11px] break-all' : 'text-slate-700'}>{value ?? '—'}</dd>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  Download,
  FileJson,
  FileText,
  FlaskConical,
  GitCompareArrows,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserRound,
  UsersRound,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ScientificCaveat } from '@/components/ui/ScientificCaveat';
import { useStudies } from '@/features/studies/useStudies';
import {
  downloadDynamicPdf,
  downloadStudyCsv,
  type ReportPreview,
  type ReportRequest,
  type ReportTemplateKey,
  useAssignParticipantGroup,
  useCreateStudyGroup,
  useGenerateReport,
  useReportJob,
  useReportPreview,
  useReportTemplates,
  useStudyGroups,
  useStudyParticipants,
  useStudyReports,
} from '@/features/reports/useReports';

const TEMPLATE_META: Record<
  ReportTemplateKey,
  { icon: typeof FlaskConical; tone: string }
> = {
  study_overview: {
    icon: FlaskConical,
    tone: 'border-blue-400 bg-[var(--surface-muted)] text-blue-500',
  },
  individual_longitudinal: {
    icon: UserRound,
    tone: 'border-violet-400 bg-[var(--surface-muted)] text-violet-500',
  },
  control_group_comparison: {
    icon: GitCompareArrows,
    tone: 'border-emerald-400 bg-[var(--surface-muted)] text-emerald-500',
  },
};

const TAB_LABELS = [
  ['summary', 'Resumo'],
  ['methods', 'Métodos'],
  ['results', 'Resultados'],
  ['quality', 'Qualidade'],
  ['limitations', 'Limitações'],
] as const;

type PreviewTab = (typeof TAB_LABELS)[number][0];

export function ReportsPage() {
  const queryClient = useQueryClient();
  const { data: studies, isLoading: loadingStudies } = useStudies();
  const [selectedStudyId, setSelectedStudyId] = useState('');
  const [templateKey, setTemplateKey] =
    useState<ReportTemplateKey>('study_overview');
  const [participantId, setParticipantId] = useState('');
  const [controlGroupId, setControlGroupId] = useState('');
  const [comparisonGroupIds, setComparisonGroupIds] = useState<string[]>([]);
  const [outcomeIds, setOutcomeIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<PreviewTab>('summary');
  const [jobId, setJobId] = useState('');
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [legacyDownload, setLegacyDownload] = useState<'pdf' | 'csv' | null>(
    null,
  );

  const templates = useReportTemplates(selectedStudyId);
  const groups = useStudyGroups(selectedStudyId);
  const participants = useStudyParticipants(selectedStudyId);
  const reports = useStudyReports(selectedStudyId);
  const preview = useReportPreview(selectedStudyId);
  const generate = useGenerateReport(selectedStudyId);
  const job = useReportJob(jobId);

  const selectedTemplate = templates.data?.find(
    (item) => item.key === templateKey,
  );
  const acceptedParticipants = useMemo(
    () =>
      (participants.data ?? []).filter(
        (item) => item.consent_status === 'accepted' && item.is_active,
      ),
    [participants.data],
  );

  useEffect(() => {
    const control = groups.data?.find((item) => item.role === 'control');
    if (control && !controlGroupId) setControlGroupId(control.id);
  }, [controlGroupId, groups.data]);

  useEffect(() => {
    if (job.data?.status === 'succeeded') {
      queryClient.invalidateQueries({ queryKey: ['reports', selectedStudyId] });
    }
  }, [job.data?.status, queryClient, selectedStudyId]);

  const buildRequest = (): ReportRequest => ({
    template_key: templateKey,
    participant_id:
      templateKey === 'individual_longitudinal'
        ? participantId || undefined
        : undefined,
    control_group_id:
      templateKey === 'control_group_comparison'
        ? controlGroupId || undefined
        : undefined,
    comparison_group_ids:
      templateKey === 'control_group_comparison'
        ? comparisonGroupIds
        : undefined,
    outcome_ids: outcomeIds,
    confidence_level: 0.95,
    alpha: 0.05,
    multiplicity: 'fdr_bh',
  });

  const canAnalyze =
    Boolean(selectedStudyId && selectedTemplate?.eligible) &&
    (templateKey !== 'individual_longitudinal' || Boolean(participantId)) &&
    (templateKey !== 'control_group_comparison' ||
      Boolean(controlGroupId && comparisonGroupIds.length));

  const handlePreview = () => {
    if (!canAnalyze) return;
    preview.mutate(buildRequest(), {
      onSuccess: (data) => {
        if (outcomeIds.length === 0) {
          setOutcomeIds(
            data.outcomes
              .filter((item) => item.available)
              .map((item) => item.id),
          );
        }
        setActiveTab('summary');
      },
    });
  };

  const handleGenerate = () => {
    if (!canAnalyze) return;
    generate.mutate(buildRequest(), {
      onSuccess: (data) => setJobId(data.job_id),
    });
  };

  const handleLegacyDownload = async (type: 'pdf' | 'csv') => {
    if (!selectedStudyId) return;
    setLegacyDownload(type);
    setDownloadError(null);
    try {
      if (type === 'pdf') await downloadDynamicPdf(selectedStudyId);
      else await downloadStudyCsv(selectedStudyId);
    } catch (error) {
      setDownloadError(
        error instanceof Error
          ? error.message
          : 'Não foi possível gerar o arquivo.',
      );
    } finally {
      setLegacyDownload(null);
    }
  };

  return (
    <div className="min-h-full">
      <PageHeader
        title="Relatórios científicos"
        description="Análises reprodutíveis por estudo, participante e grupo controle, com PDF, JSON e proveniência."
        actions={
          <>
            <button
              onClick={() => handleLegacyDownload('csv')}
              disabled={!selectedStudyId || legacyDownload !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-50"
            >
              <Download size={14} />
              {legacyDownload === 'csv' ? 'Exportando...' : 'CSV bruto'}
            </button>
            <button
              onClick={() => handleLegacyDownload('pdf')}
              disabled={!selectedStudyId || legacyDownload !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-50"
            >
              <FileText size={14} />
              PDF legado
            </button>
          </>
        }
      />

      <div className="space-y-6 p-6">
        {downloadError && <ErrorBanner message={downloadError} />}

        <section className="card p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-[260px] flex-1">
              <label
                htmlFor="report-study"
                className="mb-2 block text-sm font-semibold text-[var(--text-secondary)]"
              >
                Estudo
              </label>
              <select
                id="report-study"
                value={selectedStudyId}
                onChange={(event) => {
                  setSelectedStudyId(event.target.value);
                  setTemplateKey('study_overview');
                  setParticipantId('');
                  setControlGroupId('');
                  setComparisonGroupIds([]);
                  setOutcomeIds([]);
                  preview.reset();
                  setJobId('');
                }}
                className="w-full max-w-xl rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">
                  {loadingStudies
                    ? 'Carregando estudos...'
                    : 'Selecione um estudo'}
                </option>
                {studies?.map((study) => (
                  <option key={study.id} value={study.id}>
                    {study.name}
                  </option>
                ))}
              </select>
            </div>
            {selectedStudyId && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
                <ShieldCheck size={15} />
                Somente consentimentos aceitos entram no snapshot
              </div>
            )}
          </div>
        </section>

        {!selectedStudyId ? (
          <EmptyState
            variant="empty"
            title="Selecione um estudo"
            description="Os modelos e a elegibilidade serão calculados a partir dos dados persistidos."
            icon={<BarChart3 size={40} className="text-text-disabled" />}
          />
        ) : (
          <>
            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-[var(--text-primary)]">
                    1. Escolha o modelo
                  </h2>
                  <p className="text-sm text-[var(--text-muted)]">
                    Cada modelo aplica regras científicas próprias ao escopo.
                  </p>
                </div>
                {templates.isLoading && (
                  <Loader2 className="animate-spin text-blue-600" size={20} />
                )}
              </div>
              <div className="grid gap-3 lg:grid-cols-3">
                {templates.data?.map((template) => {
                  const meta = TEMPLATE_META[template.key];
                  const Icon = meta.icon;
                  const selected = templateKey === template.key;
                  return (
                    <button
                      key={template.key}
                      type="button"
                      onClick={() => {
                        setTemplateKey(template.key);
                        setOutcomeIds([]);
                        preview.reset();
                      }}
                      className={`rounded-xl border p-4 text-left transition ${
                        selected
                          ? `${meta.tone} ring-2 ring-blue-500/20`
                          : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="rounded-lg bg-[var(--surface)] p-2 shadow-sm">
                          <Icon size={19} />
                        </span>
                        {template.eligible ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                            <CheckCircle2 size={13} /> Elegível
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
                            <AlertTriangle size={13} /> Requer configuração
                          </span>
                        )}
                      </div>
                      <h3 className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
                        {template.title}
                      </h3>
                      <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                        {template.description}
                      </p>
                      {template.missing_requirements.length > 0 && (
                        <ul className="mt-3 space-y-1 text-[11px] text-amber-800">
                          {template.missing_requirements.map((item) => (
                            <li key={item}>- {item}</li>
                          ))}
                        </ul>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            <ReportConfiguration
              templateKey={templateKey}
              participants={acceptedParticipants}
              groups={groups.data ?? []}
              participantId={participantId}
              setParticipantId={setParticipantId}
              controlGroupId={controlGroupId}
              setControlGroupId={setControlGroupId}
              comparisonGroupIds={comparisonGroupIds}
              setComparisonGroupIds={setComparisonGroupIds}
              preview={preview.data}
              outcomeIds={outcomeIds}
              setOutcomeIds={setOutcomeIds}
              canAnalyze={canAnalyze}
              previewPending={preview.isPending}
              generatePending={generate.isPending}
              onPreview={handlePreview}
              onGenerate={handleGenerate}
            />

            <GroupManager
              studyId={selectedStudyId}
              groups={groups.data ?? []}
              participants={participants.data ?? []}
            />

            {(preview.error || generate.error) && (
              <ErrorBanner
                message={(preview.error ?? generate.error)?.message ?? 'Falha'}
              />
            )}

            {jobId && (
              <JobProgress
                status={job.data?.status ?? 'queued'}
                progress={job.data?.progress ?? 0}
                step={job.data?.step ?? 'Aguardando na fila'}
                error={job.data?.error}
              />
            )}

            {preview.data && (
              <PreviewPanel
                preview={preview.data}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
              />
            )}

            <ReportHistory
              loading={reports.isLoading}
              reports={reports.data ?? []}
            />
          </>
        )}
      </div>
    </div>
  );
}

function ReportConfiguration({
  templateKey,
  participants,
  groups,
  participantId,
  setParticipantId,
  controlGroupId,
  setControlGroupId,
  comparisonGroupIds,
  setComparisonGroupIds,
  preview,
  outcomeIds,
  setOutcomeIds,
  canAnalyze,
  previewPending,
  generatePending,
  onPreview,
  onGenerate,
}: {
  templateKey: ReportTemplateKey;
  participants: Array<{
    id: string;
    external_code: string;
    group_id?: string;
  }>;
  groups: Array<{
    id: string;
    name: string;
    role: string;
    participant_count: number;
  }>;
  participantId: string;
  setParticipantId: (value: string) => void;
  controlGroupId: string;
  setControlGroupId: (value: string) => void;
  comparisonGroupIds: string[];
  setComparisonGroupIds: (value: string[]) => void;
  preview?: ReportPreview;
  outcomeIds: string[];
  setOutcomeIds: (value: string[]) => void;
  canAnalyze: boolean;
  previewPending: boolean;
  generatePending: boolean;
  onPreview: () => void;
  onGenerate: () => void;
}) {
  return (
    <section className="card p-5">
      <div>
        <h2 className="text-base font-semibold text-[var(--text-primary)]">
          2. Configure a análise
        </h2>
        <p className="text-sm text-[var(--text-muted)]">
          O sistema recomenda o método e mantém as escolhas no JSON reprodutível.
        </p>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {templateKey === 'individual_longitudinal' && (
          <Field label="Participante">
            <select
              value={participantId}
              onChange={(event) => setParticipantId(event.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
            >
              <option value="">Selecione o código pseudonimizado</option>
              {participants.map((participant) => (
                <option key={participant.id} value={participant.id}>
                  {participant.external_code}
                </option>
              ))}
            </select>
          </Field>
        )}

        {templateKey === 'control_group_comparison' && (
          <>
            <Field label="Grupo controle">
              <select
                value={controlGroupId}
                onChange={(event) => setControlGroupId(event.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
              >
                <option value="">Selecione o controle</option>
                {groups
                  .filter((group) => group.role === 'control')
                  .map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name} ({group.participant_count})
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Grupos de comparação">
              <div className="space-y-2 rounded-lg border border-[var(--border)] p-3">
                {groups
                  .filter((group) => group.id !== controlGroupId)
                  .map((group) => (
                    <label
                      key={group.id}
                      className="flex items-center gap-2 text-sm text-[var(--text-secondary)]"
                    >
                      <input
                        type="checkbox"
                        checked={comparisonGroupIds.includes(group.id)}
                        onChange={(event) =>
                          setComparisonGroupIds(
                            event.target.checked
                              ? [...comparisonGroupIds, group.id]
                              : comparisonGroupIds.filter(
                                  (item) => item !== group.id,
                                ),
                          )
                        }
                      />
                      {group.name} ({group.participant_count})
                    </label>
                  ))}
                {groups.filter((group) => group.id !== controlGroupId).length ===
                  0 && (
                  <p className="text-xs text-amber-700">
                    Crie e atribua ao menos um grupo de comparação.
                  </p>
                )}
              </div>
            </Field>
          </>
        )}
      </div>

      {preview && (
        <div className="mt-4">
          <p className="mb-2 text-sm font-semibold text-[var(--text-secondary)]">
            Desfechos incluídos
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {preview.outcome_catalog
              .filter((item) =>
                preview.outcomes.some(
                  (outcome) => outcome.id === item.id && outcome.available,
                ),
              )
              .map((outcome) => (
                <label
                  key={outcome.id}
                  className="flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-3"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={outcomeIds.includes(outcome.id)}
                    onChange={(event) =>
                      setOutcomeIds(
                        event.target.checked
                          ? [...outcomeIds, outcome.id]
                          : outcomeIds.filter((item) => item !== outcome.id),
                      )
                    }
                  />
                  <span>
                    <span className="block text-xs font-semibold text-[var(--text-primary)]">
                      {outcome.label}
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)]">
                      {outcome.role ?? 'exploratório'} ·{' '}
                      {outcome.unit ?? 'sem unidade'}
                    </span>
                  </span>
                </label>
              ))}
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onPreview}
          disabled={!canAnalyze || previewPending}
          className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 disabled:opacity-50"
        >
          {previewPending ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <RefreshCw size={15} />
          )}
          Atualizar prévia
        </button>
        <button
          type="button"
          onClick={onGenerate}
          disabled={!canAnalyze || generatePending}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
        >
          {generatePending ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <FileText size={15} />
          )}
          Gerar PDF + JSON
        </button>
      </div>
    </section>
  );
}

function PreviewPanel({
  preview,
  activeTab,
  setActiveTab,
}: {
  preview: ReportPreview;
  activeTab: PreviewTab;
  setActiveTab: (tab: PreviewTab) => void;
}) {
  return (
    <section className="card overflow-hidden">
      <div className="border-b border-[var(--border)] px-5 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">
              Prévia científica
            </p>
            <h2 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
              {preview.study.name}
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              {preview.study.reporting_framework} ·{' '}
              {preview.methodology_version}
            </p>
          </div>
          <span className="rounded-md bg-[var(--surface-muted)] px-2 py-1 font-mono text-[10px] text-[var(--text-muted)]">
            {preview.data_snapshot_hash.slice(0, 16)}
          </span>
        </div>
        <div className="mt-5 flex gap-1 overflow-x-auto">
          {TAB_LABELS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`border-b-2 px-3 py-2 text-xs font-semibold transition ${
                activeTab === key
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="p-5">
        {activeTab === 'summary' && <SummaryTab preview={preview} />}
        {activeTab === 'methods' && <MethodsTab preview={preview} />}
        {activeTab === 'results' && <ResultsTab preview={preview} />}
        {activeTab === 'quality' && <QualityTab preview={preview} />}
        {activeTab === 'limitations' && (
          <LimitationsTab preview={preview} />
        )}
      </div>
    </section>
  );
}

function SummaryTab({ preview }: { preview: ReportPreview }) {
  const chartData = preview.outcomes
    .filter((item) => item.available && item.mean !== undefined)
    .map((item) => ({
      name: item.label,
      média: item.mean,
      mediana: item.median,
    }));
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Participantes incluídos"
          value={preview.flow.participants_included}
          icon={UsersRound}
        />
        <Metric
          label="Sessões incluídas"
          value={preview.flow.sessions_included}
          icon={Activity}
        />
        <Metric
          label="Desfechos disponíveis"
          value={preview.summary.outcomes_available}
          icon={BarChart3}
        />
        <Metric
          label="Excluídos por consentimento"
          value={preview.flow.participants_excluded_consent}
          icon={ShieldCheck}
        />
      </div>
      {chartData.length > 0 && (
        <div className="h-72 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart data={chartData} margin={{ left: 12, right: 12 }}>
              <CartesianGrid
                stroke="var(--border)"
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                interval={0}
              />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
              <Tooltip
                contentStyle={{
                  background: 'var(--surface)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
              <Legend />
              <Bar dataKey="média" fill="#2563EB" radius={[4, 4, 0, 0]} />
              <Bar dataKey="mediana" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <ScientificCaveat variant="association" compact />
    </div>
  );
}

function MethodsTab({ preview }: { preview: ReportPreview }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {Object.entries(preview.methods).map(([key, value]) => (
        <div key={key} className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            {key.replaceAll('_', ' ')}
          </p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {typeof value === 'object'
              ? JSON.stringify(value)
              : String(value)}
          </p>
        </div>
      ))}
    </div>
  );
}

function ResultsTab({ preview }: { preview: ReportPreview }) {
  const firstOutcome = preview.outcomes.find((item) => item.available);
  if (preview.template_key === 'individual_longitudinal' && firstOutcome) {
    return (
      <div className="space-y-4">
        <div className="h-72 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <LineChart data={preview.series}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis
                dataKey="session_index"
                tick={{ fill: 'var(--text-muted)' }}
              />
              <YAxis tick={{ fill: 'var(--text-muted)' }} />
              <Tooltip
                contentStyle={{
                  background: 'var(--surface)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
              <Line
                type="monotone"
                dataKey={firstOutcome.id}
                name={firstOutcome.label}
                stroke="#2563EB"
                strokeWidth={2}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          Trajetória observada por sessão. Nenhum teste populacional é aplicado
          ao participante isolado.
        </p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
      <table className="w-full text-left text-xs">
        <thead className="bg-[var(--surface-muted)] text-[var(--text-muted)]">
          <tr>
            <th scope="col" className="px-3 py-2">Desfecho</th>
            <th scope="col" className="px-3 py-2">n participantes</th>
            <th scope="col" className="px-3 py-2">Média (DP)</th>
            <th scope="col" className="px-3 py-2">Mediana [Q1; Q3]</th>
            <th scope="col" className="px-3 py-2">IC da média</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)] text-[var(--text-secondary)]">
          {preview.outcomes.map((outcome) => (
            <tr key={outcome.id}>
              <td className="px-3 py-3 font-semibold text-[var(--text-primary)]">
                {outcome.label}
              </td>
              <td className="px-3 py-3">{outcome.n_participants ?? '-'}</td>
              <td className="px-3 py-3">
                {formatNumber(outcome.mean)} ({formatNumber(outcome.sd)})
              </td>
              <td className="px-3 py-3">
                {formatNumber(outcome.median)} [{formatNumber(outcome.q1)};{' '}
                {formatNumber(outcome.q3)}]
              </td>
              <td className="px-3 py-3">
                {outcome.mean_ci
                  ? `[${formatNumber(outcome.mean_ci[0])}; ${formatNumber(
                      outcome.mean_ci[1],
                    )}]`
                  : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {preview.analyses.length > 0 && (
        <div className="border-t border-[var(--border)] p-4">
          <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
            Estimativas inferenciais
          </h3>
          <div className="space-y-2">
            {preview.analyses.map((analysis, index) => (
              <div
                key={`${analysis.outcome_id}-${index}`}
                className="rounded-lg bg-[var(--surface-muted)] p-3 text-xs text-[var(--text-secondary)]"
              >
                <p className="font-semibold text-[var(--text-primary)]">
                  {analysis.outcome}
                </p>
                <p className="mt-1">{analysis.method}</p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  <span>
                    Estimativa {formatNumber(analysis.estimate)}
                    {analysis.confidence_interval
                      ? ` · IC95% [${formatNumber(
                          analysis.confidence_interval[0],
                        )}; ${formatNumber(
                          analysis.confidence_interval[1],
                        )}]`
                      : ''}
                  </span>
                  {analysis.effect_size && (
                    <span>
                      {analysis.effect_size.name}{' '}
                      {formatNumber(analysis.effect_size.value)}
                    </span>
                  )}
                  <span>
                    n {analysis.n_control ?? analysis.n_participants ?? '-'} /{' '}
                    {analysis.n_comparison ?? analysis.n_observations ?? '-'}
                  </span>
                  <span>p {formatP(analysis.p_value)}</span>
                  <span>
                    p ajustado {formatP(analysis.p_value_adjusted)}
                  </span>
                </div>
                {analysis.diagnostics?.map((diagnostic) => (
                  <p key={diagnostic} className="mt-2 text-amber-600">
                    {diagnostic}
                  </p>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function QualityTab({ preview }: { preview: ReportPreview }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Metric
        label="Observações com qualidade de vídeo"
        value={preview.quality.video_observations}
        icon={Activity}
      />
      <Metric
        label="Observações com qualidade de EEG"
        value={preview.quality.eeg_observations}
        icon={Activity}
      />
    </div>
  );
}

function LimitationsTab({ preview }: { preview: ReportPreview }) {
  return (
    <div className="space-y-2">
      {preview.limitations.map((item) => (
        <div
          key={item}
          className="flex gap-2 rounded-lg border border-amber-400/50 bg-amber-500/10 p-3 text-sm text-amber-600"
        >
          <AlertTriangle className="mt-0.5 shrink-0" size={16} />
          {item}
        </div>
      ))}
    </div>
  );
}

function GroupManager({
  studyId,
  groups,
  participants,
}: {
  studyId: string;
  groups: Array<{
    id: string;
    code: string;
    name: string;
    role: 'control' | 'intervention' | 'comparison' | 'other';
    participant_count: number;
  }>;
  participants: Array<{
    id: string;
    external_code: string;
    group_id?: string;
  }>;
}) {
  const create = useCreateStudyGroup(studyId);
  const assign = useAssignParticipantGroup(studyId);
  const [name, setName] = useState('');
  const [role, setRole] =
    useState<'control' | 'intervention' | 'comparison' | 'other'>('other');
  return (
    <details className="card group">
      <summary className="flex cursor-pointer list-none items-center justify-between p-5">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            Grupos estruturados
          </h2>
          <p className="text-xs text-[var(--text-muted)]">
            Um único controle por estudo; participantes sem grupo não entram em
            comparações.
          </p>
        </div>
        <Plus size={18} className="text-text-muted" />
      </summary>
      <div className="border-t border-[var(--border)] p-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto]">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nome do grupo"
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
          />
          <select
            value={role}
            onChange={(event) =>
              setRole(event.target.value as typeof role)
            }
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
          >
            <option value="control">Controle</option>
            <option value="intervention">Intervenção</option>
            <option value="comparison">Comparação</option>
            <option value="other">Outro</option>
          </select>
          <button
            disabled={!name.trim() || create.isPending}
            onClick={() =>
              create.mutate(
                {
                  name: name.trim(),
                  code: name.trim().toLowerCase().replaceAll(/\s+/g, '_'),
                  role,
                },
                { onSuccess: () => setName('') },
              )
            }
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Criar grupo
          </button>
        </div>
        {(create.error || assign.error) && (
          <p className="mt-2 text-xs text-red-600">
            {(create.error ?? assign.error)?.message}
          </p>
        )}
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {participants.map((participant) => (
            <label
              key={participant.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-3"
            >
              <span className="font-mono text-xs font-semibold text-[var(--text-secondary)]">
                {participant.external_code}
              </span>
              <select
                value={participant.group_id ?? ''}
                onChange={(event) => {
                  if (event.target.value) {
                    assign.mutate({
                      participantId: participant.id,
                      groupId: event.target.value,
                    });
                  }
                }}
                className="max-w-[220px] rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)]"
              >
                <option value="">Sem grupo</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name} · {group.role}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </div>
    </details>
  );
}

function JobProgress({
  status,
  progress,
  step,
  error,
}: {
  status: string;
  progress: number;
  step: string;
  error?: string;
}) {
  const failed = status === 'failed';
  return (
    <section
      className={`rounded-xl border p-4 ${
        failed
          ? 'border-red-200 bg-red-50'
          : 'border-blue-200 bg-blue-50'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {status === 'succeeded' ? (
            <CheckCircle2 className="text-emerald-600" size={18} />
          ) : failed ? (
            <AlertTriangle className="text-red-600" size={18} />
          ) : (
            <Loader2 className="animate-spin text-blue-600" size={18} />
          )}
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">{step}</p>
            <p className="text-xs text-[var(--text-secondary)]">
              {status === 'succeeded'
                ? 'PDF e JSON adicionados ao histórico.'
                : `${Math.round(progress)}% concluído`}
            </p>
          </div>
        </div>
        <Clock3 size={17} className="text-text-muted" />
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--surface)]">
        <div
          className={`h-full transition-all ${
            failed ? 'bg-red-500' : 'bg-blue-600'
          }`}
          style={{ width: `${Math.max(3, progress)}%` }}
        />
      </div>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </section>
  );
}

function ReportHistory({
  loading,
  reports,
}: {
  loading: boolean;
  reports: Array<{
    id: string;
    template_key: ReportTemplateKey;
    scope_type: string;
    methodology_version: string;
    generated_at: string;
    artifact_urls: { pdf?: string; json?: string };
  }>;
}) {
  if (loading) {
    return (
      <div className="flex justify-center p-10">
        <Loader2 className="animate-spin text-blue-600" />
      </div>
    );
  }
  return (
    <section className="card overflow-hidden">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          Histórico reprodutível
        </h2>
        <p className="text-xs text-[var(--text-muted)]">
          {reports.length} relatório(s) persistido(s)
        </p>
      </div>
      {reports.length === 0 ? (
        <div className="p-8 text-center text-sm text-[var(--text-muted)]">
          Nenhum relatório científico gerado para este estudo.
        </div>
      ) : (
        <div className="divide-y divide-[var(--border)]">
          {reports.map((report) => (
            <div
              key={report.id}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
            >
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {report.template_key.replaceAll('_', ' ')}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  {new Date(report.generated_at).toLocaleString('pt-BR')} ·{' '}
                  {report.methodology_version}
                </p>
              </div>
              <div className="flex gap-2">
                {report.artifact_urls.pdf && (
                  <a
                    href={report.artifact_urls.pdf}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold text-blue-500"
                  >
                    <FileText size={13} /> PDF
                  </a>
                )}
                {report.artifact_urls.json && (
                  <a
                    href={report.artifact_urls.json}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold text-violet-500"
                  >
                    <FileJson size={13} /> JSON
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Activity;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-[var(--text-muted)]">{label}</p>
        <Icon size={15} className="text-blue-600" />
      </div>
      <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1.5">
      <span className="block text-xs font-semibold text-[var(--text-secondary)]">{label}</span>
      {children}
    </label>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      {message}
    </div>
  );
}

function formatNumber(value?: number | null) {
  return value === undefined || value === null
    ? '-'
    : value.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

function formatP(value?: number | null) {
  if (value === undefined || value === null) return '-';
  return value < 0.001 ? '<0,001' : value.toFixed(3).replace('.', ',');
}

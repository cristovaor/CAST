import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Layers,
  Sigma,
  Video,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { ScientificCaveat } from '@/components/ui/ScientificCaveat';
import { ProvenanceLegend } from '@/components/data-display/ProvenanceLegend';
import { ErrorState } from '@/components/feedback/ErrorState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { useSessions, type SessionListItem } from '@/features/sessions/useSessions';
import { useStudies } from '@/features/studies/useStudies';
import { useEEGAnalysisRuns } from '@/features/eeg/useEEG';
import { EEGAnalysisWorkspace } from '@/features/eeg/components/EEGAnalysisWorkspace';

type AnalysisRequirement = 'session' | 'video' | 'eeg' | 'multimodal';

const CATEGORIES = [
  {
    key: 'temporal',
    icon: Clock,
    title: 'Temporal',
    requirement: 'session' as AnalysisRequirement,
    items: ['Eventos por intervalo', 'Latência', 'Janelas pré/pós-evento', 'Séries alinhadas por evento'],
  },
  {
    key: 'video',
    icon: Video,
    title: 'Vídeo',
    requirement: 'video' as AnalysisRequirement,
    items: ['Landmarks', 'Unidades de ação', 'Pose da cabeça', 'Frequência de piscadas'],
  },
  {
    key: 'eeg',
    icon: Activity,
    title: 'EEG',
    requirement: 'eeg' as AnalysisRequirement,
    items: ['Potência espectral', 'Bandas de frequência', 'ERP', 'Conectividade / coerência'],
  },
  {
    key: 'multimodal',
    icon: Layers,
    title: 'Multimodal',
    requirement: 'multimodal' as AnalysisRequirement,
    items: ['Coocorrência temporal', 'Correlação cruzada', 'Atraso entre sinais', 'Fusão de features'],
  },
  {
    key: 'statistics',
    icon: Sigma,
    title: 'Estatística',
    requirement: 'session' as AnalysisRequirement,
    items: ['Descritiva', 'Testes de hipótese', 'Modelos mistos', 'Tamanho de efeito'],
  },
];

export function AnalysisIndexPage() {
  const sessionsQuery = useSessions();
  const studiesQuery = useStudies();
  const sessions = useMemo(() => sessionsQuery.data ?? [], [sessionsQuery.data]);
  const studies = useMemo(() => studiesQuery.data ?? [], [studiesQuery.data]);
  const [studyId, setStudyId] = useState('');
  const [sessionId, setSessionId] = useState('');

  const studyNames = useMemo(
    () => new Map(studies.map((study) => [study.id, study.name])),
    [studies],
  );
  const availableSessions = useMemo(
    () => sessions.filter((session) => !studyId || session.study_id === studyId),
    [sessions, studyId],
  );
  const selectedSession = sessions.find((session) => session.id === sessionId);
  const eegRunsQuery = useEEGAnalysisRuns(selectedSession?.eeg_asset_id ?? undefined);
  const validEEGRun = eegRunsQuery.data?.find((run) => ['succeeded', 'partial'].includes(run.status));
  const isLoading = sessionsQuery.isLoading || studiesQuery.isLoading;
  const isError = sessionsQuery.isError || studiesQuery.isError;

  const handleStudyChange = (value: string) => {
    setStudyId(value);
    setSessionId('');
  };

  return (
    <div className="min-h-full bg-app-bg pb-12">
      <PageHeader
        title="Análises"
        description="Escolha um estudo e uma sessão para acessar apenas as análises compatíveis com os dados disponíveis."
        actions={selectedSession ? (
          <Link
            to={`/app/sessions/${selectedSession.id}/analysis`}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Abrir workspace
            <ArrowRight size={15} />
          </Link>
        ) : (
          <a
            href="#analysis-selection"
            className="inline-flex min-h-10 items-center rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-text-secondary hover:bg-surface-muted"
          >
            Escolher sessão
          </a>
        )}
      />

      <div className="space-y-6 px-4 pt-4 sm:px-6 sm:pt-6">
        {isLoading ? (
          <LoadingState variant="skeleton-cards" rows={3} />
        ) : isError ? (
          <ErrorState
            title="Não foi possível preparar o workspace"
            message="As sessões ou os estudos não puderam ser carregados."
            onRetry={() => {
              void sessionsQuery.refetch();
              void studiesQuery.refetch();
            }}
          />
        ) : (
          <>
            <section id="analysis-selection" className="card p-4 sm:p-5" aria-labelledby="analysis-selection-title">
              <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                <div>
                  <h2 id="analysis-selection-title" className="text-base font-semibold text-text-primary">
                    Preparar workspace
                  </h2>
                  <p className="mt-1 text-sm text-text-secondary">
                    A disponibilidade abaixo é calculada a partir das modalidades anexadas à sessão.
                  </p>
                </div>
                {selectedSession && <SessionReadiness session={selectedSession} hasEEGResult={!!validEEGRun} />}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm font-medium text-text-primary">
                  Estudo
                  <select
                    value={studyId}
                    onChange={(event) => handleStudyChange(event.target.value)}
                    className="mt-1.5 h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-text-primary"
                  >
                    <option value="">Selecione um estudo</option>
                    {studies.map((study) => (
                      <option key={study.id} value={study.id}>{study.name}</option>
                    ))}
                  </select>
                </label>

                <label className="text-sm font-medium text-text-primary">
                  Sessão
                  <select
                    value={sessionId}
                    disabled={!studyId}
                    onChange={(event) => setSessionId(event.target.value)}
                    className="mt-1.5 h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-text-primary disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-disabled"
                  >
                    <option value="">{studyId ? 'Selecione uma sessão' : 'Selecione primeiro o estudo'}</option>
                    {availableSessions.map((session) => (
                      <option key={session.id} value={session.id}>
                        {formatSessionOption(session)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {studyId && availableSessions.length === 0 && (
                <p className="mt-3 inline-flex items-center gap-2 rounded-lg border border-warning-border bg-warning-light px-3 py-2 text-sm text-amber-800">
                  <AlertTriangle size={15} />
                  Este estudo ainda não possui sessões disponíveis para análise.
                </p>
              )}

              {selectedSession && (
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-3 text-xs text-text-muted">
                  <span>Estudo: <strong className="font-medium text-text-secondary">{studyNames.get(selectedSession.study_id) ?? selectedSession.study_id.slice(0, 8)}</strong></span>
                  <span>Sessão: <strong className="font-medium text-text-secondary">S-{selectedSession.id.slice(0, 8)}</strong></span>
                  {selectedSession.condition && <span>Condição: <strong className="font-medium text-text-secondary">{selectedSession.condition}</strong></span>}
                </div>
              )}
            </section>

            {studyId && (
              <section aria-label="Análise EEG do estudo">
                <EEGAnalysisWorkspace studyId={studyId} />
              </section>
            )}

            <ScientificCaveat variant="association" />

            <section aria-labelledby="analysis-categories-title">
              <div className="mb-3">
                <h2 id="analysis-categories-title" className="text-base font-semibold text-text-primary">Análises disponíveis</h2>
                <p className="mt-1 text-sm text-text-secondary">
                  Recursos incompatíveis permanecem visíveis para explicar quais dados ainda são necessários.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {CATEGORIES.map((category) => {
                  const availability = getCategoryAvailability(category.requirement, selectedSession, !!validEEGRun);
                  const content = (
                    <>
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-muted text-text-secondary">
                            <category.icon size={16} />
                          </div>
                          <h3 className="text-sm font-semibold text-text-primary">Análise {category.title.toLowerCase()}</h3>
                        </div>
                        {availability.available ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                            <CheckCircle2 size={13} /> {availability.reason || 'Disponível'}
                          </span>
                        ) : (
                          <span className="text-right text-[11px] font-medium text-text-muted">{availability.reason}</span>
                        )}
                      </div>
                      <ul className="space-y-1.5">
                        {category.items.map((item) => (
                          <li key={item} className="flex items-center gap-2 text-[13px] text-text-secondary">
                            <span className="h-1 w-1 rounded-full bg-text-muted" />{item}
                          </li>
                        ))}
                      </ul>
                      {availability.available && (
                        <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600">
                          Configurar análise <ArrowRight size={13} />
                        </span>
                      )}
                    </>
                  );

                  return availability.available && selectedSession ? (
                    <Link
                      key={category.key}
                      to={`/app/sessions/${selectedSession.id}/analysis?category=${category.key}`}
                      className="rounded-xl border border-border bg-surface p-4 transition hover:border-blue-300 hover:shadow-card"
                    >
                      {content}
                    </Link>
                  ) : (
                    <div key={category.key} className="rounded-xl border border-border bg-surface p-4 opacity-75" aria-disabled="true">
                      {content}
                    </div>
                  );
                })}
              </div>
            </section>

            <div className="rounded-xl border border-border bg-surface p-4">
              <h2 className="mb-2 text-sm font-semibold text-text-primary">Como os dados são distinguidos</h2>
              <p className="mb-3 text-[12px] text-text-secondary">
                Todos os resultados diferenciam visualmente a natureza do dado — observado, detectado, derivado, estimado por modelo, excluído, ausente ou imputado.
              </p>
              <ProvenanceLegend className="[&_span]:text-text-secondary" />
            </div>

            <p className="text-[12px] text-text-muted">
              A interface não recomenda automaticamente um teste estatístico sem apresentar as premissas necessárias (normalidade, independência, homocedasticidade, correção para múltiplas comparações e análise de poder).
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function SessionReadiness({ session, hasEEGResult }: { session: SessionListItem; hasEEGResult: boolean }) {
  return (
    <div className="flex flex-wrap gap-2" aria-label="Modalidades disponíveis">
      <ReadinessChip label="Vídeo" ready={!!session.video_asset_id} />
      <ReadinessChip label={hasEEGResult ? 'EEG analisado' : 'EEG bruto'} ready={!!session.eeg_asset_id} />
    </div>
  );
}

function ReadinessChip({ label, ready }: { label: string; ready: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium ${
      ready
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : 'border-border bg-surface-muted text-text-muted'
    }`}>
      {ready ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
      {label} {ready ? 'disponível' : 'ausente'}
    </span>
  );
}

function getCategoryAvailability(
  requirement: AnalysisRequirement,
  session?: SessionListItem,
  hasEEGResult = false,
) {
  if (!session) return { available: false, reason: 'Selecione uma sessão' };
  if (requirement === 'video' && !session.video_asset_id) return { available: false, reason: 'Requer vídeo' };
  if (requirement === 'eeg' && !session.eeg_asset_id) return { available: false, reason: 'Requer EEG' };
  if (requirement === 'eeg' && !hasEEGResult) return { available: true, reason: 'Pronto para executar' };
  if (requirement === 'multimodal' && (!session.video_asset_id || !session.eeg_asset_id)) {
    return { available: false, reason: 'Requer vídeo + EEG' };
  }
  if (requirement === 'multimodal' && !hasEEGResult) {
    return { available: true, reason: 'Requer executar EEG' };
  }
  return { available: true, reason: '' };
}

function formatSessionOption(session: SessionListItem) {
  const date = new Date(session.created_at).toLocaleDateString('pt-BR');
  return `S-${session.id.slice(0, 8)} · ${session.condition || 'Sem condição'} · ${date}`;
}

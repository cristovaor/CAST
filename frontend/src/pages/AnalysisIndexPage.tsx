import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useLocale } from '@/i18n/useLocale';
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

// Titles and item lists come from `analysis:index.categories.<key>`.
const CATEGORIES = [
  { key: 'temporal', icon: Clock, requirement: 'session' as AnalysisRequirement },
  { key: 'video', icon: Video, requirement: 'video' as AnalysisRequirement },
  { key: 'eeg', icon: Activity, requirement: 'eeg' as AnalysisRequirement },
  { key: 'multimodal', icon: Layers, requirement: 'multimodal' as AnalysisRequirement },
  { key: 'statistics', icon: Sigma, requirement: 'session' as AnalysisRequirement },
] as const;

export function AnalysisIndexPage() {
  const { t } = useTranslation('analysis');
  const locale = useLocale();
  const sessionsQuery = useSessions();
  const studiesQuery = useStudies();
  const sessions = useMemo(() => sessionsQuery.data ?? [], [sessionsQuery.data]);
  const studies = useMemo(() => studiesQuery.data ?? [], [studiesQuery.data]);
  const [studyId, setStudyId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [showStudyAnalysis, setShowStudyAnalysis] = useState(false);
  const [showUnavailable, setShowUnavailable] = useState(false);

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
  const unavailableCount = CATEGORIES.filter((category) => !getCategoryAvailability(category.requirement, selectedSession, !!validEEGRun).available).length;
  const isLoading = sessionsQuery.isLoading || studiesQuery.isLoading;
  const isError = sessionsQuery.isError || studiesQuery.isError;

  const handleStudyChange = (value: string) => {
    setStudyId(value);
    setSessionId('');
    setShowStudyAnalysis(false);
    setShowUnavailable(false);
  };

  return (
    <div className="min-h-full bg-app-bg pb-12">
      <PageHeader
        title={t('index.title')}
        description={t('index.description')}
        actions={selectedSession ? (
          <Link
            to={`/app/sessions/${selectedSession.id}/explorer`}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
          >
            {t('index.openWorkspace')}
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        ) : (
          <a
            href="#analysis-selection"
            className="inline-flex min-h-10 items-center rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-text-secondary hover:bg-surface-muted"
          >
            {t('index.chooseSession')}
          </a>
        )}
      />

      <div className="space-y-6 px-4 pt-4 sm:px-6 sm:pt-6">
        {isLoading ? (
          <LoadingState variant="skeleton-cards" rows={3} />
        ) : isError ? (
          <ErrorState
            title={t('index.loadFailed')}
            message={t('index.loadFailedHint')}
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
                    {t('index.prepare')}
                  </h2>
                  <p className="mt-1 text-sm text-text-secondary">
                    {t('index.prepareHint')}
                  </p>
                </div>
                {selectedSession && <SessionReadiness session={selectedSession} hasEEGResult={!!validEEGRun} />}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm font-medium text-text-primary">
                  {t('index.study')}
                  <select
                    value={studyId}
                    onChange={(event) => handleStudyChange(event.target.value)}
                    className="mt-1.5 h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-text-primary"
                  >
                    <option value="">{t('index.selectStudy')}</option>
                    {studies.map((study) => (
                      <option key={study.id} value={study.id}>{study.name}</option>
                    ))}
                  </select>
                </label>

                <label className="text-sm font-medium text-text-primary">
                  {t('index.session')}
                  <select
                    value={sessionId}
                    disabled={!studyId}
                    onChange={(event) => setSessionId(event.target.value)}
                    className="mt-1.5 h-11 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-text-primary disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-disabled"
                  >
                    <option value="">{studyId ? t('index.selectSession') : t('index.selectStudyFirst')}</option>
                    {availableSessions.map((session) => (
                      <option key={session.id} value={session.id}>
                        {formatSessionOption(session, t, locale)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {studyId && availableSessions.length === 0 && (
                <p className="mt-3 inline-flex items-center gap-2 rounded-lg border border-warning-border bg-warning-light px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
                  <AlertTriangle size={15} aria-hidden="true" />
                  {t('index.noSessions')}
                </p>
              )}

              {selectedSession && (
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-3 text-xs text-text-muted">
                  <span>{t('index.studyLabel')} <strong className="font-medium text-text-secondary">{studyNames.get(selectedSession.study_id) ?? selectedSession.study_id.slice(0, 8)}</strong></span>
                  <span>{t('index.sessionLabel')} <strong className="font-medium text-text-secondary">S-{selectedSession.id.slice(0, 8)}</strong></span>
                  {selectedSession.condition && <span>{t('index.conditionLabel')} <strong className="font-medium text-text-secondary">{selectedSession.condition}</strong></span>}
                </div>
              )}
            </section>

            {studyId && (
              <section className="rounded-xl border border-border bg-surface p-4" aria-label={t('index.studyEeg')}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-text-primary">{t('index.studyEegTitle')}</h2>
                    <p className="mt-1 text-xs text-text-muted">{t('index.studyEegHint')}</p>
                  </div>
                  <button type="button" onClick={() => setShowStudyAnalysis((current) => !current)} aria-expanded={showStudyAnalysis} className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/40">
                    {showStudyAnalysis ? t('index.collapseStudy') : t('index.openStudy')}
                  </button>
                </div>
                {showStudyAnalysis && <div className="mt-4"><EEGAnalysisWorkspace studyId={studyId} /></div>}
              </section>
            )}

            <ScientificCaveat variant="association" />

            <section aria-labelledby="analysis-categories-title">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 id="analysis-categories-title" className="text-base font-semibold text-text-primary">{t('index.sessionAnalyses')}</h2>
                  <p className="mt-1 text-sm text-text-secondary">
                    {selectedSession ? t('index.chooseQuestion') : t('index.selectAbove')}
                  </p>
                </div>
                {selectedSession && unavailableCount > 0 && <button type="button" onClick={() => setShowUnavailable((current) => !current)} aria-expanded={showUnavailable} className="rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-text-secondary hover:bg-surface-muted">
                  {showUnavailable ? t('index.hidePending') : t('index.showPending', { count: unavailableCount })}
                </button>}
              </div>

              {selectedSession && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {CATEGORIES.filter((category) => showUnavailable || getCategoryAvailability(category.requirement, selectedSession, !!validEEGRun).available).map((category) => {
                  const availability = getCategoryAvailability(category.requirement, selectedSession, !!validEEGRun);
                  const items = t(`index.categories.${category.key}.items`, { returnObjects: true }) as unknown as string[];
                  const content = (
                    <>
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-muted text-text-secondary">
                            <category.icon size={16} aria-hidden="true" />
                          </div>
                          <h3 className="text-sm font-semibold text-text-primary">{t(`index.categories.${category.key}.title`)}</h3>
                        </div>
                        {availability.available ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 size={13} aria-hidden="true" /> {t(`index.availability.${availability.reason || 'available'}`)}
                          </span>
                        ) : (
                          <span className="text-right text-[11px] font-medium text-text-muted">{t(`index.availability.${availability.reason || 'available'}`)}</span>
                        )}
                      </div>
                      <ul className="space-y-1.5">
                        {items.map((item) => (
                          <li key={item} className="flex items-center gap-2 text-[13px] text-text-secondary">
                            <span className="h-1 w-1 rounded-full bg-text-muted" />{item}
                          </li>
                        ))}
                      </ul>
                      {availability.available && (
                        <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400">
                          {t('index.configure')} <ArrowRight size={13} aria-hidden="true" />
                        </span>
                      )}
                    </>
                  );

                  return availability.available && selectedSession ? (
                    <Link
                      key={category.key}
                      to={`/app/sessions/${selectedSession.id}/explorer?category=${category.key}`}
                      className="rounded-xl border border-border bg-surface p-4 transition hover:border-blue-300 hover:shadow-card dark:hover:border-blue-800"
                    >
                      {content}
                    </Link>
                  ) : (
                    <div key={category.key} className="rounded-xl border border-border bg-surface p-4 opacity-75" aria-disabled="true">
                      {content}
                    </div>
                  );
                })}
              </div>}
            </section>

            <div className="rounded-xl border border-border bg-surface p-4">
              <h2 className="mb-2 text-sm font-semibold text-text-primary">{t('index.provenanceTitle')}</h2>
              <p className="mb-3 text-[12px] text-text-secondary">
                {t('index.provenanceBody')}
              </p>
              <ProvenanceLegend className="[&_span]:text-text-secondary" />
            </div>

            <p className="text-[12px] text-text-muted">
              {t('index.statsNote')}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function SessionReadiness({ session, hasEEGResult }: { session: SessionListItem; hasEEGResult: boolean }) {
  const { t } = useTranslation('analysis');
  return (
    <div className="flex flex-wrap gap-2" aria-label={t('index.readiness')}>
      <ReadinessChip label={t('index.video')} ready={!!session.video_asset_id} />
      <ReadinessChip label={hasEEGResult ? t('index.eegAnalysed') : t('index.eegRaw')} ready={!!session.eeg_asset_id} />
    </div>
  );
}

function ReadinessChip({ label, ready }: { label: string; ready: boolean }) {
  const { t } = useTranslation('analysis');
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium ${
      ready
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
        : 'border-border bg-surface-muted text-text-muted'
    }`}>
      {ready ? <CheckCircle2 size={13} aria-hidden="true" /> : <AlertTriangle size={13} aria-hidden="true" />}
      {ready ? t('index.chipAvailable', { label }) : t('index.chipMissing', { label })}
    </span>
  );
}

function getCategoryAvailability(
  requirement: AnalysisRequirement,
  session?: SessionListItem,
  hasEEGResult = false,
) {
  // `reason` is a key of `analysis:index.availability`.
  if (!session) return { available: false, reason: 'selectSession' as const };
  if (requirement === 'video' && !session.video_asset_id) return { available: false, reason: 'needsVideo' as const };
  if (requirement === 'eeg' && !session.eeg_asset_id) return { available: false, reason: 'needsEeg' as const };
  if (requirement === 'eeg' && !hasEEGResult) return { available: true, reason: 'readyToRun' as const };
  if (requirement === 'multimodal' && (!session.video_asset_id || !session.eeg_asset_id)) {
    return { available: false, reason: 'needsBoth' as const };
  }
  if (requirement === 'multimodal' && !hasEEGResult) {
    return { available: true, reason: 'runEegFirst' as const };
  }
  return { available: true, reason: null };
}

function formatSessionOption(session: SessionListItem, t: TFunction<'analysis'>, locale: string) {
  const date = new Date(session.created_at).toLocaleDateString(locale);
  return `S-${session.id.slice(0, 8)} · ${session.condition || t('index.noCondition')} · ${date}`;
}

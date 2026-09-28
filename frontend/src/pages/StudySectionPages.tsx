import { useTranslation } from 'react-i18next';
import { useLocale } from '@/i18n/useLocale';
import { Link, useParams } from 'react-router-dom';
import { ScientificCaveat } from '@/components/ui/ScientificCaveat';
import { EXPERIMENTAL_DESIGNS, MODALITIES } from '@/types/research';
import { AlertTriangle, CheckCircle2, Database, LineChart, Video, Waypoints, Activity } from 'lucide-react';
import {
  useStudy,
  useStudyQualitySummary,
  type ModalityQualitySummary,
} from '@/features/studies/useStudies';
import { useSessions } from '@/features/sessions/useSessions';

// Study-scoped sections rendered inside StudyLayout's contextual nav (docs §6).
// Each surfaces the study's REAL persisted config (no hardcoded values), with a
// graceful hint when a field wasn't configured.

const designLabel = (value: string) =>
  EXPERIMENTAL_DESIGNS.find((d) => d.value === value)?.label ?? value;
const modalityLabel = (value: string) =>
  MODALITIES.find((m) => m.value === value)?.label ?? value;

function SectionShell({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
        {subtitle && <p className="text-sm text-text-muted">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function NotConfigured({ what }: { what: string }) {
  const { t } = useTranslation('studies');
  return (
    <div className="rounded-lg border border-dashed border-border-strong bg-app-bg p-4 text-[13px] text-text-muted">
      {t('sections.notConfigured', { what })}{' '}
      <Link to="/app/studies/new" className="text-blue-600 hover:text-blue-700 dark:text-blue-400">{t('sections.wizardLink')}</Link>.
    </div>
  );
}

export function StudyProtocolPage() {
  const { t } = useTranslation('studies');
  const { studyId } = useParams();
  const { data: study } = useStudy(studyId ?? '');
  const cfg = study?.config;

  return (
    <SectionShell title={t('sections.protocol.title')} subtitle={t('sections.protocol.subtitle')}>
      {cfg?.design || cfg?.modalities?.length ? (
        <div className="rounded-xl border border-border bg-surface p-4 space-y-2 text-[13px]">
          <Row k={t('sections.protocol.design')} v={cfg?.design ? designLabel(cfg.design) : '—'} />
          <Row k={t('sections.protocol.modalities')} v={(cfg?.modalities ?? []).map(modalityLabel).join(' + ') || '—'} />
          {cfg?.groups && <Row k={t('sections.protocol.groups')} v={cfg.groups} />}
          {cfg?.program && <Row k={t('sections.protocol.program')} v={cfg.program} />}
        </div>
      ) : (
        <NotConfigured what={t('sections.protocol.what')} />
      )}
    </SectionShell>
  );
}

export function StudyHypothesesPage() {
  const { t } = useTranslation('studies');
  const { studyId } = useParams();
  const { data: study } = useStudy(studyId ?? '');
  const hypotheses = study?.config?.hypotheses ?? [];

  return (
    <SectionShell title={t('sections.hypotheses.title')} subtitle={t('sections.hypotheses.subtitle')}>
      {hypotheses.length > 0 ? (
        <>
          <div className="space-y-2">
            {hypotheses.map((h) => (
              <div key={h.code} className="rounded-lg border border-border bg-surface p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs font-semibold text-blue-600">{h.code}</span>
                </div>
                <p className="text-[13px] text-text-secondary">{h.statement}</p>
              </div>
            ))}
          </div>
          <ScientificCaveat variant="association" compact />
        </>
      ) : (
        <NotConfigured what={t('sections.hypotheses.what')} />
      )}
    </SectionShell>
  );
}

export function StudyConditionsPage() {
  const { t } = useTranslation('studies');
  const { studyId } = useParams();
  const { data: study } = useStudy(studyId ?? '');
  const groups = study?.config?.groups;

  return (
    <SectionShell title={t('sections.conditions.title')} subtitle={t('sections.conditions.subtitle')}>
      {groups ? (
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-[13px] text-text-secondary whitespace-pre-line">{groups}</p>
        </div>
      ) : (
        <NotConfigured what={t('sections.conditions.what')} />
      )}
    </SectionShell>
  );
}

export function StudyQualityPage() {
  const { t } = useTranslation('studies');
  const { studyId } = useParams();
  const {
    data: quality,
    isLoading,
    isError,
  } = useStudyQualitySummary(studyId ?? '');

  return (
    <SectionShell title={t('sections.quality.title')} subtitle={t('sections.quality.subtitle')}>
      {isLoading && (
        <div className="flex justify-center py-10">
          <div
            className="h-7 w-7 animate-spin rounded-full border-4 border-border border-t-blue-600"
            role="status"
            aria-label={t('sections.quality.loading')}
          />
        </div>
      )}
      {isError && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {t('sections.quality.loadFailed')}
        </div>
      )}
      {quality && (
        <>
          <div className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-text-secondary">
            {t('sections.quality.linkedSessions', { count: quality.sessions_count })}
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <QualitySummaryCard
              title={t('sections.quality.video')}
              icon={Video}
              summary={quality.video}
              metricLabel={t('sections.quality.validFrames')}
              secondaryMetricLabel={t('sections.quality.faceDetection')}
            />
            <QualitySummaryCard
              title={t('sections.quality.eeg')}
              icon={Activity}
              summary={quality.eeg}
              metricLabel={t('sections.quality.validRecording')}
            />
          </div>
          {quality.video.total_assets === 0 && quality.eeg.total_assets === 0 && (
            <div className="rounded-lg border border-dashed border-border-strong bg-app-bg p-4 text-[13px] text-text-muted">
              {t('sections.quality.noAssets')}
            </div>
          )}
        </>
      )}
      <ScientificCaveat variant="quality" compact />
    </SectionShell>
  );
}

function QualitySummaryCard({
  title,
  icon: Icon,
  summary,
  metricLabel,
  secondaryMetricLabel,
}: {
  title: string;
  icon: typeof Video;
  summary: ModalityQualitySummary;
  metricLabel: string;
  secondaryMetricLabel?: string;
}) {
  const { t } = useTranslation('studies');
  const locale = useLocale();
  const approved = (summary.verdicts.approved ?? 0)
    + (summary.verdicts.approved_with_caveats ?? 0);
  const needsAttention = (summary.verdicts.review_required ?? 0)
    + (summary.verdicts.rejected ?? 0);

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-text-primary">
          <Icon size={16} className="text-text-muted" />
          {title}
        </p>
        <span className="text-[11px] text-text-muted">
          {t('sections.quality.assessed', { assessed: summary.assessed_assets, total: summary.total_assets })}
        </span>
      </div>
      <p className="mt-2 text-3xl font-bold tabular-nums text-text-primary">
        {formatQualityRatio(summary.average_valid_ratio, locale)}
      </p>
      <p className="text-[11px] text-text-muted">{t('sections.quality.averageHint', { metric: metricLabel })}</p>
      {secondaryMetricLabel && (
        <p className="mt-2 text-xs text-text-muted">
          {secondaryMetricLabel}: <span className="font-semibold text-text-secondary">{formatQualityRatio(summary.average_face_detection_rate, locale)}</span>
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-3 border-t border-border pt-3 text-[11px]">
        <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 size={13} aria-hidden="true" /> {t('sections.quality.approved', { count: approved })}
        </span>
        <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
          <AlertTriangle size={13} aria-hidden="true" /> {t('sections.quality.attention', { count: needsAttention })}
        </span>
        <span className="text-text-muted">{t('sections.quality.findings', { count: summary.findings_count })}</span>
      </div>
    </div>
  );
}

function formatQualityRatio(value: number | null, locale: string) {
  return value == null
    ? '—'
    : `${(value * 100).toLocaleString(locale, { maximumFractionDigits: 1 })}%`;
}

export function StudyDatasetsPage() {
  const { t } = useTranslation('studies');
  return (
    <SectionShell title={t('sections.datasets.title')} subtitle={t('sections.datasets.subtitle')}>
      <Link to="/app/datasets" className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-3 hover:border-blue-300">
        <Database size={16} className="text-text-muted" />
        <span className="text-sm font-medium text-text-secondary">{t('sections.datasets.open')}</span>
      </Link>
    </SectionShell>
  );
}

export function StudyAnalysisPage() {
  const { t } = useTranslation('studies');
  const { studyId } = useParams();
  const { data: sessions = [], isLoading } = useSessions(studyId);
  const firstSession = sessions[0];

  return (
    <SectionShell title={t('sections.analysis.title')} subtitle={t('sections.analysis.subtitle')}>
      <div className="flex flex-wrap gap-3">
        <Link
          to={firstSession ? `/app/sessions/${firstSession.id}/explorer` : `/app/studies/${studyId}/sessions`}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-3 hover:border-blue-300"
        >
          <LineChart size={16} className="text-text-muted" />
          <span className="text-sm font-medium text-text-primary">
            {isLoading ? t('sections.analysis.loadingSessions') : firstSession ? t('sections.analysis.workspace') : t('sections.analysis.addSession')}
          </span>
        </Link>
        <Link to={`/app/studies/${studyId}/sync`} className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-3 hover:border-blue-300">
          <Waypoints size={16} className="text-text-muted" /><span className="text-sm font-medium text-text-primary">{t('sections.analysis.sync')}</span>
        </Link>
      </div>
    </SectionShell>
  );
}

export function StudySettingsPage() {
  const { t } = useTranslation('studies');
  return (
    <SectionShell title={t('sections.settings.title')} subtitle={t('sections.settings.subtitle')}>
      <ScientificCaveat variant="privacy" />
    </SectionShell>
  );
}

function Row({ k, v }: { k: string; v?: string }) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-2">
      <span className="text-text-muted">{k}</span>
      <span className="text-text-secondary font-medium">{v ?? '—'}</span>
    </div>
  );
}

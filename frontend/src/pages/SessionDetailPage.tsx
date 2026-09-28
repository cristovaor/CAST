import { useTranslation } from 'react-i18next';
import { useLocale } from '@/i18n/useLocale';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Video, Activity, Flag, ClipboardList, Waypoints, Cpu, PenLine,
  ArrowLeft, ArrowRight, Clock, User, FlaskConical, ShieldCheck, Trash2,
} from 'lucide-react';
import { DeleteEntityDialog } from '@/features/deletion/DeleteEntityDialog';
import { useMe } from '@/features/auth/useAuth';
import { PageHeader } from '@/components/layout/PageHeader';
import { ToneBadge } from '@/components/ui/ToneBadge';
import { ScientificCaveat } from '@/components/ui/ScientificCaveat';
import {
  SESSION_STATE_META, QUALITY_VERDICT_META, SYNC_STATE_META,
  type SessionState, type SyncState, type QualityVerdict,
} from '@/types/research';
import { useSessionDetail, useEEGAsset, useSync } from '@/features/multimodal/useMultimodal';
import { useVideoQualityReport } from '@/features/videos/useVideos';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';

// The session is the hub that gathers every modality from one experimental
// period (docs §8). Modalities are complementary and never all required.
// Every card below reads real backend data when a live session exists —
// mock values are only shown when there is no session id to resolve at all.

function ModalityCard({
  icon: Icon, title, present, children, to, tone,
}: {
  icon: typeof Video; title: string; present: boolean;
  children: React.ReactNode; to?: string; tone?: React.ReactNode;
}) {
  const { t } = useTranslation('sessions');
  const body = (
    <div className={`rounded-xl border bg-surface p-4 transition-colors ${present ? 'border-border hover:border-blue-300 dark:hover:border-blue-800' : 'border-dashed border-border'}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${present ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300' : 'bg-surface-muted text-text-muted'}`}>
            <Icon size={16} aria-hidden="true" />
          </div>
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        </div>
        {tone}
      </div>
      <div className="text-[12px] text-text-muted leading-relaxed">{children}</div>
      {!present && <p className="mt-2 text-[11px] text-text-muted italic">{t('detail.optionalModality')}</p>}
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

export function SessionDetailPage() {
  const { t } = useTranslation('sessions');
  const locale = useLocale();
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const role = useMe().data?.role;
  const canDelete = role === 'admin' || role === 'researcher';
  const sessionQuery = useSessionDetail(sessionId);
  const { data: session } = sessionQuery;

  const hasVideo = !!session?.video_asset_id;
  const hasEeg = !!session?.eeg_asset_id;

  // Live modality data — only fetched once the session tells us the asset exists.
  const { data: videoQuality } = useVideoQualityReport(session?.video_asset_id ?? '');
  const { data: eegAsset } = useEEGAsset(session?.eeg_asset_id ?? undefined);
  const { data: liveSync } = useSync(sessionId);

  const sessionState = (session?.state as SessionState) ?? 'draft';
  const syncState = (session?.sync_state as SyncState) ?? 'not_synced';

  const st = SESSION_STATE_META[sessionState];

  // Video card content: real quality-report once assessed, else a neutral
  // "pending" state — never a fabricated number for a real session.
  const videoVerdict = videoQuality?.verdict as QualityVerdict | undefined;
  const vv = videoVerdict ? QUALITY_VERDICT_META[videoVerdict] : null;
  const videoSummary = videoQuality?.assessed
      ? t('detail.video.summary', {
          width: videoQuality.width ?? '—',
          height: videoQuality.height ?? '—',
          fps: videoQuality.fps?.toFixed(1) ?? '—',
          face: videoQuality.faceDetectionRate != null ? Math.round(videoQuality.faceDetectionRate * 100) : '—',
        })
      : t('detail.video.pending');

  const eegVerdict = eegAsset?.quality_verdict as QualityVerdict | undefined;
  const ev = eegVerdict ? QUALITY_VERDICT_META[eegVerdict] : null;
  const eegSummary = eegAsset
      ? t('detail.eeg.summary', {
          channels: eegAsset.channel_count ?? eegAsset.channel_names.length ?? '—',
          rate: eegAsset.sample_rate_hz ?? '—',
          quality: eegAsset.valid_ratio != null
            ? t('detail.eeg.rawValid', { value: Math.round(eegAsset.valid_ratio * 100) })
            : t('detail.eeg.rawPending'),
        })
      : t('detail.eeg.pending');

  const sy = SYNC_STATE_META[syncState];
  const syncSummary = liveSync
      ? t('detail.sync.offset', { value: liveSync.offset_ms })
        + (liveSync.drift_ms_per_min != null ? t('detail.sync.drift', { value: liveSync.drift_ms_per_min }) : '')
        + (liveSync.confidence != null ? t('detail.sync.confidence', { value: Math.round(liveSync.confidence * 100) }) : '')
      : t('detail.sync.pending');
  const nextAction = !hasEeg && !hasVideo
    ? { key: 'import' as const, to: '/app/acquisition' }
    : hasEeg && (!eegVerdict || eegVerdict === 'review_required')
      ? { key: 'eeg' as const, to: `/app/sessions/${sessionId}/eeg` }
      : hasEeg && hasVideo && !['synced', 'synced_with_caveats'].includes(syncState)
        ? { key: 'sync' as const, to: `/app/sessions/${sessionId}/sync` }
        : hasVideo && !hasEeg
          ? { key: 'video' as const, to: `/app/videos/${session?.video_asset_id}` }
        : { key: 'explore' as const, to: `/app/sessions/${sessionId}/explorer` };

  // Placed after every hook call so hook order stays stable across renders.
  if (sessionQuery.isLoading) {
    return (
      <div className="min-h-full bg-app-bg pb-12">
        <PageHeader title={t('detail.title')} description={t('detail.loadingDescription')} />
        <LoadingState message={t('detail.loading')} />
      </div>
    );
  }

  if (sessionQuery.isError || !session) {
    return (
      <div className="min-h-full bg-app-bg pb-12">
        <PageHeader title={t('detail.title')} description={t('detail.fallbackDescription')} />
        <ErrorState
          title={t('detail.loadFailed')}
          message={
            sessionQuery.error instanceof Error
              ? sessionQuery.error.message
              : t('detail.loadFailedHint')
          }
          onRetry={() => { void sessionQuery.refetch(); }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-full bg-app-bg pb-12">
      <PageHeader
        title={t('detail.titleWithId', { id: sessionId ? sessionId.slice(0, 8) : '—' })}
        description={t('detail.description')}
        context={
          <>
            <ToneBadge tone={st.tone}>{st.label}</ToneBadge>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-text-muted"><User size={12} aria-hidden="true" /> {t('detail.pseudonymised', { id: session?.participant_id.slice(0, 8) ?? '—' })}</span>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-text-muted"><FlaskConical size={12} aria-hidden="true" /> {session?.protocol ?? t('detail.noProtocol')}</span>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-text-muted"><Clock size={12} aria-hidden="true" /> {session?.recorded_at ? new Date(session.recorded_at).toLocaleString(locale) : t('detail.noRecordedAt')}</span>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-text-muted">{t('detail.condition', { value: session?.condition ?? t('detail.conditionMissing') })}</span>
          </>
        }
        actions={
          <>
            {canDelete && sessionId && (
              <DeleteEntityDialog
                entityType="session"
                entityId={sessionId}
                onDeleted={() => navigate('/app/sessions', { replace: true })}
              >
                <button type="button" className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 bg-surface border border-red-200 rounded-lg hover:bg-red-50 transition-colors dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40">
                  <Trash2 size={14} aria-hidden="true" />
                  {t('detail.delete')}
                </button>
              </DeleteEntityDialog>
            )}
            <Link to="/app/sessions" className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary">
              <ArrowLeft size={15} aria-hidden="true" /> {t('detail.back')}
            </Link>
          </>
        }
      />

      <div className="px-6 pt-6 space-y-6">
        <ScientificCaveat variant="privacy" compact />

        <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/30" aria-label={t('detail.next.label')}>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">{t('detail.next.eyebrow')}</p>
            <h2 className="mt-1 text-sm font-semibold text-text-primary">{t(`detail.next.${nextAction.key}.title`)}</h2>
            <p className="mt-1 text-xs text-text-secondary">{t(`detail.next.${nextAction.key}.detail`)}</p>
          </div>
          <Link to={nextAction.to} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">
            {t(`detail.next.${nextAction.key}.cta`)} <ArrowRight size={13} aria-hidden="true" />
          </Link>
        </section>

        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-text-muted mb-3">{t('detail.modalities')}</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <ModalityCard
              icon={Video} title={t('detail.video.title')} present={hasVideo}
              to={hasVideo ? `/app/videos/${session?.video_asset_id ?? `v-${sessionId}`}` : undefined}
              tone={vv ? <ToneBadge tone={vv.tone}>{vv.label}</ToneBadge> : undefined}
            >
              {videoSummary}
            </ModalityCard>

            <ModalityCard
              icon={Activity} title={t('detail.eeg.title')} present={hasEeg} to={hasEeg ? `/app/sessions/${sessionId}/eeg` : undefined}
              tone={ev ? <ToneBadge tone={ev.tone}>{ev.label}</ToneBadge> : undefined}
            >
              {eegSummary}
            </ModalityCard>

            <ModalityCard
              icon={Waypoints} title={t('detail.sync.title')} present to={`/app/sessions/${sessionId}/sync`}
              tone={<ToneBadge tone={sy.tone}>{sy.label}</ToneBadge>}
            >
              {syncSummary}
            </ModalityCard>

            <ModalityCard icon={Flag} title={t('detail.events.title')} present={!!eegAsset?.event_count}>
              {t('detail.events.count', { count: eegAsset?.event_count ?? 0 })}
            </ModalityCard>

            <ModalityCard icon={ClipboardList} title={t('detail.tests.title')} present={false}>
              {t('detail.tests.body')}
            </ModalityCard>

            <ModalityCard icon={PenLine} title={t('detail.annotations.title')} present to={`/app/sessions/${sessionId}/annotate`}>
              {t('detail.annotations.body')}
            </ModalityCard>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <button
            type="button"
            onClick={() => navigate(`/app/sessions/${sessionId}/sync`)}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 text-left hover:border-blue-300 transition-colors dark:hover:border-blue-800"
          >
            <div className="h-9 w-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center dark:bg-blue-950/50 dark:text-blue-300"><Waypoints size={17} aria-hidden="true" /></div>
            <div>
              <p className="text-sm font-semibold text-text-primary">{t('detail.shortcuts.sync.title')}</p>
              <p className="text-[11px] text-text-muted">{t('detail.shortcuts.sync.detail')}</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => navigate(`/app/sessions/${sessionId}/explorer`)}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 text-left hover:border-blue-300 transition-colors dark:hover:border-blue-800"
          >
            <div className="h-9 w-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center dark:bg-emerald-950/50 dark:text-emerald-300"><Cpu size={17} aria-hidden="true" /></div>
            <div>
              <p className="text-sm font-semibold text-text-primary">{t('detail.shortcuts.workspace.title')}</p>
              <p className="text-[11px] text-text-muted">{t('detail.shortcuts.workspace.detail')}</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => navigate('/app/governance')}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 text-left hover:border-blue-300 transition-colors dark:hover:border-blue-800"
          >
            <div className="h-9 w-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center dark:bg-amber-950/50 dark:text-amber-300"><ShieldCheck size={17} aria-hidden="true" /></div>
            <div>
              <p className="text-sm font-semibold text-text-primary">{t('detail.shortcuts.governance.title')}</p>
              <p className="text-[11px] text-text-muted">{t('detail.shortcuts.governance.detail')}</p>
            </div>
          </button>
        </section>
      </div>
    </div>
  );
}

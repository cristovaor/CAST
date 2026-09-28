import { Trans, useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { forwardRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Video, Activity, Waypoints, Flag, ArrowRight, Camera, Crosshair, FlaskConical } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { ToneBadge } from '@/components/ui/ToneBadge';
import { ScientificCaveat } from '@/components/ui/ScientificCaveat';
import { SelectTargetDialog } from '@/features/acquisition/SelectTargetDialog';
import { UploadAssetDialog } from '@/features/acquisition/UploadAssetDialog';
import { LiveCaptureConsole } from '@/features/acquisition/LiveCaptureConsole';
import { LSLAcquisitionConsole } from '@/features/acquisition/LSLAcquisitionConsole';
import { GazeCalibrationConsole } from '@/features/gaze/GazeCalibrationConsole';
import { ContextExperimentConsole } from '@/features/context/ContextExperimentConsole';
import { useSessions } from '@/features/sessions/useSessions';
import { SESSION_STATE_META, type SessionState } from '@/types/research';

// Data acquisition hub (docs §6, §9–10): equivalent entry points for the two
// core modalities plus events, with pending validations surfaced.

export function AcquisitionPage() {
  const { t } = useTranslation('acquisition');
  const navigate = useNavigate();
  const [captureSessionId, setCaptureSessionId] = useState<string | null>(null);
  const [lslSessionId, setLslSessionId] = useState<string | null>(null);
  const [gazeSessionId, setGazeSessionId] = useState<string | null>(null);
  const [contextSessionId, setContextSessionId] = useState<string | null>(null);
  const { data: sessions = [], isLoading } = useSessions();
  const pending = sessions
    .filter((session) => !['approved', 'excluded', 'archived'].includes(session.state ?? 'draft'))
    .slice(0, 8);

  return (
    <div className="min-h-full bg-app-bg pb-12">
      <PageHeader
        title={t('hub.title')}
        description={t('hub.description')}
      />
      <div className="px-6 pt-6 space-y-6">
        <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
          <Trans t={t} i18nKey="hub.intro" components={{ strong: <strong /> }} />
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <AcquisitionGroup title={t('hub.import.title')} description={t('hub.import.description')}>
            <UploadAssetDialog kind="eeg">
              <EntryCard icon={Activity} title={t('hub.import.eeg.title')} desc={t('hub.import.eeg.desc')} tone="cyan" />
            </UploadAssetDialog>
            <UploadAssetDialog kind="video">
              <EntryCard icon={Video} title={t('hub.import.video.title')} desc={t('hub.import.video.desc')} tone="blue" />
            </UploadAssetDialog>
          </AcquisitionGroup>

          <AcquisitionGroup title={t('hub.record.title')} description={t('hub.record.description')}>
            <SelectTargetDialog target="session" title={t('hub.record.capture.dialogTitle')} description={t('hub.record.capture.dialogDescription')} confirmLabel={t('hub.record.capture.confirm')} onSelect={(sessionId) => setCaptureSessionId(sessionId)}>
              <EntryCard icon={Camera} title={t('hub.record.capture.title')} desc={t('hub.record.capture.desc')} tone="emerald" />
            </SelectTargetDialog>
            <SelectTargetDialog target="session" title={t('hub.record.lsl.dialogTitle')} description={t('hub.record.lsl.dialogDescription')} confirmLabel={t('hub.record.lsl.confirm')} onSelect={(sessionId) => setLslSessionId(sessionId)}>
              <EntryCard icon={Activity} title={t('hub.record.lsl.title')} desc={t('hub.record.lsl.desc')} tone="cyan" />
            </SelectTargetDialog>
          </AcquisitionGroup>

          <AcquisitionGroup title={t('hub.complement.title')} description={t('hub.complement.description')}>
            <SelectTargetDialog target="session" title={t('hub.complement.context.dialogTitle')} description={t('hub.complement.context.dialogDescription')} confirmLabel={t('hub.complement.context.confirm')} onSelect={(sessionId) => setContextSessionId(sessionId)}>
              <EntryCard icon={FlaskConical} title={t('hub.complement.context.title')} desc={t('hub.complement.context.desc')} tone="indigo" />
            </SelectTargetDialog>
            <SelectTargetDialog target="session" title={t('hub.complement.gaze.dialogTitle')} description={t('hub.complement.gaze.dialogDescription')} confirmLabel={t('hub.complement.gaze.confirm')} onSelect={(sessionId) => setGazeSessionId(sessionId)}>
              <EntryCard icon={Crosshair} title={t('hub.complement.gaze.title')} desc={t('hub.complement.gaze.desc')} tone="rose" />
            </SelectTargetDialog>
          </AcquisitionGroup>

          <AcquisitionGroup title={t('hub.prepare.title')} description={t('hub.prepare.description')}>
            <SelectTargetDialog target="session" title={t('hub.prepare.events.dialogTitle')} description={t('hub.prepare.events.dialogDescription')} confirmLabel={t('hub.prepare.events.confirm')} onSelect={(sessionId) => navigate(`/app/sessions/${sessionId}/annotate`)}>
              <EntryCard icon={Flag} title={t('hub.prepare.events.title')} desc={t('hub.prepare.events.desc')} tone="amber" />
            </SelectTargetDialog>
            <SelectTargetDialog target="session" title={t('hub.prepare.sync.dialogTitle')} description={t('hub.prepare.sync.dialogDescription')} confirmLabel={t('hub.prepare.sync.confirm')} onSelect={(sessionId) => navigate(`/app/sessions/${sessionId}/sync`)}>
              <EntryCard icon={Waypoints} title={t('hub.prepare.sync.title')} desc={t('hub.prepare.sync.desc')} tone="violet" />
            </SelectTargetDialog>
          </AcquisitionGroup>
        </div>

        <ScientificCaveat variant="quality" compact />

        <section className="rounded-xl border border-border bg-surface">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-text-primary">{t('hub.pending.title')}</h3>
          </div>
          <ul>
            {isLoading ? (
              <li className="px-4 py-8 text-center text-sm text-text-muted">{t('hub.pending.loading')}</li>
            ) : pending.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-text-muted">
                {t('hub.pending.empty')}
              </li>
            ) : pending.map((session) => {
              const state = (session.state ?? 'draft') as SessionState;
              const meta = SESSION_STATE_META[state] ?? SESSION_STATE_META.draft;
              const Icon = state === 'ready_to_sync' || state === 'syncing'
                ? Waypoints
                : session.eeg_asset_id && !session.video_asset_id
                  ? Activity
                  : Video;
              const target = state === 'ready_to_sync' || state === 'syncing'
                ? `/app/sessions/${session.id}/sync`
                : `/app/sessions/${session.id}`;
              return (
                <li key={session.id}>
                  <Link to={target} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-surface-hover">
                    <Icon size={16} className="text-text-muted" aria-hidden="true" />
                    <span className="text-sm text-text-primary font-medium">
                      S-{session.id.slice(0, 8).toUpperCase()}
                    </span>
                    <span className="text-[13px] text-text-secondary">
                      {session.condition || t('hub.pending.noCondition')}
                    </span>
                    <ToneBadge tone={meta.tone} className="ml-auto">{meta.label}</ToneBadge>
                    <ArrowRight size={14} className="text-text-muted" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
      <LiveCaptureConsole
        sessionId={captureSessionId}
        open={captureSessionId != null}
        onOpenChange={(next) => { if (!next) setCaptureSessionId(null); }}
      />
      <LSLAcquisitionConsole
        sessionId={lslSessionId}
        open={lslSessionId != null}
        onOpenChange={(next) => { if (!next) setLslSessionId(null); }}
      />
      {gazeSessionId && (
        <GazeCalibrationConsole
          sessionId={gazeSessionId}
          open
          onOpenChange={(next) => { if (!next) setGazeSessionId(null); }}
        />
      )}
      {contextSessionId && (
        <ContextExperimentConsole
          sessionId={contextSessionId}
          open
          onOpenChange={(next) => { if (!next) setContextSessionId(null); }}
        />
      )}
    </div>
  );
}

interface EntryCardProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: typeof Video;
  title: string;
  desc: string;
  tone: string;
}

function AcquisitionGroup({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      <p className="mt-1 text-xs text-text-muted">{description}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

const EntryCard = forwardRef<HTMLButtonElement, EntryCardProps>(
  ({ icon: Icon, title, desc, tone, ...props }, ref) => {
  const c: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300',
    cyan: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-950/50 dark:text-cyan-300',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300',
    violet: 'bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300',
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300',
    rose: 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300',
    indigo: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300',
  };
  return (
    <button
      ref={ref}
      type="button"
      className="h-full w-full rounded-xl border border-border bg-surface p-4 text-left hover:border-blue-300 transition-colors dark:hover:border-blue-800"
      {...props}
    >
      <div className={`h-9 w-9 rounded-lg flex items-center justify-center mb-3 ${c[tone]}`}><Icon size={18} aria-hidden="true" /></div>
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      <p className="text-[12px] text-text-secondary mt-0.5 leading-relaxed">{desc}</p>
    </button>
  );
  },
);
EntryCard.displayName = 'EntryCard';

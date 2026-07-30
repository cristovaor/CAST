import { useEffect, useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Loader2 } from 'lucide-react';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ProvenanceLegend } from '@/components/data-display/ProvenanceLegend';
import { ScientificCaveat } from '@/components/ui/ScientificCaveat';
import { CoactivationPanel } from '@/features/eeg/components/CoactivationPanel';
import { eegToVideoMs, useEEGData } from '@/features/eeg/useEEG';
import { useAnnotationContext } from '@/features/annotations/api/useAnnotationEditor';
import { useSessionByReference, useSync } from '@/features/multimodal/useMultimodal';
import { SyncStatusPanel } from '@/features/multimodal/components/SyncStatusPanel';
import { useVideoPlaybackUrl, useVideoTimeline } from '@/features/videos/useVideos';
import type { TimelineEventDTO } from '@/features/videos/types';
import { MultimodalPlayer } from '@/features/inference/components/MultimodalPlayer';
import { usePlaybackStore } from '@/features/playback/usePlaybackStore';
import { cn, getMicroActionConfig } from '@/lib/utils';
import { PROVENANCE_META, type ProvenanceKind } from '@/types/research';
import type { MicroAction } from '@/types/domain';

type Lane = {
  key: string;
  label: string;
  kind: ProvenanceKind;
  segments: [number, number][];
};

export function AnalysisWorkspacePage() {
  const { sessionId: sessionReference } = useParams();
  const navigate = useNavigate();

  const sessionQuery = useSessionByReference(sessionReference);
  const session = sessionQuery.data;
  const resolvedSessionId = session?.id;

  const eegQuery = useEEGData(session?.eeg_asset_id ?? undefined);
  const timelineQuery = useVideoTimeline(session?.video_asset_id ?? '');
  const playbackQuery = useVideoPlaybackUrl(session?.video_asset_id ?? '');
  const syncQuery = useSync(resolvedSessionId);
  const annotationContextQuery = useAnnotationContext(session?.video_asset_id ?? '');

  const eeg = eegQuery.data;
  const timeline = timelineQuery.data;
  const playback = playbackQuery.data;
  const sync = syncQuery.data;
  const landmarkArtifact = annotationContextQuery.data?.landmarkArtifact?.status === 'ready'
    ? annotationContextQuery.data.landmarkArtifact
    : undefined;

  // Shared multimodal clock — the video is the single source of truth and the
  // EEG chart, sync control and timeline cursor all read/write to this store.
  const cursorMs = usePlaybackStore((s) => s.currentTimeMs);
  const durationMs = usePlaybackStore((s) => s.durationMs);
  const requestSeek = usePlaybackStore((s) => s.requestSeek);
  const reset = usePlaybackStore((s) => s.reset);
  useEffect(() => () => reset(), [resolvedSessionId, reset]);

  const cursorSeconds = cursorMs / 1000;
  const eegSpanSeconds = eeg?.data.length
    ? Math.max(
        0,
        eegToVideoMs(eeg.data[eeg.data.length - 1].timestamp_ms, eeg.sync_transform) / 1000,
      )
    : 0;
  const durationSeconds = Math.max(
    durationMs / 1000,
    session?.duration_seconds ?? 0,
    eegSpanSeconds,
    timeline?.duration_seconds ?? 0,
  );
  const cursorPercent = durationSeconds > 0
    ? Math.min(100, Math.max(0, (cursorSeconds / durationSeconds) * 100))
    : 0;

  const lanes = useMemo<Lane[]>(() => {
    if (!durationSeconds) return [];

    const toPercent = (seconds: number) =>
      Math.min(100, Math.max(0, (seconds / durationSeconds) * 100));
    const built: Lane[] = [];

    if (session?.video_asset_id) {
      built.push({
        key: 'video',
        label: 'Vídeo observado',
        kind: 'video_observed',
        segments: [[0, 100]],
      });
    }

    // Group by (action, origin) so model predictions and human annotations
    // render as distinct lanes instead of being silently merged.
    const byActionOrigin = new Map<string, { action: string; origin: string; segments: [number, number][] }>();
    for (const event of timeline?.events ?? []) {
      const groupKey = `${event.action}::${event.origin}`;
      const group = byActionOrigin.get(groupKey) ?? { action: event.action, origin: event.origin, segments: [] };
      group.segments.push([toPercent(event.start_time), toPercent(event.end_time)]);
      byActionOrigin.set(groupKey, group);
    }
    for (const { action, origin, segments } of byActionOrigin.values()) {
      const config = getMicroActionConfig(action as MicroAction);
      const isManual = origin === 'annotator';
      built.push({
        key: `event-${action}-${origin}`,
        label: isManual ? `${config.label} (manual)` : config.label,
        kind: isManual ? 'human_annotation' : 'detected_event',
        segments,
      });
    }

    if (eeg) {
      const firstEegMs = eeg.data[0]?.timestamp_ms ?? 0;
      const lastEegMs = eeg.data[eeg.data.length - 1]?.timestamp_ms ?? 0;
      const start = toPercent(Math.max(0, eegToVideoMs(firstEegMs, eeg.sync_transform) / 1000));
      const end = toPercent(Math.max(0, eegToVideoMs(lastEegMs, eeg.sync_transform) / 1000));
      built.push({
        key: 'eeg',
        label: `EEG (${eeg.data.length.toLocaleString('pt-BR')})`,
        kind: 'eeg_observed',
        segments: [[start, end]],
      });
    }

    return built;
  }, [durationSeconds, eeg, session?.video_asset_id, timeline?.events]);

  const eventStats = useMemo(() => {
    const events = timeline?.events ?? [];
    const confidence = events.length
      ? events.reduce((sum, event) => sum + event.confidence_mean, 0) / events.length
      : null;
    const observedSeconds = events.reduce(
      (sum, event) => sum + Math.max(0, event.end_time - event.start_time),
      0,
    );
    return { count: events.length, confidence, observedSeconds };
  }, [timeline?.events]);

  if (sessionQuery.isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-app-bg text-text-secondary">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Resolvendo sessão…
      </div>
    );
  }

  if (sessionQuery.isError || !session) {
    return (
      <div className="min-h-full bg-app-bg p-6">
        <div className="mx-auto max-w-2xl rounded-xl border border-border bg-surface">
          <EmptyState
            variant="error"
            title="Sessão não encontrada"
            description={`A referência “${sessionReference ?? ''}” não corresponde a uma sessão acessível. Use ao menos quatro caracteres do ID ou abra a sessão pela lista.`}
            icon={<AlertTriangle size={40} className="text-warning" />}
            action={{ label: 'Voltar para sessões', onClick: () => navigate('/app/sessions') }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-app-bg pb-10 text-text-primary" data-testid="analysis-workspace">
      <AnalysisHeader session={session} resolvedSessionId={resolvedSessionId} />

      <div className="space-y-5 p-4 sm:p-6">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Duração disponível" value={durationSeconds ? formatClock(durationSeconds) : '—'} />
          <StatCard label="Eventos detectados" value={eventStats.count.toLocaleString('pt-BR')} />
          <StatCard label="Amostras EEG" value={(eeg?.data.length ?? 0).toLocaleString('pt-BR')} />
          <StatCard
            label="Estado de sincronização"
            value={SYNC_STATE_LABEL[sync?.state ?? 'not_synced'] ?? 'Desconhecido'}
          />
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 space-y-4">
            {playbackQuery.isError || timelineQuery.isError ? (
              <div role="alert" className="flex min-h-32 items-center justify-center rounded-xl border border-danger-border bg-danger-light px-4 text-center text-sm text-danger">
                Não foi possível carregar o vídeo ou a timeline. Verifique o processamento e tente novamente.
              </div>
            ) : playback?.url ? (
              <MultimodalPlayer
                videoUrl={playback.url}
                events={timeline?.events ?? []}
                eegId={session.eeg_asset_id ?? undefined}
                fps={timeline?.fps}
                videoId={session.video_asset_id ?? undefined}
                landmarkArtifactId={landmarkArtifact?.id}
                landmarkChunkSizeFrames={landmarkArtifact?.chunkSizeFrames}
              />
            ) : (
              <div className="flex aspect-video items-center justify-center rounded-xl border border-border bg-black/90 px-6 text-center text-sm text-text-muted">
                {session.video_asset_id
                  ? 'O vídeo existe, mas ainda não possui URL de reprodução.'
                  : 'Nenhum vídeo foi coletado nesta sessão.'}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <SyncStatusPanel sessionId={resolvedSessionId} eegId={session.eeg_asset_id ?? undefined} />
          </div>
        </section>

        <Panel
          title="Timeline multimodal"
          subtitle="Clique em qualquer faixa para mover o relógio compartilhado do player"
          loading={timelineQuery.isLoading && !!session.video_asset_id}
          error={timelineQuery.isError}
        >
          <ProvenanceLegend
            kinds={['video_observed', 'eeg_observed', 'detected_event', 'human_annotation']}
            className="mb-4 [&_span]:text-text-secondary"
          />

          {lanes.length ? (
            <div className="relative" data-testid="multimodal-timeline">
              <div
                className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-red-500/80"
                style={{ left: `calc(9rem + ${cursorPercent}% * (100% - 9rem) / 100)` }}
              />
              {lanes.map((lane) => (
                <div key={lane.key} className="mb-2 flex items-center gap-3">
                  <span className="w-[8.25rem] shrink-0 truncate text-[11px] text-text-secondary">
                    {lane.label}
                  </span>
                  <button
                    type="button"
                    aria-label={`Posicionar na faixa ${lane.label}`}
                    className="relative h-7 flex-1 overflow-hidden rounded-md border border-border bg-surface-muted"
                    onClick={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      const seconds = ((event.clientX - rect.left) / rect.width) * durationSeconds;
                      requestSeek(seconds * 1000);
                    }}
                  >
                    {lane.segments.map(([start, end], index) => (
                      <span
                        key={`${lane.key}-${index}`}
                        className="absolute inset-y-1 rounded-sm"
                        style={{
                          left: `${start}%`,
                          width: `${Math.max(0.35, end - start)}%`,
                          backgroundColor: PROVENANCE_META[lane.kind].color,
                          opacity: lane.kind === 'detected_event' ? 0.9 : 0.45,
                        }}
                      />
                    ))}
                  </button>
                </div>
              ))}
              <div className="ml-36 mt-2 flex justify-between font-mono text-[10px] text-text-muted">
                <span>00:00</span>
                <span>{formatClock(durationSeconds / 2)}</span>
                <span>{formatClock(durationSeconds)}</span>
              </div>
            </div>
          ) : (
            <EmptyState
              variant="empty"
              title="Sem fontes temporais processadas"
              description="Adicione vídeo ou EEG à sessão e processe os arquivos para habilitar a timeline."
              className="py-10"
            />
          )}
        </Panel>

        <Panel title='Eventos detectados ("pontos")' subtitle="Predições do modelo e anotações manuais, sincronizadas com o player acima">
          <EventTable events={timeline?.events ?? []} onSeek={(seconds) => requestSeek(seconds * 1000)} />
        </Panel>

        <section className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Eventos válidos" value={eventStats.count.toLocaleString('pt-BR')} />
            <StatCard
              label="Confiança média"
              value={eventStats.confidence === null ? '—' : `${(eventStats.confidence * 100).toFixed(1)}%`}
            />
            <StatCard label="Tempo em eventos" value={formatClock(eventStats.observedSeconds)} />
          </div>
          {session.eeg_asset_id ? (
            <CoactivationPanel eegId={session.eeg_asset_id} />
          ) : (
            <div className="rounded-xl border border-border bg-surface">
              <EmptyState
                variant="empty"
                title="Coativação indisponível"
                description="A análise estatística EEG × microações requer EEG e eventos processados na mesma sessão."
                className="py-10"
              />
            </div>
          )}
        </section>

        <ScientificCaveat
          variant="association"
          compact
          className="!border-border !bg-surface-muted !text-text-primary"
        >
          Coincidências temporais entre eventos faciais e EEG indicam associação no intervalo selecionado,
          não causalidade. O backend aplica o offset persistido da sessão e os resultados requerem validação
          pelo pesquisador.
        </ScientificCaveat>
      </div>
    </div>
  );
}

const SYNC_STATE_LABEL: Record<string, string> = {
  not_synced: 'Não sincronizado',
  auto_available: 'Sugestão pronta',
  in_review: 'Em revisão',
  synced: 'Sincronizado',
  synced_with_caveats: 'Com ressalvas',
  sync_failed: 'Falhou',
};

function AnalysisHeader({
  session,
  resolvedSessionId,
}: {
  session: { id: string };
  resolvedSessionId?: string;
}) {
  return (
    <header className="border-b border-border bg-surface px-4 py-4 sm:px-6">
      <div className="flex items-center gap-3">
        <Link
          to={`/app/sessions/${resolvedSessionId}`}
          aria-label="Voltar para a sessão"
          className="rounded-md p-1.5 text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary"
        >
          <ArrowLeft size={17} />
        </Link>
        <div>
          <h1 className="text-lg font-semibold">Workspace de análise sincronizada</h1>
          <p className="mt-0.5 text-xs text-text-secondary">
            Sessão {session.id.slice(0, 8).toUpperCase()} · vídeo, EEG e eventos no mesmo relógio compartilhado
          </p>
        </div>
      </div>
    </header>
  );
}

function Panel({
  title,
  subtitle,
  children,
  loading,
  error,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  loading?: boolean;
  error?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p>}
      </div>
      {loading ? (
        <div className="flex min-h-40 items-center justify-center text-sm text-text-secondary">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Carregando dados…
        </div>
      ) : error ? (
        <div role="alert" className="flex min-h-32 items-center justify-center rounded-lg border border-danger-border bg-danger-light px-4 text-center text-sm text-danger">
          Não foi possível carregar esta fonte. Verifique o processamento e tente novamente.
        </div>
      ) : children}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-text-primary">{value}</p>
    </div>
  );
}

function EventTable({
  events,
  onSeek,
}: {
  events: TimelineEventDTO[];
  onSeek: (seconds: number) => void;
}) {
  if (!events.length) {
    return (
      <EmptyState
        variant="empty"
        title="Nenhum evento detectado"
        description="O vídeo ainda não possui uma predição com eventos de microações."
        className="py-10"
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-[11px] uppercase tracking-wide text-text-muted">
            <th scope="col" className="px-3 py-2 font-semibold">Microação</th>
            <th scope="col" className="px-3 py-2 font-semibold">Origem</th>
            <th scope="col" className="px-3 py-2 font-semibold">Início</th>
            <th scope="col" className="px-3 py-2 font-semibold">Fim</th>
            <th scope="col" className="px-3 py-2 font-semibold">Confiança</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Ação</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {events.map((event) => {
            const config = getMicroActionConfig(event.action as MicroAction);
            const isManual = event.origin === 'annotator';
            return (
              <tr key={event.event_id} className="text-text-secondary">
                <td className="px-3 py-2.5">
                  <span className="inline-flex items-center gap-2 font-medium text-text-primary">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: config.color }} />
                    {config.label}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                      isManual ? 'bg-violet-500/15 text-violet-600' : 'bg-amber-500/15 text-amber-600',
                    )}
                  >
                    {isManual ? 'Manual' : 'Modelo'}
                  </span>
                </td>
                <td className="px-3 py-2.5 font-mono text-xs">{formatClock(event.start_time)}</td>
                <td className="px-3 py-2.5 font-mono text-xs">{formatClock(event.end_time)}</td>
                <td className="px-3 py-2.5">{(event.confidence_mean * 100).toFixed(1)}%</td>
                <td className="px-3 py-2.5 text-right">
                  <button
                    type="button"
                    onClick={() => onSeek(event.start_time)}
                    className="text-xs font-semibold text-primary hover:text-primary-hover"
                  >
                    Ir ao evento
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const rounded = Math.floor(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainder = rounded % 60;
  if (hours) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Layers3,
  Loader2,
  Maximize2,
  Pause,
  Play,
  Sigma,
  Video,
} from 'lucide-react';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ProvenanceLegend } from '@/components/data-display/ProvenanceLegend';
import { ScientificCaveat } from '@/components/ui/ScientificCaveat';
import { CoactivationPanel } from '@/features/eeg/components/CoactivationPanel';
import { useEEGData } from '@/features/eeg/useEEG';
import { useSessionByReference } from '@/features/multimodal/useMultimodal';
import { useVideoPlaybackUrl, useVideoTimeline } from '@/features/videos/useVideos';
import type { TimelineEventDTO } from '@/features/videos/types';
import { cn, getMicroActionConfig } from '@/lib/utils';
import { PROVENANCE_META, type ProvenanceKind } from '@/types/research';
import type { MicroAction } from '@/types/domain';

type AnalysisMode = 'Temporal' | 'Vídeo' | 'EEG' | 'Multimodal' | 'Estatística';
type Lane = {
  key: string;
  label: string;
  kind: ProvenanceKind;
  segments: [number, number][];
};

const ANALYSES: { key: AnalysisMode; icon: typeof Video }[] = [
  { key: 'Temporal', icon: Clock3 },
  { key: 'Vídeo', icon: Video },
  { key: 'EEG', icon: Activity },
  { key: 'Multimodal', icon: Layers3 },
  { key: 'Estatística', icon: Sigma },
];

const EEG_BANDS = ['delta', 'theta', 'alpha', 'beta', 'gamma'] as const;

export function AnalysisWorkspacePage() {
  const { sessionId: sessionReference } = useParams();
  const navigate = useNavigate();
  const [analysis, setAnalysis] = useState<AnalysisMode>('Multimodal');
  const [cursorSeconds, setCursorSeconds] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);

  const sessionQuery = useSessionByReference(sessionReference);
  const session = sessionQuery.data;
  const resolvedSessionId = session?.id;

  const eegQuery = useEEGData(session?.eeg_asset_id ?? undefined);
  const timelineQuery = useVideoTimeline(session?.video_asset_id ?? '');
  const playbackQuery = useVideoPlaybackUrl(session?.video_asset_id ?? '');

  const eeg = eegQuery.data;
  const timeline = timelineQuery.data;
  const playback = playbackQuery.data;
  const eegSpanSeconds = eeg?.data.length
    ? Math.max(0, (eeg.data[eeg.data.length - 1].timestamp_ms - eeg.data[0].timestamp_ms) / 1000)
    : 0;
  const durationSeconds = Math.max(
    mediaDuration,
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

    const byAction = new Map<string, [number, number][]>();
    for (const event of timeline?.events ?? []) {
      const segments = byAction.get(event.action) ?? [];
      segments.push([toPercent(event.start_time), toPercent(event.end_time)]);
      byAction.set(event.action, segments);
    }
    for (const [action, segments] of byAction) {
      const config = getMicroActionConfig(action as MicroAction);
      built.push({
        key: `event-${action}`,
        label: config.label,
        kind: 'detected_event',
        segments,
      });
    }

    if (eeg) {
      const start = toPercent(Math.max(0, eeg.sync_offset_ms / 1000));
      built.push({
        key: 'eeg',
        label: `EEG (${eeg.data.length.toLocaleString('pt-BR')})`,
        kind: 'eeg_observed',
        segments: [[start, 100]],
      });
      if (eeg.data[0] && EEG_BANDS.some((band) => band in eeg.data[0])) {
        built.push({
          key: 'bands',
          label: 'Bandas derivadas',
          kind: 'derived_feature',
          segments: [[start, 100]],
        });
      }
    }

    return built;
  }, [durationSeconds, eeg, session?.video_asset_id, timeline?.events]);

  const eegSeries = useMemo(() => {
    if (!eeg?.data.length) return [];
    const step = Math.max(1, Math.floor(eeg.data.length / 160));
    return EEG_BANDS.map((band) => ({
      band,
      values: eeg.data
        .filter((_, index) => index % step === 0)
        .map((row) => Number(row[band]))
        .filter(Number.isFinite),
    })).filter((series) => series.values.length > 0);
  }, [eeg]);

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

  const seekTo = (seconds: number) => {
    const bounded = Math.min(durationSeconds || seconds, Math.max(0, seconds));
    setCursorSeconds(bounded);
    if (videoRef.current) videoRef.current.currentTime = bounded;
  };

  const togglePlayback = async () => {
    const videoElement = videoRef.current;
    if (!videoElement) return;
    setPlayerError(null);
    try {
      if (videoElement.paused) await videoElement.play();
      else videoElement.pause();
    } catch {
      setPlayerError('O navegador não conseguiu iniciar a reprodução deste arquivo.');
    }
  };

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

  const showVideo = analysis === 'Vídeo' || analysis === 'Multimodal';
  const showEeg = analysis === 'EEG' || analysis === 'Multimodal';
  const showTimeline = analysis === 'Temporal' || analysis === 'Multimodal';
  const showStatistics = analysis === 'Estatística';

  return (
    <div className="min-h-full bg-app-bg pb-10 text-text-primary" data-testid="analysis-workspace">
      <header className="border-b border-border bg-surface px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
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
                  Sessão {session.id.slice(0, 8).toUpperCase()} · dados observados e derivados no mesmo relógio
                </p>
              </div>
            </div>
          </div>

          <nav
            aria-label="Tipo de análise"
            className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-border bg-surface-muted p-1"
          >
            {ANALYSES.map(({ key, icon: Icon }) => (
              <button
                key={key}
                type="button"
                aria-pressed={analysis === key}
                onClick={() => setAnalysis(key)}
                className={cn(
                  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-xs font-medium transition-colors',
                  analysis === key
                    ? 'bg-surface text-text-primary shadow-sm'
                    : 'text-text-secondary hover:text-text-primary',
                )}
              >
                <Icon size={14} />
                {key}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <div className="space-y-5 p-4 sm:p-6">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Duração disponível" value={durationSeconds ? formatClock(durationSeconds) : '—'} />
          <StatCard label="Eventos do modelo" value={eventStats.count.toLocaleString('pt-BR')} />
          <StatCard label="Amostras EEG" value={(eeg?.data.length ?? 0).toLocaleString('pt-BR')} />
          <StatCard
            label="Offset EEG"
            value={eeg ? `${eeg.sync_offset_ms.toLocaleString('pt-BR')} ms` : '—'}
          />
        </section>

        {(showVideo || showEeg) && (
          <section className={cn('grid gap-4', showVideo && showEeg && 'xl:grid-cols-2')}>
            {showVideo && (
              <Panel
                title="Player de vídeo"
                subtitle="Relógio mestre da análise temporal"
                error={timelineQuery.isError || playbackQuery.isError}
              >
                <div
                  ref={playerRef}
                  className="relative flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-black"
                >
                  {playback?.url ? (
                    <video
                      ref={videoRef}
                      src={playback.url}
                      className="h-full w-full object-contain"
                      preload="metadata"
                      onLoadedMetadata={(event) => {
                        if (Number.isFinite(event.currentTarget.duration)) {
                          setMediaDuration(event.currentTarget.duration);
                        }
                        event.currentTarget.playbackRate = playbackRate;
                      }}
                      onTimeUpdate={(event) => setCursorSeconds(event.currentTarget.currentTime)}
                      onPlay={() => setPlaying(true)}
                      onPause={() => setPlaying(false)}
                      onEnded={() => setPlaying(false)}
                      onError={() => setPlayerError('O arquivo de vídeo não pôde ser carregado.')}
                    />
                  ) : (
                    <div className="px-6 text-center text-sm text-slate-400">
                      {session.video_asset_id
                        ? 'O vídeo existe, mas ainda não possui URL de reprodução.'
                        : 'Nenhum vídeo foi coletado nesta sessão.'}
                    </div>
                  )}

                  <span className="absolute bottom-2 left-2 rounded bg-black/65 px-2 py-1 font-mono text-[10px] text-slate-200">
                    {formatClock(cursorSeconds)}
                    {durationSeconds ? ` / ${formatClock(durationSeconds)}` : ''}
                    {timeline?.fps ? ` · frame ${Math.round(cursorSeconds * timeline.fps)}` : ''}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => seekTo(cursorSeconds - 1)}
                    disabled={!playback?.url}
                    aria-label="Voltar um segundo"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void togglePlayback()}
                    disabled={!playback?.url}
                    aria-label={playing ? 'Pausar vídeo' : 'Reproduzir vídeo'}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {playing ? <Pause size={16} /> : <Play size={16} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => seekTo(cursorSeconds + 1)}
                    disabled={!playback?.url}
                    aria-label="Avançar um segundo"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronRight size={16} />
                  </button>

                  <input
                    type="range"
                    min={0}
                    max={durationSeconds || 0}
                    step={0.05}
                    value={Math.min(cursorSeconds, durationSeconds || 0)}
                    onChange={(event) => seekTo(Number(event.target.value))}
                    disabled={!playback?.url}
                    aria-label="Posição do vídeo"
                    className="min-w-36 flex-1 accent-blue-600"
                  />

                  <label className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
                    Velocidade
                    <select
                      value={playbackRate}
                      onChange={(event) => {
                        const rate = Number(event.target.value);
                        setPlaybackRate(rate);
                        if (videoRef.current) videoRef.current.playbackRate = rate;
                      }}
                      className="rounded-md border border-border bg-surface px-2 py-1.5 text-text-primary"
                    >
                      {[0.5, 1, 1.5, 2].map((rate) => (
                        <option key={rate} value={rate}>{rate}×</option>
                      ))}
                    </select>
                  </label>

                  <button
                    type="button"
                    onClick={() => playerRef.current?.requestFullscreen()}
                    disabled={!playback?.url}
                    aria-label="Exibir player em tela cheia"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Maximize2 size={15} />
                  </button>
                </div>
                {playerError && <p role="alert" className="mt-2 text-xs text-danger">{playerError}</p>}
              </Panel>
            )}

            {showEeg && (
              <Panel
                title="Visualização de EEG"
                subtitle="Bandas espectrais retornadas pelo backend"
                loading={eegQuery.isLoading}
                error={eegQuery.isError}
              >
                {eegSeries.length ? (
                  <div className="min-h-[260px] rounded-lg border border-border bg-surface-muted p-3">
                    {eegSeries.map(({ band, values }, index) => (
                      <div key={band} className="mb-2 flex items-center gap-2">
                        <span className="w-11 font-mono text-[10px] text-text-muted">{band}</span>
                        <svg
                          viewBox="0 0 400 28"
                          className={cn(
                            'h-7 flex-1',
                            index === 2 ? 'text-cyan-500' : 'text-text-secondary',
                          )}
                          preserveAspectRatio="none"
                          aria-label={`Série da banda ${band}`}
                        >
                          <path
                            d={seriesPath(values)}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.2"
                            vectorEffect="non-scaling-stroke"
                          />
                        </svg>
                      </div>
                    ))}
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-[11px] text-text-muted">
                      <span>{eeg?.data.length.toLocaleString('pt-BR')} amostras</span>
                      <span>{eegSeries.length} bandas disponíveis</span>
                      <span>offset {eeg?.sync_offset_ms.toLocaleString('pt-BR')} ms</span>
                    </div>
                  </div>
                ) : (
                  <EmptyState
                    variant="empty"
                    title="EEG não disponível"
                    description="A sessão não possui EEG ou o arquivo ainda não foi processado em séries temporais."
                    className="py-10"
                  />
                )}
              </Panel>
            )}
          </section>
        )}

        {showTimeline && (
          <Panel
            title="Timeline multimodal"
            subtitle="Clique em qualquer faixa para mover o relógio do vídeo"
            loading={timelineQuery.isLoading && !!session.video_asset_id}
            error={timelineQuery.isError}
          >
            <ProvenanceLegend
              kinds={['video_observed', 'eeg_observed', 'detected_event', 'derived_feature']}
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
                        seekTo(((event.clientX - rect.left) / rect.width) * durationSeconds);
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
        )}

        {(analysis === 'Temporal' || analysis === 'Vídeo') && (
          <Panel title="Eventos detectados" subtitle="Eventos retornados pela predição mais recente">
            <EventTable events={timeline?.events ?? []} onSeek={seekTo} />
          </Panel>
        )}

        {showStatistics && (
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
        )}

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
            <th className="px-3 py-2 font-semibold">Microação</th>
            <th className="px-3 py-2 font-semibold">Início</th>
            <th className="px-3 py-2 font-semibold">Fim</th>
            <th className="px-3 py-2 font-semibold">Confiança</th>
            <th className="px-3 py-2 text-right font-semibold">Ação</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {events.map((event) => {
            const config = getMicroActionConfig(event.action as MicroAction);
            return (
              <tr key={event.event_id} className="text-text-secondary">
                <td className="px-3 py-2.5">
                  <span className="inline-flex items-center gap-2 font-medium text-text-primary">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: config.color }} />
                    {config.label}
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

function seriesPath(values: number[]): string {
  if (values.length < 2) return 'M 0 14 L 400 14';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 400;
      const y = 25 - ((value - min) / range) * 22;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

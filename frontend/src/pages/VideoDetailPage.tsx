import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { RotateCcw, PenLine, Info, FileDown, Download, Trash2 } from 'lucide-react';
import { DeleteEntityDialog } from '@/features/deletion/DeleteEntityDialog';
import { useMe } from '@/features/auth/useAuth';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { QualityBadge } from '@/components/ui/QualityBadge';
import { MicroActionBadge } from '@/components/ui/MicroActionBadge';
import { ModelVersionBadge } from '@/components/ui/ModelVersionBadge';
import { MetricCard } from '@/components/data-display/MetricCard';
import { DataTable, type ColumnDef } from '@/components/data-display/DataTable';
import { MicroActionTimeline } from '@/components/charts/MicroActionTimeline';
import { VideoQualityPanel } from '@/components/status/VideoQualityPanel';
import { MicroActionSummaryCards, type MicroActionType, type SummaryData } from '@/components/charts/MicroActionSummaryCards';
import { cn } from '@/lib/utils';
import { formatMs, formatPercentage } from '@/lib/formatters';
import type { TimelineEvent, KPICardData, MicroAction } from '@/types/domain';
import type { TimelineEventDTO } from '@/features/videos/types';
import { useVideoDetails, useVideoTimeline, useVideoQualityReport, useProcessVideo, useVideoPlaybackUrl, useLandmarkDownloadUrls } from '@/features/videos/useVideos';
import { useStartInference } from '@/features/inference/useInference';
import { downloadDynamicPdf } from '@/features/reports/useReports';
import { MultimodalPlayer } from '@/features/inference/components/MultimodalPlayer';
import { CoactivationPanel } from '@/features/eeg/components/CoactivationPanel';

// ─── Event table columns ──────────────────────────────────────

function eventColumns(t: TFunction<'videos'>): ColumnDef<TimelineEvent>[] {
  return [
  {
    key: 'microAction',
    header: t('detail.columns.microAction'),
    sortable: true,
    render: (_, row) => <MicroActionBadge action={row.microAction} size="sm" />,
  },
  {
    key: 'startMs',
    header: t('detail.columns.start'),
    sortable: true,
    render: (v) => <span className="font-mono text-xs text-text-secondary">{formatMs(Number(v))}</span>,
  },
  {
    key: 'endMs',
    header: t('detail.columns.end'),
    render: (v) => <span className="font-mono text-xs text-text-secondary">{formatMs(Number(v))}</span>,
  },
  {
    key: 'endMs',
    header: t('detail.columns.duration'),
    render: (_, row) => <span className="font-mono text-xs text-text-secondary">{formatMs(row.endMs - row.startMs)}</span>,
  },
  {
    key: 'confidence',
    header: t('detail.columns.confidence'),
    sortable: true,
    render: (v) => {
      const val = Number(v);
      return (
        <span className={cn('text-xs font-semibold', val >= 0.85 ? 'text-emerald-600' : val >= 0.70 ? 'text-amber-600' : 'text-red-600')}>
          {formatPercentage(val * 100)}
        </span>
      );
    },
  },
  {
    key: 'origin',
    header: t('detail.columns.origin'),
    render: (v) => (
      <span className={cn(
        'text-[11px] font-medium px-1.5 py-0.5 rounded',
        v === 'model' ? 'bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300' : 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300',
      )}>
        {v === 'model' ? t('detail.origin.model') : t('detail.origin.annotator')}
      </span>
    ),
  },
  {
    key: 'review_status',
    header: t('detail.columns.review'),
    render: (v) => (
      <span className={cn(
        'text-[11px] font-medium px-1.5 py-0.5 rounded',
        v === 'approved' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300' : v === 'rejected' ? 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-300' : 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300',
      )}>
        {v === 'approved' ? t('detail.review.approved') : v === 'rejected' ? t('detail.review.rejected') : t('detail.review.pending')}
      </span>
    ),
  },
  ];
}

// ─── Video Detail Page ────────────────────────────────────────

export function VideoDetailPage() {
  const { t } = useTranslation('videos');
  const { videoId } = useParams<{ videoId: string }>();
  const navigate = useNavigate();
  const role = useMe().data?.role;
  const canDelete = role === 'admin' || role === 'researcher';

  const { data: videoAsset, isLoading: loadingVideo, isError: isVideoError } = useVideoDetails(videoId!);
  const { data: timelineData, isLoading: loadingTimeline, isError: isTimelineError } = useVideoTimeline(videoId!);
  const { data: qualityData, isLoading: loadingQuality, isError: isQualityError } = useVideoQualityReport(videoId!);
  const { data: playback } = useVideoPlaybackUrl(videoId!);
  const { mutate: processVideo } = useProcessVideo();
  const startInference = useStartInference();
  const landmarkDownload = useLandmarkDownloadUrls();

  const handleProcess = () => {
    processVideo(videoId!, {
      onSuccess: () => navigate(`/app/videos/${videoId}/processing`)
    });
  };

  const handleInference = () => {
    startInference.mutate({ videoId: videoId! });
  };

  const handleDownloadLandmarks = (kind: 'raw' | 'normalized') => {
    landmarkDownload.mutate(videoId!, {
      onSuccess: (data) => {
        const url = data[kind];
        if (url) window.open(url, '_blank');
      },
    });
  };

  if (loadingVideo || loadingTimeline || loadingQuality) {
    return (
      <div className="flex h-full items-center justify-center">
        <div role="status" aria-label={t('detail.loading')} className="w-8 h-8 rounded-full border-4 border-border border-t-blue-600 animate-spin" />
      </div>
    );
  }

  if (isVideoError || isTimelineError || isQualityError || !videoAsset) {
    return (
      <div className="min-h-full bg-app-bg px-6 py-12">
        <div className="mx-auto max-w-lg rounded-xl border border-border bg-surface p-8 text-center">
          <h1 className="text-xl font-semibold text-text-primary">{t('detail.notFound')}</h1>
          <p className="mt-2 text-sm text-text-muted">
            {t('detail.notFoundDescription')}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            {videoId && (
              <Link
                to={`/app/videos/${videoId}/processing`}
                className="inline-flex rounded-lg border border-border px-4 py-2 text-sm font-semibold text-text-secondary transition hover:bg-app-bg"
              >
                {t('detail.processingLogs')}
              </Link>
            )}
            <Link
              to="/app/videos"
              className="inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              {t('detail.back')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Transform backend events into TimelineEvent
  const events: TimelineEvent[] = (timelineData?.events || []).map((ev: TimelineEventDTO) => ({
    id: ev.event_id,
    microAction: ev.action as MicroAction,
    startMs: ev.start_time * 1000,
    endMs: ev.end_time * 1000,
    confidence: ev.confidence_mean,
    origin: ev.origin,
    review_status: 'pending'
  }));

  const PAGE_KPIS: KPICardData[] = [
    { id: 'events',    label: t('detail.kpis.events.label'),        value: events.length,      description: t('detail.kpis.events.description'),        icon: 'BarChart3',   color: 'default' },
    { id: 'per_min',   label: t('detail.kpis.perMinute.label'),     value: ((events.length / (qualityData?.durationSeconds || 120)) * 60).toFixed(1),  description: t('detail.kpis.perMinute.description'), icon: 'Activity', color: 'info' },
    { id: 'face_det',  label: t('detail.kpis.faceDetection.label'), value: `${((qualityData?.faceDetectionRate ?? 0) * 100).toFixed(1)}%`, description: t('detail.kpis.faceDetection.description'), icon: 'ShieldCheck', color: 'success' },
    { id: 'conf',      label: t('detail.kpis.confidence.label'),    value: `${(events.reduce((acc, ev) => acc + ev.confidence, 0) / (events.length || 1) * 100).toFixed(1)}%`, description: t('detail.kpis.confidence.description'), icon: 'ShieldCheck', color: 'success' },
    { id: 'gaps',      label: t('detail.kpis.findings.label'),      value: qualityData?.findings?.length || 0, description: t('detail.kpis.findings.description'), icon: 'AlertTriangle', color: 'warning' },
  ];

  // Aggregate summary
  const summary = events.reduce<SummaryData>((acc, ev) => {
    if (!(ev.microAction in acc)) return acc;
    const action = ev.microAction as MicroActionType;
    acc[action].count += 1;
    acc[action].perMinute = Number(((acc[action].count / (qualityData?.durationSeconds || 120)) * 60).toFixed(1));
    return acc;
  }, {
    OLHO_FECHADO: { count: 0, perMinute: 0 },
    OLHANDO_CANTO: { count: 0, perMinute: 0 },
    MEXEU_LABIOS: { count: 0, perMinute: 0 },
    VIROU_ROSTO: { count: 0, perMinute: 0 },
    MEXEU_SOBRANCELHA: { count: 0, perMinute: 0 },
  });

  return (
    <div className="min-h-full">
      <PageHeader
        title={videoAsset?.filename || t('detail.fallbackTitle')}
        description={t('detail.videoId', { id: videoId })}
        actions={
          <>
            <StatusBadge status="processed" />
            <QualityBadge score={qualityData?.faceDetectionRate ?? 0} />
            {timelineData?.model_version && timelineData.model_version !== 'unknown' ? (
              <ModelVersionBadge name="Inferência" version={timelineData.model_version} />
            ) : (
              <span className="text-xs text-text-muted">Inferência: versão não disponível</span>
            )}
            <button
              type="button"
              onClick={() => downloadDynamicPdf(videoId!)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-text-secondary bg-surface border border-border rounded-lg hover:bg-app-bg transition-colors"
            >
              <FileDown size={13} aria-hidden="true" />
              {t('detail.downloadReport')}
            </button>
            {videoAsset?.landmark_artifact_id && (
              <div className="relative group">
                <button
                  type="button"
                  aria-haspopup="menu"
                  disabled={landmarkDownload.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-text-secondary bg-surface border border-border rounded-lg hover:bg-app-bg transition-colors disabled:opacity-50"
                >
                  <Download size={13} aria-hidden="true" />
                  {landmarkDownload.isPending ? t('detail.generatingLink') : t('detail.downloadLandmarks')}
                </button>
                <div className="absolute right-0 top-full mt-1 hidden group-hover:block group-focus-within:block z-10 bg-surface border border-border rounded-lg shadow-lg overflow-hidden min-w-[160px]">
                  <button
                    type="button"
                    onClick={() => handleDownloadLandmarks('normalized')}
                    className="w-full text-left px-3 py-2 text-sm text-text-secondary hover:bg-app-bg"
                  >
                    {t('detail.normalized')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadLandmarks('raw')}
                    className="w-full text-left px-3 py-2 text-sm text-text-secondary hover:bg-app-bg"
                  >
                    {t('detail.raw')}
                  </button>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={handleProcess}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-text-secondary bg-surface border border-border rounded-lg hover:bg-app-bg transition-colors"
            >
              <RotateCcw size={13} aria-hidden="true" />
              {t('detail.reprocess')}
            </button>
            <button
              type="button"
              onClick={handleInference}
              disabled={startInference.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-text-secondary bg-surface border border-border rounded-lg hover:bg-app-bg transition-colors"
            >
              {startInference.isPending ? t('detail.running') : t('detail.inference')}
            </button>
            <button
              type="button"
              onClick={() => navigate(`/app/videos/${videoId}/annotations`)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
            >
              <PenLine size={13} aria-hidden="true" />
              {t('detail.annotate')}
            </button>
            {canDelete && videoId && (
              <DeleteEntityDialog
                entityType="video"
                entityId={videoId}
                onDeleted={() => navigate('/app/videos', { replace: true })}
              >
                <button type="button" className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 bg-surface border border-red-200 rounded-lg hover:bg-red-50 transition-colors dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40">
                  <Trash2 size={13} aria-hidden="true" />
                  {t('detail.delete')}
                </button>
              </DeleteEntityDialog>
            )}
          </>
        }
      />

      <div className="p-6 space-y-5 animate-fade-in">
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {PAGE_KPIS.map((kpi) => (
            <MetricCard key={kpi.id} data={kpi} />
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2 space-y-4">
            <MultimodalPlayer
              videoUrl={playback?.url ?? ''}
              events={timelineData?.events || []}
              eegId={videoAsset?.eeg_asset_id ?? undefined}
              fps={videoAsset?.fps ? Number(videoAsset.fps) : undefined}
              videoId={videoId}
              landmarkArtifactId={videoAsset?.landmark_artifact_id ?? undefined}
              landmarkChunkSizeFrames={videoAsset?.landmark_chunk_size_frames ?? undefined}
            />

            <div className="card p-4">
              <h3 className="text-sm font-semibold text-text-primary mb-3">{t('detail.timeline')}</h3>
              <MicroActionTimeline
                events={events}
                videoDurationMs={(qualityData?.durationSeconds || 120) * 1000}
              />
            </div>
          </div>

          <div className="space-y-4">
            <CoactivationPanel eegId={videoAsset?.eeg_asset_id ?? undefined} />
            {qualityData && <VideoQualityPanel quality={qualityData} />}
            <MicroActionSummaryCards summary={summary} />
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-text-primary">{t('detail.events')}</h3>
            <p className="text-xs text-text-muted mt-0.5">
              {t('detail.eventsCount', { count: events.length })}
            </p>
          </div>
          <DataTable
            columns={eventColumns(t)}
            data={events}
          />
        </div>

        <div className="flex items-start gap-3 p-4 rounded-xl bg-app-bg border border-border">
          <Info size={14} className="text-text-muted shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-xs text-text-muted leading-relaxed">
            <strong className="text-text-secondary font-semibold">{t('detail.interpretationTitle')}</strong>{' '}
            {t('detail.interpretation')}
          </p>
        </div>
      </div>
    </div>
  );
}

import { useParams, useNavigate } from 'react-router-dom';
import { RotateCcw, PenLine, Info, FileDown } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { QualityBadge } from '@/components/ui/QualityBadge';
import { MicroActionBadge } from '@/components/ui/MicroActionBadge';
import { ModelVersionBadge } from '@/components/ui/ModelVersionBadge';
import { MetricCard } from '@/components/data-display/MetricCard';
import { DataTable, type ColumnDef } from '@/components/data-display/DataTable';
import { MicroActionTimeline } from '@/components/charts/MicroActionTimeline';
import { VideoQualityPanel } from '@/components/status/VideoQualityPanel';
import { MicroActionSummaryCards } from '@/components/charts/MicroActionSummaryCards';
import { cn } from '@/lib/utils';
import { formatMs, formatPercentage } from '@/lib/formatters';
import type { TimelineEvent, KPICardData } from '@/types/domain';
import { useVideoDetails, useVideoTimeline, useVideoQualityReport, useProcessVideo, useVideoPlaybackUrl } from '@/features/videos/useVideos';
import { useStartInference } from '@/features/inference/useInference';
import { downloadDynamicPdf } from '@/features/reports/useReports';
import { MultimodalPlayer } from '@/features/inference/components/MultimodalPlayer';
import { CoactivationPanel } from '@/features/eeg/components/CoactivationPanel';

// Fallback sample used only when storage has no playable URL (local dev without MinIO).
const SAMPLE_VIDEO_URL = 'https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';

// ─── Event table columns ──────────────────────────────────────

const EVENT_COLUMNS: ColumnDef<TimelineEvent>[] = [
  {
    key: 'microAction',
    header: 'Microação',
    sortable: true,
    render: (_, row) => <MicroActionBadge action={row.microAction} size="sm" />,
  },
  {
    key: 'startMs',
    header: 'Início',
    sortable: true,
    render: (v) => <span className="font-mono text-xs text-slate-600">{formatMs(Number(v))}</span>,
  },
  {
    key: 'endMs',
    header: 'Fim',
    render: (v) => <span className="font-mono text-xs text-slate-600">{formatMs(Number(v))}</span>,
  },
  {
    key: 'endMs',
    header: 'Duração',
    render: (_, row) => <span className="font-mono text-xs text-slate-600">{formatMs(row.endMs - row.startMs)}</span>,
  },
  {
    key: 'confidence',
    header: 'Confiança',
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
    header: 'Origem',
    render: (v) => (
      <span className={cn(
        'text-[11px] font-medium px-1.5 py-0.5 rounded',
        v === 'model' ? 'bg-violet-50 text-violet-600' : 'bg-blue-50 text-blue-600',
      )}>
        {v === 'model' ? 'Modelo' : 'Anotador'}
      </span>
    ),
  },
  {
    key: 'review_status',
    header: 'Revisão',
    render: (v) => (
      <span className={cn(
        'text-[11px] font-medium px-1.5 py-0.5 rounded',
        v === 'approved' ? 'bg-emerald-50 text-emerald-600' : v === 'rejected' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600',
      )}>
        {v === 'approved' ? 'Aprovado' : v === 'rejected' ? 'Rejeitado' : 'Pendente'}
      </span>
    ),
  },
];

// ─── Video Detail Page ────────────────────────────────────────

export function VideoDetailPage() {
  const { videoId } = useParams<{ videoId: string }>();
  const navigate = useNavigate();

  const { data: videoAsset, isLoading: loadingVideo } = useVideoDetails(videoId!);
  const { data: timelineData, isLoading: loadingTimeline } = useVideoTimeline(videoId!);
  const { data: qualityData, isLoading: loadingQuality } = useVideoQualityReport(videoId!);
  const { data: playback } = useVideoPlaybackUrl(videoId!);
  const { mutate: processVideo } = useProcessVideo();
  const startInference = useStartInference();

  const handleProcess = () => {
    processVideo(videoId!, {
      onSuccess: () => navigate(`/app/videos/${videoId}/processing`)
    });
  };

  const handleInference = () => {
    startInference.mutate({ videoId: videoId! });
  };

  if (loadingVideo || loadingTimeline || loadingQuality) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-slate-200 border-t-blue-600 animate-spin" />
      </div>
    );
  }

  // Transform backend events into TimelineEvent
  const events: TimelineEvent[] = (timelineData?.events || []).map((ev: any) => ({
    id: ev.event_id,
    microAction: ev.action,
    startMs: ev.start_time * 1000,
    endMs: ev.end_time * 1000,
    confidence: ev.confidence_mean,
    origin: 'model',
    review_status: 'pending'
  }));

  const PAGE_KPIS: KPICardData[] = [
    { id: 'events',    label: 'Total de eventos',    value: events.length,      description: 'Microações detectadas no vídeo',  icon: 'BarChart3',   color: 'default' },
    { id: 'per_min',   label: 'Eventos por min',     value: ((events.length / (qualityData?.durationSeconds || 120)) * 60).toFixed(1),  description: 'Taxa média de ocorrência',         icon: 'Activity',    color: 'info'    },
    { id: 'face_det',  label: 'Face detection',      value: `${((qualityData?.faceDetectionRate ?? 0) * 100).toFixed(1)}%`, description: 'Taxa de detecção facial',         icon: 'ShieldCheck', color: 'success' },
    { id: 'conf',      label: 'Confiança média',     value: `${(events.reduce((acc, ev) => acc + ev.confidence, 0) / (events.length || 1) * 100).toFixed(1)}%`, description: 'Confiança média nas predições',   icon: 'ShieldCheck', color: 'success' },
    { id: 'gaps',      label: 'Achados de qualidade', value: qualityData?.findings?.length || 0,       description: 'Problemas identificados no vídeo', icon: 'AlertTriangle',color: 'warning' },
  ];

  // Aggregate summary
  const summary = events.reduce((acc: any, ev) => {
    if (!acc[ev.microAction]) {
      acc[ev.microAction] = { count: 0, perMinute: 0 };
    }
    acc[ev.microAction].count += 1;
    acc[ev.microAction].perMinute = Number(((acc[ev.microAction].count / (qualityData?.durationSeconds || 120)) * 60).toFixed(1));
    return acc;
  }, {});

  return (
    <div className="min-h-full">
      <PageHeader
        title={videoAsset?.filename || "Video Detalhes"}
        description={`Vídeo ID: ${videoId}`}
        actions={
          <>
            <StatusBadge status="processed" />
            <QualityBadge score={qualityData?.faceDetectionRate ?? 0} />
            <ModelVersionBadge name="FaceMesh" version={timelineData?.model_version || "1.0"} active />
            <button
              onClick={() => downloadDynamicPdf(videoId!)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <FileDown size={13} />
              Baixar Laudo
            </button>
            <button
              onClick={handleProcess}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <RotateCcw size={13} />
              Reprocessar
            </button>
            <button
              onClick={handleInference}
              disabled={startInference.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              {startInference.isPending ? 'Rodando...' : 'Inferência'}
            </button>
            <button
              onClick={() => navigate(`/app/videos/${videoId}/annotations`)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
            >
              <PenLine size={13} />
              Anotar
            </button>
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
              videoUrl={playback?.url || SAMPLE_VIDEO_URL}
              events={timelineData?.events || []}
              eegId={videoAsset?.eeg_asset_id ?? undefined}
              fps={videoAsset?.fps ? Number(videoAsset.fps) : undefined}
            />

            <div className="card p-4">
              <h3 className="text-sm font-semibold text-slate-800 mb-3">Timeline de microações</h3>
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
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">Eventos detectados</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {events.length} eventos · ordenados por tempo de início
            </p>
          </div>
          <DataTable
            columns={EVENT_COLUMNS}
            data={events}
          />
        </div>

        <div className="flex items-start gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
          <Info size={14} className="text-slate-400 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-500 leading-relaxed">
            <strong className="text-slate-600 font-semibold">Interpretação científica:</strong>{' '}
            Os resultados descrevem padrões temporais de eventos faciais observados no vídeo — não
            constituem diagnóstico nem inferência automática de estados cognitivos. A associação com
            outras modalidades (por exemplo, EEG) não implica causalidade e depende do protocolo, dos
            parâmetros e da validação estatística conduzida pelo pesquisador.
          </p>
        </div>
      </div>
    </div>
  );
}

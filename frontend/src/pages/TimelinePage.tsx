import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { MultimodalPlayer } from '@/features/inference/components/MultimodalPlayer';
import { MicroActionTimeline } from '@/components/charts/MicroActionTimeline';
import { usePlaybackStore } from '@/features/playback/usePlaybackStore';
import {
  useVideoDetails,
  useVideoTimeline,
  useVideoPlaybackUrl,
} from '@/features/videos/useVideos';
import { getMicroActionConfig } from '@/lib/utils';
import type { MicroAction } from '@/types/domain';
import type { TimelineEventDTO } from '@/features/videos/types';
import { Crosshair } from 'lucide-react';

const SAMPLE_VIDEO_URL = 'https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
const ACTIONS: MicroAction[] = ['OLHO_FECHADO', 'OLHANDO_CANTO', 'MEXEU_LABIOS', 'VIROU_ROSTO'];

function formatClock(ms: number): string {
  const totalSec = Math.max(0, ms) / 1000;
  const mins = Math.floor(totalSec / 60);
  const secs = Math.floor(totalSec % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function TimelinePage() {
  const { videoId } = useParams<{ videoId: string }>();
  const { data: videoAsset } = useVideoDetails(videoId!);
  const { data: timelineData } = useVideoTimeline(videoId!);
  const { data: playback } = useVideoPlaybackUrl(videoId!);
  const requestSeek = usePlaybackStore((s) => s.requestSeek);
  const currentTimeMs = usePlaybackStore((s) => s.currentTimeMs);

  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set(ACTIONS));
  const [minConfidence, setMinConfidence] = useState(0);

  const rawEvents = useMemo<TimelineEventDTO[]>(
    () => timelineData?.events ?? [],
    [timelineData?.events],
  );

  // Apply the filters once; both the timeline overlay and the list use the result.
  const filteredEvents = useMemo(
    () =>
      rawEvents.filter(
        (ev) => activeFilters.has(ev.action) && ev.confidence_mean >= minConfidence,
      ),
    [rawEvents, activeFilters, minConfidence],
  );

  const timelineEvents = useMemo(
    () =>
      filteredEvents.map((ev) => ({
        id: ev.event_id,
        microAction: ev.action,
        startMs: ev.start_time * 1000,
        endMs: ev.end_time * 1000,
        confidence: ev.confidence_mean,
      })),
    [filteredEvents],
  );

  const durationMs =
    (videoAsset?.duration_seconds
      ? Number(videoAsset.duration_seconds)
      : timelineData?.duration_seconds || 120) * 1000;

  const toggleFilter = (action: string) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(action)) next.delete(action);
      else next.add(action);
      return next;
    });
  };

  return (
    <div className="min-h-full flex flex-col">
      <PageHeader
        title="Timeline de Microações"
        description="Microações faciais sincronizadas com o vídeo e o EEG."
      />

      <div className="p-6 space-y-5">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {/* Player + synchronized timeline */}
          <div className="xl:col-span-2 space-y-4">
            <MultimodalPlayer
              videoUrl={playback?.url || SAMPLE_VIDEO_URL}
              events={filteredEvents}
              eegId={videoAsset?.eeg_asset_id ?? undefined}
              fps={videoAsset?.fps ? Number(videoAsset.fps) : undefined}
            />

            <div className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <h3 className="text-sm font-semibold text-slate-800">Trilhas sincronizadas</h3>

                {/* Action filters */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {ACTIONS.map((action) => {
                    const cfg = getMicroActionConfig(action);
                    const on = activeFilters.has(action);
                    return (
                      <button
                        key={action}
                        onClick={() => toggleFilter(action)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border transition-colors"
                        style={{
                          borderColor: cfg.color,
                          backgroundColor: on ? cfg.color : 'transparent',
                          color: on ? '#fff' : cfg.color,
                        }}
                      >
                        <span
                          className="inline-block w-2 h-2 rounded-sm"
                          style={{ backgroundColor: on ? '#fff' : cfg.color }}
                        />
                        {cfg.shortLabel}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Confidence filter */}
              <div className="flex items-center gap-3 mb-4 text-xs text-slate-500">
                <span className="shrink-0">Confiança mínima</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={minConfidence}
                  onChange={(e) => setMinConfidence(Number(e.target.value))}
                  className="flex-1 h-1.5 accent-blue-500 cursor-pointer"
                />
                <span className="tabular-nums font-medium text-slate-600 w-10 text-right">
                  {(minConfidence * 100).toFixed(0)}%
                </span>
              </div>

              <MicroActionTimeline events={timelineEvents} videoDurationMs={durationMs} />
            </div>
          </div>

          {/* Event list with jump-to-event */}
          <div className="card overflow-hidden self-start">
            <div className="px-4 py-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-800">
                Eventos ({filteredEvents.length})
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Clique para saltar no vídeo</p>
            </div>
            <div className="max-h-[32rem] overflow-y-auto divide-y divide-slate-50">
              {filteredEvents.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-slate-400">
                  Nenhum evento com os filtros atuais.
                </p>
              )}
              {filteredEvents
                .slice()
                .sort((a, b) => a.start_time - b.start_time)
                .map((ev) => {
                  const cfg = getMicroActionConfig(ev.action as MicroAction);
                  const startMs = ev.start_time * 1000;
                  const active = currentTimeMs >= startMs && currentTimeMs <= ev.end_time * 1000;
                  return (
                    <button
                      key={ev.event_id}
                      onClick={() => requestSeek(startMs)}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 transition-colors ${
                        active ? 'bg-blue-50/60' : ''
                      }`}
                    >
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: cfg.color }}
                      />
                      <span className="flex-1 min-w-0">
                        <span className="block text-xs font-medium text-slate-700 truncate">
                          {cfg.label}
                        </span>
                        <span className="block text-[11px] text-slate-400 font-mono">
                          {formatClock(startMs)} – {formatClock(ev.end_time * 1000)}
                        </span>
                      </span>
                      <span className="text-[11px] font-semibold text-slate-500 tabular-nums">
                        {(ev.confidence_mean * 100).toFixed(0)}%
                      </span>
                      {active && <Crosshair size={13} className="text-blue-500 shrink-0" />}
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

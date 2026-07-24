import { useRef } from 'react';
import { usePlaybackStore } from '@/features/playback/usePlaybackStore';
import { getMicroActionConfig } from '@/lib/utils';
import type { MicroAction } from '@/types/domain';

interface TimelineEvent {
  id: string;
  microAction: string;
  startMs: number;
  endMs: number;
  confidence: number;
}

interface MicroActionTimelineProps {
  events: TimelineEvent[];
  videoDurationMs: number;
}

// Tracks shown even when empty, so the layout is stable across videos.
const ACTIONS: MicroAction[] = ['OLHO_FECHADO', 'OLHANDO_CANTO', 'MEXEU_LABIOS', 'VIROU_ROSTO', 'MEXEU_SOBRANCELHA'];

function formatClock(ms: number): string {
  const totalSec = Math.max(0, ms) / 1000;
  const mins = Math.floor(totalSec / 60);
  const secs = Math.floor(totalSec % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function MicroActionTimeline({ events, videoDurationMs }: MicroActionTimelineProps) {
  const laneRef = useRef<HTMLDivElement>(null);
  const currentTimeMs = usePlaybackStore((s) => s.currentTimeMs);
  const requestSeek = usePlaybackStore((s) => s.requestSeek);

  const duration = videoDurationMs || 1;
  const playheadPct = Math.min(100, Math.max(0, (currentTimeMs / duration) * 100));

  // Click anywhere on a lane seeks the shared clock to that time.
  const seekFromClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = laneRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const ratio = (e.clientX - rect.left) / rect.width;
    requestSeek(Math.min(1, Math.max(0, ratio)) * duration);
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between text-xs text-muted-foreground font-medium border-b pb-2">
        <span>00:00</span>
        <span className="tabular-nums text-slate-600">
          {formatClock(currentTimeMs)} / {formatClock(videoDurationMs)}
        </span>
      </div>

      {/* The lanes container carries the shared playhead across all tracks */}
      <div ref={laneRef} className="relative space-y-2 py-1" onClick={seekFromClick}>
        {ACTIONS.map((action) => {
          const cfg = getMicroActionConfig(action);
          const actionEvents = events.filter((e) => e.microAction === action);
          return (
            <div key={action} className="relative flex items-center gap-2">
              <span className="w-24 shrink-0 text-right text-[11px] font-medium text-muted-foreground truncate hidden md:block">
                {cfg.label}
              </span>
              <div className="relative h-6 flex-1 rounded-md bg-muted/50 overflow-hidden">
                {actionEvents.map((evt) => {
                  const left = (evt.startMs / duration) * 100;
                  const width = ((evt.endMs - evt.startMs) / duration) * 100;
                  const active = currentTimeMs >= evt.startMs && currentTimeMs <= evt.endMs;
                  return (
                    <div
                      key={evt.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        requestSeek(evt.startMs);
                      }}
                      className="absolute top-0 h-full rounded-sm cursor-pointer transition-all hover:brightness-110"
                      style={{
                        left: `${left}%`,
                        width: `${Math.max(width, 0.5)}%`,
                        backgroundColor: cfg.color,
                        opacity: active ? 1 : 0.7,
                        outline: active ? `2px solid ${cfg.color}` : 'none',
                        outlineOffset: '1px',
                      }}
                      title={`${cfg.label} · ${formatClock(evt.startMs)}–${formatClock(evt.endMs)} · conf. ${(evt.confidence * 100).toFixed(0)}%`}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Live playhead spanning every lane (offset to clear the labels) */}
        <div
          className="pointer-events-none absolute top-0 bottom-0 md:left-[calc(6rem+0.5rem)] left-0 right-0"
          aria-hidden
        >
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-slate-800 shadow-[0_0_0_1px_rgba(255,255,255,0.6)]"
            style={{ left: `${playheadPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

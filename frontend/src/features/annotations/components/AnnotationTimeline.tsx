import { useMemo, useRef } from 'react';
import { useAnnotationStore } from '../store/useAnnotationStore';
import type { AnnotationEvent } from '@/types/annotation';

export function AnnotationTimeline() {
  const { events, duration, currentTime, draft, setCurrentTime } = useAnnotationStore();
  const timelineRef = useRef<HTMLDivElement>(null);

  const tracks = useMemo(() => {
    const trackMap = new Map<string, AnnotationEvent[]>();
    events.forEach(event => {
      if (!trackMap.has(event.microActionType)) {
        trackMap.set(event.microActionType, []);
      }
      trackMap.get(event.microActionType)!.push(event);
    });

    // Add draft track if it exists and isn't in events yet
    if (draft && !trackMap.has(draft.microActionType)) {
      trackMap.set(draft.microActionType, []);
    }

    return Array.from(trackMap.entries()).map(([type, typeEvents]) => ({
      microActionType: type,
      events: typeEvents
    }));
  }, [events, draft]);

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current || duration === 0) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    setCurrentTime(percentage * duration);
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    const ms = Math.floor((time % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  // Color map for different micro-actions
  const getColor = (type: string) => {
    const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500', 'bg-pink-500', 'bg-teal-500'];
    let hash = 0;
    for (let i = 0; i < type.length; i++) {
      hash = type.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <div className="h-48 bg-slate-900 border-t border-slate-800 flex flex-col select-none">
      {/* Time Header */}
      <div className="h-8 border-b border-slate-800 flex items-center justify-between px-4 text-xs font-mono text-slate-400 bg-slate-950">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>

      {/* Tracks Container */}
      <div className="flex-1 overflow-y-auto relative p-2 space-y-1">
        {tracks.map(track => (
          <div key={track.microActionType} className="flex items-center h-8 gap-4 group">
            {/* Track Label */}
            <div className="w-32 text-xs text-slate-400 truncate group-hover:text-slate-200 transition-colors">
              {track.microActionType}
            </div>
            
            {/* Track Timeline Area */}
            <div 
              ref={timelineRef}
              className="flex-1 h-full bg-slate-800/50 rounded-sm relative cursor-pointer hover:bg-slate-800 transition-colors"
              onClick={handleTimelineClick}
            >
              {/* Render Saved Events */}
              {track.events.map(event => {
                const left = duration > 0 ? (event.startTime / duration) * 100 : 0;
                const width = duration > 0 ? ((event.endTime - event.startTime) / duration) * 100 : 0;
                return (
                  <div 
                    key={event.id}
                    className={`absolute top-1 bottom-1 rounded-sm opacity-80 hover:opacity-100 transition-opacity ${getColor(track.microActionType)}`}
                    style={{ left: `${left}%`, width: `${Math.max(width, 0.5)}%` }}
                    title={`${track.microActionType}: ${formatTime(event.startTime)} - ${formatTime(event.endTime)}`}
                  />
                );
              })}

              {/* Render Active Draft */}
              {draft && draft.microActionType === track.microActionType && (
                <div 
                  className={`absolute top-1 bottom-1 rounded-sm opacity-50 animate-pulse bg-red-500`}
                  style={{ 
                    left: `${duration > 0 ? (draft.startTime / duration) * 100 : 0}%`, 
                    width: `${duration > 0 ? ((currentTime - draft.startTime) / duration) * 100 : 0}%` 
                  }}
                />
              )}

              {/* Playhead Indicator (renders on every track for visual alignment) */}
              <div 
                className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)] z-10 pointer-events-none"
                style={{ left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
              />
            </div>
          </div>
        ))}

        {tracks.length === 0 && !draft && (
          <div className="h-full flex items-center justify-center text-sm text-slate-500 italic">
            Nenhuma anotação. Use os atalhos 1-9 para iniciar.
          </div>
        )}
      </div>
    </div>
  );
}

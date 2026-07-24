import { useState } from 'react';
import { Trash2, Play, Sparkles } from 'lucide-react';
import { useAnnotationStore } from '../store/useAnnotationStore';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { Button } from '@/components/ui/Button';
import { CorrectionModal } from './CorrectionModal';
import type { AnnotationEvent } from '@/types/annotation';
import { usePlaybackStore } from '@/features/playback/usePlaybackStore';

export function AnnotationSidebarList() {
  const { events, deleteEvent } = useAnnotationStore();
  const requestSeek = usePlaybackStore((state) => state.requestSeek);
  const [correctionEvent, setCorrectionEvent] = useState<AnnotationEvent | null>(null);

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    const ms = Math.floor((time % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const sortedEvents = [...events].sort((a, b) => a.startTime - b.startTime);

  return (
    <div className="w-80 border-l border-slate-800 bg-slate-950 flex flex-col h-full">
      <div className="h-14 border-b border-slate-800 flex items-center px-4 shrink-0">
        <h2 className="font-semibold text-slate-200">Anotações ({events.length})</h2>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-2">
          {sortedEvents.length === 0 ? (
            <p className="text-sm text-slate-500 text-center p-4 italic">
              A lista está vazia.
            </p>
          ) : (
            sortedEvents.map((event) => (
              <div 
                key={event.id}
                data-testid="annotation-event"
                className="group p-3 rounded-lg border border-slate-800 bg-slate-900 hover:border-slate-700 hover:bg-slate-800/50 transition-colors"
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="font-medium text-sm text-slate-200">
                    {event.actionLabel}
                  </span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6 text-slate-400 hover:text-blue-400 hover:bg-blue-400/10"
                      onClick={() => requestSeek(event.startTime * 1000)}
                      title="Ir para o tempo"
                    >
                      <Play className="h-3 w-3" />
                    </Button>
                    {event.confidence !== null && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6 text-slate-400 hover:text-violet-400 hover:bg-violet-400/10"
                        onClick={() => setCorrectionEvent(event)}
                        title="Corrigir predição"
                      >
                        <Sparkles className="h-3 w-3" />
                      </Button>
                    )}
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6 text-slate-400 hover:text-red-400 hover:bg-red-400/10"
                      onClick={() => deleteEvent(event.videoId, event.id)}
                      title="Excluir"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div className="flex justify-between text-xs text-slate-500 font-mono bg-slate-950/50 p-1.5 rounded">
                  <span>{formatTime(event.startTime)}</span>
                  <span>{formatTime(event.endTime)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
      <CorrectionModal
        event={correctionEvent}
        isOpen={correctionEvent !== null}
        onClose={() => setCorrectionEvent(null)}
      />
    </div>
  );
}

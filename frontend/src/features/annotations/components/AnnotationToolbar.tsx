import { Play, Pause, SkipBack, SkipForward } from 'lucide-react';
import { useAnnotationStore } from '../store/useAnnotationStore';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

export function AnnotationToolbar() {
  const { isPlaying, setIsPlaying, playbackRate, setPlaybackRate, draft } = useAnnotationStore();

  const togglePlay = () => setIsPlaying(!isPlaying);

  const rates = [0.25, 0.5, 1, 2];
  const cycleRate = () => {
    const currentIndex = rates.indexOf(playbackRate);
    const nextIndex = (currentIndex + 1) % rates.length;
    setPlaybackRate(rates[nextIndex]);
  };

  return (
    <div className="flex items-center justify-between w-full">
      {/* Playback Controls */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" className="h-9 w-9 border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white" disabled>
          <SkipBack className="h-4 w-4" />
        </Button>
        <Button 
          variant="outline" 
          size="icon" 
          onClick={togglePlay}
          className="h-10 w-10 border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
        >
          {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </Button>
        <Button variant="outline" size="icon" className="h-9 w-9 border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white" disabled>
          <SkipForward className="h-4 w-4" />
        </Button>
        
        <div className="w-px h-6 bg-slate-800 mx-2" />
        
        <Button 
          variant="outline" 
          size="sm" 
          onClick={cycleRate}
          className="font-mono border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white w-16"
        >
          {playbackRate}x
        </Button>
      </div>

      {/* Shortcuts Hint */}
      <div className="flex items-center gap-4 text-xs text-slate-400">
        <div className="flex items-center gap-1.5">
          <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded-md font-mono text-slate-300">Space</kbd>
          <span>Play/Pause</span>
        </div>
        <div className="flex items-center gap-1.5">
          <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded-md font-mono text-slate-300">{"< >"}</kbd>
          <span>Frames</span>
        </div>
        <div className="flex items-center gap-1.5">
          <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded-md font-mono text-slate-300">1-9</kbd>
          <span>Marcar Evento</span>
        </div>
        <div className="flex items-center gap-1.5">
          <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded-md font-mono text-slate-300">Enter</kbd>
          <span>Salvar</span>
        </div>
        <div className="flex items-center gap-1.5">
          <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded-md font-mono text-slate-300">Esc</kbd>
          <span>Cancelar</span>
        </div>
      </div>

      {/* Current Status */}
      <div className="w-[150px] flex justify-end">
        {draft ? (
          <Badge variant="destructive" className="animate-pulse">Gravando...</Badge>
        ) : (
          <Badge variant="secondary" className="bg-slate-800 text-slate-400">Aguardando</Badge>
        )}
      </div>
    </div>
  );
}

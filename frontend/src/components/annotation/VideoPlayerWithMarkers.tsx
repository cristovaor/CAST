import { useEffect, useRef, useState } from "react";
import { Play, Pause, SkipBack, SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";

interface VideoPlayerWithMarkersProps {
  src: string;
  fps: number;
  onFrameChange: (frame: number, timeMs: number) => void;
  markers: { id: string; startFrame: number; endFrame: number; color: string }[];
  currentFrame: number;
}

export function VideoPlayerWithMarkers({ src, fps, onFrameChange, markers, currentFrame }: VideoPlayerWithMarkersProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const callbackId = useRef<number>(0);

  // Fallback for FPS
  const frameDuration = 1 / fps;

  // Utilize requestVideoFrameCallback for exact frame tracking
  const updateFrame = (_now: number, metadata: VideoFrameCallbackMetadata) => {
    if (!videoRef.current) return;
    
    // Some browsers provide mediaTime, others we fallback to currentTime
    const timeInSeconds = (metadata.mediaTime as number) ?? videoRef.current.currentTime;
    // Calculate precise frame based on time and FPS
    const frame = Math.round(timeInSeconds * fps);
    
    onFrameChange(frame, timeInSeconds * 1000);
    
    if (isPlaying) {
      if (videoRef.current.requestVideoFrameCallback) {
        callbackId.current = videoRef.current.requestVideoFrameCallback(updateFrame);
      }
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Start RVFC loop
    if (isPlaying) {
      if (video.requestVideoFrameCallback) {
        callbackId.current = video.requestVideoFrameCallback(updateFrame);
      }
    } else {
      // For pauses, fire once to sync exactly
      if (video.requestVideoFrameCallback) {
        video.requestVideoFrameCallback(updateFrame);
      } else {
        // Fallback for browsers without RVFC
        const timeInSeconds = video.currentTime;
        onFrameChange(Math.round(timeInSeconds * fps), timeInSeconds * 1000);
      }
    }

    return () => {
      if (video.cancelVideoFrameCallback && callbackId.current) {
        video.cancelVideoFrameCallback(callbackId.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, fps]);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const stepFrame = (forward: boolean) => {
    if (videoRef.current) {
      if (isPlaying) togglePlay(); // Auto-pause on manual step
      const step = forward ? frameDuration : -frameDuration;
      videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime + step);
      // RVFC will catch the updated frame when it renders
    }
  };

  // Expose methods to window for global keyboard shortcuts from Toolbar
  useEffect(() => {
    const handleGlobalCommand = (e: CustomEvent) => {
      const command = e.detail;
      if (command === "playpause") togglePlay();
      if (command === "next_frame") stepFrame(true);
      if (command === "prev_frame") stepFrame(false);
    };
    window.addEventListener("video_command" as keyof WindowEventMap, handleGlobalCommand as EventListener);
    return () => window.removeEventListener("video_command" as keyof WindowEventMap, handleGlobalCommand as EventListener);
  });

  return (
    <div className="flex flex-col gap-2">
      <div className="relative rounded-lg overflow-hidden border bg-black shadow-inner aspect-video flex items-center justify-center">
        <video 
          ref={videoRef} 
          src={src} 
          className="w-full max-h-[60vh] object-contain"
          onEnded={() => setIsPlaying(false)}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />
        
        {/* Playhead Overlay Text */}
        <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-sm text-white px-3 py-1.5 rounded-md text-sm font-mono flex gap-4">
          <span>Frame: <span className="text-emerald-400 font-bold">{currentFrame}</span></span>
          <span>FPS: {fps}</span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-4 bg-muted/50 p-2 rounded-lg border">
        <button type="button" onClick={() => stepFrame(false)} aria-label="Frame anterior" className="p-2 hover:bg-muted rounded-md transition-colors" title="Frame Anterior (←)">
          <SkipBack className="h-5 w-5" />
        </button>
        <button type="button" onClick={togglePlay} aria-label={isPlaying ? 'Pausar' : 'Reproduzir'} className="p-3 bg-primary text-primary-foreground hover:bg-primary/90 rounded-full transition-colors shadow-sm" title="Play/Pause (Espaço)">
          {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-0.5" />}
        </button>
        <button type="button" onClick={() => stepFrame(true)} aria-label="Próximo frame" className="p-2 hover:bg-muted rounded-md transition-colors" title="Próximo Frame (→)">
          <SkipForward className="h-5 w-5" />
        </button>
      </div>

      {/* Scrubber / Marker Régua */}
      <div className="relative h-4 mt-2 bg-muted rounded-full overflow-hidden border cursor-pointer">
        {/* Here we would ideally know total frames, for MVP we assume a dummy total or base it on video duration */}
        {/* We will mock a 6000 frame video for the scrubber visual */}
        {markers.map(m => {
          const totalFrames = 6000; 
          const left = (m.startFrame / totalFrames) * 100;
          const width = ((m.endFrame - m.startFrame) / totalFrames) * 100;
          return (
             <div 
               key={m.id} 
               className={cn("absolute h-full opacity-80 hover:opacity-100 transition-opacity", m.color)}
               style={{ left: `${left}%`, width: `${Math.max(width, 0.2)}%` }}
             />
          );
        })}
        {/* Playhead */}
        <div 
          className="absolute top-0 bottom-0 w-1 bg-red-500 shadow-sm z-10" 
          style={{ left: `${(currentFrame / 6000) * 100}%` }}
        />
      </div>
    </div>
  );
}

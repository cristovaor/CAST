import { useRef, useEffect } from 'react';
import { useAnnotationStore } from '../store/useAnnotationStore';

interface VideoAnnotatorPlayerProps {
  videoUrl: string;
}

export function VideoAnnotatorPlayer({ videoUrl }: VideoAnnotatorPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { 
    setCurrentTime, 
    setDuration, 
    setIsPlaying, 
    playbackRate, 
    isPlaying,
    draft 
  } = useAnnotationStore();

  useEffect(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.play().catch(console.error);
      } else {
        videoRef.current.pause();
      }
    }
  }, [isPlaying]);

  useEffect(() => {
    if (videoRef.current && videoRef.current.playbackRate !== playbackRate) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleDurationChange = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handlePlay = () => setIsPlaying(true);
  const handlePause = () => setIsPlaying(false);

  return (
    <div className="relative w-full max-w-5xl aspect-video bg-black rounded-lg overflow-hidden border border-slate-800 shadow-2xl flex items-center justify-center">
      {videoUrl ? (
        <video
          ref={videoRef}
          src={videoUrl}
          className="w-full h-full object-contain"
          onTimeUpdate={handleTimeUpdate}
          onDurationChange={handleDurationChange}
          onPlay={handlePlay}
          onPause={handlePause}
          controls={false}
          autoPlay={false}
        />
      ) : (
        <div className="text-slate-500 flex flex-col items-center">
          <svg className="w-16 h-16 mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <p>Nenhum vídeo selecionado</p>
        </div>
      )}

      {/* Draft Overlay Indicator */}
      {draft && (
        <div className="absolute top-4 right-4 bg-red-600 text-white px-3 py-1.5 rounded-full text-sm font-semibold flex items-center gap-2 animate-pulse shadow-lg">
          <div className="w-2 h-2 bg-white rounded-full"></div>
          Gravando: {draft.microActionType}
        </div>
      )}
    </div>
  );
}

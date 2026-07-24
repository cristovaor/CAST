import { useRef, useState, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize2, SkipBack, SkipForward } from 'lucide-react';
import { VideoCanvasOverlay } from './VideoCanvasOverlay';
import { EEGChart } from '@/features/eeg/EEGChart';
import { EEGSyncControl } from '@/features/eeg/components/EEGSyncControl';
import { usePlaybackStore } from '@/features/playback/usePlaybackStore';
import type { TimelineEventDTO } from '@/features/videos/types';

interface MultimodalPlayerProps {
  videoUrl: string;
  events: TimelineEventDTO[];
  eegId?: string;
  fps?: number;
}

export function MultimodalPlayer({ videoUrl, events, eegId, fps }: MultimodalPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentTimeMs = usePlaybackStore((s) => s.currentTimeMs);
  const durationMs = usePlaybackStore((s) => s.durationMs);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const seekRequest = usePlaybackStore((s) => s.seekRequest);
  const setCurrentTimeMs = usePlaybackStore((s) => s.setCurrentTimeMs);
  const setDurationMs = usePlaybackStore((s) => s.setDurationMs);
  const setIsPlaying = usePlaybackStore((s) => s.setIsPlaying);
  const setFps = usePlaybackStore((s) => s.setFps);
  const clearSeekRequest = usePlaybackStore((s) => s.clearSeekRequest);
  const requestSeek = usePlaybackStore((s) => s.requestSeek);
  const reset = usePlaybackStore((s) => s.reset);

  const [isMuted, setIsMuted] = useState(true); // Default muted to allow autoplay/easy dev
  const [isFullscreen, setIsFullscreen] = useState(false);

  const effectiveFps = fps || 30;

  // Mirror the <video> element (single source of truth) into the store
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => setCurrentTimeMs(video.currentTime * 1000);
    const handleLoadedMetadata = () => setDurationMs(video.duration * 1000);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('seeked', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('seeked', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, [videoUrl, setCurrentTimeMs, setDurationMs, setIsPlaying]);

  useEffect(() => {
    setFps(effectiveFps);
  }, [effectiveFps, setFps]);

  // Reset the shared clock when leaving the player / switching videos
  useEffect(() => {
    return () => reset();
  }, [videoUrl, reset]);

  // Apply seek requests (from the EEG chart, the slider or frame stepping)
  useEffect(() => {
    if (!seekRequest) return;
    const video = videoRef.current;
    if (video) {
      const clampedMs = Math.min(Math.max(seekRequest.timeMs, 0), durationMs || Infinity);
      video.currentTime = clampedMs / 1000;
      setCurrentTimeMs(clampedMs);
    }
    clearSeekRequest();
  }, [seekRequest, durationMs, setCurrentTimeMs, clearSeekRequest]);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) videoRef.current.pause();
      else videoRef.current.play();
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    requestSeek(Number(e.target.value) * 1000);
  };

  const stepFrame = (direction: 1 | -1) => {
    videoRef.current?.pause();
    requestSeek(currentTimeMs + direction * (1000 / effectiveFps));
  };

  const formatTime = (timeMs: number) => {
    const time = timeMs / 1000;
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col bg-slate-950 rounded-xl overflow-hidden shadow-2xl border border-slate-800 transition-all ${
        isFullscreen ? 'h-screen w-screen rounded-none border-none' : 'w-full'
      }`}
    >
      {/* Video Container */}
      <div className="relative flex-grow flex items-center justify-center bg-black">
        <video
          ref={videoRef}
          src={videoUrl}
          className="max-h-full max-w-full"
          muted={isMuted}
          playsInline
        />

        {/* Canvas Overlay for Bounding Boxes */}
        <VideoCanvasOverlay videoRef={videoRef} events={events} />

        {/* Big Play Button Overlay */}
        {!isPlaying && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm cursor-pointer"
            onClick={togglePlay}
          >
            <div className="w-20 h-20 rounded-full bg-blue-600/80 flex items-center justify-center text-white shadow-lg hover:bg-blue-500 transition-colors">
              <Play fill="currentColor" size={32} className="ml-2" />
            </div>
          </div>
        )}
      </div>

      {/* Synchronized EEG Chart (click a point to seek the video) */}
      <div className="px-4 pt-2 pb-0 bg-slate-950 border-t border-slate-800">
        <EEGChart eegId={eegId} events={events} variant="embedded" />
      </div>

      {/* Controls Bar */}
      <div className="bg-slate-950 px-4 py-3 flex flex-col gap-2">
        <input
          type="range"
          min="0"
          max={durationMs / 1000 || 100}
          step="any"
          value={currentTimeMs / 1000}
          onChange={handleSeek}
          className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400"
        />
        <div className="flex items-center justify-between text-slate-300">
          <div className="flex items-center gap-4">
            <button
              onClick={() => stepFrame(-1)}
              className="hover:text-white transition-colors"
              title={`Frame anterior (1/${effectiveFps}s)`}
            >
              <SkipBack size={18} />
            </button>
            <button onClick={togglePlay} className="hover:text-white transition-colors">
              {isPlaying ? <Pause size={20} /> : <Play size={20} />}
            </button>
            <button
              onClick={() => stepFrame(1)}
              className="hover:text-white transition-colors"
              title={`Próximo frame (1/${effectiveFps}s)`}
            >
              <SkipForward size={18} />
            </button>
            <button onClick={toggleMute} className="hover:text-white transition-colors">
              {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
            <div className="text-sm font-mono opacity-80">
              {formatTime(currentTimeMs)} / {formatTime(durationMs)}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <EEGSyncControl eegId={eegId} />
            <button onClick={toggleFullscreen} className="hover:text-white transition-colors">
              <Maximize2 size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

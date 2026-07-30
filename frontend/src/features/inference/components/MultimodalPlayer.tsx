import { useRef, useState, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize2, SkipBack, SkipForward, Scan } from 'lucide-react';
import { LandmarkOverlay } from '@/features/annotations/components/LandmarkOverlay';
import { EEGChart } from '@/features/eeg/EEGChart';
import { EEGSyncControl } from '@/features/eeg/components/EEGSyncControl';
import { usePlaybackStore } from '@/features/playback/usePlaybackStore';
import type { TimelineEventDTO } from '@/features/videos/types';

type LandmarkOverlayMode = 'off' | 'roi' | 'mesh';

interface MultimodalPlayerProps {
  videoUrl: string;
  events: TimelineEventDTO[];
  eegId?: string;
  fps?: number;
  /** Video asset id — required to fetch MediaPipe landmark chunks. */
  videoId?: string;
  /** Present once landmark extraction finished; enables the mesh/ROI toggle. */
  landmarkArtifactId?: string;
  landmarkChunkSizeFrames?: number;
}

export function MultimodalPlayer({
  videoUrl,
  events,
  eegId,
  fps,
  videoId,
  landmarkArtifactId,
  landmarkChunkSizeFrames,
}: MultimodalPlayerProps) {
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
  const [landmarkMode, setLandmarkMode] = useState<LandmarkOverlayMode>('off');

  const effectiveFps = fps || 30;
  const canShowLandmarks = Boolean(videoId && landmarkArtifactId);

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

        {/* Action-aware facial contours plus optional MediaPipe dots/mesh. */}
        {canShowLandmarks && videoId && (
          <LandmarkOverlay
            videoId={videoId}
            videoRef={videoRef}
            artifactId={landmarkArtifactId}
            chunkSizeFrames={landmarkChunkSizeFrames ?? Math.max(1, Math.round(effectiveFps))}
            mode={landmarkMode}
            pointSize={2}
            opacity={0.85}
            events={events}
          />
        )}

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
        <div className="flex items-center justify-between text-text-disabled">
          <div className="flex items-center gap-4">
            <button
              onClick={() => stepFrame(-1)}
              className="hover:text-white transition-colors"
              title={`Frame anterior (1/${effectiveFps}s)`}
            >
              <SkipBack size={18} />
            </button>
            <button type="button" onClick={togglePlay} aria-label={isPlaying ? 'Pausar' : 'Reproduzir'} className="hover:text-white transition-colors">
              {isPlaying ? <Pause size={20} /> : <Play size={20} />}
            </button>
            <button
              onClick={() => stepFrame(1)}
              aria-label="Próximo frame"
              className="hover:text-white transition-colors"
              title={`Próximo frame (1/${effectiveFps}s)`}
            >
              <SkipForward size={18} />
            </button>
            <button type="button" onClick={toggleMute} aria-label={isMuted ? 'Ativar som' : 'Silenciar'} className="hover:text-white transition-colors">
              {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
            <div className="text-sm font-mono opacity-80">
              {formatTime(currentTimeMs)} / {formatTime(durationMs)}
            </div>
          </div>
          <div className="flex items-center gap-4">
            {canShowLandmarks && (
              <div className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 p-1">
                <Scan size={13} className="ml-1 text-text-muted" />
                {(['off', 'roi', 'mesh'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setLandmarkMode(mode)}
                    className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                      landmarkMode === mode
                        ? 'bg-blue-600 text-white'
                        : 'text-text-muted hover:text-slate-200'
                    }`}
                    title={mode === 'off' ? 'Landmarks desligados' : mode === 'roi' ? 'Pontos de interesse' : 'Malha completa'}
                  >
                    {mode === 'off' ? 'Off' : mode === 'roi' ? 'ROI' : 'Malha'}
                  </button>
                ))}
              </div>
            )}
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

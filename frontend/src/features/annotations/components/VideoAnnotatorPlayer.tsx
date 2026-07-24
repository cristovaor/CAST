import { useEffect, useRef } from 'react';
import { useAnnotationStore } from '../store/useAnnotationStore';
import { usePlaybackStore } from '@/features/playback/usePlaybackStore';
import { LandmarkOverlay } from './LandmarkOverlay';

interface VideoAnnotatorPlayerProps {
  videoId: string;
  videoUrl: string;
  artifactId?: string;
  chunkSizeFrames: number;
  overlayMode: 'off' | 'roi' | 'mesh';
  overlayAction?: string;
  pointSize: number;
  opacity: number;
}

export function VideoAnnotatorPlayer({
  videoId,
  videoUrl,
  artifactId,
  chunkSizeFrames,
  overlayMode,
  overlayAction,
  pointSize,
  opacity,
}: VideoAnnotatorPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const draft = useAnnotationStore((state) => state.draft);
  const {
    isPlaying,
    playbackRate,
    seekRequest,
    setCurrentTimeMs,
    setDurationMs,
    setIsPlaying,
    clearSeekRequest,
  } = usePlaybackStore();

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) void video.play().catch(() => setIsPlaying(false));
    else video.pause();
  }, [isPlaying, setIsPlaying]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !seekRequest) return;
    video.currentTime = Math.max(
      0,
      Math.min(video.duration || Number.POSITIVE_INFINITY, seekRequest.timeMs / 1000),
    );
    setCurrentTimeMs(video.currentTime * 1000);
    clearSeekRequest();
  }, [clearSeekRequest, seekRequest, setCurrentTimeMs]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let callbackId = 0;
    const updateClock = () => {
      setCurrentTimeMs(video.currentTime * 1000);
      callbackId = video.requestVideoFrameCallback(updateClock);
    };
    if ('requestVideoFrameCallback' in video) {
      callbackId = video.requestVideoFrameCallback(updateClock);
      return () => video.cancelVideoFrameCallback(callbackId);
    }
    return undefined;
  }, [setCurrentTimeMs, videoUrl]);

  return (
    <div className="relative flex aspect-video w-full max-w-5xl items-center justify-center overflow-hidden rounded-lg border border-border bg-black shadow-2xl">
      {videoUrl ? (
        <>
          <video
            ref={videoRef}
            src={videoUrl}
            className="h-full w-full object-contain"
            onTimeUpdate={(event) =>
              setCurrentTimeMs(event.currentTarget.currentTime * 1000)
            }
            onDurationChange={(event) =>
              setDurationMs(event.currentTarget.duration * 1000)
            }
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            controls={false}
            preload="metadata"
          />
          <LandmarkOverlay
            videoId={videoId}
            videoRef={videoRef}
            artifactId={artifactId}
            chunkSizeFrames={chunkSizeFrames}
            mode={overlayMode}
            action={overlayAction}
            pointSize={pointSize}
            opacity={opacity}
          />
        </>
      ) : (
        <div className="text-sm text-text-muted">Vídeo indisponível</div>
      )}
      {draft && (
        <div className="absolute right-4 top-4 flex items-center gap-2 rounded-full bg-danger px-3 py-1.5 text-sm font-semibold text-white shadow-lg">
          <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
          Intervalo: {draft.actionLabel}
        </div>
      )}
    </div>
  );
}

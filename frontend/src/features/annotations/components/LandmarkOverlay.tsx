import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePlaybackStore } from '@/features/playback/usePlaybackStore';
import {
  prefetchLandmarkChunk,
  useLandmarkChunk,
} from '../api/useAnnotationEditor';

export interface ContainTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export function computeContainTransform(
  containerWidth: number,
  containerHeight: number,
  videoWidth: number,
  videoHeight: number,
): ContainTransform {
  if (!containerWidth || !containerHeight || !videoWidth || !videoHeight) {
    return { scale: 1, offsetX: 0, offsetY: 0 };
  }
  const scale = Math.min(
    containerWidth / videoWidth,
    containerHeight / videoHeight,
  );
  return {
    scale,
    offsetX: (containerWidth - videoWidth * scale) / 2,
    offsetY: (containerHeight - videoHeight * scale) / 2,
  };
}

interface LandmarkOverlayProps {
  videoId: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  artifactId?: string;
  chunkSizeFrames: number;
  mode: 'off' | 'roi' | 'mesh';
  action?: string;
  pointSize: number;
  opacity: number;
}

export function LandmarkOverlay({
  videoId,
  videoRef,
  artifactId,
  chunkSizeFrames,
  mode,
  action,
  pointSize,
  opacity,
}: LandmarkOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const currentTimeMs = usePlaybackStore((state) => state.currentTimeMs);
  const fps = usePlaybackStore((state) => state.fps);
  const frameIndex = Math.max(0, Math.round((currentTimeMs / 1000) * fps));
  const chunkIndex = Math.floor(frameIndex / Math.max(1, chunkSizeFrames));
  const queryClient = useQueryClient();
  const { data: chunk } = useLandmarkChunk(
    videoId,
    artifactId,
    chunkIndex,
    mode,
    action,
  );
  const [faceMissing, setFaceMissing] = useState(false);

  useEffect(() => {
    if (!artifactId || mode === 'off') return;
    const transportMode = mode === 'mesh' ? 'mesh' : 'roi';
    void prefetchLandmarkChunk(
      queryClient,
      videoId,
      artifactId,
      chunkIndex + 1,
      transportMode,
      action,
    );
  }, [action, artifactId, chunkIndex, mode, queryClient, videoId]);

  const draw = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const ratio = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    if (mode === 'off' || !chunk) {
      setFaceMissing(false);
      return;
    }

    const displayedFrame = Math.max(
      0,
      Math.round(video.currentTime * fps),
    );
    const frame =
      chunk.frames.find((candidate) => candidate.frameIndex === displayedFrame)
      ?? chunk.frames.reduce(
        (closest, candidate) =>
          Math.abs(candidate.frameIndex - displayedFrame)
            < Math.abs(closest.frameIndex - displayedFrame)
            ? candidate
            : closest,
        chunk.frames[0],
      );
    if (!frame) return;
    setFaceMissing(!frame.faceDetected);
    if (!frame.faceDetected) return;

    const transform = computeContainTransform(
      width,
      height,
      video.videoWidth,
      video.videoHeight,
    );
    context.fillStyle =
      mode === 'mesh'
        ? `rgba(167, 139, 250, ${opacity})`
        : `rgba(34, 211, 238, ${opacity})`;
    for (const [, x, y] of frame.points) {
      context.beginPath();
      context.arc(
        transform.offsetX + x * video.videoWidth * transform.scale,
        transform.offsetY + y * video.videoHeight * transform.scale,
        pointSize,
        0,
        Math.PI * 2,
      );
      context.fill();
    }
  }, [chunk, fps, mode, opacity, pointSize, videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let frameCallback = 0;
    let animationFrame = 0;
    const videoFrame = () => {
      draw();
      frameCallback = video.requestVideoFrameCallback(videoFrame);
    };
    const animation = () => {
      draw();
      animationFrame = requestAnimationFrame(animation);
    };
    if ('requestVideoFrameCallback' in video) {
      frameCallback = video.requestVideoFrameCallback(videoFrame);
    } else {
      animationFrame = requestAnimationFrame(animation);
    }
    draw();
    return () => {
      if (frameCallback) video.cancelVideoFrameCallback(frameCallback);
      if (animationFrame) cancelAnimationFrame(animationFrame);
    };
  }, [draw, videoRef]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-label="Landmarks faciais"
      />
      {faceMissing && mode !== 'off' && (
        <div className="absolute bottom-3 left-3 rounded-md border border-amber-400/30 bg-amber-950/85 px-2.5 py-1.5 text-xs text-amber-200">
          Face não detectada neste quadro
        </div>
      )}
    </>
  );
}

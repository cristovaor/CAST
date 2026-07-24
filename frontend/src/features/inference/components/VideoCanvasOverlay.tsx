import React, { useEffect, useRef } from 'react';
import type { TimelineEventDTO } from '@/features/videos/types';

interface VideoCanvasOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  events: TimelineEventDTO[];
}

export function VideoCanvasOverlay({ videoRef, events }: VideoCanvasOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    let animationFrameId: number;

    const drawOverlay = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Sync canvas size with video client size
      if (canvas.width !== video.clientWidth || canvas.height !== video.clientHeight) {
        canvas.width = video.clientWidth;
        canvas.height = video.clientHeight;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const currentTime = video.currentTime;

      // Find active events for current time
      const activeEvents = events.filter(
        (ev) => currentTime >= ev.start_time && currentTime <= ev.end_time
      );

      if (activeEvents.length > 0) {
        // Draw a simulated bounding box based on the active event
        // In a real scenario, the backend would send [x, y, w, h] of the bbox.
        // Since we only have time ranges in the MVP stub, we'll draw a simulated central box
        // or a status indicator overlay.
        
        ctx.strokeStyle = '#10b981'; // emerald-500
        ctx.lineWidth = 3;
        
        // Mock a bounding box in the center
        const boxWidth = canvas.width * 0.4;
        const boxHeight = canvas.height * 0.6;
        const x = (canvas.width - boxWidth) / 2;
        const y = (canvas.height - boxHeight) / 2;
        
        ctx.strokeRect(x, y, boxWidth, boxHeight);
        
        // Draw label
        ctx.fillStyle = '#10b981';
        ctx.fillRect(x, y - 30, boxWidth, 30);
        
        ctx.fillStyle = '#ffffff';
        ctx.font = '600 14px Inter, sans-serif';
        
        const label = `${activeEvents[0].action} ${(activeEvents[0].confidence_mean * 100).toFixed(1)}%`;
        ctx.fillText(label, x + 10, y - 10);
      }

      animationFrameId = requestAnimationFrame(drawOverlay);
    };

    video.addEventListener('play', () => {
      drawOverlay();
    });

    video.addEventListener('seeked', () => {
      drawOverlay();
    });

    if (!video.paused) {
      drawOverlay();
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
      video.removeEventListener('play', drawOverlay);
      video.removeEventListener('seeked', drawOverlay);
    };
  }, [videoRef, events]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute top-0 left-0 pointer-events-none"
      style={{ width: '100%', height: '100%' }}
    />
  );
}

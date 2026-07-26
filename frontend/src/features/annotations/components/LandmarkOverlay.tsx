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
import type { TimelineEventDTO } from '@/features/videos/types';
import {
  computeContainTransform,
  computeConvexHull,
  pointInPolygon,
  selectClosedEyeRegions,
  type CanvasPoint,
  type FacialRegion,
  type LandmarkOverlayMode,
} from './landmarkOverlayGeometry';
import type { AnnotationSide } from '@/types/annotation';

type PointMap = Map<number, { x: number; y: number }>;

const FACIAL_REGION_POINTS: Record<FacialRegion, readonly number[]> = {
  rightEyebrow: [46, 53, 52, 65, 55, 70, 63, 105, 66, 107],
  leftEyebrow: [276, 283, 282, 295, 285, 300, 293, 334, 296, 336],
  rightEye: [
    33, 7, 163, 144, 145, 153, 154, 155,
    133, 246, 161, 160, 159, 158, 157, 173,
  ],
  leftEye: [
    263, 249, 390, 373, 374, 380, 381, 382,
    362, 466, 388, 387, 386, 385, 384, 398,
  ],
  rightIris: [469, 470, 471, 472],
  leftIris: [474, 475, 476, 477],
  lips: [
    61, 146, 91, 181, 84, 17, 314, 405,
    321, 375, 291, 185, 40, 39, 37, 0,
    267, 269, 270, 409, 78, 95, 88, 178,
    87, 14, 317, 402, 318, 324, 308, 191,
    80, 81, 82, 13, 312, 311, 310, 415,
  ],
  face: [
    10, 338, 297, 332, 284, 251, 389, 356,
    454, 323, 361, 288, 397, 365, 379, 378,
    400, 377, 152, 148, 176, 149, 150, 136,
    172, 58, 132, 93, 234, 127, 162, 21,
    54, 103, 67, 109,
  ],
};

interface ActionOverlayStyle {
  label: string;
  color: string;
  regions: FacialRegion[];
}

export interface FacialRegionSelection {
  actionCode: string;
  region: FacialRegion;
  side: AnnotationSide;
}

interface HitRegion extends FacialRegionSelection {
  polygon: CanvasPoint[];
}

const CLICKABLE_REGIONS: Array<Omit<FacialRegionSelection, 'side'> & {
  side: AnnotationSide;
}> = [
  { actionCode: 'OC', region: 'rightIris', side: 'right' },
  { actionCode: 'OC', region: 'leftIris', side: 'left' },
  { actionCode: 'ML', region: 'lips', side: 'center' },
  { actionCode: 'MSO', region: 'rightEyebrow', side: 'right' },
  { actionCode: 'MSO', region: 'leftEyebrow', side: 'left' },
  { actionCode: 'OF', region: 'rightEye', side: 'right' },
  { actionCode: 'OF', region: 'leftEye', side: 'left' },
  { actionCode: 'VR', region: 'face', side: 'whole' },
];

const ACTION_OVERLAY_STYLES: Record<string, ActionOverlayStyle> = {
  OF: {
    label: 'Olhos fechados',
    color: '#22d3ee',
    regions: ['rightEye', 'leftEye'],
  },
  OC: {
    label: 'Olhar de canto',
    color: '#a78bfa',
    regions: ['rightIris', 'leftIris'],
  },
  ML: {
    label: 'Movimento dos lábios',
    color: '#fb923c',
    regions: ['lips'],
  },
  VR: {
    label: 'Movimento do rosto',
    color: '#34d399',
    regions: ['face'],
  },
  MSO: {
    label: 'Movimento das sobrancelhas',
    color: '#f472b6',
    regions: ['rightEyebrow', 'leftEyebrow'],
  },
};

const ACTION_ALIASES: Record<string, string> = {
  OLHO_FECHADO: 'OF',
  OLHOS_FECHADOS: 'OF',
  OLHANDO_DE_CANTO: 'OC',
  OLHANDO_PARA_CANTO: 'OC',
  MEXEU_LABIOS: 'ML',
  MOVEU_LABIOS: 'ML',
  VIROU_ROSTO: 'VR',
  MEXEU_SOBRANCELHA: 'MSO',
  MOVEU_SOBRANCELHA: 'MSO',
};

function normalizeActionCode(action: string) {
  const normalized = action
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return ACTION_ALIASES[normalized] ?? normalized;
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - safeRadius,
    y + height,
  );
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

interface LandmarkOverlayProps {
  videoId: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  artifactId?: string;
  chunkSizeFrames: number;
  mode: LandmarkOverlayMode;
  action?: string;
  actionLabel?: string;
  actionActive?: boolean;
  selectedSide?: AnnotationSide;
  onRegionSelect?: (selection: FacialRegionSelection) => void;
  showMotionVectors?: boolean;
  pointSize: number;
  opacity: number;
  events?: TimelineEventDTO[];
}

export function LandmarkOverlay({
  videoId,
  videoRef,
  artifactId,
  chunkSizeFrames,
  mode,
  action,
  actionLabel,
  actionActive = false,
  selectedSide = 'unspecified',
  onRegionSelect,
  showMotionVectors = false,
  pointSize,
  opacity,
  events = [],
}: LandmarkOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hitRegionsRef = useRef<HitRegion[]>([]);
  const currentTimeMs = usePlaybackStore((state) => state.currentTimeMs);
  const fps = usePlaybackStore((state) => state.fps);
  const frameIndex = Math.max(0, Math.round((currentTimeMs / 1000) * fps));
  const chunkIndex = Math.floor(frameIndex / Math.max(1, chunkSizeFrames));
  const queryClient = useQueryClient();
  // Event contours still need the compact ROI payload when the user turns
  // landmark dots off. This preserves the meaning of "Off" for the dots
  // without falling back to a fabricated central rectangle.
  const dataMode =
    mode === 'area'
      ? 'roi'
      : mode === 'off' && events.length > 0
        ? 'roi'
        : mode;
  const requestedAction = mode === 'area' ? undefined : action;
  const { data: chunk } = useLandmarkChunk(
    videoId,
    artifactId,
    chunkIndex,
    dataMode,
    requestedAction,
  );
  const [faceMissing, setFaceMissing] = useState(false);

  useEffect(() => {
    if (!artifactId || dataMode === 'off') return;
    const transportMode = dataMode === 'mesh' ? 'mesh' : 'roi';
    void prefetchLandmarkChunk(
      queryClient,
      videoId,
      artifactId,
      chunkIndex + 1,
      transportMode,
      requestedAction,
    );
  }, [
    artifactId,
    chunkIndex,
    dataMode,
    queryClient,
    requestedAction,
    videoId,
  ]);

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
    hitRegionsRef.current = [];
    if (!chunk) {
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
    const previousFrame = chunk.frames.find(
      (candidate) => candidate.frameIndex === frame.frameIndex - 1,
    );
    setFaceMissing(!frame.faceDetected);
    if (!frame.faceDetected) return;

    const transform = computeContainTransform(
      width,
      height,
      video.videoWidth,
      video.videoHeight,
    );
    const pointMap: PointMap = new Map(
      frame.points.map(([id, x, y]) => [id, { x, y }]),
    );
    const focusedCode = action ? normalizeActionCode(action) : '';
    const focusedStyle = ACTION_OVERLAY_STYLES[focusedCode];

    if (mode === 'area' && focusedStyle) {
      let labelAnchor: CanvasPoint | null = null;
      const focusedRegions = focusedStyle.regions.filter((region) => {
        if (selectedSide === 'right') return region.startsWith('right');
        if (selectedSide === 'left') return region.startsWith('left');
        return true;
      });
      for (const region of focusedRegions) {
        const regionPoints = FACIAL_REGION_POINTS[region]
          .map((id) => pointMap.get(id))
          .filter((point): point is { x: number; y: number } => Boolean(point))
          .map((point) => ({
            x:
              transform.offsetX
              + point.x * video.videoWidth * transform.scale,
            y:
              transform.offsetY
              + point.y * video.videoHeight * transform.scale,
          }));
        const hull = computeConvexHull(regionPoints);
        if (hull.length < 3) continue;

        context.save();
        context.beginPath();
        context.moveTo(hull[0].x, hull[0].y);
        for (const point of hull.slice(1)) {
          context.lineTo(point.x, point.y);
        }
        context.closePath();
        context.fillStyle = focusedStyle.color;
        context.globalAlpha = Math.min(0.28, opacity * 0.22);
        context.fill();
        context.globalAlpha = Math.max(0.55, opacity);
        context.strokeStyle = focusedStyle.color;
        context.lineWidth = actionActive ? 3 : 2.25;
        context.shadowColor = 'rgba(15, 23, 42, 0.75)';
        context.shadowBlur = actionActive ? 6 : 3;
        context.stroke();
        context.globalAlpha = Math.max(0.7, opacity);
        context.fillStyle = focusedStyle.color;
        for (const point of regionPoints) {
          context.beginPath();
          context.arc(point.x, point.y, pointSize + 0.25, 0, Math.PI * 2);
          context.fill();
        }
        context.restore();

        if (showMotionVectors && previousFrame?.faceDetected) {
          const previousPoints: PointMap = new Map(
            previousFrame.points.map(([id, x, y]) => [id, { x, y }]),
          );
          const regionIds = FACIAL_REGION_POINTS[region];
          const stride = Math.max(1, Math.ceil(regionIds.length / 18));
          for (
            let pointIndex = 0;
            pointIndex < regionIds.length;
            pointIndex += stride
          ) {
            const pointId = regionIds[pointIndex];
            const currentPoint = pointMap.get(pointId);
            const previousPoint = previousPoints.get(pointId);
            if (!currentPoint || !previousPoint) continue;
            const currentX =
              transform.offsetX
              + currentPoint.x * video.videoWidth * transform.scale;
            const currentY =
              transform.offsetY
              + currentPoint.y * video.videoHeight * transform.scale;
            const deltaX =
              (currentPoint.x - previousPoint.x)
              * video.videoWidth
              * transform.scale;
            const deltaY =
              (currentPoint.y - previousPoint.y)
              * video.videoHeight
              * transform.scale;
            const magnitude = Math.hypot(deltaX, deltaY);
            if (magnitude < 0.35) continue;
            const amplification = Math.min(6, Math.max(2, 8 / magnitude));
            const startX = currentX - deltaX * amplification;
            const startY = currentY - deltaY * amplification;
            const angle = Math.atan2(currentY - startY, currentX - startX);
            const vectorColor =
              magnitude > 4
                ? '#fb7185'
                : magnitude > 1.5
                  ? '#facc15'
                  : '#4ade80';

            context.save();
            context.strokeStyle = vectorColor;
            context.fillStyle = vectorColor;
            context.globalAlpha = 0.78;
            context.lineWidth = 1.4;
            context.beginPath();
            context.moveTo(startX, startY);
            context.lineTo(currentX, currentY);
            context.stroke();
            context.beginPath();
            context.moveTo(currentX, currentY);
            context.lineTo(
              currentX - 4 * Math.cos(angle - Math.PI / 6),
              currentY - 4 * Math.sin(angle - Math.PI / 6),
            );
            context.lineTo(
              currentX - 4 * Math.cos(angle + Math.PI / 6),
              currentY - 4 * Math.sin(angle + Math.PI / 6),
            );
            context.closePath();
            context.fill();
            context.globalAlpha = 0.12;
            context.beginPath();
            context.arc(
              currentX,
              currentY,
              Math.min(11, 3 + magnitude),
              0,
              Math.PI * 2,
            );
            context.fill();
            context.restore();
          }
        }

        const anchor = {
          x: Math.min(...hull.map((point) => point.x)),
          y: Math.min(...hull.map((point) => point.y)),
        };
        if (!labelAnchor || anchor.y < labelAnchor.y) labelAnchor = anchor;
      }

      for (const selection of CLICKABLE_REGIONS) {
        const regionPoints = FACIAL_REGION_POINTS[selection.region]
          .map((id) => pointMap.get(id))
          .filter((point): point is { x: number; y: number } => Boolean(point))
          .map((point) => ({
            x:
              transform.offsetX
              + point.x * video.videoWidth * transform.scale,
            y:
              transform.offsetY
              + point.y * video.videoHeight * transform.scale,
          }));
        const polygon = computeConvexHull(regionPoints);
        if (polygon.length >= 3) {
          hitRegionsRef.current.push({ ...selection, polygon });
        }
      }

      if (labelAnchor) {
        const prefix = actionActive ? 'Marcando' : 'Área';
        const label = `${prefix}: ${actionLabel ?? focusedStyle.label}`;
        context.save();
        context.font = '600 12px Inter, system-ui, sans-serif';
        const labelWidth = Math.ceil(context.measureText(label).width) + 16;
        const labelHeight = 23;
        const labelX = Math.min(
          Math.max(1, labelAnchor.x),
          Math.max(1, width - labelWidth - 1),
        );
        const labelY =
          labelAnchor.y >= labelHeight + 4
            ? labelAnchor.y - labelHeight - 4
            : labelAnchor.y + 5;
        context.fillStyle = focusedStyle.color;
        context.globalAlpha = 0.95;
        drawRoundedRect(
          context,
          labelX,
          labelY,
          labelWidth,
          labelHeight,
          5,
        );
        context.fill();
        context.globalAlpha = 1;
        context.fillStyle = '#0f172a';
        context.fillText(label, labelX + 8, labelY + 15.5);
        context.restore();
      }
    } else if (mode !== 'off') {
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
    }

    const currentTime = video.currentTime;
    const activeEvents = events.filter(
      (event) =>
        currentTime >= event.start_time && currentTime <= event.end_time,
    );
    if (activeEvents.length === 0) return;

    const uniqueEvents = new Map<string, TimelineEventDTO>();
    for (const event of activeEvents) {
      const code = normalizeActionCode(event.action);
      const comparisonKey = `${code}:${event.origin}`;
      const previous = uniqueEvents.get(comparisonKey);
      if (!previous || event.confidence_mean > previous.confidence_mean) {
        uniqueEvents.set(comparisonKey, event);
      }
    }

    for (const [comparisonKey, event] of uniqueEvents) {
      const code = comparisonKey.split(':')[0];
      const style = ACTION_OVERLAY_STYLES[code];
      if (!style) continue;
      let regions =
        code === 'OF' && !event.side
          ? selectClosedEyeRegions(frame.points)
          : style.regions;
      if (event.side === 'right') {
        regions = regions.filter((region) => region.startsWith('right'));
      } else if (event.side === 'left') {
        regions = regions.filter((region) => region.startsWith('left'));
      }
      const eventLabel =
        code === 'OF' && regions.length === 1 ? 'Piscada' : style.label;

      regions.forEach((region, regionIndex) => {
        const regionPoints = FACIAL_REGION_POINTS[region]
          .map((id) => pointMap.get(id))
          .filter((point): point is { x: number; y: number } => Boolean(point))
          .map((point) => ({
            x:
              transform.offsetX
              + point.x * video.videoWidth * transform.scale,
            y:
              transform.offsetY
              + point.y * video.videoHeight * transform.scale,
          }));
        if (regionPoints.length < 2) return;

        const xs = regionPoints.map((point) => point.x);
        const ys = regionPoints.map((point) => point.y);
        const rawWidth = Math.max(...xs) - Math.min(...xs);
        const rawHeight = Math.max(...ys) - Math.min(...ys);
        const paddingX = Math.max(5, rawWidth * 0.12);
        const paddingY = Math.max(4, rawHeight * 0.2);
        const x = Math.max(1, Math.min(...xs) - paddingX);
        const y = Math.max(1, Math.min(...ys) - paddingY);
        const boxWidth = Math.min(
          width - x - 1,
          rawWidth + paddingX * 2,
        );
        const boxHeight = Math.min(
          height - y - 1,
          rawHeight + paddingY * 2,
        );

        context.save();
        context.strokeStyle = style.color;
        context.lineWidth = event.origin === 'model' ? 2.25 : 3.25;
        context.shadowColor = 'rgba(15, 23, 42, 0.7)';
        context.shadowBlur = 3;
        context.setLineDash(event.origin === 'model' ? [6, 3] : []);
        drawRoundedRect(context, x, y, boxWidth, boxHeight, 5);
        context.stroke();
        context.restore();

        if (regionIndex !== 0) return;
        const confidence = Math.round(event.confidence_mean * 100);
        const source = event.origin === 'model' ? 'modelo' : 'anotação';
        const label = `${eventLabel} · ${confidence}% · ${source}`;
        context.save();
        context.font = '600 12px Inter, system-ui, sans-serif';
        const labelWidth = Math.ceil(context.measureText(label).width) + 14;
        const labelHeight = 22;
        const labelX = Math.min(x, Math.max(1, width - labelWidth - 1));
        const labelY =
          y >= labelHeight + 3
            ? y - labelHeight - 3
            : Math.min(height - labelHeight - 1, y + boxHeight + 3);
        context.fillStyle = style.color;
        context.globalAlpha = 0.94;
        drawRoundedRect(
          context,
          labelX,
          labelY,
          labelWidth,
          labelHeight,
          4,
        );
        context.fill();
        context.globalAlpha = 1;
        context.fillStyle = '#0f172a';
        context.fillText(label, labelX + 7, labelY + 15);
        context.restore();
      });
    }
  }, [
    action,
    actionActive,
    actionLabel,
    chunk,
    events,
    fps,
    mode,
    opacity,
    pointSize,
    selectedSide,
    showMotionVectors,
    videoRef,
  ]);

  const handleCanvasClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      if (mode !== 'area' || !onRegionSelect) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const point = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      const selected = hitRegionsRef.current.find((candidate) =>
        pointInPolygon(point, candidate.polygon),
      );
      if (selected) {
        onRegionSelect({
          actionCode: selected.actionCode,
          region: selected.region,
          side: selected.side,
        });
      }
    },
    [mode, onRegionSelect],
  );

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
        className={`absolute inset-0 h-full w-full ${
          mode === 'area' && onRegionSelect
            ? 'pointer-events-auto cursor-crosshair'
            : 'pointer-events-none'
        }`}
        aria-label="Landmarks faciais"
        onClick={handleCanvasClick}
        title={
          mode === 'area' && onRegionSelect
            ? 'Clique em uma região facial para iniciar a anotação'
            : undefined
        }
      />
      {faceMissing && (mode !== 'off' || events.length > 0) && (
        <div className="absolute bottom-3 left-3 rounded-md border border-amber-400/30 bg-amber-950/85 px-2.5 py-1.5 text-xs text-amber-200">
          Face não detectada neste quadro
        </div>
      )}
    </>
  );
}

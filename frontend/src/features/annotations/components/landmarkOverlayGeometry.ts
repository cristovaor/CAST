export type LandmarkPoint = [number, number, number];
export type LandmarkOverlayMode = 'off' | 'roi' | 'area' | 'mesh';

export interface CanvasPoint {
  x: number;
  y: number;
}

export type FacialRegion =
  | 'rightEye'
  | 'leftEye'
  | 'rightIris'
  | 'leftIris'
  | 'lips'
  | 'face'
  | 'rightEyebrow'
  | 'leftEyebrow';

type PointMap = Map<number, { x: number; y: number }>;

export interface ContainTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/**
 * Turns a FaceMesh point cloud into a stable, non-self-intersecting region
 * that follows the face from frame to frame.
 */
export function computeConvexHull(points: CanvasPoint[]): CanvasPoint[] {
  if (points.length <= 2) return [...points];
  const sorted = [...points].sort(
    (first, second) => first.x - second.x || first.y - second.y,
  );
  const cross = (
    origin: CanvasPoint,
    first: CanvasPoint,
    second: CanvasPoint,
  ) =>
    (first.x - origin.x) * (second.y - origin.y)
    - (first.y - origin.y) * (second.x - origin.x);

  const lower: CanvasPoint[] = [];
  for (const point of sorted) {
    while (
      lower.length >= 2
      && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0
    ) {
      lower.pop();
    }
    lower.push(point);
  }

  const upper: CanvasPoint[] = [];
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const point = sorted[index];
    while (
      upper.length >= 2
      && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0
    ) {
      upper.pop();
    }
    upper.push(point);
  }

  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

export function pointInPolygon(
  point: CanvasPoint,
  polygon: CanvasPoint[],
): boolean {
  let inside = false;
  for (
    let current = 0, previous = polygon.length - 1;
    current < polygon.length;
    previous = current, current += 1
  ) {
    const currentPoint = polygon[current];
    const previousPoint = polygon[previous];
    const intersects =
      currentPoint.y > point.y !== previousPoint.y > point.y
      && point.x
        < ((previousPoint.x - currentPoint.x)
          * (point.y - currentPoint.y))
          / (previousPoint.y - currentPoint.y)
          + currentPoint.x;
    if (intersects) inside = !inside;
  }
  return inside;
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

function distance(
  first: { x: number; y: number } | undefined,
  second: { x: number; y: number } | undefined,
) {
  if (!first || !second) return null;
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function eyeAspectRatio(
  points: PointMap,
  corners: [number, number],
  verticalPairs: [[number, number], [number, number]],
) {
  const width = distance(points.get(corners[0]), points.get(corners[1]));
  const heightA = distance(
    points.get(verticalPairs[0][0]),
    points.get(verticalPairs[0][1]),
  );
  const heightB = distance(
    points.get(verticalPairs[1][0]),
    points.get(verticalPairs[1][1]),
  );
  if (!width || heightA === null || heightB === null) return null;
  return (heightA + heightB) / (2 * width);
}

/**
 * Separates a unilateral wink from both eyes closing. The event classifier
 * supplies the action while the per-frame landmarks identify which eye has
 * the smaller aperture.
 */
export function selectClosedEyeRegions(
  points: LandmarkPoint[],
): FacialRegion[] {
  const pointMap: PointMap = new Map(
    points.map(([id, x, y]) => [id, { x, y }]),
  );
  const right = eyeAspectRatio(
    pointMap,
    [33, 133],
    [[159, 145], [158, 153]],
  );
  const left = eyeAspectRatio(
    pointMap,
    [362, 263],
    [[386, 374], [385, 380]],
  );
  if (right === null || left === null) return ['rightEye', 'leftEye'];

  const smaller = Math.min(right, left);
  const larger = Math.max(right, left);
  const isClearlyUnilateral =
    larger > 0
    && smaller / larger < 0.76
    && (smaller <= 0.22 || larger - smaller >= 0.04);

  if (!isClearlyUnilateral) return ['rightEye', 'leftEye'];
  return right < left ? ['rightEye'] : ['leftEye'];
}

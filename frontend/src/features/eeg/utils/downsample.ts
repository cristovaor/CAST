import type { EEGTimeSeries } from '../useEEG';

// Recharts degrades noticeably above ~1k points per line; 600 keeps the
// sliding window smooth even for 250 Hz recordings.
export const MAX_CHART_POINTS = 600;

function lowerBound(data: EEGTimeSeries[], targetMs: number): number {
  let lo = 0;
  let hi = data.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (data[mid].timestamp_ms < targetMs) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Returns the points with timestamp_ms in [startMs, endMs].
 * Assumes `data` is sorted by timestamp_ms (sort once at load time).
 */
export function sliceWindow(
  data: EEGTimeSeries[],
  startMs: number,
  endMs: number,
): EEGTimeSeries[] {
  if (data.length === 0 || startMs > endMs) return [];
  const start = lowerBound(data, startMs);
  const end = lowerBound(data, endMs + 1);
  return data.slice(start, end);
}

/**
 * N-th point decimation down to at most `maxPoints`, always keeping the first
 * and last point so the window edges stay anchored. Good enough for band-power
 * lines; LTTB would preserve peaks better and is a possible follow-up.
 */
export function decimate<T>(points: T[], maxPoints: number = MAX_CHART_POINTS): T[] {
  if (points.length <= maxPoints) return points;
  const stride = Math.ceil(points.length / maxPoints);
  const result: T[] = [];
  for (let i = 0; i < points.length; i += stride) {
    result.push(points[i]);
  }
  if (result[result.length - 1] !== points[points.length - 1]) {
    result.push(points[points.length - 1]);
  }
  return result;
}

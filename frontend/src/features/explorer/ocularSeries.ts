import type { ExplorerTrackDescriptor } from './types';

export interface OcularSeriesPayload { artifact: Record<string, unknown>; samples: Record<string, unknown>[] }

export function resolveTrackUrl(track: ExplorerTrackDescriptor, startTimeUs: number, endTimeUs: number, limit = 2000): string {
  return track.samples_url
    .replaceAll('{start_time_us}', String(Math.round(startTimeUs)))
    .replaceAll('{end_time_us}', String(Math.round(endTimeUs)))
    .replaceAll('{limit}', String(limit));
}

export function ocularValue(row: Record<string, unknown>, kind: 'pupil' | 'gaze-x' | 'gaze-y'): number | null {
  const keys = kind === 'pupil' ? ['pupil_luminance_corrected','pupil_normalized','pupil_ratio'] : kind === 'gaze-x' ? ['gaze_x','iris_offset_proxy_x'] : ['gaze_y','iris_offset_proxy_y'];
  for (const key of keys) if (typeof row[key] === 'number') return row[key] as number;
  return null;
}

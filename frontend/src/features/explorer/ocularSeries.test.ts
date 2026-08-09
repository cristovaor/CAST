import { describe, expect, it } from 'vitest';
import { ocularValue, resolveTrackUrl } from './ocularSeries';
import type { ExplorerTrackDescriptor } from './types';

const track = { samples_url: '/x?start={start_time_us}&end={end_time_us}&limit={limit}' } as ExplorerTrackDescriptor;
describe('ocular series', () => {
  it('resolves bounded track URLs', () => expect(resolveTrackUrl(track, 10, 20, 50)).toBe('/x?start=10&end=20&limit=50'));
  it('selects the strongest available layer value', () => expect(ocularValue({ pupil_ratio: .3, pupil_normalized: 1.1 }, 'pupil')).toBe(1.1));
});

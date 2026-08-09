import { describe, expect, it } from 'vitest';
import { parsePupilObservations } from './pupilImport';

describe('pupil import', () => {
  it('normalizes and sorts CSV observations', () => {
    const rows = parsePupilObservations('source_time_us,pupil_diameter_px,iris_diameter_px,luminance\n20,30,100,5\n10,29,100,4');
    expect(rows.map((row) => row.source_time_us)).toEqual([10, 20]);
    expect(rows[0].source_clock_id).toBe('video-pts');
  });
  it('rejects invalid numeric rows', () => expect(() => parsePupilObservations('[{"source_time_us":"bad"}]')).toThrow('Linha 1'));
});

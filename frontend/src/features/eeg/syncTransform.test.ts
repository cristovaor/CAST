import { describe, expect, it } from 'vitest';
import { eegToVideoMs, videoToEegMs, type SyncTransform } from './useEEG';

describe('approved EEG synchronization transform', () => {
  it('uses the canonical positive-offset sign and drift in both directions', () => {
    const mapping: SyncTransform = {
      mapping_version: 'affine-v1',
      approved: true,
      offset_ms: 2000,
      drift_ms_per_min: 6,
      quality_grade: 'high',
      uncertainty_ms: 10,
    };

    const eegMs = videoToEegMs(10_000, mapping);

    expect(eegMs).toBe(8001);
    expect(eegToVideoMs(eegMs, mapping)).toBe(10_000);
  });

  it('falls back to the identity transform before approval', () => {
    expect(videoToEegMs(1234)).toBe(1234);
    expect(eegToVideoMs(1234)).toBe(1234);
  });
});

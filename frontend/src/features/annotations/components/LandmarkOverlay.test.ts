import { describe, expect, it } from 'vitest';
import { computeContainTransform } from './LandmarkOverlay';

describe('computeContainTransform', () => {
  it('centers a wide video with horizontal letterboxing', () => {
    const result = computeContainTransform(1000, 1000, 1920, 1080);
    expect(result.scale).toBeCloseTo(1000 / 1920);
    expect(result.offsetX).toBeCloseTo(0);
    expect(result.offsetY).toBeCloseTo(218.75);
  });

  it('centers a portrait video with vertical side bars', () => {
    const result = computeContainTransform(1000, 500, 720, 1280);
    expect(result.scale).toBeCloseTo(500 / 1280);
    expect(result.offsetX).toBeCloseTo(359.375);
    expect(result.offsetY).toBeCloseTo(0);
  });
});

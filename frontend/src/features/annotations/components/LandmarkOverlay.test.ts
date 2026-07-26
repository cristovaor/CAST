import { describe, expect, it } from 'vitest';
import {
  computeConvexHull,
  computeContainTransform,
  selectClosedEyeRegions,
} from './landmarkOverlayGeometry';

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

describe('computeConvexHull', () => {
  it('creates a stable outer area and excludes interior landmarks', () => {
    const hull = computeConvexHull([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 5, y: 5 },
    ]);

    expect(hull).toHaveLength(4);
    expect(hull).not.toContainEqual({ x: 5, y: 5 });
    expect(hull).toEqual(
      expect.arrayContaining([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ]),
    );
  });
});

describe('selectClosedEyeRegions', () => {
  const eye = (
    cornerA: number,
    cornerB: number,
    verticalA: [number, number],
    verticalB: [number, number],
    originX: number,
    aperture: number,
  ): Array<[number, number, number]> => [
    [cornerA, originX, 0.5],
    [cornerB, originX + 0.1, 0.5],
    [verticalA[0], originX + 0.04, 0.5 - aperture / 2],
    [verticalA[1], originX + 0.04, 0.5 + aperture / 2],
    [verticalB[0], originX + 0.06, 0.5 - aperture / 2],
    [verticalB[1], originX + 0.06, 0.5 + aperture / 2],
  ];

  it('returns only the eye whose aperture indicates a unilateral wink', () => {
    const points = [
      ...eye(33, 133, [159, 145], [158, 153], 0.2, 0.01),
      ...eye(362, 263, [386, 374], [385, 380], 0.6, 0.035),
    ];

    expect(selectClosedEyeRegions(points)).toEqual(['rightEye']);
  });

  it('returns both eyes when both apertures are similarly closed', () => {
    const points = [
      ...eye(33, 133, [159, 145], [158, 153], 0.2, 0.012),
      ...eye(362, 263, [386, 374], [385, 380], 0.6, 0.011),
    ];

    expect(selectClosedEyeRegions(points)).toEqual([
      'rightEye',
      'leftEye',
    ]);
  });
});

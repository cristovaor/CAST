import { describe, expect, it } from 'vitest';
import { timeToFrame } from './annotationFrame';

describe('timeToFrame', () => {
  it('uses the video FPS as the canonical frame clock', () => {
    expect(timeToFrame(1000, 30)).toBe(30);
    expect(timeToFrame(500, 24)).toBe(12);
  });

  it('rounds to the displayed frame and never returns a negative frame', () => {
    expect(timeToFrame(49, 30)).toBe(1);
    expect(timeToFrame(-100, 30)).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { landmarkChunkKey } from './useAnnotationEditor';

describe('landmark chunk cache key', () => {
  it('separates ROI/action and mesh without coupling to the video URL', () => {
    expect(landmarkChunkKey('video', 'artifact', 2, 'roi', 'OF')).toEqual([
      'landmarks',
      'video',
      'artifact',
      2,
      'roi',
      'OF',
    ]);
    expect(landmarkChunkKey('video', 'artifact', 2, 'mesh')).not.toEqual(
      landmarkChunkKey('video', 'artifact', 2, 'roi', 'OF'),
    );
  });
});

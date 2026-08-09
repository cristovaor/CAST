import { beforeEach, describe, expect, it } from 'vitest';
import { usePlaybackStore } from './usePlaybackStore';

describe('Explorer playback state', () => {
  beforeEach(() => usePlaybackStore.getState().reset());

  it('stores only temporal UI state for window and selection', () => {
    usePlaybackStore.getState().setVisibleWindowMs({ startMs: 1_000, endMs: 5_000 });
    usePlaybackStore.getState().setSelectionMs({ startMs: 2_000, endMs: 3_000 });

    expect(usePlaybackStore.getState().visibleWindowMs).toEqual({ startMs: 1_000, endMs: 5_000 });
    expect(usePlaybackStore.getState().selectionMs).toEqual({ startMs: 2_000, endMs: 3_000 });
    expect('samples' in usePlaybackStore.getState()).toBe(false);
  });
});

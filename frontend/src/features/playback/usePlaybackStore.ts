import { create } from 'zustand';

// Shared playback clock for the multimodal view (video + EEG chart + overlays).
// The <video> element is the single source of truth: the player mirrors its
// state into this store, and seeks are *requests* that the player applies to
// the element (never written to currentTimeMs directly by consumers).

export interface SeekRequest {
  timeMs: number;
  // Bumped on every request so repeated seeks to the same time still fire.
  nonce: number;
}

interface PlaybackState {
  currentTimeMs: number;
  durationMs: number;
  isPlaying: boolean;
  fps: number;
  playbackRate: number;

  seekRequest: SeekRequest | null;

  setCurrentTimeMs: (ms: number) => void;
  setDurationMs: (ms: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setFps: (fps: number) => void;
  setPlaybackRate: (rate: number) => void;
  requestSeek: (timeMs: number) => void;
  clearSeekRequest: () => void;
  reset: () => void;
}

const initialState = {
  currentTimeMs: 0,
  durationMs: 0,
  isPlaying: false,
  fps: 30,
  playbackRate: 1,
  seekRequest: null,
};

export const usePlaybackStore = create<PlaybackState>((set) => ({
  ...initialState,

  setCurrentTimeMs: (ms) => set({ currentTimeMs: ms }),
  setDurationMs: (ms) => set({ durationMs: ms }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setFps: (fps) => set({ fps }),
  setPlaybackRate: (playbackRate) => set({ playbackRate }),

  requestSeek: (timeMs) =>
    set((state) => ({
      seekRequest: { timeMs, nonce: (state.seekRequest?.nonce ?? 0) + 1 },
    })),
  clearSeekRequest: () => set({ seekRequest: null }),

  reset: () => set({ ...initialState }),
}));

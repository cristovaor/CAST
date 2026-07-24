import { create } from 'zustand';
import type { AnnotationEvent, AnnotationDraft } from '@/types/annotation';
import { annotationsApi } from '../api/annotationsApi';

interface AnnotationState {
  // Video state
  currentTime: number;
  duration: number;
  playbackRate: number;
  isPlaying: boolean;
  
  // Annotation state
  events: AnnotationEvent[];
  draft: AnnotationDraft | null;
  activeMicroAction: string | null;

  // Video Actions
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setPlaybackRate: (rate: number) => void;
  setIsPlaying: (playing: boolean) => void;
  
  // Annotation Actions
  setEvents: (events: AnnotationEvent[]) => void;
  fetchEvents: (videoId: string) => Promise<void>;
  startDraft: (microActionType: string, startTime: number, startFrame: number) => void;
  finishDraft: (endTime: number, endFrame: number, videoId: string, annotatorId: string) => Promise<void>;
  cancelDraft: () => void;
  deleteEvent: (videoId: string, eventId: string) => Promise<void>;
  setActiveMicroAction: (type: string | null) => void;
}

export const useAnnotationStore = create<AnnotationState>((set) => ({
  currentTime: 0,
  duration: 0,
  playbackRate: 1,
  isPlaying: false,
  
  events: [],
  draft: null,
  activeMicroAction: null,

  setCurrentTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration }),
  setPlaybackRate: (rate) => set({ playbackRate: rate }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),

  setEvents: (events) => set({ events }),
  
  fetchEvents: async (videoId) => {
    try {
      const events = await annotationsApi.getAnnotationsByVideo(videoId);
      set({ events });
    } catch (error) {
      console.error("Failed to fetch annotations", error);
    }
  },

  startDraft: (microActionType, startTime, startFrame) => set({
    draft: { microActionType, startTime, startFrame },
    activeMicroAction: microActionType
  }),

  finishDraft: async (endTime, endFrame, videoId, annotatorId) => {
    const state = useAnnotationStore.getState();
    if (!state.draft) return;
    
    const actualStart = Math.min(state.draft.startTime, endTime);
    const actualEnd = Math.max(state.draft.startTime, endTime);
    const actualStartFrame = Math.min(state.draft.startFrame, endFrame);
    const actualEndFrame = Math.max(state.draft.startFrame, endFrame);

    const payload = {
      videoId,
      microActionType: state.draft.microActionType,
      startTime: actualStart,
      endTime: actualEnd,
      startFrame: actualStartFrame,
      endFrame: actualEndFrame,
      confidence: null,
      annotatorId,
    };

    try {
      // Optimistically clear draft
      set({ draft: null, activeMicroAction: null });
      const newEvent = await annotationsApi.createAnnotation(videoId, payload);
      set((s) => ({ events: [...s.events, newEvent] }));
    } catch (error) {
      console.error("Failed to create annotation", error);
      // In a real app, we might restore the draft or show a toast error
    }
  },


  cancelDraft: () => set({ draft: null, activeMicroAction: null }),
  
  deleteEvent: async (videoId, eventId) => {
    try {
      await annotationsApi.deleteAnnotation(videoId, eventId);
      set((state) => ({ events: state.events.filter(e => e.id !== eventId) }));
    } catch (error) {
      console.error("Failed to delete annotation", error);
    }
  },

  setActiveMicroAction: (type) => set({ activeMicroAction: type })
}));

import { create } from 'zustand';
import type { AnnotationDraft, AnnotationEvent } from '@/types/annotation';
import { annotationsApi } from '../api/annotationsApi';

interface AnnotationState {
  events: AnnotationEvent[];
  draft: AnnotationDraft | null;
  activeActionCode: string | null;
  setEvents: (events: AnnotationEvent[]) => void;
  fetchEvents: (videoId: string, taskId?: string) => Promise<void>;
  startDraft: (
    actionCode: string,
    actionLabel: string,
    startTime: number,
    startFrame: number,
  ) => void;
  cancelDraft: () => void;
  deleteEvent: (videoId: string, eventId: string) => Promise<void>;
  setActiveAction: (code: string | null) => void;
}

export const useAnnotationStore = create<AnnotationState>((set) => ({
  events: [],
  draft: null,
  activeActionCode: null,

  setEvents: (events) => set({ events }),
  fetchEvents: async (videoId, taskId) => {
    const events = await annotationsApi.getAnnotationsByVideo(videoId, taskId);
    set({ events });
  },
  startDraft: (actionCode, actionLabel, startTime, startFrame) =>
    set({
      draft: { actionCode, actionLabel, startTime, startFrame },
      activeActionCode: actionCode,
    }),
  cancelDraft: () => set({ draft: null, activeActionCode: null }),
  deleteEvent: async (videoId, eventId) => {
    await annotationsApi.deleteAnnotation(videoId, eventId);
    set((state) => ({
      events: state.events.filter((event) => event.id !== eventId),
    }));
  },
  setActiveAction: (activeActionCode) => set({ activeActionCode }),
}));

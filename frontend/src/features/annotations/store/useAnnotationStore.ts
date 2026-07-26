import { create } from 'zustand';
import type {
  AnnotationDraft,
  AnnotationEvent,
  AnnotationSide,
} from '@/types/annotation';
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
    region?: string,
    side?: AnnotationSide,
    spatialMetadata?: Record<string, unknown>,
  ) => void;
  cancelDraft: () => void;
  restoreDraft: (draft: AnnotationDraft) => void;
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
  startDraft: (
    actionCode,
    actionLabel,
    startTime,
    startFrame,
    region,
    side = 'unspecified',
    spatialMetadata,
  ) =>
    set({
      draft: {
        actionCode,
        actionLabel,
        startTime,
        startFrame,
        region,
        side,
        spatialMetadata,
      },
      activeActionCode: actionCode,
    }),
  cancelDraft: () => set({ draft: null, activeActionCode: null }),
  restoreDraft: (draft) =>
    set({ draft, activeActionCode: draft.actionCode }),
  deleteEvent: async (videoId, eventId) => {
    await annotationsApi.deleteAnnotation(videoId, eventId);
    set((state) => ({
      events: state.events.filter((event) => event.id !== eventId),
    }));
  },
  setActiveAction: (activeActionCode) => set({ activeActionCode }),
}));

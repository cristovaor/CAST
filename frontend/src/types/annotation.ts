export interface AnnotationEvent {
  id: string;
  videoId: string;
  microActionType: string;
  startTime: number;
  endTime: number;
  startFrame: number;
  endFrame: number;
  confidence: number | null; // null for manual annotation, 0-1 for predictions
  annotatorId: string;
  notes?: string;
  createdAt: string;
}

export interface AnnotationTrackData {
  microActionType: string;
  events: AnnotationEvent[];
}

export interface AnnotationDraft {
  microActionType: string;
  startTime: number;
  startFrame: number;
}

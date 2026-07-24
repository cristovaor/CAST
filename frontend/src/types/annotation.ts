export interface AnnotationEvent {
  id: string;
  videoId: string;
  taskId: string;
  kind: 'interval' | 'point';
  source: 'manual' | 'model_review';
  actionCode: string;
  actionLabel: string;
  /** @deprecated use actionCode */
  microActionType: string;
  startTime: number;
  endTime: number;
  startFrame: number;
  endFrame: number;
  confidence: number | null; // null for manual annotation, 0-1 for predictions
  annotatorId: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AnnotationTrackData {
  microActionType: string;
  events: AnnotationEvent[];
}

export interface AnnotationDraft {
  actionCode: string;
  actionLabel: string;
  startTime: number;
  startFrame: number;
}

export interface AnnotationCategory {
  code: string;
  label: string;
  shortcut?: number;
}

export interface LandmarkArtifactSummary {
  id: string;
  status: string;
  extractor: string;
  extractorVersion: string;
  fps: number;
  frameCount: number;
  pointCount: number;
  faceDetectionRate: number;
  chunkSizeFrames: number;
  errorMessage?: string | null;
}

export interface AnnotationContext {
  video: {
    id: string;
    filename: string;
    fps: number;
    durationSeconds: number | null;
    width: number | null;
    height: number | null;
  };
  categories: AnnotationCategory[];
  task: { id: string; assigneeId: string; status: string } | null;
  landmarkArtifact: LandmarkArtifactSummary | null;
  prediction: { id: string; modelVersion: string | null; createdAt: string } | null;
  processing: Array<{
    jobId: string;
    type: 'extract_landmarks' | 'infer';
    status: string;
    progress: number;
    error?: string | null;
  }>;
}

export interface LandmarkFrame {
  frameIndex: number;
  timestampMs: number;
  faceDetected: boolean;
  points: Array<[number, number, number]>;
}

export interface LandmarkChunk {
  artifactId: string;
  chunkIndex: number;
  startFrame: number;
  endFrame: number;
  mode: 'roi' | 'mesh';
  action: string | null;
  frames: LandmarkFrame[];
}

export interface AnnotationSuggestion {
  modelEventKey: string;
  actionCode: string;
  startFrame: number;
  endFrame: number;
  startTime: number;
  endTime: number;
  confidence: number;
  modelVersion: string | null;
  review: {
    id: string;
    decision: 'accepted' | 'corrected' | 'rejected';
    annotationEventId: string | null;
    reviewedAt: string;
  } | null;
}

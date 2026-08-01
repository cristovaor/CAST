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
  region?: string | null;
  side: AnnotationSide;
  spatialMetadata: AnnotationSpatialMetadata;
  revision: number;
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
  region?: string;
  side: AnnotationSide;
  spatialMetadata?: AnnotationSpatialMetadata;
}

export type AnnotationSide =
  | 'left'
  | 'right'
  | 'both'
  | 'center'
  | 'whole'
  | 'unspecified';

export interface AnnotationHistory {
  canUndo: boolean;
  canRedo: boolean;
  entries: Array<{
    id: string;
    eventId: string;
    operation: 'create' | 'update' | 'delete';
    undone: boolean;
    actionCode?: string | null;
    createdAt: string;
  }>;
}

export interface AnnotationCategory {
  code: string;
  label: string;
  shortcut?: number;
  group?: AnnotationGroup;
  default_side?: AnnotationSide;
  region?: string;
  experimental?: boolean;
}

export type AnnotationGroup = 'eyes' | 'gaze' | 'head' | 'mouth' | 'brows' | 'custom';

export interface AnnotationDirection {
  horizontal?: 'left' | 'center' | 'right';
  vertical?: 'up' | 'center' | 'down';
  tilt?: 'left' | 'center' | 'right';
}

export interface AnnotationSpatialMetadata extends Record<string, unknown> {
  direction?: AnnotationDirection;
  subtype?: 'blink' | 'wink' | 'sustained_closure' | 'gaze_shift' | 'head_movement' | string;
  magnitude?: number;
  signals?: Record<string, number>;
  quality?: {
    faceDetectionRate?: number;
    directionAmbiguous?: boolean;
    [key: string]: unknown;
  };
  modelVersion?: string;
  calibrationVersion?: string;
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
  side?: AnnotationSide;
  direction?: AnnotationDirection;
  subtype?: string | null;
  magnitude?: number | null;
  quality?: {
    faceDetectionRate?: number;
    directionAmbiguous?: boolean;
    [key: string]: unknown;
  };
  signals?: Record<string, number>;
  modelVersion: string | null;
  calibrationVersion?: string | null;
  review: {
    id: string;
    decision: 'accepted' | 'corrected' | 'rejected';
    annotationEventId: string | null;
    reviewedAt: string;
  } | null;
}

export interface AnnotationIntervalAnalysis {
  available: boolean;
  reason?: string;
  artifactId?: string;
  originalStartFrame: number;
  originalEndFrame: number;
  suggestedStartFrame?: number;
  suggestedEndFrame?: number;
  boundaryConfidence?: number;
  motionSeries?: Array<{ frameIndex: number; motion: number }>;
  quality?: {
    faceDetectionRate: number;
    pointCoverage: number;
    unstableTracking: boolean;
    warnings: Array<{
      code: string;
      severity: 'info' | 'warning' | 'error';
      message: string;
    }>;
  };
}

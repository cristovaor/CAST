import { apiClient } from '@/lib/api';
import type {
  AnnotationContext,
  AnnotationEvent,
  AnnotationSuggestion,
  LandmarkChunk,
} from '@/types/annotation';

export interface AnnotationWrite {
  kind: 'interval' | 'point';
  actionCode: string;
  actionLabel: string;
  taskId?: string;
  startFrame: number;
  endFrame: number;
  startTime?: number;
  endTime?: number;
  notes?: string;
}

export const annotationsApi = {
  getAnnotationsByVideo: (videoId: string, taskId?: string) =>
    apiClient.get<AnnotationEvent[]>(
      `/videos/${videoId}/annotations${taskId ? `?task_id=${taskId}` : ''}`,
    ),

  createAnnotation: (
    videoId: string,
    data: AnnotationWrite,
  ) =>
    apiClient.post<AnnotationEvent>(`/videos/${videoId}/annotations`, data),

  updateAnnotation: (videoId: string, annotationId: string, data: Partial<AnnotationEvent>) =>
    apiClient.put<AnnotationEvent>(`/videos/${videoId}/annotations/${annotationId}`, data),

  deleteAnnotation: (videoId: string, annotationId: string) =>
    apiClient.delete<void>(`/videos/${videoId}/annotations/${annotationId}`),

  getContext: (videoId: string, taskId?: string) =>
    apiClient.get<AnnotationContext>(
      `/videos/${videoId}/annotation-context${taskId ? `?task_id=${taskId}` : ''}`,
    ),

  getLandmarkChunk: (
    videoId: string,
    artifactId: string,
    chunk: number,
    mode: 'roi' | 'mesh',
    action?: string,
  ) => {
    const query = new URLSearchParams({
      artifact_id: artifactId,
      chunk: String(chunk),
      mode,
    });
    if (action) query.set('action', action);
    return apiClient.get<LandmarkChunk>(
      `/videos/${videoId}/landmarks?${query.toString()}`,
    );
  },

  getSuggestions: (videoId: string, taskId?: string) =>
    apiClient.get<{
      predictionId: string | null;
      modelVersion: string | null;
      suggestions: AnnotationSuggestion[];
    }>(
      `/videos/${videoId}/annotation-suggestions${taskId ? `?task_id=${taskId}` : ''}`,
    ),

  reviewSuggestion: (
    videoId: string,
    modelEventKey: string,
    payload: {
      predictionId: string;
      decision: 'accepted' | 'corrected' | 'rejected';
      taskId?: string;
      correction?: AnnotationWrite;
    },
  ) =>
    apiClient.post<{
      id: string;
      decision: string;
      annotationEventId: string | null;
      idempotent: boolean;
    }>(
      `/videos/${videoId}/annotation-suggestions/${modelEventKey}/review`,
      payload,
    ),
};

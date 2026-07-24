import { apiClient } from '@/lib/api';
import type { AnnotationEvent } from '@/types/annotation';

export const annotationsApi = {
  getAnnotationsByVideo: (videoId: string) =>
    apiClient.get<AnnotationEvent[]>(`/videos/${videoId}/annotations`),

  createAnnotation: (videoId: string, data: Omit<AnnotationEvent, 'id' | 'createdAt'>) =>
    apiClient.post<AnnotationEvent>(`/videos/${videoId}/annotations`, data),

  updateAnnotation: (videoId: string, annotationId: string, data: Partial<AnnotationEvent>) =>
    apiClient.put<AnnotationEvent>(`/videos/${videoId}/annotations/${annotationId}`, data),

  deleteAnnotation: (videoId: string, annotationId: string) =>
    apiClient.delete<void>(`/videos/${videoId}/annotations/${annotationId}`),
};

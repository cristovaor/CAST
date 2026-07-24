import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { annotationsApi, type AnnotationWrite } from './annotationsApi';
import type { AnnotationEvent } from '@/types/annotation';

export function landmarkChunkKey(
  videoId: string,
  artifactId: string,
  chunk: number,
  mode: 'roi' | 'mesh',
  action?: string,
) {
  return ['landmarks', videoId, artifactId, chunk, mode, action ?? 'all'] as const;
}

export function prefetchLandmarkChunk(
  queryClient: QueryClient,
  videoId: string,
  artifactId: string,
  chunk: number,
  mode: 'roi' | 'mesh',
  action?: string,
) {
  return queryClient.prefetchQuery({
    queryKey: landmarkChunkKey(videoId, artifactId, chunk, mode, action),
    queryFn: () =>
      annotationsApi.getLandmarkChunk(
        videoId,
        artifactId,
        chunk,
        mode,
        action,
      ),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useAnnotationContext(videoId: string, taskId?: string) {
  return useQuery({
    queryKey: ['annotation-context', videoId, taskId ?? 'current'],
    queryFn: () => annotationsApi.getContext(videoId, taskId),
    enabled: Boolean(videoId),
    refetchInterval: (query) => {
      const active = query.state.data?.processing.some(
        (job) => job.status === 'queued' || job.status === 'running',
      );
      return active ? 2000 : false;
    },
  });
}

export function useVideoAnnotations(videoId: string, taskId?: string) {
  return useQuery({
    queryKey: ['annotations', videoId, taskId ?? 'current'],
    queryFn: () => annotationsApi.getAnnotationsByVideo(videoId, taskId),
    enabled: Boolean(videoId),
  });
}

export function useLandmarkChunk(
  videoId: string,
  artifactId: string | undefined,
  chunk: number,
  mode: 'off' | 'roi' | 'mesh',
  action?: string,
) {
  const transportMode = mode === 'mesh' ? 'mesh' : 'roi';
  return useQuery({
    queryKey: landmarkChunkKey(
      videoId,
      artifactId ?? 'none',
      chunk,
      transportMode,
      action,
    ),
    queryFn: () =>
      annotationsApi.getLandmarkChunk(
        videoId,
        artifactId!,
        chunk,
        transportMode,
        action,
      ),
    enabled: Boolean(videoId && artifactId && mode !== 'off'),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useAnnotationSuggestions(videoId: string, taskId?: string) {
  return useQuery({
    queryKey: ['annotation-suggestions', videoId, taskId ?? 'current'],
    queryFn: () => annotationsApi.getSuggestions(videoId, taskId),
    enabled: Boolean(videoId),
  });
}

export function useCreateVideoAnnotation(videoId: string, taskId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AnnotationWrite) =>
      annotationsApi.createAnnotation(videoId, {
        ...payload,
        taskId: payload.taskId ?? taskId,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ['annotations', videoId, taskId ?? 'current'],
      }),
  });
}

export function useUpdateVideoAnnotation(videoId: string, taskId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      annotationId,
      data,
    }: {
      annotationId: string;
      data: Partial<AnnotationEvent>;
    }) => annotationsApi.updateAnnotation(videoId, annotationId, data),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ['annotations', videoId, taskId ?? 'current'],
      }),
  });
}

export function useReviewSuggestion(videoId: string, taskId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      modelEventKey,
      predictionId,
      decision,
      correction,
    }: {
      modelEventKey: string;
      predictionId: string;
      decision: 'accepted' | 'corrected' | 'rejected';
      correction?: AnnotationWrite;
    }) =>
      annotationsApi.reviewSuggestion(videoId, modelEventKey, {
        predictionId,
        decision,
        taskId,
        correction,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['annotation-suggestions', videoId, taskId ?? 'current'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['annotations', videoId, taskId ?? 'current'],
        }),
      ]);
    },
  });
}

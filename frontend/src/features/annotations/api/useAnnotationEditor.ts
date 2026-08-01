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

export function useAnnotationHistory(videoId: string, taskId?: string) {
  return useQuery({
    queryKey: ['annotation-history', videoId, taskId ?? 'current'],
    queryFn: () => annotationsApi.getHistory(videoId, taskId),
    enabled: Boolean(videoId),
  });
}

export function useLandmarkChunk(
  videoId: string,
  artifactId: string | undefined,
  chunk: number,
  mode: 'off' | 'roi' | 'area' | 'mesh',
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
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['annotations', videoId, taskId ?? 'current'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['annotation-history', videoId, taskId ?? 'current'],
        }),
      ]);
    },
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
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['annotations', videoId, taskId ?? 'current'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['annotation-history', videoId, taskId ?? 'current'],
        }),
      ]);
    },
  });
}

export function useDeleteVideoAnnotation(videoId: string, taskId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (annotationId: string) =>
      annotationsApi.deleteAnnotation(videoId, annotationId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['annotations', videoId, taskId ?? 'current'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['annotation-history', videoId, taskId ?? 'current'],
        }),
      ]);
    },
  });
}

function useHistoryMutation(
  videoId: string,
  taskId: string | undefined,
  operation: 'undo' | 'redo',
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      operation === 'undo'
        ? annotationsApi.undoHistory(videoId, taskId)
        : annotationsApi.redoHistory(videoId, taskId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['annotations', videoId, taskId ?? 'current'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['annotation-history', videoId, taskId ?? 'current'],
        }),
      ]);
    },
  });
}

export function useUndoAnnotation(videoId: string, taskId?: string) {
  return useHistoryMutation(videoId, taskId, 'undo');
}

export function useRedoAnnotation(videoId: string, taskId?: string) {
  return useHistoryMutation(videoId, taskId, 'redo');
}

export function useReviewSuggestion(videoId: string, taskId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      modelEventKey,
      predictionId,
      decision,
      correction,
      reviewDurationMs,
    }: {
      modelEventKey: string;
      predictionId: string;
      decision: 'accepted' | 'corrected' | 'rejected';
      correction?: AnnotationWrite;
      reviewDurationMs?: number;
    }) =>
      annotationsApi.reviewSuggestion(videoId, modelEventKey, {
        predictionId,
        decision,
        taskId,
        correction,
        reviewDurationMs,
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

export function useAnalyzeAnnotationInterval(videoId: string) {
  return useMutation({
    mutationFn: (payload: {
      actionCode: string;
      startFrame: number;
      endFrame: number;
      searchRadius?: number;
    }) => annotationsApi.analyzeInterval(videoId, payload),
  });
}

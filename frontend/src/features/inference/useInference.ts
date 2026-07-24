import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import type { InferenceJob, VideoDescriptors } from '@/types/domain';

export function useStartInference() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { videoId: string, modelId?: string, modelVersion?: string, actions?: string[] }) => 
      apiClient.post<{ job_id: string, video_id: string, status: string, message: string }>(
        `/videos/${data.videoId}/infer`, 
        {
          model_id: data.modelId || 'cast-lstm-v6',
          model_version: data.modelVersion,
          actions: data.actions
        }
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['inferenceJobs', variables.videoId] });
    },
  });
}

export function useInferenceJob(jobId: string) {
  return useQuery<InferenceJob>({
    queryKey: ['inferenceJob', jobId],
    queryFn: () => apiClient.get<InferenceJob>(`/inference-jobs/${jobId}`),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'queued' || status === 'running') return 2000;
      return false;
    },
  });
}

export function useVideoPredictions(videoId: string, modelVersion?: string) {
  return useQuery({
    queryKey: ['predictions', videoId, modelVersion],
    queryFn: () => {
      const params = new URLSearchParams();
      if (modelVersion) params.append('model_version', modelVersion);
      return apiClient.get<any>(`/videos/${videoId}/predictions?${params.toString()}`);
    },
    enabled: !!videoId,
  });
}

export function useVideoDescriptors(videoId: string) {
  return useQuery<VideoDescriptors>({
    queryKey: ['descriptors', videoId],
    queryFn: () => apiClient.get<VideoDescriptors>(`/videos/${videoId}/descriptors`),
    enabled: !!videoId,
  });
}

export function useCancelJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobId: string) => apiClient.post(`/jobs/${jobId}/cancel`),
    onSuccess: (_, jobId) => {
      queryClient.invalidateQueries({ queryKey: ['inferenceJob', jobId] });
      queryClient.invalidateQueries({ queryKey: ['inferenceJobs'] });
    },
  });
}

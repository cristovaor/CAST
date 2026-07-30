import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { toast } from '@/app/stores/useToastStore';
import type { ModelVersion } from '@/types/domain';

export function useModelVersions(modelId?: string, action?: string, status?: string) {
  return useQuery<ModelVersion[]>({
    queryKey: ['models', { modelId, action, status }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (modelId) params.append('model_id', modelId);
      if (action) params.append('action', action);
      if (status) params.append('status', status);
      return apiClient.get<ModelVersion[]>(`/models?${params.toString()}`);
    },
  });
}

export function useModelVersion(modelId: string, version: string, action: string) {
  return useQuery<ModelVersion>({
    queryKey: ['models', modelId, version, action],
    queryFn: () => apiClient.get<ModelVersion>(`/models/${modelId}/versions/${version}/actions/${action}`),
    enabled: !!modelId && !!version && !!action,
  });
}

export function usePromoteModel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ versionId, targetStatus, notes }: { versionId: string, targetStatus: string, notes?: string }) => 
      apiClient.post<ModelVersion>(`/models/${versionId}/promote`, { target_status: targetStatus, notes }),
    onSuccess: (model, { targetStatus }) => {
      queryClient.invalidateQueries({ queryKey: ['models'] });
      toast.success('Modelo promovido', `${model.model_id} v${model.version} → ${targetStatus}`);
    },
  });
}

export function useDeleteModel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (versionId: string) => apiClient.delete(`/models/${versionId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['models'] });
      toast.success('Versão de modelo excluída');
    },
  });
}

export function useRegisterModel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { model_id: string, version: string, action: string, artifact_uri: string, manifest: Record<string, unknown> }) =>
      apiClient.post<ModelVersion>('/models', data),
    onSuccess: (model) => {
      queryClient.invalidateQueries({ queryKey: ['models'] });
      toast.success('Modelo registrado', `${model.model_id} v${model.version}`);
    },
  });
}

export interface TrainModelPayload {
  model_id: string;
  version: string;
  action?: string;
  actions?: string[];
  video_asset_ids?: string[];
  training_config?: Record<string, unknown>;
}

export interface TrainModelJob {
  action: string;
  job_id: string;
  status: string;
}

export interface TrainModelResponse {
  jobs: TrainModelJob[];
  skipped: string[];
  message: string;
}

export function useTrainModel() {
  return useMutation({
    mutationFn: (data: TrainModelPayload) =>
      apiClient.post<TrainModelResponse>('/models/train', data),
    onSuccess: (response) => {
      const started = response.jobs.length;
      toast.success(
        started === 1 ? 'Treino iniciado' : `${started} treinos iniciados`,
        response.skipped.length
          ? `Ignorado(s): ${response.skipped.join(', ')}`
          : response.message,
      );
    },
  });
}

export interface TrainJobStatus {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
  step: string;
  progress: number;
  error?: string | null;
  result?: { model_version_id: string, status: string } | null;
}

export function useTrainJobStatus(jobId: string) {
  return useQuery<TrainJobStatus>({
    queryKey: ['trainJob', jobId],
    queryFn: () => apiClient.get<TrainJobStatus>(`/models/train-jobs/${jobId}`),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'queued' || status === 'running') return 2000;
      return false;
    },
  });
}

export function useCancelTrainJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobId: string) => apiClient.post(`/models/train-jobs/${jobId}/cancel`),
    onSuccess: (_, jobId) => {
      queryClient.invalidateQueries({ queryKey: ['trainJob', jobId] });
      toast.info('Treino cancelado');
    },
  });
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['models'] });
    },
  });
}

export function useDeleteModel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (versionId: string) => apiClient.delete(`/models/${versionId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['models'] });
    },
  });
}

export function useRegisterModel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { model_id: string, version: string, action: string, artifact_uri: string, manifest: any }) => 
      apiClient.post<ModelVersion>('/models', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['models'] });
    },
  });
}

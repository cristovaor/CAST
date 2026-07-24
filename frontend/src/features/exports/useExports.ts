import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import type { ExportResponse, ExportDownloadResponse } from '@/types/api';

export function useRequestExport() {
  return useMutation({
    mutationFn: (data: { study_id: string; format: string }) => 
      apiClient.post<ExportResponse>('/exports', data),
  });
}

export function useExportDownloadUrl(jobId: string, enabled: boolean = false) {
  return useQuery<ExportDownloadResponse>({
    queryKey: ['exports', jobId],
    queryFn: () => apiClient.get<ExportDownloadResponse>(`/exports/${jobId}/download-url`),
    enabled: enabled && !!jobId,
    retry: 3, // Retry a few times if job is not ready yet
  });
}

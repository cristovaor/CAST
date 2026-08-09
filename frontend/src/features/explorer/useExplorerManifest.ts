import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import type { ExplorerManifest } from './types';

export function useExplorerManifest(sessionId?: string) {
  return useQuery<ExplorerManifest>({
    queryKey: ['explorer-manifest', sessionId],
    queryFn: () => apiClient.get<ExplorerManifest>(`/sessions/${sessionId}/explorer-manifest`),
    enabled: Boolean(sessionId),
  });
}


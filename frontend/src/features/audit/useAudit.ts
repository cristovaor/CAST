import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

export function useAuditLogs(skip: number = 0, limit: number = 100) {
  return useQuery({
    queryKey: ['audit', 'consents', skip, limit],
    queryFn: () => apiClient.get<any[]>(`/audit/consents?skip=${skip}&limit=${limit}`),
  });
}

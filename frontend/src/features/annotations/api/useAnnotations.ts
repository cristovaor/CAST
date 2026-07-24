import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

export function useGlobalAnnotations(skip: number = 0, limit: number = 100) {
  return useQuery({
    queryKey: ['annotations', 'global', skip, limit],
    queryFn: () => apiClient.get<any[]>(`/annotation-tasks/?skip=${skip}&limit=${limit}`),
  });
}

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import type { DashboardMetrics } from '@/types/api';

export function useDashboardData(studyId: string) {
  return useQuery<DashboardMetrics>({
    queryKey: ['dashboard', studyId],
    queryFn: () => apiClient.get<DashboardMetrics>(`/studies/${studyId}/dashboard`),
    enabled: !!studyId,
  });
}

export function useGlobalDashboard() {
  return useQuery<any>({
    queryKey: ['dashboard', 'global'],
    queryFn: () => apiClient.get<any>('/dashboard/global'),
  });
}

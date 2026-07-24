import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import type { DashboardMetrics } from '@/types/api';
import type { ChartDataPoint, ProcessingJob, Study, TimeSeriesPoint } from '@/types/domain';

interface DashboardGlobal {
  kpis: {
    active_projects: number;
    ongoing_studies: number;
    total_sessions: number;
    videos_processed: number;
    average_quality: number;
    failed_jobs: number;
  };
  processing_time_series: TimeSeriesPoint[];
  microaction_distribution: ChartDataPoint[];
  recent_jobs: ProcessingJob[];
  recent_studies: Study[];
}

export function useDashboardData(studyId: string) {
  return useQuery<DashboardMetrics>({
    queryKey: ['dashboard', studyId],
    queryFn: () => apiClient.get<DashboardMetrics>(`/studies/${studyId}/dashboard`),
    enabled: !!studyId,
  });
}

export function useGlobalDashboard() {
  return useQuery<DashboardGlobal>({
    queryKey: ['dashboard', 'global'],
    queryFn: () => apiClient.get<DashboardGlobal>('/dashboard/global'),
  });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { toast } from '@/app/stores/useToastStore';
import type { ProcessingJob } from '@/types/domain';

export function useJobs() {
  return useQuery<ProcessingJob[]>({
    queryKey: ['jobs'],
    queryFn: () => apiClient.get<ProcessingJob[]>('/jobs/'),
    refetchInterval: 10_000,
  });
}

function useJobMutation(action: 'cancel' | 'retry') {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobId: string) => apiClient.post<{ message: string }>(`/jobs/${jobId}/${action}`),
    onSuccess: (_, jobId) => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['jobs', jobId] });
      queryClient.invalidateQueries({ queryKey: ['videos'] });
      if (action === 'cancel') toast.info('Job cancelado');
      else toast.success('Job reenfileirado', 'O processamento será retomado em instantes.');
    },
  });
}

export function useCancelJob() {
  return useJobMutation('cancel');
}

export function useRetryJob() {
  return useJobMutation('retry');
}

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

interface CorrectionPayload {
  corrected_action: string;
  corrected_start_time: number;
  corrected_end_time: number;
}

interface CorrectionResponse {
  message: string;
  data: {
    event_id: string;
    task_id: string;
    action: string;
    start_time: number;
    end_time: number;
    is_corrected: boolean;
  };
}

export function useCorrectionExport() {
  const queryClient = useQueryClient();

  return useMutation<CorrectionResponse, Error, { annotationId: string; payload: CorrectionPayload }>({
    mutationFn: ({ annotationId, payload }) =>
      apiClient.post<CorrectionResponse>(`/annotation-tasks/../annotations/${annotationId}/correct_and_export`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['annotations'] });
    },
  });
}

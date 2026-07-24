import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import type { Participant, PaginatedResponse } from '@/types/domain';

export function useParticipants(skip = 0, limit = 100) {
  return useQuery<PaginatedResponse<Participant>>({
    queryKey: ['participants', skip, limit],
    queryFn: () => apiClient.get<PaginatedResponse<Participant>>(`/participants?skip=${skip}&limit=${limit}`),
  });
}

export function useCreateParticipant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<Participant>) => apiClient.post<Participant>('/participants', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['participants'] });
    },
  });
}

export function useRequestParticipantDeletion() {
  return useMutation({
    mutationFn: (participantId: string) => apiClient.post(`/participants/${participantId}/deletion-request`),
  });
}

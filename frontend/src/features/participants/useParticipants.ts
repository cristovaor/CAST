import i18n from '@/i18n';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { toast } from '@/app/stores/useToastStore';
import type {
  Participant,
  ParticipantCreate,
  ParticipantUpdate,
  PaginatedResponse,
} from '@/types/domain';

export function useParticipants(skip = 0, limit = 100) {
  return useQuery<PaginatedResponse<Participant>>({
    queryKey: ['participants', skip, limit],
    queryFn: async () => {
      const items = await apiClient.get<Participant[]>(`/participants/?skip=${skip}&limit=${limit}`);
      return { items, total: items.length, page: 1, page_size: limit };
    },
  });
}

export function useCreateParticipant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ParticipantCreate) => apiClient.post<Participant>('/participants/', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['participants'] });
      toast.success(i18n.t('participants:toasts.created'));
    },
  });
}

export function useUpdateParticipant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...data }: ParticipantUpdate & { id: string }) =>
      apiClient.patch<Participant>(`/participants/${id}`, data),
    onSuccess: (participant) => {
      queryClient.invalidateQueries({ queryKey: ['participants'] });
      queryClient.invalidateQueries({ queryKey: ['audit', 'history', 'participant', participant.id] });
      queryClient.invalidateQueries({ queryKey: ['audit', 'history', 'all'] });
      toast.success(i18n.t('participants:toasts.updated'));
    },
  });
}

export function useDeactivateParticipant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiClient.post<Participant>(`/participants/${id}/deactivate`, { reason }),
    onSuccess: (participant) => {
      queryClient.invalidateQueries({ queryKey: ['participants'] });
      queryClient.invalidateQueries({ queryKey: ['audit', 'history', 'participant', participant.id] });
      queryClient.invalidateQueries({ queryKey: ['audit', 'history', 'all'] });
      toast.success(i18n.t('participants:toasts.deactivated'));
    },
  });
}

export function useActivateParticipant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<Participant>(`/participants/${id}/activate`),
    onSuccess: (participant) => {
      queryClient.invalidateQueries({ queryKey: ['participants'] });
      queryClient.invalidateQueries({ queryKey: ['audit', 'history', 'participant', participant.id] });
      queryClient.invalidateQueries({ queryKey: ['audit', 'history', 'all'] });
      toast.success(i18n.t('participants:toasts.reactivated'));
    },
  });
}

export function useRequestParticipantDeletion() {
  return useMutation({
    mutationFn: (participantId: string) => apiClient.post(`/participants/${participantId}/deletion-request`),
    onSuccess: () => {
      toast.success(i18n.t('participants:toasts.deletionRequested'), i18n.t('participants:toasts.deletionRequestedDetail'));
    },
  });
}

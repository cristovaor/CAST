import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import type { User } from '@/types/domain';

export interface AnnotationTaskListItem {
  id: string;
  video_id: string;
  assignee_id: string;
  assignee_name: string;
  status: 'pending' | 'in_progress' | 'submitted' | 'reviewed';
  created_at?: string | null;
}

export function useGlobalAnnotations(skip: number = 0, limit: number = 100) {
  return useQuery<AnnotationTaskListItem[]>({
    queryKey: ['annotations', 'global', skip, limit],
    queryFn: () => apiClient.get<AnnotationTaskListItem[]>(`/annotation-tasks/?skip=${skip}&limit=${limit}`),
  });
}

export function useAnnotationAssignees() {
  return useQuery<User[]>({
    queryKey: ['users', 'annotation-assignees'],
    queryFn: () => apiClient.get<User[]>('/users/'),
  });
}

export function useCreateAnnotationTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { video_id: string; assignee_id: string }) =>
      apiClient.post<{ task_id: string }>('/annotation-tasks/', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['annotations', 'global'] });
    },
  });
}

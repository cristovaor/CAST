import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import type { User } from '@/types/domain';

export interface OrganizationSettings {
  id: string;
  name: string;
  plan: string;
  max_storage_gb: number;
  used_storage_gb: number;
}

export interface PipelineSettings {
  face_detection_threshold: number;
  blink_tolerance_frames: number;
  enable_head_pose_estimation: boolean;
}

export function useOrganizationSettings() {
  return useQuery<OrganizationSettings>({
    queryKey: ['settings', 'organization'],
    queryFn: () => apiClient.get<OrganizationSettings>('/settings/organization'),
  });
}

export function usePipelineSettings() {
  return useQuery<PipelineSettings>({
    queryKey: ['settings', 'pipeline'],
    queryFn: () => apiClient.get<PipelineSettings>('/settings/pipeline'),
  });
}

export function useUpdatePipelineSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: PipelineSettings) =>
      apiClient.patch<PipelineSettings>('/settings/pipeline', payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', 'pipeline'] }),
  });
}

export function useOrganizationUsers() {
  return useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => apiClient.get<User[]>('/users/'),
  });
}

export interface CreateOrganizationUser {
  email: string;
  password: string;
  name: string;
  role: User['role'];
}

export function useCreateOrganizationUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateOrganizationUser) => apiClient.post<User>('/users/', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['audit', 'history', 'all'] });
    },
  });
}

export function useUpdateOrganizationUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: Pick<User, 'id' | 'name' | 'role'>) =>
      apiClient.patch<User>(`/users/${id}`, payload),
    onSuccess: (user) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['audit', 'history', 'user', user.id] });
      queryClient.invalidateQueries({ queryKey: ['audit', 'history', 'all'] });
    },
  });
}

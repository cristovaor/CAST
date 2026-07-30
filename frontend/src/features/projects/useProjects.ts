import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_BASE_URL, apiClient } from '@/lib/api';
import { toast } from '@/app/stores/useToastStore';
import type { Project, StudyStatus } from '@/types/domain';

export interface ProjectUpdate {
  name?: string;
  description?: string;
  status?: StudyStatus;
}

export function useProjects() {
  return useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: () => apiClient.get<Project[]>('/projects'),
  });
}

export function useProject(id: string) {
  return useQuery<Project>({
    queryKey: ['projects', id],
    queryFn: () => apiClient.get<Project>(`/projects/${id}`),
    enabled: !!id,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { name: string; description?: string }) => 
      apiClient.post<Project>('/projects', data),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Projeto criado', project.name);
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...data }: ProjectUpdate & { id: string }) =>
      apiClient.patch<Project>(`/projects/${id}`, data),
    onSuccess: (project) => {
      queryClient.setQueryData(['projects', project.id], project);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['audit', 'history', 'project', project.id] });
      queryClient.invalidateQueries({ queryKey: ['audit', 'history', 'all'] });
      toast.success('Projeto atualizado', project.name);
    },
  });
}

export function useArchiveProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.patch<Project>(`/projects/${id}`, { status: 'archived' }),
    onSuccess: (project) => {
      queryClient.setQueryData(['projects', project.id], project);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Projeto arquivado', project.name);
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/projects/${id}`),
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: ['projects', id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Projeto excluído');
    },
  });
}

export function useExportProject() {
  return useMutation({
    mutationFn: async (projectId: string) => {
      const token = localStorage.getItem('cast_token');
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const response = await fetch(`${API_BASE_URL}/projects/${projectId}/export`, { headers });
      if (!response.ok) {
        let message = 'Erro na exportação do projeto';
        try {
          const payload = await response.json() as { detail?: string };
          message = payload.detail ?? message;
        } catch {
          // Keep the user-facing fallback when the response is not JSON.
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `export_project_${projectId}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      toast.success('Exportação concluída', 'O download do CSV foi iniciado.');
    },
  });
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import type { Study } from '@/types/api';
import type { StudyCreate } from '@/types/domain';

export interface ModalityQualitySummary {
  total_assets: number;
  assessed_assets: number;
  average_valid_ratio: number | null;
  average_face_detection_rate: number | null;
  findings_count: number;
  verdicts: Record<string, number>;
}

export interface StudyQualitySummary {
  study_id: string;
  sessions_count: number;
  video: ModalityQualitySummary;
  eeg: ModalityQualitySummary;
}

export function useStudies() {
  return useQuery<Study[]>({
    queryKey: ['studies'],
    queryFn: () => apiClient.get<Study[]>('/studies'),
  });
}

export function useStudy(id: string) {
  return useQuery<Study>({
    queryKey: ['studies', id],
    queryFn: () => apiClient.get<Study>(`/studies/${id}`),
    enabled: !!id,
  });
}

export function useStudyQualitySummary(id: string) {
  return useQuery<StudyQualitySummary>({
    queryKey: ['studies', id, 'quality-summary'],
    queryFn: () => apiClient.get<StudyQualitySummary>(`/studies/${id}/quality-summary`),
    enabled: !!id,
  });
}

export function useCreateStudy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: StudyCreate) => apiClient.post<Study>('/studies', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['studies'] });
    },
  });
}

export function useUpdateStudy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Study> & { id: string }) => 
      apiClient.patch<Study>(`/studies/${id}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['studies'] });
      queryClient.invalidateQueries({ queryKey: ['studies', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['audit', 'history', 'study', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['audit', 'history', 'all'] });
    },
  });
}

export function useBatchInfer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (studyId: string) => apiClient.post(`/studies/${studyId}/batch-infer`),
    onSuccess: (_, studyId) => {
      queryClient.invalidateQueries({ queryKey: ['studies', studyId] });
      queryClient.invalidateQueries({ queryKey: ['videos'] });
    },
  });
}

export function useExportStudy() {
  return useMutation({
    mutationFn: (studyId: string) => {
      // Direct fetch to handle file download natively
      const token = localStorage.getItem('cast_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8080/api/v1';
      
      return fetch(`${BASE_URL}/studies/${studyId}/export`, { headers })
        .then(async (res) => {
          if (!res.ok) throw new Error('Erro na exportação');
          const blob = await res.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `export_study_${studyId}.csv`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          a.remove();
        });
    }
  });
}

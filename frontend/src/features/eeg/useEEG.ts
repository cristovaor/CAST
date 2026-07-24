import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, API_BASE_URL } from '@/lib/api';

export interface EEGTimeSeries {
  timestamp_ms: number;
  alpha?: number;
  beta?: number;
  theta?: number;
  delta?: number;
  gamma?: number;
  [key: string]: number | string | undefined;
}

export interface EEGAssetData {
  eeg_asset_id: string;
  filename: string;
  sync_offset_ms: number;
  data: EEGTimeSeries[];
}

// Module-level so React Query memoizes the result (an inline select would
// re-sort on every render). Charts rely on data sorted by timestamp_ms.
function sortTimeseries(raw: EEGAssetData): EEGAssetData {
  return {
    ...raw,
    data: [...raw.data].sort((a, b) => a.timestamp_ms - b.timestamp_ms),
  };
}

export function useEEGData(eegId?: string) {
  return useQuery<EEGAssetData>({
    queryKey: ['eeg', eegId],
    queryFn: () => apiClient.get<EEGAssetData>(`/eeg/${eegId}/timeseries`),
    enabled: !!eegId,
    select: sortTimeseries,
  });
}

export interface EEGBandStat {
  during: number | null;
  baseline: number | null;
  delta_pct: number | null;
  p_value: number | null;
  cohens_d: number | null;
  significant: boolean;
}

export interface EEGCoactivationAction {
  action: string;
  n_events: number;
  total_ms: number;
  sample_count: number;
  bands: Record<string, EEGBandStat>;
}

export interface EEGCoactivation {
  eeg_asset_id: string;
  sync_offset_ms: number;
  bands: string[];
  baseline_sample_count: number;
  alpha: number;
  actions: EEGCoactivationAction[];
}

export function useEEGCoactivation(eegId?: string) {
  return useQuery<EEGCoactivation>({
    queryKey: ['eeg', eegId, 'coactivation'],
    queryFn: () => apiClient.get<EEGCoactivation>(`/eeg/${eegId}/coactivation`),
    enabled: !!eegId,
  });
}

export function useUpdateEEGOffset(eegId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sync_offset_ms: number) =>
      apiClient.patch<{ eeg_asset_id: string; sync_offset_ms: number }>(`/eeg/${eegId}`, { sync_offset_ms }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eeg', eegId] });
    },
  });
}

export function useUploadEEG() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { participant_id: string; session_id?: string; file: File }) => {
      const formData = new FormData();
      formData.append('participant_id', data.participant_id);
      if (data.session_id) formData.append('session_id', data.session_id);
      formData.append('file', data.file);
      
      const token = localStorage.getItem('cast_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      
      return fetch(`${API_BASE_URL}/eeg/upload-proxy`, {
        method: 'POST',
        headers,
        body: formData,
      }).then(async res => {
        if (!res.ok) throw new Error("Falha no upload do EEG");
        return res.json() as Promise<{ eeg_asset_id: string, session_id: string }>;
      });
    },
    onSuccess: (_, variables) => {
      if (variables.session_id) {
        queryClient.invalidateQueries({ queryKey: ['sessions', variables.session_id] });
      }
      queryClient.invalidateQueries({ queryKey: ['videos'] });
    }
  });
}

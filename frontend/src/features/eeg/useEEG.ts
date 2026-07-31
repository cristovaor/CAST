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
  sync_transform: SyncTransform;
  data: EEGTimeSeries[];
  source?: 'analysis-run' | 'legacy-csv';
  analysis_run_id?: string | null;
  units?: Record<string, string>;
}

export interface SyncTransform {
  mapping_version: string;
  approved: boolean;
  offset_ms: number;
  drift_ms_per_min: number;
  quality_grade?: string | null;
  uncertainty_ms?: number | null;
  approved_run_id?: string;
}

export function videoToEegMs(videoMs: number, mapping?: SyncTransform) {
  const slope = 1 + (mapping?.drift_ms_per_min ?? 0) / 60000;
  return videoMs * slope - (mapping?.offset_ms ?? 0);
}

export function eegToVideoMs(eegMs: number, mapping?: SyncTransform) {
  const slope = 1 + (mapping?.drift_ms_per_min ?? 0) / 60000;
  return (eegMs + (mapping?.offset_ms ?? 0)) / slope;
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
  q_value?: number;
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
  sync_transform: SyncTransform;
  bands: string[];
  baseline_sample_count: number;
  alpha: number;
  actions: EEGCoactivationAction[];
  analysis_run_id?: string | null;
  source?: 'analysis-run' | 'legacy-csv';
  roi?: string | null;
  multiple_comparisons?: string;
  caveat?: string;
}

export function useEEGCoactivation(eegId?: string, runId?: string, roi?: string) {
  const search = new URLSearchParams();
  if (runId) search.set('run_id', runId);
  if (roi) search.set('roi', roi);
  return useQuery<EEGCoactivation>({
    queryKey: ['eeg', eegId, 'coactivation', runId, roi],
    queryFn: () => apiClient.get<EEGCoactivation>(
      `/eeg/${eegId}/coactivation${search.size ? `?${search}` : ''}`,
    ),
    enabled: !!eegId,
  });
}

export type EEGRunStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'partial'
  | 'failed'
  | 'canceled';

export interface EEGAnalysisRun {
  id: string;
  eeg_asset_id?: string | null;
  study_id?: string | null;
  job_id?: string | null;
  scope_type: 'session' | 'study';
  pipeline: 'individual' | 'study' | 'mdmp' | 'multimodal';
  profile: 'custom' | 'pyp_eeg_v2';
  parameters: Record<string, unknown>;
  input_manifest: {
    file_id: string;
    eeg_asset_id: string;
    filename: string;
    role: string;
    size_bytes: number;
    checksum_sha256: string;
    is_primary: boolean;
  }[];
  input_hash: string;
  package_version?: string | null;
  upstream_commit?: string | null;
  mdmp_version?: string | null;
  mdmp_commit?: string | null;
  status: EEGRunStatus;
  step_status: Record<string, { status: string; at?: string; message?: string }>;
  warnings: string[];
  error_message?: string | null;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  reused?: boolean;
}

export interface EEGAnalysisArtifact {
  id: string;
  kind: string;
  content_type: string;
  size_bytes: number;
  checksum_sha256: string;
  units?: string | null;
  metadata_info: Record<string, unknown>;
  created_at: string;
  download_url?: string | null;
}

export interface EEGResultEnvelope {
  schema: 'eeg-result-v1';
  units?: Record<string, string>;
  provenance?: Record<string, unknown>;
  power?: Record<string, unknown>[];
  frequencies?: number[];
  psd?: number[][];
  channels?: string[];
  points?: {
    time_seconds: number;
    state: string;
    roi?: string | null;
    channel?: string | null;
    band: string;
    metric: string;
    value: number;
  }[];
  results?: Record<string, unknown>[];
  topomaps?: Record<string, unknown>[];
  nodes?: { id: string; label: string }[];
  edges?: { source: string; target: string; directed: boolean }[];
  networks?: Record<string, unknown>[];
  sample_count?: number;
  warnings?: string[];
}

export function useEEGAnalysisRuns(eegId?: string) {
  return useQuery<EEGAnalysisRun[]>({
    queryKey: ['eeg-analysis-runs', eegId],
    queryFn: () => apiClient.get<EEGAnalysisRun[]>(`/eeg/${eegId}/analysis-runs`),
    enabled: !!eegId,
    refetchInterval: (query) => (
      query.state.data?.some((run) => ['queued', 'running'].includes(run.status))
        ? 2000
        : false
    ),
  });
}

export function useStudyEEGAnalysisRuns(studyId?: string) {
  return useQuery<EEGAnalysisRun[]>({
    queryKey: ['study-eeg-analysis-runs', studyId],
    queryFn: () => apiClient.get<EEGAnalysisRun[]>(
      `/studies/${studyId}/eeg-analysis-runs`,
    ),
    enabled: !!studyId,
    refetchInterval: (query) => (
      query.state.data?.some((run) => ['queued', 'running'].includes(run.status))
        ? 2000
        : false
    ),
  });
}

export interface EEGAnalysisRunInput {
  profile: 'custom' | 'pyp_eeg_v2';
  pipeline?: 'individual' | 'study' | 'mdmp' | 'multimodal';
  parameters?: Record<string, unknown>;
  reuse_completed?: boolean;
}

export function useCreateEEGAnalysisRun(eegId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: EEGAnalysisRunInput) => apiClient.post<EEGAnalysisRun>(`/eeg/${eegId}/analysis-runs`, {
      pipeline: 'individual',
      parameters: {},
      reuse_completed: true,
      ...payload,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eeg-analysis-runs', eegId] });
    },
  });
}

export function useCreateStudyEEGAnalysisRun(studyId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: EEGAnalysisRunInput) => apiClient.post<EEGAnalysisRun>(
      `/studies/${studyId}/eeg-analysis-runs`,
      {
        pipeline: 'study',
        parameters: {},
        reuse_completed: true,
        ...payload,
      },
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['study-eeg-analysis-runs', studyId] });
    },
  });
}

export function useEEGAnalysisArtifacts(runId?: string) {
  return useQuery<EEGAnalysisArtifact[]>({
    queryKey: ['eeg-analysis-artifacts', runId],
    queryFn: () => apiClient.get<EEGAnalysisArtifact[]>(
      `/eeg/analysis-runs/${runId}/artifacts`,
    ),
    enabled: !!runId,
  });
}

export function useEEGAnalysisResult(
  runId: string | undefined,
  resultType: 'power' | 'timeseries' | 'stats' | 'topomaps' | 'mdmp',
) {
  return useQuery<EEGResultEnvelope>({
    queryKey: ['eeg-analysis-result', runId, resultType],
    queryFn: () => apiClient.get<EEGResultEnvelope>(
      `/eeg/analysis-runs/${runId}/results/${resultType}`,
    ),
    enabled: !!runId,
    retry: false,
  });
}

export async function downloadEEGArtifact(artifact: EEGAnalysisArtifact) {
  if (!artifact.download_url) return;
  const path = artifact.download_url.replace(API_BASE_URL, '');
  const response = await apiClient.get<{ url: string }>(path);
  window.open(response.url, '_blank', 'noopener,noreferrer');
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

// React Query hooks for the multimodal backend surface: session detail,
// EEG metadata & quality, synchronization, datasets, variables and governance.
// Mirrors the FastAPI routes added under /sessions, /eeg, /sync, /datasets,
// /variables and /governance.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, uploadApiForm } from '@/lib/api';

// ─── Sessions ────────────────────────────────────────────────

export interface SessionDetailDTO {
  id: string;
  participant_id: string;
  state: string;
  condition?: string | null;
  protocol?: string | null;
  operator?: string | null;
  recorded_at?: string | null;
  duration_seconds?: number | null;
  notes?: string | null;
  created_at: string;
  video_asset_id?: string | null;
  eeg_asset_id?: string | null;
  sync_state?: string | null;
}

export function useSessionDetail(sessionId?: string) {
  return useQuery<SessionDetailDTO>({
    queryKey: ['session', sessionId],
    queryFn: () => apiClient.get<SessionDetailDTO>(`/sessions/${sessionId}`),
    enabled: !!sessionId,
  });
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function useSessionByReference(reference?: string) {
  return useQuery<SessionDetailDTO>({
    queryKey: ['session-reference', reference],
    queryFn: () => {
      if (!reference) throw new Error('Referência de sessão ausente');
      const path = UUID_PATTERN.test(reference)
        ? `/sessions/${reference}`
        : `/sessions/resolve?ref=${encodeURIComponent(reference)}`;
      return apiClient.get<SessionDetailDTO>(path);
    },
    enabled: !!reference,
    retry: false,
  });
}

export interface SessionCreateDTO {
  participant_id: string;
  condition?: string;
  protocol?: string;
  operator?: string;
  recorded_at?: string;
  duration_seconds?: number;
  notes?: string;
}

export function useCreateSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SessionCreateDTO) =>
      apiClient.post<SessionDetailDTO>('/sessions/', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  });
}

export function useUpdateSession(sessionId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<SessionDetailDTO>) =>
      apiClient.patch<SessionDetailDTO>(`/sessions/${sessionId}`, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['session', sessionId] });
      qc.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}

// ─── EEG detail & quality ────────────────────────────────────

export interface EEGChannelQualityDTO {
  name: string;
  status: string;
  impedance_kohm?: number | null;
  valid_ratio: number;
  notes?: string | null;
}

export interface EEGQualityFindingDTO {
  id: string;
  issue: string;
  evidence: string;
  impact: string;
  recommendation: string;
  reprocessable: boolean;
  tone: string;
}

export interface EEGAssetDetailDTO {
  id: string;
  session_id: string;
  filename?: string;
  eeg_format?: string;
  device?: string;
  manufacturer?: string;
  model?: string;
  channel_count?: number;
  channel_names: string[];
  montage?: string;
  reference?: string;
  sample_rate_hz?: number;
  resolution_bits?: number;
  units?: string;
  duration_seconds?: number;
  event_count?: number;
  sync_offset_ms: number;
  quality_verdict?: string;
  valid_ratio?: number;
  channel_quality: EEGChannelQualityDTO[];
  quality_findings: EEGQualityFindingDTO[];
  quality_criteria: string[];
  files: {
    id: string;
    role: string;
    filename: string;
    mime_type: string;
    size_bytes: number;
    checksum_sha256: string;
    is_primary: boolean;
    verified_at?: string | null;
    created_at: string;
  }[];
}

export function useEEGAsset(eegId?: string) {
  return useQuery<EEGAssetDetailDTO>({
    queryKey: ['eeg-asset', eegId],
    queryFn: () => apiClient.get<EEGAssetDetailDTO>(`/eeg/${eegId}`),
    enabled: !!eegId,
  });
}

export function useEEGQualityCheck(eegId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post<EEGAssetDetailDTO>(`/eeg/${eegId}/quality-check`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['eeg-asset', eegId] }),
  });
}

// Parses the raw EEG file for real metadata + quality (EDF/BrainVision/FIF/CSV).
// `sync=true` forces inline parsing when no Celery worker is running.
export function useParseEEG(eegId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opts?: { sync?: boolean }) =>
      apiClient.post<EEGAssetDetailDTO>(`/eeg/${eegId}/parse${opts?.sync ? '?sync=true' : ''}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['eeg-asset', eegId] }),
  });
}

export interface EEGQualityDecisionDTO {
  quality_verdict: string;
  valid_ratio: number;
  channel_quality: EEGChannelQualityDTO[];
  quality_findings: EEGQualityFindingDTO[];
  quality_criteria: string[];
}

export function useSetEEGQuality(eegId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: EEGQualityDecisionDTO) =>
      apiClient.put<EEGAssetDetailDTO>(`/eeg/${eegId}/quality`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['eeg-asset', eegId] }),
  });
}

// ─── Synchronization ─────────────────────────────────────────

export interface SyncCapabilityDTO {
  method: string;
  status: 'available' | 'requires_input' | 'requires_inputs' | 'insufficient_evidence';
  missing_inputs: string[];
  description: string;
}

export interface SyncEvidenceDTO {
  id: string;
  session_id: string;
  kind: string;
  filename?: string | null;
  content_type?: string | null;
  checksum_sha256: string;
  payload: Record<string, unknown>;
  metadata_info: Record<string, unknown>;
  created_by: string;
  created_at: string;
}

export interface SyncRunDTO {
  id: string;
  session_id: string;
  job_id?: string | null;
  method: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
  outcome?: string | null;
  algorithm_version: string;
  input_manifest: Record<string, unknown>;
  parameters: Record<string, unknown>;
  result: Record<string, unknown>;
  metrics: Record<string, unknown>;
  quality_grade?: string | null;
  uncertainty_ms?: number | null;
  error_message?: string | null;
  review_decision?: 'approved' | 'rejected' | null;
  review_justification?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
}

export interface SyncDTO {
  id?: string | null;
  session_id: string;
  state: string;
  method?: string | null;
  offset_ms: number;
  drift_ms_per_min?: number | null;
  confidence?: number | null;
  anchors: { label: string; video_time_ms: number; eeg_time_ms: number }[];
  history: { at: string; action: string; note?: string }[];
  justification?: string | null;
  approved_run_id?: string | null;
  mapping_version: string;
  quality_grade?: string | null;
  uncertainty_ms?: number | null;
  duration_ms?: number | null;
  capabilities: SyncCapabilityDTO[];
  latest_run?: SyncRunDTO | null;
  approved_run?: SyncRunDTO | null;
  updated_at?: string | null;
}

export interface SyncRunStartDTO {
  run_id: string;
  job_id: string;
  status: string;
  reused: boolean;
}

export interface ProcessingJobDTO {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
  step: string;
  progress: number;
  error?: string | null;
  result: Record<string, unknown>;
}

export function useSync(sessionId?: string) {
  return useQuery<SyncDTO>({
    queryKey: ['sync', sessionId],
    queryFn: () => apiClient.get<SyncDTO>(`/sync/${sessionId}`),
    enabled: !!sessionId,
  });
}

export function useSyncEvidence(sessionId?: string) {
  return useQuery<SyncEvidenceDTO[]>({
    queryKey: ['sync-evidence', sessionId],
    queryFn: () => apiClient.get<SyncEvidenceDTO[]>(`/sync/${sessionId}/evidence`),
    enabled: !!sessionId,
  });
}

export function useUploadSyncEvidence(sessionId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      kind: string;
      file?: File | null;
      payload?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
    }) => {
      const form = new FormData();
      form.set('kind', input.kind);
      form.set('payload_json', JSON.stringify(input.payload ?? {}));
      form.set('metadata_json', JSON.stringify(input.metadata ?? {}));
      if (input.file) form.set('file', input.file);
      return uploadApiForm<SyncEvidenceDTO>(`/sync/${sessionId}/evidence`, form);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sync-evidence', sessionId] });
      qc.invalidateQueries({ queryKey: ['sync', sessionId] });
    },
  });
}

export function useDeleteSyncEvidence(sessionId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (evidenceId: string) =>
      apiClient.delete<void>(`/sync/${sessionId}/evidence/${evidenceId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sync-evidence', sessionId] });
      qc.invalidateQueries({ queryKey: ['sync', sessionId] });
    },
  });
}

export function useSyncRuns(sessionId?: string) {
  return useQuery<SyncRunDTO[]>({
    queryKey: ['sync-runs', sessionId],
    queryFn: () => apiClient.get<SyncRunDTO[]>(`/sync/${sessionId}/runs`),
    enabled: !!sessionId,
  });
}

export function useSyncRun(sessionId?: string, runId?: string) {
  return useQuery<SyncRunDTO>({
    queryKey: ['sync-run', sessionId, runId],
    queryFn: () => apiClient.get<SyncRunDTO>(`/sync/${sessionId}/runs/${runId}`),
    enabled: !!sessionId && !!runId,
    refetchInterval: (query) =>
      ['queued', 'running'].includes(query.state.data?.status ?? '') ? 1500 : false,
  });
}

export function useSyncJob(jobId?: string) {
  return useQuery<ProcessingJobDTO>({
    queryKey: ['job', jobId],
    queryFn: () => apiClient.get<ProcessingJobDTO>(`/jobs/${jobId}`),
    enabled: !!jobId,
    refetchInterval: (query) =>
      ['queued', 'running'].includes(query.state.data?.status ?? '') ? 1500 : false,
  });
}

export function useCreateSyncRun(sessionId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      method: string;
      evidence_ids: string[];
      parameters: Record<string, unknown>;
      anchors: { label: string; video_time_ms: number; eeg_time_ms: number }[];
    }) => apiClient.post<SyncRunStartDTO>(`/sync/${sessionId}/runs`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sync-runs', sessionId] });
      qc.invalidateQueries({ queryKey: ['sync', sessionId] });
    },
  });
}

export function useSyncRunDecision(sessionId?: string, runId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (decision: { approve: boolean; justification: string }) =>
      apiClient.post<SyncDTO>(`/sync/${sessionId}/runs/${runId}/decision`, decision),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sync', sessionId] });
      qc.invalidateQueries({ queryKey: ['sync-runs', sessionId] });
      qc.invalidateQueries({ queryKey: ['sync-run', sessionId, runId] });
      qc.invalidateQueries({ queryKey: ['session', sessionId] });
    },
  });
}

export function useCancelSyncJob(jobId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post<{ message: string }>(`/jobs/${jobId}/cancel`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['job', jobId] }),
  });
}

export function useRetrySyncJob(jobId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post<{ message: string }>(`/jobs/${jobId}/retry`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['job', jobId] }),
  });
}

export function useUpdateSync(sessionId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Pick<SyncDTO, 'method' | 'offset_ms' | 'drift_ms_per_min' | 'confidence' | 'anchors'>>) =>
      apiClient.patch<SyncDTO>(`/sync/${sessionId}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sync', sessionId] }),
  });
}

// Proposes an offset via cross-correlation (docs §11); lands in
// auto_available. `sync=true` runs inline without a Celery worker.
export function useDetectSync(sessionId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post<SyncRunStartDTO>(`/sync/${sessionId}/runs`, {
      method: 'event_correlation',
      evidence_ids: [],
      parameters: {},
      anchors: [],
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sync', sessionId] });
      qc.invalidateQueries({ queryKey: ['sync-runs', sessionId] });
    },
  });
}

export function useSyncDecision(sessionId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: { approve: boolean; justification: string }) =>
      apiClient.post<SyncDTO>(`/sync/${sessionId}/decision`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sync', sessionId] });
      qc.invalidateQueries({ queryKey: ['session', sessionId] });
    },
  });
}

// ─── Datasets ────────────────────────────────────────────────

export interface DatasetDTO {
  id: string;
  name: string;
  dataset_version: string;
  level?: string;
  state: string;
  manifest: Record<string, unknown>;
  participant_count: number;
  session_count: number;
  checksum?: string;
  owner?: string;
  build_status?: string | null;
  build_error?: string | null;
  excluded_sessions?: { session_id: string; reason: string }[];
  lineage?: Record<string, unknown>;
  storage_uri?: string | null;
  created_at: string;
  built_at?: string | null;
  frozen_at?: string | null;
}

export function useDatasets() {
  return useQuery<DatasetDTO[]>({
    queryKey: ['datasets'],
    queryFn: () => apiClient.get<DatasetDTO[]>(`/datasets/`),
    refetchInterval: (query) =>
      query.state.data?.some((dataset) =>
        dataset.state === 'building' || dataset.build_status === 'building'
      ) ? 2000 : false,
    refetchOnWindowFocus: true,
  });
}

export interface DatasetLandmarkInfo {
  artifact_id: string;
  status: string;
  extractor?: string | null;
  extractor_version?: string | null;
  frame_count?: number | null;
  point_count?: number | null;
  face_detection_rate?: number | null;
  chunk_size_frames?: number | null;
  normalized_checksum?: string | null;
}

export interface DatasetRecord {
  session_id: string;
  study_id: string;
  participant_code: string;
  condition?: string | null;
  state?: string | null;
  video?: {
    id?: string | null;
    filename?: string | null;
    verdict?: string | null;
    landmarks?: DatasetLandmarkInfo | null;
  } | null;
  eeg?: {
    id?: string | null;
    filename?: string | null;
    channel_count?: number | null;
    sample_rate_hz?: number | null;
    valid_ratio?: number | null;
    verdict?: string | null;
  } | null;
  sync?: {
    state?: string | null;
    offset_ms?: number | null;
    drift_ms_per_min?: number | null;
    confidence?: number | null;
  } | null;
}

export interface DatasetRecordsResponse {
  dataset_id: string;
  dataset_version: string;
  checksum?: string | null;
  total: number;
  skip: number;
  limit: number;
  records: DatasetRecord[];
  excluded: { session_id: string; reason: string }[];
  schema: Record<string, string>;
  summary: {
    record_count: number;
    modality_coverage: {
      video: number;
      eeg: number;
      multimodal: number;
      landmarks_ready: number;
    };
    sync: {
      states: Record<string, number>;
      approved: number;
      coverage_ratio: number;
      offset_ms_mean?: number | null;
      offset_ms_median?: number | null;
      offset_ms_range?: [number, number] | null;
      drift_ms_per_min_mean?: number | null;
      confidence_mean?: number | null;
      confidence_n: number;
    };
    eeg: {
      valid_ratio_mean?: number | null;
      valid_ratio_range?: [number, number] | null;
      valid_ratio_n: number;
    };
  };
}

export function useDatasetRecords(datasetId?: string) {
  return useQuery<DatasetRecordsResponse>({
    queryKey: ['dataset-records', datasetId],
    queryFn: () =>
      apiClient.get<DatasetRecordsResponse>(`/datasets/${datasetId}/records?limit=200`),
    enabled: Boolean(datasetId),
    retry: false,
  });
}

export function useCreateDataset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      name: string;
      dataset_version: string;
      level?: string;
      manifest?: Record<string, unknown>;
    }) => apiClient.post<DatasetDTO>('/datasets/', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['datasets'] }),
  });
}

export function useFreezeDataset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post<DatasetDTO>(`/datasets/${id}/freeze`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['datasets'] }),
  });
}

export interface DatasetBuildCriteria {
  study_ids?: string[];
  conditions?: string[];
  modalities?: string[];
  states?: string[];
  require_sync?: boolean;
  require_consent?: boolean;
  min_eeg_valid_ratio?: number | null;
}

export interface DatasetBuildPreview {
  included: number;
  excluded: number;
  excluded_sample: { session_id: string; reason: string }[];
  participant_count: number;
  conditions: string[];
}

export function usePreviewDataset() {
  return useMutation({
    mutationFn: (criteria: DatasetBuildCriteria) =>
      apiClient.post<DatasetBuildPreview>('/datasets/preview', criteria),
  });
}

export function useBuildDataset() {
  const qc = useQueryClient();
  return useMutation({
    // sync=true so the materialization runs inline without a Celery worker.
    mutationFn: ({ datasetId, criteria }: { datasetId: string; criteria: DatasetBuildCriteria }) =>
      apiClient.post<DatasetDTO>(`/datasets/${datasetId}/build?sync=true`, criteria),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['datasets'] }),
  });
}

// ─── Variables ───────────────────────────────────────────────

export interface VariableDTO {
  id: string;
  study_id: string;
  name: string;
  code: string;
  var_type: string;
  unit?: string;
  origin: string;
  granularity?: string;
  modality?: string;
  computation_method?: string;
  role: string;
  validation_status: string;
}

export function useVariables(studyId?: string) {
  return useQuery<VariableDTO[]>({
    queryKey: ['variables', studyId],
    queryFn: () => apiClient.get<VariableDTO[]>(`/variables/${studyId ? `?study_id=${studyId}` : ''}`),
  });
}

export interface VariableCreateDTO {
  study_id: string;
  name: string;
  code: string;
  var_type?: string;
  unit?: string;
  origin?: string;
  granularity?: string;
  modality?: string;
  computation_method?: string;
  role?: string;
  validation_status?: string;
}

export function useCreateVariable(studyId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: VariableCreateDTO) => apiClient.post<VariableDTO>('/variables/', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['variables', studyId] }),
  });
}

// ─── Governance ──────────────────────────────────────────────

export interface AuditLogDTO {
  id: string;
  action: string;
  actor_label?: string;
  entity_type?: string;
  entity_id?: string;
  justification?: string;
  detail: Record<string, unknown>;
  created_at: string;
}

export function useAuditLog() {
  return useQuery<AuditLogDTO[]>({
    queryKey: ['governance', 'audit'],
    queryFn: () => apiClient.get<AuditLogDTO[]>(`/governance/audit`),
  });
}

export interface GovernanceSummaryDTO {
  total_participants: number;
  pending_consents: number;
  revoked_consents: number;
  active_consents: number;
  recent_exports: number;
  recent_accesses: number;
}

export function useGovernanceSummary() {
  return useQuery<GovernanceSummaryDTO>({
    queryKey: ['governance', 'summary'],
    queryFn: () => apiClient.get<GovernanceSummaryDTO>(`/governance/summary`),
  });
}

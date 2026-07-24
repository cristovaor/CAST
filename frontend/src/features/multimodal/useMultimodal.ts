// React Query hooks for the multimodal backend surface: session detail,
// EEG metadata & quality, synchronization, datasets, variables and governance.
// Mirrors the FastAPI routes added under /sessions, /eeg, /sync, /datasets,
// /variables and /governance.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

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

export interface SyncDTO {
  id: string;
  session_id: string;
  state: string;
  method?: string;
  offset_ms: number;
  drift_ms_per_min?: number;
  confidence?: number;
  anchors: { label: string; video_time_ms: number; eeg_time_ms: number }[];
  history: { at: string; action: string; note?: string }[];
  justification?: string;
  updated_at: string;
}

export function useSync(sessionId?: string) {
  return useQuery<SyncDTO>({
    queryKey: ['sync', sessionId],
    queryFn: () => apiClient.get<SyncDTO>(`/sync/${sessionId}`),
    enabled: !!sessionId,
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
    mutationFn: () => apiClient.post<SyncDTO>(`/sync/${sessionId}/detect?sync=true`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sync', sessionId] }),
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
  created_at: string;
  frozen_at?: string | null;
}

export function useDatasets() {
  return useQuery<DatasetDTO[]>({
    queryKey: ['datasets'],
    queryFn: () => apiClient.get<DatasetDTO[]>(`/datasets/`),
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

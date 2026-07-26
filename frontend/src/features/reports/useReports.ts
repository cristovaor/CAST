import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import type { Participant } from '@/types/domain';

export type ReportTemplateKey =
  | 'study_overview'
  | 'individual_longitudinal'
  | 'control_group_comparison';

export interface ReportTemplate {
  key: ReportTemplateKey;
  title: string;
  scope: 'study' | 'individual' | 'group';
  description: string;
  eligible: boolean;
  missing_requirements: string[];
}

export interface StudyGroup {
  id: string;
  study_id: string;
  code: string;
  name: string;
  role: 'control' | 'intervention' | 'comparison' | 'other';
  description?: string;
  participant_count: number;
  created_at: string;
}

export interface ReportRequest {
  template_key: ReportTemplateKey;
  participant_id?: string;
  control_group_id?: string;
  comparison_group_ids?: string[];
  outcome_ids?: string[];
  covariate_ids?: string[];
  confidence_level?: number;
  alpha?: number;
  multiplicity?: 'fdr_bh';
  seed?: number;
}

export interface OutcomeSummary {
  id: string;
  source_key?: string;
  label: string;
  unit?: string;
  role?: string;
  kind?: string;
  available: boolean;
  n_observations?: number;
  n_participants?: number;
  missing?: number;
  mean?: number;
  sd?: number | null;
  median?: number;
  q1?: number;
  q3?: number;
  minimum?: number;
  maximum?: number;
  mean_ci?: [number, number] | null;
  reason?: string;
}

export interface AnalysisResult {
  outcome_id: string;
  outcome?: string;
  method: string;
  estimand?: string;
  estimate?: number | null;
  confidence_interval?: [number, number] | null;
  p_value?: number | null;
  p_value_adjusted?: number | null;
  effect_size?: { name: string; value: number | null };
  n_control?: number;
  n_comparison?: number;
  n_participants?: number;
  n_observations?: number;
  diagnostics?: string[];
  converged?: boolean;
  formula?: string;
  terms?: Array<{
    term: string;
    estimate: number;
    confidence_interval: [number, number];
    p_value: number;
  }>;
}

export interface ReportPreview {
  template_key: ReportTemplateKey;
  scope_type: string;
  methodology_version: string;
  generated_at: string;
  study: Record<string, unknown> & {
    name: string;
    design: string;
    reporting_framework: string;
  };
  flow: {
    participants_total: number;
    participants_included: number;
    participants_excluded_consent: number;
    participants_excluded_inactive?: number;
    sessions_total: number;
    sessions_included: number;
  };
  summary: {
    outcomes_available: number;
    analyses_executed: number;
    groups: Array<StudyGroup & { participant_count: number }>;
  };
  outcome_catalog: Array<{
    id: string;
    label: string;
    unit?: string;
    kind?: string;
    role?: string;
  }>;
  outcomes: OutcomeSummary[];
  analyses: AnalysisResult[];
  methods: Record<string, unknown>;
  quality: { video_observations: number; eeg_observations: number };
  limitations: string[];
  data_snapshot_hash: string;
  series: Array<Record<string, string | number | null>>;
}

export interface ReportItem {
  id: string;
  type: string;
  template_key: ReportTemplateKey;
  scope_type: string;
  participant_id?: string;
  methodology_version: string;
  data_snapshot_hash: string;
  summary: Record<string, unknown>;
  generated_at: string;
  download_url: string;
  artifact_urls: { pdf?: string; json?: string };
}

export interface ReportJob {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
  step: string;
  progress: number;
  error?: string;
  result?: { report_id?: string };
}

export function useStudyReports(studyId: string) {
  return useQuery<ReportItem[]>({
    queryKey: ['reports', studyId],
    queryFn: () => apiClient.get<ReportItem[]>(`/studies/${studyId}/reports`),
    enabled: !!studyId,
  });
}

export function useReportTemplates(studyId: string) {
  return useQuery<ReportTemplate[]>({
    queryKey: ['reports', 'templates', studyId],
    queryFn: () =>
      apiClient.get<ReportTemplate[]>(`/studies/${studyId}/reports/templates`),
    enabled: !!studyId,
  });
}

export function useStudyGroups(studyId: string) {
  return useQuery<StudyGroup[]>({
    queryKey: ['study-groups', studyId],
    queryFn: () => apiClient.get<StudyGroup[]>(`/studies/${studyId}/groups`),
    enabled: !!studyId,
  });
}

export function useStudyParticipants(studyId: string) {
  return useQuery<Participant[]>({
    queryKey: ['participants', 'study', studyId],
    queryFn: () =>
      apiClient.get<Participant[]>(`/participants/study/${studyId}`),
    enabled: !!studyId,
  });
}

export function useCreateStudyGroup(studyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Pick<StudyGroup, 'code' | 'name' | 'role'>) =>
      apiClient.post<StudyGroup>(`/studies/${studyId}/groups`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['study-groups', studyId] });
      queryClient.invalidateQueries({
        queryKey: ['reports', 'templates', studyId],
      });
    },
  });
}

export function useAssignParticipantGroup(studyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      participantId,
      groupId,
    }: {
      participantId: string;
      groupId: string;
    }) =>
      apiClient.put<void>(
        `/studies/${studyId}/groups/${groupId}/participants/${participantId}`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['study-groups', studyId] });
      queryClient.invalidateQueries({
        queryKey: ['participants', 'study', studyId],
      });
      queryClient.invalidateQueries({
        queryKey: ['reports', 'templates', studyId],
      });
    },
  });
}

export function useReportPreview(studyId: string) {
  return useMutation<ReportPreview, Error, ReportRequest>({
    mutationFn: (payload) =>
      apiClient.post<ReportPreview>(
        `/studies/${studyId}/reports/preview`,
        payload,
      ),
  });
}

export function useGenerateReport(studyId: string) {
  return useMutation<
    { job_id: string; status: string },
    Error,
    ReportRequest
  >({
    mutationFn: (payload) =>
      apiClient.post<{ job_id: string; status: string }>(
        `/studies/${studyId}/reports/generate`,
        payload,
      ),
  });
}

export function useReportJob(jobId: string) {
  return useQuery<ReportJob>({
    queryKey: ['report-job', jobId],
    queryFn: () => apiClient.get<ReportJob>(`/jobs/${jobId}`),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && ['succeeded', 'failed', 'canceled'].includes(status)
        ? false
        : 1200;
    },
  });
}

function saveBlob(blob: Blob, filename: string) {
  const blobUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(blobUrl);
}

export async function downloadDynamicPdf(studyId: string) {
  const BASE_URL =
    (import.meta.env.VITE_API_URL as string | undefined) ??
    'http://localhost:8080/api/v1';
  const token = localStorage.getItem('cast_token');
  const url = `${BASE_URL}/studies/${studyId}/reports/dynamic-pdf`;
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error('Erro ao gerar o relatório PDF');
  saveBlob(await response.blob(), `relatorio_estudo_${studyId}.pdf`);
}

export async function downloadStudyCsv(studyId: string) {
  const { download_url } = await apiClient.get<{ download_url: string }>(
    `/studies/${studyId}/exports?format=csv`,
  );
  const response = await fetch(download_url);
  if (!response.ok) throw new Error('Erro ao baixar a exportação CSV');
  saveBlob(await response.blob(), `dados_estudo_${studyId}.csv`);
}

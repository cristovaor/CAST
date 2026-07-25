import { useQuery, useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

export interface ModelTestRunPayload {
  versionId: string;
  videoAssetIds: string[];
  thresholdOverride?: number;
  minRunLength?: number;
  persistAsPrediction?: boolean;
}

export interface ModelTestRunStartResponse {
  job_id: string;
  model_version_id: string;
  status: string;
  message: string;
}

export function useStartModelTestRun() {
  return useMutation({
    mutationFn: ({ versionId, videoAssetIds, thresholdOverride, minRunLength, persistAsPrediction }: ModelTestRunPayload) =>
      apiClient.post<ModelTestRunStartResponse>(`/models/${versionId}/test-run`, {
        video_asset_ids: videoAssetIds,
        threshold_override: thresholdOverride,
        min_run_length: minRunLength,
        persist_as_prediction: persistAsPrediction ?? false,
      }),
  });
}

export interface ModelTestEventDetail {
  start_frame: number;
  end_frame: number;
  start_ms: number;
  end_ms: number;
  duration_ms: number;
  avg_confidence: number;
}

export interface ModelTestVideoResult {
  video_asset_id: string;
  status: 'success' | 'error' | 'landmarks_not_ready';
  error?: string | null;
  action?: string;
  n_frames?: number;
  n_windows?: number;
  event_count?: number;
  events_per_minute?: number;
  avg_confidence?: number;
  latency_ms?: number;
  events?: ModelTestEventDetail[];
  frame_predictions?: number[];
  frame_probabilities?: number[];
  frame_indices?: number[];
}

export interface ModelTestRunStatus {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
  step: string;
  progress: number;
  error?: string | null;
  result?: { model_version_id: string; results: ModelTestVideoResult[] } | null;
}

export function useModelTestRunStatus(jobId: string) {
  return useQuery<ModelTestRunStatus>({
    queryKey: ['modelTestRun', jobId],
    queryFn: () => apiClient.get<ModelTestRunStatus>(`/models/test-runs/${jobId}`),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'queued' || status === 'running') return 2000;
      return false;
    },
  });
}

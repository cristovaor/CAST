import { useQuery, useMutation } from '@tanstack/react-query';
import { apiClient, API_BASE_URL } from '@/lib/api';
import { toast } from '@/app/stores/useToastStore';
import type { VideoInitResponse, VideoProcessResponse } from '@/types/api';
import type { TimelineEventDTO } from './types';
import type { VideoQualityReport } from '@/components/status/VideoQualityPanel';

export interface VideoTimeline {
  video_id: string;
  fps: number;
  duration_seconds: number;
  model_version: string;
  source: string;
  events: TimelineEventDTO[];
}

export function useInitVideoUpload() {
  return useMutation({
    mutationFn: (params: { participant_id: string; filename: string; mime_type: string; size_bytes: number }) => {
      const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
      return apiClient.post<VideoInitResponse>(`/videos/init-upload?${qs}`);
    },
  });
}

export function useProxyVideoUpload() {
  return useMutation({
    mutationFn: (data: { participant_id: string; session_id?: string; file: File }) => {
      const formData = new FormData();
      formData.append('participant_id', data.participant_id);
      if (data.session_id) formData.append('session_id', data.session_id);
      formData.append('file', data.file);

      const token = localStorage.getItem('cast_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      return fetch(`${API_BASE_URL}/videos/upload-proxy`, {
        method: 'POST',
        headers,
        body: formData,
      }).then(async res => {
        if (!res.ok) throw new Error("Upload failed");
        return res.json() as Promise<{ video_asset_id: string; session_id: string }>;
      });
    },
    onSuccess: (_, variables) => {
      toast.success('Vídeo enviado', variables.file.name);
    },
  });
}

export function useConfirmVideoUpload() {
  return useMutation({
    mutationFn: (data: { study_id: string; participant_id: string; object_key: string; filename: string; content_type: string }) => 
      apiClient.post('/videos', data),
  });
}

export function useProcessVideo() {
  return useMutation({
    mutationFn: (videoId: string) => apiClient.post<VideoProcessResponse>(`/videos/${videoId}/process`),
    onSuccess: () => {
      toast.success('Processamento iniciado', 'Acompanhe o progresso na fila de processamento.');
    },
  });
}

export interface VideoDetails {
  id: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  fps: number | null;
  duration_seconds: number | null;
  latest_job_id: string | null;
  session_id: string;
  eeg_asset_id: string | null;
  eeg_sync_offset_ms: number | null;
  landmark_artifact_id: string | null;
  landmark_chunk_size_frames: number | null;
}

export function useVideoDetails(videoId: string) {
  return useQuery({
    queryKey: ['videos', videoId],
    queryFn: () => apiClient.get<VideoDetails>(`/videos/${videoId}`),
    enabled: !!videoId,
  });
}

export function useVideoPlaybackUrl(videoId: string) {
  return useQuery({
    queryKey: ['videos', videoId, 'playback-url'],
    queryFn: () => apiClient.get<{ video_id: string; url: string | null }>(`/videos/${videoId}/playback-url`),
    enabled: !!videoId,
    staleTime: 30 * 60 * 1000, // presigned URLs are valid for 1h; refetch well before
  });
}

export function useVideoTimeline(videoId: string) {
  return useQuery({
    queryKey: ['videos', videoId, 'timeline'],
    queryFn: () => apiClient.get<VideoTimeline>(`/videos/${videoId}/timeline?source=model`),
    enabled: !!videoId,
  });
}

export function useVideoQualityReport(videoId: string) {
  return useQuery({
    queryKey: ['videos', videoId, 'quality'],
    queryFn: () => apiClient.get<VideoQualityReport>(`/videos/${videoId}/quality-report`),
    enabled: !!videoId,
  });
}

export interface LandmarkDownloadUrls {
  artifactId: string;
  raw: string | null;
  normalized: string | null;
}

export function useLandmarkDownloadUrls() {
  return useMutation({
    mutationFn: (videoId: string) =>
      apiClient.get<LandmarkDownloadUrls>(`/videos/${videoId}/landmarks/download`),
  });
}

export interface GlobalVideoListItem {
  id: string;
  filename: string;
  status: string;
  created_at: string;
  session_id: string;
  participant_id: string;
  study_id: string;
}

export function useGlobalVideos(skip: number = 0, limit: number = 100) {
  return useQuery({
    queryKey: ['videos', 'global', skip, limit],
    queryFn: () => apiClient.get<GlobalVideoListItem[]>(`/videos/?skip=${skip}&limit=${limit}`),
  });
}

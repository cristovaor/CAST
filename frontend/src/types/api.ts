import type { PaginatedResponse, User, Study, Participant, DashboardMetrics } from './domain';

export type { PaginatedResponse, User, Study, Participant, DashboardMetrics };

export interface ApiError {
  detail: string;
  code?: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
}

export interface VideoInitResponse {
  video_asset_id: string;
  upload_url: string;
}

export interface VideoProcessResponse {
  job_id: string;
  status: string;
}

export interface ExportResponse {
  job_id: string;
}

export interface ExportDownloadResponse {
  download_url: string;
}



// ============================================================
// CAST Pro — Domain Types
// Mirrors the backend SQLAlchemy models and Pydantic schemas.
// ============================================================

// ─── Enums ───────────────────────────────────────────────────

export type UserRole = 'admin' | 'researcher' | 'annotator' | 'viewer';

export type StudyStatus = 'draft' | 'active' | 'completed' | 'archived';

export type ConsentStatus = 'pending' | 'accepted' | 'revoked';

export type VideoStatus =
  | 'uploaded'
  | 'validated'
  | 'rejected'
  | 'processed';

export type JobType =
  | 'validate'
  | 'extract_landmarks'
  | 'infer'
  | 'report';

export type JobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'canceled';

export type AssessmentType = 'pre_test' | 'post_test';

export type MicroAction =
  | 'OLHO_FECHADO'
  | 'OLHANDO_CANTO'
  | 'MEXEU_LABIOS'
  | 'VIROU_ROSTO'
  | 'MEXEU_SOBRANCELHA'
  | 'NEUTRAL';

// UI-only status extension (superset of backend statuses)
export type StatusVariant =
  | StudyStatus
  | JobStatus
  | VideoStatus
  | ConsentStatus
  | 'review_required';

export type QualityLevel = 'excellent' | 'good' | 'warning' | 'poor' | 'rejected';

export type ViewMode = 'grid' | 'table';

// ─── Core Entities ────────────────────────────────────────────

export interface Organization {
  id: string;
  name: string;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  organization_id?: string;
  organization?: Organization;
  created_at: string;
  avatar_url?: string;
}

export interface Project {
  id: string;
  organization_id?: string;
  name: string;
  description?: string;
  created_at: string;
  // Enriched fields (aggregated)
  study_count?: number;
  session_count?: number;
  video_count?: number;
  average_quality?: number;
  status?: StudyStatus; // explicit when set; otherwise derived from studies
  responsible?: User[];
  last_activity?: string;
}

export interface Study {
  id: string;
  project_id?: string;
  name: string;
  description?: string;
  status: StudyStatus;
  protocol_version?: string;
  created_by?: string;
  created_at: string;
  // Configurable scientific design (docs §3, §7) — persisted as JSONB.
  config?: StudyConfigDTO;
  // Enriched
  participant_count?: number;
  session_count?: number;
  video_count?: number;
  average_quality?: number;
}

// Mirror of the backend Study.config blob written by the study wizard.
export interface StudyConfigDTO {
  researchQuestion?: string;
  generalObjective?: string;
  specificObjectives?: string[];
  hypotheses?: { code: string; statement: string }[];
  design?: string;
  modalities?: string[];
  groups?: string;
  variables?: string;
  retentionPolicy?: string;
  ethicsApprovalRef?: string;
  purpose?: string;
  program?: string;
  responsible?: string;
}

export interface Participant {
  id: string;
  study_id: string;
  group_id?: string;
  external_code: string;
  demographic_group?: Record<string, unknown>;
  consent_status: ConsentStatus;
  is_active: boolean;
  deactivated_at?: string;
  deactivation_reason?: string;
  created_at: string;
}

export interface Session {
  id: string;
  participant_id: string;
  created_at: string;
  // Enriched
  participant?: Participant;
  video_asset?: VideoAsset;
  assessments?: LearningAssessment[];
}

export interface VideoAsset {
  id: string;
  session_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  duration_seconds?: number;
  width?: number;
  height?: number;
  fps?: number;
  checksum_sha256?: string;
  storage_uri?: string;
  status: VideoStatus;
  created_at: string;
  // Enriched
  face_detection_rate?: number;
  quality_score?: number;
  model_version?: string;
  processing_job?: ProcessingJob;
}

export interface ProcessingJob {
  id: string;
  video_asset_id: string;
  job_type: JobType;
  status: JobStatus;
  progress: number;
  error_message?: string;
  started_at?: string;
  finished_at?: string;
  worker_id?: string;
  // Enriched
  current_step?: string;
  video_filename?: string;
  study_name?: string;
  elapsed_seconds?: number;
}

export interface ModelVersion {
  id: string;
  model_id: string;
  version: string;
  action: MicroAction;
  status: 'draft' | 'candidate' | 'active' | 'archived' | 'rejected';
  artifact_uri?: string;
  manifest_uri?: string;
  manifest?: ModelManifest;
  metrics?: ModelMetrics;
  notes?: string;
  created_at: string;
  activated_at?: string;
}

export interface ModelManifest {
  architecture: string;
  feature_names: string[];
  threshold: number;
  training_config: Record<string, unknown>;
}

export interface ModelMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1_score?: number;
  f1?: number; // Backend might send 'f1'
  specificity: number;
  confusion_matrix?: number[][];
}

export interface InferenceJob {
  job_id: string;
  video_id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
  progress: number;
  started_at?: string;
  finished_at?: string;
  error?: string;
}

export interface VideoDescriptors {
  video_id: string;
  actions: Record<string, unknown>;
}

export interface Prediction {
  id: string;
  video_asset_id: string;
  model_id?: string;
  model_version_id?: string;
  prediction_uri: string;
  threshold: number;
  summary: MicroActionSummary;
  created_at: string;
}

export interface LearningAssessment {
  id: string;
  session_id: string;
  type: AssessmentType;
  score: number;
  max_score: number;
  metadata_info?: Record<string, unknown>;
}

// ─── Analysis / Results ───────────────────────────────────────

export interface VideoQuality {
  faceDetectionRate: number;
  qualityScore: number;
  fps: number;
  width: number;
  height: number;
  durationSeconds: number;
  invalidFrames: number;
  warnings: string[];
}

export type MicroActionSummary = Record<
  Exclude<MicroAction, 'NEUTRAL'>,
  { count: number; perMinute: number; durationMs?: number }
>;

export interface TimelineEvent {
  id: string;
  microAction: MicroAction;
  startMs: number;
  endMs: number;
  confidence: number;
  origin?: 'model' | 'annotator';
  review_status?: 'pending' | 'approved' | 'rejected';
}

export interface VideoResults {
  quality: VideoQuality;
  summary: MicroActionSummary;
  timelines: TimelineEvent[];
}

// ─── Dashboard / Analytics ────────────────────────────────────

export interface DashboardMetrics {
  total_participants: number;
  total_videos_processed: number;
  average_learning_gain: number;
  microactions_summary: Partial<MicroActionSummary>;
}

export interface KPICardData {
  id: string;
  label: string;
  value: string | number;
  description: string;
  trend?: {
    value: string;
    direction: 'up' | 'down' | 'neutral';
    isPositive: boolean;
  };
  icon: string;
  color: 'default' | 'success' | 'warning' | 'danger' | 'info';
}

export interface TimeSeriesPoint {
  date: string;
  value: number;
  label?: string;
}

export interface ChartDataPoint {
  name: string;
  [key: string]: string | number;
}

// ─── Job Stream (SSE) ─────────────────────────────────────────

export interface JobLogEntry {
  timestamp: string;
  level: 'info' | 'warning' | 'error' | 'debug';
  message: string;
}

export interface JobStreamData {
  status: JobStatus;
  progress: number;
  currentStep?: string;
  logs: JobLogEntry[];
  errorMessage?: string;
}

// ─── API Responses ────────────────────────────────────────────

export interface ApiError {
  message: string;
  code?: string;
  details?: Record<string, unknown>;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  size?: number;
  page_size?: number;
  pages?: number;
}

// ─── Form DTOs ────────────────────────────────────────────────

export interface ProjectCreate {
  name: string;
  description?: string;
  organization_id?: string;
}

export interface StudyCreate {
  name: string;
  description?: string;
  project_id: string;
  protocol_version?: string;
  config?: StudyConfigDTO;
}

export interface ParticipantCreate {
  study_id: string;
  external_code: string;
  group_id?: string;
  demographic_group?: Record<string, unknown>;
  consent_status?: Extract<ConsentStatus, 'pending' | 'accepted'>;
  consent_version?: string;
}

export interface ParticipantUpdate {
  external_code?: string;
  group_id?: string;
  demographic_group?: Record<string, unknown>;
  consent_status?: ConsentStatus;
  consent_version?: string;
}

export interface AssessmentCreate {
  type: AssessmentType;
  score: number;
  max_score: number;
  metadata_info?: Record<string, unknown>;
}

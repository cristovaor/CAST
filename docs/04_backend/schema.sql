CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Enums
CREATE TYPE user_role AS ENUM ('admin', 'researcher', 'annotator', 'viewer');
CREATE TYPE study_status AS ENUM ('draft', 'active', 'completed', 'archived');
CREATE TYPE consent_status AS ENUM ('pending', 'accepted', 'revoked');
CREATE TYPE video_status AS ENUM ('uploaded', 'validated', 'rejected', 'processed');
CREATE TYPE job_type AS ENUM ('validate', 'extract_landmarks', 'infer', 'report', 'quality_check');
CREATE TYPE job_status AS ENUM ('queued', 'running', 'succeeded', 'failed', 'canceled');
CREATE TYPE assessment_type AS ENUM ('pre_test', 'post_test');
CREATE TYPE annotation_task_status AS ENUM ('pending', 'in_progress', 'submitted', 'reviewed');

-- Tables
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'researcher',
    organization_id UUID REFERENCES organizations(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id),
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE studies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id),
    name TEXT NOT NULL,
    description TEXT,
    status study_status NOT NULL DEFAULT 'draft',
    protocol_version TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id UUID REFERENCES studies(id),
    external_code TEXT NOT NULL,
    demographic_group JSONB,
    consent_status consent_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_id UUID REFERENCES participants(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE video_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES sessions(id) UNIQUE,
    storage_uri TEXT,
    filename TEXT,
    mime_type TEXT,
    size_bytes BIGINT,
    duration_seconds NUMERIC,
    width INTEGER,
    height INTEGER,
    fps NUMERIC,
    checksum_sha256 TEXT,
    status video_status NOT NULL DEFAULT 'uploaded',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE processing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_asset_id UUID REFERENCES video_assets(id),
    job_type job_type,
    status job_status NOT NULL DEFAULT 'queued',
    progress NUMERIC NOT NULL DEFAULT 0.0,
    error_message TEXT,
    logs JSONB NOT NULL DEFAULT '[]'::jsonb,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    worker_id TEXT
);

CREATE TABLE micro_action_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    framework TEXT DEFAULT 'torch',
    artifact_uri TEXT,
    active BOOLEAN DEFAULT FALSE
);

CREATE TABLE predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_asset_id UUID REFERENCES video_assets(id),
    model_id UUID REFERENCES micro_action_models(id),
    prediction_uri TEXT,
    threshold NUMERIC,
    summary JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE learning_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES sessions(id),
    type assessment_type,
    score NUMERIC,
    max_score NUMERIC,
    metadata_info JSONB
);

CREATE TABLE annotation_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_asset_id UUID REFERENCES video_assets(id),
    assignee_id UUID REFERENCES users(id),
    status annotation_task_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE annotation_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES annotation_tasks(id),
    action TEXT,
    start_frame INTEGER,
    end_frame INTEGER,
    start_time NUMERIC,
    end_time NUMERIC
);

-- Indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_sessions_participant ON sessions(participant_id);
CREATE INDEX idx_processing_jobs_video ON processing_jobs(video_asset_id);
CREATE INDEX idx_predictions_video ON predictions(video_asset_id);

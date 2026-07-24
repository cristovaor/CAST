import uuid
from datetime import datetime
from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Enum as SQLEnum,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB
import enum

from app.db.base_class import Base

class UserRole(str, enum.Enum):
    admin = "admin"
    researcher = "researcher"
    annotator = "annotator"
    viewer = "viewer"

class StudyStatus(str, enum.Enum):
    draft = "draft"
    active = "active"
    completed = "completed"
    archived = "archived"

class ConsentStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"
    revoked = "revoked"

class VideoStatus(str, enum.Enum):
    uploaded = "uploaded"
    validated = "validated"
    rejected = "rejected"
    processed = "processed"

class JobType(str, enum.Enum):
    validate = "validate"
    quality_check = "quality_check"
    extract_landmarks = "extract_landmarks"
    eeg_quality = "eeg_quality"
    sync = "sync"
    infer = "infer"
    report = "report"
    dataset_build = "dataset_build"
    train_model = "train_model"


class SessionState(str, enum.Enum):
    draft = "draft"
    awaiting_data = "awaiting_data"
    incomplete = "incomplete"
    ready_to_sync = "ready_to_sync"
    syncing = "syncing"
    synced = "synced"
    processing = "processing"
    processed = "processed"
    review_required = "review_required"
    approved = "approved"
    excluded = "excluded"
    archived = "archived"


class QualityVerdict(str, enum.Enum):
    approved = "approved"
    approved_with_caveats = "approved_with_caveats"
    review_required = "review_required"
    rejected = "rejected"


class SyncState(str, enum.Enum):
    not_synced = "not_synced"
    auto_available = "auto_available"
    in_review = "in_review"
    synced = "synced"
    synced_with_caveats = "synced_with_caveats"
    sync_failed = "sync_failed"


class DatasetState(str, enum.Enum):
    draft = "draft"
    building = "building"
    validating = "validating"
    frozen = "frozen"
    published_internal = "published_internal"
    superseded = "superseded"
    archived = "archived"

class JobStatus(str, enum.Enum):
    queued = "queued"
    running = "running"
    succeeded = "succeeded"
    failed = "failed"
    canceled = "canceled"

class Organization(Base):
    __tablename__ = "organizations"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    plan = Column(String, nullable=False, default="standard")
    max_storage_gb = Column(Float, nullable=False, default=100.0)
    used_storage_gb = Column(Float, nullable=False, default=0.0)
    pipeline_settings = Column(JSONB, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)

    users = relationship("User", back_populates="organization")
    projects = relationship("Project", back_populates="organization")

class User(Base):
    __tablename__ = "users"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    name = Column(String, nullable=False)
    role = Column(SQLEnum(UserRole), default=UserRole.researcher)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"))
    created_at = Column(DateTime, default=datetime.utcnow)

    organization = relationship("Organization", back_populates="users")

class Project(Base):
    __tablename__ = "projects"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"))
    name = Column(String, nullable=False)
    description = Column(Text)
    # Nullable for backwards compatibility: projects created before this field
    # was introduced keep the status derived from their studies until someone
    # explicitly changes (or archives) the project.
    status = Column(SQLEnum(StudyStatus), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    organization = relationship("Organization", back_populates="projects")
    studies = relationship("Study", back_populates="project")

class Study(Base):
    __tablename__ = "studies"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"))
    name = Column(String, nullable=False)
    description = Column(Text)
    status = Column(SQLEnum(StudyStatus), default=StudyStatus.draft)
    protocol_version = Column(String)
    # Configurable scientific design (docs §3, §7). Kept as a structured JSONB
    # blob so the platform stays reusable across research types without a rigid
    # schema: research question, objectives, hypotheses, design, groups,
    # conditions, modalities, variables, criteria, analysis plan, retention…
    config = Column(JSONB, default=dict)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="studies")
    participants = relationship("Participant", back_populates="study")

class Participant(Base):
    __tablename__ = "participants"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    study_id = Column(UUID(as_uuid=True), ForeignKey("studies.id"))
    external_code = Column(String, nullable=False)
    demographic_group = Column(JSONB)
    consent_status = Column(SQLEnum(ConsentStatus), default=ConsentStatus.pending)
    created_at = Column(DateTime, default=datetime.utcnow)

    study = relationship("Study", back_populates="participants")
    sessions = relationship("Session", back_populates="participant")

class Session(Base):
    __tablename__ = "sessions"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    participant_id = Column(UUID(as_uuid=True), ForeignKey("participants.id"))
    # Multimodal session metadata (docs §8) — a session gathers all data from one
    # experimental period. Modalities are complementary and never all required.
    state = Column(SQLEnum(SessionState), default=SessionState.draft, index=True)
    condition = Column(String)          # experimental condition (e.g. baseline)
    protocol = Column(String)           # protocol / task label
    operator = Column(String)           # collection operator
    recorded_at = Column(DateTime)      # start of the experimental period
    duration_seconds = Column(Numeric)
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    participant = relationship("Participant", back_populates="sessions")
    video_asset = relationship("VideoAsset", back_populates="session", uselist=False)
    eeg_asset = relationship("EEGAsset", back_populates="session", uselist=False)
    synchronization = relationship("Synchronization", back_populates="session", uselist=False)

class VideoAsset(Base):
    __tablename__ = "video_assets"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id"), unique=True)
    storage_uri = Column(String)
    filename = Column(String)
    mime_type = Column(String)
    size_bytes = Column(BigInteger)
    duration_seconds = Column(Numeric)
    width = Column(Integer)
    height = Column(Integer)
    fps = Column(Numeric)
    checksum_sha256 = Column(String)
    status = Column(SQLEnum(VideoStatus), default=VideoStatus.uploaded)
    # Quality assessment (docs §9) — independent from EEG.
    quality_verdict = Column(SQLEnum(QualityVerdict))
    quality_report = Column(JSONB, default=dict)  # codec, fps, valid_frame_ratio, findings…
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("Session", back_populates="video_asset")
    processing_jobs = relationship("ProcessingJob", back_populates="video_asset")

class EEGAsset(Base):
    __tablename__ = "eeg_assets"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id"), unique=True)
    storage_uri = Column(String)
    filename = Column(String)
    mime_type = Column(String, default="text/csv")
    size_bytes = Column(BigInteger)
    sample_rate_hz = Column(Float)
    sync_offset_ms = Column(Integer, default=0)  # time offset relative to video
    # Rich EEG metadata (docs §10)
    eeg_format = Column(String)          # EDF, EDF+, BDF, BrainVision, FIF, EEGLAB, CSV…
    device = Column(String)
    manufacturer = Column(String)
    model = Column(String)
    channel_count = Column(Integer)
    channel_names = Column(JSONB, default=list)
    montage = Column(String)
    reference = Column(String)
    resolution_bits = Column(Integer)
    units = Column(String)
    duration_seconds = Column(Numeric)
    start_timestamp = Column(DateTime)
    event_count = Column(Integer)
    # Quality assessment (independent from video, never a single opaque score)
    quality_verdict = Column(SQLEnum(QualityVerdict))
    valid_ratio = Column(Float)          # 0..1 percentual válido
    channel_quality = Column(JSONB, default=list)   # per-channel metrics
    quality_findings = Column(JSONB, default=list)  # problem/evidence/impact/action
    quality_criteria = Column(JSONB, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("Session", back_populates="eeg_asset")

class ProcessingJob(Base):
    __tablename__ = "processing_jobs"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    video_asset_id = Column(UUID(as_uuid=True), ForeignKey("video_assets.id"), nullable=True)
    job_type = Column(SQLEnum(JobType))
    status = Column(SQLEnum(JobStatus), default=JobStatus.queued)
    progress = Column(Numeric, default=0.0)
    error_message = Column(Text)
    logs = Column(JSONB, default=list)
    result = Column(JSONB, nullable=True)
    started_at = Column(DateTime)
    finished_at = Column(DateTime)
    worker_id = Column(String)

    video_asset = relationship("VideoAsset", back_populates="processing_jobs")

class ModelVersion(Base):
    __tablename__ = "model_versions"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    model_id = Column(String, nullable=False, index=True)
    version = Column(String, nullable=False)
    action = Column(String, nullable=False, index=True)
    status = Column(String, default="draft", index=True)  # draft, candidate, active, archived, rejected
    artifact_uri = Column(String)
    manifest_uri = Column(String)
    manifest = Column(JSONB, default=dict)
    metrics = Column(JSONB, default=dict)
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    activated_at = Column(DateTime)

class MicroActionModel(Base):
    __tablename__ = "micro_action_models"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    version = Column(String, nullable=False)
    framework = Column(String, default="torch")
    artifact_uri = Column(String)
    active = Column(Boolean, default=False)

class Prediction(Base):
    __tablename__ = "predictions"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    video_asset_id = Column(UUID(as_uuid=True), ForeignKey("video_assets.id"))
    model_id = Column(UUID(as_uuid=True), ForeignKey("micro_action_models.id"), nullable=True)
    model_version_id = Column(UUID(as_uuid=True), ForeignKey("model_versions.id"), nullable=True)
    prediction_uri = Column(String)
    threshold = Column(Numeric)
    summary = Column(JSONB)
    created_at = Column(DateTime, default=datetime.utcnow)


class LandmarkArtifact(Base):
    """Immutable, versioned output of one MediaPipe extraction configuration."""

    __tablename__ = "landmark_artifacts"
    __table_args__ = (
        UniqueConstraint(
            "video_asset_id",
            "video_checksum",
            "config_hash",
            name="uq_landmark_artifact_input_config",
        ),
        Index(
            "ix_landmark_artifacts_video_status_created",
            "video_asset_id",
            "status",
            "created_at",
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    video_asset_id = Column(
        UUID(as_uuid=True),
        ForeignKey("video_assets.id"),
        nullable=False,
    )
    processing_job_id = Column(
        UUID(as_uuid=True),
        ForeignKey("processing_jobs.id"),
        nullable=True,
    )
    status = Column(String, nullable=False, default="processing")
    extractor = Column(String, nullable=False, default="mediapipe_facemesh")
    extractor_version = Column(String, nullable=False)
    configuration = Column(JSONB, nullable=False, default=dict)
    video_checksum = Column(String, nullable=False)
    config_hash = Column(String, nullable=False)
    fps = Column(Float, nullable=False)
    frame_count = Column(Integer, nullable=False, default=0)
    point_count = Column(BigInteger, nullable=False, default=0)
    face_detection_rate = Column(Float, nullable=False, default=0.0)
    raw_uri = Column(String)
    normalized_uri = Column(String)
    overlay_prefix = Column(String)
    raw_checksum = Column(String)
    normalized_checksum = Column(String)
    overlay_checksum = Column(String)
    chunk_size_frames = Column(Integer, nullable=False, default=1)
    error_message = Column(Text)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )


class AssessmentType(str, enum.Enum):
    pre_test = "pre_test"
    post_test = "post_test"

class LearningAssessment(Base):
    __tablename__ = "learning_assessments"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id"))
    type = Column(SQLEnum(AssessmentType))
    score = Column(Numeric)
    max_score = Column(Numeric)
    metadata_info = Column(JSONB)

    session = relationship("Session", backref="assessments")

class AnnotationTaskStatus(str, enum.Enum):
    pending = "pending"
    in_progress = "in_progress"
    submitted = "submitted"
    reviewed = "reviewed"

class AnnotationTask(Base):
    __tablename__ = "annotation_tasks"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    video_asset_id = Column(UUID(as_uuid=True), ForeignKey("video_assets.id"))
    assignee_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    status = Column(SQLEnum(AnnotationTaskStatus), default=AnnotationTaskStatus.pending)
    created_at = Column(DateTime, default=datetime.utcnow)

    events = relationship("AnnotationEvent", back_populates="task")

class AnnotationEvent(Base):
    __tablename__ = "annotation_events"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('interval', 'point')",
            name="ck_annotation_events_kind",
        ),
        CheckConstraint(
            "source IN ('manual', 'model_review')",
            name="ck_annotation_events_source",
        ),
        CheckConstraint(
            "(kind = 'point' AND start_frame = end_frame) OR "
            "(kind = 'interval' AND end_frame >= start_frame)",
            name="ck_annotation_events_frame_range",
        ),
    )
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(UUID(as_uuid=True), ForeignKey("annotation_tasks.id"))
    action = Column(String)
    action_label = Column(String)
    kind = Column(String, nullable=False, default="interval")
    source = Column(String, nullable=False, default="manual")
    start_frame = Column(Integer)
    end_frame = Column(Integer)
    start_time = Column(Float)
    end_time = Column(Float)
    confidence = Column(Float, nullable=True)
    notes = Column(Text, nullable=True)
    annotator_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    task = relationship("AnnotationTask", back_populates="events")


class PredictionReview(Base):
    """Human decision over an immutable model event."""

    __tablename__ = "prediction_reviews"
    __table_args__ = (
        UniqueConstraint(
            "task_id",
            "prediction_id",
            "model_event_key",
            name="uq_prediction_review_task_event",
        ),
        CheckConstraint(
            "decision IN ('accepted', 'corrected', 'rejected')",
            name="ck_prediction_reviews_decision",
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(
        UUID(as_uuid=True),
        ForeignKey("annotation_tasks.id"),
        nullable=False,
    )
    prediction_id = Column(
        UUID(as_uuid=True),
        ForeignKey("predictions.id"),
        nullable=False,
    )
    model_event_key = Column(String, nullable=False)
    decision = Column(String, nullable=False)
    original_event = Column(JSONB, nullable=False)
    annotation_event_id = Column(
        UUID(as_uuid=True),
        ForeignKey("annotation_events.id"),
        nullable=True,
    )
    reviewer_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    reviewed_at = Column(DateTime, nullable=False, default=datetime.utcnow)

class ReportType(str, enum.Enum):
    json = "json"
    pdf = "pdf"
    csv = "csv"

class AnalysisReport(Base):
    __tablename__ = "analysis_reports"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    study_id = Column(UUID(as_uuid=True), ForeignKey("studies.id"))
    report_type = Column(SQLEnum(ReportType))
    storage_uri = Column(String)
    generated_at = Column(DateTime, default=datetime.utcnow)
    generated_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    
    study = relationship("Study", backref="reports")

class ConsentTerm(Base):
    __tablename__ = "consent_terms"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    participant_id = Column(UUID(as_uuid=True), ForeignKey("participants.id"))
    version = Column(String, nullable=False)
    accepted_at = Column(DateTime, default=datetime.utcnow)
    revoked_at = Column(DateTime, nullable=True)
    ip_address = Column(String)
    user_agent = Column(String)

    participant_ref = relationship("Participant", backref="consents")


class Synchronization(Base):
    """Alignment between video, EEG and events on one time axis (docs §11).

    Central to the multimodal experience: keeps method, offset, drift, anchors,
    confidence and the researcher's approval decision with justification.
    """
    __tablename__ = "synchronizations"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id"), unique=True)
    state = Column(SQLEnum(SyncState), default=SyncState.not_synced, index=True)
    method = Column(String)            # absolute_timestamp, digital_marker, manual…
    offset_ms = Column(Integer, default=0)
    drift_ms_per_min = Column(Float)
    confidence = Column(Float)         # 0..1
    anchors = Column(JSONB, default=list)   # [{label, video_time_ms, eeg_time_ms}]
    history = Column(JSONB, default=list)   # audit of adjustments/decisions
    justification = Column(Text)
    approved_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    session = relationship("Session", back_populates="synchronization")


class ResearchVariable(Base):
    """Scientific variable registry (docs §14) — roles, origins, computation."""
    __tablename__ = "research_variables"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    study_id = Column(UUID(as_uuid=True), ForeignKey("studies.id"), index=True)
    name = Column(String, nullable=False)
    code = Column(String, nullable=False)
    description = Column(Text)
    var_type = Column(String)          # numeric, categorical, ordinal, boolean…
    unit = Column(String)
    domain = Column(String)
    origin = Column(String)            # raw_video, eeg_feature, event, model_output…
    granularity = Column(String)
    modality = Column(String)          # video, eeg, events…
    computation_method = Column(Text)
    version = Column(String)
    missing_policy = Column(String)
    allowed_values = Column(JSONB, default=list)
    role = Column(String)              # independent, dependent, covariate…
    owner = Column(String)
    validation_status = Column(String, default="draft")
    created_at = Column(DateTime, default=datetime.utcnow)

    study = relationship("Study", backref="variables")


class Dataset(Base):
    """Reproducible, versioned multimodal dataset (docs §17).

    Carries a full manifest so every export ships sources, criteria,
    transformations, pipeline & model versions, schema, lineage and checksum.
    """
    __tablename__ = "datasets"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id"),
        nullable=True,
        index=True,
    )
    name = Column(String, nullable=False)
    dataset_version = Column(String, nullable=False)
    level = Column(String)             # raw, synced, features, analytic, training…
    state = Column(SQLEnum(DatasetState), default=DatasetState.draft, index=True)
    manifest = Column(JSONB, default=dict)
    participant_count = Column(Integer, default=0)
    session_count = Column(Integer, default=0)
    checksum = Column(String)
    storage_uri = Column(String)
    owner = Column(String)
    # Build inputs & outputs (docs §17). The dataset is materialized from
    # sessions selected by inclusion/exclusion criteria; the build records which
    # sessions were included/excluded (lineage) and where the artifact lives.
    build_criteria = Column(JSONB, default=dict)   # studies, conditions, modalities, quality…
    build_status = Column(String, default="draft") # draft, building, built, failed
    build_error = Column(Text)
    included_session_ids = Column(JSONB, default=list)
    excluded_sessions = Column(JSONB, default=list)  # [{session_id, reason}]
    lineage = Column(JSONB, default=dict)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    built_at = Column(DateTime, nullable=True)
    frozen_at = Column(DateTime, nullable=True)


class AuditAction(str, enum.Enum):
    create = "create"
    update = "update"
    access = "access"
    export = "export"
    consent_change = "consent_change"
    grant = "grant"
    delete = "delete"
    sync_decision = "sync_decision"
    dataset_freeze = "dataset_freeze"


class AuditLog(Base):
    """Governance audit trail (docs §21). Records access to sensitive data,
    exports, consent changes and decisions, with justification."""
    __tablename__ = "audit_logs"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id"),
        nullable=True,
        index=True,
    )
    action = Column(SQLEnum(AuditAction), index=True)
    actor_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    actor_label = Column(String)
    entity_type = Column(String)       # session, dataset, participant, video…
    entity_id = Column(String)
    justification = Column(Text)
    detail = Column(JSONB, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

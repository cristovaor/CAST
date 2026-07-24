"""Pydantic schemas for the multimodal research surface.

Covers rich sessions, EEG import/quality, synchronization, research variables,
datasets and governance/audit — mirroring the frontend types in
frontend/src/types/research.ts.
"""
from typing import Optional, List, Any, Dict
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field

from app.db.models import (
    SessionState, QualityVerdict, SyncState, DatasetState, AuditAction,
)


# ─── Sessions ────────────────────────────────────────────────

class SessionCreate(BaseModel):
    participant_id: UUID
    condition: Optional[str] = None
    protocol: Optional[str] = None
    operator: Optional[str] = None
    recorded_at: Optional[datetime] = None
    duration_seconds: Optional[float] = None
    notes: Optional[str] = None


class SessionUpdate(BaseModel):
    state: Optional[SessionState] = None
    condition: Optional[str] = None
    protocol: Optional[str] = None
    operator: Optional[str] = None
    recorded_at: Optional[datetime] = None
    duration_seconds: Optional[float] = None
    notes: Optional[str] = None


class SessionDetail(BaseModel):
    id: UUID
    participant_id: UUID
    state: SessionState
    condition: Optional[str] = None
    protocol: Optional[str] = None
    operator: Optional[str] = None
    recorded_at: Optional[datetime] = None
    duration_seconds: Optional[float] = None
    notes: Optional[str] = None
    created_at: datetime
    video_asset_id: Optional[UUID] = None
    eeg_asset_id: Optional[UUID] = None
    sync_state: Optional[SyncState] = None
    model_config = ConfigDict(from_attributes=True)


# ─── EEG ─────────────────────────────────────────────────────

class EEGChannelQuality(BaseModel):
    name: str
    status: str = "good"       # good, noisy, flat, missing, bad
    impedance_kohm: Optional[float] = None
    valid_ratio: float = 1.0
    notes: Optional[str] = None


class QualityFinding(BaseModel):
    id: str
    issue: str
    evidence: str
    impact: str
    recommendation: str
    reprocessable: bool = True
    tone: str = "info"         # info, warning, danger


class EEGMetadataUpdate(BaseModel):
    eeg_format: Optional[str] = None
    device: Optional[str] = None
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    channel_count: Optional[int] = None
    channel_names: Optional[List[str]] = None
    montage: Optional[str] = None
    reference: Optional[str] = None
    sample_rate_hz: Optional[float] = None
    resolution_bits: Optional[int] = None
    units: Optional[str] = None
    duration_seconds: Optional[float] = None
    event_count: Optional[int] = None


class EEGQualityReport(BaseModel):
    quality_verdict: QualityVerdict
    valid_ratio: float
    channel_quality: List[EEGChannelQuality] = Field(default_factory=list)
    quality_findings: List[QualityFinding] = Field(default_factory=list)
    quality_criteria: List[str] = Field(default_factory=list)


class EEGAssetDetail(BaseModel):
    id: UUID
    session_id: UUID
    filename: Optional[str] = None
    eeg_format: Optional[str] = None
    device: Optional[str] = None
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    channel_count: Optional[int] = None
    channel_names: List[str] = Field(default_factory=list)
    montage: Optional[str] = None
    reference: Optional[str] = None
    sample_rate_hz: Optional[float] = None
    resolution_bits: Optional[int] = None
    units: Optional[str] = None
    duration_seconds: Optional[float] = None
    event_count: Optional[int] = None
    sync_offset_ms: int = 0
    quality_verdict: Optional[QualityVerdict] = None
    valid_ratio: Optional[float] = None
    channel_quality: List[Dict[str, Any]] = Field(default_factory=list)
    quality_findings: List[Dict[str, Any]] = Field(default_factory=list)
    quality_criteria: List[str] = Field(default_factory=list)
    model_config = ConfigDict(from_attributes=True)


# ─── Synchronization ─────────────────────────────────────────

class SyncAnchor(BaseModel):
    label: str
    video_time_ms: int
    eeg_time_ms: int


class SyncUpdate(BaseModel):
    method: Optional[str] = None
    offset_ms: Optional[int] = None
    drift_ms_per_min: Optional[float] = None
    confidence: Optional[float] = None
    anchors: Optional[List[SyncAnchor]] = None


class SyncDecision(BaseModel):
    approve: bool
    justification: str


class SyncDetail(BaseModel):
    id: UUID
    session_id: UUID
    state: SyncState
    method: Optional[str] = None
    offset_ms: int = 0
    drift_ms_per_min: Optional[float] = None
    confidence: Optional[float] = None
    anchors: List[Dict[str, Any]] = Field(default_factory=list)
    history: List[Dict[str, Any]] = Field(default_factory=list)
    justification: Optional[str] = None
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ─── Research variables ──────────────────────────────────────

class VariableCreate(BaseModel):
    study_id: UUID
    name: str
    code: str
    description: Optional[str] = None
    var_type: str = "numeric"
    unit: Optional[str] = None
    domain: Optional[str] = None
    origin: str = "derived"
    granularity: Optional[str] = None
    modality: Optional[str] = None
    computation_method: Optional[str] = None
    version: Optional[str] = None
    missing_policy: Optional[str] = None
    allowed_values: List[str] = Field(default_factory=list)
    role: str = "exploratory"
    owner: Optional[str] = None
    validation_status: str = "draft"


class VariableDetail(VariableCreate):
    id: UUID
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ─── Datasets ────────────────────────────────────────────────

class DatasetCreate(BaseModel):
    name: str
    dataset_version: str
    level: str = "analytic"
    manifest: Dict[str, Any] = Field(default_factory=dict)
    participant_count: int = 0
    session_count: int = 0
    owner: Optional[str] = None


class DatasetDetail(BaseModel):
    id: UUID
    name: str
    dataset_version: str
    level: Optional[str] = None
    state: DatasetState
    manifest: Dict[str, Any] = Field(default_factory=dict)
    participant_count: int = 0
    session_count: int = 0
    checksum: Optional[str] = None
    owner: Optional[str] = None
    build_status: Optional[str] = None
    build_error: Optional[str] = None
    excluded_sessions: List[Dict[str, Any]] = Field(default_factory=list)
    lineage: Dict[str, Any] = Field(default_factory=dict)
    storage_uri: Optional[str] = None
    created_at: datetime
    built_at: Optional[datetime] = None
    frozen_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)


class DatasetBuildCriteria(BaseModel):
    """Selection criteria for materializing a dataset (docs §17). All optional."""
    study_ids: List[str] = Field(default_factory=list)
    conditions: List[str] = Field(default_factory=list)
    modalities: List[str] = Field(default_factory=lambda: ["video", "eeg"])
    states: List[str] = Field(default_factory=list)
    require_sync: bool = False
    require_consent: bool = True
    min_eeg_valid_ratio: Optional[float] = None


class DatasetBuildPreview(BaseModel):
    included: int
    excluded: int
    excluded_sample: List[Dict[str, Any]] = Field(default_factory=list)
    participant_count: int
    conditions: List[str] = Field(default_factory=list)


# ─── Audit / governance ──────────────────────────────────────

class AuditLogEntry(BaseModel):
    id: UUID
    action: AuditAction
    actor_label: Optional[str] = None
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    justification: Optional[str] = None
    detail: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

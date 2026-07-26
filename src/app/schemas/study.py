from typing import Optional, Any, Dict
from pydantic import BaseModel, ConfigDict, Field
from uuid import UUID
from datetime import datetime
from app.db.models import StudyStatus

class StudyBase(BaseModel):
    name: str
    description: Optional[str] = None
    # Kept optional on response/update-compatible models for legacy records.
    project_id: Optional[UUID] = None
    protocol_version: Optional[str] = None
    # Configurable scientific design (docs §3, §7) — see Study.config.
    config: Dict[str, Any] = Field(default_factory=dict)

class StudyCreate(StudyBase):
    # Creation is always tenant-scoped through an existing project.
    project_id: UUID

class StudyUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[StudyStatus] = None
    protocol_version: Optional[str] = None
    config: Optional[Dict[str, Any]] = None

class StudyInDBBase(StudyBase):
    id: UUID
    status: StudyStatus
    created_by: Optional[UUID] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class Study(StudyInDBBase):
    participant_count: int = 0
    session_count: int = 0


class ModalityQualitySummary(BaseModel):
    total_assets: int = 0
    assessed_assets: int = 0
    average_valid_ratio: Optional[float] = None
    average_face_detection_rate: Optional[float] = None
    findings_count: int = 0
    verdicts: Dict[str, int] = Field(default_factory=dict)


class StudyQualitySummary(BaseModel):
    study_id: UUID
    sessions_count: int = 0
    video: ModalityQualitySummary
    eeg: ModalityQualitySummary

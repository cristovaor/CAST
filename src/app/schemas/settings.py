from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID

class OrganizationSettings(BaseModel):
    id: UUID
    name: str
    plan: str
    max_storage_gb: float
    used_storage_gb: float

class PipelineSettingsUpdate(BaseModel):
    face_detection_threshold: Optional[float] = Field(None, ge=0, le=1)
    blink_tolerance_frames: Optional[int] = Field(None, ge=1, le=120)
    enable_head_pose_estimation: Optional[bool] = None

class PipelineSettings(PipelineSettingsUpdate):
    pass

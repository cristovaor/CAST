from pydantic import BaseModel
from typing import Optional
from uuid import UUID

class OrganizationSettings(BaseModel):
    id: UUID
    name: str
    plan: str
    max_storage_gb: float
    used_storage_gb: float

class PipelineSettingsUpdate(BaseModel):
    face_detection_threshold: Optional[float] = None
    blink_tolerance_frames: Optional[int] = None
    enable_head_pose_estimation: Optional[bool] = None

class PipelineSettings(PipelineSettingsUpdate):
    pass

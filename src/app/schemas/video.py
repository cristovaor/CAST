from typing import Optional
from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime
from app.db.models import VideoStatus

class VideoAssetBase(BaseModel):
    session_id: UUID
    filename: str
    mime_type: str
    size_bytes: int

class VideoAssetCreate(VideoAssetBase):
    pass

class VideoAssetUpdate(BaseModel):
    status: Optional[VideoStatus] = None
    storage_uri: Optional[str] = None
    duration_seconds: Optional[float] = None
    width: Optional[int] = None
    height: Optional[int] = None
    fps: Optional[float] = None
    checksum_sha256: Optional[str] = None

class VideoAssetInDBBase(VideoAssetBase):
    id: UUID
    status: VideoStatus
    storage_uri: Optional[str] = None
    duration_seconds: Optional[float] = None
    width: Optional[int] = None
    height: Optional[int] = None
    fps: Optional[float] = None
    checksum_sha256: Optional[str] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class VideoAsset(VideoAssetInDBBase):
    pass

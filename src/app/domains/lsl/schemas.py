from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class LSLRecordingCreate(BaseModel):
    agent_id: str = Field(min_length=1, max_length=128)
    selected_stream_ids: list[str] = Field(default_factory=list, max_length=64)
    browser_clock: dict[str, object] = Field(default_factory=dict)


class LSLDiscoveryUpdate(BaseModel):
    streams: list[dict[str, object]] = Field(max_length=256)


class LSLRecordingStarted(BaseModel):
    started_source_time_us: int


class LSLRecordingComplete(BaseModel):
    checksum_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    size_bytes: int = Field(gt=0)
    ended_source_time_us: int


class LSLRecordingDetail(BaseModel):
    id: UUID
    session_id: UUID
    status: str
    agent_id: str
    selected_stream_ids: list[str]
    discovery_snapshot: list[dict[str, object]]
    checksum_sha256: str | None = None
    size_bytes: int | None = None
    eeg_asset_id: UUID | None = None
    sync_evidence_id: UUID | None = None
    error_message: str | None = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class LSLRecordingStartResponse(LSLRecordingDetail):
    upload_url: str
    upload_content_type: str = "application/x-xdf"

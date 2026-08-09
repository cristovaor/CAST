from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class VideoCaptureCreate(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    mime_type: str = Field(pattern=r"^video/(webm|mp4)$")
    camera_constraints: dict[str, object] = Field(default_factory=dict)
    browser_clock: dict[str, object] = Field(default_factory=dict)
    sync_anchors: list[dict[str, object]] = Field(default_factory=list)
    started_source_time_us: int | None = None
    started_canonical_time_us: int | None = None
    expected_size_bytes: int | None = Field(default=None, gt=0)


class VideoCaptureDetail(BaseModel):
    id: UUID
    session_id: UUID
    status: str
    filename: str
    mime_type: str
    received_size_bytes: int
    expected_size_bytes: int | None = None
    checksum_sha256: str | None = None
    finalization_job_id: UUID | None = None
    video_asset_id: UUID | None = None
    pts_uri: str | None = None
    created_at: datetime
    completed_at: datetime | None = None
    aborted_at: datetime | None = None
    model_config = ConfigDict(from_attributes=True)


class VideoCapturePartPresign(BaseModel):
    part_number: int = Field(ge=1, le=10_000)


class VideoCapturePartURL(BaseModel):
    part_number: int
    upload_url: str
    expires_in_seconds: int


class CompletedCapturePart(BaseModel):
    part_number: int = Field(ge=1, le=10_000)
    etag: str = Field(min_length=1)
    size_bytes: int = Field(ge=0)
    checksum_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")


class VideoCaptureComplete(BaseModel):
    parts: list[CompletedCapturePart] = Field(min_length=1)
    checksum_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    ended_source_time_us: int | None = None
    ended_canonical_time_us: int | None = None

    @model_validator(mode="after")
    def unique_part_numbers(self) -> "VideoCaptureComplete":
        numbers = [part.part_number for part in self.parts]
        if len(numbers) != len(set(numbers)):
            raise ValueError("part_number must be unique")
        return self


class ResearchBookmarkCreate(BaseModel):
    client_event_id: str = Field(min_length=1, max_length=128)
    start_canonical_time_us: int
    end_canonical_time_us: int | None = None
    label: str = Field(min_length=1, max_length=255)
    comment: str | None = None

    @model_validator(mode="after")
    def validate_range(self) -> "ResearchBookmarkCreate":
        if (
            self.end_canonical_time_us is not None
            and self.end_canonical_time_us < self.start_canonical_time_us
        ):
            raise ValueError("bookmark end must not precede start")
        return self


class ResearchBookmarkDetail(ResearchBookmarkCreate):
    id: UUID
    session_id: UUID
    created_by: UUID
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)

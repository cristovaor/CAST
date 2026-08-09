from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class TrialCreate(BaseModel):
    client_trial_id: str = Field(min_length=1, max_length=128)
    label: str = Field(min_length=1, max_length=255)
    source_clock_id: str = Field(min_length=1, max_length=128)
    started_source_time_us: int
    ended_source_time_us: int | None = None
    started_canonical_time_us: int | None = None
    ended_canonical_time_us: int | None = None
    uncertainty_us: int = Field(default=0, ge=0)
    quality_flags: list[str] = Field(default_factory=list)
    valid: bool = True
    metadata_info: dict[str, object] = Field(default_factory=dict)

    @model_validator(mode="after")
    def ordered_times(self) -> "TrialCreate":
        if self.ended_source_time_us is not None and self.ended_source_time_us < self.started_source_time_us:
            raise ValueError("trial source end must not precede start")
        if self.started_canonical_time_us is not None and self.ended_canonical_time_us is not None and self.ended_canonical_time_us < self.started_canonical_time_us:
            raise ValueError("trial canonical end must not precede start")
        return self


class TrialDetail(TrialCreate):
    id: UUID
    session_id: UUID
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class ExperimentalEventCreate(BaseModel):
    client_event_id: str = Field(min_length=1, max_length=128)
    trial_id: UUID | None = None
    event_type: Literal[
        "trial_started", "stimulus_presented", "response", "interaction",
        "environment", "trial_ended", "marker",
    ]
    source_time_us: int
    source_clock_id: str = Field(min_length=1, max_length=128)
    canonical_time_us: int | None = None
    uncertainty_us: int = Field(default=0, ge=0)
    quality_flags: list[str] = Field(default_factory=list)
    valid: bool = True
    payload: dict[str, object] = Field(default_factory=dict)


class ExperimentalEventBatch(BaseModel):
    events: list[ExperimentalEventCreate] = Field(min_length=1, max_length=5000)

    @model_validator(mode="after")
    def unique_ids(self) -> "ExperimentalEventBatch":
        ids = [event.client_event_id for event in self.events]
        if len(ids) != len(set(ids)):
            raise ValueError("client_event_id must be unique within a batch")
        return self


class ExperimentalEventDetail(ExperimentalEventCreate):
    id: UUID
    session_id: UUID
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class ExperimentalEventBatchResult(BaseModel):
    created: int
    reused: int
    events: list[ExperimentalEventDetail]


class EnvironmentSample(BaseModel):
    source_time_us: int
    source_clock_id: str = Field(min_length=1, max_length=128)
    canonical_time_us: int | None = None
    uncertainty_us: int = Field(default=0, ge=0)
    quality_flags: list[str] = Field(default_factory=list)
    valid: bool = True
    value: float = Field(allow_inf_nan=False)


class EnvironmentSeriesCreate(BaseModel):
    kind: Literal["stimulus_luminance", "screen_luminance", "face_illumination", "ambient_luminance"]
    unit: str = Field(min_length=1, max_length=64)
    method: str = Field(min_length=1, max_length=255)
    samples: list[EnvironmentSample] = Field(min_length=1, max_length=100_000)
    provenance: dict[str, object] = Field(default_factory=dict)


class EnvironmentArtifactDetail(BaseModel):
    id: UUID
    session_id: UUID
    kind: str
    status: str
    unit: str
    method: str
    raw_uri: str
    derived_uri: str | None = None
    raw_checksum_sha256: str
    derived_checksum_sha256: str | None = None
    start_time_us: int
    end_time_us: int
    sample_count: int
    source_clock_id: str
    provenance: dict[str, object]
    error_message: str | None = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

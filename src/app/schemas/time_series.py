"""Shared temporal and explorer contracts for independently owned modalities."""

from __future__ import annotations

from datetime import datetime
from typing import Generic, Literal, TypeVar
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


SeriesValue = TypeVar("SeriesValue")
ArtifactLayer = Literal[
    "RAW", "DERIVED", "FILTERED", "MODEL_OUTPUT", "ANNOTATION"
]


class TimestampReference(BaseModel):
    source_time_us: int
    source_clock_id: str = Field(min_length=1, max_length=128)
    canonical_time_us: int
    uncertainty_us: int = Field(default=0, ge=0)
    quality_flags: list[str] = Field(default_factory=list)
    valid: bool = True


class TimeRangeQuery(BaseModel):
    start_time_us: int
    end_time_us: int
    limit: int = Field(default=10_000, ge=1, le=100_000)

    @model_validator(mode="after")
    def validate_range(self) -> "TimeRangeQuery":
        if self.end_time_us <= self.start_time_us:
            raise ValueError("end_time_us must be greater than start_time_us")
        return self


class ArtifactProvenance(BaseModel):
    artifact_id: UUID
    layer: ArtifactLayer
    storage_uri: str
    checksum_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    schema_version: str
    pipeline_version: str
    source_artifact_ids: list[UUID] = Field(default_factory=list)
    ingestion_timestamp: datetime | None = None
    processed_timestamp: datetime | None = None
    configuration: dict[str, object] = Field(default_factory=dict)


class SeriesSample(BaseModel, Generic[SeriesValue]):
    timestamp: TimestampReference
    value: SeriesValue


class SeriesEnvelope(BaseModel, Generic[SeriesValue]):
    series_id: str
    modality: str
    unit: str | None = None
    provenance: ArtifactProvenance
    range: TimeRangeQuery
    samples: list[SeriesSample[SeriesValue]] = Field(default_factory=list)
    next_cursor: str | None = None


class ExplorerTrackDescriptor(BaseModel):
    id: str
    modality: str
    label: str
    kind: str
    start_time_us: int
    end_time_us: int
    samples_url: str
    provenance_url: str | None = None
    unit: str | None = None
    quality_summary: dict[str, object] = Field(default_factory=dict)
    capabilities: list[str] = Field(default_factory=list)
    experimental: bool = False

    @model_validator(mode="after")
    def validate_bounds(self) -> "ExplorerTrackDescriptor":
        if self.end_time_us < self.start_time_us:
            raise ValueError("track end_time_us must not precede start_time_us")
        return self


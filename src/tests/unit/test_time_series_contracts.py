from datetime import datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.schemas.time_series import (
    ArtifactProvenance,
    ExplorerTrackDescriptor,
    SeriesEnvelope,
    SeriesSample,
    TimeRangeQuery,
    TimestampReference,
)


def test_series_contract_preserves_scientific_time_fields():
    time = TimestampReference(
        source_time_us=123,
        source_clock_id="browser-performance-v1",
        canonical_time_us=456,
        uncertainty_us=20,
        quality_flags=["interpolated"],
        valid=True,
    )
    requested_range = TimeRangeQuery(start_time_us=400, end_time_us=500, limit=10)
    provenance = ArtifactProvenance(
        artifact_id=uuid4(),
        layer="DERIVED",
        storage_uri="s3://cast-videos/features/part.parquet",
        checksum_sha256="a" * 64,
        schema_version="face-features-v1",
        pipeline_version="vision-v2",
        ingestion_timestamp=datetime(2026, 8, 9),
    )

    envelope = SeriesEnvelope[float](
        series_id="head-pose-yaw",
        modality="face",
        unit="degree",
        provenance=provenance,
        range=requested_range,
        samples=[SeriesSample[float](timestamp=time, value=2.5)],
    )

    dumped = envelope.model_dump()
    assert dumped["samples"][0]["timestamp"]["source_time_us"] == 123
    assert dumped["samples"][0]["timestamp"]["canonical_time_us"] == 456
    assert dumped["provenance"]["layer"] == "DERIVED"


def test_time_range_rejects_unbounded_or_inverted_requests():
    with pytest.raises(ValidationError):
        TimeRangeQuery(start_time_us=10, end_time_us=10)
    with pytest.raises(ValidationError):
        TimeRangeQuery(start_time_us=0, end_time_us=1, limit=100_001)


def test_explorer_descriptor_contains_no_samples():
    descriptor = ExplorerTrackDescriptor(
        id="eeg-alpha",
        modality="eeg",
        label="Alpha",
        kind="line",
        start_time_us=0,
        end_time_us=1_000_000,
        samples_url="/api/v1/eeg/results?start_seconds=0&end_seconds=1&limit=1000",
    )
    assert "samples" not in descriptor.model_dump()


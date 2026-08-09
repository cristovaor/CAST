from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, CheckConstraint, Column, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.db.base_class import Base


class GazeCalibration(Base):
    __tablename__ = "gaze_calibrations"
    __table_args__ = (
        CheckConstraint("status IN ('collecting','processing','ready','failed','no_go')", name="ck_gaze_calibrations_status"),
        Index("ix_gaze_calibrations_session_created", "session_id", "created_at"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    status = Column(String, nullable=False, default="collecting")
    configuration = Column(JSONB, nullable=False, default=dict)
    metrics = Column(JSONB, nullable=False, default=dict)
    verdict = Column(String)
    error_message = Column(Text)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    completed_at = Column(DateTime)


class GazeCalibrationSample(Base):
    __tablename__ = "gaze_calibration_samples"
    __table_args__ = (
        UniqueConstraint("calibration_id", "client_sample_id", name="uq_gaze_calibration_sample_client"),
        CheckConstraint("phase IN ('fit','validation','drift')", name="ck_gaze_calibration_samples_phase"),
        Index("ix_gaze_samples_calibration_time", "calibration_id", "source_time_us"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    calibration_id = Column(UUID(as_uuid=True), ForeignKey("gaze_calibrations.id", ondelete="CASCADE"), nullable=False)
    client_sample_id = Column(String, nullable=False)
    phase = Column(String, nullable=False)
    target_x = Column(Float, nullable=False)
    target_y = Column(Float, nullable=False)
    iris_offset_x = Column(Float)
    iris_offset_y = Column(Float)
    head_yaw_deg = Column(Float)
    head_pitch_deg = Column(Float)
    source_time_us = Column(BigInteger, nullable=False)
    source_clock_id = Column(String, nullable=False)
    canonical_time_us = Column(BigInteger)
    uncertainty_us = Column(BigInteger, nullable=False, default=0)
    quality_flags = Column(JSONB, nullable=False, default=list)
    valid = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class GazeArtifact(Base):
    __tablename__ = "gaze_artifacts"
    __table_args__ = (
        UniqueConstraint("calibration_id", "kind", "layer", name="uq_gaze_artifact_layer"),
        CheckConstraint("layer IN ('RAW','FILTERED','MODEL_OUTPUT')", name="ck_gaze_artifacts_layer"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    calibration_id = Column(UUID(as_uuid=True), ForeignKey("gaze_calibrations.id", ondelete="CASCADE"), nullable=False)
    kind = Column(String, nullable=False)
    layer = Column(String, nullable=False)
    storage_uri = Column(String, nullable=False)
    checksum_sha256 = Column(String, nullable=False)
    schema_version = Column(String, nullable=False, default="1")
    pipeline_version = Column(String, nullable=False, default="gaze-ridge-v1")
    start_time_us = Column(BigInteger, nullable=False)
    end_time_us = Column(BigInteger, nullable=False)
    sample_count = Column(Integer, nullable=False)
    metrics = Column(JSONB, nullable=False, default=dict)
    provenance = Column(JSONB, nullable=False, default=dict)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

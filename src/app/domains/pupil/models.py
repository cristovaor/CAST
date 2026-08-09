from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, Column, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.db.base_class import Base


class PupilRun(Base):
    __tablename__ = "pupil_runs"
    __table_args__ = (
        CheckConstraint("status IN ('queued','processing','ready','failed','no_go')", name="ck_pupil_runs_status"),
        Index("ix_pupil_runs_session_created", "session_id", "created_at"),
    )
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    face_artifact_id = Column(UUID(as_uuid=True), ForeignKey("landmark_artifacts.id", ondelete="RESTRICT"), nullable=False)
    environment_artifact_id = Column(UUID(as_uuid=True), ForeignKey("environment_artifacts.id", ondelete="SET NULL"))
    status = Column(String, nullable=False, default="queued")
    input_uri = Column(String, nullable=False)
    input_checksum_sha256 = Column(String, nullable=False)
    configuration = Column(JSONB, nullable=False, default=dict)
    metrics = Column(JSONB, nullable=False, default=dict)
    verdict = Column(String)
    error_message = Column(Text)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    completed_at = Column(DateTime)


class PupilArtifact(Base):
    __tablename__ = "pupil_artifacts"
    __table_args__ = (
        UniqueConstraint("run_id", "kind", "layer", name="uq_pupil_artifact_layer"),
        CheckConstraint("layer IN ('RAW','DERIVED','FILTERED')", name="ck_pupil_artifacts_layer"),
    )
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id = Column(UUID(as_uuid=True), ForeignKey("pupil_runs.id", ondelete="CASCADE"), nullable=False)
    kind = Column(String, nullable=False)
    layer = Column(String, nullable=False)
    storage_uri = Column(String, nullable=False)
    checksum_sha256 = Column(String, nullable=False)
    schema_version = Column(String, nullable=False, default="1")
    pipeline_version = Column(String, nullable=False, default="pupil-webcam-v1")
    start_time_us = Column(BigInteger, nullable=False)
    end_time_us = Column(BigInteger, nullable=False)
    sample_count = Column(Integer, nullable=False)
    metrics = Column(JSONB, nullable=False, default=dict)
    provenance = Column(JSONB, nullable=False, default=dict)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

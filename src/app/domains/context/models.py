from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, CheckConstraint, Column, DateTime, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.db.base_class import Base


class ExperimentalTrial(Base):
    __tablename__ = "experimental_trials"
    __table_args__ = (
        UniqueConstraint("session_id", "client_trial_id", name="uq_experimental_trials_client"),
        CheckConstraint(
            "ended_canonical_time_us IS NULL OR started_canonical_time_us IS NULL OR "
            "ended_canonical_time_us >= started_canonical_time_us",
            name="ck_experimental_trials_range",
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    client_trial_id = Column(String, nullable=False)
    label = Column(String, nullable=False)
    source_clock_id = Column(String, nullable=False)
    started_source_time_us = Column(BigInteger, nullable=False)
    ended_source_time_us = Column(BigInteger)
    started_canonical_time_us = Column(BigInteger)
    ended_canonical_time_us = Column(BigInteger)
    uncertainty_us = Column(BigInteger, nullable=False, default=0)
    quality_flags = Column(JSONB, nullable=False, default=list)
    valid = Column(Boolean, nullable=False, default=True)
    metadata_info = Column(JSONB, nullable=False, default=dict)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class StimulusAsset(Base):
    __tablename__ = "stimulus_assets"
    __table_args__ = (UniqueConstraint("session_id", "client_stimulus_id", name="uq_stimulus_assets_client"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    client_stimulus_id = Column(String, nullable=False)
    label = Column(String, nullable=False)
    kind = Column(String, nullable=False)
    storage_uri = Column(String)
    mime_type = Column(String)
    checksum_sha256 = Column(String)
    metadata_info = Column(JSONB, nullable=False, default=dict)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class ExperimentalEvent(Base):
    __tablename__ = "experimental_events"
    __table_args__ = (
        UniqueConstraint("session_id", "client_event_id", name="uq_experimental_events_client"),
        Index("ix_experimental_events_session_canonical", "session_id", "canonical_time_us"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    trial_id = Column(UUID(as_uuid=True), ForeignKey("experimental_trials.id", ondelete="SET NULL"))
    client_event_id = Column(String, nullable=False)
    event_type = Column(String, nullable=False)
    source_time_us = Column(BigInteger, nullable=False)
    source_clock_id = Column(String, nullable=False)
    canonical_time_us = Column(BigInteger)
    uncertainty_us = Column(BigInteger, nullable=False, default=0)
    quality_flags = Column(JSONB, nullable=False, default=list)
    valid = Column(Boolean, nullable=False, default=True)
    payload = Column(JSONB, nullable=False, default=dict)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class EnvironmentArtifact(Base):
    __tablename__ = "environment_artifacts"
    __table_args__ = (
        CheckConstraint("end_time_us >= start_time_us", name="ck_environment_artifacts_range"),
        Index("ix_environment_artifacts_session_kind_created", "session_id", "kind", "created_at"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    kind = Column(String, nullable=False)
    status = Column(String, nullable=False, default="queued")
    unit = Column(String, nullable=False)
    method = Column(String, nullable=False)
    raw_uri = Column(String, nullable=False)
    derived_uri = Column(String)
    raw_checksum_sha256 = Column(String, nullable=False)
    derived_checksum_sha256 = Column(String)
    start_time_us = Column(BigInteger, nullable=False)
    end_time_us = Column(BigInteger, nullable=False)
    sample_count = Column(BigInteger, nullable=False)
    source_clock_id = Column(String, nullable=False)
    provenance = Column(JSONB, nullable=False, default=dict)
    error_message = Column(Text)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

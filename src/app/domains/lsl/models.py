from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, Column, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.db.base_class import Base


class LSLRecording(Base):
    __tablename__ = "lsl_recordings"
    __table_args__ = (
        CheckConstraint("status IN ('awaiting_agent','recording','completed','processing','ready','failed','aborted')", name="ck_lsl_recordings_status"),
        Index("ix_lsl_recordings_session_status_created", "session_id", "status", "created_at"),
    )
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    status = Column(String, nullable=False, default="awaiting_agent")
    agent_id = Column(String, nullable=False)
    object_key = Column(String, nullable=False, unique=True)
    selected_stream_ids = Column(JSONB, nullable=False, default=list)
    discovery_snapshot = Column(JSONB, nullable=False, default=list)
    browser_clock = Column(JSONB, nullable=False, default=dict)
    checksum_sha256 = Column(String)
    size_bytes = Column(BigInteger)
    eeg_asset_id = Column(UUID(as_uuid=True), ForeignKey("eeg_assets.id", ondelete="SET NULL"), unique=True)
    sync_evidence_id = Column(UUID(as_uuid=True), ForeignKey("sync_evidence.id", ondelete="SET NULL"), unique=True)
    started_source_time_us = Column(BigInteger)
    ended_source_time_us = Column(BigInteger)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    error_message = Column(Text)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class LSLRecordingStream(Base):
    __tablename__ = "lsl_recording_streams"
    __table_args__ = (
        UniqueConstraint("recording_id", "stream_uid", name="uq_lsl_recording_stream_uid"),
        Index("ix_lsl_recording_streams_recording_type", "recording_id", "stream_type"),
    )
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    recording_id = Column(UUID(as_uuid=True), ForeignKey("lsl_recordings.id", ondelete="CASCADE"), nullable=False)
    stream_uid = Column(String, nullable=False)
    name = Column(String, nullable=False)
    stream_type = Column(String, nullable=False)
    source_id = Column(String)
    hostname = Column(String)
    channel_count = Column(Integer)
    nominal_srate = Column(Float)
    channel_format = Column(String)
    clock_offset_seconds = Column(Float)
    metadata_info = Column(JSONB, nullable=False, default=dict)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

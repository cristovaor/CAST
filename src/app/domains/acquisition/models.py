"""Persistence models for resumable live video acquisition and bookmarks.

These models reference Session by foreign key but deliberately do not extend
the Session aggregate or import modality implementations.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.db.base_class import Base


class VideoCaptureRun(Base):
    __tablename__ = "video_capture_runs"
    __table_args__ = (
        CheckConstraint(
            "status IN ('created', 'uploading', 'completing', 'completed', "
            "'validating', 'ready', 'aborted', 'failed')",
            name="ck_video_capture_runs_status",
        ),
        Index(
            "ix_video_capture_runs_session_status_created",
            "session_id",
            "status",
            "created_at",
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(
        UUID(as_uuid=True),
        ForeignKey("sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    created_by = Column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    status = Column(String, nullable=False, default="created")
    filename = Column(String, nullable=False)
    mime_type = Column(String, nullable=False)
    object_key = Column(String, nullable=False, unique=True)
    upload_id = Column(String, nullable=True, unique=True)
    finalization_job_id = Column(
        UUID(as_uuid=True),
        ForeignKey("processing_jobs.id", ondelete="SET NULL"),
        unique=True,
    )
    video_asset_id = Column(
        UUID(as_uuid=True),
        ForeignKey("video_assets.id", ondelete="SET NULL"),
        unique=True,
    )
    camera_constraints = Column(JSONB, nullable=False, default=dict)
    browser_clock = Column(JSONB, nullable=False, default=dict)
    sync_anchors = Column(JSONB, nullable=False, default=list)
    started_source_time_us = Column(BigInteger)
    ended_source_time_us = Column(BigInteger)
    started_canonical_time_us = Column(BigInteger)
    ended_canonical_time_us = Column(BigInteger)
    expected_size_bytes = Column(BigInteger)
    received_size_bytes = Column(BigInteger, nullable=False, default=0)
    checksum_sha256 = Column(String)
    pts_uri = Column(String)
    pts_checksum_sha256 = Column(String)
    error_message = Column(Text)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    completed_at = Column(DateTime)
    aborted_at = Column(DateTime)


class VideoCapturePart(Base):
    __tablename__ = "video_capture_parts"
    __table_args__ = (
        UniqueConstraint(
            "capture_run_id", "part_number", name="uq_video_capture_parts_number"
        ),
        CheckConstraint("part_number > 0", name="ck_video_capture_parts_number"),
        CheckConstraint("size_bytes >= 0", name="ck_video_capture_parts_size"),
        Index("ix_video_capture_parts_run_number", "capture_run_id", "part_number"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    capture_run_id = Column(
        UUID(as_uuid=True),
        ForeignKey("video_capture_runs.id", ondelete="CASCADE"),
        nullable=False,
    )
    part_number = Column(Integer, nullable=False)
    size_bytes = Column(BigInteger, nullable=False)
    checksum_sha256 = Column(String, nullable=False)
    etag = Column(String, nullable=False)
    uploaded_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class ResearchBookmark(Base):
    __tablename__ = "research_bookmarks"
    __table_args__ = (
        UniqueConstraint(
            "session_id", "client_event_id", name="uq_research_bookmarks_client_event"
        ),
        CheckConstraint(
            "end_canonical_time_us IS NULL OR "
            "end_canonical_time_us >= start_canonical_time_us",
            name="ck_research_bookmarks_range",
        ),
        Index(
            "ix_research_bookmarks_session_range",
            "session_id",
            "start_canonical_time_us",
            "end_canonical_time_us",
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(
        UUID(as_uuid=True),
        ForeignKey("sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    created_by = Column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    client_event_id = Column(String, nullable=False)
    start_canonical_time_us = Column(BigInteger, nullable=False)
    end_canonical_time_us = Column(BigInteger)
    label = Column(String, nullable=False)
    comment = Column(Text)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

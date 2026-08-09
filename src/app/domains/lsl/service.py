from __future__ import annotations

import uuid
from datetime import datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.domains.lsl.models import LSLRecording, LSLRecordingStream
from app.domains.lsl.schemas import LSLRecordingComplete, LSLRecordingCreate
from app.services.storage_service import storage_service


def create_recording(db: Session, *, session_id: UUID, user_id: UUID, payload: LSLRecordingCreate) -> tuple[LSLRecording, str]:
    recording_id = uuid.uuid4()
    object_key = f"lsl/{session_id}/{recording_id}/recording.xdf"
    recording = LSLRecording(
        id=recording_id, session_id=session_id, created_by=user_id,
        status="awaiting_agent", agent_id=payload.agent_id, object_key=object_key,
        selected_stream_ids=payload.selected_stream_ids, browser_clock=payload.browser_clock,
    )
    db.add(recording); db.commit(); db.refresh(recording)
    return recording, storage_service.generate_presigned_upload_url(object_key)


def replace_discovery(db: Session, recording: LSLRecording, streams: list[dict[str, object]]) -> LSLRecording:
    if recording.status not in {"awaiting_agent", "recording"}:
        raise HTTPException(status_code=409, detail="Recording no longer accepts discovery updates")
    recording.discovery_snapshot = streams
    db.query(LSLRecordingStream).filter(LSLRecordingStream.recording_id == recording.id).delete()
    for index, stream in enumerate(streams):
        db.add(LSLRecordingStream(
            recording_id=recording.id,
            stream_uid=str(stream.get("uid") or stream.get("source_id") or index),
            name=str(stream.get("name") or "Unnamed stream"),
            stream_type=str(stream.get("type") or "Unknown"),
            source_id=str(stream.get("source_id") or "") or None,
            hostname=str(stream.get("hostname") or "") or None,
            channel_count=int(stream.get("channel_count") or 0),
            nominal_srate=float(stream.get("nominal_srate") or 0),
            channel_format=str(stream.get("channel_format") or "") or None,
            metadata_info=stream,
        ))
    db.commit(); db.refresh(recording); return recording


def mark_started(db: Session, recording: LSLRecording, source_time_us: int) -> LSLRecording:
    if recording.status == "recording": return recording
    if recording.status != "awaiting_agent":
        raise HTTPException(status_code=409, detail="Recording cannot start")
    recording.status = "recording"; recording.started_source_time_us = source_time_us; recording.started_at = datetime.utcnow()
    db.commit(); db.refresh(recording); return recording


def complete_recording(db: Session, recording: LSLRecording, payload: LSLRecordingComplete) -> tuple[LSLRecording, bool]:
    if recording.status in {"completed", "processing", "ready"}:
        if recording.checksum_sha256 != payload.checksum_sha256:
            raise HTTPException(status_code=409, detail="Recording already completed with another checksum")
        return recording, False
    if recording.status not in {"awaiting_agent", "recording"}:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Recording cannot be completed")
    recording.status = "processing"
    recording.checksum_sha256 = payload.checksum_sha256
    recording.size_bytes = payload.size_bytes
    recording.ended_source_time_us = payload.ended_source_time_us
    recording.completed_at = datetime.utcnow()
    db.commit(); db.refresh(recording); return recording, True

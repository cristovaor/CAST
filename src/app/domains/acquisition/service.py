"""Business rules for resumable capture. HTTP and Celery remain adapters."""

from __future__ import annotations

import uuid
from datetime import datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.domains.acquisition.models import (
    ResearchBookmark,
    VideoCapturePart,
    VideoCaptureRun,
)
from app.domains.acquisition.schemas import (
    ResearchBookmarkCreate,
    VideoCaptureComplete,
    VideoCaptureCreate,
)
from app.db.models import JobStatus, JobType, ProcessingJob
from app.services.storage_service import storage_service


def create_capture(
    db: Session, *, session_id: UUID, user_id: UUID, payload: VideoCaptureCreate
) -> VideoCaptureRun:
    capture_id = uuid.uuid4()
    suffix = ".webm" if payload.mime_type == "video/webm" else ".mp4"
    object_key = f"live-captures/{session_id}/{capture_id}/raw{suffix}"
    upload_id = storage_service.create_multipart_upload(
        object_key, content_type=payload.mime_type
    )
    capture = VideoCaptureRun(
        id=capture_id,
        session_id=session_id,
        created_by=user_id,
        status="uploading",
        filename=payload.filename,
        mime_type=payload.mime_type,
        object_key=object_key,
        upload_id=upload_id,
        camera_constraints=payload.camera_constraints,
        browser_clock=payload.browser_clock,
        sync_anchors=payload.sync_anchors,
        started_source_time_us=payload.started_source_time_us,
        started_canonical_time_us=payload.started_canonical_time_us,
        expected_size_bytes=payload.expected_size_bytes,
    )
    db.add(capture)
    db.commit()
    db.refresh(capture)
    return capture


def presign_part(capture: VideoCaptureRun, part_number: int) -> str:
    if capture.status not in {"created", "uploading"} or not capture.upload_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Capture is not accepting parts",
        )
    return storage_service.generate_presigned_part_url(
        capture.object_key, capture.upload_id, part_number
    )


def complete_capture(
    db: Session, *, capture: VideoCaptureRun, payload: VideoCaptureComplete
) -> VideoCaptureRun:
    if capture.status in {"completed", "validating", "ready"}:
        if capture.checksum_sha256 != payload.checksum_sha256:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Capture was completed with a different checksum",
            )
        return capture
    if capture.status not in {"created", "uploading"} or not capture.upload_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Capture cannot be completed",
        )

    ordered = sorted(payload.parts, key=lambda item: item.part_number)
    received_size = sum(part.size_bytes for part in ordered)
    if (
        capture.expected_size_bytes is not None
        and received_size != capture.expected_size_bytes
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Uploaded size does not match expected_size_bytes",
        )

    capture.status = "completing"
    db.flush()
    storage_service.complete_multipart_upload(
        capture.object_key,
        capture.upload_id,
        [
            {"PartNumber": item.part_number, "ETag": item.etag}
            for item in ordered
        ],
    )
    for item in ordered:
        existing = (
            db.query(VideoCapturePart)
            .filter(
                VideoCapturePart.capture_run_id == capture.id,
                VideoCapturePart.part_number == item.part_number,
            )
            .first()
        )
        if existing is None:
            db.add(
                VideoCapturePart(
                    capture_run_id=capture.id,
                    part_number=item.part_number,
                    size_bytes=item.size_bytes,
                    checksum_sha256=item.checksum_sha256,
                    etag=item.etag,
                )
            )
        else:
            existing.size_bytes = item.size_bytes
            existing.checksum_sha256 = item.checksum_sha256
            existing.etag = item.etag

    capture.status = "completed"
    capture.received_size_bytes = received_size
    capture.checksum_sha256 = payload.checksum_sha256
    capture.ended_source_time_us = payload.ended_source_time_us
    capture.ended_canonical_time_us = payload.ended_canonical_time_us
    capture.completed_at = datetime.utcnow()
    capture.upload_id = None
    db.commit()
    db.refresh(capture)
    return capture


def enqueue_capture_finalization(
    db: Session, capture: VideoCaptureRun
) -> tuple[ProcessingJob, bool]:
    if capture.status == "ready" and capture.finalization_job_id:
        job = db.query(ProcessingJob).filter(
            ProcessingJob.id == capture.finalization_job_id
        ).one()
        return job, False
    if capture.status not in {"completed", "validating"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Capture is not ready for finalization",
        )
    if capture.finalization_job_id:
        job = db.query(ProcessingJob).filter(
            ProcessingJob.id == capture.finalization_job_id
        ).one()
        return job, False
    job = ProcessingJob(
        session_id=capture.session_id,
        job_type=JobType.validate,
        status=JobStatus.queued,
    )
    db.add(job)
    db.flush()
    capture.finalization_job_id = job.id
    capture.status = "validating"
    db.commit()
    db.refresh(job)
    return job, True


def abort_capture(db: Session, capture: VideoCaptureRun) -> VideoCaptureRun:
    if capture.status in {"completed", "validating", "ready"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Completed capture cannot be aborted",
        )
    if capture.status == "aborted":
        return capture
    if capture.upload_id:
        storage_service.abort_multipart_upload(
            capture.object_key, capture.upload_id
        )
    capture.status = "aborted"
    capture.upload_id = None
    capture.aborted_at = datetime.utcnow()
    db.commit()
    db.refresh(capture)
    return capture


def create_bookmark(
    db: Session, *, session_id: UUID, user_id: UUID, payload: ResearchBookmarkCreate
) -> ResearchBookmark:
    existing = (
        db.query(ResearchBookmark)
        .filter(
            ResearchBookmark.session_id == session_id,
            ResearchBookmark.client_event_id == payload.client_event_id,
        )
        .first()
    )
    if existing is not None:
        return existing
    bookmark = ResearchBookmark(
        session_id=session_id,
        created_by=user_id,
        **payload.model_dump(),
    )
    db.add(bookmark)
    db.commit()
    db.refresh(bookmark)
    return bookmark

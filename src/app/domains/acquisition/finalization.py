"""Validation and materialization of a completed live capture.

Raw uploads remain immutable. This service produces a normalized MP4, real PTS
evidence and exactly one VideoAsset before landmark extraction is queued.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import tempfile
from datetime import datetime
from fractions import Fraction
from pathlib import Path
from uuid import UUID

from sqlalchemy.orm import Session

from app.db.models import (
    JobStatus,
    JobType,
    ProcessingJob,
    VideoAsset,
    VideoStatus,
)
from app.domains.acquisition.models import VideoCaptureRun
from app.services.storage_service import storage_service


def _sha256_file(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _run_json(command: list[str]) -> dict:
    completed = subprocess.run(
        command, check=True, capture_output=True, text=True
    )
    return json.loads(completed.stdout)


def _probe_video(path: str) -> dict[str, object]:
    payload = _run_json(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=codec_name,width,height,avg_frame_rate,r_frame_rate,duration:format=duration",
            "-of",
            "json",
            path,
        ]
    )
    streams = payload.get("streams") or []
    if not streams:
        raise ValueError("Capture does not contain a video stream")
    stream = streams[0]
    rate = stream.get("avg_frame_rate") or stream.get("r_frame_rate") or "0/1"
    fps = float(Fraction(str(rate))) if rate != "0/0" else 0.0
    duration = stream.get("duration") or (payload.get("format") or {}).get("duration")
    return {
        "codec": stream.get("codec_name"),
        "width": int(stream.get("width") or 0),
        "height": int(stream.get("height") or 0),
        "fps": fps,
        "duration_seconds": float(duration or 0),
    }


def _extract_pts(path: str) -> tuple[bytes, int]:
    payload = _run_json(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_frames",
            "-show_entries",
            "frame=best_effort_timestamp_time,pkt_duration_time,key_frame",
            "-of",
            "json",
            path,
        ]
    )
    lines: list[str] = []
    previous: int | None = None
    for index, frame in enumerate(payload.get("frames") or []):
        raw_time = frame.get("best_effort_timestamp_time")
        if raw_time is None:
            continue
        time_us = round(float(raw_time) * 1_000_000)
        if previous is not None and time_us < previous:
            raise ValueError("Video PTS are not monotonic")
        previous = time_us
        duration = frame.get("pkt_duration_time")
        lines.append(
            json.dumps(
                {
                    "frame": index,
                    "source_time_us": time_us,
                    "source_clock_id": "video-pts",
                    "duration_us": (
                        round(float(duration) * 1_000_000)
                        if duration is not None
                        else None
                    ),
                    "key_frame": bool(frame.get("key_frame")),
                    "quality_flags": [],
                    "valid": True,
                },
                separators=(",", ":"),
            )
        )
    if not lines:
        raise ValueError("No decodable video PTS were found")
    return ("\n".join(lines) + "\n").encode("utf-8"), len(lines)


def _normalize_video(source: str, destination: str) -> None:
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            "-i",
            source,
            "-map",
            "0:v:0",
            "-map",
            "0:a?",
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "18",
            "-c:a",
            "aac",
            "-movflags",
            "+faststart",
            destination,
        ],
        check=True,
        capture_output=True,
        text=True,
    )


def finalize_capture(
    db: Session, *, capture_id: UUID, job_id: UUID
) -> tuple[VideoAsset, ProcessingJob | None, bool]:
    capture = db.query(VideoCaptureRun).filter(VideoCaptureRun.id == capture_id).one()
    job = db.query(ProcessingJob).filter(ProcessingJob.id == job_id).one()
    if capture.video_asset_id:
        video = db.query(VideoAsset).filter(
            VideoAsset.id == capture.video_asset_id
        ).one()
        job.status = JobStatus.succeeded
        job.progress = 100
        job.finished_at = datetime.utcnow()
        db.commit()
        return video, None, True
    if capture.status not in {"completed", "validating"}:
        raise ValueError(f"Capture cannot be finalized from {capture.status}")

    existing = db.query(VideoAsset).filter(
        VideoAsset.session_id == capture.session_id
    ).first()
    if existing is not None:
        raise ValueError("Session already has a different VideoAsset")

    job.status = JobStatus.running
    job.progress = 5
    job.started_at = datetime.utcnow()
    db.commit()

    raw_suffix = Path(capture.filename).suffix or ".webm"
    raw_path = normalized_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=raw_suffix, delete=False) as raw:
            raw_path = raw.name
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as normalized:
            normalized_path = normalized.name
        storage_service.download_to_file(capture.object_key, raw_path)
        raw_checksum = _sha256_file(raw_path)
        if raw_checksum != capture.checksum_sha256:
            raise ValueError("Completed capture checksum mismatch")

        raw_probe = _probe_video(raw_path)
        pts_bytes, frame_count = _extract_pts(raw_path)
        pts_checksum = hashlib.sha256(pts_bytes).hexdigest()
        pts_key = f"live-captures/{capture.session_id}/{capture.id}/pts.jsonl"
        if not storage_service.upload_bytes(
            pts_key, pts_bytes, "application/x-ndjson"
        ):
            raise IOError("Could not persist capture PTS evidence")

        _normalize_video(raw_path, normalized_path)
        normalized_probe = _probe_video(normalized_path)
        normalized_checksum = _sha256_file(normalized_path)
        normalized_key = f"videos/{capture.session_id}/{capture.id}.mp4"
        storage_service.upload_file(
            normalized_key, normalized_path, content_type="video/mp4"
        )

        video = VideoAsset(
            session_id=capture.session_id,
            storage_uri=f"s3://{storage_service.bucket_name}/{normalized_key}",
            filename=f"{Path(capture.filename).stem}.mp4",
            mime_type="video/mp4",
            size_bytes=os.path.getsize(normalized_path),
            duration_seconds=normalized_probe["duration_seconds"],
            width=normalized_probe["width"],
            height=normalized_probe["height"],
            fps=normalized_probe["fps"],
            checksum_sha256=normalized_checksum,
            status=VideoStatus.validated,
            quality_report={
                "source": "live-capture",
                "raw_storage_uri": (
                    f"s3://{storage_service.bucket_name}/{capture.object_key}"
                ),
                "raw_checksum_sha256": raw_checksum,
                "raw_probe": raw_probe,
                "normalized_probe": normalized_probe,
                "pts_uri": f"s3://{storage_service.bucket_name}/{pts_key}",
                "pts_checksum_sha256": pts_checksum,
                "frame_count": frame_count,
            },
        )
        db.add(video)
        db.flush()
        capture.video_asset_id = video.id
        capture.pts_uri = f"s3://{storage_service.bucket_name}/{pts_key}"
        capture.pts_checksum_sha256 = pts_checksum
        capture.status = "ready"
        job.status = JobStatus.succeeded
        job.progress = 100
        job.finished_at = datetime.utcnow()
        job.result = {
            "video_asset_id": str(video.id),
            "pts_uri": capture.pts_uri,
            "frame_count": frame_count,
        }

        landmark_job = ProcessingJob(
            video_asset_id=video.id,
            session_id=capture.session_id,
            job_type=JobType.extract_landmarks,
            status=JobStatus.queued,
        )
        db.add(landmark_job)
        db.commit()
        db.refresh(video)
        db.refresh(landmark_job)
        return video, landmark_job, False
    finally:
        for path in (raw_path, normalized_path):
            if path and os.path.exists(path):
                os.remove(path)


def mark_finalization_failed(
    db: Session, *, capture_id: UUID, job_id: UUID, error: Exception
) -> None:
    db.rollback()
    capture = db.query(VideoCaptureRun).filter(VideoCaptureRun.id == capture_id).first()
    job = db.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
    if capture is not None:
        capture.status = "failed"
        capture.error_message = str(error)
    if job is not None:
        job.status = JobStatus.failed
        job.error_message = str(error)
        job.finished_at = datetime.utcnow()
    db.commit()

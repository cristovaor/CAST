import hashlib
from pathlib import Path

from app.db.models import JobStatus, JobType, ProcessingJob, VideoAsset
from app.domains.acquisition.finalization import _extract_pts, finalize_capture
from app.domains.acquisition.schemas import VideoCaptureCreate
from app.domains.acquisition.service import (
    create_capture,
    enqueue_capture_finalization,
)
from tests.services.test_live_capture_service import _session


def test_extract_pts_emits_real_monotonic_source_time(monkeypatch):
    monkeypatch.setattr(
        "app.domains.acquisition.finalization._run_json",
        lambda _command: {
            "frames": [
                {
                    "best_effort_timestamp_time": "0.000000",
                    "pkt_duration_time": "0.033333",
                    "key_frame": 1,
                },
                {
                    "best_effort_timestamp_time": "0.033333",
                    "pkt_duration_time": "0.033333",
                    "key_frame": 0,
                },
            ]
        },
    )

    evidence, count = _extract_pts("capture.webm")

    assert count == 2
    assert b'"source_time_us":0' in evidence
    assert b'"source_time_us":33333' in evidence
    assert b'"source_clock_id":"video-pts"' in evidence


def test_finalization_materializes_one_video_and_enqueues_landmarks(
    db, normal_user, monkeypatch, tmp_path
):
    session = _session(db, normal_user)
    raw_bytes = b"immutable-raw-capture"
    raw_checksum = hashlib.sha256(raw_bytes).hexdigest()
    monkeypatch.setattr(
        "app.domains.acquisition.service.storage_service.create_multipart_upload",
        lambda *_args, **_kwargs: "upload-1",
    )
    capture = create_capture(
        db,
        session_id=session.id,
        user_id=normal_user.id,
        payload=VideoCaptureCreate(
            filename="capture.webm",
            mime_type="video/webm",
        ),
    )
    capture.status = "completed"
    capture.checksum_sha256 = raw_checksum
    db.commit()
    finalization_job, created = enqueue_capture_finalization(db, capture)
    assert created is True

    def download(_object_key: str, destination: str) -> None:
        Path(destination).write_bytes(raw_bytes)

    def normalize(_source: str, destination: str) -> None:
        Path(destination).write_bytes(b"normalized-mp4")

    uploaded = []
    monkeypatch.setattr(
        "app.domains.acquisition.finalization.storage_service.download_to_file",
        download,
    )
    monkeypatch.setattr(
        "app.domains.acquisition.finalization.storage_service.upload_bytes",
        lambda *args, **_kwargs: uploaded.append(args) or True,
    )
    monkeypatch.setattr(
        "app.domains.acquisition.finalization.storage_service.upload_file",
        lambda *args, **_kwargs: uploaded.append(args),
    )
    monkeypatch.setattr(
        "app.domains.acquisition.finalization._probe_video",
        lambda _path: {
            "codec": "h264",
            "width": 1280,
            "height": 720,
            "fps": 30.0,
            "duration_seconds": 1.0,
        },
    )
    monkeypatch.setattr(
        "app.domains.acquisition.finalization._extract_pts",
        lambda _path: (b'{"source_time_us":0}\n', 1),
    )
    monkeypatch.setattr(
        "app.domains.acquisition.finalization._normalize_video", normalize
    )

    video, landmark_job, reused = finalize_capture(
        db, capture_id=capture.id, job_id=finalization_job.id
    )

    db.refresh(capture)
    assert reused is False
    assert capture.status == "ready"
    assert capture.video_asset_id == video.id
    assert capture.pts_uri.endswith("/pts.jsonl")
    assert landmark_job is not None
    assert landmark_job.job_type == JobType.extract_landmarks
    assert landmark_job.status == JobStatus.queued
    assert db.query(VideoAsset).filter(VideoAsset.session_id == session.id).count() == 1
    assert len(uploaded) == 2

    same_video, no_new_job, reused = finalize_capture(
        db, capture_id=capture.id, job_id=finalization_job.id
    )
    assert reused is True
    assert same_video.id == video.id
    assert no_new_job is None
    assert db.query(VideoAsset).filter(VideoAsset.session_id == session.id).count() == 1
    assert (
        db.query(ProcessingJob)
        .filter(ProcessingJob.job_type == JobType.extract_landmarks)
        .count()
        == 1
    )

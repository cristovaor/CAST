"""Real-stack smoke test for the EEG Celery worker.

This script is intentionally separate from the regular pytest suite. It expects
PostgreSQL, Redis and MinIO connection settings through the normal CAST
environment variables, and it must only be pointed at a disposable database.
The caller is responsible for creating/migrating and later dropping that
database.
"""

from __future__ import annotations

import hashlib
import json
import tempfile
import time
import uuid
from datetime import datetime
from pathlib import Path

import mne
import numpy as np

from app.db.models import (
    EEGAnalysisArtifact,
    EEGAnalysisRun,
    EEGAsset,
    EEGAssetFile,
    JobStatus,
    JobType,
    Organization,
    Participant,
    ProcessingJob,
    Project,
    Session,
    Study,
    User,
)
from app.db.session import SessionLocal
from app.services.storage_service import storage_service
from app.workers.tasks_eeg_analysis import process_eeg_analysis_task


TERMINAL_STATES = {"succeeded", "partial", "failed", "canceled"}


def _synthetic_fif() -> bytes:
    sampling_rate = 250.0
    duration_seconds = 16
    samples = int(sampling_rate * duration_seconds)
    timeline = np.arange(samples, dtype=float) / sampling_rate
    channels = ("Fp1", "Fp2", "C3", "C4")
    data = np.vstack(
        [
            15e-6 * np.sin(2 * np.pi * frequency * timeline)
            for frequency in (6.0, 10.0, 18.0, 24.0)
        ]
    )
    info = mne.create_info(channels, sampling_rate, ch_types="eeg")
    raw = mne.io.RawArray(data, info, verbose=False)
    raw.set_montage("standard_1020", verbose=False)
    with tempfile.TemporaryDirectory(prefix="cast-eeg-stack-fixture-") as directory:
        path = Path(directory) / "recording_raw.fif"
        raw.save(path, overwrite=True, verbose=False)
        return path.read_bytes()


def main() -> None:
    source_key = f"eeg/e2e/{uuid.uuid4()}/recording_raw.fif"
    uploaded_keys = {source_key}
    async_result = None
    run_id = None
    db = SessionLocal()
    try:
        payload = _synthetic_fif()
        checksum = hashlib.sha256(payload).hexdigest()
        if not storage_service.upload_bytes(source_key, payload, "application/octet-stream"):
            raise RuntimeError("could not upload the synthetic EEG fixture")

        organization = Organization(name="EEG stack smoke")
        user = User(
            email=f"eeg-smoke-{uuid.uuid4()}@example.invalid",
            name="EEG smoke",
            organization=organization,
        )
        project = Project(name="EEG smoke project", organization=organization)
        study = Study(name="EEG smoke study", project=project, created_by=user.id)
        participant = Participant(
            study=study,
            external_code="EEG-SMOKE-001",
            consent_status="accepted",
        )
        session = Session(participant=participant, condition="synthetic")
        asset = EEGAsset(
            session=session,
            storage_uri=f"s3://{storage_service.bucket_name}/{source_key}",
            filename="recording_raw.fif",
            mime_type="application/octet-stream",
            size_bytes=len(payload),
            eeg_format="FIF",
            sample_rate_hz=250.0,
            channel_count=4,
            channel_names=["Fp1", "Fp2", "C3", "C4"],
            montage="standard_1020",
            units="V",
        )
        asset_file = EEGAssetFile(
            eeg_asset=asset,
            role="primary",
            filename="recording_raw.fif",
            mime_type="application/octet-stream",
            storage_uri=asset.storage_uri,
            size_bytes=len(payload),
            checksum_sha256=checksum,
            is_primary=True,
            verified_at=datetime.utcnow(),
        )
        job = ProcessingJob(
            eeg_asset=asset,
            session_id=session.id,
            job_type=JobType.eeg_analysis,
            status=JobStatus.queued,
            progress=0,
            logs=[],
        )
        db.add_all(
            [
                organization,
                user,
                project,
                study,
                participant,
                session,
                asset,
                asset_file,
                job,
            ]
        )
        db.flush()
        run = EEGAnalysisRun(
            eeg_asset=asset,
            job_id=job.id,
            scope_type="session",
            pipeline="individual",
            profile="custom",
            parameters={
                "apply_ica": False,
                "random_seed": 20260731,
                "stages": ["preprocess", "power", "timeseries"],
            },
            input_manifest=[
                {
                    "filename": asset_file.filename,
                    "role": asset_file.role,
                    "size_bytes": asset_file.size_bytes,
                    "checksum_sha256": asset_file.checksum_sha256,
                }
            ],
            input_hash=hashlib.sha256(
                f"{checksum}:custom:20260731".encode("utf-8")
            ).hexdigest(),
            status="queued",
            step_status={},
            warnings=[],
            created_by=user.id,
        )
        db.add(run)
        db.flush()
        run.job_id = job.id
        run_id = run.id
        db.commit()

        async_result = process_eeg_analysis_task.apply_async(
            args=[str(run_id)],
            queue="eeg",
        )
        deadline = time.monotonic() + 240
        status = "queued"
        while time.monotonic() < deadline:
            db.expire_all()
            current = db.query(EEGAnalysisRun).filter_by(id=run_id).one()
            status = current.status
            if status in TERMINAL_STATES:
                break
            time.sleep(1)
        else:
            raise TimeoutError("EEG worker did not reach a terminal state")

        current = db.query(EEGAnalysisRun).filter_by(id=run_id).one()
        current_job = db.query(ProcessingJob).filter_by(id=job.id).one()
        artifacts = (
            db.query(EEGAnalysisArtifact)
            .filter_by(run_id=run_id)
            .order_by(EEGAnalysisArtifact.kind)
            .all()
        )
        if current.status not in {"succeeded", "partial"}:
            raise AssertionError(
                f"EEG run ended as {current.status}: {current.error_message}"
            )
        if current_job.status != JobStatus.succeeded or current_job.worker_id != "eeg":
            raise AssertionError(
                f"unexpected job state: {current_job.status}/{current_job.worker_id}"
            )
        artifact_kinds = {artifact.kind for artifact in artifacts}
        required_kinds = {
            "pipeline-manifest",
            "power-json",
            "preprocessed-fif",
            "preprocessing-report",
            "timeseries-index",
            "timeseries-tile",
        }
        if not required_kinds.issubset(artifact_kinds):
            raise AssertionError(
                f"missing artifact kinds: {sorted(required_kinds - artifact_kinds)}"
            )
        for artifact in artifacts:
            key = storage_service.key_from_uri(artifact.storage_uri)
            uploaded_keys.add(key)
            content = storage_service.download_bytes(key)
            if len(content) != artifact.size_bytes:
                raise AssertionError(f"size mismatch for {artifact.kind}")
            if hashlib.sha256(content).hexdigest() != artifact.checksum_sha256:
                raise AssertionError(f"checksum mismatch for {artifact.kind}")
            if artifact.kind == "pipeline-manifest":
                manifest = json.loads(content)
                if manifest.get("schema") != "eeg-result-v1":
                    raise AssertionError("pipeline manifest schema mismatch")

        print(
            json.dumps(
                {
                    "run_id": str(run_id),
                    "status": current.status,
                    "job_status": current_job.status.value,
                    "worker_id": current_job.worker_id,
                    "artifact_count": len(artifacts),
                    "artifact_kinds": sorted(artifact_kinds),
                    "schema": "eeg-result-v1",
                },
                sort_keys=True,
            )
        )
    finally:
        if async_result is not None and run_id is not None:
            db.expire_all()
            current = db.query(EEGAnalysisRun).filter_by(id=run_id).first()
            if current is not None and current.status not in TERMINAL_STATES:
                async_result.revoke(terminate=False)
        for key in uploaded_keys:
            storage_service.delete_object(key)
        db.close()


if __name__ == "__main__":
    main()

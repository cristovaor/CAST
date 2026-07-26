"""Celery jobs for immutable, evidence-based synchronization runs."""

from __future__ import annotations

import csv
from datetime import datetime
import io
import json
import math
import os
import subprocess
import tempfile
from typing import Any
from uuid import UUID

from celery.utils.log import get_task_logger

from app.workers.celery_app import celery_app
from app.db.session import SessionLocal
from app.db.models import (
    EEGAsset,
    JobStatus,
    ProcessingJob,
    SyncEvidence,
    SyncRun,
    SyncState,
    Synchronization,
    VideoAsset,
)
from app.services.storage_service import storage_service
from app.services.sync_processing_service import process_sync


logger = get_task_logger(__name__)


def _log(job: ProcessingJob, message: str, level: str = "info") -> None:
    logs = list(job.logs or [])
    logs.append(
        {
            "timestamp": datetime.utcnow().isoformat(),
            "level": level,
            "message": message,
        }
    )
    job.logs = logs


def _read_csv_rows(data: bytes) -> list[dict[str, Any]]:
    text = data.decode("utf-8", errors="replace")
    rows: list[dict[str, Any]] = []
    for row in csv.DictReader(io.StringIO(text)):
        parsed: dict[str, Any] = {}
        for key, value in row.items():
            if value is None:
                parsed[key] = None
                continue
            try:
                parsed[key] = float(value)
            except (TypeError, ValueError):
                parsed[key] = value
        rows.append(parsed)
    return rows


def _read_eeg_rows(eeg_asset: EEGAsset) -> list[dict[str, Any]]:
    key = storage_service.key_from_uri(eeg_asset.storage_uri)
    data = storage_service.download_bytes(key)
    filename = (eeg_asset.filename or "eeg.csv").lower()
    if filename.endswith((".csv", ".tsv", ".txt")):
        return _read_csv_rows(data)

    raw = _read_mne_raw(data, filename)
    try:
        import numpy as np
    except ImportError as exc:
        raise RuntimeError("NumPy is unavailable in the worker") from exc
    sample_rate = float(raw.info["sfreq"])
    step = max(1, int(sample_rate / 50.0))
    sample_indices = np.arange(0, raw.n_times, step, dtype=int)
    channel_indices = [
        index
        for index, channel_type in enumerate(raw.get_channel_types())
        if channel_type not in {"stim", "misc"}
    ][:32]
    if not channel_indices:
        channel_indices = list(range(min(len(raw.ch_names), 32)))
    values = raw.get_data(picks=channel_indices)[:, sample_indices]
    rows: list[dict[str, Any]] = []
    for position, sample_index in enumerate(sample_indices):
        row: dict[str, Any] = {
            "timestamp_ms": float(sample_index) * 1000.0 / sample_rate,
        }
        for value_index, channel_index in enumerate(channel_indices):
            row[raw.ch_names[channel_index]] = float(values[value_index, position])
        rows.append(row)
    return rows


def _read_mne_raw(data: bytes, filename: str):
    try:
        import mne
    except ImportError as exc:
        raise RuntimeError("MNE is unavailable in the worker") from exc

    suffix = os.path.splitext(filename)[1].lower()
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp:
        temp.write(data)
        temp_path = temp.name
    try:
        mne.set_log_level("ERROR")
        if suffix == ".edf":
            return mne.io.read_raw_edf(temp_path, preload=True)
        if suffix == ".bdf":
            return mne.io.read_raw_bdf(temp_path, preload=True)
        if suffix == ".vhdr":
            return mne.io.read_raw_brainvision(temp_path, preload=True)
        if suffix == ".fif":
            return mne.io.read_raw_fif(temp_path, preload=True)
        if suffix == ".set":
            return mne.io.read_raw_eeglab(temp_path, preload=True)
        raise ValueError(f"Unsupported EEG format for synchronization: {suffix}")
    finally:
        try:
            os.unlink(temp_path)
        except OSError:
            pass


def _mne_events(eeg_asset: EEGAsset, parameters: dict[str, Any]) -> list[dict[str, Any]]:
    data = storage_service.download_bytes(
        storage_service.key_from_uri(eeg_asset.storage_uri)
    )
    raw = _read_mne_raw(data, eeg_asset.filename or "eeg.edf")
    sample_rate = float(raw.info["sfreq"])
    events: list[dict[str, Any]] = []
    try:
        import mne

        stim_events = mne.find_events(
            raw,
            stim_channel=parameters.get("eeg_channel"),
            shortest_event=1,
            verbose=False,
        )
        events.extend(
            {
                "time_ms": float(sample) * 1000.0 / sample_rate,
                "code": str(code),
            }
            for sample, _, code in stim_events
        )
    except (RuntimeError, ValueError):
        pass
    if not events and raw.annotations:
        events.extend(
            {
                "time_ms": float(onset) * 1000.0,
                "code": str(description),
            }
            for onset, description in zip(
                raw.annotations.onset,
                raw.annotations.description,
            )
        )
    if events:
        return events

    channel_name = parameters.get("eeg_channel")
    if channel_name and channel_name in raw.ch_names:
        signal = raw.get_data(picks=[channel_name])[0]
        try:
            import numpy as np
        except ImportError as exc:
            raise RuntimeError("NumPy is unavailable in the worker") from exc
        center = float(np.median(signal))
        mad = float(np.median(np.abs(signal - center)))
        threshold = center + max(1e-12, 5.0 * mad)
        high = signal >= threshold
        edge_samples = np.flatnonzero(np.logical_and(high[1:], ~high[:-1])) + 1
        debounce_samples = max(
            1,
            int(sample_rate * float(parameters.get("debounce_ms") or 5) / 1000),
        )
        last = -debounce_samples
        for sample in edge_samples:
            if int(sample) - last < debounce_samples:
                continue
            events.append(
                {
                    "time_ms": float(sample) * 1000.0 / sample_rate,
                    "code": "edge",
                }
            )
            last = int(sample)
    return events


def _payload_from_evidence(evidence: SyncEvidence) -> dict[str, Any]:
    payload = dict(evidence.payload or {})
    if not evidence.storage_uri:
        return payload
    data = storage_service.download_bytes(storage_service.key_from_uri(evidence.storage_uri))
    content_type = (evidence.content_type or "").lower()
    filename = (evidence.filename or "").lower()
    try:
        if "json" in content_type or filename.endswith(".json"):
            decoded = json.loads(data)
            if isinstance(decoded, dict):
                payload.update(decoded)
            elif isinstance(decoded, list):
                payload.setdefault("rows", decoded)
        elif "csv" in content_type or filename.endswith((".csv", ".tsv", ".txt")):
            rows = _read_csv_rows(data)
            payload.setdefault("rows", rows)
            if evidence.kind in {"hardware_trigger", "trigger_log"}:
                payload.setdefault("video_events", rows)
            elif evidence.kind in {"digital_marker", "marker_log"}:
                payload.setdefault("video_markers", rows)
            elif evidence.kind in {"eeg_trigger", "photodiode"}:
                payload.setdefault("eeg_events", rows)
            elif evidence.kind == "eeg_marker":
                payload.setdefault("eeg_markers", rows)
    except Exception as exc:
        payload["parse_error"] = str(exc)
    payload["_evidence_id"] = str(evidence.id)
    payload["_kind"] = evidence.kind
    return payload


def _video_bytes(video: VideoAsset) -> bytes:
    if not video.storage_uri:
        raise ValueError("Video asset has no storage URI")
    return storage_service.download_bytes(storage_service.key_from_uri(video.storage_uri))


def _visual_peaks(video: VideoAsset, parameters: dict[str, Any]) -> list[dict[str, float]]:
    """Detect luminance flashes inside an optional normalized ROI."""
    try:
        import cv2
    except ImportError as exc:
        raise RuntimeError("OpenCV is unavailable in the worker") from exc

    suffix = os.path.splitext(video.filename or "video.mp4")[1] or ".mp4"
    with tempfile.NamedTemporaryFile(suffix=suffix) as temp:
        temp.write(_video_bytes(video))
        temp.flush()
        capture = cv2.VideoCapture(temp.name)
        fps = float(capture.get(cv2.CAP_PROP_FPS) or video.fps or 0)
        if fps <= 0:
            capture.release()
            raise ValueError("Video FPS is unavailable")
        roi = parameters.get("roi") or {}
        values: list[float] = []
        while True:
            ok, frame = capture.read()
            if not ok:
                break
            height, width = frame.shape[:2]
            x = max(0, min(width - 1, int(float(roi.get("x", 0)) * width)))
            y = max(0, min(height - 1, int(float(roi.get("y", 0)) * height)))
            w = max(1, min(width - x, int(float(roi.get("width", 1)) * width)))
            h = max(1, min(height - y, int(float(roi.get("height", 1)) * height)))
            gray = cv2.cvtColor(frame[y : y + h, x : x + w], cv2.COLOR_BGR2GRAY)
            values.append(float(gray.mean()))
        capture.release()
    if len(values) < 3:
        return []
    sorted_values = sorted(values)
    center = sorted_values[len(sorted_values) // 2]
    deviations = sorted(abs(value - center) for value in values)
    mad = deviations[len(deviations) // 2]
    threshold = center + max(10.0, 5.0 * mad)
    peaks = []
    min_gap_frames = max(1, int(fps * float(parameters.get("min_gap_ms", 100)) / 1000))
    last_peak = -min_gap_frames
    for index in range(1, len(values) - 1):
        if (
            values[index] >= threshold
            and values[index] >= values[index - 1]
            and values[index] >= values[index + 1]
            and index - last_peak >= min_gap_frames
        ):
            peaks.append({"time_ms": index * 1000.0 / fps, "value": values[index]})
            last_peak = index
    return peaks


def _decode_audio(data: bytes, suffix: str, sample_rate: int = 16000) -> list[float]:
    with tempfile.NamedTemporaryFile(suffix=suffix) as source:
        source.write(data)
        source.flush()
        command = [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            source.name,
            "-ac",
            "1",
            "-ar",
            str(sample_rate),
            "-f",
            "f32le",
            "pipe:1",
        ]
        completed = subprocess.run(
            command,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=300,
        )
    try:
        import numpy as np
    except ImportError as exc:
        raise RuntimeError("NumPy is unavailable in the worker") from exc
    return np.frombuffer(completed.stdout, dtype="<f4").astype(float).tolist()


def _audio_context(
    video: VideoAsset,
    evidences: list[SyncEvidence],
    parameters: dict[str, Any],
) -> dict[str, Any]:
    sample_rate = int(parameters.get("audio_sample_rate_hz") or 16000)
    video_audio = _decode_audio(
        _video_bytes(video),
        os.path.splitext(video.filename or "video.mp4")[1] or ".mp4",
        sample_rate,
    )
    reference = next(
        (
            evidence
            for evidence in evidences
            if evidence.kind in {"eeg_audio", "audio_reference"} and evidence.storage_uri
        ),
        None,
    )
    if reference is None:
        return {"video_audio": video_audio, "video_audio_rate_hz": sample_rate}
    eeg_audio = _decode_audio(
        storage_service.download_bytes(storage_service.key_from_uri(reference.storage_uri)),
        os.path.splitext(reference.filename or "reference.wav")[1] or ".wav",
        sample_rate,
    )
    return {
        "video_audio": video_audio,
        "eeg_audio": eeg_audio,
        "video_audio_rate_hz": sample_rate,
        "eeg_audio_rate_hz": sample_rate,
    }


def _run_context(
    db,
    run: SyncRun,
    evidences: list[SyncEvidence],
    video: VideoAsset | None,
    eeg: EEGAsset | None,
) -> dict[str, Any]:
    context: dict[str, Any] = {
        "evidence_payloads": [_payload_from_evidence(evidence) for evidence in evidences],
        "duration_ms": max(
            float(video.duration_seconds or 0) * 1000 if video else 0,
            float(eeg.duration_seconds or 0) * 1000 if eeg else 0,
        ),
        "fps": float(video.fps or 0) if video else 0,
        "frame_period_ms": 1000.0 / float(video.fps) if video and video.fps else None,
        "sample_rate_hz": float(eeg.sample_rate_hz or 0) if eeg else 0,
        "sample_period_ms": 1000.0 / float(eeg.sample_rate_hz)
        if eeg and eeg.sample_rate_hz
        else None,
    }
    evidence_payloads = context["evidence_payloads"]
    has_evidence_key = lambda key: any(
        key in payload for payload in evidence_payloads
    )
    mne_supported = bool(
        eeg
        and (eeg.filename or "").lower().endswith(
            (".edf", ".bdf", ".vhdr", ".fif", ".set")
        )
    )
    if run.method == "event_correlation" and video and eeg:
        from app.api.v1.routes_videos import load_timeline_events

        facial_events, _ = load_timeline_events(video, db)
        context["facial_events"] = facial_events
        context["eeg_rows"] = _read_eeg_rows(eeg)
    elif (
        run.method in {"hardware_trigger", "digital_marker"}
        and eeg
        and mne_supported
        and not has_evidence_key(
            "eeg_markers" if run.method == "digital_marker" else "eeg_events"
        )
    ):
        eeg_events = _mne_events(eeg, run.parameters or {})
        if run.method == "digital_marker":
            context["eeg_markers"] = eeg_events
        else:
            context["eeg_events"] = eeg_events
    elif run.method == "visual_event" and video:
        context["visual_peaks"] = _visual_peaks(video, run.parameters or {})
        if eeg and mne_supported and not has_evidence_key("eeg_events"):
            context["eeg_events"] = _mne_events(eeg, run.parameters or {})
    elif run.method == "audio_event" and video:
        context.update(_audio_context(video, evidences, run.parameters or {}))
    elif run.method == "semi_automatic":
        base_run_id = (run.parameters or {}).get("base_run_id")
        if base_run_id:
            base = db.query(SyncRun).filter(SyncRun.id == base_run_id).first()
            if base and base.outcome == "proposal":
                context["base_result"] = base.result or {}
    return context


def process_sync_run(run_id: str) -> dict[str, Any]:
    db = SessionLocal()
    run: SyncRun | None = None
    job: ProcessingJob | None = None
    try:
        run = db.query(SyncRun).filter(SyncRun.id == run_id).first()
        if run is None:
            return {"error": "Synchronization run not found"}
        job = db.query(ProcessingJob).filter(ProcessingJob.id == run.job_id).first()
        if job is None:
            return {"error": "Synchronization job not found"}

        now = datetime.utcnow()
        run.status = "running"
        run.started_at = now
        job.status = JobStatus.running
        job.started_at = now
        job.progress = 5
        _log(job, f"Iniciando método {run.method}")
        db.commit()

        evidence_ids = [
            UUID(str(value))
            for value in (run.input_manifest or {}).get("evidence_ids", [])
        ]
        evidences = (
            db.query(SyncEvidence)
            .filter(
                SyncEvidence.session_id == run.session_id,
                SyncEvidence.id.in_(evidence_ids),
            )
            .all()
            if evidence_ids
            else []
        )
        video = db.query(VideoAsset).filter(VideoAsset.session_id == run.session_id).first()
        eeg = db.query(EEGAsset).filter(EEGAsset.session_id == run.session_id).first()
        job.progress = 25
        _log(job, f"{len(evidences)} evidência(s) validada(s)")
        db.commit()

        context = _run_context(db, run, evidences, video, eeg)
        job.progress = 60
        _log(job, "Entradas normalizadas; calculando transformação temporal")
        db.commit()

        output = process_sync(run.method, run.parameters or {}, context)
        finished = datetime.utcnow()
        run.status = "succeeded"
        run.outcome = output["outcome"]
        run.algorithm_version = output["algorithm_version"]
        run.result = output["result"]
        run.metrics = output["metrics"]
        run.quality_grade = output["quality_grade"]
        run.uncertainty_ms = output["uncertainty_ms"]
        run.finished_at = finished
        job.status = JobStatus.succeeded
        job.progress = 100
        job.finished_at = finished
        job.result = {
            "run_id": str(run.id),
            "outcome": run.outcome,
            "quality_grade": run.quality_grade,
        }

        synchronization = (
            db.query(Synchronization)
            .filter(Synchronization.session_id == run.session_id)
            .first()
        )
        if synchronization is None:
            synchronization = Synchronization(
                session_id=run.session_id,
                state=SyncState.not_synced,
            )
            db.add(synchronization)
        if synchronization.approved_run_id is None:
            if run.outcome == "proposal":
                synchronization.state = SyncState.auto_available
            else:
                synchronization.state = SyncState.not_synced
        history = list(synchronization.history or [])
        history.append(
            {
                "at": finished.isoformat(),
                "action": "Processamento de sincronização concluído",
                "run_id": str(run.id),
                "method": run.method,
                "outcome": run.outcome,
                "quality_grade": run.quality_grade,
                "note": run.result.get("reason"),
            }
        )
        synchronization.history = history
        _log(
            job,
            "Proposta calculada"
            if run.outcome == "proposal"
            else "Processamento concluído sem evidência suficiente",
        )
        db.commit()

        from app.services.session_state_service import refresh_session_state

        refresh_session_state(db, run.session_id)
        return {
            "run_id": str(run.id),
            "job_id": str(job.id),
            "outcome": run.outcome,
            "quality_grade": run.quality_grade,
            "result": run.result,
        }
    except Exception as exc:
        logger.error("Synchronization run %s failed: %s", run_id, exc, exc_info=True)
        db.rollback()
        if run is not None:
            run.status = "failed"
            run.error_message = str(exc)
            run.finished_at = datetime.utcnow()
        if job is not None:
            job.status = JobStatus.failed
            job.error_message = str(exc)
            job.finished_at = datetime.utcnow()
            _log(job, str(exc), "error")
        db.commit()
        return {"error": str(exc), "run_id": run_id}
    finally:
        db.close()


@celery_app.task(bind=True)
def process_sync_run_task(self, run_id: str):
    return process_sync_run(run_id)

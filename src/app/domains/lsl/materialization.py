from __future__ import annotations

import hashlib
import io
import tempfile
from pathlib import Path
from uuid import UUID

from sqlalchemy.orm import Session

from app.db.models import EEGAsset, EEGAssetFile, SyncEvidence
from app.domains.lsl.models import LSLRecording, LSLRecordingStream
from app.services.storage_service import storage_service


def _info_value(info: dict, key: str, default=None):
    value = info.get(key, default)
    return value[0] if isinstance(value, list) and value else value


def select_eeg_stream(streams: list[dict], selected: list[str]) -> dict:
    candidates = []
    for stream in streams:
        info = stream.get("info") or {}
        identity = {
            str(_info_value(info, "uid", "")),
            str(_info_value(info, "source_id", "")),
            str(_info_value(info, "name", "")),
        }
        if str(_info_value(info, "type", "")).upper() == "EEG" and (not selected or identity.intersection(selected)):
            candidates.append(stream)
    if len(candidates) != 1:
        raise ValueError(f"Expected exactly one selected EEG stream, found {len(candidates)}")
    return candidates[0]


def eeg_stream_to_csv(stream: dict) -> tuple[bytes, dict]:
    import pandas as pd

    info = stream.get("info") or {}
    samples = stream.get("time_series")
    timestamps = stream.get("time_stamps")
    if samples is None or timestamps is None or len(timestamps) == 0:
        raise ValueError("Selected EEG stream has no samples")
    channel_count = int(_info_value(info, "channel_count", len(samples[0])))
    names = [f"ch_{index + 1}" for index in range(channel_count)]
    descendants = (((info.get("desc") or [{}])[0].get("channels") or [{}])[0].get("channel") or [])
    parsed_names = [str(_info_value(item, "label", "")) for item in descendants]
    if len(parsed_names) == channel_count and all(parsed_names):
        names = parsed_names
    frame = pd.DataFrame(samples, columns=names)
    first = float(timestamps[0])
    frame.insert(0, "timestamp_ms", [(float(value) - first) * 1000.0 for value in timestamps])
    buffer = io.StringIO(); frame.to_csv(buffer, index=False)
    return buffer.getvalue().encode("utf-8"), {
        "channel_names": names,
        "channel_count": channel_count,
        "sample_rate_hz": float(_info_value(info, "nominal_srate", 0) or 0),
        "duration_seconds": float(timestamps[-1]) - first,
        "sample_count": len(timestamps),
        "first_lsl_time_seconds": first,
    }


def materialize_lsl_recording(db: Session, recording_id: UUID) -> LSLRecording:
    recording = db.query(LSLRecording).filter(LSLRecording.id == recording_id).one()
    if recording.status == "ready" and recording.eeg_asset_id:
        return recording
    try:
        raw = storage_service.download_bytes(recording.object_key)
        checksum = hashlib.sha256(raw).hexdigest()
        if checksum != recording.checksum_sha256 or len(raw) != recording.size_bytes:
            raise ValueError("XDF checksum or size mismatch")
        with tempfile.NamedTemporaryFile(suffix=".xdf", delete=False) as temp:
            temp.write(raw); temp_path = temp.name
        try:
            import pyxdf
            streams, header = pyxdf.load_xdf(temp_path, synchronize_clocks=True, dejitter_timestamps=False)
        finally:
            Path(temp_path).unlink(missing_ok=True)
        eeg_stream = select_eeg_stream(streams, recording.selected_stream_ids or [])
        csv_bytes, metadata = eeg_stream_to_csv(eeg_stream)
        csv_key = f"lsl/{recording.session_id}/{recording.id}/eeg.csv"
        if not storage_service.upload_bytes(csv_key, csv_bytes, "text/csv"):
            raise IOError("Could not persist XDF EEG derivative")

        eeg = db.query(EEGAsset).filter(EEGAsset.session_id == recording.session_id).first()
        if eeg is not None and eeg.id != recording.eeg_asset_id:
            raise ValueError("Session already has a different EEGAsset")
        if eeg is None:
            eeg = EEGAsset(
                session_id=recording.session_id,
                storage_uri=f"s3://{storage_service.bucket_name}/{csv_key}",
                filename=f"lsl-{recording.id}.csv", mime_type="text/csv",
                size_bytes=len(csv_bytes), eeg_format="XDF",
                sample_rate_hz=metadata["sample_rate_hz"],
                channel_count=metadata["channel_count"], channel_names=metadata["channel_names"],
                duration_seconds=metadata["duration_seconds"],
            )
            db.add(eeg); db.flush()
            db.add(EEGAssetFile(
                eeg_asset_id=eeg.id, role="source", filename="recording.xdf",
                mime_type="application/x-xdf",
                storage_uri=f"s3://{storage_service.bucket_name}/{recording.object_key}",
                size_bytes=len(raw), checksum_sha256=checksum, is_primary=False,
            ))
        evidence = SyncEvidence(
            session_id=recording.session_id, kind="lsl_xdf", filename="recording.xdf",
            content_type="application/x-xdf",
            storage_uri=f"s3://{storage_service.bucket_name}/{recording.object_key}",
            checksum_sha256=checksum, created_by=recording.created_by,
            payload={"streams": len(streams), "eeg": metadata, "human_approval_required": True},
            metadata_info={"xdf_header": header},
        )
        db.add(evidence); db.flush()
        recording.eeg_asset_id = eeg.id; recording.sync_evidence_id = evidence.id; recording.status = "ready"
        for stream in db.query(LSLRecordingStream).filter(LSLRecordingStream.recording_id == recording.id).all():
            match = next((item for item in streams if str(_info_value(item.get("info") or {}, "uid", "")) == stream.stream_uid), None)
            if match and match.get("clock_times") is not None and len(match["clock_times"]):
                offsets = match.get("clock_values")
                if offsets is not None and len(offsets):
                    stream.clock_offset_seconds = float(sum(offsets) / len(offsets))
        db.commit(); db.refresh(recording)
        return recording
    except Exception as error:
        db.rollback()
        recording = db.query(LSLRecording).filter(LSLRecording.id == recording_id).one()
        recording.status = "failed"; recording.error_message = str(error); db.commit()
        raise

from __future__ import annotations

import hashlib
import io
import re
import tempfile
from datetime import datetime
from pathlib import Path
from uuid import UUID

from sqlalchemy.orm import Session

from app.db.models import EEGAsset, EEGAssetFile, QualityVerdict, SyncEvidence
from app.domains.lsl.models import LSLRecording, LSLRecordingStream
from app.services.storage_service import storage_service


TARGET_EEG_SAMPLE_RATE_HZ = 500.0

_CANONICAL_1020 = {
    name.upper(): name
    for name in (
        "Fp1", "Fp2", "Fz", "F3", "F4", "F7", "F8", "FT9", "FT10",
        "FC5", "FC6", "FC1", "FC2", "C3", "C4", "Cz", "T7", "T8",
        "TP9", "TP10", "CP5", "CP6", "CP1", "CP2", "Pz", "P3", "P4",
        "P7", "P8", "O1", "O2", "Oz",
    )
}


def _info_value(info: dict, key: str, default=None):
    value = info.get(key, default)
    return value[0] if isinstance(value, list) and value else value


def canonicalize_eeg_channel(label: str) -> str:
    """Normalize actiCHamp ordinal prefixes while preserving unknown labels."""
    original = str(label).strip()
    without_ordinal = re.sub(r"^\d+", "", original).strip()
    return _CANONICAL_1020.get(without_ordinal.upper(), without_ordinal or original)


def _channel_names(info: dict, channel_count: int) -> tuple[list[str], list[str]]:
    originals = [f"ch_{index + 1}" for index in range(channel_count)]
    descendants = (((info.get("desc") or [{}])[0].get("channels") or [{}])[0].get("channel") or [])
    parsed = [str(_info_value(item, "label", "")) for item in descendants]
    if len(parsed) == channel_count and all(parsed):
        originals = parsed
    canonical = [canonicalize_eeg_channel(name) for name in originals]
    if len(set(canonical)) != len(canonical):
        raise ValueError("EEG channel normalization produced duplicate labels")
    return originals, canonical


def _quality_metadata(samples, channel_names: list[str]) -> dict:
    import numpy as np

    from app.services.eeg_service import (
        ARTIFACT_ABS_THRESHOLD,
        NOISY_VALID_RATIO,
        QUALITY_CRITERIA,
        _verdict,
    )

    channel_quality = []
    findings = []
    valid_ratios = []
    for index, name in enumerate(channel_names):
        values = np.asarray(samples[:, index], dtype=float)
        finite = values[np.isfinite(values)]
        baseline = float(np.median(finite)) if len(finite) else 0.0
        valid_ratio = float(
            np.count_nonzero(np.abs(finite - baseline) <= ARTIFACT_ABS_THRESHOLD)
        ) / max(1, len(values))
        is_flat = len(finite) == 0 or float(np.ptp(finite)) <= 1e-6
        status = "flat" if is_flat else ("noisy" if valid_ratio < NOISY_VALID_RATIO else "good")
        valid_ratios.append(valid_ratio)
        channel_quality.append({
            "name": name,
            "status": status,
            "valid_ratio": round(valid_ratio, 3),
            "impedance_kohm": None,
            "notes": f"Offset DC removido pela mediana: {baseline:.2f} µV",
        })
        if status == "flat":
            findings.append({
                "id": f"ef-{name}", "issue": f"Canal plano ({name})",
                "evidence": "Variância ~0 ao longo do registro.",
                "impact": "Canal inutilizável; afeta análises espaciais e topografia.",
                "recommendation": "Excluir ou interpolar a partir de vizinhos, registrando a decisão.",
                "reprocessable": True, "tone": "danger",
            })
        elif status == "noisy":
            findings.append({
                "id": f"ef-{name}", "issue": f"Canal ruidoso ({name})",
                "evidence": f"Apenas {round(valid_ratio * 100)}% de amostras dentro do limiar centrado.",
                "impact": "Reduz a confiabilidade das features desse canal.",
                "recommendation": "Revisar filtragem/impedância antes de incluir.",
                "reprocessable": True, "tone": "warning",
            })
    return {
        "valid_ratio": round(sum(valid_ratios) / len(valid_ratios), 3) if valid_ratios else 0.0,
        "channel_quality": channel_quality,
        "quality_findings": findings,
        "quality_criteria": QUALITY_CRITERIA,
        "quality_verdict": _verdict(valid_ratios, findings),
    }


def select_eeg_stream(streams: list[dict], selected: list[str]) -> dict:
    candidates = []
    for stream in streams:
        info = stream.get("info") or {}
        identity = {
            str(_info_value(info, "uid", "")),
            str(_info_value(info, "source_id", "")),
            str(_info_value(info, "name", "")),
        }
        if str(_info_value(info, "type", "")).upper() == "EEG" and (
            not selected or identity.intersection(selected)
        ):
            candidates.append(stream)
    if len(candidates) != 1:
        raise ValueError(f"Expected exactly one selected EEG stream, found {len(candidates)}")
    return candidates[0]


def _prepare_eeg_stream(stream: dict) -> tuple[object, object, dict]:
    import numpy as np

    info = stream.get("info") or {}
    samples = np.asarray(stream.get("time_series"), dtype=np.float32)
    timestamps = np.asarray(stream.get("time_stamps"), dtype=float)
    if samples.ndim == 1:
        samples = samples[:, None]
    if not len(timestamps) or not len(samples):
        raise ValueError("Selected EEG stream has no samples")
    if len(samples) != len(timestamps):
        raise ValueError("Selected EEG stream has mismatched samples and timestamps")

    channel_count = int(_info_value(info, "channel_count", samples.shape[1]))
    if samples.shape[1] != channel_count:
        raise ValueError("Selected EEG stream channel count does not match its samples")
    original_names, names = _channel_names(info, channel_count)
    nominal_rate = float(_info_value(info, "nominal_srate", 0) or 0)
    effective_rate = (
        float(len(timestamps) - 1) / float(timestamps[-1] - timestamps[0])
        if len(timestamps) > 1 and timestamps[-1] > timestamps[0]
        else nominal_rate
    )
    derived_rate = nominal_rate or effective_rate
    resampled = False

    # A 10 kHz source adds no information to the configured 0.5-50 Hz EEG
    # analysis. Polyphase resampling provides anti-alias filtering first.
    if derived_rate > 1000.0:
        from fractions import Fraction
        from scipy.signal import resample_poly

        ratio = Fraction(TARGET_EEG_SAMPLE_RATE_HZ / derived_rate).limit_denominator(1000)
        first_channel = resample_poly(samples[:, 0], ratio.numerator, ratio.denominator)
        reduced = np.empty((len(first_channel), channel_count), dtype=np.float32)
        reduced[:, 0] = first_channel.astype(np.float32, copy=False)
        for channel_index in range(1, channel_count):
            reduced[:, channel_index] = resample_poly(
                samples[:, channel_index], ratio.numerator, ratio.denominator
            ).astype(np.float32, copy=False)
        samples = reduced
        derived_rate = TARGET_EEG_SAMPLE_RATE_HZ
        timestamps = timestamps[0] + np.arange(len(samples), dtype=float) / derived_rate
        resampled = True

    first = float(timestamps[0])
    return samples, timestamps, {
        "channel_names": names,
        "original_channel_names": original_names,
        "channel_name_mapping": dict(zip(original_names, names)),
        "channel_count": channel_count,
        "sample_rate_hz": float(derived_rate),
        "original_sample_rate_hz": float(nominal_rate),
        "effective_sample_rate_hz": float(effective_rate),
        "resampled": resampled,
        "duration_seconds": float(timestamps[-1]) - first,
        "sample_count": len(timestamps),
        "first_lsl_time_seconds": first,
        **_quality_metadata(samples, names),
    }


def _write_eeg_csv(stream: dict, destination: Path) -> dict:
    import pandas as pd

    samples, timestamps, metadata = _prepare_eeg_stream(stream)
    first = float(timestamps[0])
    wrote_header = False
    for start in range(0, len(timestamps), 50_000):
        end = min(start + 50_000, len(timestamps))
        frame = pd.DataFrame(samples[start:end], columns=metadata["channel_names"])
        frame.insert(0, "timestamp_ms", (timestamps[start:end] - first) * 1000.0)
        frame.to_csv(
            destination,
            index=False,
            mode="w" if not wrote_header else "a",
            header=not wrote_header,
        )
        wrote_header = True
    return metadata


def eeg_stream_to_csv(stream: dict) -> tuple[bytes, dict]:
    """Compatibility helper used by unit tests and small in-memory streams."""
    import pandas as pd

    samples, timestamps, metadata = _prepare_eeg_stream(stream)
    frame = pd.DataFrame(samples, columns=metadata["channel_names"])
    frame.insert(0, "timestamp_ms", (timestamps - float(timestamps[0])) * 1000.0)
    buffer = io.StringIO()
    frame.to_csv(buffer, index=False)
    return buffer.getvalue().encode("utf-8"), metadata


def _auxiliary_kind(stream: dict) -> tuple[str, str, str] | None:
    info = stream.get("info") or {}
    name = str(_info_value(info, "name", "")).strip()
    stream_type = str(_info_value(info, "type", "")).strip()
    token = re.sub(r"[^a-z0-9]", "", name.lower())
    if token in {"heartrate", "hr"}:
        return "heart-rate", "heart_rate.csv", "bpm"
    if token in {"rrinterval", "rrintervals", "ibi"}:
        return "rr-interval", "rr_intervals.csv", "ms"
    if "marker" in name.lower() or "marker" in stream_type.lower():
        return "markers", "markers.csv", "json"
    return None


def _write_auxiliary_csv(
    stream: dict,
    destination: Path,
    kind: str,
    origin_lsl_time_seconds: float | None = None,
) -> dict:
    import pandas as pd

    timestamps = stream.get("time_stamps")
    samples = stream.get("time_series")
    if timestamps is None or samples is None or len(timestamps) == 0:
        raise ValueError(f"{kind} stream has no samples")
    first = float(timestamps[0])
    origin = first if origin_lsl_time_seconds is None else origin_lsl_time_seconds
    values = []
    for row in samples:
        if isinstance(row, (list, tuple)):
            values.append(row[0] if row else None)
        elif getattr(row, "ndim", 0) > 0:
            values.append(row[0] if len(row) else None)
        else:
            values.append(row)
    frame = pd.DataFrame(
        {"timestamp_ms": [(float(value) - origin) * 1000.0 for value in timestamps], "value": values}
    )
    frame.to_csv(destination, index=False)
    return {
        "kind": kind,
        "sample_count": len(frame),
        "duration_seconds": float(timestamps[-1]) - first,
        "first_lsl_time_seconds": first,
        "alignment_origin_lsl_time_seconds": origin,
    }


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _stream_catalog(streams: list[dict]) -> list[dict[str, object]]:
    catalog = []
    for index, stream in enumerate(streams):
        info = stream.get("info") or {}
        timestamps = stream.get("time_stamps")
        catalog.append(
            {
                "uid": str(_info_value(info, "uid", "") or index),
                "source_id": str(_info_value(info, "source_id", "")),
                "name": str(_info_value(info, "name", "Unnamed stream")),
                "type": str(_info_value(info, "type", "Unknown")),
                "hostname": str(_info_value(info, "hostname", "")),
                "channel_count": int(_info_value(info, "channel_count", 0) or 0),
                "nominal_srate": float(_info_value(info, "nominal_srate", 0) or 0),
                "channel_format": str(_info_value(info, "channel_format", "")),
                "sample_count": len(timestamps) if timestamps is not None else 0,
            }
        )
    return catalog


def materialize_lsl_recording(db: Session, recording_id: UUID) -> LSLRecording:
    recording = db.query(LSLRecording).filter(LSLRecording.id == recording_id).one()
    if recording.status == "ready" and recording.eeg_asset_id:
        return recording
    try:
        with tempfile.TemporaryDirectory(prefix=f"cast-lsl-{recording.id}-") as temp_dir:
            root = Path(temp_dir)
            xdf_path = root / "recording.xdf"
            storage_service.download_to_file(recording.object_key, str(xdf_path))
            checksum = _sha256_file(xdf_path)
            if checksum != recording.checksum_sha256 or xdf_path.stat().st_size != recording.size_bytes:
                raise ValueError("XDF checksum or size mismatch")

            import pyxdf

            streams, header = pyxdf.load_xdf(
                str(xdf_path), synchronize_clocks=True, dejitter_timestamps=False
            )
            catalog = _stream_catalog(streams)
            recording.discovery_snapshot = catalog
            db.query(LSLRecordingStream).filter(
                LSLRecordingStream.recording_id == recording.id
            ).delete()
            for item in catalog:
                db.add(
                    LSLRecordingStream(
                        recording_id=recording.id,
                        stream_uid=str(item["uid"]),
                        name=str(item["name"]),
                        stream_type=str(item["type"]),
                        source_id=str(item["source_id"]) or None,
                        hostname=str(item["hostname"]) or None,
                        channel_count=int(item["channel_count"]),
                        nominal_srate=float(item["nominal_srate"]),
                        channel_format=str(item["channel_format"]) or None,
                        metadata_info=item,
                    )
                )
            db.flush()

            eeg_stream = select_eeg_stream(streams, recording.selected_stream_ids or [])
            eeg_csv_path = root / "eeg.csv"
            metadata = _write_eeg_csv(eeg_stream, eeg_csv_path)
            csv_checksum = _sha256_file(eeg_csv_path)
            csv_key = f"lsl/{recording.session_id}/{recording.id}/eeg.csv"
            storage_service.upload_file(csv_key, str(eeg_csv_path), "text/csv")

            eeg = db.query(EEGAsset).filter(EEGAsset.session_id == recording.session_id).first()
            if eeg is not None and eeg.id != recording.eeg_asset_id:
                raise ValueError("Session already has a different EEGAsset")
            if eeg is None:
                eeg = EEGAsset(
                    session_id=recording.session_id,
                    storage_uri=f"s3://{storage_service.bucket_name}/{csv_key}",
                    filename=f"lsl-{recording.id}.csv",
                    mime_type="text/csv",
                    size_bytes=eeg_csv_path.stat().st_size,
                    eeg_format="XDF",
                    sample_rate_hz=metadata["sample_rate_hz"],
                    channel_count=metadata["channel_count"],
                    channel_names=metadata["channel_names"],
                    montage="standard_1020",
                    units="µV",
                    duration_seconds=metadata["duration_seconds"],
                    valid_ratio=metadata["valid_ratio"],
                    channel_quality=metadata["channel_quality"],
                    quality_findings=metadata["quality_findings"],
                    quality_criteria=metadata["quality_criteria"],
                    quality_verdict=QualityVerdict(metadata["quality_verdict"]),
                )
                db.add(eeg)
                db.flush()
                db.add(
                    EEGAssetFile(
                        eeg_asset_id=eeg.id,
                        role="primary",
                        filename=eeg.filename,
                        mime_type="text/csv",
                        storage_uri=f"s3://{storage_service.bucket_name}/{csv_key}",
                        size_bytes=eeg_csv_path.stat().st_size,
                        checksum_sha256=csv_checksum,
                        is_primary=True,
                        verified_at=datetime.utcnow(),
                    )
                )
                db.add(
                    EEGAssetFile(
                        eeg_asset_id=eeg.id,
                        role="source",
                        filename="recording.xdf",
                        mime_type="application/x-xdf",
                        storage_uri=f"s3://{storage_service.bucket_name}/{recording.object_key}",
                        size_bytes=xdf_path.stat().st_size,
                        checksum_sha256=checksum,
                        is_primary=False,
                    )
                )

            auxiliary_metadata = []
            marker_count = 0
            for stream in streams:
                classification = _auxiliary_kind(stream)
                if classification is None:
                    continue
                role, filename, unit = classification
                target = root / filename
                stream_metadata = _write_auxiliary_csv(
                    stream,
                    target,
                    role,
                    origin_lsl_time_seconds=float(metadata["first_lsl_time_seconds"]),
                )
                key = f"lsl/{recording.session_id}/{recording.id}/{filename}"
                storage_service.upload_file(key, str(target), "text/csv")
                db.add(
                    EEGAssetFile(
                        eeg_asset_id=eeg.id,
                        role=role,
                        filename=filename,
                        mime_type="text/csv",
                        storage_uri=f"s3://{storage_service.bucket_name}/{key}",
                        size_bytes=target.stat().st_size,
                        checksum_sha256=_sha256_file(target),
                        is_primary=False,
                        verified_at=datetime.utcnow(),
                    )
                )
                stream_metadata["unit"] = unit
                auxiliary_metadata.append(stream_metadata)
                if role == "markers":
                    marker_count = int(stream_metadata["sample_count"])
            eeg.event_count = marker_count

            evidence = SyncEvidence(
                session_id=recording.session_id,
                kind="lsl_xdf",
                filename="recording.xdf",
                content_type="application/x-xdf",
                storage_uri=f"s3://{storage_service.bucket_name}/{recording.object_key}",
                checksum_sha256=checksum,
                created_by=recording.created_by,
                payload={
                    "streams": len(streams),
                    "catalog": catalog,
                    "eeg": metadata,
                    "auxiliary": auxiliary_metadata,
                    "human_approval_required": True,
                },
                metadata_info={"xdf_header": header},
            )
            db.add(evidence)
            db.flush()
            recording.eeg_asset_id = eeg.id
            recording.sync_evidence_id = evidence.id
            recording.status = "ready"
            for stream_row in db.query(LSLRecordingStream).filter(
                LSLRecordingStream.recording_id == recording.id
            ).all():
                match = next(
                    (
                        item
                        for item in streams
                        if str(_info_value(item.get("info") or {}, "uid", ""))
                        == stream_row.stream_uid
                    ),
                    None,
                )
                if match and match.get("clock_times") is not None and len(match["clock_times"]):
                    offsets = match.get("clock_values")
                    if offsets is not None and len(offsets):
                        stream_row.clock_offset_seconds = float(sum(offsets) / len(offsets))
            db.commit()
            db.refresh(recording)
            return recording
    except Exception as error:
        db.rollback()
        recording = db.query(LSLRecording).filter(LSLRecording.id == recording_id).one()
        recording.status = "failed"
        recording.error_message = str(error)
        db.commit()
        raise

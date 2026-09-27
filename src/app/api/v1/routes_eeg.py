from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Form
from sqlalchemy.orm import Session
from uuid import UUID
from pydantic import BaseModel
import io
import csv
import hashlib
import json
from datetime import datetime

from app.db.models import (
    EEGAnalysisArtifact,
    EEGAnalysisRun,
    EEGAsset as EEGAssetModel,
    EEGAssetFile,
    Session as SessionModel,
    Participant as ParticipantModel,
    VideoAsset as VideoAssetModel,
    User,
)
from app.db.session import SessionLocal
from app.services.storage_service import storage_service

router = APIRouter(prefix="/eeg", tags=["eeg"])

from app.api.deps import get_db, get_current_user
from app.api.ownership import (
    get_eeg as get_owned_eeg,
    get_participant,
    get_session,
)

# EEG band columns analysed for co-activation with facial micro-actions.
EEG_BANDS = ["alpha", "beta", "theta", "delta", "gamma"]


def _read_eeg_rows(eeg_asset):
    """Downloads the CSV from storage and returns parsed rows (floats where possible)."""
    bucket = storage_service.bucket_name
    key = eeg_asset.storage_uri.replace(f"s3://{bucket}/", "")
    response = storage_service.s3.get_object(Bucket=bucket, Key=key)
    csv_data = response['Body'].read().decode('utf-8')

    rows = []
    reader = csv.DictReader(io.StringIO(csv_data))
    for row in reader:
        parsed = {}
        for k, v in row.items():
            try:
                parsed[k] = float(v)
            except (ValueError, TypeError):
                parsed[k] = v
        rows.append(parsed)
    return rows


def _latest_timeseries_result(db: Session, eeg_id: UUID, run_id: UUID | None = None):
    query = (
        db.query(EEGAnalysisRun)
        .filter(
            EEGAnalysisRun.eeg_asset_id == eeg_id,
            EEGAnalysisRun.status.in_(("succeeded", "partial")),
        )
    )
    if run_id is not None:
        query = query.filter(EEGAnalysisRun.id == run_id)
    run = query.order_by(EEGAnalysisRun.finished_at.desc().nullslast()).first()
    if run is None:
        return None, None
    artifact = (
        db.query(EEGAnalysisArtifact)
        .filter(
            EEGAnalysisArtifact.run_id == run.id,
            EEGAnalysisArtifact.kind == "timeseries-index",
        )
        .order_by(EEGAnalysisArtifact.created_at.desc())
        .first()
    )
    if artifact is None:
        return run, None
    payload = json.loads(
        storage_service.download_bytes(
            storage_service.key_from_uri(artifact.storage_uri)
        ).decode("utf-8")
    )
    return run, payload


def _parse_csv_rows(payload: bytes) -> list[dict]:
    rows = []
    reader = csv.DictReader(io.StringIO(payload.decode("utf-8")))
    for row in reader:
        parsed = {}
        for key, value in row.items():
            try:
                parsed[key] = float(value)
            except (TypeError, ValueError):
                parsed[key] = value
        rows.append(parsed)
    return rows


def _full_timeseries_rows(
    db: Session,
    run: EEGAnalysisRun,
    roi: str | None,
) -> list[dict]:
    """Load the complete long-form artifact; previews are never used for stats."""
    artifact = (
        db.query(EEGAnalysisArtifact)
        .filter(
            EEGAnalysisArtifact.run_id == run.id,
            EEGAnalysisArtifact.kind == "timeseries-csv",
        )
        .order_by(EEGAnalysisArtifact.created_at.desc())
        .first()
    )
    if artifact is None:
        raise HTTPException(
            status_code=409,
            detail="Coactivation requires the full timeseries-csv analysis artifact",
        )
    long_rows = [
        row
        for row in _parse_csv_rows(
            storage_service.download_bytes(
                storage_service.key_from_uri(artifact.storage_uri)
            )
        )
        if (roi is None or row.get("roi") == roi)
        and row.get("metric") == "absolute_power"
    ]
    by_time: dict[float, dict] = {}
    for row in long_rows:
        try:
            timestamp_ms = float(row["time_seconds"]) * 1000.0
            band = str(row["band"]).lower()
            value = float(row["value"])
        except (KeyError, TypeError, ValueError):
            continue
        target = by_time.setdefault(timestamp_ms, {"timestamp_ms": timestamp_ms})
        target.setdefault(f"__{band}", []).append(value)
    rows = []
    for target in by_time.values():
        rows.append(
            {
                key.removeprefix("__"): sum(values) / len(values)
                for key, values in target.items()
                if key.startswith("__")
            }
            | {"timestamp_ms": target["timestamp_ms"]}
        )
    return sorted(rows, key=lambda row: row["timestamp_ms"])

@router.post("/upload-proxy")
async def upload_eeg_proxy(
    participant_id: UUID = Form(...),
    session_id: UUID = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Ensure participant exists
    participant = get_participant(db, current_user, participant_id)
        
    # Bind to session or create new
    if not session_id:
        new_session = SessionModel(participant_id=participant_id)
        db.add(new_session)
        db.commit()
        db.refresh(new_session)
        session_id = new_session.id
    else:
        session = get_session(db, current_user, session_id)
        if session.participant_id != participant.id:
            raise HTTPException(
                status_code=409,
                detail="Session does not belong to the selected participant",
            )
        if (
            db.query(EEGAssetModel)
            .filter(EEGAssetModel.session_id == session_id)
            .first()
        ):
            raise HTTPException(
                status_code=409,
                detail="Session already has an EEG asset",
            )
    
    object_name = f"{session_id}/eeg_{file.filename}"
    
    # Upload to storage
    contents = await file.read()
    storage_service.upload_bytes(object_name, contents, file.content_type)
    
    from app.services.eeg_service import format_from_filename
    eeg_asset = EEGAssetModel(
        session_id=session_id,
        filename=file.filename,
        mime_type=file.content_type,
        size_bytes=len(contents),
        eeg_format=format_from_filename(file.filename),
        storage_uri=f"s3://{storage_service.bucket_name}/{object_name}"
    )
    db.add(eeg_asset)
    db.flush()
    db.add(
        EEGAssetFile(
            eeg_asset_id=eeg_asset.id,
            role="primary",
            filename=file.filename,
            mime_type=file.content_type or "application/octet-stream",
            size_bytes=len(contents),
            checksum_sha256=hashlib.sha256(contents).hexdigest(),
            storage_uri=eeg_asset.storage_uri,
            is_primary=True,
            verified_at=datetime.utcnow(),
        )
    )
    db.commit()
    db.refresh(eeg_asset)

    # Kick off metadata + quality parsing (docs §10). Best-effort: if the broker
    # is down, parse inline so the asset is still enriched.
    from app.workers.tasks_eeg import parse_eeg_task, parse_eeg_asset
    try:
        parse_eeg_task.delay(str(eeg_asset.id))
    except Exception:
        try:
            parse_eeg_asset(str(eeg_asset.id))
        except Exception as e:
            print(f"Inline EEG parse failed: {e}")

    from app.services.session_state_service import refresh_session_state
    refresh_session_state(db, session_id)

    return {
        "eeg_asset_id": eeg_asset.id,
        "session_id": session_id,
        "message": "EEG uploaded successfully"
    }

from app.schemas.multimodal import EEGAssetDetail, EEGMetadataUpdate, EEGQualityReport
from app.db.models import QualityVerdict


@router.get("/{eeg_id}", response_model=EEGAssetDetail)
def get_eeg_asset(
    eeg_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Full EEG metadata + quality assessment (docs §10)."""
    eeg = get_owned_eeg(db, current_user, eeg_id)
    return eeg


@router.get("/{eeg_id}/physiology")
def get_eeg_physiology(
    eeg_id: UUID,
    limit: int = 5000,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return Polar HR/RR streams materialized from the same XDF plus HRV."""
    get_owned_eeg(db, current_user, eeg_id)
    members = (
        db.query(EEGAssetFile)
        .filter(
            EEGAssetFile.eeg_asset_id == eeg_id,
            EEGAssetFile.role.in_(("heart-rate", "rr-interval")),
        )
        .order_by(EEGAssetFile.created_at.asc())
        .all()
    )
    bounded_limit = max(1, min(limit, 20_000))
    streams = []
    rr_values = []
    for member in members:
        rows = _parse_csv_rows(
            storage_service.download_bytes(storage_service.key_from_uri(member.storage_uri))
        )
        if member.role == "rr-interval":
            rr_values.extend(
                float(row["value"])
                for row in rows
                if isinstance(row.get("value"), (int, float))
            )
        streams.append({
            "kind": member.role,
            "filename": member.filename,
            "unit": "bpm" if member.role == "heart-rate" else "ms",
            "sample_count": len(rows),
            "data": rows[:bounded_limit],
        })

    from app.services.eeg_service import compute_hrv_summary
    return {
        "eeg_asset_id": eeg_id,
        "streams": streams,
        "hrv": compute_hrv_summary(rr_values) if rr_values else None,
        "caveat": "Métricas de domínio do tempo; intervalos NN filtrados entre 300 e 2000 ms. Revisão de artefatos continua obrigatória.",
    }


@router.patch("/{eeg_id}/metadata", response_model=EEGAssetDetail)
def update_eeg_metadata(
    eeg_id: UUID,
    payload: EEGMetadataUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    eeg = get_owned_eeg(db, current_user, eeg_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(eeg, field, value)
    db.commit()
    db.refresh(eeg)
    return eeg


@router.post("/{eeg_id}/parse", response_model=EEGAssetDetail)
def parse_eeg_endpoint(
    eeg_id: UUID,
    sync: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Parses the EEG file to extract real metadata + per-channel quality.

    Supports EDF/EDF+/BDF/BrainVision/FIF/EEGLAB (via MNE) and CSV. Dispatches
    the Celery worker; if the broker is unreachable (or `sync=true`), runs the
    parse inline so the feature works without a running worker.
    """
    eeg = get_owned_eeg(db, current_user, eeg_id)

    from app.workers.tasks_eeg import parse_eeg_task, parse_eeg_asset

    if not sync:
        try:
            parse_eeg_task.delay(str(eeg_id))
            return get_owned_eeg(db, current_user, eeg_id)
        except Exception:
            # Broker unavailable — fall through to synchronous parsing.
            pass

    try:
        parse_eeg_asset(str(eeg_id))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse EEG: {e}")

    db.expire_all()
    return get_owned_eeg(db, current_user, eeg_id)


@router.post("/{eeg_id}/quality-check", response_model=EEGAssetDetail)
def eeg_quality_check(
    eeg_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Derives a per-channel EEG quality report from the CSV (docs §10).

    Quality is never a single opaque score: it reports per-channel valid ratio,
    flat/noisy detection, the overall valid percentage, the criteria used and
    structured findings (problem/evidence/impact/action).
    """
    eeg = get_owned_eeg(db, current_user, eeg_id)

    try:
        rows = _read_eeg_rows(eeg)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read from storage: {e}")

    # Channel columns = numeric columns excluding known time/band helpers.
    non_channel = {"timestamp_ms", "time", "timestamp"}
    channel_cols = []
    if rows:
        for k, v in rows[0].items():
            if k not in non_channel and isinstance(v, (int, float)):
                channel_cols.append(k)

    from app.services.eeg_service import QUALITY_CRITERIA, _assess_channels, _verdict
    by_channel = {
        column: [row[column] for row in rows if isinstance(row.get(column), (int, float))]
        for column in channel_cols
    }
    channel_quality, findings, valid_ratios = _assess_channels(by_channel)
    overall = sum(valid_ratios) / len(valid_ratios) if valid_ratios else 0.0
    verdict = QualityVerdict(_verdict(valid_ratios, findings))

    eeg.channel_count = eeg.channel_count or len(channel_cols)
    eeg.channel_names = eeg.channel_names or channel_cols
    eeg.valid_ratio = round(overall, 3)
    eeg.channel_quality = channel_quality
    eeg.quality_findings = findings
    eeg.quality_criteria = QUALITY_CRITERIA
    eeg.quality_verdict = verdict
    db.commit()
    db.refresh(eeg)

    from app.services.session_state_service import refresh_session_state
    refresh_session_state(db, eeg.session_id)

    return eeg


@router.put("/{eeg_id}/quality", response_model=EEGAssetDetail)
def set_eeg_quality(
    eeg_id: UUID,
    payload: EEGQualityReport,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Persists a reviewed/edited EEG quality decision from the UI."""
    eeg = get_owned_eeg(db, current_user, eeg_id)
    eeg.quality_verdict = payload.quality_verdict
    eeg.valid_ratio = payload.valid_ratio
    eeg.channel_quality = [c.model_dump() for c in payload.channel_quality]
    eeg.quality_findings = [f.model_dump() for f in payload.quality_findings]
    eeg.quality_criteria = payload.quality_criteria
    db.commit()

    from app.services.session_state_service import refresh_session_state
    refresh_session_state(db, eeg.session_id)
    db.refresh(eeg)
    return eeg


@router.get("/{eeg_id}/timeseries")
def get_eeg_timeseries(
    eeg_id: UUID,
    run_id: UUID | None = None,
    limit: int = 5000,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Downloads the CSV from MinIO, parses it and returns timeseries data for the UI chart."""
    eeg_asset = get_owned_eeg(db, current_user, eeg_id)
        
    run, result = _latest_timeseries_result(db, eeg_id, run_id)
    if result is not None:
        timeseries = result.get("preview", [])[: max(1, min(limit, 20000))]
        source = "analysis-run"
    else:
        try:
            timeseries = _read_eeg_rows(eeg_asset)[: max(1, min(limit, 20000))]
            source = "legacy-csv"
        except Exception as e:
            raise HTTPException(
                status_code=409,
                detail="No derived time-series result is available for this binary EEG asset",
            ) from e

    # Audit access to raw EEG (sensitive data, docs §21).
    from app.api.v1.routes_governance import record_access
    record_access(
        db,
        "eeg",
        eeg_id,
        actor=current_user,
        detail={"op": "timeseries"},
    )
    from app.services.sync_transform_service import approved_mapping

    mapping = approved_mapping(db, eeg_asset.session_id)

    return {
        "eeg_asset_id": eeg_id,
        "filename": eeg_asset.filename,
        "sync_offset_ms": mapping["offset_ms"],
        "sync_transform": mapping,
        "data": timeseries,
        "source": source,
        "analysis_run_id": run.id if run else None,
        "units": result.get("units", {}) if result else {},
    }


class EEGOffsetUpdate(BaseModel):
    sync_offset_ms: int


@router.patch("/{eeg_id}")
def update_eeg_offset(
    eeg_id: UUID,
    payload: EEGOffsetUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Adjusts the EEG↔video time offset (ms). Positive = EEG started after the video."""
    eeg_asset = get_owned_eeg(db, current_user, eeg_id)

    eeg_asset.sync_offset_ms = payload.sync_offset_ms
    db.commit()
    db.refresh(eeg_asset)
    return {"eeg_asset_id": eeg_asset.id, "sync_offset_ms": eeg_asset.sync_offset_ms}


def _paired_permutation_test(
    during,
    baseline,
    n_perm=2000,
    n_bootstrap=2000,
    seed=42,
):
    """Paired sign-flip test, Cohen's dz and paired bootstrap mean-difference CI."""
    import numpy as np

    during = np.asarray(during, dtype=float)
    baseline = np.asarray(baseline, dtype=float)
    if len(during) != len(baseline):
        raise ValueError("Paired samples must have the same length")
    if len(during) < 2:
        return None, None, None

    differences = during - baseline
    observed = float(differences.mean())
    difference_sd = float(differences.std(ddof=1))
    cohens_dz = float(observed / difference_sd) if difference_sd > 0 else None
    rng = np.random.default_rng(seed)
    signs = rng.choice((-1.0, 1.0), size=(n_perm, len(differences)))
    permuted = np.mean(signs * differences, axis=1)
    count_extreme = int(np.sum(np.abs(permuted) >= abs(observed)))
    p_value = (count_extreme + 1) / (n_perm + 1)
    bootstrap_indices = rng.integers(
        0,
        len(differences),
        size=(n_bootstrap, len(differences)),
    )
    bootstrap_means = differences[bootstrap_indices].mean(axis=1)
    ci_low, ci_high = np.percentile(bootstrap_means, (2.5, 97.5))
    return float(p_value), cohens_dz, [float(ci_low), float(ci_high)]


def _paired_window_means(rows, windows, all_windows, band):
    """Return one event mean and one duration-matched pre-event mean per pair."""
    during_means = []
    baseline_means = []
    sample_count = 0
    baseline_sample_count = 0
    for window in windows:
        duration = max(1.0, window["end_ms"] - window["start_ms"])
        baseline_start = window["start_ms"] - duration
        during_values = [
            float(row[band])
            for row in rows
            if isinstance(row.get(band), (int, float))
            and window["start_ms"] <= row.get("timestamp_ms", -1) <= window["end_ms"]
        ]
        baseline_values = [
            float(row[band])
            for row in rows
            if isinstance(row.get(band), (int, float))
            and baseline_start <= row.get("timestamp_ms", -1) < window["start_ms"]
            and not any(
                candidate["start_ms"] <= row.get("timestamp_ms", -1) <= candidate["end_ms"]
                for candidate in all_windows
            )
        ]
        sample_count += len(during_values)
        baseline_sample_count += len(baseline_values)
        if during_values and baseline_values:
            during_means.append(sum(during_values) / len(during_values))
            baseline_means.append(sum(baseline_values) / len(baseline_values))
    return during_means, baseline_means, sample_count, baseline_sample_count


@router.get("/{eeg_id}/coactivation")
def get_eeg_coactivation(
    eeg_id: UUID,
    run_id: UUID | None = None,
    roi: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Per-band EEG power during each facial micro-action vs. baseline, with stats.

    Each event is paired with an equal-duration pre-event baseline that excludes
    every annotated/predicted action window. Human annotations and model
    predictions are reported separately.
    """
    from app.api.v1.routes_videos import load_timeline_events

    eeg_asset = get_owned_eeg(db, current_user, eeg_id)

    video_asset = db.query(VideoAssetModel).filter(VideoAssetModel.session_id == eeg_asset.session_id).first()
    if not video_asset:
        raise HTTPException(status_code=404, detail="No video associated with this EEG session")

    analysis_run, _ = _latest_timeseries_result(db, eeg_id, run_id)
    if analysis_run is not None:
        rows = _full_timeseries_rows(db, analysis_run, roi)
        result_source = "analysis-run-full"
    else:
        try:
            rows = _read_eeg_rows(eeg_asset)
            result_source = "legacy-csv"
        except Exception as e:
            raise HTTPException(
                status_code=409,
                detail="Coactivation requires a valid analysis run for binary EEG",
            ) from e

    events, _ = load_timeline_events(video_asset, db)
    from app.services.sync_transform_service import approved_mapping, video_to_eeg_ms

    mapping = approved_mapping(db, eeg_asset.session_id)
    if not mapping.get("approved"):
        raise HTTPException(
            status_code=409,
            detail="Coactivation requires an approved EEG-video synchronization mapping",
        )
    offset = mapping["offset_ms"]

    # Micro-action windows in EEG time (ms)
    windows = [
        {
            "action": ev["action"],
            "origin": ev.get("origin", "unknown"),
            "start_ms": video_to_eeg_ms(ev["start_time"] * 1000, mapping),
            "end_ms": video_to_eeg_ms(ev["end_time"] * 1000, mapping),
        }
        for ev in events
    ]

    present_bands = [b for b in EEG_BANDS if any(b in row for row in rows)]
    if not present_bands:
        raise HTTPException(
            status_code=409,
            detail="Coactivation requires absolute-power values for at least one EEG band",
        )
    by_action = {}
    for w in windows:
        by_action.setdefault((w["origin"], w["action"]), []).append(w)

    actions_result = []
    tested = []
    baseline_count = 0
    for (origin, action), wins in by_action.items():
        total_ms = sum(max(0.0, w["end_ms"] - w["start_ms"]) for w in wins)

        bands_out = {}
        action_sample_count = 0
        for b in present_bands:
            during_vals, base_vals, sample_count, base_sample_count = _paired_window_means(
                rows, wins, windows, b
            )
            action_sample_count = max(action_sample_count, sample_count)
            baseline_count = max(baseline_count, base_sample_count)
            during = sum(during_vals) / len(during_vals) if during_vals else None
            base = sum(base_vals) / len(base_vals) if base_vals else None
            delta_pct = (during - base) / abs(base) * 100.0 if (during is not None and base not in (None, 0)) else None
            p_value, cohens_d, effect_ci95 = _paired_permutation_test(
                during_vals, base_vals
            )
            bands_out[b] = {
                "during": during,
                "baseline": base,
                "delta_pct": delta_pct,
                "p_value": p_value,
                "cohens_d": cohens_d,
                "effect_ci95": effect_ci95,
                "paired_event_count": len(during_vals),
                "significant": (p_value is not None and p_value < 0.05),
            }
            if p_value is not None:
                tested.append((bands_out[b], p_value))

        actions_result.append({
            "action": action,
            "origin": origin,
            "n_events": len(wins),
            "total_ms": total_ms,
            "sample_count": action_sample_count,
            "bands": bands_out,
        })

    # Benjamini-Hochberg correction across all action × band hypotheses.
    ordered = sorted(enumerate(tested), key=lambda item: item[1][1])
    previous = 1.0
    adjusted = {}
    for rank, (original_index, (_, p_value)) in reversed(
        list(enumerate(ordered, start=1))
    ):
        previous = min(previous, p_value * len(ordered) / rank)
        adjusted[original_index] = previous
    for original_index, (result, _) in enumerate(tested):
        result["q_value"] = adjusted[original_index]
        result["significant"] = adjusted[original_index] < 0.05

    return {
        "eeg_asset_id": eeg_id,
        "sync_offset_ms": offset,
        "sync_transform": mapping,
        "bands": present_bands,
        "baseline_sample_count": baseline_count,
        "alpha": 0.05,
        "actions": actions_result,
        "analysis_run_id": analysis_run.id if analysis_run else None,
        "source": result_source,
        "roi": roi,
        "metric": "absolute_power",
        "multiple_comparisons": "Benjamini-Hochberg FDR across origin × action × band",
        "design": "paired event vs duration-matched pre-event baseline",
        "sample_metadata": {
            "baseline_samples": baseline_count,
            "event_count": len(windows),
            "tested_hypotheses": len(tested),
        },
        "caveat": "Temporal association only; this result does not establish causality.",
    }

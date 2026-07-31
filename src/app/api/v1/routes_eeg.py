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

    criteria = [
        "|amplitude| > 150 = artefato",
        "variância nula em ≥ 2s = flat",
        "razão de amostras válidas por canal",
    ]

    channel_quality = []
    findings = []
    valid_ratios = []
    for col in channel_cols:
        values = [r[col] for r in rows if isinstance(r.get(col), (int, float))]
        total = len(values) or 1
        valid = sum(1 for x in values if abs(x) <= 150)
        vr = valid / total
        distinct = len(set(round(x, 6) for x in values))
        status = "good"
        if distinct <= 1:
            status = "flat"
        elif vr < 0.6:
            status = "noisy"
        valid_ratios.append(vr)
        channel_quality.append({
            "name": col, "status": status, "valid_ratio": round(vr, 3),
            "impedance_kohm": None, "notes": None,
        })
        if status == "flat":
            findings.append({
                "id": f"ef-{col}", "issue": f"Canal plano ({col})",
                "evidence": "Variância ~0 ao longo do registro.",
                "impact": "Canal inutilizável; afeta análises espaciais.",
                "recommendation": "Excluir ou interpolar, registrando a decisão.",
                "reprocessable": True, "tone": "danger",
            })
        elif status == "noisy":
            findings.append({
                "id": f"ef-{col}", "issue": f"Canal ruidoso ({col})",
                "evidence": f"Apenas {round(vr*100)}% de amostras dentro do limiar.",
                "impact": "Reduz a confiabilidade das features desse canal.",
                "recommendation": "Revisar filtragem/impedância antes de incluir.",
                "reprocessable": True, "tone": "warning",
            })

    overall = sum(valid_ratios) / len(valid_ratios) if valid_ratios else 0.0
    if overall >= 0.9 and not findings:
        verdict = QualityVerdict.approved
    elif overall >= 0.8:
        verdict = QualityVerdict.approved_with_caveats
    elif any(f["tone"] == "danger" for f in findings):
        verdict = QualityVerdict.review_required
    else:
        verdict = QualityVerdict.review_required

    eeg.channel_count = eeg.channel_count or len(channel_cols)
    eeg.channel_names = eeg.channel_names or channel_cols
    eeg.valid_ratio = round(overall, 3)
    eeg.channel_quality = channel_quality
    eeg.quality_findings = findings
    eeg.quality_criteria = criteria
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


def _permutation_test(during, baseline, n_perm=2000, seed=42):
    """Two-sided permutation test on the difference of means.

    Non-parametric (no normality assumption). Returns (p_value, cohens_d).
    Shuffles the during/baseline labels n_perm times and counts how often the
    permuted mean-difference is at least as extreme as the observed one.
    """
    import numpy as np

    during = np.asarray(during, dtype=float)
    baseline = np.asarray(baseline, dtype=float)
    n_d, n_b = len(during), len(baseline)
    if n_d < 2 or n_b < 2:
        return None, None

    observed = during.mean() - baseline.mean()

    # Cohen's d with pooled standard deviation
    pooled_var = ((n_d - 1) * during.var(ddof=1) + (n_b - 1) * baseline.var(ddof=1)) / (n_d + n_b - 2)
    pooled_sd = float(np.sqrt(pooled_var)) if pooled_var > 0 else 0.0
    cohens_d = float(observed / pooled_sd) if pooled_sd > 0 else None

    combined = np.concatenate([during, baseline])
    rng = np.random.default_rng(seed)
    count_extreme = 0
    for _ in range(n_perm):
        rng.shuffle(combined)
        diff = combined[:n_d].mean() - combined[n_d:].mean()
        if abs(diff) >= abs(observed):
            count_extreme += 1
    # +1 smoothing so p is never exactly 0
    p_value = (count_extreme + 1) / (n_perm + 1)
    return float(p_value), cohens_d


@router.get("/{eeg_id}/coactivation")
def get_eeg_coactivation(
    eeg_id: UUID,
    run_id: UUID | None = None,
    roi: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Per-band EEG power during each facial micro-action vs. baseline, with stats.

    Baseline = samples outside every micro-action window. Windows are shifted by
    sync_offset_ms to align with EEG time. For each band × micro-action we report
    the mean during vs. baseline, the % change, a permutation-test p-value and
    Cohen's d effect size. This is the core face↔EEG crossing metric for
    cognitive-activity analysis.
    """
    from app.api.v1.routes_videos import load_timeline_events

    eeg_asset = get_owned_eeg(db, current_user, eeg_id)

    video_asset = db.query(VideoAssetModel).filter(VideoAssetModel.session_id == eeg_asset.session_id).first()
    if not video_asset:
        raise HTTPException(status_code=404, detail="No video associated with this EEG session")

    analysis_run, derived = _latest_timeseries_result(db, eeg_id, run_id)
    if derived is not None:
        long_rows = [
            row
            for row in derived.get("preview", [])
            if (roi is None or row.get("roi") == roi)
            and row.get("metric") == "absolute_power"
        ]
        by_time = {}
        for row in long_rows:
            timestamp_ms = float(row["time_seconds"]) * 1000
            target = by_time.setdefault(timestamp_ms, {"timestamp_ms": timestamp_ms})
            key = f"__{row['band']}"
            target.setdefault(key, []).append(float(row["value"]))
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
        result_source = "analysis-run"
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
    offset = mapping["offset_ms"]

    # Micro-action windows in EEG time (ms)
    windows = [
        {
            "action": ev["action"],
            "start_ms": video_to_eeg_ms(ev["start_time"] * 1000, mapping),
            "end_ms": video_to_eeg_ms(ev["end_time"] * 1000, mapping),
        }
        for ev in events
    ]

    present_bands = [b for b in EEG_BANDS if rows and b in rows[0]]

    def in_any_window(ts):
        return any(w["start_ms"] <= ts <= w["end_ms"] for w in windows)

    # Collect per-sample band values, split into baseline vs. per-action pools.
    baseline_samples = {b: [] for b in present_bands}
    by_action = {}
    for w in windows:
        by_action.setdefault(w["action"], []).append(w)
    action_samples = {a: {b: [] for b in present_bands} for a in by_action}

    for row in rows:
        ts = row.get("timestamp_ms")
        if not isinstance(ts, (int, float)):
            continue
        values = {b: row.get(b) for b in present_bands}

        if not in_any_window(ts):
            for b in present_bands:
                if isinstance(values[b], (int, float)):
                    baseline_samples[b].append(values[b])
            continue

        for action, wins in by_action.items():
            if any(w["start_ms"] <= ts <= w["end_ms"] for w in wins):
                for b in present_bands:
                    if isinstance(values[b], (int, float)):
                        action_samples[action][b].append(values[b])

    baseline_count = max((len(baseline_samples[b]) for b in present_bands), default=0)

    actions_result = []
    tested = []
    for action, wins in by_action.items():
        total_ms = sum(max(0.0, w["end_ms"] - w["start_ms"]) for w in wins)
        sample_count = max((len(action_samples[action][b]) for b in present_bands), default=0)

        bands_out = {}
        for b in present_bands:
            during_vals = action_samples[action][b]
            base_vals = baseline_samples[b]
            during = sum(during_vals) / len(during_vals) if during_vals else None
            base = sum(base_vals) / len(base_vals) if base_vals else None
            delta_pct = (during - base) / abs(base) * 100.0 if (during is not None and base not in (None, 0)) else None
            p_value, cohens_d = _permutation_test(during_vals, base_vals)
            bands_out[b] = {
                "during": during,
                "baseline": base,
                "delta_pct": delta_pct,
                "p_value": p_value,
                "cohens_d": cohens_d,
                "significant": (p_value is not None and p_value < 0.05),
            }
            if p_value is not None:
                tested.append((bands_out[b], p_value))

        actions_result.append({
            "action": action,
            "n_events": len(wins),
            "total_ms": total_ms,
            "sample_count": sample_count,
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
        "multiple_comparisons": "Benjamini-Hochberg FDR",
        "sample_metadata": {
            "baseline_samples": baseline_count,
            "event_count": len(windows),
            "tested_hypotheses": len(tested),
        },
        "caveat": "Temporal association only; this result does not establish causality.",
    }

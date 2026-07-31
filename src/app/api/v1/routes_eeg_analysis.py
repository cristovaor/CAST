from __future__ import annotations

import hashlib
import gzip
import json
import mimetypes
import uuid
from datetime import datetime
from pathlib import PurePosixPath
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.api.ownership import get_eeg, get_participant, get_study
from app.core.config import settings
from app.db.models import (
    EEGAnalysisArtifact,
    EEGAnalysisRun,
    EEGAsset,
    EEGAssetFile,
    JobStatus,
    JobType,
    Participant,
    ProcessingJob,
    Session as SessionModel,
    Study,
    User,
)
from app.schemas.eeg_analysis import (
    EEGAnalysisRunCreate,
    EEGAnalysisRunDetail,
    EEGArtifactDetail,
    EEGUploadComplete,
    EEGUploadInit,
)
from app.services.eeg_bundle_service import (
    primary_filename,
    safe_bundle_name,
    sha256_bytes,
    validate_bids_zip,
    validate_brainvision_references,
)
from app.services.storage_service import storage_service


router = APIRouter(tags=["eeg-analysis"])
ACTIVE_RUN_STATES = ("queued", "running")
REUSABLE_RUN_STATES = ("succeeded", "partial")
RESULT_KINDS = {
    "power": "power-json",
    "timeseries": "timeseries-index",
    "stats": "stats-json",
    "topomaps": "topomaps-json",
    "mdmp": "mdmp-json",
}


def _enabled() -> None:
    if not settings.EEG_ANALYSIS_V2_ENABLED:
        raise HTTPException(status_code=404, detail="EEG analysis v2 is disabled")


def _manifest(files: list[EEGAssetFile]) -> list[dict[str, Any]]:
    return [
        {
            "file_id": str(item.id),
            "eeg_asset_id": str(item.eeg_asset_id),
            "filename": item.filename,
            "role": item.role,
            "size_bytes": item.size_bytes,
            "checksum_sha256": item.checksum_sha256,
            "is_primary": item.is_primary,
        }
        for item in sorted(
            files,
            key=lambda value: (
                str(value.eeg_asset_id),
                not value.is_primary,
                value.filename,
                str(value.id),
            ),
        )
    ]


def _input_hash(
    manifest: list[dict[str, Any]], profile: str, pipeline: str, parameters: dict[str, Any]
) -> str:
    canonical = json.dumps(
        {
            "manifest": manifest,
            "profile": profile,
            "pipeline": pipeline,
            "parameters": parameters,
            "method": "cast-pyp-eeg:2.0.0+cast.4074a2a",
        },
        sort_keys=True,
        separators=(",", ":"),
    ).encode()
    return hashlib.sha256(canonical).hexdigest()


def _get_run(db: Session, user: User, run_id: UUID) -> EEGAnalysisRun:
    run = db.query(EEGAnalysisRun).filter(EEGAnalysisRun.id == run_id).first()
    if run is None:
        raise HTTPException(status_code=404, detail="EEG analysis run not found")
    if run.eeg_asset_id:
        get_eeg(db, user, run.eeg_asset_id)
    elif run.study_id:
        get_study(db, user, run.study_id)
    else:
        raise HTTPException(status_code=404, detail="EEG analysis run not found")
    return run


def _run_payload(run: EEGAnalysisRun, *, reused: bool = False) -> dict[str, Any]:
    return {
        "id": run.id,
        "eeg_asset_id": run.eeg_asset_id,
        "study_id": run.study_id,
        "job_id": run.job_id,
        "scope_type": run.scope_type,
        "pipeline": run.pipeline,
        "profile": run.profile,
        "parameters": run.parameters or {},
        "input_manifest": run.input_manifest or [],
        "input_hash": run.input_hash,
        "package_version": run.package_version,
        "upstream_commit": run.upstream_commit,
        "mdmp_version": run.mdmp_version,
        "mdmp_commit": run.mdmp_commit,
        "status": run.status,
        "step_status": run.step_status or {},
        "warnings": run.warnings or [],
        "error_message": run.error_message,
        "created_at": run.created_at,
        "started_at": run.started_at,
        "finished_at": run.finished_at,
        "reused": reused,
    }


def _record_eeg_access(
    db: Session, user: User, entity_id: UUID, operation: str, **detail: Any
) -> None:
    from app.api.v1.routes_governance import record_access

    record_access(
        db,
        "eeg",
        entity_id,
        actor=user,
        detail={"op": operation, **detail},
    )


@router.post("/eeg/uploads/init", status_code=status.HTTP_201_CREATED)
def init_eeg_upload(
    payload: EEGUploadInit,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _enabled()
    participant = get_participant(db, current_user, payload.participant_id)
    if len(payload.files) > settings.EEG_UPLOAD_MAX_FILES:
        raise HTTPException(status_code=413, detail="EEG bundle contains too many files")
    total_bytes = sum(item.size_bytes for item in payload.files)
    if total_bytes > settings.EEG_UPLOAD_MAX_TOTAL_BYTES:
        raise HTTPException(status_code=413, detail="EEG bundle exceeds upload size limit")
    try:
        safe_names = [safe_bundle_name(item.filename) for item in payload.files]
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if payload.session_id:
        session = get_session_for_upload(db, current_user, payload.session_id, participant.id)
    else:
        session = SessionModel(participant_id=participant.id)
        db.add(session)
        db.flush()
    if db.query(EEGAsset).filter(EEGAsset.session_id == session.id).first():
        raise HTTPException(status_code=409, detail="Session already has an EEG asset")

    primary = primary_filename(payload.files)
    asset = EEGAsset(
        id=uuid.uuid4(),
        session_id=session.id,
        filename=primary,
        eeg_format=PurePosixPath(primary).suffix.lstrip(".").upper(),
        mime_type=next(
            item.content_type for item in payload.files if item.is_primary
        ),
        size_bytes=total_bytes,
    )
    db.add(asset)
    db.flush()
    response_files = []
    for item, safe_name in zip(payload.files, safe_names):
        key = f"eeg/{asset.id}/source/{safe_name}"
        stored = EEGAssetFile(
            eeg_asset_id=asset.id,
            role=item.role,
            filename=safe_name,
            mime_type=item.content_type,
            storage_uri=f"s3://{storage_service.bucket_name}/{key}",
            size_bytes=item.size_bytes,
            checksum_sha256=item.checksum_sha256.lower(),
            is_primary=item.is_primary,
        )
        db.add(stored)
        if item.is_primary:
            asset.storage_uri = stored.storage_uri
        response_files.append(
            {
                "filename": safe_name,
                "role": item.role,
                "upload_url": storage_service.generate_presigned_upload_url(key),
                "headers": {"Content-Type": item.content_type},
            }
        )
    db.commit()
    return {
        "eeg_asset_id": asset.id,
        "session_id": session.id,
        "expires_in_seconds": 3600,
        "files": response_files,
    }


def get_session_for_upload(
    db: Session, user: User, session_id: UUID, participant_id: UUID
) -> SessionModel:
    from app.api.ownership import get_session

    session = get_session(db, user, session_id)
    if session.participant_id != participant_id:
        raise HTTPException(status_code=409, detail="Session belongs to another participant")
    return session


@router.post("/eeg/{eeg_id}/uploads/complete")
def complete_eeg_upload(
    eeg_id: UUID,
    payload: EEGUploadComplete,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _enabled()
    asset = get_eeg(db, current_user, eeg_id)
    expected = {item.filename: item for item in asset.files}
    supplied = {item.filename: item for item in payload.files}
    if supplied.keys() != expected.keys():
        raise HTTPException(status_code=422, detail="completed file manifest does not match")
    # Keep every member name for cross-file reference validation without
    # retaining large binary .eeg/.fdt payloads twice in memory.
    contents: dict[str, bytes] = {filename: b"" for filename in expected}
    for filename, stored in expected.items():
        key = storage_service.key_from_uri(stored.storage_uri)
        try:
            data = storage_service.download_bytes(key)
        except Exception as exc:
            raise HTTPException(
                status_code=409, detail=f"uploaded file is missing: {filename}"
            ) from exc
        actual_hash = sha256_bytes(data)
        if len(data) != stored.size_bytes:
            raise HTTPException(status_code=409, detail=f"size mismatch for {filename}")
        if (
            actual_hash != stored.checksum_sha256.lower()
            or actual_hash != supplied[filename].checksum_sha256.lower()
        ):
            raise HTTPException(status_code=409, detail=f"checksum mismatch for {filename}")
        stored.verified_at = datetime.utcnow()
        if filename.lower().endswith((".vhdr", ".vmrk")):
            contents[filename] = data
        if filename.lower().endswith(".zip"):
            try:
                validate_bids_zip(data)
            except (ValueError, OSError) as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc
    try:
        validate_brainvision_references(contents)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    primary = next(item for item in asset.files if item.is_primary)
    asset.storage_uri = primary.storage_uri
    asset.filename = primary.filename
    asset.mime_type = primary.mime_type
    asset.size_bytes = sum(item.size_bytes for item in asset.files)
    db.commit()
    _record_eeg_access(db, current_user, asset.id, "bundle_upload_complete")
    from app.workers.tasks_eeg import parse_eeg_task

    parse_eeg_task.apply_async(args=[str(asset.id)], queue="eeg")
    return {
        "eeg_asset_id": asset.id,
        "complete": True,
        "file_count": len(asset.files),
        "bundle_checksum": _input_hash(_manifest(asset.files), "source", "ingest", {}),
    }


def _create_run(
    db: Session,
    user: User,
    payload: EEGAnalysisRunCreate,
    *,
    eeg_asset: EEGAsset | None = None,
    study: Study | None = None,
) -> tuple[EEGAnalysisRun, bool]:
    files: list[EEGAssetFile]
    if eeg_asset is not None:
        files = list(eeg_asset.files)
    else:
        files = (
            db.query(EEGAssetFile)
            .join(EEGAsset, EEGAssetFile.eeg_asset_id == EEGAsset.id)
            .join(SessionModel, EEGAsset.session_id == SessionModel.id)
            .join(Participant, SessionModel.participant_id == Participant.id)
            .filter(Participant.study_id == study.id)
            .all()
        )
    if not files:
        raise HTTPException(status_code=409, detail="No completed EEG bundle is available")
    pending = [
        item.filename
        for item in files
        if item.verified_at is None and item.checksum_sha256 != "legacy-unverified"
    ]
    if pending:
        raise HTTPException(
            status_code=409,
            detail={
                "state": "incomplete",
                "reason": "EEG upload completion has not verified every file",
                "files": pending[:20],
            },
        )
    manifest = _manifest(files)
    digest = _input_hash(manifest, payload.profile, payload.pipeline, payload.parameters)
    scope_filter = (
        EEGAnalysisRun.eeg_asset_id == eeg_asset.id
        if eeg_asset is not None
        else EEGAnalysisRun.study_id == study.id
    )
    existing = (
        db.query(EEGAnalysisRun)
        .filter(scope_filter, EEGAnalysisRun.input_hash == digest)
        .filter(
            EEGAnalysisRun.status.in_(
                (*ACTIVE_RUN_STATES, *(REUSABLE_RUN_STATES if payload.reuse_completed else ()))
            )
        )
        .order_by(EEGAnalysisRun.created_at.desc())
        .first()
    )
    if existing:
        return existing, True
    job = ProcessingJob(
        eeg_asset_id=eeg_asset.id if eeg_asset else None,
        study_id=study.id if study else None,
        session_id=eeg_asset.session_id if eeg_asset else None,
        job_type=JobType.eeg_analysis,
        status=JobStatus.queued,
        progress=0,
        logs=[],
    )
    db.add(job)
    db.flush()
    run = EEGAnalysisRun(
        eeg_asset_id=eeg_asset.id if eeg_asset else None,
        study_id=study.id if study else None,
        job_id=job.id,
        scope_type="session" if eeg_asset else "study",
        pipeline=payload.pipeline,
        profile=payload.profile,
        parameters=payload.parameters,
        input_manifest=manifest,
        input_hash=digest,
        status="queued",
        step_status={"queued": {"status": "succeeded", "at": datetime.utcnow().isoformat()}},
        created_by=user.id,
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    from app.workers.tasks_eeg_analysis import process_eeg_analysis_task

    process_eeg_analysis_task.apply_async(
        args=[str(run.id)], task_id=str(job.id), queue="eeg"
    )
    _record_eeg_access(
        db, user, eeg_asset.id if eeg_asset else study.id, "analysis_launch", run_id=str(run.id)
    )
    return run, False


@router.post(
    "/eeg/{eeg_id}/analysis-runs",
    response_model=EEGAnalysisRunDetail,
    status_code=202,
)
def create_eeg_analysis_run(
    eeg_id: UUID,
    payload: EEGAnalysisRunCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _enabled()
    run, reused = _create_run(
        db, current_user, payload, eeg_asset=get_eeg(db, current_user, eeg_id)
    )
    return _run_payload(run, reused=reused)


@router.get("/eeg/{eeg_id}/analysis-runs", response_model=list[EEGAnalysisRunDetail])
def list_eeg_analysis_runs(
    eeg_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _enabled()
    get_eeg(db, current_user, eeg_id)
    return [
        _run_payload(run)
        for run in db.query(EEGAnalysisRun)
        .filter(EEGAnalysisRun.eeg_asset_id == eeg_id)
        .order_by(EEGAnalysisRun.created_at.desc())
        .all()
    ]


@router.post(
    "/studies/{study_id}/eeg-analysis-runs",
    response_model=EEGAnalysisRunDetail,
    status_code=202,
)
def create_study_eeg_analysis_run(
    study_id: UUID,
    payload: EEGAnalysisRunCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _enabled()
    run, reused = _create_run(
        db, current_user, payload, study=get_study(db, current_user, study_id)
    )
    return _run_payload(run, reused=reused)


@router.get(
    "/studies/{study_id}/eeg-analysis-runs",
    response_model=list[EEGAnalysisRunDetail],
)
def list_study_eeg_analysis_runs(
    study_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _enabled()
    get_study(db, current_user, study_id)
    return [
        _run_payload(run)
        for run in db.query(EEGAnalysisRun)
        .filter(EEGAnalysisRun.study_id == study_id)
        .order_by(EEGAnalysisRun.created_at.desc())
        .all()
    ]


@router.get("/eeg/analysis-runs/{run_id}", response_model=EEGAnalysisRunDetail)
def get_eeg_analysis_run(
    run_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _enabled()
    return _run_payload(_get_run(db, current_user, run_id))


@router.get(
    "/eeg/analysis-runs/{run_id}/artifacts",
    response_model=list[EEGArtifactDetail],
)
def list_eeg_analysis_artifacts(
    run_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _enabled()
    run = _get_run(db, current_user, run_id)
    return [
        {
            "id": item.id,
            "kind": item.kind,
            "content_type": item.content_type,
            "size_bytes": item.size_bytes,
            "checksum_sha256": item.checksum_sha256,
            "units": item.units,
            "metadata_info": item.metadata_info or {},
            "created_at": item.created_at,
            "download_url": f"{settings.API_V1_STR}/eeg/analysis-runs/{run.id}/artifacts/{item.id}/download",
        }
        for item in run.artifacts
    ]


@router.get("/eeg/analysis-runs/{run_id}/artifacts/{artifact_id}/download")
def download_eeg_analysis_artifact(
    run_id: UUID,
    artifact_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _enabled()
    run = _get_run(db, current_user, run_id)
    artifact = (
        db.query(EEGAnalysisArtifact)
        .filter(
            EEGAnalysisArtifact.id == artifact_id,
            EEGAnalysisArtifact.run_id == run.id,
        )
        .first()
    )
    if artifact is None:
        raise HTTPException(status_code=404, detail="EEG artifact not found")
    key = storage_service.key_from_uri(artifact.storage_uri)
    _record_eeg_access(
        db,
        current_user,
        run.eeg_asset_id or run.study_id,
        "artifact_download",
        run_id=str(run.id),
        artifact_id=str(artifact.id),
    )
    return {"url": storage_service.generate_presigned_download_url(key), "expires_in": 3600}


@router.get("/eeg/analysis-runs/{run_id}/results/{result_type}")
def get_eeg_analysis_result(
    run_id: UUID,
    result_type: str,
    start_seconds: float | None = Query(None),
    end_seconds: float | None = Query(None),
    band: str | None = Query(None),
    roi: str | None = Query(None),
    metric: str | None = Query(None),
    limit: int = Query(5000, ge=1, le=20000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _enabled()
    run = _get_run(db, current_user, run_id)
    kind = RESULT_KINDS.get(result_type)
    if kind is None:
        raise HTTPException(status_code=404, detail="Unknown EEG result type")
    artifact = (
        db.query(EEGAnalysisArtifact)
        .filter(EEGAnalysisArtifact.run_id == run.id, EEGAnalysisArtifact.kind == kind)
        .order_by(EEGAnalysisArtifact.created_at.desc())
        .first()
    )
    if artifact is None:
        raise HTTPException(
            status_code=409,
            detail={"state": run.status, "reason": f"{result_type} result is unavailable"},
        )
    payload = json.loads(
        storage_service.download_bytes(
            storage_service.key_from_uri(artifact.storage_uri)
        ).decode("utf-8")
    )
    if result_type == "timeseries":
        tile_query = db.query(EEGAnalysisArtifact).filter(
            EEGAnalysisArtifact.run_id == run.id,
            EEGAnalysisArtifact.kind == "timeseries-tile",
        )
        candidates = []
        for tile in tile_query.all():
            metadata = tile.metadata_info or {}
            if start_seconds is not None and metadata.get("end_seconds", 0) < start_seconds:
                continue
            if end_seconds is not None and metadata.get("start_seconds", 0) > end_seconds:
                continue
            if band is not None and metadata.get("band") != band:
                continue
            if roi is not None and metadata.get("scope") != roi:
                continue
            candidates.append(tile)
        # Pick the finest resolution that stays near the requested point cap.
        by_resolution: dict[str, list[EEGAnalysisArtifact]] = {
            "full": [], "4x": [], "16x": []
        }
        for tile in candidates:
            by_resolution.setdefault(
                str((tile.metadata_info or {}).get("resolution", "full")), []
            ).append(tile)
        selected_tiles: list[EEGAnalysisArtifact] = []
        selected_resolution = "preview"
        for resolution in ("full", "4x", "16x"):
            group = by_resolution.get(resolution, [])
            estimated = sum(
                int((item.metadata_info or {}).get("point_count", 0)) for item in group
            )
            if group and estimated <= limit * 2:
                selected_tiles = group
                selected_resolution = resolution
                break
        if not selected_tiles and by_resolution.get("16x"):
            selected_tiles = by_resolution["16x"]
            selected_resolution = "16x"
        points = []
        for tile in sorted(
            selected_tiles,
            key=lambda item: (
                (item.metadata_info or {}).get("start_seconds", 0),
                (item.metadata_info or {}).get("scope", ""),
            ),
        ):
            raw = storage_service.download_bytes(
                storage_service.key_from_uri(tile.storage_uri)
            )
            if tile.content_type == "application/gzip":
                raw = gzip.decompress(raw)
            points.extend(json.loads(raw.decode("utf-8")).get("points", []))
        if not points:
            points = payload.get("preview", [])
        points = [
            point
            for point in points
            if (start_seconds is None or point["time_seconds"] >= start_seconds)
            and (end_seconds is None or point["time_seconds"] <= end_seconds)
            and (band is None or point.get("band") == band)
            and (roi is None or point.get("roi") == roi)
            and (metric is None or point.get("metric") == metric)
        ]
        if len(points) > limit:
            stride = max(1, len(points) // limit)
            points = points[::stride][:limit]
        payload["points"] = points
        payload["returned_points"] = len(payload["points"])
        payload["resolution"] = selected_resolution
        payload.pop("preview", None)
    elif result_type == "topomaps":
        images = (
            db.query(EEGAnalysisArtifact)
            .filter(
                EEGAnalysisArtifact.run_id == run.id,
                EEGAnalysisArtifact.kind == "topomap-png",
            )
            .all()
        )
        by_name = {
            PurePosixPath(storage_service.key_from_uri(item.storage_uri)).name: item
            for item in images
        }
        for topomap in payload.get("topomaps", []):
            image = by_name.get(str(topomap.get("image", "")))
            if image:
                topomap["download_url"] = (
                    f"{settings.API_V1_STR}/eeg/analysis-runs/{run.id}"
                    f"/artifacts/{image.id}/download"
                )
    _record_eeg_access(
        db,
        current_user,
        run.eeg_asset_id or run.study_id,
        "analysis_result_read",
        run_id=str(run.id),
        result_type=result_type,
    )
    return JSONResponse(payload)

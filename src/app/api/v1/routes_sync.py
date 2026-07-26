"""Versioned, evidence-based video/EEG synchronization APIs."""

from __future__ import annotations

from datetime import datetime
import hashlib
import json
from typing import Any
from uuid import UUID, uuid4

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Response,
    UploadFile,
    status,
)
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_user
from app.api.ownership import get_session
from app.db.models import (
    AuditAction,
    AuditLog,
    EEGAsset,
    JobStatus,
    JobType,
    ProcessingJob,
    SyncEvidence,
    SyncRun,
    SyncState,
    Synchronization,
    User,
    VideoAsset,
)
from app.schemas.multimodal import (
    SyncDecision,
    SyncDetail,
    SyncEvidenceDetail,
    SyncRunCreate,
    SyncRunDetail,
    SyncRunStart,
    SyncUpdate,
)
from app.services.storage_service import storage_service
from app.services.sync_processing_service import ALGORITHM_VERSION, METHODS


router = APIRouter(prefix="/sync", tags=["sync"])
MAX_EVIDENCE_BYTES = 50 * 1024 * 1024

METHOD_DESCRIPTIONS = {
    "absolute_timestamp": "Alinha relógios absolutos com precisão declarada.",
    "hardware_trigger": "Pareia bordas TTL/stim entre referência e EEG.",
    "digital_marker": "Pareia sequências de marcadores codificados.",
    "visual_event": "Detecta flashes em uma ROI e pareia com fotodiodo/eventos EEG.",
    "audio_event": "Correlaciona o áudio do vídeo com uma referência do EEG.",
    "reference_frame": "Calcula a transformação a partir de frames e amostras pareados.",
    "manual": "Ajusta uma transformação real a partir de âncoras revisadas.",
    "event_correlation": "Correlaciona eventos faciais com atividade temporal robusta do EEG.",
    "informed_offset": "Valida e normaliza um offset externo com incerteza e proveniência.",
    "semi_automatic": "Refina uma proposta automática usando âncoras humanas.",
}


def _session_assets(db: Session, session_id: UUID):
    video = db.query(VideoAsset).filter(VideoAsset.session_id == session_id).first()
    eeg = db.query(EEGAsset).filter(EEGAsset.session_id == session_id).first()
    return video, eeg


def _capabilities(
    db: Session,
    session_id: UUID,
    video: VideoAsset | None,
    eeg: EEGAsset | None,
) -> list[dict[str, Any]]:
    evidences = (
        db.query(SyncEvidence.kind)
        .filter(SyncEvidence.session_id == session_id)
        .all()
    )
    kinds = {row[0] for row in evidences}
    has_proposal = (
        db.query(SyncRun.id)
        .filter(
            SyncRun.session_id == session_id,
            SyncRun.status == "succeeded",
            SyncRun.outcome == "proposal",
        )
        .first()
        is not None
    )
    requirements: dict[str, list[str]] = {
        "absolute_timestamp": ["timestamps e precisão dos relógios"],
        "hardware_trigger": []
        if kinds & {"hardware_trigger", "trigger_log"}
        and kinds & {"eeg_trigger", "photodiode"}
        else ["log de trigger de referência", "trigger/canal stim do EEG"],
        "digital_marker": []
        if kinds & {"digital_marker", "marker_log"}
        and "eeg_marker" in kinds
        else ["marcadores do vídeo/sistema", "marcadores EEG"],
        "visual_event": (
            ([] if video else ["vídeo"])
            + ([] if kinds & {"eeg_trigger", "photodiode"} else ["eventos EEG/fotodiodo"])
        ),
        "audio_event": (
            ([] if video else ["vídeo com áudio"])
            + ([] if kinds & {"eeg_audio", "audio_reference"} else ["áudio/canal auxiliar EEG"])
        ),
        "reference_frame": ["pares frame/amostra"],
        "manual": ["ao menos uma âncora"],
        "event_correlation": (
            ([] if video else ["vídeo processado"])
            + ([] if eeg else ["EEG"])
        ),
        "informed_offset": ["offset, incerteza, fonte e justificativa"],
        "semi_automatic": (
            ([] if has_proposal else ["proposta automática válida"])
            + ["ao menos uma âncora de revisão"]
        ),
    }
    capabilities = []
    for method in METHODS:
        missing = requirements[method]
        capabilities.append(
            {
                "method": method,
                "status": "available" if not missing else "requires_inputs",
                "missing_inputs": missing,
                "description": METHOD_DESCRIPTIONS[method],
            }
        )
    return capabilities


def _run_detail(run: SyncRun | None) -> dict[str, Any] | None:
    if run is None:
        return None
    return {
        "id": run.id,
        "session_id": run.session_id,
        "job_id": run.job_id,
        "method": run.method,
        "status": run.status,
        "outcome": run.outcome,
        "algorithm_version": run.algorithm_version,
        "input_manifest": run.input_manifest or {},
        "parameters": run.parameters or {},
        "result": run.result or {},
        "metrics": run.metrics or {},
        "quality_grade": run.quality_grade,
        "uncertainty_ms": run.uncertainty_ms,
        "error_message": run.error_message,
        "review_decision": run.review_decision,
        "review_justification": run.review_justification,
        "reviewed_at": run.reviewed_at,
        "created_at": run.created_at,
        "started_at": run.started_at,
        "finished_at": run.finished_at,
    }


def _sync_detail(db: Session, session_id: UUID) -> dict[str, Any]:
    synchronization = (
        db.query(Synchronization)
        .filter(Synchronization.session_id == session_id)
        .first()
    )
    latest_run = (
        db.query(SyncRun)
        .filter(SyncRun.session_id == session_id)
        .order_by(SyncRun.created_at.desc(), SyncRun.id.desc())
        .first()
    )
    approved_run = (
        db.query(SyncRun)
        .filter(SyncRun.id == synchronization.approved_run_id)
        .first()
        if synchronization and synchronization.approved_run_id
        else None
    )
    video, eeg = _session_assets(db, session_id)
    duration_ms = max(
        float(video.duration_seconds or 0) * 1000 if video else 0,
        float(eeg.duration_seconds or 0) * 1000 if eeg else 0,
    )
    has_approved_mapping = bool(
        synchronization and synchronization.approved_run_id and approved_run
    )
    return {
        "id": synchronization.id if synchronization else None,
        "session_id": session_id,
        "state": synchronization.state if synchronization else SyncState.not_synced,
        "method": synchronization.method if has_approved_mapping else None,
        "offset_ms": synchronization.offset_ms if has_approved_mapping else 0,
        "drift_ms_per_min": (
            synchronization.drift_ms_per_min if has_approved_mapping else None
        ),
        "confidence": synchronization.confidence if has_approved_mapping else None,
        "anchors": (
            synchronization.anchors or [] if has_approved_mapping else []
        ),
        "history": synchronization.history or [] if synchronization else [],
        "justification": synchronization.justification if synchronization else None,
        "approved_run_id": synchronization.approved_run_id if synchronization else None,
        "mapping_version": synchronization.mapping_version if synchronization else "affine-v1",
        "quality_grade": (
            synchronization.quality_grade if has_approved_mapping else None
        ),
        "uncertainty_ms": (
            synchronization.uncertainty_ms if has_approved_mapping else None
        ),
        "duration_ms": duration_ms or None,
        "capabilities": _capabilities(db, session_id, video, eeg),
        "latest_run": _run_detail(latest_run),
        "approved_run": _run_detail(approved_run),
        "updated_at": synchronization.updated_at if synchronization else None,
    }


def _evidence_rows(
    db: Session,
    session_id: UUID,
    evidence_ids: list[UUID],
) -> list[SyncEvidence]:
    if not evidence_ids:
        return []
    rows = (
        db.query(SyncEvidence)
        .filter(
            SyncEvidence.session_id == session_id,
            SyncEvidence.id.in_(evidence_ids),
        )
        .all()
    )
    if len(rows) != len(set(evidence_ids)):
        raise HTTPException(status_code=422, detail="Uma ou mais evidências são inválidas")
    return rows


def _input_hash(
    session_id: UUID,
    method: str,
    parameters: dict[str, Any],
    evidence: list[SyncEvidence],
) -> str:
    canonical = {
        "session_id": str(session_id),
        "method": method,
        "algorithm_version": ALGORITHM_VERSION,
        "parameters": parameters,
        "evidence": sorted(row.checksum_sha256 for row in evidence),
    }
    return hashlib.sha256(
        json.dumps(canonical, sort_keys=True, separators=(",", ":"), default=str).encode("utf-8")
    ).hexdigest()


def _start_run(
    session_id: UUID,
    payload: SyncRunCreate,
    db: Session,
    current_user: User,
) -> SyncRunStart:
    get_session(db, current_user, session_id)
    active = (
        db.query(ProcessingJob)
        .filter(
            ProcessingJob.session_id == session_id,
            ProcessingJob.job_type == JobType.sync,
            ProcessingJob.status.in_([JobStatus.queued, JobStatus.running]),
        )
        .first()
    )
    if active:
        raise HTTPException(
            status_code=409,
            detail={"message": "Já existe uma sincronização em processamento", "job_id": str(active.id)},
        )

    evidence = _evidence_rows(db, session_id, payload.evidence_ids)
    parameters = dict(payload.parameters)
    if payload.anchors:
        parameters["anchors"] = [anchor.model_dump() for anchor in payload.anchors]
    input_hash = _input_hash(session_id, payload.method, parameters, evidence)
    existing = db.query(SyncRun).filter(SyncRun.input_hash == input_hash).first()
    if existing and existing.job_id:
        return SyncRunStart(
            run_id=existing.id,
            job_id=existing.job_id,
            status=existing.status,
            reused=True,
        )

    job = ProcessingJob(
        session_id=session_id,
        job_type=JobType.sync,
        status=JobStatus.queued,
        progress=0,
        logs=[],
    )
    db.add(job)
    db.flush()
    run = SyncRun(
        session_id=session_id,
        job_id=job.id,
        method=payload.method,
        status="queued",
        algorithm_version=ALGORITHM_VERSION,
        input_manifest={"evidence_ids": [str(row.id) for row in evidence]},
        input_hash=input_hash,
        parameters=parameters,
        result={},
        metrics={},
        created_by=current_user.id,
        created_at=datetime.utcnow(),
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    try:
        from app.workers.tasks_sync import process_sync_run_task

        process_sync_run_task.apply_async(args=[str(run.id)], task_id=str(job.id))
    except Exception as exc:
        run.status = "failed"
        run.error_message = f"Não foi possível enfileirar o processamento: {exc}"
        job.status = JobStatus.failed
        job.error_message = run.error_message
        job.finished_at = datetime.utcnow()
        db.commit()
        raise HTTPException(status_code=503, detail=run.error_message) from exc
    return SyncRunStart(run_id=run.id, job_id=job.id, status=run.status)


@router.get("/{session_id}", response_model=SyncDetail)
def get_sync(
    session_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_session(db, current_user, session_id)
    return _sync_detail(db, session_id)


@router.get("/{session_id}/evidence", response_model=list[SyncEvidenceDetail])
def list_evidence(
    session_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_session(db, current_user, session_id)
    return (
        db.query(SyncEvidence)
        .filter(SyncEvidence.session_id == session_id)
        .order_by(SyncEvidence.created_at.desc())
        .all()
    )


@router.post(
    "/{session_id}/evidence",
    response_model=SyncEvidenceDetail,
    status_code=status.HTTP_201_CREATED,
)
async def create_evidence(
    session_id: UUID,
    kind: str = Form(...),
    payload_json: str = Form("{}"),
    metadata_json: str = Form("{}"),
    file: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_session(db, current_user, session_id)
    try:
        payload = json.loads(payload_json or "{}")
        metadata_info = json.loads(metadata_json or "{}")
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=422, detail="Payload ou metadados não são JSON válido") from exc
    if not isinstance(payload, dict) or not isinstance(metadata_info, dict):
        raise HTTPException(status_code=422, detail="Payload e metadados devem ser objetos JSON")
    contents = await file.read() if file else b""
    if len(contents) > MAX_EVIDENCE_BYTES:
        raise HTTPException(status_code=413, detail="Evidência excede 50 MB")
    checksum_source = contents or json.dumps(payload, sort_keys=True, default=str).encode("utf-8")
    checksum = hashlib.sha256(checksum_source).hexdigest()
    storage_uri = None
    object_key = None
    if contents:
        safe_name = (file.filename or "evidence.bin").replace("\\", "_").replace("/", "_")
        object_key = f"sync-evidence/{session_id}/{uuid4()}-{safe_name}"
        if not storage_service.upload_bytes(
            object_key,
            contents,
            file.content_type or "application/octet-stream",
        ):
            raise HTTPException(status_code=503, detail="Falha ao armazenar a evidência")
        storage_uri = f"s3://{storage_service.bucket_name}/{object_key}"
    evidence = SyncEvidence(
        session_id=session_id,
        kind=kind,
        filename=file.filename if file else None,
        content_type=file.content_type if file else "application/json",
        storage_uri=storage_uri,
        checksum_sha256=checksum,
        payload=payload,
        metadata_info=metadata_info,
        created_by=current_user.id,
        created_at=datetime.utcnow(),
    )
    db.add(evidence)
    try:
        db.commit()
        db.refresh(evidence)
    except Exception:
        db.rollback()
        if object_key:
            storage_service.delete_object(object_key)
        raise
    return evidence


@router.delete("/{session_id}/evidence/{evidence_id}", status_code=204)
def delete_evidence(
    session_id: UUID,
    evidence_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_session(db, current_user, session_id)
    evidence = (
        db.query(SyncEvidence)
        .filter(SyncEvidence.session_id == session_id, SyncEvidence.id == evidence_id)
        .first()
    )
    if evidence is None:
        raise HTTPException(status_code=404, detail="Evidência não encontrada")
    referenced = any(
        str(evidence_id) in (run.input_manifest or {}).get("evidence_ids", [])
        for run in db.query(SyncRun).filter(SyncRun.session_id == session_id).all()
    )
    if referenced:
        raise HTTPException(status_code=409, detail="Evidência já utilizada por uma execução")
    storage_key = storage_service.key_from_uri(evidence.storage_uri) if evidence.storage_uri else None
    db.delete(evidence)
    db.commit()
    if storage_key:
        storage_service.delete_object(storage_key)
    return Response(status_code=204)


@router.get("/{session_id}/runs", response_model=list[SyncRunDetail])
def list_runs(
    session_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_session(db, current_user, session_id)
    return [
        _run_detail(run)
        for run in (
            db.query(SyncRun)
            .filter(SyncRun.session_id == session_id)
            .order_by(SyncRun.created_at.desc())
            .all()
        )
    ]


@router.post(
    "/{session_id}/runs",
    response_model=SyncRunStart,
    status_code=status.HTTP_202_ACCEPTED,
)
def create_run(
    session_id: UUID,
    payload: SyncRunCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _start_run(session_id, payload, db, current_user)


@router.get("/{session_id}/runs/{run_id}", response_model=SyncRunDetail)
def get_run(
    session_id: UUID,
    run_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_session(db, current_user, session_id)
    run = (
        db.query(SyncRun)
        .filter(SyncRun.session_id == session_id, SyncRun.id == run_id)
        .first()
    )
    if run is None:
        raise HTTPException(status_code=404, detail="Execução não encontrada")
    return _run_detail(run)


def _decide_run(
    session_id: UUID,
    run: SyncRun,
    payload: SyncDecision,
    db: Session,
    current_user: User,
) -> dict[str, Any]:
    justification = payload.justification.strip()
    if not justification:
        raise HTTPException(status_code=422, detail="Justificativa é obrigatória")
    if run.status != "succeeded" or run.outcome != "proposal":
        raise HTTPException(status_code=409, detail="A execução não possui uma proposta aprovável")
    if run.review_decision:
        raise HTTPException(status_code=409, detail="A execução já foi revisada")

    synchronization = (
        db.query(Synchronization)
        .filter(Synchronization.session_id == session_id)
        .first()
    )
    if synchronization is None:
        synchronization = Synchronization(session_id=session_id, state=SyncState.not_synced)
        db.add(synchronization)
        db.flush()

    now = datetime.utcnow()
    run.reviewed_by = current_user.id
    run.reviewed_at = now
    run.review_justification = justification
    if payload.approve:
        if run.quality_grade == "insufficient":
            raise HTTPException(status_code=409, detail="Evidência insuficiente não pode ser aprovada")
        run.review_decision = "approved"
        synchronization.approved_run_id = run.id
        synchronization.method = run.method
        synchronization.offset_ms = int(round(float(run.result["offset_ms"])))
        synchronization.drift_ms_per_min = run.result.get("drift_ms_per_min")
        synchronization.confidence = run.result.get("confidence")
        synchronization.anchors = run.result.get("anchors", [])
        synchronization.mapping_version = "affine-v1"
        synchronization.quality_grade = run.quality_grade
        synchronization.uncertainty_ms = run.uncertainty_ms
        synchronization.justification = justification
        synchronization.approved_by = current_user.id
        synchronization.approved_at = now
        synchronization.state = (
            SyncState.synced_with_caveats
            if run.quality_grade == "low"
            else SyncState.synced
        )
        eeg = db.query(EEGAsset).filter(EEGAsset.session_id == session_id).first()
        if eeg:
            eeg.sync_offset_ms = synchronization.offset_ms
    else:
        run.review_decision = "rejected"
        if synchronization.approved_run_id is None:
            synchronization.state = SyncState.sync_failed

    history = list(synchronization.history or [])
    history.append(
        {
            "at": now.isoformat(),
            "action": "Aprovada" if payload.approve else "Rejeitada",
            "run_id": str(run.id),
            "method": run.method,
            "note": justification,
            "by": current_user.email,
        }
    )
    synchronization.history = history
    db.add(
        AuditLog(
            organization_id=current_user.organization_id,
            action=AuditAction.sync_decision,
            actor_id=current_user.id,
            actor_label=current_user.email,
            entity_type="session",
            entity_id=str(session_id),
            justification=justification,
            detail={
                "approved": payload.approve,
                "run_id": str(run.id),
                "method": run.method,
                "quality_grade": run.quality_grade,
            },
        )
    )
    db.commit()
    from app.services.session_state_service import refresh_session_state

    refresh_session_state(db, session_id)
    return _sync_detail(db, session_id)


@router.post(
    "/{session_id}/runs/{run_id}/decision",
    response_model=SyncDetail,
)
def decide_run(
    session_id: UUID,
    run_id: UUID,
    payload: SyncDecision,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_session(db, current_user, session_id)
    run = (
        db.query(SyncRun)
        .filter(SyncRun.session_id == session_id, SyncRun.id == run_id)
        .first()
    )
    if run is None:
        raise HTTPException(status_code=404, detail="Execução não encontrada")
    return _decide_run(session_id, run, payload, db, current_user)


# Compatibility adapters ----------------------------------------------------

@router.post("/{session_id}/detect", response_model=SyncDetail, deprecated=True)
def detect_sync_endpoint(
    session_id: UUID,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    response.headers["Deprecation"] = "true"
    _start_run(
        session_id,
        SyncRunCreate(method="event_correlation"),
        db,
        current_user,
    )
    return _sync_detail(db, session_id)


@router.patch("/{session_id}", response_model=SyncDetail, deprecated=True)
def update_sync(
    session_id: UUID,
    payload: SyncUpdate,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    response.headers["Deprecation"] = "true"
    anchors = payload.anchors or []
    if not anchors and payload.offset_ms is not None:
        anchors = [
            {
                "label": "legacy-offset",
                "video_time_ms": float(payload.offset_ms),
                "eeg_time_ms": 0.0,
            }
        ]
    _start_run(
        session_id,
        SyncRunCreate(
            method="manual",
            anchors=anchors,
            parameters={
                "legacy_method": payload.method,
                "uncertainty_ms": 100,
            },
        ),
        db,
        current_user,
    )
    return _sync_detail(db, session_id)


@router.post("/{session_id}/decision", response_model=SyncDetail, deprecated=True)
def decide_sync(
    session_id: UUID,
    payload: SyncDecision,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    response.headers["Deprecation"] = "true"
    get_session(db, current_user, session_id)
    run = (
        db.query(SyncRun)
        .filter(
            SyncRun.session_id == session_id,
            SyncRun.status == "succeeded",
            SyncRun.outcome == "proposal",
            SyncRun.review_decision.is_(None),
        )
        .order_by(SyncRun.created_at.desc())
        .first()
    )
    if run is None:
        raise HTTPException(status_code=409, detail="Não há proposta pendente")
    return _decide_run(session_id, run, payload, db, current_user)

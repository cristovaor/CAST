from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID

from app.schemas.report import (
    DashboardMetrics,
    ExportResponse,
    ScientificReportJobResponse,
    ScientificReportPreview,
    ScientificReportRequest,
)
from app.db.session import SessionLocal
from app.services.report_service import generate_export_url
from app.db.models import User

router = APIRouter(prefix="/studies", tags=["reports"])

from app.api.deps import get_db, get_current_user
from app.api.ownership import get_participant, get_study, get_study_group

# Note: GET /{study_id}/dashboard lives in routes_studies.py (registered
# first in main.py). This router used to define a second, shadowed copy
# backed by report_service.get_dashboard_metrics — removed to avoid two
# competing implementations silently resolving to whichever was registered
# first.

@router.get("/{study_id}/exports", response_model=ExportResponse)
def get_export(
    study_id: UUID,
    format: str = "csv",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_study(db, current_user, study_id)
    if format not in ["csv", "parquet"]:
        raise HTTPException(status_code=400, detail="Format must be csv or parquet")
        
    try:
        url = generate_export_url(study_id, format, db)
        return {"download_url": url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

from app.db.models import AnalysisReport, JobStatus, JobType, ProcessingJob
from app.services.storage_service import storage_service

from app.services.scientific_report_service import (
    build_scientific_report,
    get_report_templates,
)
from app.workers.tasks_reports import (
    generate_scientific_report_task,
    run_scientific_report_job,
)


def _validate_report_scope(
    study_id: UUID,
    payload: ScientificReportRequest,
    db: Session,
    current_user: User,
) -> None:
    if payload.participant_id:
        participant = get_participant(db, current_user, payload.participant_id)
        if participant.study_id != study_id:
            raise HTTPException(status_code=404, detail="Participant not found")
    group_ids = [
        item
        for item in [payload.control_group_id, *payload.comparison_group_ids]
        if item is not None
    ]
    for group_id in group_ids:
        group = get_study_group(db, current_user, group_id)
        if group.study_id != study_id:
            raise HTTPException(status_code=404, detail="Study group not found")
    if payload.control_group_id:
        control = get_study_group(db, current_user, payload.control_group_id)
        if control.role != "control":
            raise HTTPException(
                status_code=422,
                detail="Selected control group is not marked with the control role",
            )


@router.get("/{study_id}/reports/templates")
def list_report_templates(
    study_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    study = get_study(db, current_user, study_id)
    return get_report_templates(study, db)


@router.post(
    "/{study_id}/reports/preview",
    response_model=ScientificReportPreview,
)
def preview_scientific_report(
    study_id: UUID,
    payload: ScientificReportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_study(db, current_user, study_id)
    _validate_report_scope(study_id, payload, db, current_user)
    try:
        return build_scientific_report(
            study_id, payload.model_dump(mode="json"), db, full=False
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post(
    "/{study_id}/reports/generate",
    response_model=ScientificReportJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def generate_study_report(
    study_id: UUID,
    payload: ScientificReportRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_study(db, current_user, study_id)
    _validate_report_scope(study_id, payload, db, current_user)
    try:
        # Validate consent, data bindings and model identifiability before a
        # durable job enters the queue. The worker repeats this against its
        # immutable snapshot and remains the source of the final analysis.
        build_scientific_report(
            study_id, payload.model_dump(mode="json"), db, full=False
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    job = ProcessingJob(
        study_id=study_id,
        job_type=JobType.report,
        status=JobStatus.queued,
        progress=0,
        result={
            "request": payload.model_dump(mode="json"),
            "generated_by": str(current_user.id),
        },
        logs=[],
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    try:
        generate_scientific_report_task.apply_async(
            args=[str(job.id)], task_id=str(job.id)
        )
    except Exception:
        # Local/offline deployments may temporarily lack Redis. Keep the API
        # asynchronous from the caller's perspective and run after the response.
        background_tasks.add_task(run_scientific_report_job, str(job.id))
    from app.api.v1.routes_governance import record_access
    record_access(
        db,
        "study",
        study_id,
        actor=current_user,
        detail={
            "op": "scientific_report_enqueue",
            "template": payload.template_key,
            "job_id": str(job.id),
        },
    )
    return {"job_id": job.id, "status": job.status.value}

@router.get("/{study_id}/reports")
def list_reports(
    study_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_study(db, current_user, study_id)
    reports = db.query(AnalysisReport).filter(AnalysisReport.study_id == study_id).order_by(AnalysisReport.generated_at.desc()).all()
    return [
        {
            "id": r.id,
            "type": r.report_type.value,
            "template_key": r.template_key,
            "scope_type": r.scope_type,
            "participant_id": r.participant_id,
            "methodology_version": r.methodology_version,
            "data_snapshot_hash": r.data_snapshot_hash,
            "summary": r.result_summary,
            "generated_at": r.generated_at.isoformat(),
            "download_url": storage_service.generate_presigned_download_url(
                r.storage_uri.replace(f"s3://{storage_service.bucket_name}/", "")
            ),
            "artifact_urls": {
                artifact_type: storage_service.generate_presigned_download_url(key)
                for artifact_type, key in (r.artifact_manifest or {}).items()
            },
        } for r in reports
    ]

from fastapi.responses import StreamingResponse
from app.services.pdf_generator import generate_study_report_pdf
from app.db.models import Study, Participant, Session as DBSession, VideoAsset, EEGAsset
import datetime


@router.get("/{study_id}/reports/dynamic-pdf")
def get_dynamic_pdf_report(
    study_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Study report PDF built from real, live-queried aggregates (docs §19).

    Never fabricates a "patient" or pre/post scores — video and EEG are the
    core modalities and tests/questionnaires are optional, not assumed.
    """
    study = get_study(db, current_user, study_id)

    participant_count = db.query(Participant).filter(Participant.study_id == study_id).count()
    session_count = (
        db.query(DBSession)
        .join(Participant, DBSession.participant_id == Participant.id)
        .filter(Participant.study_id == study_id)
        .count()
    )
    video_count = (
        db.query(VideoAsset)
        .join(DBSession, VideoAsset.session_id == DBSession.id)
        .join(Participant, DBSession.participant_id == Participant.id)
        .filter(Participant.study_id == study_id)
        .count()
    )
    eeg_count = (
        db.query(EEGAsset)
        .join(DBSession, EEGAsset.session_id == DBSession.id)
        .join(Participant, DBSession.participant_id == Participant.id)
        .filter(Participant.study_id == study_id)
        .count()
    )
    metrics = {
        "Participantes": participant_count,
        "Sessões": session_count,
        "Vídeos": video_count,
        "EEG": eeg_count,
    }

    rows = (
        db.query(DBSession.id, VideoAsset.quality_verdict, EEGAsset.quality_verdict)
        .join(Participant, DBSession.participant_id == Participant.id)
        .outerjoin(VideoAsset, VideoAsset.session_id == DBSession.id)
        .outerjoin(EEGAsset, EEGAsset.session_id == DBSession.id)
        .filter(Participant.study_id == study_id)
        .limit(20)
        .all()
    )
    findings = []
    for session_id, video_verdict, eeg_verdict in rows:
        if video_verdict:
            findings.append({"session": str(session_id)[:8], "modality": "Vídeo", "verdict": video_verdict.value})
        if eeg_verdict:
            findings.append({"session": str(session_id)[:8], "modality": "EEG", "verdict": eeg_verdict.value})

    pdf_buffer = generate_study_report_pdf(
        study_name=study.name,
        generated_at=datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC'),
        metrics=metrics,
        findings=findings,
    )

    from app.api.v1.routes_governance import record_access
    record_access(db, "study", study_id, actor=current_user, detail={"op": "report_pdf"})

    headers = {
        'Content-Disposition': f'attachment; filename="study_report_{study_id}.pdf"'
    }
    return StreamingResponse(pdf_buffer, media_type="application/pdf", headers=headers)

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID

from app.schemas.report import DashboardMetrics, ExportResponse
from app.db.session import SessionLocal
from app.services.report_service import generate_export_url
from app.db.models import User

router = APIRouter(prefix="/studies", tags=["reports"])

from app.api.deps import get_db, get_current_user
from app.api.ownership import get_study

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

from app.services.report_service import generate_json_report, generate_pdf_report
from app.db.models import AnalysisReport
from app.services.storage_service import storage_service

@router.post("/{study_id}/reports/generate")
def generate_study_report(
    study_id: UUID,
    format: str = "json",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_study(db, current_user, study_id)
    if format == "json":
        report = generate_json_report(study_id, current_user.id, db)
    elif format == "pdf":
        report = generate_pdf_report(study_id, current_user.id, db)
    else:
        raise HTTPException(status_code=400, detail="Unsupported format. Use 'json' or 'pdf'.")

    from app.api.v1.routes_governance import record_access
    record_access(db, "study", study_id, actor=current_user, detail={"op": "report_generate", "format": format})

    return {"message": "Report generated", "report_id": report.id}

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
            "generated_at": r.generated_at.isoformat(),
            "download_url": storage_service.generate_presigned_download_url(
                r.storage_uri.replace(f"s3://{storage_service.bucket_name}/", "")
            )
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

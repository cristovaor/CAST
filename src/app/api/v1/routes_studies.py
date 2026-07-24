from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID

from app.schemas.study import (
    ModalityQualitySummary,
    Study,
    StudyCreate,
    StudyQualitySummary,
    StudyUpdate,
)
from app.db.models import AuditAction, Study as StudyModel, User
from app.services.audit_service import build_changes, record_audit
from app.db.session import SessionLocal

router = APIRouter(prefix="/studies", tags=["studies"])

from app.api.deps import get_db, get_current_user
from app.api.ownership import get_project, get_study as get_owned_study, studies_for_user

@router.get("/", response_model=List[Study])
def get_studies(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return studies_for_user(db, current_user).all()

@router.post("/", response_model=Study)
def create_study(
    study_in: StudyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_project(db, current_user, study_in.project_id)
    data = study_in.model_dump()
    data["created_by"] = current_user.id
    db_obj = StudyModel(**data)
    db.add(db_obj)
    db.flush()
    record_audit(
        db,
        current_user,
        AuditAction.create,
        "study",
        db_obj.id,
        snapshot={
            "project_id": db_obj.project_id,
            "name": db_obj.name,
            "description": db_obj.description,
            "status": db_obj.status,
            "protocol_version": db_obj.protocol_version,
            "config": db_obj.config,
        },
    )
    db.commit()
    db.refresh(db_obj)
    return db_obj

@router.get("/{study_id}", response_model=Study)
def get_study(
    study_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_owned_study(db, current_user, study_id)

@router.patch("/{study_id}", response_model=Study)
def update_study(
    study_id: UUID,
    study_in: StudyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db_obj = get_owned_study(db, current_user, study_id)
        
    update_data = study_in.model_dump(exclude_unset=True)
    changes = build_changes(db_obj, update_data)
    for field, value in update_data.items():
        setattr(db_obj, field, value)

    if changes:
        record_audit(db, current_user, AuditAction.update, "study", db_obj.id, changes=changes)
    db.commit()
    db.refresh(db_obj)
    return db_obj

from app.db.models import EEGAsset, Participant, Session as DBSession, VideoAsset, ProcessingJob, JobType
from app.workers.tasks_video import process_video_task

@router.post("/{study_id}/batch-infer")
def batch_infer(
    study_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Triggers inference for all unprocessed videos in a study."""
    get_owned_study(db, current_user, study_id)
    videos = (
        db.query(VideoAsset)
        .join(DBSession)
        .join(Participant)
        .filter(Participant.study_id == study_id)
        .filter(VideoAsset.status != "processed")
        .all()
    )
    
    jobs_created = []
    for video in videos:
        job = ProcessingJob(video_asset_id=video.id, job_type=JobType.extract_landmarks)
        db.add(job)
        db.commit()
        db.refresh(job)
        process_video_task.delay(str(job.id))
        jobs_created.append(str(job.id))
        
    return {"message": f"Started {len(jobs_created)} jobs.", "job_ids": jobs_created}

from app.db.models import Prediction
from app.schemas.dashboard import DashboardMetrics


def _verdict_tally(assets) -> dict[str, int]:
    tally = {
        "approved": 0,
        "approved_with_caveats": 0,
        "review_required": 0,
        "rejected": 0,
    }
    for asset in assets:
        if asset.quality_verdict is not None:
            tally[asset.quality_verdict.value] += 1
    return tally


def _average(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 4) if values else None


@router.get("/{study_id}/quality-summary", response_model=StudyQualitySummary)
def get_study_quality_summary(
    study_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Aggregate persisted video and EEG quality without inventing scores."""
    get_owned_study(db, current_user, study_id)

    sessions_count = (
        db.query(DBSession)
        .join(Participant)
        .filter(Participant.study_id == study_id)
        .count()
    )
    videos = (
        db.query(VideoAsset)
        .join(DBSession)
        .join(Participant)
        .filter(Participant.study_id == study_id)
        .all()
    )
    eeg_assets = (
        db.query(EEGAsset)
        .join(DBSession)
        .join(Participant)
        .filter(Participant.study_id == study_id)
        .all()
    )

    video_valid_ratios: list[float] = []
    face_detection_rates: list[float] = []
    video_findings = 0
    for video in videos:
        report = video.quality_report or {}
        if report.get("validFrameRatio") is not None:
            video_valid_ratios.append(float(report["validFrameRatio"]))
        if report.get("faceDetectionRate") is not None:
            face_detection_rates.append(float(report["faceDetectionRate"]))
        findings = report.get("findings")
        if isinstance(findings, list):
            video_findings += len(findings)

    eeg_valid_ratios = [
        float(asset.valid_ratio)
        for asset in eeg_assets
        if asset.valid_ratio is not None
    ]
    eeg_findings = sum(
        len(asset.quality_findings)
        for asset in eeg_assets
        if isinstance(asset.quality_findings, list)
    )

    return StudyQualitySummary(
        study_id=study_id,
        sessions_count=sessions_count,
        video=ModalityQualitySummary(
            total_assets=len(videos),
            assessed_assets=sum(video.quality_verdict is not None for video in videos),
            average_valid_ratio=_average(video_valid_ratios),
            average_face_detection_rate=_average(face_detection_rates),
            findings_count=video_findings,
            verdicts=_verdict_tally(videos),
        ),
        eeg=ModalityQualitySummary(
            total_assets=len(eeg_assets),
            assessed_assets=sum(asset.quality_verdict is not None for asset in eeg_assets),
            average_valid_ratio=_average(eeg_valid_ratios),
            findings_count=eeg_findings,
            verdicts=_verdict_tally(eeg_assets),
        ),
    )


@router.get("/{study_id}/dashboard", response_model=DashboardMetrics)
def get_study_dashboard(
    study_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Study-level dashboard metrics. `average_learning_gain` is only
    meaningful when the study actually uses pre/post assessments — those are
    one optional data source among several (docs §3), never assumed. It is
    0.0 for studies that don't use them, not a fabricated placeholder."""
    study = get_owned_study(db, current_user, study_id)

    participants_count = db.query(Participant).filter(Participant.study_id == study_id).count()

    predictions = (
        db.query(Prediction)
        .join(VideoAsset, Prediction.video_asset_id == VideoAsset.id)
        .join(DBSession, VideoAsset.session_id == DBSession.id)
        .join(Participant, DBSession.participant_id == Participant.id)
        .filter(Participant.study_id == study_id)
        .all()
    )

    videos_processed = len(predictions)

    microactions_summary = {}
    for pred in predictions:
        if pred.summary and "actions" in pred.summary:
            actions_dict = pred.summary["actions"]
            for action_name, action_data in actions_dict.items():
                if action_name not in microactions_summary:
                    microactions_summary[action_name] = {"total_count": 0, "average_per_minute": 0.0}
                microactions_summary[action_name]["total_count"] += action_data.get("count", 0)

    # Real average learning gain from pre/post assessments where present.
    from app.services.report_service import calculate_learning_gain
    from app.db.models import LearningAssessment, AssessmentType

    gains = []
    for participant in study.participants:
        for session in participant.sessions:
            assessments = session.assessments
            pre = next((a for a in assessments if a.type == AssessmentType.pre_test), None)
            post = next((a for a in assessments if a.type == AssessmentType.post_test), None)
            gain = calculate_learning_gain(pre.score if pre else None, post.score if post else None)
            if gain is not None:
                gains.append(gain)
    average_learning_gain = sum(gains) / len(gains) if gains else 0.0

    return DashboardMetrics(
        total_participants=participants_count,
        total_videos_processed=videos_processed,
        average_learning_gain=round(average_learning_gain, 4),
        microactions_summary=microactions_summary
    )

from fastapi.responses import Response
import csv
import io

@router.get("/{study_id}/export")
def export_study_data(
    study_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Exports participant data and video results as CSV."""
    get_owned_study(db, current_user, study_id)
    participants = db.query(Participant).filter(Participant.study_id == study_id).all()
    
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Participant_Code", "Demographic", "Session_ID", "Condition", "Video_Filename", "Video_Verdict", "EEG_Verdict"])

    for p in participants:
        for s in p.sessions:
            # Session.video_asset / eeg_asset are singular (uselist=False).
            v = s.video_asset
            e = s.eeg_asset
            demo_str = str(p.demographic_group) if p.demographic_group else ""
            writer.writerow([
                p.external_code, demo_str, str(s.id), s.condition or "",
                v.filename if v else "",
                v.quality_verdict.value if (v and v.quality_verdict) else "",
                e.quality_verdict.value if (e and e.quality_verdict) else "",
            ])
                
    response = Response(content=output.getvalue())
    response.headers["Content-Disposition"] = f"attachment; filename=export_study_{study_id}.csv"
    response.headers["Content-Type"] = "text/csv"
    return response

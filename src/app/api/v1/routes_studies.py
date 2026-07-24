from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID

from app.schemas.study import StudyCreate, Study, StudyUpdate
from app.db.models import Study as StudyModel
from app.db.session import SessionLocal

router = APIRouter(prefix="/studies", tags=["studies"])

from app.api.deps import get_db

@router.get("/", response_model=List[Study])
def get_studies(db: Session = Depends(get_db)):
    return db.query(StudyModel).all()

@router.post("/", response_model=Study)
def create_study(study_in: StudyCreate, db: Session = Depends(get_db)):
    db_obj = StudyModel(**study_in.model_dump())
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

@router.get("/{study_id}", response_model=Study)
def get_study(study_id: UUID, db: Session = Depends(get_db)):
    db_obj = db.query(StudyModel).filter(StudyModel.id == study_id).first()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Study not found")
    return db_obj

@router.patch("/{study_id}", response_model=Study)
def update_study(study_id: UUID, study_in: StudyUpdate, db: Session = Depends(get_db)):
    db_obj = db.query(StudyModel).filter(StudyModel.id == study_id).first()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Study not found")
        
    update_data = study_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_obj, field, value)
        
    db.commit()
    db.refresh(db_obj)
    return db_obj

from app.db.models import Participant, Session as DBSession, VideoAsset, ProcessingJob, JobType
from app.workers.tasks_video import process_video_task

@router.post("/{study_id}/batch-infer")
def batch_infer(study_id: UUID, db: Session = Depends(get_db)):
    """Triggers inference for all unprocessed videos in a study."""
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

@router.get("/{study_id}/dashboard", response_model=DashboardMetrics)
def get_study_dashboard(study_id: UUID, db: Session = Depends(get_db)):
    """Study-level dashboard metrics. `average_learning_gain` is only
    meaningful when the study actually uses pre/post assessments — those are
    one optional data source among several (docs §3), never assumed. It is
    0.0 for studies that don't use them, not a fabricated placeholder."""
    study = db.query(StudyModel).filter(StudyModel.id == study_id).first()
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")

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
def export_study_data(study_id: UUID, db: Session = Depends(get_db)):
    """Exports participant data and video results as CSV."""
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

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta

from app.api.deps import get_db, get_current_user
from app.db.models import (
    User, Project, Study, Participant, Session as DBSession, ProcessingJob,
    VideoAsset, QualityVerdict,
)
from app.schemas.dashboard import (
    DashboardGlobal, DashboardKPIs, TimeSeriesPoint, MicroactionDistribution,
    RecentJob, RecentStudy,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/global", response_model=DashboardGlobal)
def get_dashboard_global(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Real aggregate KPIs for the organization (docs §16). Every number here
    is a live query — no placeholders. Sessions are counted through the actual
    Session → Participant → Study → Project chain (a session has no direct
    study_id; joining Session.participant_id == Study.id, as an earlier
    version did, silently produced zero/garbage rows)."""
    org_id = current_user.organization_id

    active_projects = db.query(Project).filter(Project.organization_id == org_id).count()
    ongoing_studies = (
        db.query(Study)
        .join(Project, Study.project_id == Project.id)
        .filter(Project.organization_id == org_id)
        .count()
    )
    total_sessions = (
        db.query(DBSession)
        .join(Participant, DBSession.participant_id == Participant.id)
        .join(Study, Participant.study_id == Study.id)
        .join(Project, Study.project_id == Project.id)
        .filter(Project.organization_id == org_id)
        .count()
    )
    videos_processed = (
        db.query(VideoAsset)
        .join(DBSession, VideoAsset.session_id == DBSession.id)
        .join(Participant, DBSession.participant_id == Participant.id)
        .join(Study, Participant.study_id == Study.id)
        .join(Project, Study.project_id == Project.id)
        .filter(Project.organization_id == org_id, VideoAsset.status == "processed")
        .count()
    )

    # Average quality: fraction of assessed videos verdicted approved / approved_with_caveats.
    assessed_videos = (
        db.query(VideoAsset.quality_verdict)
        .join(DBSession, VideoAsset.session_id == DBSession.id)
        .join(Participant, DBSession.participant_id == Participant.id)
        .join(Study, Participant.study_id == Study.id)
        .join(Project, Study.project_id == Project.id)
        .filter(Project.organization_id == org_id, VideoAsset.quality_verdict.isnot(None))
        .all()
    )
    good_verdicts = {QualityVerdict.approved, QualityVerdict.approved_with_caveats}
    average_quality = (
        sum(1 for (v,) in assessed_videos if v in good_verdicts) / len(assessed_videos)
        if assessed_videos else 0.0
    )

    failed_jobs = db.query(ProcessingJob).filter(ProcessingJob.status == "failed").count()

    kpis = DashboardKPIs(
        active_projects=active_projects,
        ongoing_studies=ongoing_studies,
        total_sessions=total_sessions,
        videos_processed=videos_processed,
        average_quality=round(average_quality, 3),
        failed_jobs=failed_jobs,
    )

    # Processing volume over the last 7 days (jobs started per day).
    since = datetime.utcnow() - timedelta(days=7)
    daily_counts = (
        db.query(func.date(ProcessingJob.started_at), func.count(ProcessingJob.id))
        .filter(ProcessingJob.started_at.isnot(None), ProcessingJob.started_at >= since)
        .group_by(func.date(ProcessingJob.started_at))
        .order_by(func.date(ProcessingJob.started_at))
        .all()
    )
    processing_time_series = [
        TimeSeriesPoint(date=str(day), value=count) for day, count in daily_counts
    ]

    # Micro-action distribution from real predictions, aggregated per study.
    from app.db.models import Prediction
    predictions = (
        db.query(Prediction, Study.name)
        .join(VideoAsset, Prediction.video_asset_id == VideoAsset.id)
        .join(DBSession, VideoAsset.session_id == DBSession.id)
        .join(Participant, DBSession.participant_id == Participant.id)
        .join(Study, Participant.study_id == Study.id)
        .join(Project, Study.project_id == Project.id)
        .filter(Project.organization_id == org_id)
        .all()
    )
    by_study: dict[str, dict[str, int]] = {}
    for pred, study_name in predictions:
        counts = by_study.setdefault(study_name, {
            "OLHO_FECHADO": 0, "OLHANDO_CANTO": 0, "MEXEU_LABIOS": 0, "VIROU_ROSTO": 0,
        })
        actions = (pred.summary or {}).get("actions", {})
        for action_name, action_data in actions.items():
            if action_name in counts:
                counts[action_name] += action_data.get("count", 0)
    microaction_distribution = [
        MicroactionDistribution(name=name, **counts) for name, counts in by_study.items()
    ]

    # Recent jobs (real, most recently started).
    recent_job_rows = (
        db.query(ProcessingJob, VideoAsset.filename, Study.name)
        .join(VideoAsset, ProcessingJob.video_asset_id == VideoAsset.id)
        .join(DBSession, VideoAsset.session_id == DBSession.id)
        .join(Participant, DBSession.participant_id == Participant.id)
        .join(Study, Participant.study_id == Study.id)
        .join(Project, Study.project_id == Project.id)
        .filter(Project.organization_id == org_id)
        .order_by(ProcessingJob.started_at.desc().nullslast())
        .limit(5)
        .all()
    )
    recent_jobs = [
        RecentJob(
            id=job.id,
            status=job.status.value if hasattr(job.status, "value") else str(job.status),
            progress=float(job.progress or 0),
            video_filename=filename,
            study_name=study_name,
            elapsed_seconds=int(((job.finished_at or datetime.utcnow()) - job.started_at).total_seconds()) if job.started_at else 0,
        )
        for job, filename, study_name in recent_job_rows
    ]

    # Recent studies with real participant/video counts and quality.
    recent_study_rows = (
        db.query(Study)
        .join(Project, Study.project_id == Project.id)
        .filter(Project.organization_id == org_id)
        .order_by(Study.created_at.desc())
        .limit(5)
        .all()
    )
    recent_studies = []
    for study in recent_study_rows:
        participant_count = db.query(Participant).filter(Participant.study_id == study.id).count()
        video_rows = (
            db.query(VideoAsset.quality_verdict)
            .join(DBSession, VideoAsset.session_id == DBSession.id)
            .join(Participant, DBSession.participant_id == Participant.id)
            .filter(Participant.study_id == study.id)
            .all()
        )
        assessed = [v for (v,) in video_rows if v is not None]
        study_quality = (
            sum(1 for v in assessed if v in good_verdicts) / len(assessed)
            if assessed else 0.0
        )
        recent_studies.append(RecentStudy(
            id=study.id,
            name=study.name,
            status=study.status.value if hasattr(study.status, "value") else str(study.status),
            participant_count=participant_count,
            video_count=len(video_rows),
            average_quality=round(study_quality, 3),
            created_at=study.created_at,
        ))

    return DashboardGlobal(
        kpis=kpis,
        processing_time_series=processing_time_series,
        microaction_distribution=microaction_distribution,
        recent_jobs=recent_jobs,
        recent_studies=recent_studies,
    )

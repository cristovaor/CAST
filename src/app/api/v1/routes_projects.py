from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from uuid import UUID

from app.schemas.project import ProjectCreate, Project, ProjectUpdate, ProjectDetail, ProjectResponsible
from app.db.models import (
    Project as ProjectModel, User, Study, Participant, Session as DBSession,
    VideoAsset, QualityVerdict, StudyStatus,
)
from app.api.deps import get_db, get_current_user

router = APIRouter(prefix="/projects", tags=["projects"])

_GOOD_VERDICTS = {QualityVerdict.approved, QualityVerdict.approved_with_caveats}


def _build_project_details(db: Session, projects: List[ProjectModel]) -> List[ProjectDetail]:
    """Builds project summaries with SQL aggregates instead of iterating lazy-
    loaded relationships in Python (avoids per-project N+1 fanout)."""
    if not projects:
        return []
    project_ids = [p.id for p in projects]

    # study_count per project
    study_counts = dict(
        db.query(Study.project_id, func.count(Study.id))
        .filter(Study.project_id.in_(project_ids))
        .group_by(Study.project_id)
        .all()
    )

    # session_count + last_activity + video_count per project, via one join chain.
    session_rows = (
        db.query(
            Study.project_id,
            func.count(DBSession.id),
            func.max(DBSession.created_at),
        )
        .join(Participant, Participant.study_id == Study.id)
        .join(DBSession, DBSession.participant_id == Participant.id)
        .filter(Study.project_id.in_(project_ids))
        .group_by(Study.project_id)
        .all()
    )
    session_counts = {pid: c for pid, c, _ in session_rows}
    last_activity = {pid: dt for pid, _, dt in session_rows}

    video_rows = (
        db.query(Study.project_id, func.count(VideoAsset.id), VideoAsset.quality_verdict)
        .join(Participant, Participant.study_id == Study.id)
        .join(DBSession, DBSession.participant_id == Participant.id)
        .join(VideoAsset, VideoAsset.session_id == DBSession.id)
        .filter(Study.project_id.in_(project_ids))
        .group_by(Study.project_id, VideoAsset.quality_verdict)
        .all()
    )
    video_counts: dict = {}
    quality_tally: dict = {}
    for pid, count, verdict in video_rows:
        video_counts[pid] = video_counts.get(pid, 0) + count
        if verdict is not None:
            good, total = quality_tally.get(pid, (0, 0))
            quality_tally[pid] = (good + (count if verdict in _GOOD_VERDICTS else 0), total + count)

    # A project's status reflects its most "active" study: any active study
    # makes the project active; else completed if all studies completed;
    # else draft/archived by majority.
    study_status_rows = (
        db.query(Study.project_id, Study.status, func.count(Study.id))
        .filter(Study.project_id.in_(project_ids))
        .group_by(Study.project_id, Study.status)
        .all()
    )
    statuses_by_project: dict = {}
    for pid, status, count in study_status_rows:
        statuses_by_project.setdefault(pid, {})[status] = count

    def _derive_status(pid) -> str:
        statuses = statuses_by_project.get(pid, {})
        if not statuses:
            return "draft"
        if StudyStatus.active in statuses:
            return "active"
        if statuses and all(s == StudyStatus.completed for s in statuses):
            return "completed"
        if statuses and all(s == StudyStatus.archived for s in statuses):
            return "archived"
        return "draft"

    results = []
    for p in projects:
        good, total = quality_tally.get(p.id, (0, 0))
        results.append(ProjectDetail(
            id=p.id,
            name=p.name,
            description=p.description,
            organization_id=p.organization_id,
            created_at=p.created_at,
            study_count=study_counts.get(p.id, 0),
            session_count=session_counts.get(p.id, 0),
            video_count=video_counts.get(p.id, 0),
            average_quality=round(good / total, 3) if total else 0.0,
            status=_derive_status(p.id),
            last_activity=last_activity.get(p.id) or p.created_at,
            responsible=[],  # no project↔user ownership model yet
        ))
    return results


@router.get("/", response_model=List[ProjectDetail])
def get_projects(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    projects = db.query(ProjectModel).filter(ProjectModel.organization_id == current_user.organization_id).all()
    return _build_project_details(db, projects)

@router.post("/", response_model=Project)
def create_project(project_in: ProjectCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Override organization_id with current user's org
    project_data = project_in.model_dump()
    project_data["organization_id"] = current_user.organization_id
    db_obj = ProjectModel(**project_data)
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

@router.get("/{project_id}", response_model=ProjectDetail)
def get_project(project_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db_obj = db.query(ProjectModel).filter(ProjectModel.id == project_id, ProjectModel.organization_id == current_user.organization_id).first()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Project not found")
    return _build_project_details(db, [db_obj])[0]

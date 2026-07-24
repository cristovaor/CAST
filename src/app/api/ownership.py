"""Tenant-aware entity lookups for API routes.

All helpers deliberately return 404 for records outside the caller's
organization. This avoids leaking whether an identifier exists in another
tenant while keeping route code concise and consistent.
"""

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Query, Session

from app.db.models import (
    AnnotationEvent,
    AnnotationTask,
    EEGAsset,
    Participant,
    ProcessingJob,
    Project,
    ResearchVariable,
    Session as SessionModel,
    Study,
    User,
    VideoAsset,
)


def _not_found(entity: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"{entity} not found",
    )


def studies_for_user(db: Session, user: User) -> Query:
    return (
        db.query(Study)
        .join(Project, Study.project_id == Project.id)
        .filter(Project.organization_id == user.organization_id)
    )


def participants_for_user(db: Session, user: User) -> Query:
    return (
        db.query(Participant)
        .join(Study, Participant.study_id == Study.id)
        .join(Project, Study.project_id == Project.id)
        .filter(Project.organization_id == user.organization_id)
    )


def sessions_for_user(db: Session, user: User) -> Query:
    return (
        db.query(SessionModel)
        .join(Participant, SessionModel.participant_id == Participant.id)
        .join(Study, Participant.study_id == Study.id)
        .join(Project, Study.project_id == Project.id)
        .filter(Project.organization_id == user.organization_id)
    )


def videos_for_user(db: Session, user: User) -> Query:
    return (
        db.query(VideoAsset)
        .join(SessionModel, VideoAsset.session_id == SessionModel.id)
        .join(Participant, SessionModel.participant_id == Participant.id)
        .join(Study, Participant.study_id == Study.id)
        .join(Project, Study.project_id == Project.id)
        .filter(Project.organization_id == user.organization_id)
    )


def eeg_assets_for_user(db: Session, user: User) -> Query:
    return (
        db.query(EEGAsset)
        .join(SessionModel, EEGAsset.session_id == SessionModel.id)
        .join(Participant, SessionModel.participant_id == Participant.id)
        .join(Study, Participant.study_id == Study.id)
        .join(Project, Study.project_id == Project.id)
        .filter(Project.organization_id == user.organization_id)
    )


def jobs_for_user(db: Session, user: User) -> Query:
    return (
        db.query(ProcessingJob)
        .join(VideoAsset, ProcessingJob.video_asset_id == VideoAsset.id)
        .join(SessionModel, VideoAsset.session_id == SessionModel.id)
        .join(Participant, SessionModel.participant_id == Participant.id)
        .join(Study, Participant.study_id == Study.id)
        .join(Project, Study.project_id == Project.id)
        .filter(Project.organization_id == user.organization_id)
    )


def annotation_tasks_for_user(db: Session, user: User) -> Query:
    return (
        db.query(AnnotationTask)
        .join(VideoAsset, AnnotationTask.video_asset_id == VideoAsset.id)
        .join(SessionModel, VideoAsset.session_id == SessionModel.id)
        .join(Participant, SessionModel.participant_id == Participant.id)
        .join(Study, Participant.study_id == Study.id)
        .join(Project, Study.project_id == Project.id)
        .filter(Project.organization_id == user.organization_id)
    )


def annotation_events_for_user(db: Session, user: User) -> Query:
    return (
        db.query(AnnotationEvent)
        .join(AnnotationTask, AnnotationEvent.task_id == AnnotationTask.id)
        .join(VideoAsset, AnnotationTask.video_asset_id == VideoAsset.id)
        .join(SessionModel, VideoAsset.session_id == SessionModel.id)
        .join(Participant, SessionModel.participant_id == Participant.id)
        .join(Study, Participant.study_id == Study.id)
        .join(Project, Study.project_id == Project.id)
        .filter(Project.organization_id == user.organization_id)
    )


def variables_for_user(db: Session, user: User) -> Query:
    return (
        db.query(ResearchVariable)
        .join(Study, ResearchVariable.study_id == Study.id)
        .join(Project, Study.project_id == Project.id)
        .filter(Project.organization_id == user.organization_id)
    )


def get_project(db: Session, user: User, entity_id: UUID) -> Project:
    entity = (
        db.query(Project)
        .filter(
            Project.id == entity_id,
            Project.organization_id == user.organization_id,
        )
        .first()
    )
    if entity is None:
        raise _not_found("Project")
    return entity


def get_study(db: Session, user: User, entity_id: UUID) -> Study:
    entity = studies_for_user(db, user).filter(Study.id == entity_id).first()
    if entity is None:
        raise _not_found("Study")
    return entity


def get_participant(db: Session, user: User, entity_id: UUID) -> Participant:
    entity = (
        participants_for_user(db, user)
        .filter(Participant.id == entity_id)
        .first()
    )
    if entity is None:
        raise _not_found("Participant")
    return entity


def get_session(db: Session, user: User, entity_id: UUID) -> SessionModel:
    entity = sessions_for_user(db, user).filter(SessionModel.id == entity_id).first()
    if entity is None:
        raise _not_found("Session")
    return entity


def get_video(db: Session, user: User, entity_id: UUID) -> VideoAsset:
    entity = videos_for_user(db, user).filter(VideoAsset.id == entity_id).first()
    if entity is None:
        raise _not_found("Video")
    return entity


def get_eeg(db: Session, user: User, entity_id: UUID) -> EEGAsset:
    entity = eeg_assets_for_user(db, user).filter(EEGAsset.id == entity_id).first()
    if entity is None:
        raise _not_found("EEG asset")
    return entity


def get_job(db: Session, user: User, entity_id: UUID) -> ProcessingJob:
    entity = jobs_for_user(db, user).filter(ProcessingJob.id == entity_id).first()
    if entity is None:
        raise _not_found("Processing job")
    return entity


def get_annotation_task(
    db: Session,
    user: User,
    entity_id: UUID,
) -> AnnotationTask:
    entity = (
        annotation_tasks_for_user(db, user)
        .filter(AnnotationTask.id == entity_id)
        .first()
    )
    if entity is None:
        raise _not_found("Annotation task")
    return entity


def get_annotation_event(
    db: Session,
    user: User,
    entity_id: UUID,
) -> AnnotationEvent:
    entity = (
        annotation_events_for_user(db, user)
        .filter(AnnotationEvent.id == entity_id)
        .first()
    )
    if entity is None:
        raise _not_found("Annotation event")
    return entity


def get_variable(
    db: Session,
    user: User,
    entity_id: UUID,
) -> ResearchVariable:
    entity = (
        variables_for_user(db, user)
        .filter(ResearchVariable.id == entity_id)
        .first()
    )
    if entity is None:
        raise _not_found("Variable")
    return entity

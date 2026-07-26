from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.api.ownership import get_study, get_study_group
from app.db.models import Participant, StudyGroup, User
from app.schemas.study_group import (
    StudyGroupCreate,
    StudyGroupDetail,
    StudyGroupUpdate,
)


router = APIRouter(prefix="/studies", tags=["study-groups"])


def _serialize(group: StudyGroup, db: Session) -> StudyGroupDetail:
    return StudyGroupDetail(
        id=group.id,
        study_id=group.study_id,
        code=group.code,
        name=group.name,
        role=group.role,
        description=group.description,
        participant_count=(
            db.query(Participant).filter(Participant.group_id == group.id).count()
        ),
        created_at=group.created_at,
    )


@router.get("/{study_id}/groups", response_model=list[StudyGroupDetail])
def list_study_groups(
    study_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_study(db, current_user, study_id)
    groups = (
        db.query(StudyGroup)
        .filter(StudyGroup.study_id == study_id)
        .order_by(StudyGroup.role, StudyGroup.name)
        .all()
    )
    return [_serialize(group, db) for group in groups]


@router.post(
    "/{study_id}/groups",
    response_model=StudyGroupDetail,
    status_code=status.HTTP_201_CREATED,
)
def create_study_group(
    study_id: UUID,
    payload: StudyGroupCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_study(db, current_user, study_id)
    group = StudyGroup(study_id=study_id, **payload.model_dump())
    db.add(group)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Group code already exists or the study already has a control group",
        ) from exc
    db.refresh(group)
    return _serialize(group, db)


@router.patch(
    "/{study_id}/groups/{group_id}",
    response_model=StudyGroupDetail,
)
def update_study_group(
    study_id: UUID,
    group_id: UUID,
    payload: StudyGroupUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    group = get_study_group(db, current_user, group_id)
    if group.study_id != study_id:
        raise HTTPException(status_code=404, detail="Study group not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(group, field, value)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Group code already exists or the study already has a control group",
        ) from exc
    db.refresh(group)
    return _serialize(group, db)


@router.put(
    "/{study_id}/groups/{group_id}/participants/{participant_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def assign_participant_group(
    study_id: UUID,
    group_id: UUID,
    participant_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    group = get_study_group(db, current_user, group_id)
    participant = (
        db.query(Participant)
        .filter(Participant.id == participant_id, Participant.study_id == study_id)
        .first()
    )
    if not participant or group.study_id != study_id:
        raise HTTPException(status_code=404, detail="Participant or group not found")
    participant.group_id = group.id
    db.commit()
    return None

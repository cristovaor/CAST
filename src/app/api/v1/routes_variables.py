"""Scientific variable registry (docs §14).

Variables are scoped to a study and distinguish roles (independent, dependent,
covariate, confounder, moderator, mediator, outcomes, exploratory) and origins
(raw/feature per modality, event, annotation, model output, statistic).
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID
from typing import List, Optional

from app.api.deps import get_current_user, get_db
from app.api.ownership import get_study, get_variable as get_owned_variable, variables_for_user
from app.db.models import ResearchVariable, User
from app.schemas.multimodal import VariableCreate, VariableDetail

router = APIRouter(prefix="/variables", tags=["variables"])


@router.get("/", response_model=List[VariableDetail])
def list_variables(
    study_id: Optional[UUID] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = variables_for_user(db, current_user)
    if study_id:
        get_study(db, current_user, study_id)
        q = q.filter(ResearchVariable.study_id == study_id)
    return q.order_by(ResearchVariable.created_at.desc()).all()


@router.post("/", response_model=VariableDetail, status_code=201)
def create_variable(
    payload: VariableCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_study(db, current_user, payload.study_id)
    var = ResearchVariable(**payload.model_dump())
    db.add(var)
    db.commit()
    db.refresh(var)
    return var


@router.get("/{variable_id}", response_model=VariableDetail)
def get_variable(
    variable_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_owned_variable(db, current_user, variable_id)


@router.patch("/{variable_id}", response_model=VariableDetail)
def update_variable(
    variable_id: UUID,
    payload: VariableCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    var = get_owned_variable(db, current_user, variable_id)
    get_study(db, current_user, payload.study_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(var, field, value)
    db.commit()
    db.refresh(var)
    return var


@router.delete("/{variable_id}", status_code=204)
def delete_variable(
    variable_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    var = get_owned_variable(db, current_user, variable_id)
    db.delete(var)
    db.commit()
    return None

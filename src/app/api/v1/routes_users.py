from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
from pydantic import BaseModel

from app.api.deps import get_db, get_current_user, require_admin
from app.db.models import User, Organization, UserRole
from app.schemas.user import User as UserSchema, UserCreate, UserUpdate
from app.core.security import get_password_hash
from app.db.models import AuditAction
from app.services.audit_service import build_changes, record_audit

router = APIRouter(prefix="/users", tags=["users"])

class UserInvite(BaseModel):
    email: str
    role: UserRole

@router.get("/", response_model=List[UserSchema])
def get_users(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    users = db.query(User).filter(User.organization_id == current_user.organization_id).all()
    return users


@router.post("/", response_model=UserSchema, status_code=status.HTTP_201_CREATED)
def create_user(
    user_in: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if db.query(User.id).filter(User.email == user_in.email).first():
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        email=user_in.email.strip().lower(),
        password_hash=get_password_hash(user_in.password),
        name=user_in.name.strip(),
        role=user_in.role,
        organization_id=current_user.organization_id,
    )
    db.add(user)
    db.flush()
    record_audit(
        db,
        current_user,
        AuditAction.create,
        "user",
        user.id,
        snapshot={"email": user.email, "name": user.name, "role": user.role},
    )
    db.commit()
    db.refresh(user)
    return user

@router.post("/invite", response_model=dict)
def invite_user(
    invite: UserInvite,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    # Mock invite process (sending email, etc.)
    return {"status": "success", "message": f"Invite sent to {invite.email} with role {invite.role.value}"}


@router.patch("/{user_id}", response_model=UserSchema)
def update_user(
    user_id: UUID,
    user_in: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user = db.query(User).filter(
        User.id == user_id,
        User.organization_id == current_user.organization_id,
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    update_data = user_in.model_dump(exclude_unset=True)
    if user.id == current_user.id and update_data.get("role") not in (None, current_user.role):
        raise HTTPException(status_code=400, detail="Cannot change your own role")

    changes = build_changes(user, update_data)
    for field, value in update_data.items():
        setattr(user, field, value)
    if changes:
        record_audit(db, current_user, AuditAction.update, "user", user.id, changes=changes)
    db.commit()
    db.refresh(user)
    return user

@router.delete("/{user_id}", status_code=204)
def delete_user(
    user_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id, User.organization_id == current_user.organization_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Do not allow deleting self for safety
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete current user")

    db.delete(user)
    db.commit()
    return None

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID
from pydantic import BaseModel

from app.api.deps import get_db, get_current_user
from app.db.models import User, Organization, UserRole
from app.schemas.user import User as UserSchema

router = APIRouter(prefix="/users", tags=["users"])

class UserInvite(BaseModel):
    email: str
    role: UserRole

@router.get("/", response_model=List[UserSchema])
def get_users(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    users = db.query(User).filter(User.organization_id == current_user.organization_id).all()
    return users

@router.post("/invite", response_model=dict)
def invite_user(invite: UserInvite, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Mock invite process (sending email, etc.)
    return {"status": "success", "message": f"Invite sent to {invite.email} with role {invite.role.value}"}

@router.delete("/{user_id}", status_code=204)
def delete_user(user_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user = db.query(User).filter(User.id == user_id, User.organization_id == current_user.organization_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Do not allow deleting self for safety
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete current user")

    db.delete(user)
    db.commit()
    return None

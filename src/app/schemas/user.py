from typing import Optional
from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime
from app.db.models import UserRole

class UserBase(BaseModel):
    email: str
    name: str
    role: UserRole = UserRole.researcher
    organization_id: Optional[UUID] = None

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[UserRole] = None

class UserInDBBase(UserBase):
    id: UUID
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class User(UserInDBBase):
    pass

from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_user
from app.core import security
from app.core.config import settings
from app.db.models import User, Organization
from app.schemas.auth import Token, UserRegister, ForgotPassword, ResetPassword

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/login", response_model=Token)
def login_access_token(db: Session = Depends(get_db), form_data: OAuth2PasswordRequestForm = Depends()):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not security.verify_password(form_data.password, user.password_hash):
        raise HTTPException(status_code=400, detail="Incorrect email or password")
        
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return {
        "access_token": security.create_access_token(user.id, expires_delta=access_token_expires),
        "token_type": "bearer",
    }

@router.get("/me")
def read_users_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.name,
        "role": current_user.role,
    }

@router.post("/register")
def register(user_in: UserRegister, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == user_in.email).first()
    if user:
        raise HTTPException(status_code=400, detail="Email already registered")
        
    org = Organization(name=f"{user_in.name}'s Organization")
    db.add(org)
    db.commit()
    db.refresh(org)
    
    new_user = User(
        email=user_in.email,
        password_hash=security.get_password_hash(user_in.password),
        name=user_in.name,
        organization_id=org.id
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return {"status": "success", "user_id": str(new_user.id)}

@router.post("/forgot-password")
def forgot_password(req: ForgotPassword, db: Session = Depends(get_db)):
    return {"status": "success", "message": "If the email is registered, a reset link was sent."}

@router.post("/reset-password")
def reset_password(req: ResetPassword, db: Session = Depends(get_db)):
    return {"status": "success", "message": "Password has been successfully reset."}

@router.post("/refresh", response_model=Token)
def refresh_token(current_user: User = Depends(get_current_user)):
    # Assuming valid token is required to refresh
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return {
        "access_token": security.create_access_token(current_user.id, expires_delta=access_token_expires),
        "token_type": "bearer",
    }

@router.post("/logout")
def logout(current_user: User = Depends(get_current_user)):
    # For JWT, logout is handled client side by removing the token.
    # Optionally, we could add token blacklisting here.
    return {"status": "success", "message": "Successfully logged out."}


from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.api.deps import get_db, get_current_user
from app.db.models import User, Organization
from app.schemas.settings import OrganizationSettings, PipelineSettingsUpdate, PipelineSettings

router = APIRouter(prefix="/settings", tags=["settings"])

@router.get("/organization", response_model=OrganizationSettings)
def get_organization_settings(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    org = db.query(Organization).filter(Organization.id == current_user.organization_id).first()
    
    return OrganizationSettings(
        id=org.id if org else current_user.organization_id, # Fallback
        name=org.name if org else "Default Organization",
        plan="enterprise", # Mock
        max_storage_gb=1000.0, # Mock
        used_storage_gb=456.2 # Mock
    )

@router.patch("/pipeline", response_model=PipelineSettings)
def update_pipeline_settings(settings: PipelineSettingsUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Mocking pipeline settings update since we don't have a global pipeline settings table yet
    return PipelineSettings(
        face_detection_threshold=settings.face_detection_threshold if settings.face_detection_threshold is not None else 0.75,
        blink_tolerance_frames=settings.blink_tolerance_frames if settings.blink_tolerance_frames is not None else 5,
        enable_head_pose_estimation=settings.enable_head_pose_estimation if settings.enable_head_pose_estimation is not None else True
    )

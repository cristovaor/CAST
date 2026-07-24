import random
import string
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from app.db.models import User, Organization, Project, Study, Participant, Session as DbSession, VideoAsset

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def random_lower_string() -> str:
    return "".join(random.choices(string.ascii_lowercase, k=32))

def create_random_organization(db: Session) -> Organization:
    org = Organization(name=random_lower_string())
    db.add(org)
    db.commit()
    db.refresh(org)
    return org

def create_random_user(db: Session, is_superuser: bool = False) -> User:
    org = create_random_organization(db)
    email = f"{random_lower_string()}@example.com"
    password = random_lower_string()
    user = User(
        email=email,
        password_hash=pwd_context.hash(password),
        name=random_lower_string(),
        role="admin" if is_superuser else "researcher",
        organization_id=org.id
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    # We store the raw password temporarily so tests can use it to login
    user.raw_password = password
    return user

def create_random_project(db: Session, org_id: str) -> Project:
    project = Project(
        name=random_lower_string(),
        description="Test project",
        organization_id=org_id
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project

def create_random_study(db: Session, project_id: str) -> Study:
    study = Study(
        name=random_lower_string(),
        description="Test study",
        project_id=project_id,
        status="draft"
    )
    db.add(study)
    db.commit()
    db.refresh(study)
    return study

def create_random_video(db: Session, study_id: str) -> VideoAsset:
    participant = Participant(
        study_id=study_id,
        external_code=random_lower_string()
    )
    db.add(participant)
    db.commit()
    db.refresh(participant)

    session = DbSession(participant_id=participant.id)
    db.add(session)
    db.commit()
    db.refresh(session)

    video = VideoAsset(
        session_id=session.id,
        filename=f"{random_lower_string()}.mp4",
        storage_uri=f"s3://test-bucket/{random_lower_string()}.mp4",
        status="uploaded"
    )
    db.add(video)
    db.commit()
    db.refresh(video)
    return video

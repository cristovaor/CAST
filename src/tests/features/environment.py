import os
import sys
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.dialects.postgresql import UUID, JSONB

# Ensure app is in path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))

from app.main import app
from app.db.base import Base
from app.api.deps import get_db
from tests.utils import create_random_user

@compiles(UUID, 'sqlite')
def compile_uuid(type_, compiler, **kw):
    return "VARCHAR"

@compiles(JSONB, 'sqlite')
def compile_jsonb(type_, compiler, **kw):
    return "TEXT"

# SQLite in-memory para testes
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def before_all(context):
    """Run before all tests."""
    pass

def before_scenario(context, scenario):
    """Run before each scenario."""
    # Create the database schema
    Base.metadata.create_all(bind=engine)
    context.db = TestingSessionLocal()
    
    # Override get_db dependency
    def override_get_db():
        try:
            yield context.db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    context.client = TestClient(app)
    
    # Store token headers if needed
    context.user_token_headers = None
    context.superuser_token_headers = None

    from unittest.mock import MagicMock
    from app.services.storage_service import storage_service
    storage_service.upload_bytes = MagicMock()
    storage_service.generate_presigned_upload_url = MagicMock(return_value="http://mock-url")
    mock_response = {'Body': MagicMock()}
    mock_response['Body'].read.return_value = b"timestamp_ms,alpha,beta\n0,1.0,2.0\n10,1.1,2.1"
    storage_service.s3 = MagicMock()
    storage_service.s3.get_object = MagicMock(return_value=mock_response)

    from unittest.mock import patch
    context.celery_patcher = patch('app.api.v1.routes_inference.process_video_task.delay', return_value=None)
    context.celery_patcher.start()

def after_scenario(context, scenario):
    """Run after each scenario."""
    if hasattr(context, 'celery_patcher'):
        context.celery_patcher.stop()
    context.db.close()
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.clear()

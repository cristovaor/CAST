import pytest
from typing import Generator
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db.base import Base
from app.api.deps import get_db
from app.core.security import create_access_token
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.dialects.postgresql import UUID, JSONB

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

@pytest.fixture(scope="function")
def db() -> Generator:
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="function")
def client(db) -> Generator:
    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()

@pytest.fixture(scope="function")
def normal_user_token_headers(client, db):
    from tests.utils import create_random_user
    user = create_random_user(db)
    access_token = create_access_token(user.id)
    headers = {"Authorization": f"Bearer {access_token}"}
    return headers

@pytest.fixture(scope="function")
def superuser_token_headers(client, db):
    from tests.utils import create_random_user
    user = create_random_user(db, is_superuser=True)
    access_token = create_access_token(user.id)
    headers = {"Authorization": f"Bearer {access_token}"}
    return headers

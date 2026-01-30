"""
Integration test fixtures. Overrides get_db for API tests with in-memory DB.
"""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


@pytest.fixture
def override_get_db():
    """Create in-memory engine and session factory for API tests."""
    from api.config import Base
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def _get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    return _get_db


@pytest.fixture
def api_client(override_get_db):
    """FastAPI TestClient with in-memory DB override."""
    from fastapi.testclient import TestClient
    from api.api import app
    from api.config import get_db
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture
def api_client_with_user(override_get_db):
    """API client with a test user in DB (for auth-protected routes)."""
    from api.models.models import User
    from api.utils.jwt import get_password_hash
    db_gen = override_get_db()
    db = next(db_gen)
    try:
        user = User(
            email="test@example.com",
            hashed_password=get_password_hash("testpass123"),
            preferences={"name": "Test User"},
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        yield db, user
    finally:
        db.close()

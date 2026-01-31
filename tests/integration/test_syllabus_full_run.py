"""
Integration test: syllabus run (stub) via SyllabusService stream.

Clean state: stub completes with empty modules. New design will be per-module, next-concept-on-completion.

Run: pytest tests/integration/test_syllabus_full_run.py -v -s -m integration
"""

import asyncio
import json
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from api.models.models import Base, Course, SyllabusRun, User
from api.utils.jwt import get_password_hash


def _ollama_available() -> bool:
    try:
        import httpx
        r = httpx.get("http://localhost:11434/api/tags", timeout=5.0)
        return r.status_code == 200
    except Exception:
        return False


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:", echo=False)
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture
def test_user(db_session):
    user = User(
        email="syllabus-test@example.com",
        hashed_password=get_password_hash("testpass123"),
        preferences={"name": "Test User"},
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def syllabus_course(db_session, test_user):
    course = Course(
        id="full-run-test-1",
        user_id=test_user.id,
        title="Introduction to Python",
        subject="Programming",
        goals="Learn Python basics and flow.",
        syllabus_draft=None,
    )
    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)
    return course


@pytest.mark.integration
@pytest.mark.asyncio
async def test_syllabus_run_stub_completes(db_session, test_user, syllabus_course):
    """Stub: run completes with empty modules (clean state for new per-module design)."""
    from api.services.syllabus_service import SyllabusService

    service = SyllabusService(db_session)
    run_id = service.start_run(syllabus_course.id, test_user.id)
    assert run_id

    events = []
    async for ev in service.stream_run(run_id, test_user.id):
        events.append(ev)
    assert len(events) > 0

    run = service.get_run(run_id, test_user.id)
    assert run is not None
    assert run.status == "completed"
    assert run.result is not None
    assert "modules" in run.result
    assert run.result["modules"] == []

    db_session.refresh(syllabus_course)
    assert syllabus_course.syllabus_draft is not None
    assert syllabus_course.syllabus_draft.get("modules") == []

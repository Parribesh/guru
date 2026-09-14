import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from api.api import app
from api.config import get_db
from api.models.models import Base, Course, SyllabusRun, User
from api.utils.auth import get_current_user
from api.utils.jwt import get_password_hash
from api.schemas.user_schemas import User as UserSchema


@pytest.fixture
def auth_client_and_course(override_get_db):
    from fastapi.testclient import TestClient
    from api.api import app
    from api.config import get_db

    db_gen = override_get_db()
    db = next(db_gen)
    try:
        user = User(
            email="test_syllabus@guru.com",
            hashed_password=get_password_hash("password123"),
            role="user",
            preferences={"llm_provider": "gemini", "gemini_model": "gemini-3.7-flash"},
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        course = Course(
            id="course-test-123",
            user_id=user.id,
            title="Intro to Agentic AI",
            subject="Computer Science",
            goals="Master autonomous multi-agent pipelines",
            syllabus_confirmed=True,
        )
        db.add(course)
        db.commit()
        db.refresh(course)
        course_id = course.id
        user_id = user.id
    finally:
        db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        login_res = test_client.post(
            "/auth/login",
            json={"email": "test_syllabus@guru.com", "password": "password123"},
        )
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        yield test_client, course_id, user_id
    app.dependency_overrides.clear()


def test_rerun_syllabus_success(auth_client_and_course, override_get_db):
    client, course_id, user_id = auth_client_and_course

    # Seed an existing run
    db_gen = override_get_db()
    db = next(db_gen)
    try:
        existing_run = SyllabusRun(
            id="existing-run-1",
            course_id=course_id,
            user_id=user_id,
            status="running",
            phase="generate_concepts",
        )
        db.add(existing_run)
        db.commit()
    finally:
        db.close()

    payload = {
        "provider": "gemini",
        "model": "gemini-3.7-flash",
        "agent": "TutorAgent",
    }
    response = client.post(f"/guru/courses/{course_id}/syllabus/rerun", json=payload)
    assert response.status_code == 200
    data = response.json()
    new_run_id = data["run_id"]
    assert new_run_id != "existing-run-1"

    # Verify previous run was archived/failed and course confirmed was reset to False
    db_gen2 = override_get_db()
    db2 = next(db_gen2)
    try:
        archived_run = db2.query(SyllabusRun).filter(SyllabusRun.id == "existing-run-1").first()
        assert archived_run.status == "archived"

        course = db2.query(Course).filter(Course.id == course_id).first()
        assert course.syllabus_confirmed is False

        # Verify new run was created with correct metadata in state_snapshot
        new_run = db2.query(SyllabusRun).filter(SyllabusRun.id == new_run_id).first()
        assert new_run is not None
        assert new_run.status == "running"
        assert new_run.state_snapshot.get("agent") == "TutorAgent"
        assert new_run.state_snapshot.get("provider") == "gemini"
        assert new_run.state_snapshot.get("inference_model") == "gemini-3.7-flash"
    finally:
        db2.close()


def test_rerun_syllabus_course_not_found(auth_client_and_course):
    client, _, _ = auth_client_and_course
    payload = {"provider": "gemini", "model": "gemini-3.7-flash", "agent": "TutorAgent"}
    response = client.post("/guru/courses/non-existent-course/syllabus/rerun", json=payload)
    assert response.status_code == 404


def test_auto_run_syllabus_endpoint(auth_client_and_course, override_get_db):
    client, course_id, user_id = auth_client_and_course

    db_gen = override_get_db()
    db = next(db_gen)
    try:
        run = SyllabusRun(
            id="run-auto-test",
            course_id=course_id,
            user_id=user_id,
            status="running",
            phase="planning",
            state_snapshot={"next_node": "planning", "modules": []},
        )
        db.add(run)
        db.commit()
    finally:
        db.close()

    mock_result = {
        "success": True,
        "run_id": "run-auto-test",
        "status": "completed",
        "stage": "finalized",
        "steps_executed": 12,
        "done": True,
        "modules_count": 3,
        "agent": "TutorAgent",
        "provider": "gemini",
        "inference_model": "gemini-3.7-flash",
        "state": {
            "modules": [
                {"title": "Module 1: Foundations", "objectives": ["Obj 1", "Obj 2"]},
                {"title": "Module 2: Intermediate", "objectives": ["Obj 3", "Obj 4"]},
            ]
        },
    }

    with patch("api.routes.syllabus_routes.SyllabusService.auto_run", new_callable=AsyncMock) as mock_auto:
        mock_auto.return_value = mock_result
        response = client.post("/guru/syllabus/runs/run-auto-test/auto-run?max_steps=30")
        assert response.status_code == 200
        data = response.json()
        assert data["run_id"] == "run-auto-test"
        assert data["done"] is True
        assert data["modules_count"] == 3
        assert data["steps_executed"] == 12
        assert data["agent"] == "TutorAgent"
        assert data["provider"] == "gemini"
        assert data["inference_model"] == "gemini-3.7-flash"

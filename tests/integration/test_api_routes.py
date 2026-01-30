"""
API integration tests using FastAPI TestClient with in-memory DB.
"""
import pytest
from fastapi.testclient import TestClient

from api.api import app
from api.config import get_db
from api.models.models import User
from api.utils.jwt import get_password_hash


@pytest.mark.integration
class TestHealthRoutes:
    """Health and root endpoints (no auth)."""

    def test_root_returns_healthy(self, api_client: TestClient):
        response = api_client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "Healthy" in data["message"] or "healthy" in data["message"].lower()

    def test_root_response_structure(self, api_client: TestClient):
        response = api_client.get("/")
        assert response.status_code == 200
        assert response.headers.get("content-type", "").startswith("application/json")


@pytest.mark.integration
class TestAuthRoutes:
    """Auth: register, login, logout."""

    def test_register_success(self, api_client: TestClient):
        response = api_client.post(
            "/auth/register",
            json={
                "email": "newuser@example.com",
                "password": "securepass123",
                "confirm_password": "securepass123",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert "message" in data

    def test_register_duplicate_fails(self, api_client: TestClient):
        api_client.post(
            "/auth/register",
            json={"email": "dup@example.com", "password": "pass123", "confirm_password": "pass123"},
        )
        response = api_client.post(
            "/auth/register",
            json={"email": "dup@example.com", "password": "other", "confirm_password": "other"},
        )
        assert response.status_code in (400, 422, 409)

    def test_login_success(self, api_client: TestClient, override_get_db):
        db_gen = override_get_db()
        db = next(db_gen)
        try:
            user = User(
                email="login@example.com",
                hashed_password=get_password_hash("mypass"),
                preferences=None,
            )
            db.add(user)
            db.commit()
        finally:
            db.close()

        response = api_client.post(
            "/auth/login",
            json={"email": "login@example.com", "password": "mypass"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "message" in data and data.get("token_set") is True

    def test_login_wrong_password_fails(self, api_client: TestClient, override_get_db):
        db_gen = override_get_db()
        db = next(db_gen)
        try:
            user = User(
                email="wrong@example.com",
                hashed_password=get_password_hash("correct"),
                preferences=None,
            )
            db.add(user)
            db.commit()
        finally:
            db.close()

        response = api_client.post(
            "/auth/login",
            json={"email": "wrong@example.com", "password": "wrong"},
        )
        assert response.status_code in (401, 422)

    def test_logout_returns_ok(self, api_client: TestClient):
        response = api_client.post("/auth/logout")
        assert response.status_code == 200


@pytest.mark.integration
class TestCourseRoutes:
    """Course endpoints (require auth except where noted)."""

    def test_list_courses_unauthorized_without_cookie(self, api_client: TestClient):
        response = api_client.get("/guru/courses")
        assert response.status_code in (401, 403, 422)

    def test_list_courses_with_auth(self, api_client: TestClient, override_get_db):
        db_gen = override_get_db()
        db = next(db_gen)
        try:
            user = User(
                email="courses@example.com",
                hashed_password=get_password_hash("pass"),
                preferences=None,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        finally:
            db.close()

        login = api_client.post(
            "/auth/login",
            json={"email": "courses@example.com", "password": "pass"},
        )
        assert login.status_code == 200
        cookies = login.cookies

        response = api_client.get("/guru/courses", cookies=cookies)
        assert response.status_code == 200
        data = response.json()
        assert "courses" in data
        assert isinstance(data["courses"], list)

    def test_create_course_with_auth(self, api_client: TestClient, override_get_db):
        db_gen = override_get_db()
        db = next(db_gen)
        try:
            user = User(
                email="create@example.com",
                hashed_password=get_password_hash("pass"),
                preferences=None,
            )
            db.add(user)
            db.commit()
        finally:
            db.close()

        login = api_client.post(
            "/auth/login",
            json={"email": "create@example.com", "password": "pass"},
        )
        assert login.status_code == 200
        cookies = login.cookies

        response = api_client.post(
            "/guru/courses",
            json={
                "title": "Test Course",
                "subject": "Testing",
                "goals": "Learn testing",
            },
            cookies=cookies,
        )
        assert response.status_code == 200
        data = response.json()
        assert "course_id" in data or "modules" in data

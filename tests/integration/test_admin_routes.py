"""
Integration tests for Admin CRUD endpoints (/guru/admin/*).
"""

import pytest
from fastapi.testclient import TestClient
from api.models.models import User, Course, Module
from api.utils.jwt import get_password_hash


@pytest.fixture
def admin_client(override_get_db):
    """Client authenticated as the default admin (paribesh@guru.com)."""
    from fastapi.testclient import TestClient
    from api.api import app
    from api.config import get_db

    db_gen = override_get_db()
    db = next(db_gen)
    try:
        admin_user = db.query(User).filter(User.email == "paribesh@guru.com").first()
        if not admin_user:
            admin_user = User(
                email="paribesh@guru.com",
                hashed_password=get_password_hash("password123"),
                role="admin",
                preferences={"theme": "dark"},
            )
            db.add(admin_user)
            db.commit()
    finally:
        db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as client:
        # Login to obtain auth cookie
        login_res = client.post(
            "/auth/login",
            json={"email": "paribesh@guru.com", "password": "password123"},
        )
        assert login_res.status_code == 200, f"Admin login failed: {login_res.text}"
        yield client
    app.dependency_overrides.clear()


@pytest.fixture
def regular_user_client(override_get_db):
    """Client authenticated as a non-admin regular user."""
    from fastapi.testclient import TestClient
    from api.api import app
    from api.config import get_db

    db_gen = override_get_db()
    db = next(db_gen)
    try:
        user = db.query(User).filter(User.email == "student@example.com").first()
        if not user:
            user = User(
                email="student@example.com",
                hashed_password=get_password_hash("pass12345"),
                role="user",
            )
            db.add(user)
            db.commit()
    finally:
        db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as client:
        login_res = client.post(
            "/auth/login",
            json={"email": "student@example.com", "password": "pass12345"},
        )
        assert login_res.status_code == 200
        yield client
    app.dependency_overrides.clear()


@pytest.mark.integration
class TestAdminPermissions:
    """Validate role-based security enforcement on /guru/admin routes."""

    def test_unauthenticated_access_denied(self, api_client: TestClient):
        res = api_client.get("/guru/admin/stats")
        assert res.status_code == 401

    def test_regular_user_access_forbidden(self, regular_user_client: TestClient):
        res = regular_user_client.get("/guru/admin/stats")
        assert res.status_code == 403
        assert "Admin privileges required" in res.text

    def test_admin_user_access_granted(self, admin_client: TestClient):
        res = admin_client.get("/guru/admin/stats")
        assert res.status_code == 200
        data = res.json()
        assert "total_courses" in data
        assert "active_gemini_model" in data
        assert data["system_status"] == "operational"


@pytest.mark.integration
class TestAdminAssetDirectory:
    """Validate endpoints catalog for frontend asset management."""

    def test_get_endpoints_directory(self, admin_client: TestClient):
        res = admin_client.get("/guru/admin/endpoints")
        assert res.status_code == 200
        data = res.json()
        assert "endpoints" in data
        endpoints = data["endpoints"]
        assert len(endpoints) > 0

        # Check course asset management presence
        categories = {e["category"] for e in endpoints}
        assert "Course Asset Management" in categories
        assert "Syllabus & Module Assets" in categories


@pytest.mark.integration
class TestAdminCourseAndSyllabusCRUD:
    """Validate Admin CRUD operations on courses, syllabi, and modules."""

    def test_full_course_lifecycle(self, admin_client: TestClient):
        # 1. Create course as admin
        create_res = admin_client.post(
            "/guru/admin/courses",
            json={
                "title": "Quantum Machine Learning",
                "subject": "Physics & AI",
                "goals": "Understand variational quantum circuits",
                "syllabus_confirmed": False,
            },
        )
        assert create_res.status_code == 200
        course = create_res.json()
        course_id = course["id"]
        assert course["title"] == "Quantum Machine Learning"

        # 2. List courses - verify it appears
        list_res = admin_client.get("/guru/admin/courses")
        assert list_res.status_code == 200
        courses = list_res.json()
        matching = [c for c in courses if c["id"] == course_id]
        assert len(matching) == 1
        assert matching[0]["user_email"] == "paribesh@guru.com"

        # 3. Update course metadata
        update_res = admin_client.put(
            f"/guru/admin/courses/{course_id}",
            json={"title": "Advanced Quantum ML", "syllabus_confirmed": True},
        )
        assert update_res.status_code == 200
        assert update_res.json()["title"] == "Advanced Quantum ML"
        assert update_res.json()["syllabus_confirmed"] is True

        # 4. Add module to course
        mod_res = admin_client.post(
            f"/guru/admin/courses/{course_id}/modules",
            json={
                "title": "Qubits and Quantum States",
                "objectives": ["Bra-ket notation", "Superposition"],
                "estimated_minutes": 45,
            },
        )
        assert mod_res.status_code == 200
        module = mod_res.json()
        module_id = module["id"]
        assert module["title"] == "Qubits and Quantum States"

        # 5. Update module
        mod_update = admin_client.put(
            f"/guru/admin/courses/{course_id}/modules/{module_id}",
            json={"estimated_minutes": 60},
        )
        assert mod_update.status_code == 200
        assert mod_update.json()["estimated_minutes"] == 60

        # 6. Override syllabus draft and sync modules
        syl_res = admin_client.put(
            f"/guru/admin/courses/{course_id}/syllabus",
            json={
                "syllabus_draft": [
                    {"title": "Synced Module 1", "objectives": ["Obj A"], "estimated_minutes": 30},
                    {"title": "Synced Module 2", "objectives": ["Obj B"], "estimated_minutes": 40},
                ],
                "sync_modules": True,
                "confirm": True,
            },
        )
        assert syl_res.status_code == 200
        syl_data = syl_res.json()
        assert len(syl_data["modules"]) == 2
        assert syl_data["modules"][0]["title"] == "Synced Module 1"

        # 7. Delete course
        del_res = admin_client.delete(f"/guru/admin/courses/{course_id}")
        assert del_res.status_code == 200

        # Verify not found
        get_res = admin_client.get(f"/guru/admin/courses/{course_id}")
        assert get_res.status_code == 404


@pytest.mark.integration
class TestAdminUserManagement:
    """Validate user listing and role updates."""

    def test_list_and_update_user_role(self, admin_client: TestClient, regular_user_client: TestClient):
        users_res = admin_client.get("/guru/admin/users")
        assert users_res.status_code == 200
        users = users_res.json()
        student = next(u for u in users if u["email"] == "student@example.com")
        assert student["role"] == "user"

        # Promote student to admin
        promote_res = admin_client.patch(
            f"/guru/admin/users/{student['id']}/role",
            json={"role": "admin"},
        )
        assert promote_res.status_code == 200
        assert promote_res.json()["role"] == "admin"
        assert promote_res.json()["is_admin"] is True

        # Demote student back to user
        demote_res = admin_client.patch(
            f"/guru/admin/users/{student['id']}/role",
            json={"role": "user"},
        )
        assert demote_res.status_code == 200
        assert demote_res.json()["role"] == "user"

    def test_cannot_demote_default_admin(self, admin_client: TestClient):
        users_res = admin_client.get("/guru/admin/users")
        admin = next(u for u in users_res.json() if u["email"] == "paribesh@guru.com")
        res = admin_client.patch(
            f"/guru/admin/users/{admin['id']}/role",
            json={"role": "user"},
        )
        assert res.status_code == 400
        assert "Cannot demote the default administrator" in res.text

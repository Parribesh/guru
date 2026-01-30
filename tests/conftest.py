"""
Pytest configuration and shared fixtures for the test suite.
Ensures proper Python path and provides common fixtures for unit and integration tests.
"""
import os
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Add project root and src to Python path for imports
project_root = Path(__file__).parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))
src_path = project_root / "src"
if str(src_path) not in sys.path:
    sys.path.insert(0, str(src_path))


# ----- In-memory DB (for tests that need DB without touching real DB) -----
@pytest.fixture
def in_memory_engine():
    """Create an in-memory SQLite engine for tests."""
    return create_engine("sqlite:///:memory:", echo=False)


@pytest.fixture
def db_session(in_memory_engine):
    """Create an in-memory database session. Uses api.models.Base for schema."""
    from api.models.models import Base
    Base.metadata.create_all(in_memory_engine)
    SessionLocal = sessionmaker(bind=in_memory_engine)
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture
def test_course(db_session):
    """Create a test course in the DB."""
    from api.models.models import Course
    course = Course(
        id="test-course-123",
        user_id=1,
        title="Machine Learning Fundamentals",
        subject="Machine Learning",
        goals="Learn core ML concepts and practical applications",
        syllabus_draft=None,
    )
    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)
    return course

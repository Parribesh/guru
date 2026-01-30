"""
Integration test: Stage 1 only — generate_syllabus returns concepts by level + 3 modules.

Requires Ollama. Run: pytest tests/integration/test_syllabus_stage1.py -v -m integration -s
"""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from api.models.models import Base, Course


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
def syllabus_course(db_session):
    course = Course(
        id="stage1-test-1",
        user_id=1,
        title="Introduction to Python",
        subject="Programming",
        goals="Learn Python basics.",
        syllabus_draft=None,
    )
    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)
    return course


@pytest.mark.integration
@pytest.mark.slow
@pytest.mark.asyncio
async def test_generate_syllabus_returns_concepts_and_three_modules(syllabus_course):
    """Stage 1: generate_syllabus returns concepts_by_level and 3 modules (Beginner, Intermediate, Advanced)."""
    if not _ollama_available():
        pytest.skip("Ollama not available")

    from api.bootstrap import build_registry
    from agents.syllabus_agent.agentic import generate_syllabus

    registry = build_registry()
    llm = registry.get("chat").llm
    result = await generate_syllabus(syllabus_course, llm=llm)

    assert result.concepts_by_level is not None
    assert hasattr(result.concepts_by_level, "beginner")
    assert hasattr(result.concepts_by_level, "intermediate")
    assert hasattr(result.concepts_by_level, "advanced")
    assert len(result.modules) == 3
    titles = [m["title"] for m in result.modules]
    assert "Beginner" in titles
    assert "Intermediate" in titles
    assert "Advanced" in titles
    for m in result.modules:
        assert "objectives" in m
        assert isinstance(m["objectives"], list)

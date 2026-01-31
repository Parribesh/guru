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


@pytest.fixture
def quantum_course(db_session, test_user):
    course = Course(
        id="qm-run-test-1",
        user_id=test_user.id,
        title="Introduction to Quantum Mechanics",
        subject="Quantum Mechanics",
        goals="Learn the foundations of quantum mechanics.",
        syllabus_draft=None,
    )
    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)
    return course


@pytest.mark.integration
@pytest.mark.asyncio
async def test_syllabus_run_graph_completes_with_three_modules(db_session, test_user, syllabus_course):
    """Graph: three nodes per level; run completes with 3 modules (objectives from LLM when available)."""
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
    modules = run.result["modules"]
    assert len(modules) == 3, "graph should produce 3 modules (beginner, intermediate, advanced)"

    for i, level in enumerate(("beginner", "intermediate", "advanced")):
        mod = modules[i]
        assert mod.get("title", "").lower() == level
        assert "objectives" in mod

    db_session.refresh(syllabus_course)
    assert syllabus_course.syllabus_draft is not None
    assert syllabus_course.syllabus_draft.get("modules") == modules

    # Print final syllabus state so you can see what was generated (use -s to see stdout)
    concepts_by_level = run.result.get("concepts_by_level") or {}
    final_state = {
        "modules": [
            {"title": m.get("title"), "objectives": m.get("objectives"), "estimated_minutes": m.get("estimated_minutes")}
            for m in modules
        ],
        "concepts_by_level": concepts_by_level,
    }
    print("\n--- Final syllabus state (run.result) ---")
    print(json.dumps(final_state, indent=2))


@pytest.mark.integration
@pytest.mark.asyncio
async def test_syllabus_step_run_verifies_state_with_prompts(db_session, test_user, syllabus_course):
    """
    Run syllabus step-by-step and print each step's state (stage, step_prompt, step_output)
    so we can verify what the agent received and generated.
    """
    from api.services.syllabus_service import SyllabusService

    service = SyllabusService(db_session)
    run_id = service.start_run(syllabus_course.id, test_user.id)
    assert run_id

    max_steps = 20
    step_num = 0
    results = []

    while step_num < max_steps:
        result = await service.step_run(run_id, test_user.id)
        if result is None:
            break
        step_num += 1
        stage = result["stage"]
        state = result["state"]
        done = result["done"]

        step_prompt = state.get("step_prompt")
        step_output = state.get("step_output")
        current_level = state.get("current_level")
        current_concepts = state.get("current_concepts") or []
        meets_threshold = state.get("meets_threshold")
        needed_count = state.get("needed_count")

        entry = {
            "step": step_num,
            "stage": stage,
            "done": done,
            "current_level": current_level,
            "current_concepts_count": len(current_concepts),
            "meets_threshold": meets_threshold,
            "needed_count": needed_count,
            "step_prompt_preview": (step_prompt[:400] + "..." if step_prompt and len(step_prompt) > 400 else step_prompt),
            "step_output": step_output,
        }
        results.append(entry)

        print(f"\n--- Step {step_num}: {stage} (done={done}) ---")
        print(f"  current_level: {current_level}")
        print(f"  current_concepts: {len(current_concepts)} -> {current_concepts[:8]}{'...' if len(current_concepts) > 8 else ''}")
        print(f"  meets_threshold: {meets_threshold}, needed_count: {needed_count}")
        if step_prompt:
            print(f"  step_prompt (first 600 chars):\n    {repr(step_prompt[:600])}")
        else:
            print("  step_prompt: (none)")
        if step_output:
            print(f"  step_output: {step_output}")
        else:
            print("  step_output: (none)")

        if done:
            break

    print("\n--- Execution summary ---")
    print(json.dumps([{k: v for k, v in r.items() if k != "step_prompt_preview"} for r in results], indent=2))
    if results:
        last = results[-1]
        assert "stage" in last
        assert last.get("step_output") is not None or last.get("stage") in ("add_module", "validate"), (
            "step_output should be set for LLM steps"
        )
    if step_num > 0:
        first_with_prompt = next((r for r in results if r.get("step_prompt_preview")), None)
        assert first_with_prompt is not None, "at least one step (generate_concepts or add_concepts) should have step_prompt"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_syllabus_quantum_mechanics_concepts(db_session, test_user, quantum_course):
    """
    Generate syllabus for "Introduction to Quantum Mechanics" and print concepts per module.
    """
    from api.services.syllabus_service import SyllabusService

    service = SyllabusService(db_session)
    run_id = service.start_run(quantum_course.id, test_user.id)
    assert run_id

    max_steps = 25
    step_num = 0
    while step_num < max_steps:
        result = await service.step_run(run_id, test_user.id)
        if result is None:
            break
        step_num += 1
        if result["done"]:
            break

    run = service.get_run(run_id, test_user.id)
    assert run is not None
    assert run.status == "completed"
    result = run.result or {}
    modules = result.get("modules") or []
    concepts_by_level = result.get("concepts_by_level") or {}

    print("\n--- Introduction to Quantum Mechanics: generated concepts per module ---")
    for i, mod in enumerate(modules):
        title = mod.get("title", "?")
        objectives = mod.get("objectives") or []
        print(f"\n{title} ({len(objectives)} concepts):")
        for j, obj in enumerate(objectives, 1):
            print(f"  {j}. {obj}")
    print("\n--- concepts_by_level ---")
    print(json.dumps(concepts_by_level, indent=2))

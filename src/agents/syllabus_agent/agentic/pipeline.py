"""
Syllabus pipeline: Stage 1 only — concepts by level (beginner / intermediate / advanced).

Flow: ConceptGenerator -> ConceptListByLevel.
Result: concepts_by_level + modules (3 modules: Beginner, Intermediate, Advanced) for syllabus_draft.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, Optional

from api.models.models import Course

from agents.syllabus_agent.agentic.schemas import (
    ConceptListByLevel,
    SyllabusPipelineInput,
    SyllabusPipelineResult,
)
from agents.syllabus_agent.agentic.stages import ConceptGenerator


async def generate_syllabus(
    course: Course,
    target_level: str = "beginner",
    time_budget: Optional[int] = None,
    llm: Any = None,
    event_callback: Optional[Callable[[str, Dict[str, Any]], None]] = None,
) -> SyllabusPipelineResult:
    """
    Generate syllabus: concepts by level (Stage 1 only).
    Returns concepts_by_level + 3 modules (Beginner, Intermediate, Advanced) for syllabus_draft.
    """
    if llm is None:
        from api.bootstrap import build_registry
        registry = build_registry()
        llm = registry.get("chat").llm

    emit = event_callback or (lambda _t, _d: None)

    input_data = SyllabusPipelineInput(
        course_title=course.title,
        subject=course.subject,
        goals=course.goals,
        target_level=target_level,
        time_budget_minutes=time_budget,
    )

    emit("stage_start", {"stage": "concepts"})
    gen = ConceptGenerator(llm=llm)
    concepts = await gen.run(
        course_title=input_data.course_title,
        subject=input_data.subject,
        goals=input_data.goals,
    )
    total = len(concepts.beginner) + len(concepts.intermediate) + len(concepts.advanced)
    emit("stage_complete", {"stage": "concepts", "concepts_count": total})

    modules = _concepts_to_draft_modules(concepts)
    return SyllabusPipelineResult(concepts_by_level=concepts, modules=modules)


def _concepts_to_draft_modules(concepts: ConceptListByLevel) -> list:
    """Map ConceptListByLevel to 3 draft modules: Beginner, Intermediate, Advanced."""
    return [
        {"title": "Beginner", "objectives": concepts.beginner, "estimated_minutes": 60},
        {"title": "Intermediate", "objectives": concepts.intermediate, "estimated_minutes": 90},
        {"title": "Advanced", "objectives": concepts.advanced, "estimated_minutes": 120},
    ]

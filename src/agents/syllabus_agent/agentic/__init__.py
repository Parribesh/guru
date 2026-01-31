"""
Syllabus agentic: clean state. No full-course pipeline.

New design: per-module path; LLM suggests next concept when user completes one.
Stub generate_syllabus returns empty result so existing callers don't break.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, Optional

from agents.syllabus_agent.agentic.schemas import (
    ConceptListByLevel,
    SyllabusPipelineInput,
    SyllabusPipelineResult,
)


async def generate_syllabus(
    course: Any,
    target_level: str = "beginner",
    time_budget: Optional[int] = None,
    llm: Any = None,
    event_callback: Optional[Callable[[str, Dict[str, Any]], None]] = None,
) -> SyllabusPipelineResult:
    """Stub: returns empty concepts and modules. New design will be per-module, next-concept-on-completion."""
    _ = course
    _ = target_level
    _ = time_budget
    _ = llm
    _ = event_callback
    return SyllabusPipelineResult(
        concepts_by_level=ConceptListByLevel(beginner=[], intermediate=[], advanced=[]),
        modules=[],
    )


__all__ = [
    "generate_syllabus",
    "ConceptListByLevel",
    "SyllabusPipelineInput",
    "SyllabusPipelineResult",
]

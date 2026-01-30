"""
ConceptGenerator: Stage 1 — get concepts by level (beginner / intermediate / advanced).

Single responsibility: course_title + subject + goals -> ConceptListByLevel.
Minimal prompt; LLM decides how many concepts per level.
"""

from __future__ import annotations

import asyncio
from typing import Any, Optional

from agents.syllabus_agent.agentic.schemas import ConceptListByLevel


def _build_prompt(course_title: str, subject: str, goals: Optional[str] = None) -> str:
    goals_line = f"\nGoals: {goals}" if goals else ""
    return (
        f"Course: {course_title}. Subject: {subject}.{goals_line}\n"
        "List all key concepts needed to pass each difficulty level. "
        "Beginner: all concepts to reach beginner. Intermediate: all to reach intermediate. Advanced: all to reach advanced. "
        "Short concept names only."
    )


class ConceptGenerator:
    """Stage 1: Produce concepts by level (beginner, intermediate, advanced)."""

    def __init__(self, llm: Any, *, model_timeout: float = 120.0) -> None:
        self._llm = llm
        self._timeout = model_timeout

    async def run(
        self,
        course_title: str,
        subject: str,
        goals: Optional[str] = None,
    ) -> ConceptListByLevel:
        """Generate concepts by level. Uses LLM with ConceptListByLevel schema."""
        prompt = _build_prompt(course_title, subject, goals)
        result = await asyncio.wait_for(
            self._llm.generate_structured(prompt, ConceptListByLevel, timeout=self._timeout),
            timeout=self._timeout + 10,
        )
        return result

"""
Pydantic schemas for the syllabus pipeline.

Stage 1 only: concepts by level (beginner / intermediate / advanced).
Pipeline I/O: SyllabusPipelineInput, SyllabusPipelineResult.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ConceptListByLevel(BaseModel):
    """Concepts grouped by difficulty; LLM decides how many per level."""
    beginner: List[str] = Field(description="All concept names required to pass beginner level")
    intermediate: List[str] = Field(description="All concept names required to pass intermediate level")
    advanced: List[str] = Field(description="All concept names required to pass advanced level")


class SyllabusPipelineInput(BaseModel):
    """Input to generate_syllabus (maps from Course + params)."""
    course_title: str
    subject: str
    goals: Optional[str] = None
    target_level: str = Field(default="beginner", description="beginner|intermediate|advanced")
    time_budget_minutes: Optional[int] = Field(default=None, description="Total course time cap")


class SyllabusPipelineResult(BaseModel):
    """Output: concepts by level + modules (3 modules: Beginner, Intermediate, Advanced) for syllabus_draft."""
    concepts_by_level: ConceptListByLevel = Field(description="Concepts per difficulty level")
    modules: List[Dict[str, Any]] = Field(
        description="Ready for syllabus_draft: title, objectives (concept names), estimated_minutes"
    )

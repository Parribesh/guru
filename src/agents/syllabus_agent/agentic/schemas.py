"""
Pydantic schemas for the syllabus pipeline.

Concepts: one level at a time (LevelConceptsList). Pipeline I/O: SyllabusPipelineInput, SyllabusPipelineResult.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class LevelConceptsList(BaseModel):
    """Concepts for one level only. Must have at least 6, at most 7 items."""
    concepts: List[str] = Field(
        description="Exactly 6 or 7 concept names for this level only, in learning order. Minimum 6, maximum 7. Short names only."
    )


class ConceptListByLevel(BaseModel):
    """Concepts grouped by level (beginner / intermediate / advanced). Filled one level at a time."""
    beginner: List[str] = Field(description="Concepts for beginner module")
    intermediate: List[str] = Field(description="Concepts for intermediate module")
    advanced: List[str] = Field(description="Concepts for advanced module")


class SyllabusPipelineInput(BaseModel):
    """Input to generate_syllabus (maps from Course + params)."""
    course_title: str
    subject: str
    goals: Optional[str] = None
    target_level: str = Field(default="beginner", description="beginner|intermediate|advanced")
    time_budget_minutes: Optional[int] = Field(default=None, description="Total course time cap")


class DependencyEntry(BaseModel):
    """One concept and its prerequisites (for DAG per module)."""
    concept: str = Field(description="Concept name")
    prerequisites: List[str] = Field(default_factory=list, description="Concept names that must be learned first")


class DependencyTreeResponse(BaseModel):
    """LLM response: dependency tree for one level (list of concept -> prerequisites)."""
    dependencies: List[DependencyEntry] = Field(description="Each concept with its prerequisites from the same level")


class SyllabusPipelineResult(BaseModel):
    """Output: concepts by level + modules (3 modules: Beginner, Intermediate, Advanced) for syllabus_draft."""
    concepts_by_level: ConceptListByLevel = Field(description="Concepts per difficulty level")
    modules: List[Dict[str, Any]] = Field(
        description="Ready for syllabus_draft: title, objectives (concept names in order), estimated_minutes"
    )

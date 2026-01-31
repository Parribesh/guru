"""
Pydantic schemas for the syllabus pipeline.

SyllabusState: single state object passed through every graph node (initial → final).
Concepts: one level at a time (LevelConceptsList). Pipeline I/O: SyllabusPipelineInput, SyllabusPipelineResult.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

# Module levels; order = progression order.
MODULE_LEVELS = ("beginner", "intermediate", "advanced")


def _empty_concepts_by_level() -> Dict[str, List[str]]:
    return {level: [] for level in MODULE_LEVELS}


class SyllabusState(BaseModel):
    """
    Single syllabus state passed through every graph node.
    Start with create_initial(); each node reads and updates this state; end state is the final syllabus.
    """
    course_title: str = ""
    subject: str = ""
    goals: Optional[str] = None
    target_level: str = Field(default="beginner", description="beginner|intermediate|advanced")
    time_budget_minutes: Optional[int] = None
    modules: List[Dict[str, Any]] = Field(default_factory=list)
    concepts_by_level: Dict[str, List[str]] = Field(default_factory=_empty_concepts_by_level)
    current_stage: str = ""
    error: Optional[str] = None

    @classmethod
    def create_initial(
        cls,
        course_title: str = "",
        subject: str = "",
        goals: Optional[str] = None,
        target_level: str = "beginner",
        time_budget_minutes: Optional[int] = None,
    ) -> "SyllabusState":
        """Create the initial syllabus state (empty modules, empty concepts_by_level) for the graph."""
        return cls(
            course_title=course_title,
            subject=subject,
            goals=goals,
            target_level=target_level,
            time_budget_minutes=time_budget_minutes,
            modules=[],
            concepts_by_level=_empty_concepts_by_level(),
            current_stage="",
            error=None,
        )

    def to_serializable(self) -> Dict[str, Any]:
        """JSON-serializable dict for events/API."""
        return self.model_dump()


class ConceptsList(BaseModel):
    """Structured output: concepts for one module level only; 6–10 items, no duplicate of forbidden list."""
    concepts: List[str] = Field(
        description="6–10 concept names for this module only, easy to hard. Must not repeat any concept from the prompt's forbidden list."
    )

class LevelConceptsList(BaseModel):
    """Concepts for one level only. Must have at least 6, at most 7 items."""
    concepts: List[str] = Field(
        description="Exactly 6 or 7 concept names for this level only, in learning order. Minimum 6, maximum 7. Short names only."
    )


class AdditionalConceptsList(BaseModel):
    """Structured output: extra concepts for this module; no duplicate of current or forbidden list."""
    concepts: List[str] = Field(
        description="New concept names only; do not repeat current or forbidden concepts. Order: easy to hard."
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

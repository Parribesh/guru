"""
Pydantic schemas for structured syllabus generation output.
"""

from pydantic import BaseModel, Field, field_validator
from typing import List, Optional


class SyllabusModule(BaseModel):
    """A single module in the syllabus."""
    title: str = Field(description="Module title")
    objectives: List[str] = Field(description="List of learning objectives (3-6 per module)")
    estimated_minutes: int = Field(description="Estimated minutes to complete (30-120)")


# DEPRECATED: SyllabusGenerationOutput removed - using sequential generation instead
# Old monolithic approach tried to generate all modules in one call, which violated token constraints


class SyllabusCriticOutput(BaseModel):
    """Structured output for syllabus critic evaluation."""
    approved: bool = Field(description="Whether the syllabus is approved")
    issues: List[str] = Field(default_factory=list, description="List of issues found (empty if approved)")
    revised_modules: List[SyllabusModule] = Field(
        default_factory=list,
        description="Revised modules if not approved (6-10 modules, empty if approved)"
    )


class CurriculumPlanOutput(BaseModel):
    """Structured output for curriculum planning phase."""
    total_modules: int = Field(description="Total number of modules (6-10)")
    learning_path: List[str] = Field(description="Module titles in learning order")
    core_concepts: List[str] = Field(description="Core concepts that must be covered")
    progression_strategy: str = Field(description="How concepts build on each other")
    time_distribution: dict = Field(description="Estimated time per module (module title -> minutes)")
    difficulty_curve: str = Field(description="How difficulty progresses through modules")


class SyllabusOutlineOutput(BaseModel):
    """Structured output for syllabus outline (just titles)."""
    module_titles: List[str] = Field(
        description="List of 6-10 module titles in learning order (beginner to advanced)",
        min_length=6,
        max_length=10
    )


class SingleModuleOutput(BaseModel):
    """Structured output for generating a single module."""
    module: SyllabusModule = Field(description="Complete module specification")


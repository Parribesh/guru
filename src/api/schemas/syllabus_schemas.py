"""
Pydantic schemas for syllabus (draft modules shape).
"""

from pydantic import BaseModel, Field
from typing import List


class SyllabusModule(BaseModel):
    """A single module in the syllabus draft (e.g. Beginner, Intermediate, Advanced)."""
    title: str = Field(description="Module title")
    objectives: List[str] = Field(description="List of concept names / learning objectives")
    estimated_minutes: int = Field(description="Estimated minutes to complete (30-120)")

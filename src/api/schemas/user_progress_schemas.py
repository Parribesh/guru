"""
User learning progress schemas (profile progress card and learning session context).
"""

from pydantic import BaseModel
from typing import Optional


class UserProgressModule(BaseModel):
    """Per-module learning state for user progress card and learning session context."""
    module_id: str
    title: str
    order_index: int
    passed: bool
    best_score: float
    attempts_count: int
    passed_at: Optional[str] = None  # ISO when passed
    updated_at: Optional[str] = None  # ISO last progress update


class UserProgressCourse(BaseModel):
    """Per-course learning state: course + modules with progress."""
    course_id: str
    course_title: str
    subject: str
    modules: list[UserProgressModule]


class UserProgressResponse(BaseModel):
    """User learning state across all courses. Used by profile progress card and learning sessions."""
    courses: list[UserProgressCourse]

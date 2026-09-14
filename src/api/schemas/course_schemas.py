"""
Course and module schemas.
"""

from pydantic import BaseModel
from typing import Optional


class CreateCourseRequest(BaseModel):
    title: str
    subject: str
    goals: Optional[str] = None


class CourseResponse(BaseModel):
    id: str
    title: str
    subject: str
    goals: Optional[str] = None
    syllabus_confirmed: bool
    created_at: str


class CourseListResponse(BaseModel):
    courses: list[CourseResponse]


class SyllabusDraftModule(BaseModel):
    title: str
    objectives: list[str]
    estimated_minutes: Optional[int] = None


class SyllabusDraftResponse(BaseModel):
    course_id: str
    modules: list[SyllabusDraftModule]


class ConfirmSyllabusResponse(BaseModel):
    course_id: str
    module_ids: list[str]


class ResetSyllabusResponse(BaseModel):
    course_id: str
    reset: bool


class ModuleResponse(BaseModel):
    id: str
    course_id: str
    title: str
    order_index: int
    objectives: list[str]
    estimated_minutes: Optional[int] = None
    created_at: str
    passed: bool
    best_score: float
    attempts_count: int
    completed_objectives: list[int] = []  # indices of completed objectives (0-based)
    next_objective_index: Optional[int] = None  # next to learn, or None if all done / module passed


class CourseModulesResponse(BaseModel):
    course: CourseResponse
    modules: list[ModuleResponse]

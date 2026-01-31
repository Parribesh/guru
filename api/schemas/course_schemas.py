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


class CourseModulesResponse(BaseModel):
    course: CourseResponse
    modules: list[ModuleResponse]

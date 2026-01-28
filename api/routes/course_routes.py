"""
Course management endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from api.config import get_db
from api.models.models import Course, Module, ModuleProgress
from api.schemas.guru_schemas import (
    CourseListResponse,
    CourseResponse,
    CreateCourseRequest,
    SyllabusDraftResponse,
    ConfirmSyllabusResponse,
    CourseModulesResponse,
    ModuleResponse,
)
from api.schemas.user_schemas import User
from api.utils.auth import get_current_user
from api.utils.common import get_db_user_id, iso_format
from datetime import datetime
from uuid import uuid4

course_routes = APIRouter()


@course_routes.get("/courses", response_model=CourseListResponse)
async def list_courses(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> CourseListResponse:
    """List all courses for the current user."""
    assert current_user is not None
    user_id = get_db_user_id(current_user.email, db)
    courses = db.query(Course).filter(Course.user_id == user_id).order_by(Course.created_at.desc()).all()
    return CourseListResponse(
        courses=[
            CourseResponse(
                id=c.id,
                title=c.title,
                subject=c.subject,
                goals=c.goals,
                syllabus_confirmed=bool(c.syllabus_confirmed),
                created_at=iso_format(c.created_at),
            )
            for c in courses
        ]
    )


@course_routes.post("/courses", response_model=SyllabusDraftResponse)
async def create_course(
    req: CreateCourseRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> SyllabusDraftResponse:
    """Create a new course. Syllabus generation is done via the streamed syllabus run endpoint."""
    assert current_user is not None
    user_id = get_db_user_id(current_user.email, db)

    course_id = str(uuid4())
    course = Course(
        id=course_id,
        user_id=user_id,
        title=req.title,
        subject=req.subject,
        goals=req.goals,
        syllabus_confirmed=False,
    )
    course.syllabus_draft = {"modules": []}
    db.add(course)
    db.commit()

    return SyllabusDraftResponse(course_id=course_id, modules=[])


@course_routes.post("/courses/{course_id}/syllabus/confirm", response_model=ConfirmSyllabusResponse)
async def confirm_syllabus(
    course_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> ConfirmSyllabusResponse:
    """Confirm and create modules from syllabus draft."""
    assert current_user is not None
    user_id = get_db_user_id(current_user.email, db)
    course = db.query(Course).filter(Course.id == course_id, Course.user_id == user_id).first()
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")
    if course.syllabus_confirmed:
        existing = db.query(Module).filter(Module.course_id == course_id).order_by(Module.order_index.asc()).all()
        return ConfirmSyllabusResponse(course_id=course_id, module_ids=[m.id for m in existing])

    draft = (course.syllabus_draft or {}).get("modules") if isinstance(course.syllabus_draft, dict) else None
    if not isinstance(draft, list) or not draft:
        raise HTTPException(status_code=400, detail="No syllabus draft to confirm")

    module_ids: list[str] = []
    for idx, m in enumerate(draft, start=1):
        if not isinstance(m, dict):
            continue
        title = m.get("title")
        objectives = m.get("objectives")
        est = m.get("estimated_minutes")
        if not (isinstance(title, str) and isinstance(objectives, list) and all(isinstance(x, str) for x in objectives)):
            continue
        mid = str(uuid4())
        module_ids.append(mid)
        db.add(
            Module(
                id=mid,
                course_id=course_id,
                title=title,
                order_index=idx,
                objectives=objectives,
                estimated_minutes=int(est) if isinstance(est, (int, float)) else None,
            )
        )
        db.add(
            ModuleProgress(
                id=str(uuid4()),
                user_id=user_id,
                module_id=mid,
                best_score=0.0,
                attempts_count=0,
                passed=False,
                updated_at=datetime.utcnow(),
            )
        )

    course.syllabus_confirmed = True
    db.add(course)
    db.commit()
    return ConfirmSyllabusResponse(course_id=course_id, module_ids=module_ids)


@course_routes.get("/courses/{course_id}", response_model=CourseModulesResponse)
async def get_course(
    course_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> CourseModulesResponse:
    """Get course details with modules."""
    assert current_user is not None
    user_id = get_db_user_id(current_user.email, db)
    course = db.query(Course).filter(Course.id == course_id, Course.user_id == user_id).first()
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")
    modules = db.query(Module).filter(Module.course_id == course_id).order_by(Module.order_index.asc()).all()
    prog_by_mid = {p.module_id: p for p in db.query(ModuleProgress).filter(ModuleProgress.user_id == user_id).all()}
    return CourseModulesResponse(
        course=CourseResponse(
            id=course.id,
            title=course.title,
            subject=course.subject,
            goals=course.goals,
            syllabus_confirmed=bool(course.syllabus_confirmed),
            created_at=iso_format(course.created_at),
        ),
        modules=[
            ModuleResponse(
                id=m.id,
                course_id=m.course_id,
                title=m.title,
                order_index=m.order_index,
                objectives=m.objectives or [],
                estimated_minutes=m.estimated_minutes,
                created_at=iso_format(m.created_at),
                passed=bool(prog_by_mid.get(m.id).passed) if prog_by_mid.get(m.id) else False,
                best_score=float(prog_by_mid.get(m.id).best_score) if prog_by_mid.get(m.id) else 0.0,
                attempts_count=int(prog_by_mid.get(m.id).attempts_count) if prog_by_mid.get(m.id) else 0,
            )
            for m in modules
        ],
    )


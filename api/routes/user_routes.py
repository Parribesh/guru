"""
User preferences and profile endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.config import get_db
from api.models.models import Course, Module, ModuleProgress, User as DbUser
from api.schemas.user_progress_schemas import UserProgressCourse, UserProgressModule, UserProgressResponse
from api.schemas.user_schemas import User
from api.utils.auth import get_current_user
from api.utils.common import get_db_user_id, iso_format

user_routes = APIRouter()


class UpdatePreferencesRequest(BaseModel):
    preferences: dict


@user_routes.patch("/user/preferences")
async def update_user_preferences(
    body: UpdatePreferencesRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """
    Update current user's preferences (merge with existing).
    Use e.g. { "preferences": { "ollama_model": "qwen:latest" } }.
    """
    assert current_user is not None
    user_id = get_db_user_id(current_user.email, db)
    user = db.query(DbUser).filter(DbUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    current = user.preferences if isinstance(user.preferences, dict) else {}
    merged = {**current, **(body.preferences or {})}
    user.preferences = merged
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"preferences": user.preferences}


@user_routes.get("/user/progress", response_model=UserProgressResponse)
async def get_user_progress(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserProgressResponse:
    """
    User learning state across all courses: per-course modules with passed, best_score, attempts.
    Used by profile progress card and by learning sessions to know where the user stands.
    """
    assert current_user is not None
    user_id = get_db_user_id(current_user.email, db)
    courses = (
        db.query(Course)
        .filter(Course.user_id == user_id, Course.syllabus_confirmed == True)
        .order_by(Course.created_at.desc())
        .all()
    )
    prog_by_mid = {
        p.module_id: p
        for p in db.query(ModuleProgress).filter(ModuleProgress.user_id == user_id).all()
    }
    result: list[UserProgressCourse] = []
    for c in courses:
        modules = (
            db.query(Module)
            .filter(Module.course_id == c.id)
            .order_by(Module.order_index.asc())
            .all()
        )
        mods: list[UserProgressModule] = []
        for m in modules:
            p = prog_by_mid.get(m.id)
            mods.append(
                UserProgressModule(
                    module_id=m.id,
                    title=m.title,
                    order_index=m.order_index,
                    passed=bool(p.passed) if p else False,
                    best_score=float(p.best_score) if p else 0.0,
                    attempts_count=int(p.attempts_count) if p else 0,
                    passed_at=iso_format(p.passed_at) if p and p.passed_at else None,
                    updated_at=iso_format(p.updated_at) if p else None,
                )
            )
        result.append(
            UserProgressCourse(
                course_id=c.id,
                course_title=c.title,
                subject=c.subject,
                modules=mods,
            )
        )
    return UserProgressResponse(courses=result)

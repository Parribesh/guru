"""
User preferences and profile endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from api.config import get_db
from api.models.models import Course, Module, ModuleProgress, User as DbUser
from api.schemas.user_progress_schemas import UserProgressCourse, UserProgressModule, UserProgressResponse
from api.schemas.user_schemas import User
from api.utils.auth import get_current_user, get_user_by_email, set_auth_cookie
from api.utils.common import get_db_user_id, iso_format
from api.utils.jwt import get_password_hash, verify_password

user_routes = APIRouter()


class UpdatePreferencesRequest(BaseModel):
    preferences: dict


class UpdateEmailRequest(BaseModel):
    email: EmailStr
    password: str


class UpdatePasswordRequest(BaseModel):
    current_password: str
    new_password: str
    confirm_new_password: str


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


@user_routes.patch("/user/email")
async def update_user_email(
    body: UpdateEmailRequest,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """
    Update current user's email. Requires current password.
    Sets a new auth cookie so the token sub reflects the new email.
    """
    assert current_user is not None
    user_id = get_db_user_id(current_user.email, db)
    user = db.query(DbUser).filter(DbUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    new_email = body.email.strip().lower()
    if new_email == user.email:
        return {"message": "Email unchanged", "email": user.email}
    if get_user_by_email(new_email, db):
        raise HTTPException(status_code=400, detail="Email already in use")
    user.email = new_email
    db.add(user)
    db.commit()
    db.refresh(user)
    set_auth_cookie(response, user)
    return {"message": "Email updated", "email": user.email}


@user_routes.patch("/user/password")
async def update_user_password(
    body: UpdatePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """
    Update current user's password. Requires current password and confirmation of new password.
    """
    assert current_user is not None
    if body.new_password != body.confirm_new_password:
        raise HTTPException(status_code=400, detail="New password and confirmation do not match")
    user_id = get_db_user_id(current_user.email, db)
    user = db.query(DbUser).filter(DbUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not verify_password(body.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    user.hashed_password = get_password_hash(body.new_password)
    db.add(user)
    db.commit()
    return {"message": "Password updated"}


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

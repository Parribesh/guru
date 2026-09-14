"""
Administrative endpoints for system management, course & syllabus asset CRUD,
and asset directory management. Protected by require_admin_user.
"""

from typing import Optional, List, Any, Dict
from datetime import datetime
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import func

from api.config import get_db
from api.models.models import (
    Course,
    Module,
    ModuleProgress,
    SyllabusRun,
    ModuleLearningSession,
    User,
)
from api.settings import settings
from api.utils.auth import require_admin_user
from api.utils.common import iso_format

admin_routes = APIRouter(prefix="/admin", tags=["admin"])


# ==========================================
# Pydantic Schemas
# ==========================================

class AdminStatsResponse(BaseModel):
    total_courses: int
    total_modules: int
    total_syllabus_runs: int
    total_learning_sessions: int
    total_users: int
    total_admins: int
    system_status: str
    active_llm_provider: str
    active_gemini_model: str
    active_ollama_model: str


class AdminEndpointDoc(BaseModel):
    method: str
    path: str
    category: str
    summary: str
    description: str
    auth_required: str
    sample_body: Optional[Dict[str, Any]] = None


class AdminEndpointsResponse(BaseModel):
    endpoints: List[AdminEndpointDoc]


class AdminCourseListItem(BaseModel):
    id: str
    user_id: int
    user_email: str
    title: str
    subject: str
    goals: Optional[str] = None
    syllabus_confirmed: bool
    modules_count: int
    created_at: str


class AdminModuleDetail(BaseModel):
    id: str
    course_id: str
    title: str
    order_index: int
    objectives: List[str]
    estimated_minutes: Optional[int] = None
    created_at: str


class AdminCourseDetailResponse(BaseModel):
    id: str
    user_id: int
    user_email: str
    title: str
    subject: str
    goals: Optional[str] = None
    syllabus_draft: Optional[Any] = None
    syllabus_confirmed: bool
    created_at: str
    modules: List[AdminModuleDetail]


class AdminCreateCourseRequest(BaseModel):
    title: str
    subject: str
    goals: Optional[str] = None
    user_id: Optional[int] = None
    syllabus_confirmed: Optional[bool] = False


class AdminUpdateCourseRequest(BaseModel):
    title: Optional[str] = None
    subject: Optional[str] = None
    goals: Optional[str] = None
    syllabus_confirmed: Optional[bool] = None


class AdminUpdateSyllabusRequest(BaseModel):
    syllabus_draft: List[Dict[str, Any]]
    sync_modules: bool = True
    confirm: bool = True


class AdminCreateModuleRequest(BaseModel):
    title: str
    objectives: List[str] = Field(default_factory=list)
    estimated_minutes: Optional[int] = 30
    order_index: Optional[int] = None


class AdminUpdateModuleRequest(BaseModel):
    title: Optional[str] = None
    objectives: Optional[List[str]] = None
    estimated_minutes: Optional[int] = None
    order_index: Optional[int] = None


class AdminUserItem(BaseModel):
    id: int
    email: str
    role: str
    is_admin: bool
    courses_count: int


class AdminUpdateUserRoleRequest(BaseModel):
    role: str  # "admin" or "user"


# ==========================================
# 1. System Stats & Asset Directory
# ==========================================

@admin_routes.get("/stats", response_model=AdminStatsResponse)
def get_admin_stats(
    admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> AdminStatsResponse:
    """Return aggregated system asset metrics and model configuration."""
    total_courses = db.query(func.count(Course.id)).scalar() or 0
    total_modules = db.query(func.count(Module.id)).scalar() or 0
    total_runs = db.query(func.count(SyllabusRun.id)).scalar() or 0
    total_sessions = db.query(func.count(ModuleLearningSession.id)).scalar() or 0
    total_users = db.query(func.count(User.id)).scalar() or 0
    total_admins = db.query(func.count(User.id)).filter(User.role == "admin").scalar() or 0

    return AdminStatsResponse(
        total_courses=total_courses,
        total_modules=total_modules,
        total_syllabus_runs=total_runs,
        total_learning_sessions=total_sessions,
        total_users=total_users,
        total_admins=total_admins,
        system_status="operational",
        active_llm_provider=settings.LLM_PROVIDER,
        active_gemini_model=settings.GEMINI_MODEL,
        active_ollama_model=settings.OLLAMA_MODEL,
    )


@admin_routes.get("/endpoints", response_model=AdminEndpointsResponse)
def get_admin_endpoints(
    admin_user: User = Depends(require_admin_user),
) -> AdminEndpointsResponse:
    """Return comprehensive system asset endpoints catalog for dashboard reference."""
    endpoints = [
        # Course Assets
        AdminEndpointDoc(
            method="GET",
            path="/guru/admin/stats",
            category="System Health & Assets",
            summary="System Asset Statistics",
            description="Aggregated count of all database assets, runs, sessions, and active LLM configuration.",
            auth_required="Admin",
        ),
        AdminEndpointDoc(
            method="GET",
            path="/guru/admin/courses",
            category="Course Asset Management",
            summary="List All Courses",
            description="Fetch all system courses across all users with author details and module counts.",
            auth_required="Admin",
        ),
        AdminEndpointDoc(
            method="POST",
            path="/guru/admin/courses",
            category="Course Asset Management",
            summary="Create Course Asset",
            description="Admin provision of a course asset for any user or system root.",
            auth_required="Admin",
            sample_body={"title": "Advanced PyTorch", "subject": "Deep Learning", "goals": "Master torch.nn"},
        ),
        AdminEndpointDoc(
            method="GET",
            path="/guru/admin/courses/{course_id}",
            category="Course Asset Management",
            summary="Get Course Detail",
            description="Retrieve course metadata, author info, raw syllabus draft, and structured modules.",
            auth_required="Admin",
        ),
        AdminEndpointDoc(
            method="PUT",
            path="/guru/admin/courses/{course_id}",
            category="Course Asset Management",
            summary="Update Course Asset",
            description="Update title, subject, goals, or confirmation status of a course asset.",
            auth_required="Admin",
            sample_body={"title": "Updated Title", "syllabus_confirmed": True},
        ),
        AdminEndpointDoc(
            method="DELETE",
            path="/guru/admin/courses/{course_id}",
            category="Course Asset Management",
            summary="Delete Course Asset",
            description="Force purge course asset and cascade delete all modules, progress, attempts, and runs.",
            auth_required="Admin",
        ),

        # Syllabus & Modules
        AdminEndpointDoc(
            method="GET",
            path="/guru/admin/courses/{course_id}/syllabus",
            category="Syllabus & Module Assets",
            summary="Inspect Syllabus Draft",
            description="Retrieve raw syllabus draft JSON and active database modules.",
            auth_required="Admin",
        ),
        AdminEndpointDoc(
            method="PUT",
            path="/guru/admin/courses/{course_id}/syllabus",
            category="Syllabus & Module Assets",
            summary="Override/Sync Syllabus",
            description="Directly edit raw syllabus JSON and optionally recreate/synchronize database module assets.",
            auth_required="Admin",
            sample_body={
                "syllabus_draft": [
                    {"title": "Module 1", "objectives": ["Obj 1"], "estimated_minutes": 30}
                ],
                "sync_modules": True,
                "confirm": True
            },
        ),
        AdminEndpointDoc(
            method="POST",
            path="/guru/admin/courses/{course_id}/modules",
            category="Syllabus & Module Assets",
            summary="Create Course Module",
            description="Append a single module with pedagogical objectives to a course.",
            auth_required="Admin",
            sample_body={"title": "Optimization Techniques", "objectives": ["SGD", "Adam"], "estimated_minutes": 45},
        ),
        AdminEndpointDoc(
            method="PUT",
            path="/guru/admin/courses/{course_id}/modules/{module_id}",
            category="Syllabus & Module Assets",
            summary="Update Course Module",
            description="Modify title, learning objectives, estimated time, or sequence index of a module.",
            auth_required="Admin",
            sample_body={"title": "Revised Module Name", "estimated_minutes": 60},
        ),
        AdminEndpointDoc(
            method="DELETE",
            path="/guru/admin/courses/{course_id}/modules/{module_id}",
            category="Syllabus & Module Assets",
            summary="Delete Course Module",
            description="Remove a specific module from a course.",
            auth_required="Admin",
        ),

        # User Management
        AdminEndpointDoc(
            method="GET",
            path="/guru/admin/users",
            category="User & Access Governance",
            summary="List Registered Users",
            description="List all platform users with roles, admin flags, and course creation counts.",
            auth_required="Admin",
        ),
        AdminEndpointDoc(
            method="PATCH",
            path="/guru/admin/users/{user_id}/role",
            category="User & Access Governance",
            summary="Update User Role",
            description="Promote or demote user account between 'admin' and 'user'.",
            auth_required="Admin",
            sample_body={"role": "admin"},
        ),

        # Client Runtime Endpoints
        AdminEndpointDoc(
            method="POST",
            path="/guru/courses/{course_id}/syllabus/run",
            category="Syllabus Agent Runtime",
            summary="Start Stepped Syllabus Run",
            description="Initiate autonomous LangGraph curriculum planning with model selection.",
            auth_required="Authenticated",
            sample_body={"provider": "gemini", "model": "gemini-3.7-flash"},
        ),
        AdminEndpointDoc(
            method="GET",
            path="/guru/ollama/models",
            category="LLM Infrastructure",
            summary="List Ollama Local Models",
            description="Query local Ollama daemon for available pulled models and active status.",
            auth_required="Authenticated",
        ),
    ]
    return AdminEndpointsResponse(endpoints=endpoints)


# ==========================================
# 2. Courses CRUD
# ==========================================

@admin_routes.get("/courses", response_model=List[AdminCourseListItem])
def list_admin_courses(
    admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> List[AdminCourseListItem]:
    """List all system courses across all users with creator info and module counts."""
    courses = db.query(Course).order_by(Course.created_at.desc()).all()
    user_ids = {c.user_id for c in courses}
    users = {u.id: u.email for u in db.query(User).filter(User.id.in_(user_ids)).all()} if user_ids else {}

    # Module counts per course
    module_counts = dict(
        db.query(Module.course_id, func.count(Module.id))
        .group_by(Module.course_id)
        .all()
    )

    result = []
    for c in courses:
        result.append(
            AdminCourseListItem(
                id=c.id,
                user_id=c.user_id,
                user_email=users.get(c.user_id, f"User #{c.user_id}"),
                title=c.title,
                subject=c.subject,
                goals=c.goals,
                syllabus_confirmed=bool(c.syllabus_confirmed),
                modules_count=module_counts.get(c.id, 0),
                created_at=iso_format(c.created_at),
            )
        )
    return result


@admin_routes.post("/courses", response_model=AdminCourseDetailResponse)
def create_admin_course(
    req: AdminCreateCourseRequest,
    admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> AdminCourseDetailResponse:
    """Admin create course for any specified user_id or self."""
    target_user_id = req.user_id if req.user_id is not None else admin_user.id
    target_user = db.query(User).filter(User.id == target_user_id).first()
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"User {target_user_id} not found")

    course_id = str(uuid4())
    course = Course(
        id=course_id,
        user_id=target_user.id,
        title=req.title,
        subject=req.subject,
        goals=req.goals,
        syllabus_draft=[],
        syllabus_confirmed=bool(req.syllabus_confirmed),
        created_at=datetime.utcnow(),
    )
    db.add(course)
    db.commit()
    db.refresh(course)

    return AdminCourseDetailResponse(
        id=course.id,
        user_id=course.user_id,
        user_email=target_user.email,
        title=course.title,
        subject=course.subject,
        goals=course.goals,
        syllabus_draft=course.syllabus_draft,
        syllabus_confirmed=bool(course.syllabus_confirmed),
        created_at=iso_format(course.created_at),
        modules=[],
    )


@admin_routes.get("/courses/{course_id}", response_model=AdminCourseDetailResponse)
def get_admin_course_detail(
    course_id: str,
    admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> AdminCourseDetailResponse:
    """Fetch complete course asset information including modules and syllabus draft."""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")

    owner = db.query(User).filter(User.id == course.user_id).first()
    modules = db.query(Module).filter(Module.course_id == course.id).order_by(Module.order_index).all()

    return AdminCourseDetailResponse(
        id=course.id,
        user_id=course.user_id,
        user_email=owner.email if owner else f"User #{course.user_id}",
        title=course.title,
        subject=course.subject,
        goals=course.goals,
        syllabus_draft=course.syllabus_draft,
        syllabus_confirmed=bool(course.syllabus_confirmed),
        created_at=iso_format(course.created_at),
        modules=[
            AdminModuleDetail(
                id=m.id,
                course_id=m.course_id,
                title=m.title,
                order_index=m.order_index,
                objectives=m.objectives or [],
                estimated_minutes=m.estimated_minutes,
                created_at=iso_format(m.created_at),
            )
            for m in modules
        ],
    )


@admin_routes.put("/courses/{course_id}", response_model=AdminCourseDetailResponse)
def update_admin_course(
    course_id: str,
    req: AdminUpdateCourseRequest,
    admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> AdminCourseDetailResponse:
    """Update course asset metadata."""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")

    if req.title is not None:
        course.title = req.title
    if req.subject is not None:
        course.subject = req.subject
    if req.goals is not None:
        course.goals = req.goals
    if req.syllabus_confirmed is not None:
        course.syllabus_confirmed = req.syllabus_confirmed

    db.commit()
    db.refresh(course)
    return get_admin_course_detail(course_id, admin_user, db)


@admin_routes.delete("/courses/{course_id}")
def delete_admin_course(
    course_id: str,
    admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, str]:
    """Force delete course and cascade clean all related resources."""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")

    # Delete related syllabus runs & events
    runs = db.query(SyllabusRun).filter(SyllabusRun.course_id == course_id).all()
    for r in runs:
        db.delete(r)

    # Delete course (SQLAlchemy cascade deletes modules and attempts)
    db.delete(course)
    db.commit()
    return {"message": f"Course {course_id} deleted successfully"}


# ==========================================
# 3. Syllabus & Module Assets
# ==========================================

@admin_routes.get("/courses/{course_id}/syllabus")
def get_admin_syllabus(
    course_id: str,
    admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Retrieve raw syllabus draft JSON and database modules for course."""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")

    modules = db.query(Module).filter(Module.course_id == course_id).order_by(Module.order_index).all()
    return {
        "course_id": course.id,
        "title": course.title,
        "syllabus_confirmed": bool(course.syllabus_confirmed),
        "syllabus_draft": course.syllabus_draft or [],
        "modules": [
            {
                "id": m.id,
                "title": m.title,
                "order_index": m.order_index,
                "objectives": m.objectives or [],
                "estimated_minutes": m.estimated_minutes,
            }
            for m in modules
        ],
    }


@admin_routes.put("/courses/{course_id}/syllabus")
def update_admin_syllabus(
    course_id: str,
    req: AdminUpdateSyllabusRequest,
    admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Directly override syllabus draft and synchronize module assets."""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")

    course.syllabus_draft = req.syllabus_draft
    if req.confirm:
        course.syllabus_confirmed = True

    if req.sync_modules:
        # Remove existing modules
        existing_modules = db.query(Module).filter(Module.course_id == course_id).all()
        for em in existing_modules:
            db.delete(em)
        db.flush()

        # Re-create modules from draft specs
        for idx, mod_spec in enumerate(req.syllabus_draft):
            title = mod_spec.get("title") or f"Module {idx + 1}"
            objectives = mod_spec.get("objectives") or []
            est_min = mod_spec.get("estimated_minutes") or 30
            mod = Module(
                id=str(uuid4()),
                course_id=course.id,
                title=title,
                order_index=idx,
                objectives=objectives,
                estimated_minutes=est_min,
                created_at=datetime.utcnow(),
            )
            db.add(mod)

    db.commit()
    db.refresh(course)
    return get_admin_syllabus(course_id, admin_user, db)


@admin_routes.post("/courses/{course_id}/modules", response_model=AdminModuleDetail)
def create_admin_module(
    course_id: str,
    req: AdminCreateModuleRequest,
    admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> AdminModuleDetail:
    """Create and append a module to a course."""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")

    if req.order_index is None:
        max_order = (
            db.query(func.max(Module.order_index))
            .filter(Module.course_id == course_id)
            .scalar()
        )
        order_index = 0 if max_order is None else max_order + 1
    else:
        order_index = req.order_index

    module = Module(
        id=str(uuid4()),
        course_id=course_id,
        title=req.title,
        order_index=order_index,
        objectives=req.objectives,
        estimated_minutes=req.estimated_minutes,
        created_at=datetime.utcnow(),
    )
    db.add(module)
    db.commit()
    db.refresh(module)

    return AdminModuleDetail(
        id=module.id,
        course_id=module.course_id,
        title=module.title,
        order_index=module.order_index,
        objectives=module.objectives or [],
        estimated_minutes=module.estimated_minutes,
        created_at=iso_format(module.created_at),
    )


@admin_routes.put("/courses/{course_id}/modules/{module_id}", response_model=AdminModuleDetail)
def update_admin_module(
    course_id: str,
    module_id: str,
    req: AdminUpdateModuleRequest,
    admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> AdminModuleDetail:
    """Update a specific module asset."""
    module = (
        db.query(Module)
        .filter(Module.id == module_id, Module.course_id == course_id)
        .first()
    )
    if not module:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found")

    if req.title is not None:
        module.title = req.title
    if req.objectives is not None:
        module.objectives = req.objectives
    if req.estimated_minutes is not None:
        module.estimated_minutes = req.estimated_minutes
    if req.order_index is not None:
        module.order_index = req.order_index

    db.commit()
    db.refresh(module)

    return AdminModuleDetail(
        id=module.id,
        course_id=module.course_id,
        title=module.title,
        order_index=module.order_index,
        objectives=module.objectives or [],
        estimated_minutes=module.estimated_minutes,
        created_at=iso_format(module.created_at),
    )


@admin_routes.delete("/courses/{course_id}/modules/{module_id}")
def delete_admin_module(
    course_id: str,
    module_id: str,
    admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, str]:
    """Delete a specific module asset."""
    module = (
        db.query(Module)
        .filter(Module.id == module_id, Module.course_id == course_id)
        .first()
    )
    if not module:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found")

    db.delete(module)
    db.commit()
    return {"message": f"Module {module_id} deleted successfully"}


# ==========================================
# 4. User & Role Governance
# ==========================================

@admin_routes.get("/users", response_model=List[AdminUserItem])
def list_admin_users(
    admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> List[AdminUserItem]:
    """List all registered platform users with course stats and roles."""
    users = db.query(User).order_by(User.id).all()
    course_counts = dict(
        db.query(Course.user_id, func.count(Course.id))
        .group_by(Course.user_id)
        .all()
    )

    result = []
    for u in users:
        role = getattr(u, "role", "user")
        is_admin = role == "admin" or u.email == settings.DEFAULT_USER_EMAIL
        result.append(
            AdminUserItem(
                id=u.id,
                email=u.email,
                role=role,
                is_admin=is_admin,
                courses_count=course_counts.get(u.id, 0),
            )
        )
    return result


@admin_routes.patch("/users/{user_id}/role", response_model=AdminUserItem)
def update_admin_user_role(
    user_id: int,
    req: AdminUpdateUserRoleRequest,
    admin_user: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> AdminUserItem:
    """Promote or demote a user role between 'admin' and 'user'."""
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if req.role not in ("admin", "user"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Role must be 'admin' or 'user'")

    # Prevent demoting the default system admin
    if target_user.email == settings.DEFAULT_USER_EMAIL and req.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot demote the default administrator ({settings.DEFAULT_USER_EMAIL})",
        )

    target_user.role = req.role
    db.commit()
    db.refresh(target_user)

    course_count = db.query(func.count(Course.id)).filter(Course.user_id == target_user.id).scalar() or 0
    return AdminUserItem(
        id=target_user.id,
        email=target_user.email,
        role=target_user.role,
        is_admin=target_user.role == "admin" or target_user.email == settings.DEFAULT_USER_EMAIL,
        courses_count=course_count,
    )

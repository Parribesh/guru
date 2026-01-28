"""
Unified session endpoint for managing and streaming session state.
"""

import json
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from api.config import get_db
from api.models.models import Conversation, Module, Course, ModuleProgress
from api.models.session import Session, SessionType, SessionStatus
from api.models.models import Message
from api.schemas.user_schemas import User
from api.utils.auth import get_current_user
from api.utils.common import get_db_user_id, display_name, next_seq, syllabus_outline
from api.utils.prompt_builder import build_tutor_system_prompt
from api.services.session_service import SessionService, SessionEventType
from api.utils.logger import configure_logging

session_routes = APIRouter()
logger = configure_logging()


@session_routes.post("/sessions")
async def create_session(
    session_type: str = Query(..., description="Type of session: learning, test, chat, syllabus"),
    module_id: str = Query(None, description="Module ID (for learning/test sessions)"),
    course_id: str = Query(None, description="Course ID (for syllabus sessions)"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """
    Create a new session with full context.
    
    Returns session ID and initial context.
    """
    assert current_user is not None
    user_id = get_db_user_id(current_user.email, db)
    
    # Validate session type
    try:
        session_type_enum = SessionType(session_type.lower())
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid session type: {session_type}")
    
    # Create conversation
    conversation_id = str(uuid4())
    db.add(Conversation(id=conversation_id, user_id=user_id))
    db.commit()
    
    # Get module and course context if provided
    module = None
    course = None
    agent_metadata = {}
    session_state = {}
    
    # For syllabus sessions, course_id is required
    if session_type_enum == SessionType.SYLLABUS:
        if not course_id:
            raise HTTPException(status_code=400, detail="course_id is required for syllabus sessions")
        course = db.query(Course).filter(Course.id == course_id, Course.user_id == user_id).first()
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")
        course_id = course.id
    
    if module_id:
        module = (
            db.query(Module)
            .join(Course, Course.id == Module.course_id)
            .filter(Module.id == module_id, Course.user_id == user_id)
            .first()
        )
        if not module:
            raise HTTPException(status_code=404, detail="Module not found")
        
        course_id = module.course_id
        course = db.query(Course).filter(Course.id == course_id).first()
        
        # Get progress
        progress = db.query(ModuleProgress).filter(
            ModuleProgress.user_id == user_id,
            ModuleProgress.module_id == module_id
        ).first()
        
        # Build agent metadata based on session type
        if session_type_enum == SessionType.LEARNING:
            agent_metadata = {
                "system_prompt": build_tutor_system_prompt(
                    user_name=display_name(current_user),
                    course_title=course.title if course else "",
                    course_subject=course.subject if course else "",
                    course_goals=course.goals if course else None,
                    syllabus_outline=syllabus_outline(course_id, db),
                    module_title=module.title,
                    module_order_index=int(module.order_index),
                    objectives=list(module.objectives or []),
                    progress_best_score=float(progress.best_score) if progress else 0.0,
                    progress_attempts=int(progress.attempts_count) if progress else 0,
                    progress_passed=bool(progress.passed) if progress else False,
                    compressed=True,
                ),
                "max_tokens": 150,
                "conversation_id": conversation_id,
            }
            session_state = {
                "module_progress": {
                    "best_score": float(progress.best_score) if progress else 0.0,
                    "attempts_count": int(progress.attempts_count) if progress else 0,
                    "passed": bool(progress.passed) if progress else False,
                }
            }
    
    # Create session
    session_service = SessionService(db)
    session = session_service.create_session(
        user_id=user_id,
        session_type=session_type_enum,
        conversation_id=conversation_id,
        module_id=module_id,
        course_id=course_id,
        agent_name="chat" if session_type_enum == SessionType.CHAT else "tutor",
        agent_metadata=agent_metadata,
        session_state=session_state,
        metadata={
            "user_name": display_name(current_user),
        },
    )
    
    # Get full context
    context = session_service.get_session_context(session)
    
    return {
        "session_id": session.id,
        "conversation_id": conversation_id,
        "context": context,
    }


@session_routes.get("/sessions/{session_id}/stream")
async def stream_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """
    Stream session events and state updates.
    
    Events include:
    - session_started: Initial session context
    - session_updated: State updates
    - agent_state: Agent state changes
    - progress_update: Progress updates
    - message: New messages
    - metadata_update: Metadata changes
    - session_ended: Session ended
    - error: Errors
    """
    assert current_user is not None
    user_id = get_db_user_id(current_user.email, db)
    
    session_service = SessionService(db)
    session = session_service.get_session(session_id, user_id)
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    async def event_generator():
        async for event in session_service.stream_session_events(session_id, user_id):
            yield event
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@session_routes.get("/sessions")
async def list_sessions(
    session_type: str = Query(None, description="Filter by session type"),
    status: str = Query(None, description="Filter by status: active, completed, cancelled"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """
    List sessions for the current user.
    """
    assert current_user is not None
    user_id = get_db_user_id(current_user.email, db)
    
    session_service = SessionService(db)
    query = db.query(Session).filter(Session.user_id == user_id)
    
    if session_type:
        try:
            session_type_enum = SessionType(session_type.lower())
            query = query.filter(Session.session_type == session_type_enum)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid session type: {session_type}")
    
    if status:
        try:
            status_enum = SessionStatus(status.upper())
            query = query.filter(Session.status == status_enum)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}")
    
    sessions = query.order_by(Session.created_at.desc()).limit(50).all()
    
    return {
        "sessions": [
            {
                "id": s.id,
                "session_type": s.session_type.value,
                "status": s.status.value,
                "phase": s.session_state.get("phase") if s.session_state else None,
                "course_id": s.course_id,
                "module_id": s.module_id,
                "created_at": s.created_at.isoformat() if s.created_at else None,
            }
            for s in sessions
        ]
    }


@session_routes.get("/sessions/{session_id}")
async def get_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Get current session state and context."""
    assert current_user is not None
    user_id = get_db_user_id(current_user.email, db)
    
    session_service = SessionService(db)
    session = session_service.get_session(session_id, user_id)
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    context = session_service.get_session_context(session)
    return context


@session_routes.post("/sessions/{session_id}/end")
async def end_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """End a session."""
    assert current_user is not None
    user_id = get_db_user_id(current_user.email, db)
    
    session_service = SessionService(db)
    session = session_service.end_session(session_id)
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return {
        "session_id": session_id,
        "status": session.status.value,
        "ended_at": session.ended_at.isoformat() if session.ended_at else None,
    }


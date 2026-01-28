"""
Syllabus generation endpoints.

These endpoints are wrappers around the session system for backward compatibility.
All new code should use /guru/sessions endpoints directly.
"""

from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from api.config import get_db
from api.models.models import Conversation, Course
from api.schemas.guru_schemas import StartSyllabusRunResponse
from api.schemas.user_schemas import User
from api.utils.auth import get_current_user
from api.utils.common import get_db_user_id

syllabus_routes = APIRouter()


@syllabus_routes.post("/courses/{course_id}/syllabus/run", response_model=StartSyllabusRunResponse)
async def start_syllabus_run(
    course_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> StartSyllabusRunResponse:
    """
    Start a syllabus generation run.
    
    Note: This now creates a session and returns session_id.
    Use /guru/sessions/{session_id}/stream to stream the generation process.
    """
    from api.services.session_service import SessionService
    from api.models.session import SessionType
    
    assert current_user is not None
    user_id = get_db_user_id(current_user.email, db)
    course = db.query(Course).filter(Course.id == course_id, Course.user_id == user_id).first()
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")
    
    # Create conversation for the session
    conversation_id = str(uuid4())
    db.add(Conversation(id=conversation_id, user_id=user_id))
    db.commit()
    
    # Create syllabus session
    session_service = SessionService(db)
    session = session_service.create_session(
        user_id=user_id,
        session_type=SessionType.SYLLABUS,
        conversation_id=conversation_id,
        course_id=course_id,
        agent_name="syllabus_generator",
        agent_metadata={
            "course_title": course.title,
            "course_subject": course.subject,
            "course_goals": course.goals,
        },
        session_state={
            "status": "running",
            "phase": "generate",
        },
    )
    
    # Return session_id (which acts as run_id for backward compatibility)
    return StartSyllabusRunResponse(run_id=session.id)


@syllabus_routes.get("/syllabus/runs/{run_id}/stream")
async def stream_syllabus_run(
    run_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """
    Stream syllabus generation + critic evaluation in phases.
    
    Note: This endpoint is now a wrapper around the session stream.
    The run_id is treated as a session_id for backward compatibility.
    Use /guru/sessions/{session_id}/stream for the standardized endpoint.
    """
    from api.services.session_service import SessionService
    
    assert current_user is not None
    user_id = get_db_user_id(current_user.email, db)
    
    # Treat run_id as session_id
    session_service = SessionService(db)
    session = session_service.get_session(run_id, user_id)
    
    if not session:
        raise HTTPException(status_code=404, detail="Session/Run not found")
    
    # Stream through session system
    async def event_generator():
        async for event in session_service.stream_session_events(run_id, user_id):
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


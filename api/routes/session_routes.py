"""
Unified session endpoint for managing and streaming session state.
"""

import json
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session as DBSession

from api.config import get_db
from api.models.models import Conversation, Module, Course, ModuleProgress, Message
from api.models.session import Session, SessionType, SessionStatus
from api.schemas.chat_schemas import SendMessageRequest, SendMessageResponse
from api.schemas.user_schemas import User
from api.utils.auth import get_current_user
from api.utils.common import get_db_user_id, display_name, next_seq, syllabus_outline, iso_format
from api.utils.prompt_builder import build_tutor_system_prompt
from api.utils.history_manager import store_exchange_from_messages
from api.services.session_service import SessionService, SessionEventType
from api.utils.logger import configure_logging

session_routes = APIRouter()
logger = configure_logging()


@session_routes.post("/sessions")
async def create_session(
    session_type: str = Query(..., description="Type of session: learning, test, chat"),
    module_id: str = Query(None, description="Module ID (for learning/test sessions)"),
    course_id: str = Query(None, description="Course ID (optional)"),
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
) -> dict:
    """Create a new session with full context.
    
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
    
    # Syllabus is separate: use POST /guru/courses/{course_id}/syllabus/run and GET .../stream
    if session_type_enum == SessionType.SYLLABUS:
        raise HTTPException(
            status_code=400,
            detail="Use POST /guru/courses/{course_id}/syllabus/run for syllabus generation",
        )

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


@session_routes.post("/sessions/{session_id}/messages", response_model=SendMessageResponse)
async def send_message(
    session_id: str,
    req: SendMessageRequest,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
) -> SendMessageResponse:
    """
    Send a user message in a session, run the agent, persist both user and assistant
    messages to the conversation, and sync the exchange to the vector history store.

    Only allowed for ACTIVE learning, test, or chat sessions (not syllabus).
    """
    assert current_user is not None
    user_id = get_db_user_id(current_user.email, db)

    session_service = SessionService(db)
    session = session_service.get_session(session_id, user_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.session_type == SessionType.SYLLABUS:
        raise HTTPException(status_code=400, detail="Cannot send messages in a syllabus session; use stream for generation")
    if session.status != SessionStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Session is not active")

    conversation_id = session.conversation_id
    seq_user = next_seq(conversation_id, db)
    user_msg_id = str(uuid4())
    user_msg = Message(
        id=user_msg_id,
        conversation_id=conversation_id,
        role="user",
        content=req.content,
        seq=seq_user,
    )
    db.add(user_msg)
    db.commit()
    db.refresh(user_msg)

    # Get agent and configure for this conversation (VectorMemory + skip save; we sync after persist)
    from api.bootstrap import build_registry
    from agents.chat_agent.vector_memory import VectorMemory

    registry = build_registry()
    agent = registry.get(session.agent_name)
    agent.memory = VectorMemory(
        conversation_id=conversation_id,
        agent_state=agent.state,
    )
    agent.state.metadata = dict(session.agent_metadata or {})
    agent.state.metadata["_user_message_id"] = user_msg_id
    agent.state.metadata["_message_seq"] = seq_user
    agent.state.metadata["_skip_memory_save"] = True

    # Run agent (sync) to get full assistant response
    try:
        answer = agent.run(req.content)
        if answer is None:
            answer = ""
        answer = str(answer).strip()
    except Exception as e:
        logger.exception("Agent run failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Agent failed: {str(e)}")

    seq_assistant = next_seq(conversation_id, db)
    assistant_msg_id = str(uuid4())
    assistant_msg = Message(
        id=assistant_msg_id,
        conversation_id=conversation_id,
        role="assistant",
        content=answer,
        seq=seq_assistant,
    )
    db.add(assistant_msg)
    db.commit()
    db.refresh(assistant_msg)

    store_exchange_from_messages(conversation_id, user_msg_id, assistant_msg_id, db)

    session_service.update_session_state(session_id, {}, None)

    return SendMessageResponse(
        user_message_id=user_msg_id,
        assistant_message_id=assistant_msg_id,
        assistant_content=answer,
        assistant_seq=seq_assistant,
        created_at=iso_format(assistant_msg.created_at),
    )


@session_routes.get("/sessions/{session_id}/stream")
async def stream_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
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
    db: DBSession = Depends(get_db),
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
    db: DBSession = Depends(get_db),
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
    db: DBSession = Depends(get_db),
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


"""
Session routes: session CRUD, creation, context, messages, complete-objective, submit-test, end, list, get, stream.
Tutor and chat streaming are in tutor_routes and chat_routes respectively.
"""

import json
from datetime import datetime
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session as DBSession

from api.config import get_db
from api.models.models import Conversation, Module, Course, ModuleProgress, Message, ModuleTestAttempt
from api.models.session import Session, SessionType, SessionStatus
from api.schemas.chat_schemas import SendMessageRequest, SendMessageResponse, SubmitTestRequest
from api.schemas.user_schemas import User
from api.utils.auth import get_current_user
from api.utils.common import get_db_user_id, display_name, next_seq, syllabus_outline, iso_format, next_objective_index
from api.prompt_builders import build_tutor_system_prompt
from api.services.session_service import SessionService, SessionEventType
from api.utils.logger import configure_logging

session_routes = APIRouter()
logger = configure_logging()


@session_routes.post("/sessions")
async def create_session(
    session_type: str = Query(..., description="Type of session: learning, test, chat"),
    module_id: str = Query(None, description="Module ID (for learning/test sessions)"),
    course_id: str = Query(None, description="Course ID (optional)"),
    objective_index: int | None = Query(None, description="Objective index 0-based (learning: omit for next, or set to resume)"),
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
) -> dict:
    """Create a new session with full context.
    
    For learning sessions with module_id: one session = one objective (concept).
    Omit objective_index to start the next incomplete objective; pass it to resume a specific concept.
    When all objectives are completed, take the module test to progress to the next module.
    Returns session ID and initial context.
    """
    assert current_user is not None
    user_id = get_db_user_id(current_user.email, db)
    
    # Validate session type
    try:
        session_type_enum = SessionType(session_type.lower())
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid session type: {session_type}")
    
    # Create conversation(s) by session type:
    # - LEARNING: tutor (lesson) = primary conversation; chat (Q&A) = learning-session-specific
    # - CHAT: single conversation = chat agent only
    # - TEST: single conversation for the test
    from api.services.chat_service import ChatService

    chat_svc = ChatService(db)
    conversation_id: str
    chat_conversation_id: str | None = None

    if session_type_enum == SessionType.LEARNING:
        # Tutor agent (lesson) as primary; chat agent (Q&A) scoped to this learning session
        conversation_id = str(uuid4())
        db.add(Conversation(id=conversation_id, user_id=user_id))
        chat_conversation_id = chat_svc.create_conversation(user_id)
    elif session_type_enum == SessionType.CHAT:
        # Chat agent only: single conversation is the chat
        conversation_id = chat_svc.create_conversation(user_id)
    else:
        # Test (or other): single conversation for the session
        conversation_id = str(uuid4())
        db.add(Conversation(id=conversation_id, user_id=user_id))
    db.commit()

    # Resolve course_id from module when needed
    resolved_course_id = course_id
    module = None
    course = None
    agent_metadata = {}
    session_state = {}
    resolved_objective_index: int | None = None
    
    # Syllabus is separate: use POST /guru/courses/{course_id}/syllabus/run and GET .../stream
    if session_type_enum == SessionType.SYLLABUS:
        raise HTTPException(
            status_code=400,
            detail="Use POST /guru/courses/{course_id}/syllabus/run for syllabus generation",
        )

    # Learning sessions must be scoped to a module (one concept per session)
    if session_type_enum == SessionType.LEARNING and not module_id:
        raise HTTPException(
            status_code=400,
            detail="Learning sessions require module_id. Pass the module you want to learn (e.g. ?session_type=learning&module_id=<id>).",
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
        
        resolved_course_id = module.course_id
        course = db.query(Course).filter(Course.id == resolved_course_id).first()
        
        progress:ModuleProgress | None = db.query(ModuleProgress).filter(
            ModuleProgress.user_id == user_id,
            ModuleProgress.module_id == module_id
        ).first()
        
        objectives = list(module.objectives or [])
        completed = list(progress.completed_objectives or []) if progress is not None else []
        
        if session_type_enum == SessionType.LEARNING:
            # Resolve which objective this learning session is for
            if objective_index is not None:
                if objective_index < 0 or objective_index >= len(objectives):
                    raise HTTPException(
                        status_code=400,
                        detail=f"objective_index must be 0..{max(0, len(objectives) - 1)}",
                    )
                resolved_objective_index = objective_index
            else:
                resolved_objective_index = next_objective_index(completed, len(objectives))
                if resolved_objective_index is None:
                    raise HTTPException(
                        status_code=400,
                        detail="All objectives completed for this module. Take the module test to progress.",
                    )
            
            current_objective_str = objectives[resolved_objective_index] if resolved_objective_index < len(objectives) else ""
            completed_count = len([i for i in completed if isinstance(i, (int, float))])
            
            agent_metadata = {
                "system_prompt": build_tutor_system_prompt(
                    user_name=display_name(current_user),
                    course_title=course.title if course else "",
                    course_subject=course.subject if course else "",
                    course_goals=course.goals if course else None,
                    syllabus_outline=syllabus_outline(resolved_course_id, db),
                    module_title=module.title,
                    module_order_index=int(module.order_index),
                    objectives=objectives,
                    progress_best_score=float(progress.best_score) if progress else 0.0,
                    progress_attempts=int(progress.attempts_count) if progress else 0,
                    progress_passed=bool(progress.passed) if progress else False,
                    compressed=False,  # Use full prompt for testing
                    current_objective=current_objective_str,
                    objectives_completed_count=completed_count,
                    total_objectives=len(objectives),
                ),
                "max_tokens": 150,
                "conversation_id": conversation_id,
            }
            session_state = {
                "module_progress": {
                    "best_score": float(progress.best_score) if progress else 0.0,
                    "attempts_count": int(progress.attempts_count) if progress else 0,
                    "passed": bool(progress.passed) if progress else False,
                    "completed_objectives": completed,
                },
                "current_objective_index": resolved_objective_index,
                "current_objective": current_objective_str,
            }
    
    # Agent for primary conversation: tutor (learning), chat (chat-only), tester (test)
    agent_name = (
        "tutor" if session_type_enum == SessionType.LEARNING else
        "chat" if session_type_enum == SessionType.CHAT else
        "tester"
    )
    session_service = SessionService(db)
    session = session_service.create_session(
        user_id=user_id,
        session_type=session_type_enum,
        conversation_id=conversation_id,
        module_id=module_id,
        course_id=resolved_course_id,
        objective_index=resolved_objective_index,
        chat_conversation_id=chat_conversation_id,
        agent_name=agent_name,
        agent_metadata=agent_metadata,
        session_state=session_state,
        metadata={
            "user_name": display_name(current_user),
        },
    )
    
    # Get full context
    context = session_service.get_session_context(session)

    # For learning sessions, include a concise learning_context so the UI can show concept + progress
    learning_context = None
    if session_type_enum == SessionType.LEARNING and module and resolved_objective_index is not None:
        objectives = list(module.objectives or [])
        total = len(objectives)
        current_concept = objectives[resolved_objective_index] if resolved_objective_index < total else ""
        learning_context = {
            "agent_name": "tutor",
            "current_concept": current_concept,
            "current_concept_index": resolved_objective_index,
            "concepts_total": total,
            "concept_position_label": f"{resolved_objective_index + 1} of {total}",
            "module_title": module.title,
            "course_title": course.title if course else "",
            "progress": context.get("state", {}).get("module_progress", {}),
        }

    return {
        "session_id": session.id,
        "conversation_id": conversation_id,
        "chat_conversation_id": chat_conversation_id,
        "context": context,
        "learning_context": learning_context,
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

    # Get agent with user's ollama_model and configure for this conversation
    from api.bootstrap import build_registry
    from api.utils.common import ollama_model_for_user
    from agents.chat_agent.agent import ChatAgent
    from agents.chat_agent.memory import ChatAgentMemory
    from agents.tutor_agent.agent import TutorAgent
    from infra.llm.ollama import OllamaLLM

    model = ollama_model_for_user(db, user_id)
    llm = OllamaLLM(model=model)
    registry = build_registry()

    if session.agent_name == "tutor":
        agent = TutorAgent(name="TutorAgent", llm=llm)
    else:
        agent = ChatAgent(name=session.agent_name or "ChatAgent", llm=llm, registry=registry)

    memory = ChatAgentMemory(
        db=db,
        conversation_id=conversation_id,
        history_store=agent.history_store,
        message_cls=Message,
        next_seq_fn=next_seq,
        agent_state=agent.state,
    )
    agent.memory = memory
    agent.state.metadata = dict(session.agent_metadata or {})

    # Run agent; ChatAgentMemory persists user msg in _before_run, assistant msg in _after_run
    try:
        answer = agent.run(req.content)
        if answer is None:
            answer = ""
        answer = str(answer).strip()
    except Exception as e:
        logger.exception("Agent run failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Agent failed: {str(e)}")

    user_msg_id = agent.state.metadata.get("_user_message_id", "")
    assistant_msg_id = agent.state.metadata.get("_assistant_message_id", "")
    assistant_msg = db.query(Message).filter(Message.id == assistant_msg_id).first()
    seq_assistant = assistant_msg.seq if assistant_msg else 0
    created_at = assistant_msg.created_at if assistant_msg else None

    session_service.update_session_state(session_id, {}, None)

    return SendMessageResponse(
        user_message_id=user_msg_id,
        assistant_message_id=assistant_msg_id,
        assistant_content=answer,
        assistant_seq=seq_assistant,
        created_at=iso_format(created_at) if created_at else iso_format(datetime.utcnow()),
    )


@session_routes.get("/learning/{conversation_id}/context")
async def learning_session_context(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
) -> dict:
    """
    Get session context for a learning session by conversation_id.
    Returns agent metadata (system_prompt), module, course, and state so the UI can show
    what the tutor agent is receiving (e.g. in an Options panel).
    """
    assert current_user is not None
    user_id = get_db_user_id(current_user.email, db)

    session = (
        db.query(Session)
        .filter(Session.user_id == user_id)
        .filter(
            (Session.conversation_id == conversation_id)
            | (Session.chat_conversation_id == conversation_id)
        )
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found for this conversation")

    session_service = SessionService(db)
    return session_service.get_session_context(session)


@session_routes.post("/sessions/{session_id}/complete-objective")
async def complete_objective(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
) -> dict:
    """
    Mark the current learning session's objective as completed.
    Updates ModuleProgress.completed_objectives. Call when the user (or tutor) signals
    that they are done with this concept.
    """
    assert current_user is not None
    user_id = get_db_user_id(current_user.email, db)

    session_service = SessionService(db)
    session = session_service.get_session(session_id, user_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.session_type != SessionType.LEARNING:
        raise HTTPException(status_code=400, detail="Only learning sessions have objectives to complete")
    if not session.module_id or session.objective_index is None:
        raise HTTPException(status_code=400, detail="Session has no objective to complete")

    progress = db.query(ModuleProgress).filter(
        ModuleProgress.user_id == user_id,
        ModuleProgress.module_id == session.module_id,
    ).first()
    if not progress:
        raise HTTPException(status_code=404, detail="Module progress not found")

    completed = list(progress.completed_objectives or [])
    idx = int(session.objective_index)
    if idx not in completed:
        completed.append(idx)
        completed.sort()
    progress.completed_objectives = completed
    progress.updated_at = datetime.utcnow()
    db.add(progress)
    db.commit()
    db.refresh(progress)

    # Update session state snapshot
    session_service.update_session_state(
        session_id,
        {"module_progress": {"completed_objectives": completed}},
        None,
    )

    return {
        "session_id": session_id,
        "module_id": session.module_id,
        "objective_index": idx,
        "completed_objectives": completed,
    }


@session_routes.post("/sessions/{session_id}/submit-test", response_model=None)
async def submit_test(
    session_id: str,
    req: SubmitTestRequest,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
) -> dict:
    """
    Submit the result of a module test. Creates ModuleTestAttempt and updates
    ModuleProgress (best_score, attempts_count, passed, passed_at).
    """
    assert current_user is not None
    user_id = get_db_user_id(current_user.email, db)

    session_service = SessionService(db)
    session = session_service.get_session(session_id, user_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.session_type != SessionType.TEST:
        raise HTTPException(status_code=400, detail="Only test sessions can submit test results")
    if not session.module_id:
        raise HTTPException(status_code=400, detail="Session has no module")

    progress = db.query(ModuleProgress).filter(
        ModuleProgress.user_id == user_id,
        ModuleProgress.module_id == session.module_id,
    ).first()
    if not progress:
        raise HTTPException(status_code=404, detail="Module progress not found")

    now = datetime.utcnow()
    attempt_id = str(uuid4())
    db.add(
        ModuleTestAttempt(
            id=attempt_id,
            user_id=user_id,
            module_id=session.module_id,
            conversation_id=session.conversation_id,
            completed_at=now,
            score=req.score,
            passed=req.passed,
        )
    )
    new_attempts = (progress.attempts_count or 0) + 1
    progress.attempts_count = new_attempts
    if req.score > (progress.best_score or 0):
        progress.best_score = req.score
    if req.passed:
        progress.passed = True
        progress.passed_at = now
    progress.updated_at = now
    db.add(progress)
    db.commit()

    session_service.end_session(session_id)

    return {
        "session_id": session_id,
        "attempt_id": attempt_id,
        "score": req.score,
        "passed": req.passed,
        "module_progress": {
            "best_score": float(progress.best_score),
            "attempts_count": progress.attempts_count,
            "passed": bool(progress.passed),
        },
    }


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
                "objective_index": s.objective_index,
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


from fastapi import APIRouter, Query
import json
from datetime import datetime
from uuid import uuid4
from typing import Optional

from fastapi import Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from api.bootstrap import build_registry
from api.config import get_db
from api.models.models import (
    Conversation,
    Message,
    User as DbUser,
    Course,
    Module,
    ModuleProgress,
    ModuleTestAttempt,
    SyllabusRun,
    SyllabusEvent,
    ModuleLearningSession,
)
from api.schemas.guru_schemas import (
    ChatHistoryItem,
    ChatHistoryResponse,
    ChatRequest,
    ChatResponse,
    ChatRequest as ChatRequestSchema,
    ConversationListResponse,
    ConversationResponse,
    ForkRequest,
    ForkResponse,
    MessageListResponse,
    MessageResponse,
    CourseListResponse,
    CourseResponse,
    CreateCourseRequest,
    SyllabusDraftResponse,
    SyllabusDraftModule,
    ConfirmSyllabusResponse,
    CourseModulesResponse,
    ModuleResponse,
    StartModuleTestResponse,
    GradeModuleTestResponse,
    StartSyllabusRunResponse,
    SyllabusRunStatusResponse,
    StartLearningSessionResponse,
)
from api.schemas.user_schemas import User
from api.utils.auth import get_current_user
from api.utils.logger import configure_logging
from api.utils.prompt_builder import (
    build_chat_system_prompt,
    build_syllabus_critic_prompt,
    build_syllabus_generation_prompt,
    build_test_system_prompt,
    build_tutor_system_prompt,
)
guru_routes = APIRouter()
logger = configure_logging()

file_path = "/home/stargazer/Documents/Designing Data-Intensive Applications The Big Ideas Behind Reliable, Scalable, and Maintainable Systems by Martin Kleppmann (z-lib.org).pdf"
registry = build_registry()


def _iso(dt: datetime) -> str:
    return dt.isoformat() + "Z"


def _get_db_user_id(email: str, db: Session) -> int:
    u = db.query(DbUser).filter(DbUser.email == email).first()
    if not u:
        raise HTTPException(status_code=401, detail="User not found")
    return int(u.id)

def _display_name(current_user: User) -> str:
    prefs = current_user.preferences or {}
    name = None
    if isinstance(prefs, dict):
        name = prefs.get("name") or prefs.get("full_name")
    if isinstance(name, str) and name.strip():
        return name.strip()
    # fallback: email prefix
    return current_user.email.split("@", 1)[0]


def _welcome_message(*, name: str, context: str) -> str:
    return f"Welcome, {name}! {context}"


def _next_seq(conversation_id: str, db: Session) -> int:
    last = (
        db.query(Message)
        .filter(Message.conversation_id == conversation_id)
        .order_by(Message.seq.desc())
        .first()
    )
    return int(last.seq) + 1 if last else 1


def _load_history_pairs(conversation_id: str, db: Session) -> list[tuple[str, str]]:
    msgs = (
        db.query(Message)
        .filter(Message.conversation_id == conversation_id)
        .order_by(Message.seq.asc())
        .all()
    )
    pairs: list[tuple[str, str]] = []
    pending_user: str | None = None
    for m in msgs:
        if m.role == "user":
            pending_user = m.content
        elif m.role == "assistant" and pending_user is not None:
            pairs.append((pending_user, m.content))
            pending_user = None
    return pairs


def _latest_system_prompt(conversation_id: str, db: Session) -> str:
    m = (
        db.query(Message)
        .filter(Message.conversation_id == conversation_id, Message.role == "system")
        .order_by(Message.seq.desc())
        .first()
    )
    return str(m.content) if m is not None else ""


def _normalize_modules(modules: object) -> list[dict]:
    out: list[dict] = []
    if not isinstance(modules, list):
        return out
    for m in modules:
        if not isinstance(m, dict):
            continue
        title = m.get("title")
        objectives = m.get("objectives")
        est = m.get("estimated_minutes")
        if isinstance(title, str) and isinstance(objectives, list) and all(isinstance(x, str) for x in objectives):
            out.append(
                {
                    "title": title.strip(),
                    "objectives": [x.strip() for x in objectives if isinstance(x, str) and x.strip()],
                    "estimated_minutes": int(est) if isinstance(est, (int, float)) else None,
                }
            )
    # de-dupe empty objectives and limit
    out = [m for m in out if m["title"] and m["objectives"]]
    return out[:10]


def _syllabus_outline(course_id: str, db: Session) -> str:
    modules = db.query(Module).filter(Module.course_id == course_id).order_by(Module.order_index.asc()).all()
    if not modules:
        return "(syllabus not confirmed yet)"
    lines = [f"{m.order_index}. {m.title}" for m in modules[:15]]
    return "\n".join(lines)

def _build_chat_prompt(system: str, transcript: list[Message]) -> str:
    # Stronger formatting than "System:" labels for completion-style models.
    # Put the system instructions first and clearly separated.
    parts: list[str] = [
        "INSTRUCTIONS (must follow):\n",
        system.strip(),
        "\n\n---\nCONVERSATION:\n",
    ]
    for m in transcript:
        if m.role == "user":
            parts.append(f"User: {m.content}\n")
        elif m.role == "assistant":
            parts.append(f"Assistant: {m.content}\n")
    parts.append("Assistant:")
    return "".join(parts)

@guru_routes.post("/chat", response_model=ChatResponse)
async def chat(chat_request: ChatRequest, current_user: User = Depends(get_current_user)) -> ChatResponse:
    assert current_user is not None
    logger.info("chat request user=%s", current_user.email)
    agent = registry.get("tutor")
    # Non-session chat: still inject the user's configured system prompt.
    agent.state.metadata["system_prompt"] = build_chat_system_prompt(user_preferences=current_user.preferences or {})
    response = agent.run(chat_request.message)
    return ChatResponse(response=response)

@guru_routes.get("/chat/stream")
async def stream_chat(
    payload: str = Query(..., alias="payload"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    assert current_user is not None
    logger.info("stream chat request user=%s", current_user.email)
    data = json.loads(payload)
    validated_chat_request = ChatRequestSchema(**data)

    user_id = _get_db_user_id(current_user.email, db)
    conversation_id = validated_chat_request.conversation_id
    created_new_conversation = False

    name = _display_name(current_user)

    if conversation_id:
        convo = (
            db.query(Conversation)
            .filter(Conversation.id == conversation_id, Conversation.user_id == user_id)
            .first()
        )
        if convo is None:
            raise HTTPException(status_code=404, detail="Conversation not found")
    else:
        conversation_id = str(uuid4())
        db.add(Conversation(id=conversation_id, user_id=user_id))
        db.commit()
        created_new_conversation = True

    # Ensure there is a system prompt persisted for this conversation, so ChatAgent can be "aware"
    # across requests (and so clients can fetch it via the messages API).
    system_prompt = _latest_system_prompt(conversation_id, db)
    if not system_prompt:
        system_prompt = build_chat_system_prompt(user_preferences=current_user.preferences or {})
        db.add(
            Message(
                id=str(uuid4()),
                conversation_id=conversation_id,
                role="system",
                content=system_prompt,
                seq=_next_seq(conversation_id, db),
            )
        )
        db.commit()

    # If this is a brand-new conversation, add a welcome message first.
    if created_new_conversation:
        greeting = _welcome_message(name=name, context="How can I help you today?")
        db.add(
            Message(
                id=str(uuid4()),
                conversation_id=conversation_id,
                role="assistant",
                content=greeting,
                seq=_next_seq(conversation_id, db),
            )
        )
        db.commit()

    # Persist user message.
    user_msg_id = str(uuid4())
    db.add(
        Message(
            id=user_msg_id,
            conversation_id=conversation_id,
            role="user",
            content=validated_chat_request.message,
            seq=_next_seq(conversation_id, db),
        )
    )
    db.commit()

    # Create fresh agent per request to avoid shared state across users.
    agent = registry.get("tester")
    agent.state.stream = True
    agent.state.history = _load_history_pairs(conversation_id, db)
    agent.state.metadata["system_prompt"] = system_prompt
    agent.state.metadata["max_tokens"] = 150  # Token budget for fast inference
    agent.state.metadata["conversation_id"] = conversation_id  # For semantic history retrieval

    async def stream_generator():
        if created_new_conversation:
            yield f"event: conversation\ndata: {conversation_id}\n\n"
            # Stream the greeting immediately so the user sees it live.
            safe_greet = greeting.replace("\r", "").replace("\n", "\ndata: ")
            yield f"data: {safe_greet}\n\n"

        assistant_chunks: list[str] = []
        try:
            async for chunk in agent.run_stream(validated_chat_request.message):
                logger.debug("streaming chat: %s", chunk)
                assistant_chunks.append(str(chunk))
                # SSE requires each line to be prefixed by "data:".
                safe = str(chunk).replace("\r", "").replace("\n", "\ndata: ")
                yield f"data: {safe}\n\n"
        except Exception as e:
            logger.error("error streaming chat: %s", e)
            safe = str(e).replace("\r", "").replace("\n", " ")
            yield f"data: error: {safe}\n\n"
        else:
            assistant_text = "".join(assistant_chunks)
            if assistant_text:
                assistant_msg_id = str(uuid4())
                db.add(
                    Message(
                        id=assistant_msg_id,
                        conversation_id=conversation_id,
                        role="assistant",
                        content=assistant_text,
                        seq=_next_seq(conversation_id, db),
                    )
                )
                db.commit()
                
                # Store exchange in history vector store
                try:
                    from api.utils.history_manager import store_exchange_from_messages
                    store_exchange_from_messages(conversation_id, user_msg_id, assistant_msg_id, db)
                except Exception as e:
                    import logging
                    logging.getLogger(__name__).warning(f"Failed to store exchange: {e}")
        yield "event: end\ndata: END\n\n"
    return StreamingResponse(
        stream_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            # If behind nginx, this prevents response buffering (safe even if not).
            "X-Accel-Buffering": "no",
        },
    )


@guru_routes.get("/chat/history", response_model=ChatHistoryResponse)
async def chat_history(current_user: User = Depends(get_current_user)) -> ChatHistoryResponse:
    assert current_user is not None
    logger.info("chat history request user=%s", current_user.email)

    # History is stored as a list of (user_input, assistant_output) tuples.
    agent = registry.get("chat")
    raw = getattr(agent.state, "history", []) or []
    items: list[ChatHistoryItem] = []
    for entry in raw:
        if isinstance(entry, tuple) and len(entry) == 2:
            u, a = entry
            if isinstance(u, str) and isinstance(a, str):
                items.append(ChatHistoryItem(user=u, assistant=a))
    return ChatHistoryResponse(history=items)


@guru_routes.get("/conversations", response_model=ConversationListResponse)
async def list_conversations(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> ConversationListResponse:
    assert current_user is not None
    user_id = _get_db_user_id(current_user.email, db)
    convos = (
        db.query(Conversation)
        .filter(Conversation.user_id == user_id)
        .order_by(Conversation.created_at.desc())
        .all()
    )
    return ConversationListResponse(
        conversations=[
            ConversationResponse(
                id=c.id,
                parent_conversation_id=c.parent_conversation_id,
                forked_from_message_id=c.forked_from_message_id,
                created_at=_iso(c.created_at),
                title=c.title,
            )
            for c in convos
        ]
    )


@guru_routes.get("/conversations/{conversation_id}/messages", response_model=MessageListResponse)
async def get_messages(conversation_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> MessageListResponse:
    assert current_user is not None
    user_id = _get_db_user_id(current_user.email, db)
    convo = db.query(Conversation).filter(Conversation.id == conversation_id, Conversation.user_id == user_id).first()
    if convo is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    msgs = (
        db.query(Message)
        .filter(Message.conversation_id == conversation_id)
        .order_by(Message.seq.asc())
        .all()
    )
    return MessageListResponse(
        messages=[
            MessageResponse(
                id=m.id,
                conversation_id=m.conversation_id,
                role=m.role,
                content=m.content,
                seq=m.seq,
                created_at=_iso(m.created_at),
            )
            for m in msgs
        ]
    )


@guru_routes.post("/conversations/{conversation_id}/fork", response_model=ForkResponse)
async def fork_conversation(
    conversation_id: str,
    req: ForkRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ForkResponse:
    assert current_user is not None
    user_id = _get_db_user_id(current_user.email, db)
    convo = db.query(Conversation).filter(Conversation.id == conversation_id, Conversation.user_id == user_id).first()
    if convo is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    pivot = (
        db.query(Message)
        .filter(Message.id == req.from_message_id, Message.conversation_id == conversation_id)
        .first()
    )
    if pivot is None:
        raise HTTPException(status_code=404, detail="Message not found in conversation")

    new_conversation_id = str(uuid4())
    db.add(
        Conversation(
            id=new_conversation_id,
            user_id=user_id,
            parent_conversation_id=conversation_id,
            forked_from_message_id=req.from_message_id,
        )
    )

    msgs = (
        db.query(Message)
        .filter(Message.conversation_id == conversation_id, Message.seq <= pivot.seq)
        .order_by(Message.seq.asc())
        .all()
    )
    for m in msgs:
        db.add(
            Message(
                id=str(uuid4()),
                conversation_id=new_conversation_id,
                role=m.role,
                content=m.content,
                seq=m.seq,
            )
        )
    db.commit()
    return ForkResponse(conversation_id=new_conversation_id)


# ----- Courses / Modules -----

@guru_routes.get("/courses", response_model=CourseListResponse)
async def list_courses(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> CourseListResponse:
    assert current_user is not None
    user_id = _get_db_user_id(current_user.email, db)
    courses = db.query(Course).filter(Course.user_id == user_id).order_by(Course.created_at.desc()).all()
    return CourseListResponse(
        courses=[
            CourseResponse(
                id=c.id,
                title=c.title,
                subject=c.subject,
                goals=c.goals,
                syllabus_confirmed=bool(c.syllabus_confirmed),
                created_at=_iso(c.created_at),
            )
            for c in courses
        ]
    )


@guru_routes.post("/courses", response_model=SyllabusDraftResponse)
async def create_course(req: CreateCourseRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> SyllabusDraftResponse:
    """
    Creates a course. Syllabus generation is done via the streamed syllabus run
    endpoint so the frontend can show real-time progress.
    """
    assert current_user is not None
    user_id = _get_db_user_id(current_user.email, db)

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


@guru_routes.post("/courses/{course_id}/syllabus/confirm", response_model=ConfirmSyllabusResponse)
async def confirm_syllabus(course_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> ConfirmSyllabusResponse:
    assert current_user is not None
    user_id = _get_db_user_id(current_user.email, db)
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


@guru_routes.get("/courses/{course_id}", response_model=CourseModulesResponse)
async def get_course(course_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> CourseModulesResponse:
    assert current_user is not None
    user_id = _get_db_user_id(current_user.email, db)
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
            created_at=_iso(course.created_at),
        ),
        modules=[
            ModuleResponse(
                id=m.id,
                course_id=m.course_id,
                title=m.title,
                order_index=m.order_index,
                objectives=m.objectives or [],
                estimated_minutes=m.estimated_minutes,
                created_at=_iso(m.created_at),
                passed=bool(prog_by_mid.get(m.id).passed) if prog_by_mid.get(m.id) else False,
                best_score=float(prog_by_mid.get(m.id).best_score) if prog_by_mid.get(m.id) else 0.0,
                attempts_count=int(prog_by_mid.get(m.id).attempts_count) if prog_by_mid.get(m.id) else 0,
            )
            for m in modules
        ],
    )


@guru_routes.post("/modules/{module_id}/test/start", response_model=StartModuleTestResponse)
async def start_module_test(module_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> StartModuleTestResponse:
    assert current_user is not None
    user_id = _get_db_user_id(current_user.email, db)
    module = (
        db.query(Module)
        .join(Course, Course.id == Module.course_id)
        .filter(Module.id == module_id, Course.user_id == user_id)
        .first()
    )
    if module is None:
        raise HTTPException(status_code=404, detail="Module not found")

    conversation_id = str(uuid4())
    db.add(Conversation(id=conversation_id, user_id=user_id))
    db.commit()

    attempt_id = str(uuid4())
    db.add(ModuleTestAttempt(id=attempt_id, user_id=user_id, module_id=module_id, conversation_id=conversation_id))
    db.commit()

    sys_msg = build_test_system_prompt(module_title=module.title, objectives=list(module.objectives or []), compressed=True)
    db.add(
        Message(
            id=str(uuid4()),
            conversation_id=conversation_id,
            role="system",
            content=sys_msg,
            seq=_next_seq(conversation_id, db),
        )
    )
    name = _display_name(current_user)
    greeting = _welcome_message(name=name, context=f"Ready for a quick test on “{module.title}”? Reply 'start' to begin.")
    db.add(
        Message(
            id=str(uuid4()),
            conversation_id=conversation_id,
            role="assistant",
            content=greeting,
            seq=_next_seq(conversation_id, db),
        )
    )
    db.commit()
    return StartModuleTestResponse(attempt_id=attempt_id, conversation_id=conversation_id, greeting=greeting)


@guru_routes.post("/modules/{module_id}/learn/start", response_model=StartLearningSessionResponse)
async def start_learning_session(module_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> StartLearningSessionResponse:
    assert current_user is not None
    user_id = _get_db_user_id(current_user.email, db)
    module = (
        db.query(Module)
        .join(Course, Course.id == Module.course_id)
        .filter(Module.id == module_id, Course.user_id == user_id)
        .first()
    )
    if module is None:
        raise HTTPException(status_code=404, detail="Module not found")

    conversation_id = str(uuid4())
    db.add(Conversation(id=conversation_id, user_id=user_id, title=f"Learn: {module.title}"))
    db.commit()

    session_id = str(uuid4())
    db.add(ModuleLearningSession(id=session_id, user_id=user_id, module_id=module_id, conversation_id=conversation_id))
    db.commit()

    # Pull course context + current module progress to ground the tutor.
    course = db.query(Course).filter(Course.id == module.course_id).first()
    prog = db.query(ModuleProgress).filter(ModuleProgress.user_id == user_id, ModuleProgress.module_id == module_id).first()
    sys_msg = build_tutor_system_prompt(
        user_name=_display_name(current_user),
        course_title=course.title if course else "",
        course_subject=course.subject if course else "",
        course_goals=course.goals if course else None,
        syllabus_outline=_syllabus_outline(module.course_id, db),
        module_title=module.title,
        module_order_index=int(module.order_index),
        objectives=list(module.objectives or []),
        progress_best_score=float(prog.best_score) if prog else 0.0,
        progress_attempts=int(prog.attempts_count) if prog else 0,
        progress_passed=bool(prog.passed) if prog else False,
        compressed=True,  # Use compressed prompt for 150 token constraint
    )
    db.add(
        Message(
            id=str(uuid4()),
            conversation_id=conversation_id,
            role="system",
            content=sys_msg,
            seq=_next_seq(conversation_id, db),
        )
    )
    name = _display_name(current_user)
    greeting = _welcome_message(name=name, context=f"Let’s learn “{module.title}”. Tell me what you already know, or ask your first question.")
    db.add(
        Message(
            id=str(uuid4()),
            conversation_id=conversation_id,
            role="assistant",
            content=greeting,
            seq=_next_seq(conversation_id, db),
        )
    )
    db.commit()

    return StartLearningSessionResponse(session_id=session_id, conversation_id=conversation_id, greeting=greeting)


def _retrieve_and_format_history(query: str, conversation_id: str, max_tokens: int = 150) -> Optional[str]:
    """
    Helper function to retrieve history and format it for display.
    Returns formatted history text or None if retrieval fails.
    """
    try:
        from api.utils.history_store import get_history_store
        from api.utils.token_budget import estimate_tokens
        
        # Calculate available budget for history
        query_tokens = estimate_tokens(query)
        formatting_overhead = 15
        available_for_system_and_history = max_tokens - query_tokens - formatting_overhead
        history_budget = int((available_for_system_and_history - int(available_for_system_and_history * 0.4)) * 0.6)
        
        # Retrieve relevant history
        history_store = get_history_store()
        retrieved_history = history_store.retrieve_relevant_history(
            query=query,
            conversation_id=conversation_id,
            max_tokens=history_budget,
            k=10,
            include_last=True
        )
        
        # Format for display
        if retrieved_history:
            history_display = []
            for u, a in retrieved_history:
                history_display.append(f"User: {u}\nAssistant: {a}")
            return "\n\n".join(history_display)
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Failed to retrieve history for display: {e}")
    return None


@guru_routes.get("/learning/{conversation_id}/stream")
async def stream_learning(
    conversation_id: str,
    payload: str = Query(..., alias="payload"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """
    Streams a tutor response inside a learning session conversation.
    """
    assert current_user is not None
    user_id = _get_db_user_id(current_user.email, db)
    convo = db.query(Conversation).filter(Conversation.id == conversation_id, Conversation.user_id == user_id).first()
    if convo is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    data = json.loads(payload)
    validated = ChatRequestSchema(**data)

    db.add(
        Message(
            id=str(uuid4()),
            conversation_id=conversation_id,
            role="user",
            content=validated.message,
            seq=_next_seq(conversation_id, db),
        )
    )
    db.commit()

    # Use ChatAgent for coherent behavior; inject the stored system prompt into the agent state.
    transcript = db.query(Message).filter(Message.conversation_id == conversation_id).order_by(Message.seq.asc()).all()
    system = next((m.content for m in transcript if m.role == "system"), "")
    if not (isinstance(system, str) and system.strip()):
        # Robustness: legacy/migrated conversations may have no system message persisted.
        sess = (
            db.query(ModuleLearningSession)
            .filter(ModuleLearningSession.conversation_id == conversation_id, ModuleLearningSession.user_id == user_id)
            .first()
        )
        if sess is not None:
            module = (
                db.query(Module)
                .join(Course, Course.id == Module.course_id)
                .filter(Module.id == sess.module_id, Course.user_id == user_id)
                .first()
            )
            if module is not None:
                course = db.query(Course).filter(Course.id == module.course_id).first()
                prog = (
                    db.query(ModuleProgress)
                    .filter(ModuleProgress.user_id == user_id, ModuleProgress.module_id == module.id)
                    .first()
                )
                system = build_tutor_system_prompt(
                    user_name=_display_name(current_user),
                    course_title=course.title if course else "",
                    course_subject=course.subject if course else "",
                    course_goals=course.goals if course else None,
                    syllabus_outline=_syllabus_outline(module.course_id, db),
                    module_title=module.title,
                    module_order_index=int(module.order_index),
                    objectives=list(module.objectives or []),
                    progress_best_score=float(prog.best_score) if prog else 0.0,
                    progress_attempts=int(prog.attempts_count) if prog else 0,
                    progress_passed=bool(prog.passed) if prog else False,
                )
                db.add(
                    Message(
                        id=str(uuid4()),
                        conversation_id=conversation_id,
                        role="system",
                        content=system,
                        seq=_next_seq(conversation_id, db),
                    )
                )
                db.commit()
    pairs = []
    pending_user = None
    for m in transcript:
        if m.role == "user":
            pending_user = m.content
        elif m.role == "assistant" and pending_user is not None:
            pairs.append((pending_user, m.content))
            pending_user = None
    # Store user message first
    user_msg_id = str(uuid4())
    db.add(
        Message(
            id=user_msg_id,
            conversation_id=conversation_id,
            role="user",
            content=validated.message,
            seq=_next_seq(conversation_id, db),
        )
    )
    db.commit()
    
    agent = registry.get("chat")
    agent.state.stream = True
    agent.state.history = pairs
    agent.state.metadata["system_prompt"] = system
    agent.state.metadata["max_tokens"] = 150  # Token budget for fast inference
    agent.state.metadata["conversation_id"] = conversation_id  # For semantic history retrieval

    async def gen():
        # Debug/trace: emit the exact system prompt the agent will use.
        yield f"event: system_prompt\ndata: {json.dumps({'system_prompt': agent.state.metadata.get('system_prompt', '')})}\n\n"
        
        # Retrieve and emit history retrieval event
        retrieved_history_text = _retrieve_and_format_history(
            validated.message,
            conversation_id,
            agent.state.metadata.get("max_tokens", 150)
        )
        if retrieved_history_text:
            yield f"event: history_retrieved\ndata: {json.dumps({'history': retrieved_history_text})}\n\n"
        
        chunks: list[str] = []
        try:
            async for c in agent.run_stream(validated.message):
                chunks.append(str(c))
                safe = str(c).replace("\r", "").replace("\n", "\ndata: ")
                yield f"data: {safe}\n\n"
        finally:
            text = "".join(chunks)
            if text:
                assistant_msg_id = str(uuid4())
                db.add(
                    Message(
                        id=assistant_msg_id,
                        conversation_id=conversation_id,
                        role="assistant",
                        content=text,
                        seq=_next_seq(conversation_id, db),
                    )
                )
                db.commit()
                
                # Store exchange in history vector store
                try:
                    from api.utils.history_manager import store_exchange_from_messages
                    store_exchange_from_messages(conversation_id, user_msg_id, assistant_msg_id, db)
                except Exception as e:
                    import logging
                    logging.getLogger(__name__).warning(f"Failed to store exchange: {e}")
            yield "event: end\ndata: END\n\n"

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@guru_routes.get("/tests/{attempt_id}/stream")
async def stream_test(
    attempt_id: str,
    payload: str = Query(..., alias="payload"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    assert current_user is not None
    user_id = _get_db_user_id(current_user.email, db)
    attempt = db.query(ModuleTestAttempt).filter(ModuleTestAttempt.id == attempt_id, ModuleTestAttempt.user_id == user_id).first()
    if attempt is None:
        raise HTTPException(status_code=404, detail="Attempt not found")

    data = json.loads(payload)
    validated = ChatRequestSchema(**data)
    convo_id = attempt.conversation_id

    user_msg_id = str(uuid4())
    db.add(
        Message(
            id=user_msg_id,
            conversation_id=convo_id,
            role="user",
            content=validated.message,
            seq=_next_seq(convo_id, db),
        )
    )
    db.commit()

    transcript = db.query(Message).filter(Message.conversation_id == convo_id).order_by(Message.seq.asc()).all()
    system = next((m.content for m in transcript if m.role == "system"), "")
    if not (isinstance(system, str) and system.strip()):
        # Robustness: legacy/migrated conversations may have no system message persisted.
        module = (
            db.query(Module)
            .join(Course, Course.id == Module.course_id)
            .filter(Module.id == attempt.module_id, Course.user_id == user_id)
            .first()
        )
        if module is not None:
            system = build_test_system_prompt(module_title=module.title, objectives=list(module.objectives or []), compressed=True)
            db.add(
                Message(
                    id=str(uuid4()),
                    conversation_id=convo_id,
                    role="system",
                    content=system,
                    seq=_next_seq(convo_id, db),
                )
            )
            db.commit()
    pairs = []
    pending_user = None
    for m in transcript:
        if m.role == "user":
            pending_user = m.content
        elif m.role == "assistant" and pending_user is not None:
            pairs.append((pending_user, m.content))
            pending_user = None
    # Store user message first
    user_msg_id = str(uuid4())
    db.add(
        Message(
            id=user_msg_id,
            conversation_id=convo_id,
            role="user",
            content=validated.message,
            seq=_next_seq(convo_id, db),
        )
    )
    db.commit()
    
    agent = registry.get("chat")
    agent.state.stream = True
    agent.state.history = pairs
    agent.state.metadata["system_prompt"] = system
    agent.state.metadata["max_tokens"] = 150  # Token budget for fast inference
    agent.state.metadata["conversation_id"] = convo_id  # For semantic history retrieval

    async def gen():
        # Debug/trace: emit the exact system prompt the agent will use.
        yield f"event: system_prompt\ndata: {json.dumps({'system_prompt': agent.state.metadata.get('system_prompt', '')})}\n\n"
        
        # Retrieve and emit history retrieval event
        retrieved_history_text = _retrieve_and_format_history(
            validated.message,
            convo_id,
            agent.state.metadata.get("max_tokens", 150)
        )
        if retrieved_history_text:
            yield f"event: history_retrieved\ndata: {json.dumps({'history': retrieved_history_text})}\n\n"
        
        chunks: list[str] = []
        try:
            async for c in agent.run_stream(validated.message):
                chunks.append(str(c))
                safe = str(c).replace("\r", "").replace("\n", "\ndata: ")
                yield f"data: {safe}\n\n"
        finally:
            text = "".join(chunks)
            if text:
                assistant_msg_id = str(uuid4())
                db.add(
                    Message(
                        id=assistant_msg_id,
                        conversation_id=convo_id,
                        role="assistant",
                        content=text,
                        seq=_next_seq(convo_id, db),
                    )
                )
                db.commit()
                
                # Store exchange in history vector store
                try:
                    from api.utils.history_manager import store_exchange_from_messages
                    store_exchange_from_messages(convo_id, user_msg_id, assistant_msg_id, db)
                except Exception as e:
                    import logging
                    logging.getLogger(__name__).warning(f"Failed to store exchange: {e}")
            yield "event: end\ndata: END\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")


@guru_routes.post("/tests/{attempt_id}/grade", response_model=GradeModuleTestResponse)
async def grade_test(attempt_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> GradeModuleTestResponse:
    assert current_user is not None
    user_id = _get_db_user_id(current_user.email, db)
    attempt = db.query(ModuleTestAttempt).filter(ModuleTestAttempt.id == attempt_id, ModuleTestAttempt.user_id == user_id).first()
    if attempt is None:
        raise HTTPException(status_code=404, detail="Attempt not found")
    module = db.query(Module).filter(Module.id == attempt.module_id).first()
    if module is None:
        raise HTTPException(status_code=404, detail="Module not found")

    msgs = db.query(Message).filter(Message.conversation_id == attempt.conversation_id).order_by(Message.seq.asc()).all()
    transcript = "\n".join([f"{m.role}: {m.content}" for m in msgs if m.role in ("user", "assistant")])
    objectives = module.objectives or []
    rubric_prompt = (
        "You are grading a module test attempt.\n"
        "Return ONLY valid JSON (no markdown) with this shape:\n"
        "{ \"score\": float, \"passed\": bool, \"feedback\": {\"summary\": str} }\n\n"
        f"Module: {module.title}\nObjectives: {objectives}\n\n"
        f"Transcript:\n{transcript}\n"
        "Pass if score >= 0.7.\n"
    )
    llm = registry.get("chat").llm
    raw = llm.generate(rubric_prompt)
    score = 0.0
    passed = False
    feedback = None
    try:
        parsed = json.loads(raw)
        score = float(parsed.get("score", 0.0))
        passed = bool(parsed.get("passed", False))
        feedback = parsed.get("feedback")
    except Exception:
        score = 0.0
        passed = False

    attempt.score = score
    attempt.passed = passed
    attempt.completed_at = datetime.utcnow()
    attempt.feedback = feedback
    db.add(attempt)

    prog = db.query(ModuleProgress).filter(ModuleProgress.user_id == user_id, ModuleProgress.module_id == module.id).first()
    if prog is None:
        prog = ModuleProgress(
            id=str(uuid4()),
            user_id=user_id,
            module_id=module.id,
            best_score=0.0,
            attempts_count=0,
            passed=False,
            updated_at=datetime.utcnow(),
        )
    prog.attempts_count = int(prog.attempts_count) + 1
    if score > float(prog.best_score):
        prog.best_score = score
    if passed and not prog.passed:
        prog.passed = True
        prog.passed_at = datetime.utcnow()
    prog.updated_at = datetime.utcnow()
    db.add(prog)
    db.commit()

    return GradeModuleTestResponse(attempt_id=attempt_id, score=score, passed=passed, feedback=feedback)


# ----- Syllabus run (streamed) -----

@guru_routes.post("/courses/{course_id}/syllabus/run", response_model=StartSyllabusRunResponse)
async def start_syllabus_run(course_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> StartSyllabusRunResponse:
    assert current_user is not None
    user_id = _get_db_user_id(current_user.email, db)
    course = db.query(Course).filter(Course.id == course_id, Course.user_id == user_id).first()
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")
    run_id = str(uuid4())
    db.add(SyllabusRun(id=run_id, user_id=user_id, course_id=course_id, status="running", phase="generate"))
    db.commit()
    return StartSyllabusRunResponse(run_id=run_id)


@guru_routes.get("/syllabus/runs/{run_id}", response_model=SyllabusRunStatusResponse)
async def get_syllabus_run(run_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> SyllabusRunStatusResponse:
    assert current_user is not None
    user_id = _get_db_user_id(current_user.email, db)
    run = db.query(SyllabusRun).filter(SyllabusRun.id == run_id, SyllabusRun.user_id == user_id).first()
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return SyllabusRunStatusResponse(
        run_id=run.id,
        course_id=run.course_id,
        status=run.status,
        phase=run.phase,
        updated_at=_iso(run.updated_at),
        result=run.result,
        critic=run.critic,
        error=run.error,
    )


@guru_routes.get("/syllabus/runs/{run_id}/stream")
async def stream_syllabus_run(
    run_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """
    Streams syllabus generation + critic evaluation in phases.
    Persist events and final draft to Course.
    """
    assert current_user is not None
    user_id = _get_db_user_id(current_user.email, db)
    run = db.query(SyllabusRun).filter(SyllabusRun.id == run_id, SyllabusRun.user_id == user_id).first()
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")

    course = db.query(Course).filter(Course.id == run.course_id, Course.user_id == user_id).first()
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")

    llm = registry.get("chat").llm

    async def gen():
        def emit(phase: str | None, type_: str, data: dict | None = None):
            db.add(SyllabusEvent(id=str(uuid4()), run_id=run_id, phase=phase, type=type_, data=data))
            db.commit()
            payload = {"phase": phase, "type": type_, "data": data}
            return f"event: {type_}\ndata: {json.dumps(payload)}\n\n"

        try:
            # Phase: generate
            run.phase = "generate"
            run.updated_at = datetime.utcnow()
            db.add(run)
            db.commit()
            yield emit("generate", "phase_start")

            prompt = build_syllabus_generation_prompt(title=course.title, subject=course.subject, goals=course.goals)
            buf: list[str] = []
            async for tok in llm.stream(prompt):
                buf.append(str(tok))
                yield emit("generate", "token", {"t": str(tok)})
            raw = "".join(buf)
            try:
                parsed = json.loads(raw)
                modules = _normalize_modules(parsed.get("modules"))
            except Exception:
                modules = []
            run.result = {"modules": modules}
            db.add(run)
            db.commit()
            yield emit("generate", "result", {"modules": modules})

            # Phase: critic
            run.phase = "critic"
            run.updated_at = datetime.utcnow()
            db.add(run)
            db.commit()
            yield emit("critic", "phase_start")

            cbuf: list[str] = []
            async for tok in llm.stream(build_syllabus_critic_prompt(subject=course.subject, modules=modules, goals=course.goals)):
                cbuf.append(str(tok))
                yield emit("critic", "token", {"t": str(tok)})
            craw = "".join(cbuf)
            try:
                cparsed = json.loads(craw)
            except Exception:
                cparsed = {"approved": False, "issues": ["critic_parse_failed"], "revised_modules": []}
            run.critic = cparsed
            db.add(run)
            db.commit()
            yield emit("critic", "result", cparsed)

            approved = bool(cparsed.get("approved"))
            revised = _normalize_modules(cparsed.get("revised_modules"))
            if (not approved) and revised:
                # Phase: revise/finalize
                run.phase = "revise"
                run.updated_at = datetime.utcnow()
                db.add(run)
                db.commit()
                yield emit("revise", "phase_start")
                modules = revised
                run.result = {"modules": modules}
                db.add(run)
                db.commit()
                yield emit("revise", "result", {"modules": modules})

            # Finalize: persist to Course as draft
            run.phase = "finalize"
            run.status = "completed"
            run.updated_at = datetime.utcnow()
            db.add(run)
            course.syllabus_draft = {"modules": modules}
            db.add(course)
            db.commit()
            yield emit("finalize", "done", {"approved": bool(cparsed.get("approved")), "modules_count": len(modules)})
        except Exception as e:
            run.status = "failed"
            run.error = str(e)
            run.updated_at = datetime.utcnow()
            db.add(run)
            db.commit()
            yield f"event: error\ndata: {json.dumps({'phase': run.phase, 'type': 'error', 'data': {'error': str(e)}})}\n\n"
        finally:
            yield "event: end\ndata: END\n\n"

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
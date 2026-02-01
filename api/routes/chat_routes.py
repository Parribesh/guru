"""
Chat routes: conversations (list, get messages, create, fork) and chat agent streaming.
A conversation is chat; chat routes own all conversation CRUD and streaming.
"""

import json
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session as DBSession

from api.config import get_db
from api.models.session import Session, SessionType, SessionStatus
from api.schemas.chat_schemas import (
    ConversationListResponse,
    ConversationResponse,
    ForkRequest,
    ForkResponse,
    MessageListResponse,
    MessageResponse,
)
from api.schemas.user_schemas import User
from api.utils.auth import get_current_user
from api.utils.common import get_db_user_id, iso_format
from api.services.chat_service import ChatService

chat_routes = APIRouter()


# ---- Conversation CRUD (chat owns conversations) ----

@chat_routes.get("/conversations", response_model=ConversationListResponse)
async def list_conversations(
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
) -> ConversationListResponse:
    """List all conversations (chats) for the current user."""
    assert current_user is not None
    user_id = get_db_user_id(current_user.email, db)
    chat_service = ChatService(db)
    convos = chat_service.list_conversations(user_id)
    return ConversationListResponse(
        conversations=[
            ConversationResponse(
                id=c.id,
                parent_conversation_id=c.parent_conversation_id,
                forked_from_message_id=c.forked_from_message_id,
                created_at=iso_format(c.created_at),
                title=c.title,
            )
            for c in convos
        ]
    )


@chat_routes.get("/conversations/{conversation_id}/messages", response_model=MessageListResponse)
async def get_messages(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
) -> MessageListResponse:
    """Get all messages for a conversation (chat)."""
    assert current_user is not None
    user_id = get_db_user_id(current_user.email, db)
    chat_service = ChatService(db)
    convo = chat_service.get_conversation(conversation_id, user_id)
    if convo is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    msgs = chat_service.get_messages(conversation_id)
    return MessageListResponse(
        messages=[
            MessageResponse(
                id=m.id,
                conversation_id=m.conversation_id,
                role=m.role,
                content=m.content,
                seq=m.seq,
                created_at=iso_format(m.created_at),
                interaction_metadata=m.interaction_metadata,
            )
            for m in msgs
        ]
    )


@chat_routes.post("/conversations", response_model=dict)
async def create_conversation(
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
) -> dict:
    """Create a new conversation (chat). Returns conversation_id. Used by sessions that need a chat channel."""
    assert current_user is not None
    user_id = get_db_user_id(current_user.email, db)
    chat_service = ChatService(db)
    conversation_id = chat_service.create_conversation(user_id)
    db.commit()
    return {"conversation_id": conversation_id}


@chat_routes.post("/conversations/{conversation_id}/fork", response_model=ForkResponse)
async def fork_conversation(
    conversation_id: str,
    req: ForkRequest,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
) -> ForkResponse:
    """Fork a conversation from a specific message."""
    assert current_user is not None
    user_id = get_db_user_id(current_user.email, db)
    chat_service = ChatService(db)
    new_id = chat_service.fork_conversation(conversation_id, req.from_message_id, user_id)
    if new_id is None:
        raise HTTPException(status_code=404, detail="Conversation or message not found")
    db.commit()
    return ForkResponse(conversation_id=new_id)


# ---- Chat agent streaming (learning session Q&A channel) ----

@chat_routes.get("/learning/chat/{conversation_id}/stream")
async def learning_chat_stream(
    conversation_id: str,
    payload: str = Query(..., description="JSON with message and conversation_id"),
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
) -> StreamingResponse:
    """
    Stream chat agent response for a learning session (Q&A channel).
    Looks up session by chat conversation_id (Session.chat_conversation_id), runs chat agent with session context.
    """
    assert current_user is not None
    user_id = get_db_user_id(current_user.email, db)

    session = (
        db.query(Session)
        .filter(Session.user_id == user_id)
        .filter(Session.chat_conversation_id == conversation_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found for this chat conversation")
    if session.session_type == SessionType.SYLLABUS:
        raise HTTPException(status_code=400, detail="Cannot stream messages for syllabus session")
    if session.status != SessionStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Session is not active")

    try:
        payload_data = json.loads(payload)
    except (json.JSONDecodeError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid payload JSON")
    message_content = (payload_data.get("message") or "").strip()
    if not message_content:
        raise HTTPException(status_code=400, detail="payload.message is required")

    chat_service = ChatService(db)
    return chat_service.stream_response(session, conversation_id, message_content)

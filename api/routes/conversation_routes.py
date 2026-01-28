"""
Conversation management endpoints.
"""

from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from api.config import get_db
from api.models.models import Conversation, Message
from api.schemas.guru_schemas import (
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

conversation_routes = APIRouter()


@conversation_routes.get("/conversations", response_model=ConversationListResponse)
async def list_conversations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> ConversationListResponse:
    """List all conversations for the current user."""
    assert current_user is not None
    user_id = get_db_user_id(current_user.email, db)
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
                created_at=iso_format(c.created_at),
                title=c.title,
            )
            for c in convos
        ]
    )


@conversation_routes.get("/conversations/{conversation_id}/messages", response_model=MessageListResponse)
async def get_messages(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> MessageListResponse:
    """Get all messages for a conversation."""
    assert current_user is not None
    user_id = get_db_user_id(current_user.email, db)
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
                created_at=iso_format(m.created_at),
                interaction_metadata=m.interaction_metadata,
            )
            for m in msgs
        ]
    )


@conversation_routes.post("/conversations/{conversation_id}/fork", response_model=ForkResponse)
async def fork_conversation(
    conversation_id: str,
    req: ForkRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ForkResponse:
    """Fork a conversation from a specific message."""
    assert current_user is not None
    user_id = get_db_user_id(current_user.email, db)
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


"""
Chat, conversation, and message schemas.
"""

from pydantic import BaseModel
from typing import Optional, Literal


class ChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None


class ChatResponse(BaseModel):
    response: str


class EventSourceResponse(BaseModel):
    event: str
    data: str


class ChatHistoryItem(BaseModel):
    user: str
    assistant: str


class ChatHistoryResponse(BaseModel):
    history: list[ChatHistoryItem]


class ConversationResponse(BaseModel):
    id: str
    parent_conversation_id: Optional[str] = None
    forked_from_message_id: Optional[str] = None
    created_at: str
    title: Optional[str] = None


class MessageResponse(BaseModel):
    id: str
    conversation_id: str
    role: Literal["user", "assistant", "system", "tool"]
    content: str
    seq: int
    created_at: str
    interaction_metadata: Optional[dict] = None


class ConversationListResponse(BaseModel):
    conversations: list[ConversationResponse]


class MessageListResponse(BaseModel):
    messages: list[MessageResponse]


class ForkRequest(BaseModel):
    from_message_id: str


class ForkResponse(BaseModel):
    conversation_id: str


class SendMessageRequest(BaseModel):
    """Body for POST /guru/sessions/{session_id}/messages."""
    content: str


class SendMessageResponse(BaseModel):
    """Response after sending a message: assistant turn persisted and history synced."""
    user_message_id: str
    assistant_message_id: str
    assistant_content: str
    assistant_seq: int
    created_at: str  # ISO format of assistant message


class SubmitTestRequest(BaseModel):
    """Body for POST /guru/sessions/{session_id}/submit-test."""
    score: float  # 0.0 .. 1.0 or 0-100 depending on convention
    passed: bool

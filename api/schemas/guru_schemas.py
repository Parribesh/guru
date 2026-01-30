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
    interaction_metadata: Optional[dict] = None  # Store retrieved_history, system_prompt, etc.


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


# ----- Courses / Modules -----

class CreateCourseRequest(BaseModel):
    title: str
    subject: str
    goals: Optional[str] = None
    # Optional: target weeks, hours/week etc. kept minimal for now.


class CourseResponse(BaseModel):
    id: str
    title: str
    subject: str
    goals: Optional[str] = None
    syllabus_confirmed: bool
    created_at: str


class CourseListResponse(BaseModel):
    courses: list[CourseResponse]


class SyllabusDraftModule(BaseModel):
    title: str
    objectives: list[str]
    estimated_minutes: Optional[int] = None


class SyllabusDraftResponse(BaseModel):
    course_id: str
    modules: list[SyllabusDraftModule]


class ConfirmSyllabusResponse(BaseModel):
    course_id: str
    module_ids: list[str]


class ModuleResponse(BaseModel):
    id: str
    course_id: str
    title: str
    order_index: int
    objectives: list[str]
    estimated_minutes: Optional[int] = None
    created_at: str
    # progress snapshot
    passed: bool
    best_score: float
    attempts_count: int


class CourseModulesResponse(BaseModel):
    course: CourseResponse
    modules: list[ModuleResponse]


class StartSyllabusRunResponse(BaseModel):
    run_id: str


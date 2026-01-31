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


class SyllabusBuilderState(BaseModel):
    """
    Full syllabus builder state (graph state). Sent in WebSocket and step response.
    All keys optional; presence indicates current agent state for frontend display.
    """
    # Course context
    course_title: Optional[str] = None
    subject: Optional[str] = None
    goals: Optional[str] = None
    target_level: Optional[str] = None
    # Pipeline
    next_node: Optional[str] = None  # next node to run: generate_concepts, validate, add_concepts, add_module
    current_level: Optional[str] = None  # beginner | intermediate | advanced
    current_concepts: Optional[list] = None
    meets_threshold: Optional[bool] = None
    needed_count: Optional[int] = None
    add_concepts_rounds: Optional[int] = None
    # Syllabus result (accumulated)
    modules: Optional[list] = None  # [{ title, objectives, estimated_minutes, dependencies }]
    concepts_by_level: Optional[dict] = None  # { level: [concepts] }
    # Step visibility (last node run)
    step_prompt: Optional[str] = None  # user prompt sent to LLM (or validator description)
    step_output: Optional[str] = None  # JSON or description of node output
    # Base agent system prompt (scenario); single system prompt for the run
    system_prompt: Optional[str] = None
    # Agent info (which agent and model used for inference)
    agent: Optional[str] = None
    inference_model: Optional[str] = None
    # Misc
    current_stage: Optional[str] = None
    error: Optional[str] = None

    class Config:
        extra = "allow"  # allow additional keys from graph


class SyllabusBuilderPayload(BaseModel):
    """
    Payload sent over WebSocket and returned from POST .../step.
    Single place for frontend to read current agent state and metadata.
    """
    stage: str  # last node run: generate_concepts, validate, add_concepts, add_module
    state: dict  # SyllabusBuilderState shape (full graph state)
    done: bool  # True when syllabus generation is complete
    agent: Optional[str] = None  # agent name used for inference (e.g. SyllabusAgent)
    inference_model: Optional[str] = None  # Ollama model used (e.g. qwen:latest)


class SyllabusStepResponse(SyllabusBuilderPayload):
    """Response from POST /syllabus/runs/{run_id}/step. Same shape as WebSocket payload."""
    pass


class SyllabusRunResponse(BaseModel):
    """Response from GET /syllabus/runs/{run_id} (run status and state)."""
    run_id: str
    course_id: str  # for rerun from same course
    status: str  # running | completed | failed
    state_snapshot: dict | None  # current graph state (for step-by-step UI)
    result: dict | None  # final modules/concepts when status=completed
    agent: Optional[str] = None  # agent used for inference
    inference_model: Optional[str] = None  # Ollama model used for inference


class SyllabusRunListItem(BaseModel):
    run_id: str
    course_id: str
    status: str
    phase: str | None


class ListSyllabusRunsResponse(BaseModel):
    """Response from GET /syllabus/runs?status=running (list for dashboard)."""
    runs: list[SyllabusRunListItem]


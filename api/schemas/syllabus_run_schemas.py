"""
Syllabus builder run schemas (step response, WebSocket payload, run status).
"""

from pydantic import BaseModel
from typing import Optional


class StartSyllabusRunResponse(BaseModel):
    run_id: str


class SyllabusBuilderState(BaseModel):
    """
    Full syllabus builder state (graph state). Sent in WebSocket and step response.
    All keys optional; presence indicates current agent state for frontend display.
    """
    course_title: Optional[str] = None
    subject: Optional[str] = None
    goals: Optional[str] = None
    target_level: Optional[str] = None
    next_node: Optional[str] = None
    current_level: Optional[str] = None
    current_concepts: Optional[list] = None
    meets_threshold: Optional[bool] = None
    needed_count: Optional[int] = None
    add_concepts_rounds: Optional[int] = None
    modules: Optional[list] = None
    concepts_by_level: Optional[dict] = None
    step_prompt: Optional[str] = None
    step_output: Optional[str] = None
    system_prompt: Optional[str] = None
    agent: Optional[str] = None
    inference_model: Optional[str] = None
    current_stage: Optional[str] = None
    error: Optional[str] = None

    class Config:
        extra = "allow"


class SyllabusBuilderPayload(BaseModel):
    """
    Payload sent over WebSocket and returned from POST .../step.
    Single place for frontend to read current agent state and metadata.
    """
    stage: str
    state: dict
    done: bool
    agent: Optional[str] = None
    inference_model: Optional[str] = None


class SyllabusStepResponse(SyllabusBuilderPayload):
    """Response from POST /syllabus/runs/{run_id}/step. Same shape as WebSocket payload."""
    pass


class SyllabusRunResponse(BaseModel):
    """Response from GET /syllabus/runs/{run_id} (run status and state)."""
    run_id: str
    course_id: str
    status: str
    state_snapshot: dict | None
    result: dict | None
    agent: Optional[str] = None
    inference_model: Optional[str] = None


class SyllabusRunListItem(BaseModel):
    run_id: str
    course_id: str
    status: str
    phase: str | None


class ListSyllabusRunsResponse(BaseModel):
    """Response from GET /syllabus/runs?status=running (list for dashboard)."""
    runs: list[SyllabusRunListItem]

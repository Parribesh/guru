"""
Syllabus generation endpoints.

Standalone flow: no Session or Conversation. Creates SyllabusRun and streams
via SyllabusService (SyllabusAgent.run_stream() → SSE metadata_update).
WebSocket /guru/ws/syllabus/runs/{run_id} broadcasts state so every run is visible in the frontend.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from api.config import get_db
from api.models.models import Course, User as DbUser
from api.schemas.guru_schemas import (
    ListSyllabusRunsResponse,
    StartSyllabusRunResponse,
    SyllabusRunListItem,
    SyllabusRunResponse,
    SyllabusStepResponse,
)
from api.schemas.user_schemas import User
from api.services.syllabus_service import SyllabusService
from api.utils.auth import get_current_user, get_user_from_websocket
from api.utils.common import get_db_user_id
from api.ws import broadcast_syllabus_state, subscribe_syllabus_run, unsubscribe_syllabus_run

syllabus_routes = APIRouter()


@syllabus_routes.post("/courses/{course_id}/syllabus/run", response_model=StartSyllabusRunResponse)
async def start_syllabus_run(
    course_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> StartSyllabusRunResponse:
    """
    Start a syllabus generation run for the course.
    Returns run_id. Use GET /guru/syllabus/runs/{run_id}/stream to stream.
    """
    assert current_user is not None
    user_id = get_db_user_id(current_user.email, db)
    course = db.query(Course).filter(Course.id == course_id, Course.user_id == user_id).first()
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")
    try:
        syllabus_service = SyllabusService(db)
        run_id = syllabus_service.start_run(course_id, user_id)
        # Resolve agent/model for run event (user prefs)
        user = db.query(DbUser).filter(DbUser.id == user_id).first()
        prefs = user.preferences if user and isinstance(user.preferences, dict) else {}
        inference_model = prefs.get("ollama_model") or "qwen:latest"
        initial = {
            "stage": "planning",
            "state": {"next_node": "planning", "modules": []},
            "done": False,
            "agent": "SyllabusAgent",
            "inference_model": inference_model,
        }
        await broadcast_syllabus_state(run_id, initial)
        return StartSyllabusRunResponse(run_id=run_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@syllabus_routes.get("/syllabus/runs", response_model=ListSyllabusRunsResponse)
async def list_syllabus_runs(
    status: str | None = Query(None, description="Filter by status, e.g. running"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ListSyllabusRunsResponse:
    """
    List syllabus runs for the current user. Use ?status=running for active runs (dashboard).
    """
    assert current_user is not None
    user_id = get_db_user_id(current_user.email, db)
    syllabus_service = SyllabusService(db)
    runs = syllabus_service.list_runs(user_id, status=status)
    return ListSyllabusRunsResponse(
        runs=[SyllabusRunListItem(**r) for r in runs]
    )


@syllabus_routes.get("/syllabus/runs/{run_id}", response_model=SyllabusRunResponse)
async def get_syllabus_run(
    run_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SyllabusRunResponse:
    """
    Get syllabus run status and state (for step-by-step UI). No stream.
    """
    assert current_user is not None
    user_id = get_db_user_id(current_user.email, db)
    syllabus_service = SyllabusService(db)
    run = syllabus_service.get_run(run_id, user_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    user = db.query(DbUser).filter(DbUser.id == user_id).first()
    prefs = user.preferences if user and isinstance(user.preferences, dict) else {}
    inference_model = prefs.get("ollama_model") or "qwen:latest"
    return SyllabusRunResponse(
        run_id=run.id,
        course_id=run.course_id,
        status=run.status,
        state_snapshot=run.state_snapshot,
        result=run.result,
        agent="SyllabusAgent",
        inference_model=inference_model,
    )


@syllabus_routes.delete("/syllabus/runs/{run_id}", status_code=204)
async def delete_syllabus_run(
    run_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """
    Delete a syllabus run and its events. Use before starting a fresh run.
    """
    assert current_user is not None
    user_id = get_db_user_id(current_user.email, db)
    syllabus_service = SyllabusService(db)
    if not syllabus_service.delete_run(run_id, user_id):
        raise HTTPException(status_code=404, detail="Run not found")


@syllabus_routes.post("/syllabus/runs/{run_id}/step", response_model=SyllabusStepResponse)
async def step_syllabus_run(
    run_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SyllabusStepResponse:
    """
    Run one graph node for the syllabus run. Returns { stage, state, done }.
    Call repeatedly (e.g. on "Continue" button) until done is True.
    """
    assert current_user is not None
    user_id = get_db_user_id(current_user.email, db)
    syllabus_service = SyllabusService(db)
    result = await syllabus_service.step_run(run_id, user_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Run not found or already finished")
    payload = {
        "stage": result["stage"],
        "state": result["state"],
        "done": result["done"],
        "agent": result.get("agent"),
        "inference_model": result.get("inference_model"),
    }
    await broadcast_syllabus_state(run_id, payload)
    return SyllabusStepResponse(
        stage=result["stage"],
        state=result["state"],
        done=result["done"],
        agent=result.get("agent"),
        inference_model=result.get("inference_model"),
    )


@syllabus_routes.get("/syllabus/runs/{run_id}/stream")
async def stream_syllabus_run(
    run_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """
    Stream syllabus generation for the run. SSE: metadata_update (phase, type, data), run_ended.
    """
    assert current_user is not None
    user_id = get_db_user_id(current_user.email, db)
    syllabus_service = SyllabusService(db)
    if not syllabus_service.get_run(run_id, user_id):
        raise HTTPException(status_code=404, detail="Run not found")

    async def event_generator():
        async for event in syllabus_service.stream_run(run_id, user_id):
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


@syllabus_routes.websocket("/ws/syllabus/runs/{run_id}")
async def syllabus_run_websocket(
    websocket: WebSocket,
    run_id: str,
    db: Session = Depends(get_db),
):
    """
    WebSocket for a syllabus run. Subscribe to run_id; server broadcasts { stage, state, done } on each step and on run start.
    Auth: cookie access_token or query ?token=.
    """
    auth = get_user_from_websocket(websocket, db)
    if not auth:
        return  # do not accept; client gets connection rejected
    _, user_id = auth
    syllabus_service = SyllabusService(db)
    run = syllabus_service.get_run(run_id, user_id)
    if not run:
        return
    await websocket.accept()
    subscribe_syllabus_run(run_id, websocket)
    try:
        # Send current state so client is in sync immediately
        state = run.state_snapshot if isinstance(run.state_snapshot, dict) else None
        if not state:
            state = {"next_node": "planning", "modules": []}
        stage = state.get("next_node") or run.phase or "planning"
        done = run.status in ("completed", "failed")
        user = db.query(DbUser).filter(DbUser.id == user_id).first()
        prefs = user.preferences if user and isinstance(user.preferences, dict) else {}
        inference_model = prefs.get("ollama_model") or "qwen:latest"
        await websocket.send_json({
            "stage": stage,
            "state": state,
            "done": done,
            "agent": "SyllabusAgent",
            "inference_model": inference_model,
        })
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        unsubscribe_syllabus_run(run_id, websocket)


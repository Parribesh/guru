"""
Syllabus generation endpoints.

Standalone flow: no Session or Conversation. Creates SyllabusRun and streams
via SyllabusService (SyllabusAgent.run_stream() → SSE metadata_update).
"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from api.config import get_db
from api.models.models import Course
from api.schemas.guru_schemas import StartSyllabusRunResponse
from api.schemas.user_schemas import User
from api.services.syllabus_service import SyllabusService
from api.utils.auth import get_current_user
from api.utils.common import get_db_user_id

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
        return StartSyllabusRunResponse(run_id=run_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


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


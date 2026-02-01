"""
Tutor agent routes: streaming tutor (lesson) responses for learning sessions.
"""

import json
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session as DBSession

from api.config import get_db
from api.models.session import Session, SessionType, SessionStatus
from api.schemas.user_schemas import User
from api.utils.auth import get_current_user
from api.utils.common import get_db_user_id
from api.services.tutor_service import TutorService

tutor_routes = APIRouter()


@tutor_routes.get("/learning/tutor/{conversation_id}/stream")
async def learning_tutor_stream(
    conversation_id: str,
    payload: str = Query(..., description="JSON with message and conversation_id"),
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
) -> StreamingResponse:
    """
    Stream tutor agent response for a learning session (lesson channel).
    Looks up session by lesson conversation_id (Session.conversation_id), runs tutor agent.
    """
    assert current_user is not None
    user_id = get_db_user_id(current_user.email, db)

    session = (
        db.query(Session)
        .filter(Session.user_id == user_id)
        .filter(Session.conversation_id == conversation_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found for this lesson conversation")
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

    tutor_service = TutorService(db)
    return tutor_service.stream_response(session, conversation_id, message_content)

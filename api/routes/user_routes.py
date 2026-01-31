"""
User preferences and profile endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.config import get_db
from api.models.models import User as DbUser
from api.schemas.user_schemas import User
from api.utils.auth import get_current_user
from api.utils.common import get_db_user_id

user_routes = APIRouter()


class UpdatePreferencesRequest(BaseModel):
    preferences: dict


@user_routes.patch("/user/preferences")
async def update_user_preferences(
    body: UpdatePreferencesRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """
    Update current user's preferences (merge with existing).
    Use e.g. { "preferences": { "ollama_model": "qwen:latest" } }.
    """
    assert current_user is not None
    user_id = get_db_user_id(current_user.email, db)
    user = db.query(DbUser).filter(DbUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    current = user.preferences if isinstance(user.preferences, dict) else {}
    merged = {**current, **(body.preferences or {})}
    user.preferences = merged
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"preferences": user.preferences}

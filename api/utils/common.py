"""
Common utility functions used across multiple routes.
"""

from datetime import datetime
from sqlalchemy.orm import Session
from fastapi import HTTPException

from api.models.models import User as DbUser, Message, Conversation
from api.schemas.user_schemas import User


def iso_format(dt: datetime) -> str:
    """Format datetime as ISO string with Z suffix."""
    return dt.isoformat() + "Z"


def get_db_user_id(email: str, db: Session) -> int:
    """Get database user ID from email."""
    u = db.query(DbUser).filter(DbUser.email == email).first()
    if not u:
        raise HTTPException(status_code=401, detail="User not found")
    return int(u.id)


def display_name(current_user: User) -> str:
    """Get display name from user preferences or email."""
    prefs = current_user.preferences or {}
    name = None
    if isinstance(prefs, dict):
        name = prefs.get("name") or prefs.get("full_name")
    if isinstance(name, str) and name.strip():
        return name.strip()
    # fallback: email prefix
    return current_user.email.split("@", 1)[0]


def next_seq(conversation_id: str, db: Session) -> int:
    """Get next sequence number for a conversation."""
    last = (
        db.query(Message)
        .filter(Message.conversation_id == conversation_id)
        .order_by(Message.seq.desc())
        .first()
    )
    return int(last.seq) + 1 if last else 1


def load_history_pairs(conversation_id: str, db: Session) -> list[tuple[str, str]]:
    """Load user-assistant message pairs from conversation."""
    msgs = (
        db.query(Message)
        .filter(Message.conversation_id == conversation_id)
        .order_by(Message.seq.asc())
        .all()
    )
    pairs: list[tuple[str, str]] = []
    pending_user: str | None = None
    for m in msgs:
        if m.role == "user":
            pending_user = m.content
        elif m.role == "assistant" and pending_user is not None:
            pairs.append((pending_user, m.content))
            pending_user = None
    return pairs


def latest_system_prompt(conversation_id: str, db: Session) -> str:
    """Get latest system prompt for a conversation."""
    m = (
        db.query(Message)
        .filter(Message.conversation_id == conversation_id, Message.role == "system")
        .order_by(Message.seq.desc())
        .first()
    )
    return str(m.content) if m is not None else ""


def welcome_message(*, name: str, context: str) -> str:
    """Generate welcome message."""
    return f"Welcome, {name}! {context}"


def normalize_modules(modules: object) -> list[dict]:
    """Normalize and validate module data from syllabus generation."""
    out: list[dict] = []
    if not isinstance(modules, list):
        return out
    for m in modules:
        if not isinstance(m, dict):
            continue
        title = m.get("title")
        objectives = m.get("objectives")
        est = m.get("estimated_minutes")
        if isinstance(title, str) and isinstance(objectives, list) and all(isinstance(x, str) for x in objectives):
            out.append(
                {
                    "title": title.strip(),
                    "objectives": [x.strip() for x in objectives if isinstance(x, str) and x.strip()],
                    "estimated_minutes": int(est) if isinstance(est, (int, float)) else None,
                }
            )
    # de-dupe empty objectives and limit
    out = [m for m in out if m["title"] and m["objectives"]]
    return out[:10]


def syllabus_outline(course_id: str, db: Session) -> str:
    """Get syllabus outline for a course."""
    from api.models.models import Module
    modules = db.query(Module).filter(Module.course_id == course_id).order_by(Module.order_index.asc()).all()
    if not modules:
        return "(syllabus not confirmed yet)"
    lines = [f"{m.order_index}. {m.title}" for m in modules[:15]]
    return "\n".join(lines)


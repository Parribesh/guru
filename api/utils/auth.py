from datetime import datetime
from typing import Optional
from fastapi import HTTPException, Cookie, Response, status, Depends
from fastapi import WebSocket
from api.schemas.auth_schemas import AuthTokenPayload
from api.utils.jwt import verify_token, get_password_hash, create_access_token, verify_password
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from api.models.models import User
from api.config import get_db


def _token_from_ws_scope(scope: dict) -> Optional[str]:
    """Extract access_token from Cookie or query (?token=) in WebSocket scope. Returns None if missing."""
    qs = scope.get("query_string") or b""
    if qs:
        for part in qs.split(b"&"):
            if part.startswith(b"token="):
                return part[6:].decode("utf-8", errors="replace").strip()
    for name, value in scope.get("headers") or []:
        if name.lower() == b"cookie":
            cookie = value.decode("utf-8", errors="replace")
            for part in cookie.split(";"):
                part = part.strip()
                if part.startswith("access_token="):
                    return part[13:].strip()
            break
    return None




def get_current_user(access_token: Optional[str] = Cookie(None), db: Session = Depends(get_db)) -> User | None:
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing token",
        )

    payload = verify_token(access_token)
    if payload is None or payload.sub is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )
    user = get_user_by_email(payload.sub, db)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
    return User(email=user.email, preferences=user.preferences, hashed_password=user.hashed_password)

def set_auth_cookie(response: Response, user: User) -> None:

    token = create_access_token(AuthTokenPayload(sub=user.email, exp=datetime.now(timezone.utc) + timedelta(minutes=30)))
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=30 * 60,
    )

def clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(
        key="access_token",
        httponly=True,
        secure=False,
        samesite="lax"
    )

def get_user_from_websocket(websocket: WebSocket, db: Session) -> tuple[User, int] | None:
    """Get (User, user_id) from WebSocket (cookie or query token). Returns None if unauthenticated."""
    token = _token_from_ws_scope(websocket.scope)
    if not token:
        return None
    payload = verify_token(token)
    if payload is None or payload.sub is None:
        return None
    user = get_user_by_email(payload.sub, db)
    if user is None:
        return None
    return (user, int(user.id))


def get_user_by_email(email: str, db: Session) -> User | None:
    try: 
        return db.query(User).filter(User.email == email).first()
    except Exception as e:
        print(f"Error getting user by email: {e}")
        raise e

def create_user(email: str, password: str, db: Session) -> User:
    print(f"Creating user: {email}")
    hashed_password = get_password_hash(password)
    try:
        user = User(email=email, hashed_password=hashed_password)
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
    except Exception as e:
        print(f"Error creating user: {e}")
        raise e

def authenticate_user(email: str, password: str, db: Session) -> User | None:
    user = get_user_by_email(email, db)
    if not user or not verify_password(password, user.hashed_password):
        return None
    return user
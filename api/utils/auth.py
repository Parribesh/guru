from datetime import datetime
from typing import Optional
from fastapi import HTTPException,  Cookie, Response, status, Depends
from api.schemas.auth_schemas import AuthTokenPayload
from api.utils.jwt import verify_token, get_password_hash, create_access_token, verify_password
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from api.models.models import User
from api.config import get_db




def get_current_user(access_token: Optional[str] = Cookie(None), db: Session = Depends(get_db)) -> User | None:

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
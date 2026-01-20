from datetime import datetime
from jose import JWTError, jwt
from pydantic import BaseModel
import bcrypt
from chat_agent.schemas.auth_schemas import AuthTokenPayload
from typing import Optional
from fastapi import HTTPException, status
# JWT Configuration
SECRET_KEY = "your-secret-key-here-change-in-production"  # In production, use environment variable
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# Password hashing


def verify_password(plain_password: str, hashed_password: str) -> Optional[bool]:
    """Verify a password against its hash."""
    print(f"Verifying password: {plain_password} against {hashed_password}")
    try:
        result = bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
        print(f"Password verification result: {result}")
        return result
    except Exception as e:
        print(f"Error verifying password: {e}")
        return None

def get_password_hash(password: str) -> str:
    """Hash a password for storing."""
    try:
        return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    except Exception as e:
        print(f"Error hashing password: {e}")
        return None

def create_access_token(data: AuthTokenPayload) -> str:
    """Create a JWT access token."""
    return jwt.encode(data.model_dump(), SECRET_KEY, algorithm=ALGORITHM)

def verify_token(token: str) -> AuthTokenPayload:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return AuthTokenPayload(**payload)
    except JWTError as e:
        print(f"Error verifying token: {e}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    except Exception as e:
        print(f"Error verifying token: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

from chat_agent.models import get_user_by_email
from fastapi import Cookie
from chat_agent.schemas.user_schemas import User
def get_current_user(access_token: str = Cookie(None)) -> User:
    if not access_token:
        print("No token provided")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    payload = verify_token(access_token)
    if payload is None or payload.sub is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user = get_user_by_email(payload.sub)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user
from jose import JWTError
from jose.jwt import encode, decode
from pydantic import BaseModel
import bcrypt
from api.schemas.auth_schemas import AuthTokenPayload
from typing import Optional
from fastapi import HTTPException, status
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
    return encode(data.model_dump(), SECRET_KEY, algorithm=ALGORITHM)

def verify_token(token: Optional[str]) -> AuthTokenPayload:
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")
    try:
        payload = decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return AuthTokenPayload(**payload)
    except JWTError as e:
        print(f"Error verifying token: {e}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    except Exception as e:
        print(f"Error verifying token: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
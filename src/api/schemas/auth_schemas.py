from datetime import datetime
from typing import Optional
from pydantic import BaseModel

class LoginRequest(BaseModel):
    email: str
    password: str

class RegisterRequest(BaseModel):
    email: str
    password: str
    confirm_password: str

class LoginResponse(BaseModel):
    message: str
    token_set: bool

class RegisterResponse(BaseModel):
    message: str

class LogoutResponse(BaseModel):
    message: str

class AuthTokenPayload(BaseModel):
    sub: str
    exp: Optional[datetime] = None
    preferences: Optional[dict] = None
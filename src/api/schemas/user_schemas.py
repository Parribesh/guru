from pydantic import BaseModel
from typing import Optional

class User(BaseModel):
    id: Optional[int] = None
    email: str
    role: str = "user"
    is_admin: bool = False
    preferences: Optional[dict] = None
    hashed_password: Optional[str] = None


class UserProfileResponse(BaseModel):
    id: int
    email: str
    role: str
    is_admin: bool
    preferences: Optional[dict] = None
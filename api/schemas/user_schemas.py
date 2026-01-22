from pydantic import BaseModel
from typing import Optional

class User(BaseModel):
    email: str
    preferences: Optional[dict] = None
    hashed_password: str
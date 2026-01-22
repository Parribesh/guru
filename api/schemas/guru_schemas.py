from pydantic import BaseModel

class ChatRequest(BaseModel):
    message: str

class ChatResponse(BaseModel):
    response: str

class EventSourceResponse(BaseModel):
    event: str
    data: str
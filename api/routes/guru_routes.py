from fastapi import APIRouter, Query
from api.schemas.guru_schemas import ChatRequest
from api.schemas.guru_schemas import ChatResponse
from api.schemas.user_schemas import User
from fastapi import Depends
from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from api.schemas.guru_schemas import ChatRequest as ChatRequestSchema
import json
from api.utils.auth import get_current_user
from api.bootstrap import build_registry
guru_routes = APIRouter()

file_path = "/home/stargazer/Documents/Designing Data-Intensive Applications The Big Ideas Behind Reliable, Scalable, and Maintainable Systems by Martin Kleppmann (z-lib.org).pdf"
registry = build_registry()
agent = registry.get_agent("chat")

@guru_routes.post("/chat", response_model=ChatResponse)
async def chat(chat_request: ChatRequest, current_user: User = Depends(get_current_user)) -> ChatResponse:
    assert current_user is not None
    print(f"Current user: {current_user.email}")
    response = await agent.run(chat_request.message)
    return ChatResponse(response=response)

@guru_routes.get("/chat/stream")
async def stream_chat(payload: str = Query(..., alias="payload"), current_user: User = Depends(get_current_user)) -> StreamingResponse:
    assert current_user is not None
    print(f"Current user: {current_user.email}")
    data = json.loads(payload)
    validated_chat_request = ChatRequestSchema(**data)
    async def stream_generator():
        async for chunk in agent.run(validated_chat_request.message):
            yield f"data: {chunk}\n\n"
        yield "event: end\ndata: END\n\n"
    return StreamingResponse(stream_generator(), media_type="text/event-stream")
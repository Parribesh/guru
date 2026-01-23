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
from agents.core.base_agent import BaseAgent
from api.utils.logger import configure_logging
guru_routes = APIRouter()
logger = configure_logging()

file_path = "/home/stargazer/Documents/Designing Data-Intensive Applications The Big Ideas Behind Reliable, Scalable, and Maintainable Systems by Martin Kleppmann (z-lib.org).pdf"
registry = build_registry()
agent: BaseAgent= registry.get("chat")
agent.state.doc_paths = [file_path]

@guru_routes.post("/chat", response_model=ChatResponse)
async def chat(chat_request: ChatRequest, current_user: User = Depends(get_current_user)) -> ChatResponse:
    assert current_user is not None
    logger.info("chat request user=%s", current_user.email)
    response = agent.run(chat_request.message)
    return ChatResponse(response=response)

@guru_routes.get("/chat/stream")
async def stream_chat(payload: str = Query(..., alias="payload"), current_user: User = Depends(get_current_user)) -> StreamingResponse:
    assert current_user is not None
    logger.info("stream chat request user=%s", current_user.email)
    data = json.loads(payload)
    validated_chat_request = ChatRequestSchema(**data)
    async def stream_generator():
        # `agent.run(...)` is synchronous and returns a final string (not an async iterator).
        # We stream it as a single SSE message for now.
        result = agent.run(validated_chat_request.message)
        yield f"data: {result}\n\n"
        yield "event: end\ndata: END\n\n"
    return StreamingResponse(stream_generator(), media_type="text/event-stream")
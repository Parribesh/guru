from fastapi import APIRouter, Query
from agents.chat_agent.agent import run
from agents.chat_agent.schemas.guru_schemas import ChatRequest
from agents.chat_agent.schemas.guru_schemas import ChatResponse
from agents.chat_agent.schemas.user_schemas import User
from fastapi import Depends
from agents.chat_agent.auth_utils import get_current_user
from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from agents.chat_agent.schemas.guru_schemas import ChatRequest as ChatRequestSchema
import json
from agents.chat_agent.agent import ChatAgent
guru_routes = APIRouter()

file_path = "/home/stargazer/Documents/Designing Data-Intensive Applications The Big Ideas Behind Reliable, Scalable, and Maintainable Systems by Martin Kleppmann (z-lib.org).pdf"
agent = ChatAgent(file_path=file_path) 

@guru_routes.post("/chat", response_model=ChatResponse)
async def chat(chat_request: ChatRequest, current_user: User = Depends(get_current_user)) -> ChatResponse:
    assert current_user is not None
    print(f"Current user: {current_user.email}")
    response = await agent.run(chat_request.message)
    return ChatResponse(response=response)

@guru_routes.get("/chat/stream")
async def stream_chat(payload: str = Query(..., alias="payload"), current_user: User = Depends(get_current_user)) -> StreamingResponse:
    data = json.loads(payload)
    validated_chat_request = ChatRequestSchema(**data)
    async def stream_generator():
        async for chunk in agent.run(validated_chat_request.message):
            yield f"data: {chunk}\n\n"
        yield "event: end\ndata: END\n\n"
    return StreamingResponse(stream_generator(), media_type="text/event-stream")
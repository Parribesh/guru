"""
App-layer service: run agent stream. Agent memory handles DB persistence.
"""

import json
from typing import Literal
from uuid import uuid4
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session as DBSession

from api.models.models import Message
from api.utils.common import next_seq
from api.utils.history_manager import store_tutor_exchange_to_chat
from api.services.session_service import SessionService
from api.models.session import Session
from api.utils.logger import configure_logging
from agents.chat_agent.memory import ChatAgentMemory

logger = configure_logging()


def stream_agent_response(
    db: DBSession,
    session: Session,
    conversation_id: str,
    message_content: str,
    agent,
    stream_kind: Literal["tutor", "chat"],
    agent_metadata: dict | None = None,
    chat_context: dict | None = None,
    session_service: SessionService | None = None,
    chat_history_store=None,
) -> StreamingResponse:
    """
    Run agent stream. ChatAgentMemory persists user/assistant messages to DB.
    stream_kind: "tutor" → tutor agent; "chat" → chat agent.
    """
    session_id = session.id
    memory = ChatAgentMemory(
        db=db,
        conversation_id=conversation_id,
        history_store=agent.history_store,
        message_cls=Message,
        next_seq_fn=next_seq,
        agent_state=agent.state,
    )

    async def event_stream():
        answer_chunks = []
        try:
            metadata = {"conversation_id": conversation_id}
            if stream_kind == "chat":
                from agents.chat_agent.api import stream as chat_stream
                from api.prompt_builders import build_session_chat_system_prompt

                ctx = chat_context or {}
                metadata["system_prompt"] = build_session_chat_system_prompt(
                    module_title=ctx.get("module_title") or "",
                    current_objective=ctx.get("current_objective") or "",
                    course_title=ctx.get("course_title") or "",
                )
                metadata.setdefault("max_tokens", 150)
                metadata.setdefault("conversation_id", conversation_id)
                stream = chat_stream(agent, conversation_id, message_content, metadata, memory=memory)
            else:
                from agents.tutor_agent.api import stream as tutor_stream

                metadata.update(agent_metadata or {})
                stream = tutor_stream(agent, conversation_id, message_content, metadata, memory=memory)

            async for chunk in stream:
                if chunk.startswith("event:"):
                    yield chunk if chunk.endswith("\n\n") else chunk + "\n\n"
                else:
                    answer_chunks.append(chunk)
                    yield f"data: {chunk}\n\n"
        except Exception as e:
            logger.exception("Agent stream failed: %s", e)
            yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"
        finally:
            answer_str = "".join(answer_chunks).strip()
            # DB + vector: base agent _after_run saves via memory.save
            # When tutor is queried, add the exchange to chat agent's history so the chat agent
            # can retrieve lesson content when the user asks "explain what the tutor said", etc.
            if stream_kind == "tutor" and getattr(session, "chat_conversation_id", None) and chat_history_store:
                chat_conv_id = session.chat_conversation_id
                store_tutor_exchange_to_chat(
                    chat_history_store, chat_conv_id, message_content, answer_str
                )
                # Persist as Message rows in the chat conversation so frontend message list shows tutor turns
                seq_u = next_seq(chat_conv_id, db)
                seq_a = next_seq(chat_conv_id, db)
                tutor_meta = {"agent": "tutor"}
                db.add(
                    Message(
                        id=str(uuid4()),
                        conversation_id=chat_conv_id,
                        role="user",
                        content=message_content,
                        seq=seq_u,
                        interaction_metadata=tutor_meta,
                    )
                )
                db.add(
                    Message(
                        id=str(uuid4()),
                        conversation_id=chat_conv_id,
                        role="assistant",
                        content=answer_str or "",
                        seq=seq_a,
                        interaction_metadata=tutor_meta,
                    )
                )
                db.commit()
            if session_service:
                session_service.update_session_state(session_id, {}, None)
            yield "event: end\ndata: END\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

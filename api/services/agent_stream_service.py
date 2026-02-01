"""
App-layer service: persist user message, call agent API for stream, persist assistant message.
Uses agent APIs only (agents.core.stream_api, agents.chat_agent.api, agents.tutor_agent.api).

Stream kind: TutorService calls with stream_kind="tutor" (lesson channel; agent_metadata from session).
ChatService calls with stream_kind="chat" (Q&A channel; chat_context for session-aware prompt).
We branch on stream_kind so which agent and which history store are explicit, not inferred from
whether chat_context is present.
"""

import json
from typing import Literal
from uuid import uuid4
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session as DBSession

from api.models.models import Message
from api.utils.common import next_seq
from api.utils.history_manager import store_exchange_from_messages, store_tutor_exchange_to_chat_history
from api.services.session_service import SessionService
from api.models.session import Session
from api.utils.logger import configure_logging

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
) -> StreamingResponse:
    """
    Persist user message, run agent stream via the appropriate agent API, persist assistant message.

    Why we used to branch on chat_context: TutorService only passes agent_metadata (system_prompt
    from session) and never chat_context; ChatService builds session context (module_title,
    current_objective, course_title) and passes it as chat_context so the chat agent can build its
    prompt. So "chat_context present" meant "Q&A channel" and "absent" meant "lesson channel"—but
    that was implicit and brittle. We now require stream_kind so which agent and which history
    store are explicit.

    stream_kind: "tutor" → tutor agent (lesson channel, agent_metadata, tutor_lesson_history).
                 "chat"  → chat agent (Q&A channel, chat_context for prompt, conversation_history).
    """
    session_id = session.id
    seq_user = next_seq(conversation_id, db)
    user_msg_id = str(uuid4())
    user_msg = Message(
        id=user_msg_id,
        conversation_id=conversation_id,
        role="user",
        content=message_content,
        seq=seq_user,
    )
    db.add(user_msg)
    db.commit()
    db.refresh(user_msg)

    extra = {
        "_user_message_id": user_msg_id,
        "_message_seq": seq_user,
        "_skip_memory_save": True,
    }

    async def event_stream():
        answer_chunks = []
        history_store_kind: Literal["tutor", "chat"] = stream_kind
        try:
            metadata = dict(extra)
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
                stream = chat_stream(agent, conversation_id, message_content, metadata)
            else:
                from agents.tutor_agent.api import stream as tutor_stream

                metadata.update(agent_metadata or {})
                stream = tutor_stream(agent, conversation_id, message_content, metadata)

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
            seq_assistant = next_seq(conversation_id, db)
            assistant_msg_id = str(uuid4())
            assistant_msg = Message(
                id=assistant_msg_id,
                conversation_id=conversation_id,
                role="assistant",
                content=answer_str or "",
                seq=seq_assistant,
            )
            db.add(assistant_msg)
            db.commit()
            store_exchange_from_messages(
                conversation_id, user_msg_id, assistant_msg_id, db, history_store_kind=history_store_kind
            )
            # When tutor is queried, add the exchange to chat agent's history so the chat agent
            # can retrieve lesson content when the user asks "explain what the tutor said", etc.
            if stream_kind == "tutor" and getattr(session, "chat_conversation_id", None):
                chat_conv_id = session.chat_conversation_id
                store_tutor_exchange_to_chat_history(chat_conv_id, message_content, answer_str)
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

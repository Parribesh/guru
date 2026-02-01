"""
Chat agent service: conversations (create, list, messages, fork) and streaming chat (Q&A) responses.
"""

from uuid import uuid4
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session as DBSession

from api.models.models import Conversation, Module, Course, Message
from api.models.session import Session
from api.services.session_service import SessionService
from api.services.agent_stream_service import stream_agent_response
from api.utils.common import ollama_model_for_user
from infra.llm.ollama import OllamaLLM
from agents.chat_agent.agent import ChatAgent


class ChatService:
    """Service for conversations (chat) and chat agent streaming (Q&A channel)."""

    def __init__(self, db: DBSession):
        self.db = db

    def create_conversation(
        self,
        user_id: int,
        parent_conversation_id: str | None = None,
        forked_from_message_id: str | None = None,
    ) -> str:
        """
        Create a new conversation for the user. Does not commit; caller must commit.
        Returns the new conversation id. Used by session creation (chat channel) and by POST /conversations.
        """
        conversation_id = str(uuid4())
        self.db.add(
            Conversation(
                id=conversation_id,
                user_id=user_id,
                parent_conversation_id=parent_conversation_id,
                forked_from_message_id=forked_from_message_id,
            )
        )
        return conversation_id

    def list_conversations(self, user_id: int):
        """List all conversations for the user."""
        return (
            self.db.query(Conversation)
            .filter(Conversation.user_id == user_id)
            .order_by(Conversation.created_at.desc())
            .all()
        )

    def get_conversation(self, conversation_id: str, user_id: int) -> Conversation | None:
        """Get a conversation by id if it belongs to the user."""
        return (
            self.db.query(Conversation)
            .filter(Conversation.id == conversation_id, Conversation.user_id == user_id)
            .first()
        )

    def get_messages(self, conversation_id: str):
        """Get all messages for a conversation, ordered by seq."""
        return (
            self.db.query(Message)
            .filter(Message.conversation_id == conversation_id)
            .order_by(Message.seq.asc())
            .all()
        )

    def fork_conversation(
        self,
        conversation_id: str,
        from_message_id: str,
        user_id: int,
    ) -> str | None:
        """
        Fork a conversation from a specific message. Returns new conversation_id or None if not found.
        Caller must commit after.
        """
        convo = self.get_conversation(conversation_id, user_id)
        if convo is None:
            return None
        pivot = (
            self.db.query(Message)
            .filter(Message.id == from_message_id, Message.conversation_id == conversation_id)
            .first()
        )
        if pivot is None:
            return None
        new_id = self.create_conversation(
            user_id,
            parent_conversation_id=conversation_id,
            forked_from_message_id=from_message_id,
        )
        for m in (
            self.db.query(Message)
            .filter(Message.conversation_id == conversation_id, Message.seq <= pivot.seq)
            .order_by(Message.seq.asc())
            .all()
        ):
            self.db.add(
                Message(
                    id=str(uuid4()),
                    conversation_id=new_id,
                    role=m.role,
                    content=m.content,
                    seq=m.seq,
                )
            )
        return new_id

    def stream_response(
        self,
        session: Session,
        conversation_id: str,
        message_content: str,
    ) -> StreamingResponse:
        """
        Run chat agent stream for the given chat conversation.
        Passes session context to the chat agent API; the agent builds prompt and runs stream.
        Uses user's profile ollama_model for inference.
        """
        from api.bootstrap import build_registry

        module = (
            self.db.query(Module).filter(Module.id == session.module_id).first()
            if session.module_id
            else None
        )
        course = (
            self.db.query(Course).filter(Course.id == session.course_id).first()
            if session.course_id
            else None
        )
        state = session.session_state or {}
        context = {
            "module_title": module.title if module else "",
            "current_objective": state.get("current_objective") or "",
            "course_title": course.title if course else "",
        }

        model = ollama_model_for_user(self.db, session.user_id)
        llm = OllamaLLM(model=model)
        registry = build_registry()
        agent = ChatAgent(name="ChatAgent", llm=llm, registry=registry)
        session_service = SessionService(self.db)
        return stream_agent_response(
            self.db,
            session,
            conversation_id,
            message_content,
            agent,
            stream_kind="chat",
            chat_context=context,
            session_service=session_service,
        )

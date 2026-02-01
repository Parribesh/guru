"""
Tutor agent service: streaming tutor (lesson) responses for learning sessions.
"""

from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session as DBSession

from api.models.session import Session
from api.services.session_service import SessionService
from api.services.agent_stream_service import stream_agent_response
from api.utils.common import ollama_model_for_user
from infra.llm.ollama import OllamaLLM
from agents.tutor_agent.agent import TutorAgent


class TutorService:
    """Service for tutor agent streaming (lesson channel)."""

    def __init__(self, db: DBSession):
        self.db = db

    def stream_response(
        self,
        session: Session,
        conversation_id: str,
        message_content: str,
    ) -> StreamingResponse:
        """
        Run tutor agent stream for the given lesson conversation.
        Session must be resolved by Session.conversation_id == conversation_id.
        Uses user's profile ollama_model for inference.
        """
        from api.bootstrap import build_registry
        from agents.chat_agent.agent import ChatAgent

        model = ollama_model_for_user(self.db, session.user_id)
        llm = OllamaLLM(model=model)
        agent = TutorAgent(name="TutorAgent", llm=llm)
        agent_metadata = dict(session.agent_metadata or {})
        session_service = SessionService(self.db)
        # Pass chat agent's history store so tutor exchanges can be synced for Q&A retrieval
        chat_history_store = None
        if getattr(session, "chat_conversation_id", None):
            registry = build_registry()
            chat_agent = ChatAgent(name="ChatAgent", llm=llm, registry=registry)
            chat_history_store = chat_agent.history_store
        return stream_agent_response(
            self.db,
            session,
            conversation_id,
            message_content,
            agent,
            stream_kind="tutor",
            agent_metadata=agent_metadata,
            session_service=session_service,
            chat_history_store=chat_history_store,
        )

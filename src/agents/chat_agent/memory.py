"""
ChatAgentMemory: in-memory by default, DB-persistent when db and deps are provided.
Implements load (from vector store), save_user_message (user Message to DB), save (assistant Message to DB + vector).
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Callable, List, Optional, Tuple, Type
from uuid import uuid4

from agents.core.memory import Memory

logger = logging.getLogger(__name__)


class ChatAgentMemory(Memory):
    """
    Memory for ChatAgent. When db and deps are provided, persists to DB and vector store.
    Otherwise in-memory list (default).
    """

    def __init__(
        self,
        db: Any = None,
        conversation_id: str | None = None,
        history_store: Any = None,
        message_cls: Type | None = None,
        next_seq_fn: Callable[[str, Any], int] | None = None,
        agent_state: Any = None,
        k: int = 5,
        max_tokens: int = 100,
    ):
        self._history: List[Tuple[str, str]] = []
        self.db = db
        self.conversation_id = conversation_id or ""
        self.history_store = history_store
        self.message_cls = message_cls
        self.next_seq_fn = next_seq_fn
        self.agent_state = agent_state
        self.k = k
        self.max_tokens = max_tokens
        self._current_query: Optional[str] = None

    def set_query(self, query: str) -> None:
        self._current_query = query

    def save_user_message(self, input: str) -> None:
        """Persist user Message to DB. Only when db and deps are configured."""
        if not self.db or not self.message_cls or not self.next_seq_fn:
            return
        try:
            seq_user = self.next_seq_fn(self.conversation_id, self.db)
            user_msg_id = str(uuid4())
            assistant_msg_id = str(uuid4())
            user_msg = self.message_cls(
                id=user_msg_id,
                conversation_id=self.conversation_id,
                role="user",
                content=input,
                seq=seq_user,
            )
            self.db.add(user_msg)
            self.db.commit()
            self.db.refresh(user_msg)
            if self.agent_state and self.agent_state.metadata is not None:
                self.agent_state.metadata["_user_message_id"] = user_msg_id
                self.agent_state.metadata["_assistant_message_id"] = assistant_msg_id
                self.agent_state.metadata["_message_seq"] = seq_user
        except Exception as e:
            logger.exception("Failed to save user message to DB: %s", e)
            raise

    def load(self) -> List[Tuple[str, ...]]:
        """Load from vector store when history_store is set, else in-memory."""
        if self.history_store and self._current_query:
            try:
                return self.history_store.retrieve_relevant_history(
                    query=self._current_query,
                    conversation_id=self.conversation_id,
                    max_tokens=self.max_tokens,
                    k=self.k,
                    include_last=True,
                )
            except Exception as e:
                logger.warning("Failed to load memory from vector store: %s", e)
                return []
        return [(u, a) for u, a in self._history]

    def save(self, input: str, result: str) -> None:
        """Persist assistant Message to DB and vector store when configured; else append in-memory."""
        if self.db and self.message_cls and self.next_seq_fn:
            self._save_to_db_and_vector(input, result)
        else:
            self._history.append((input, result))

    def _save_to_db_and_vector(self, input: str, result: str) -> None:
        """Create assistant Message, commit to DB, store exchange to vector."""
        try:
            metadata = self.agent_state.metadata if self.agent_state else {}
            user_msg_id = metadata.get("_user_message_id")
            assistant_msg_id = metadata.get("_assistant_message_id") or str(uuid4())
            seq_assistant = self.next_seq_fn(self.conversation_id, self.db)
            assistant_msg = self.message_cls(
                id=assistant_msg_id,
                conversation_id=self.conversation_id,
                role="assistant",
                content=result or "",
                seq=seq_assistant,
            )
            self.db.add(assistant_msg)
            self.db.commit()
            self.db.refresh(assistant_msg)

            if self.history_store:
                self._store_exchange_to_vector(input, result, user_msg_id, assistant_msg_id)
        except Exception as e:
            logger.exception("Failed to save assistant message and exchange: %s", e)
            raise

    def _store_exchange_to_vector(
        self,
        user_content: str,
        assistant_content: str,
        user_msg_id: str,
        assistant_msg_id: str,
    ) -> None:
        """Store exchange to vector store. Supports HistoryStore and TutorHistoryStore."""
        try:
            from agents.chat_agent.history_store import ConversationExchange, HistoryStore
            from agents.tutor_agent.history_store import TutorExchange, TutorHistoryStore

            exchange_id = f"{user_msg_id}_{assistant_msg_id}"
            created_at = datetime.utcnow().isoformat()
            metadata = self.agent_state.metadata if self.agent_state else {}
            seq = metadata.get("_message_seq", 0)

            if isinstance(self.history_store, TutorHistoryStore):
                exchange = TutorExchange(
                    exchange_id=exchange_id,
                    conversation_id=self.conversation_id,
                    user_message=user_content,
                    assistant_message=assistant_content,
                    seq=seq,
                    created_at=created_at,
                )
            else:
                exchange = ConversationExchange(
                    exchange_id=exchange_id,
                    conversation_id=self.conversation_id,
                    user_message=user_content,
                    assistant_message=assistant_content,
                    seq=seq,
                    created_at=created_at,
                )
            self.history_store.store_exchange(exchange)
        except Exception as e:
            logger.warning("Failed to store exchange to vector: %s", e)

"""
Vector-based memory for TutorAgent using tutor lesson history store.
Separate from chat conversation history.
"""

from datetime import datetime
from typing import List, Tuple, Optional

from agents.core.memory import Memory
from agents.tutor_agent.history_store import TutorExchange, TutorHistoryStore


class TutorVectorMemory(Memory):
    """
    Memory for tutor agent: uses tutor_lesson_history collection only.
    """

    def __init__(
        self,
        conversation_id: str,
        history_store: TutorHistoryStore,
        k: int = 5,
        max_tokens: int = 100,
        agent_state=None,
    ):
        self.conversation_id = conversation_id
        self.k = k
        self.max_tokens = max_tokens
        self.store = history_store
        self._current_query: Optional[str] = None
        self.agent_state = agent_state

    def set_query(self, query: str) -> None:
        self._current_query = query

    def load(self) -> List[Tuple[str, str]]:
        if not self._current_query:
            return []
        try:
            return self.store.retrieve_relevant_history(
                query=self._current_query,
                conversation_id=self.conversation_id,
                max_tokens=self.max_tokens,
                k=self.k,
                include_last=True,
            )
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning("Failed to load tutor memory: %s", e)
            return []

    def save(self, input: str, result: str) -> None:
        try:
            metadata = self.agent_state.metadata if self.agent_state else {}
            user_msg_id = metadata.get("_user_message_id")
            assistant_msg_id = metadata.get("_assistant_message_id")
            seq = metadata.get("_message_seq", 0)
            exchange_id = (
                f"{user_msg_id}_{assistant_msg_id}"
                if (user_msg_id and assistant_msg_id)
                else f"{self.conversation_id}_{datetime.utcnow().isoformat()}"
            )
            exchange = TutorExchange(
                exchange_id=exchange_id,
                conversation_id=self.conversation_id,
                user_message=input,
                assistant_message=result,
                seq=seq,
                created_at=datetime.utcnow().isoformat(),
            )
            self.store.store_exchange(exchange)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning("Failed to save tutor memory: %s", e)

from abc import ABC, abstractmethod
from typing import List, Tuple, Optional, Any


class Memory(ABC):
    """Memory interface: load history, save exchanges. DB-persistent memories also save user/assistant messages."""

    @abstractmethod
    def load(self) -> List[Tuple[str, ...]]:
        """Load history for the conversation. Returns list of (user_msg, assistant_msg) or (u, a, agent_name)."""
        pass

    @abstractmethod
    def save(self, input: str, result: str) -> None:
        """Save the exchange (input, result). DB-persistent memories create assistant Message and commit."""
        pass

    def save_user_message(self, input: str) -> None:
        """Persist user message to DB before run. Override in DB-persistent memories."""
        pass
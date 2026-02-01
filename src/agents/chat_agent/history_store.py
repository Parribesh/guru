"""
Semantic history retrieval for conversation exchanges.
Lives in the agent library; uses infra (ChromaStore) and agents.core.token_utils. No api deps.
"""

from dataclasses import dataclass
from typing import List, Tuple, Optional

from infra.vector.chroma_store import ChromaStore
from agents.core.token_utils import estimate_tokens, truncate_text


@dataclass
class ConversationExchange:
    """Represents a single conversation exchange (user + assistant)."""
    exchange_id: str
    conversation_id: str
    user_message: str
    assistant_message: str
    seq: int
    created_at: str
    agent_name: Optional[str] = None  # e.g. "tutor" when synced from lesson channel


class HistoryStore:
    """
    Manages conversation history using semantic search.
    Uses a separate ChromaDB collection for history (different from document RAG).
    """

    def __init__(self, persist_dir: Optional[str] = None):
        self.store = ChromaStore(
            collection_name="conversation_history",
            persist_dir=persist_dir,
            embedding_function=None,
        )

    def store_exchange(self, exchange: ConversationExchange) -> None:
        meta: dict = {
            "conversation_id": exchange.conversation_id,
            "user_message": exchange.user_message,
            "assistant_message": exchange.assistant_message,
            "seq": exchange.seq,
            "created_at": exchange.created_at,
        }
        if exchange.agent_name:
            meta["agent_name"] = exchange.agent_name
        # For tutor exchanges, include assistant content in embedded text so queries
        # like "what did the tutor say?" retrieve the lesson content
        text = exchange.user_message
        if exchange.agent_name == "tutor" and exchange.assistant_message:
            text = f"{exchange.user_message}\n{exchange.assistant_message}"
        document = {
            "id": exchange.exchange_id,
            "text": text,
            "metadata": meta,
        }
        self.store.add_documents([document])

    def retrieve_relevant_history(
        self,
        query: str,
        conversation_id: str,
        max_tokens: int = 80,
        k: int = 10,
        include_last: bool = True,
    ) -> List[Tuple[str, str, Optional[str]]]:
        """Returns list of (user_message, assistant_message, agent_name_or_none)."""
        # Restrict search to this conversation so tutor/chat history for this session is retrieved
        results = self.store.query(
            query=query,
            k=k * 2,
            where={"conversation_id": conversation_id},
        )
        exchanges: List[ConversationExchange] = []
        for result in results:
            meta = result.get("metadata", {})
            if meta.get("conversation_id") == conversation_id:
                exchanges.append(
                    ConversationExchange(
                        exchange_id=result["id"],
                        conversation_id=meta["conversation_id"],
                        user_message=meta.get("user_message", ""),
                        assistant_message=meta.get("assistant_message", ""),
                        seq=meta.get("seq", 0),
                        created_at=meta.get("created_at", ""),
                        agent_name=meta.get("agent_name"),
                    )
                )
        if not exchanges:
            return []
        exchanges.sort(key=lambda e: e.seq)
        selected: List[ConversationExchange] = []
        tokens_used = 0

        if include_last and exchanges:
            last = exchanges[-1]
            last_tokens = estimate_tokens(last.user_message) + estimate_tokens(last.assistant_message)
            last_budget = int(max_tokens * 0.6)
            if last_tokens <= last_budget:
                selected.append(last)
                tokens_used += last_tokens
            else:
                truncated_last = ConversationExchange(
                    exchange_id=last.exchange_id,
                    conversation_id=last.conversation_id,
                    user_message=truncate_text(last.user_message, last_budget // 2),
                    assistant_message=truncate_text(last.assistant_message, last_budget // 2),
                    seq=last.seq,
                    created_at=last.created_at,
                    agent_name=last.agent_name,
                )
                selected.append(truncated_last)
                tokens_used += estimate_tokens(truncated_last.user_message) + estimate_tokens(
                    truncated_last.assistant_message
                )

        remaining_budget = max_tokens - tokens_used
        remaining_exchanges = [e for e in exchanges if e not in selected]
        remaining_exchanges.sort(key=lambda e: e.seq, reverse=True)

        for exchange in remaining_exchanges:
            exchange_tokens = estimate_tokens(exchange.user_message) + estimate_tokens(
                exchange.assistant_message
            )
            if tokens_used + exchange_tokens <= max_tokens:
                selected.append(exchange)
                tokens_used += exchange_tokens
            elif remaining_budget > 10:
                truncated = ConversationExchange(
                    exchange_id=exchange.exchange_id,
                    conversation_id=exchange.conversation_id,
                    user_message=truncate_text(exchange.user_message, remaining_budget // 2),
                    assistant_message=truncate_text(
                        exchange.assistant_message, remaining_budget // 2
                    ),
                    seq=exchange.seq,
                    created_at=exchange.created_at,
                    agent_name=exchange.agent_name,
                )
                selected.append(truncated)
                break

        selected.sort(key=lambda e: e.seq)
        return [(e.user_message, e.assistant_message, e.agent_name) for e in selected]


_history_store: Optional[HistoryStore] = None


def get_history_store(persist_dir: Optional[str] = None) -> HistoryStore:
    """Get or create the global history store instance."""
    global _history_store
    if _history_store is None:
        _history_store = HistoryStore(persist_dir=persist_dir)
    return _history_store

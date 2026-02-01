"""
Tutor lesson history store: semantic history for tutor conversations only.
Separate ChromaDB collection from chat (conversation_history).
"""

from dataclasses import dataclass
from typing import List, Optional, Tuple

from infra.vector.chroma_store import ChromaStore
from agents.core.token_utils import estimate_tokens, truncate_text


@dataclass
class TutorExchange:
    """A single tutor lesson exchange (user + assistant)."""
    exchange_id: str
    conversation_id: str
    user_message: str
    assistant_message: str
    seq: int
    created_at: str


class TutorHistoryStore:
    """
    Manages tutor lesson history in a separate ChromaDB collection.
    Scoped to lesson (tutor) conversations only.
    """

    def __init__(self, persist_dir: Optional[str] = None):
        self.store = ChromaStore(
            collection_name="tutor_lesson_history",
            persist_dir=persist_dir,
            embedding_function=None,
        )

    def store_exchange(self, exchange: TutorExchange) -> None:
        document = {
            "id": exchange.exchange_id,
            "text": exchange.user_message,
            "metadata": {
                "conversation_id": exchange.conversation_id,
                "user_message": exchange.user_message,
                "assistant_message": exchange.assistant_message,
                "seq": exchange.seq,
                "created_at": exchange.created_at,
            },
        }
        self.store.add_documents([document])

    def retrieve_relevant_history(
        self,
        query: str,
        conversation_id: str,
        max_tokens: int = 80,
        k: int = 10,
        include_last: bool = True,
    ) -> List[Tuple[str, str]]:
        results = self.store.query(query=query, k=k * 2)
        exchanges: List[TutorExchange] = []
        for result in results:
            meta = result.get("metadata", {})
            if meta.get("conversation_id") == conversation_id:
                exchanges.append(
                    TutorExchange(
                        exchange_id=result["id"],
                        conversation_id=meta["conversation_id"],
                        user_message=meta.get("user_message", ""),
                        assistant_message=meta.get("assistant_message", ""),
                        seq=meta.get("seq", 0),
                        created_at=meta.get("created_at", ""),
                    )
                )
        if not exchanges:
            return []
        exchanges.sort(key=lambda e: e.seq)
        selected: List[TutorExchange] = []
        tokens_used = 0

        if include_last and exchanges:
            last = exchanges[-1]
            last_tokens = estimate_tokens(last.user_message) + estimate_tokens(last.assistant_message)
            last_budget = int(max_tokens * 0.6)
            if last_tokens <= last_budget:
                selected.append(last)
                tokens_used += last_tokens
            else:
                truncated_last = TutorExchange(
                    exchange_id=last.exchange_id,
                    conversation_id=last.conversation_id,
                    user_message=truncate_text(last.user_message, last_budget // 2),
                    assistant_message=truncate_text(last.assistant_message, last_budget // 2),
                    seq=last.seq,
                    created_at=last.created_at,
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
                truncated = TutorExchange(
                    exchange_id=exchange.exchange_id,
                    conversation_id=exchange.conversation_id,
                    user_message=truncate_text(exchange.user_message, remaining_budget // 2),
                    assistant_message=truncate_text(
                        exchange.assistant_message, remaining_budget // 2
                    ),
                    seq=exchange.seq,
                    created_at=exchange.created_at,
                )
                selected.append(truncated)
                break

        selected.sort(key=lambda e: e.seq)
        return [(e.user_message, e.assistant_message) for e in selected]

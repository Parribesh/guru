"""
Semantic history retrieval for conversation exchanges.

Stores conversation history as embeddings and retrieves relevant exchanges
based on semantic similarity to the current query.
"""

from typing import List, Tuple, Optional, Dict, Any
from dataclasses import dataclass
from infra.vector.chroma_store import ChromaStore
from api.utils.token_budget import estimate_tokens


@dataclass
class ConversationExchange:
    """Represents a single conversation exchange (user + assistant)."""
    exchange_id: str  # Unique ID for this exchange
    conversation_id: str  # Conversation this exchange belongs to
    user_message: str
    assistant_message: str
    seq: int  # Sequence number in conversation
    created_at: str  # ISO timestamp


class HistoryStore:
    """
    Manages conversation history using semantic search.
    
    Uses a separate ChromaDB collection for history (different from document RAG).
    Each exchange is embedded (using the user message) and stored with full exchange as metadata.
    """
    
    def __init__(self, persist_dir: Optional[str] = None):
        """
        Initialize history store.
        
        Args:
            persist_dir: Directory for persistent ChromaDB storage. If None, uses in-memory.
        """
        # Create separate collection for history
        self.store = ChromaStore(
            collection_name="conversation_history",
            persist_dir=persist_dir,
            embedding_function=None  # Use ChromaDB's default embedding function
        )
    
    def store_exchange(
        self,
        exchange: ConversationExchange
    ) -> None:
        """
        Store a conversation exchange in the vector store.
        
        Strategy: Embed the user message (better search target), store full exchange as metadata.
        """
        # Use user message as the text to embed (better for semantic search)
        # Store full exchange in metadata for retrieval
        document = {
            "id": exchange.exchange_id,
            "text": exchange.user_message,  # Embed this
            "metadata": {
                "conversation_id": exchange.conversation_id,
                "user_message": exchange.user_message,
                "assistant_message": exchange.assistant_message,
                "seq": exchange.seq,
                "created_at": exchange.created_at,
            }
        }
        
        self.store.add_documents([document])
    
    def retrieve_relevant_history(
        self,
        query: str,
        conversation_id: str,
        max_tokens: int = 80,
        k: int = 10,
        include_last: bool = True
    ) -> List[Tuple[str, str]]:
        """
        Retrieve relevant conversation history based on semantic similarity.
        
        Strategy:
        1. Always include last exchange (most recent context)
        2. Fill remaining budget with semantically similar exchanges
        
        Args:
            query: Current user query (used for semantic search)
            conversation_id: Filter to this conversation only
            max_tokens: Maximum tokens for retrieved history
            k: Maximum number of exchanges to retrieve
            include_last: Always include the most recent exchange
        
        Returns:
            List of (user_message, assistant_message) tuples, ordered by relevance + recency
        """
        # Query the store for similar exchanges
        results = self.store.query(query=query, k=k * 2)  # Get more, filter later
        
        # Filter to this conversation and extract exchanges
        exchanges: List[ConversationExchange] = []
        for result in results:
            meta = result.get("metadata", {})
            if meta.get("conversation_id") == conversation_id:
                exchanges.append(ConversationExchange(
                    exchange_id=result["id"],
                    conversation_id=meta["conversation_id"],
                    user_message=meta.get("user_message", ""),
                    assistant_message=meta.get("assistant_message", ""),
                    seq=meta.get("seq", 0),
                    created_at=meta.get("created_at", "")
                ))
        
        if not exchanges:
            return []
        
        # Sort by sequence (chronological order)
        exchanges.sort(key=lambda e: e.seq)
        
        # Strategy: Always include last exchange, then fill with similar ones
        selected: List[ConversationExchange] = []
        tokens_used = 0
        
        # Step 1: Always include last exchange (most recent context)
        if include_last and exchanges:
            last = exchanges[-1]
            last_tokens = estimate_tokens(last.user_message) + estimate_tokens(last.assistant_message)
            
            # Reserve budget for last exchange (60% of total)
            last_budget = int(max_tokens * 0.6)
            
            if last_tokens <= last_budget:
                selected.append(last)
                tokens_used += last_tokens
            else:
                # Truncate last exchange if needed
                from api.utils.token_budget import truncate_text
                user_budget = last_budget // 2
                assistant_budget = last_budget // 2
                truncated_last = ConversationExchange(
                    exchange_id=last.exchange_id,
                    conversation_id=last.conversation_id,
                    user_message=truncate_text(last.user_message, user_budget),
                    assistant_message=truncate_text(last.assistant_message, assistant_budget),
                    seq=last.seq,
                    created_at=last.created_at
                )
                selected.append(truncated_last)
                tokens_used += estimate_tokens(truncated_last.user_message) + estimate_tokens(truncated_last.assistant_message)
        
        # Step 2: Fill remaining budget with semantically similar exchanges
        remaining_budget = max_tokens - tokens_used
        remaining_exchanges = [e for e in exchanges if e not in selected]
        
        # Sort by similarity (results are already sorted by similarity from query)
        # But we want to prioritize recent ones too, so sort by seq descending
        remaining_exchanges.sort(key=lambda e: e.seq, reverse=True)
        
        for exchange in remaining_exchanges:
            exchange_tokens = estimate_tokens(exchange.user_message) + estimate_tokens(exchange.assistant_message)
            
            if tokens_used + exchange_tokens <= max_tokens:
                selected.append(exchange)
                tokens_used += exchange_tokens
            elif remaining_budget > 10:  # Only if we have meaningful space
                # Truncate to fit
                from api.utils.token_budget import truncate_text
                user_budget = remaining_budget // 2
                assistant_budget = remaining_budget // 2
                truncated = ConversationExchange(
                    exchange_id=exchange.exchange_id,
                    conversation_id=exchange.conversation_id,
                    user_message=truncate_text(exchange.user_message, user_budget),
                    assistant_message=truncate_text(exchange.assistant_message, assistant_budget),
                    seq=exchange.seq,
                    created_at=exchange.created_at
                )
                selected.append(truncated)
                break
        
        # Sort selected by sequence (chronological order for prompt)
        selected.sort(key=lambda e: e.seq)
        
        # Return as (user, assistant) tuples
        return [(e.user_message, e.assistant_message) for e in selected]
    
    def delete_conversation_history(self, conversation_id: str) -> None:
        """
        Delete all history for a conversation.
        """
        # Query to get all exchanges for this conversation
        # Note: ChromaDB doesn't have a direct "query by metadata" without text,
        # so we'll need to get all and filter, or use a different approach
        # For now, we'll need to track exchange IDs per conversation separately
        # This is a limitation - we might need to maintain an index
        pass  # TODO: Implement conversation deletion


# Global history store instance
_history_store: Optional[HistoryStore] = None


def get_history_store(persist_dir: Optional[str] = None) -> HistoryStore:
    """Get or create the global history store instance."""
    global _history_store
    if _history_store is None:
        _history_store = HistoryStore(persist_dir=persist_dir)
    return _history_store


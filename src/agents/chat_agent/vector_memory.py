"""
Vector-based memory for ChatAgent using semantic search.

Stores conversation history in a vector store and retrieves relevant history
based on semantic similarity to the current query.
"""

from typing import List, Tuple, Optional
from agents.core.memory import Memory
from api.utils.history_store import get_history_store
from datetime import datetime


class VectorMemory(Memory):
    """
    Memory implementation that uses vector store for semantic history retrieval.
    
    - Saves exchanges to vector store (embeds user message, stores full exchange)
    - Loads relevant history via semantic search (top k based on query similarity)
    """
    
    def __init__(self, conversation_id: str, k: int = 5, max_tokens: int = 100, agent_state=None):
        """
        Initialize vector memory.
        
        Args:
            conversation_id: Conversation ID to scope memory to
            k: Number of relevant history exchanges to retrieve
            max_tokens: Maximum tokens for retrieved history
            agent_state: Reference to agent state to access message IDs
        """
        self.conversation_id = conversation_id
        self.k = k
        self.max_tokens = max_tokens
        self.store = get_history_store()
        self._current_query: Optional[str] = None
        self.agent_state = agent_state  # Reference to agent.state for accessing message IDs
    
    def set_query(self, query: str):
        """Set the current query for semantic retrieval."""
        self._current_query = query
    
    def load(self) -> List[Tuple[str, str]]:
        """
        Load relevant history from vector store.
        
        Uses semantic search if query is set, otherwise returns empty.
        Returns list of (user_message, assistant_message) tuples.
        """
        if not self._current_query:
            return []
        
        try:
            # Retrieve relevant history using semantic search
            retrieved = self.store.retrieve_relevant_history(
                query=self._current_query,
                conversation_id=self.conversation_id,
                max_tokens=self.max_tokens,
                k=self.k,
                include_last=True
            )
            return retrieved
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Failed to load memory from vector store: {e}")
            return []
    
    def save(self, input: str, result: str):
        """
        Save an exchange to the vector store.
        
        Gets message IDs and sequence from agent state metadata (set by route).
        If IDs are not available, generates a temporary exchange ID.
        
        Args:
            input: User message
            result: Assistant response
        """
        try:
            # Get message IDs from agent state if available
            metadata = self.agent_state.metadata if self.agent_state else {}
            user_msg_id = metadata.get("_user_message_id")
            assistant_msg_id = metadata.get("_assistant_message_id")
            seq = metadata.get("_message_seq", 0)
            
            # Generate exchange ID
            if user_msg_id and assistant_msg_id:
                exchange_id = f"{user_msg_id}_{assistant_msg_id}"
            else:
                # Fallback: use timestamp-based ID
                exchange_id = f"{self.conversation_id}_{datetime.utcnow().isoformat()}"
            
            # Create and store exchange
            from api.utils.history_store import ConversationExchange
            exchange = ConversationExchange(
                exchange_id=exchange_id,
                conversation_id=self.conversation_id,
                user_message=input,
                assistant_message=result,
                seq=seq,
                created_at=datetime.utcnow().isoformat()
            )
            
            self.store.store_exchange(exchange)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Failed to save memory to vector store: {e}")


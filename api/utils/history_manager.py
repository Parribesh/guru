"""
History management utilities for storing and retrieving conversation exchanges.

Provides helper functions to:
- Store exchanges when messages are saved
- Sync DB messages with vector store
"""

from typing import Optional
from datetime import datetime
from sqlalchemy.orm import Session
from api.models.models import Message
from api.utils.history_store import get_history_store, ConversationExchange


def store_exchange_from_messages(
    conversation_id: str,
    user_message_id: str,
    assistant_message_id: str,
    db: Session
) -> None:
    """
    Store a conversation exchange in the history vector store.
    
    Called after both user and assistant messages are saved to DB.
    
    Args:
        conversation_id: Conversation ID
        user_message_id: ID of the user message
        assistant_message_id: ID of the assistant message
        db: Database session
    """
    try:
        # Fetch both messages
        user_msg = db.query(Message).filter(Message.id == user_message_id).first()
        assistant_msg = db.query(Message).filter(Message.id == assistant_message_id).first()
        
        if not user_msg or not assistant_msg:
            return  # Messages not found, skip
        
        # Create exchange
        exchange = ConversationExchange(
            exchange_id=f"{user_message_id}_{assistant_message_id}",  # Composite ID
            conversation_id=conversation_id,
            user_message=user_msg.content,
            assistant_message=assistant_msg.content,
            seq=user_msg.seq,  # Use user message seq
            created_at=user_msg.created_at.isoformat() if user_msg.created_at else datetime.utcnow().isoformat()
        )
        
        # Store in vector store
        history_store = get_history_store()
        history_store.store_exchange(exchange)
    except Exception as e:
        # Log but don't fail - history storage is optional
        import logging
        logging.getLogger(__name__).warning(f"Failed to store exchange in history: {e}")


def sync_conversation_history(
    conversation_id: str,
    db: Session
) -> int:
    """
    Sync all messages from a conversation to the history vector store.
    Useful for backfilling or when history store is initialized.
    
    Returns:
        Number of exchanges stored
    """
    try:
        # Get all messages for this conversation
        messages = db.query(Message).filter(
            Message.conversation_id == conversation_id
        ).order_by(Message.seq.asc()).all()
        
        # Pair up user/assistant messages
        exchanges_stored = 0
        pending_user = None
        user_msg_id = None
        
        history_store = get_history_store()
        
        for msg in messages:
            if msg.role == "user":
                pending_user = msg.content
                user_msg_id = msg.id
            elif msg.role == "assistant" and pending_user is not None and user_msg_id:
                # Create and store exchange
                exchange = ConversationExchange(
                    exchange_id=f"{user_msg_id}_{msg.id}",
                    conversation_id=conversation_id,
                    user_message=pending_user,
                    assistant_message=msg.content,
                    seq=msg.seq - 1,  # User message seq (assistant is seq+1)
                    created_at=msg.created_at.isoformat() if msg.created_at else datetime.utcnow().isoformat()
                )
                history_store.store_exchange(exchange)
                exchanges_stored += 1
                pending_user = None
                user_msg_id = None
        
        return exchanges_stored
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Failed to sync conversation history: {e}")
        return 0


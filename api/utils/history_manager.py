"""
History management utilities for storing and retrieving conversation exchanges.

Store is passed by the caller (from agent.history_store); no global singletons.
"""

from typing import Any
from datetime import datetime
from sqlalchemy.orm import Session

from api.models.models import Message
from agents.chat_agent.history_store import ConversationExchange, HistoryStore
from agents.tutor_agent.history_store import TutorExchange, TutorHistoryStore


def store_tutor_exchange_to_chat(
    chat_store: HistoryStore,
    chat_conversation_id: str,
    user_content: str,
    assistant_content: str,
) -> None:
    """
    Store a tutor (lesson) exchange in the chat agent's history store so the chat
    agent has lesson context when answering Q&A. Stored with agent_name="tutor".
    """
    try:
        seq = int(datetime.utcnow().timestamp() * 1000)
        exchange_id = f"tutor_{chat_conversation_id}_{seq}"
        exchange = ConversationExchange(
            exchange_id=exchange_id,
            conversation_id=chat_conversation_id,
            user_message=user_content,
            assistant_message=assistant_content,
            seq=seq,
            created_at=datetime.utcnow().isoformat(),
            agent_name="tutor",
        )
        chat_store.store_exchange(exchange)
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Failed to store tutor exchange to chat history: %s", e)


def store_exchange_from_messages(
    store: Any,
    conversation_id: str,
    user_message_id: str,
    assistant_message_id: str,
    db: Session,
) -> None:
    """
    Store a conversation exchange in the agent's history store.

    Called after both user and assistant messages are saved to DB.
    The store type (HistoryStore vs TutorHistoryStore) determines the exchange format.
    """
    try:
        user_msg = db.query(Message).filter(Message.id == user_message_id).first()
        assistant_msg = db.query(Message).filter(Message.id == assistant_message_id).first()

        if not user_msg or not assistant_msg:
            return

        created_at = (
            user_msg.created_at.isoformat()
            if user_msg.created_at
            else datetime.utcnow().isoformat()
        )
        seq = user_msg.seq
        exchange_id = f"{user_message_id}_{assistant_message_id}"

        if isinstance(store, TutorHistoryStore):
            exchange = TutorExchange(
                exchange_id=exchange_id,
                conversation_id=conversation_id,
                user_message=user_msg.content,
                assistant_message=assistant_msg.content,
                seq=seq,
                created_at=created_at,
            )
        else:
            exchange = ConversationExchange(
                exchange_id=exchange_id,
                conversation_id=conversation_id,
                user_message=user_msg.content,
                assistant_message=assistant_msg.content,
                seq=seq,
                created_at=created_at,
            )
        store.store_exchange(exchange)
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Failed to store exchange in history: %s", e)


def sync_conversation_history(
    chat_store: HistoryStore,
    conversation_id: str,
    db: Session,
) -> int:
    """
    Sync all messages from a conversation to the chat history store.
    Useful for backfilling or when history store is initialized.

    Returns:
        Number of exchanges stored
    """
    try:
        messages = db.query(Message).filter(
            Message.conversation_id == conversation_id
        ).order_by(Message.seq.asc()).all()

        exchanges_stored = 0
        pending_user = None
        user_msg_id = None

        for msg in messages:
            if msg.role == "user":
                pending_user = msg.content
                user_msg_id = msg.id
            elif msg.role == "assistant" and pending_user is not None and user_msg_id:
                exchange = ConversationExchange(
                    exchange_id=f"{user_msg_id}_{msg.id}",
                    conversation_id=conversation_id,
                    user_message=pending_user,
                    assistant_message=msg.content,
                    seq=msg.seq - 1,
                    created_at=msg.created_at.isoformat() if msg.created_at else datetime.utcnow().isoformat(),
                )
                chat_store.store_exchange(exchange)
                exchanges_stored += 1
                pending_user = None
                user_msg_id = None

        return exchanges_stored
    except Exception as e:
        import logging
        logging.getLogger(__name__).error("Failed to sync conversation history: %s", e)
        return 0

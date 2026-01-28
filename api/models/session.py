"""
Session model for unified session management.
"""

from api.config import Base
from sqlalchemy import Column, String, Integer, JSON, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import relationship
from datetime import datetime
from enum import Enum
from typing import Optional, Dict, Any
import sqlalchemy


class SessionType(str, Enum):
    """Types of sessions."""
    LEARNING = "learning"
    TEST = "test"
    CHAT = "chat"
    SYLLABUS = "syllabus"


class SessionStatus(str, Enum):
    """Session status."""
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class Session(Base):
    """
    Unified session model that tracks all session information.
    
    Contains:
    - Session metadata (type, status, timestamps)
    - Related entities (conversation, module, course, user)
    - Agent state and metadata
    - Progress tracking
    """
    __tablename__ = "sessions"
    
    id = Column(String, primary_key=True, index=True)  # uuid
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    session_type = Column(SQLEnum(SessionType), nullable=False, index=True)
    status = Column(SQLEnum(SessionStatus), default=SessionStatus.ACTIVE, nullable=False, index=True)
    
    # Related entities
    conversation_id = Column(String, ForeignKey("conversations.id"), index=True, nullable=False)
    module_id = Column(String, ForeignKey("modules.id"), nullable=True)
    course_id = Column(String, ForeignKey("courses.id"), nullable=True)
    attempt_id = Column(String, nullable=True)  # For test sessions, links to ModuleTestAttempt
    
    # Timestamps
    started_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    ended_at = Column(DateTime, nullable=True)
    last_activity_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Agent state and metadata
    agent_name = Column(String, nullable=True)  # e.g., "chat", "tutor", "tester"
    agent_metadata = Column(JSON, nullable=True)  # System prompt, max_tokens, etc.
    
    # Session state
    session_state = Column(JSON, nullable=True)  # Current state: progress, scores, etc.
    
    # Additional metadata
    session_metadata = Column(JSON, nullable=True)  # Any additional session-specific data
    
    user = relationship("User", backref="sessions", foreign_keys=[user_id])
    conversation = relationship("Conversation", foreign_keys=[conversation_id])


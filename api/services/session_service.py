"""
Session service for managing session state and streaming events.
"""

from typing import Optional, Dict, Any, AsyncIterator
from datetime import datetime
from uuid import uuid4
from sqlalchemy.orm import Session as DBSession
from enum import Enum

from api.models.models import (
    Conversation,
    Module,
    Course,
    ModuleProgress,
    ModuleTestAttempt,
    ModuleLearningSession,
)
from api.models.session import Session, SessionType, SessionStatus
from api.utils.common import get_db_user_id, display_name, syllabus_outline
from api.utils.prompt_builder import build_tutor_system_prompt, build_test_system_prompt
from api.bootstrap import build_registry
from api.utils.logger import configure_logging

logger = configure_logging()


class SessionEventType(str, Enum):
    """Types of events that can be streamed."""
    SESSION_STARTED = "session_started"
    SESSION_UPDATED = "session_updated"
    SESSION_ENDED = "session_ended"
    AGENT_STATE = "agent_state"
    PROGRESS_UPDATE = "progress_update"
    MESSAGE = "message"
    METADATA_UPDATE = "metadata_update"
    ERROR = "error"


class SessionService:
    """Service for managing session state and events."""
    
    def __init__(self, db: DBSession):
        self.db = db
        self.registry = build_registry()
        self._active_sessions: Dict[str, Session] = {}
    
    def create_session(
        self,
        user_id: int,
        session_type: SessionType,
        conversation_id: str,
        module_id: Optional[str] = None,
        course_id: Optional[str] = None,
        agent_name: Optional[str] = None,
        agent_metadata: Optional[Dict[str, Any]] = None,
        session_state: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Session:
        """Create a new session."""
        session_id = str(uuid4())
        
        session = Session(
            id=session_id,
            user_id=user_id,
            session_type=session_type,
            status=SessionStatus.ACTIVE,
            conversation_id=conversation_id,
            module_id=module_id,
            course_id=course_id,
            agent_name=agent_name or "chat",
            agent_metadata=agent_metadata or {},
            session_state=session_state or {},
            session_metadata=metadata or {},
            started_at=datetime.utcnow(),
            last_activity_at=datetime.utcnow(),
        )
        
        self.db.add(session)
        self.db.commit()
        self._active_sessions[session_id] = session
        
        return session
    
    def get_session(self, session_id: str, user_id: int) -> Optional[Session]:
        """Get a session by ID."""
        session = self.db.query(Session).filter(
            Session.id == session_id,
            Session.user_id == user_id
        ).first()
        return session
    
    def update_session_state(
        self,
        session_id: str,
        state_updates: Dict[str, Any],
        metadata_updates: Optional[Dict[str, Any]] = None,
    ) -> Optional[Session]:
        """Update session state."""
        session = self.db.query(Session).filter(Session.id == session_id).first()
        if not session:
            return None
        
        if session.session_state:
            session.session_state.update(state_updates)
        else:
            session.session_state = state_updates
        
        if metadata_updates:
            if session.session_metadata:
                session.session_metadata.update(metadata_updates)
            else:
                session.session_metadata = metadata_updates
        
        session.last_activity_at = datetime.utcnow()
        self.db.add(session)
        self.db.commit()
        
        return session
    
    def end_session(self, session_id: str) -> Optional[Session]:
        """End a session."""
        session = self.db.query(Session).filter(Session.id == session_id).first()
        if not session:
            return None
        
        session.status = SessionStatus.COMPLETED
        session.ended_at = datetime.utcnow()
        session.last_activity_at = datetime.utcnow()
        
        self.db.add(session)
        self.db.commit()
        
        if session_id in self._active_sessions:
            del self._active_sessions[session_id]
        
        return session
    
    def get_session_context(self, session: Session) -> Dict[str, Any]:
        """Get full context for a session including related entities."""
        context = {
            "session": {
                "id": session.id,
                "type": session.session_type.value,
                "status": session.status.value,
                "started_at": session.started_at.isoformat() if session.started_at else None,
                "ended_at": session.ended_at.isoformat() if session.ended_at else None,
                "last_activity_at": session.last_activity_at.isoformat() if session.last_activity_at else None,
            },
            "agent": {
                "name": session.agent_name,
                "metadata": session.agent_metadata or {},
            },
            "state": session.session_state or {},
            "session_metadata": session.session_metadata or {},
        }
        
        # Add module context if available
        if session.module_id:
            module = self.db.query(Module).filter(Module.id == session.module_id).first()
            if module:
                context["module"] = {
                    "id": module.id,
                    "title": module.title,
                    "order_index": module.order_index,
                    "objectives": module.objectives or [],
                    "estimated_minutes": module.estimated_minutes,
                }
                
                # Add progress if available
                progress = self.db.query(ModuleProgress).filter(
                    ModuleProgress.user_id == session.user_id,
                    ModuleProgress.module_id == session.module_id
                ).first()
                if progress:
                    context["module"]["progress"] = {
                        "best_score": float(progress.best_score),
                        "attempts_count": int(progress.attempts_count),
                        "passed": bool(progress.passed),
                    }
        
        # Add course context if available
        if session.course_id:
            course = self.db.query(Course).filter(Course.id == session.course_id).first()
            if course:
                context["course"] = {
                    "id": course.id,
                    "title": course.title,
                    "subject": course.subject,
                    "goals": course.goals,
                    "syllabus_confirmed": bool(course.syllabus_confirmed),
                }
                
                # Add syllabus outline if available
                if session.module_id:
                    context["course"]["syllabus_outline"] = syllabus_outline(session.course_id, self.db)
        
        return context
    
    async def stream_session_events(
        self,
        session_id: str,
        user_id: int,
    ) -> AsyncIterator[str]:
        """
        Stream session events as SSE. Sessions are for learning, test, chat only.
        """
        import json
        import asyncio
        
        session = self.get_session(session_id, user_id)
        if not session:
            yield f"event: error\ndata: {json.dumps({'error': 'Session not found'})}\n\n"
            return
        
        # Emit initial session context
        context = self.get_session_context(session)
        yield f"event: {SessionEventType.SESSION_STARTED.value}\ndata: {json.dumps(context)}\n\n"
        
        # Sessions are for learning, test, chat only. Syllabus uses /guru/syllabus/runs/{run_id}/stream.
        # For session types, keep connection alive and stream updates
        # In a real implementation, this would use WebSocket or a pub/sub system
        try:
            while session.status == SessionStatus.ACTIVE:
                # This is a placeholder - in real implementation, events would come from:
                # - Agent state changes
                # - Message updates
                # - Progress updates
                # - Metadata changes
                
                # For now, just keep the connection alive
                # In WebSocket implementation, this would be handled differently
                await asyncio.sleep(1)  # Placeholder
                
                # Check if session is still active
                self.db.refresh(session)
                if session.status != SessionStatus.ACTIVE:
                    break
        except Exception as e:
            yield f"event: {SessionEventType.ERROR.value}\ndata: {json.dumps({'error': str(e)})}\n\n"
        finally:
            # Emit session ended event
            yield f"event: {SessionEventType.SESSION_ENDED.value}\ndata: {json.dumps({'session_id': session_id})}\n\n"

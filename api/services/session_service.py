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
        Stream session events as SSE.
        
        For syllabus sessions, streams the generation process.
        For other sessions, streams state updates.
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
        
        # Handle syllabus generation streaming
        if session.session_type == SessionType.SYLLABUS:
            async for event in self._stream_syllabus_generation(session):
                yield event
            return
        
        # For other session types, keep connection alive and stream updates
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
    
    async def _stream_syllabus_generation(self, session: Session) -> AsyncIterator[str]:
        """Stream syllabus generation process using robust multi-stage pipeline."""
        import json
        from api.models.models import Course, SyllabusRun, SyllabusEvent
        # Removed unused imports - using SyllabusPipeline instead
        from datetime import datetime
        
        course = self.db.query(Course).filter(Course.id == session.course_id).first()
        if not course:
            yield f"event: {SessionEventType.ERROR.value}\ndata: {json.dumps({'error': 'Course not found'})}\n\n"
            return
        
        # Get or create syllabus run
        run = self.db.query(SyllabusRun).filter(
            SyllabusRun.course_id == session.course_id,
            SyllabusRun.user_id == session.user_id
        ).order_by(SyllabusRun.created_at.desc()).first()
        
        if not run:
            run_id = str(uuid4())
            run = SyllabusRun(
                id=run_id,
                user_id=session.user_id,
                course_id=session.course_id,
                status="running",
                phase="planning"
            )
            self.db.add(run)
            self.db.commit()
            # Store run_id in session metadata
            if not session.session_metadata:
                session.session_metadata = {}
            session.session_metadata["syllabus_run_id"] = run_id
            self.db.add(session)
            self.db.commit()
        else:
            run_id = run.id
        
        # Initialize the syllabus pipeline with agents
        from api.services.syllabus_pipeline import SyllabusPipeline
        
        def emit(phase: str | None, type_: str, data: dict | None = None):
            """Emit event and store in database."""
            try:
                event = SyllabusEvent(
                    id=str(uuid4()),
                    run_id=run_id,
                    phase=phase,
                    type=type_,
                    data=data
                )
                self.db.add(event)
                self.db.commit()
                
                # Update session state
                if not session.session_state:
                    session.session_state = {}
                session.session_state.update({
                    "phase": phase,
                    "last_event_type": type_,
                    "last_event_data": data,
                })
                session.last_activity_at = datetime.utcnow()
                self.db.add(session)
                self.db.commit()
            except Exception as e:
                logger.error(f"Error in emit function for phase={phase}, type={type_}: {e}")
                # Don't fail the whole process if event storage fails, but log it
            
            # Emit as SSE
            payload = {"phase": phase, "type": type_, "data": data}
            return f"event: {SessionEventType.METADATA_UPDATE.value}\ndata: {json.dumps(payload)}\n\n"
        
        try:
            # Use the new agent-based pipeline with course metadata
            from api.services.syllabus_pipeline import SyllabusPipeline
            
            pipeline = SyllabusPipeline(self.db, course=course)
            
            # Create a queue for events and a way to yield them
            import asyncio
            from collections import deque
            
            events_queue = deque()
            generation_done = False
            modules_result = []
            
            def pipeline_event_handler(event_type: str, data: dict):
                """Handle pipeline events and queue for SSE emission."""
                nonlocal run
                # Extract stage from data - handle both string and enum values
                stage = data.get("stage", "unknown")
                if hasattr(stage, 'value'):  # PipelineStage enum
                    stage = stage.value
                elif not isinstance(stage, str):
                    stage = str(stage)
                
                logger.info(f"Pipeline event handler: type={event_type}, stage={stage}, data_keys={list(data.keys()) if isinstance(data, dict) else 'N/A'}")
                
                # Update run phase
                if stage in ["planning", "generation", "validation", "refinement", "finalization"]:
                    run.phase = stage
                    run.updated_at = datetime.utcnow()
                    self.db.add(run)
                    self.db.commit()
                
                # Queue events for SSE emission
                if event_type == "pipeline_stage_start":
                    events_queue.append(("phase_start", stage, {}))
                elif event_type == "pipeline_stage_complete":
                    events_queue.append(("result", stage, data.get("result", {})))
                elif event_type == "agent_task_update":
                    # This is the key event for dashboard - includes full agent metadata
                    # data is the full task_dict from pipeline
                    logger.info(f"Queuing agent_task_update: stage={stage}, agent={data.get('agent_name', 'unknown')}, status={data.get('status', 'unknown')}, queue_size={len(events_queue)+1}")
                    events_queue.append(("task_update", stage, data))
                elif event_type == "module_generation_start":
                    # Module generation start event
                    logger.info(f"Queuing module_generation_start: module {data.get('module_index', '?')}/{data.get('total_modules', '?')} - {data.get('module_title', 'unknown')}")
                    events_queue.append(("module_generation_start", "generation", data))
                elif event_type == "module_generated":
                    # Module generation progress event
                    exec_time = data.get('execution_time_seconds', 0)
                    logger.info(f"Queuing module_generated: module {data.get('module_index', '?')}/{data.get('total_modules', '?')} - {data.get('module_title', 'unknown')} (took {exec_time}s)")
                    events_queue.append(("module_generated", "generation", data))
                elif event_type == "module_generation_failed":
                    # Module generation failure event
                    logger.warning(f"Queuing module_generation_failed: module {data.get('module_index', '?')}/{data.get('total_modules', '?')} - {data.get('error', 'unknown error')}")
                    events_queue.append(("module_generation_failed", "generation", data))
                elif event_type == "pipeline_complete":
                    events_queue.append(("done", "finalize", data))
                elif event_type == "pipeline_error":
                    events_queue.append(("error", "error", data))
            
            pipeline.event_callback = pipeline_event_handler
            
            # Start generation in background
            async def generate_and_yield():
                nonlocal generation_done, modules_result
                try:
                    result = await pipeline.generate_syllabus(course)
                    modules_result.append(result)
                except Exception as e:
                    events_queue.append(("error", "error", {"error": str(e)}))
                finally:
                    generation_done = True
                    # Give a small delay to ensure any final events are queued
                    await asyncio.sleep(0.1)
            
            generation_task = asyncio.create_task(generate_and_yield())
            
            # Yield events as they come - ensure we flush all events immediately
            last_event_time = asyncio.get_event_loop().time()
            empty_iterations = 0
            while not generation_done or events_queue:
                if events_queue:
                    empty_iterations = 0
                    event_type, stage, data = events_queue.popleft()
                    event_str = emit(stage, event_type, data)
                    logger.info(f"Yielding SSE event: type={event_type}, stage={stage}, queue_remaining={len(events_queue)}, data_keys={list(data.keys()) if isinstance(data, dict) else 'N/A'}")
                    yield event_str
                    last_event_time = asyncio.get_event_loop().time()
                else:
                    empty_iterations += 1
                    # If no events for 0.5 seconds after generation is done, exit
                    if generation_done:
                        current_time = asyncio.get_event_loop().time()
                        if current_time - last_event_time > 0.5:
                            logger.info(f"Exiting event loop: generation_done=True, empty_iterations={empty_iterations}")
                            break
                    # Use shorter sleep to check queue more frequently
                    await asyncio.sleep(0.01)
            
            # Get final result
            modules = modules_result[0] if modules_result else []
            
            # Hard failure if no modules generated
            if not modules:
                logger.error("Syllabus generation produced no valid modules")
                raise ValueError("Syllabus generation produced no valid modules")
            
            # Finalize: persist to Course as draft
            run.phase = "finalize"
            run.status = "completed"
            run.updated_at = datetime.utcnow()
            run.result = {"modules": modules}
            self.db.add(run)
            
            course.syllabus_draft = {"modules": modules}
            self.db.add(course)
            self.db.commit()
            
            # Update session state
            session.session_state = {
                "phase": "finalize",
                "status": "completed",
                "modules": modules,
                "approved": True,  # New architecture validates before finalizing
            }
            session.status = SessionStatus.COMPLETED
            session.ended_at = datetime.utcnow()
            self.db.add(session)
            self.db.commit()
            
            yield emit("finalize", "done", {
                "approved": True,
                "modules_count": len(modules)
            })
            
        except Exception as e:
            run.status = "failed"
            run.error = str(e)
            run.updated_at = datetime.utcnow()
            self.db.add(run)
            
            session.status = SessionStatus.CANCELLED
            session.ended_at = datetime.utcnow()
            if not session.session_state:
                session.session_state = {}
            session.session_state["error"] = str(e)
            self.db.add(session)
            self.db.commit()
            
            yield f"event: {SessionEventType.ERROR.value}\ndata: {json.dumps({'phase': run.phase, 'type': 'error', 'data': {'error': str(e)}})}\n\n"
        finally:
            yield f"event: {SessionEventType.SESSION_ENDED.value}\ndata: {json.dumps({'session_id': session.id})}\n\n"


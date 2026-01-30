"""
Syllabus generation service.

Standalone service for syllabus runs. No Session or Conversation.
Uses SyllabusRun + SyllabusEvent; streams via SyllabusAgent.run_stream() → SSE metadata_update.
"""

from __future__ import annotations

import asyncio
import json
from collections import deque
from datetime import datetime
from types import SimpleNamespace
from typing import AsyncIterator
from uuid import uuid4

from sqlalchemy.orm import Session as DBSession

from api.bootstrap import build_registry
from api.models.models import Course, SyllabusEvent, SyllabusRun
from api.utils.logger import configure_logging

logger = configure_logging()

# SSE event names (same shape as session stream for frontend compatibility)
EVENT_METADATA_UPDATE = "metadata_update"
EVENT_ERROR = "error"
EVENT_RUN_ENDED = "run_ended"


class SyllabusService:
    """Service for syllabus generation runs. No session dependency."""

    def __init__(self, db: DBSession):
        self.db = db
        self.registry = build_registry()

    def get_run(self, run_id: str, user_id: int) -> SyllabusRun | None:
        """Get a syllabus run by id and user (for auth)."""
        return (
            self.db.query(SyllabusRun)
            .filter(SyllabusRun.id == run_id, SyllabusRun.user_id == user_id)
            .first()
        )

    def start_run(self, course_id: str, user_id: int) -> str:
        """
        Create a new syllabus run for the course. Returns run_id.
        Does not create Session or Conversation.
        """
        course = (
            self.db.query(Course)
            .filter(Course.id == course_id, Course.user_id == user_id)
            .first()
        )
        if not course:
            raise ValueError("Course not found")
        run_id = str(uuid4())
        run = SyllabusRun(
            id=run_id,
            user_id=user_id,
            course_id=course_id,
            status="running",
            phase="planning",
        )
        self.db.add(run)
        self.db.commit()
        return run_id

    async def stream_run(self, run_id: str, user_id: int) -> AsyncIterator[str]:
        """
        Stream syllabus generation for the run. Yields SSE strings.
        Uses SyllabusAgent.run_stream(); emits metadata_update (phase, type, data).
        """
        run = self.get_run(run_id, user_id)
        if not run:
            yield f"event: {EVENT_ERROR}\ndata: {json.dumps({'error': 'Run not found'})}\n\n"
            return
        course = (
            self.db.query(Course)
            .filter(Course.id == run.course_id, Course.user_id == user_id)
            .first()
        )
        if not course:
            yield f"event: {EVENT_ERROR}\ndata: {json.dumps({'error': 'Course not found'})}\n\n"
            return

        def emit(phase: str | None, type_: str, data: dict | None = None) -> str:
            try:
                ev = SyllabusEvent(
                    id=str(uuid4()),
                    run_id=run_id,
                    phase=phase,
                    type=type_,
                    data=data,
                )
                self.db.add(ev)
                run.phase = phase
                run.updated_at = datetime.utcnow()
                self.db.add(run)
                self.db.commit()
            except Exception as e:
                logger.error("syllabus emit error phase=%s type=%s: %s", phase, type_, e)
            payload = {"phase": phase, "type": type_, "data": data}
            return f"event: {EVENT_METADATA_UPDATE}\ndata: {json.dumps(payload)}\n\n"

        try:
            events_queue: deque = deque()
            generation_done = False
            syllabus_result_holder: list[SimpleNamespace] = []

            async def run_syllabus_agent() -> None:
                nonlocal generation_done, syllabus_result_holder
                try:
                    agent = self.registry.get("syllabus")
                    input_str = json.dumps({
                        "course_title": course.title,
                        "subject": course.subject,
                        "goals": course.goals,
                    })
                    async for chunk in agent.run_stream(input_str):
                        try:
                            payload = json.loads(chunk)
                        except (json.JSONDecodeError, TypeError):
                            continue
                        event_type = payload.get("event_type")
                        stage = payload.get("stage", "planning")
                        data = payload.get("data") or {}
                        if stage in ("planning", "finalize"):
                            run.phase = stage
                            run.updated_at = datetime.utcnow()
                            self.db.add(run)
                            self.db.commit()
                        events_queue.append((event_type, stage, data))
                        if event_type == "done":
                            syllabus_result_holder.append(
                                SimpleNamespace(modules=data.get("modules") or [])
                            )
                            modules = data.get("modules") or []
                            for idx, mod in enumerate(modules, 1):
                                events_queue.append(
                                    (
                                        "module_generated",
                                        "generation",
                                        {
                                            "module_index": idx,
                                            "total_modules": len(modules),
                                            "module_title": mod.get("title", ""),
                                            "module": mod,
                                        },
                                    )
                                )
                except Exception as e:
                    events_queue.append(("error", "error", {"error": str(e)}))
                finally:
                    generation_done = True
                    await asyncio.sleep(0.1)

            asyncio.create_task(run_syllabus_agent())

            last_event_time = asyncio.get_event_loop().time()
            while not generation_done or events_queue:
                if events_queue:
                    event_type, stage, data = events_queue.popleft()
                    event_str = emit(stage, event_type, data)
                    logger.info(
                        "syllabus SSE: type=%s stage=%s queue=%d",
                        event_type,
                        stage,
                        len(events_queue),
                    )
                    yield event_str
                    last_event_time = asyncio.get_event_loop().time()
                else:
                    if generation_done:
                        if asyncio.get_event_loop().time() - last_event_time > 0.5:
                            break
                    await asyncio.sleep(0.01)

            modules = syllabus_result_holder[0].modules if syllabus_result_holder else []
            if not modules:
                raise ValueError("Syllabus generation produced no modules")

            run.phase = "finalize"
            run.status = "completed"
            run.updated_at = datetime.utcnow()
            run.result = {"modules": modules}
            self.db.add(run)
            course.syllabus_draft = {"modules": modules}
            self.db.add(course)
            self.db.commit()

            yield emit("finalize", "done", {"approved": True, "modules_count": len(modules)})

        except Exception as e:
            run.status = "failed"
            run.error = str(e)
            run.updated_at = datetime.utcnow()
            self.db.add(run)
            self.db.commit()
            yield f"event: {EVENT_ERROR}\ndata: {json.dumps({'phase': run.phase, 'type': 'error', 'data': {'error': str(e)}})}\n\n"
        finally:
            yield f"event: {EVENT_RUN_ENDED}\ndata: {json.dumps({'run_id': run_id})}\n\n"

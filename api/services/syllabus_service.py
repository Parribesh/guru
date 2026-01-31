"""
Syllabus generation service.

Standalone service for syllabus runs. No Session or Conversation.
Persists LangGraph state (run.state_snapshot + SyllabusEvent.data); events are state-derived.
Replays stored events when client connects to a completed/failed run.
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
from api.models.models import Course, SyllabusEvent, SyllabusRun, User as DbUser
from api.utils.logger import configure_logging
from infra.llm.ollama import OllamaLLM
from agents.syllabus_agent.agent import SyllabusAgent

logger = configure_logging()

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

    def list_runs(
        self, user_id: int, status: str | None = None, limit: int = 20
    ) -> list[dict]:
        """List syllabus runs for the user, optionally filtered by status. Most recent first."""
        q = self.db.query(SyllabusRun).filter(SyllabusRun.user_id == user_id)
        if status:
            q = q.filter(SyllabusRun.status == status)
        runs = q.order_by(SyllabusRun.updated_at.desc()).limit(limit).all()
        return [
            {
                "run_id": r.id,
                "course_id": r.course_id,
                "status": r.status,
                "phase": r.phase,
            }
            for r in runs
        ]

    def delete_run(self, run_id: str, user_id: int) -> bool:
        """Delete a syllabus run and its events. Returns True if deleted, False if not found."""
        run = self.get_run(run_id, user_id)
        if not run:
            return False
        self.db.query(SyllabusEvent).filter(SyllabusEvent.run_id == run_id).delete()
        self.db.delete(run)
        self.db.commit()
        return True

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

    async def step_run(self, run_id: str, user_id: int) -> dict | None:
        """
        Run one graph node for the run; persist state; return { stage, state, done }.
        If run is completed/failed, return None. State is loaded from run.state_snapshot
        or built from course (initial step).
        """
        run = self.get_run(run_id, user_id)
        if not run or run.status in ("completed", "failed"):
            return None
        course = (
            self.db.query(Course)
            .filter(Course.id == run.course_id, Course.user_id == user_id)
            .first()
        )
        if not course:
            return None
        user = self.db.query(DbUser).filter(DbUser.id == user_id).first()
        prefs = user.preferences if user and isinstance(user.preferences, dict) else {}
        model = prefs.get("ollama_model") or "qwen:latest"
        llm = OllamaLLM(model=model)
        agent = SyllabusAgent(name="SyllabusAgent", llm=llm)
        plan = {
            "course_title": course.title,
            "subject": course.subject,
            "goals": course.goals,
        }
        state = run.state_snapshot if isinstance(run.state_snapshot, dict) else None
        if state is None:
            state = agent.get_initial_step_state(plan)
        stage = state.get("next_node") or "planning"
        new_state, done = await agent.run_one_step(state, inference_model=model)
        run.state_snapshot = new_state
        run.phase = stage
        run.updated_at = datetime.utcnow()
        ev = SyllabusEvent(
            id=str(uuid4()),
            run_id=run_id,
            phase=stage,
            type="node_result",
            data=new_state,
        )
        self.db.add(ev)
        if done:
            run.status = "completed"
            run.phase = "finalize"
            run.result = {
                "modules": new_state.get("modules") or [],
                "concepts_by_level": new_state.get("concepts_by_level") or {},
            }
            course.syllabus_draft = run.result
            self.db.add(course)
        self.db.add(run)
        self.db.commit()
        return {
            "stage": stage,
            "state": new_state,
            "done": done,
            "agent": new_state.get("agent") or agent.name,
            "inference_model": new_state.get("inference_model") or model,
        }

    async def stream_run(self, run_id: str, user_id: int) -> AsyncIterator[str]:
        """
        Stream syllabus generation for the run. Yields SSE strings.
        Agent yields state-derived events (event_type, stage, state); we persist state
        to run.state_snapshot and SyllabusEvent.data, emit metadata_update(phase, type, data=state).
        If run is already completed/failed, replay stored events then run_ended.
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

        # Replay: run already finished — yield stored events then run_ended
        if run.status in ("completed", "failed"):
            events = (
                self.db.query(SyllabusEvent)
                .filter(SyllabusEvent.run_id == run_id)
                .order_by(SyllabusEvent.created_at.asc())
                .all()
            )
            for ev in events:
                payload = {"phase": ev.phase, "type": ev.type, "data": ev.data}
                yield f"event: {EVENT_METADATA_UPDATE}\ndata: {json.dumps(payload)}\n\n"
            yield f"event: {EVENT_RUN_ENDED}\ndata: {json.dumps({'run_id': run_id})}\n\n"
            return

        def emit(phase: str | None, type_: str, state: dict | None = None) -> str:
            """Persist state to run + SyllabusEvent; return SSE line. data = state (state-derived)."""
            try:
                ev = SyllabusEvent(
                    id=str(uuid4()),
                    run_id=run_id,
                    phase=phase,
                    type=type_,
                    data=state,
                )
                self.db.add(ev)
                run.phase = phase
                run.updated_at = datetime.utcnow()
                # Only update state_snapshot for full graph state (phase_start, state_update, done)
                if state and isinstance(state, dict) and type_ in ("phase_start", "state_update", "done"):
                    run.state_snapshot = state
                self.db.add(run)
                self.db.commit()
            except Exception as e:
                logger.error("syllabus emit error phase=%s type=%s: %s", phase, type_, e)
            payload = {"phase": phase, "type": type_, "data": state}
            return f"event: {EVENT_METADATA_UPDATE}\ndata: {json.dumps(payload)}\n\n"

        try:
            events_queue: deque = deque()
            generation_done = False
            syllabus_result_holder: list[SimpleNamespace] = []

            agent_error: list[str] = []  # capture agent exception for reporting

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
                        state = payload.get("state") or {}
                        events_queue.append((event_type, stage, state))
                        if event_type == "done":
                            modules = state.get("modules") or []
                            concepts_by_level = state.get("concepts_by_level") or {}
                            syllabus_result_holder.append(
                                SimpleNamespace(modules=modules, concepts_by_level=concepts_by_level)
                            )
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
                    agent_error.append(str(e))
                    events_queue.append(("error", "error", {"error": str(e)}))
                finally:
                    generation_done = True
                    await asyncio.sleep(0.1)

            agent_task = asyncio.create_task(run_syllabus_agent())

            last_agent_state: dict | None = None
            last_event_time = asyncio.get_event_loop().time()
            while not generation_done or events_queue:
                if events_queue:
                    event_type, stage, state = events_queue.popleft()
                    if event_type == "done" and isinstance(state, dict) and state:
                        last_agent_state = state
                    event_str = emit(stage, event_type, state if isinstance(state, dict) and state else None)
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

            # Await task so any exception from the agent is surfaced
            try:
                await agent_task
            except Exception as e:
                if not agent_error:
                    agent_error.append(str(e))
                raise

            result_ns = syllabus_result_holder[0] if syllabus_result_holder else None
            modules = result_ns.modules if result_ns else []
            concepts_by_level = getattr(result_ns, "concepts_by_level", None) if result_ns else None
            if not modules and agent_error:
                msg = agent_error[0]
                raise ValueError(msg)

            run.phase = "finalize"
            run.status = "completed"
            run.updated_at = datetime.utcnow()
            run.result = {"modules": modules, "concepts_by_level": concepts_by_level or {}}
            self.db.add(run)
            course.syllabus_draft = {"modules": modules, "concepts_by_level": concepts_by_level or {}}
            self.db.add(course)
            self.db.commit()

            # Final emit: keep full state (current_stage, concepts_by_level, modules) so state_snapshot is not overwritten
            final_state = dict(last_agent_state) if last_agent_state else {"modules": modules}
            final_state["approved"] = True
            final_state["modules_count"] = len(modules)
            yield emit("finalize", "done", final_state)

        except Exception as e:
            run.status = "failed"
            run.error = str(e)
            run.updated_at = datetime.utcnow()
            self.db.add(run)
            self.db.commit()
            yield f"event: {EVENT_ERROR}\ndata: {json.dumps({'phase': run.phase, 'type': 'error', 'data': {'error': str(e)}})}\n\n"
        finally:
            yield f"event: {EVENT_RUN_ENDED}\ndata: {json.dumps({'run_id': run_id})}\n\n"

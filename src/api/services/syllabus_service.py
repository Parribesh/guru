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
from typing import AsyncIterator, Optional
from uuid import uuid4

from sqlalchemy.orm import Session as DBSession

from api.models.models import Course, SyllabusEvent, SyllabusRun, User as DbUser
from api.settings import settings
from api.utils.logger import configure_logging
from infra.llm.factory import get_llm, get_llm_for_user
from agents.tutor_agent.agent import TutorAgent

logger = configure_logging()

EVENT_METADATA_UPDATE = "metadata_update"
EVENT_ERROR = "error"
EVENT_RUN_ENDED = "run_ended"


class SyllabusService:
    """Service for syllabus generation runs. No session dependency."""

    def __init__(self, db: DBSession):
        self.db = db

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

    def _resolve_model_config(
        self,
        user_id: int,
        provider: Optional[str] = None,
        model: Optional[str] = None,
    ) -> tuple[str, str]:
        """Resolve active provider and model, falling back to user preferences or system settings."""
        resolved_provider = provider
        resolved_model = model

        user = self.db.query(DbUser).filter(DbUser.id == user_id).first()
        prefs = user.preferences if user and isinstance(user.preferences, dict) else {}

        if not resolved_provider:
            resolved_provider = prefs.get("llm_provider") or settings.LLM_PROVIDER
        resolved_provider = str(resolved_provider).lower()

        if not resolved_model:
            if resolved_provider == "gemini":
                resolved_model = (
                    prefs.get("gemini_model")
                    or prefs.get("llm_model")
                    or settings.GEMINI_MODEL
                )
            elif resolved_provider == "ollama":
                resolved_model = (
                    prefs.get("ollama_model")
                    or prefs.get("llm_model")
                    or settings.OLLAMA_MODEL
                )
            else:
                resolved_model = prefs.get("llm_model") or "qwen2.5:latest"

        return resolved_provider, str(resolved_model)

    def start_run(
        self,
        course_id: str,
        user_id: int,
        provider: Optional[str] = None,
        model: Optional[str] = None,
        agent: Optional[str] = "TutorAgent",
    ) -> str:
        """
        Create a new syllabus run for the course with chosen or default provider and model.
        Returns run_id.
        """
        course = (
            self.db.query(Course)
            .filter(Course.id == course_id, Course.user_id == user_id)
            .first()
        )
        if not course:
            raise ValueError("Course not found")

        resolved_provider, resolved_model = self._resolve_model_config(user_id, provider, model)
        resolved_agent = agent or "TutorAgent"

        run_id = str(uuid4())
        initial_state = {
            "next_node": "generate_concepts",
            "modules": [],
            "provider": resolved_provider,
            "inference_model": resolved_model,
            "agent": resolved_agent,
        }
        run = SyllabusRun(
            id=run_id,
            user_id=user_id,
            course_id=course_id,
            status="running",
            phase="planning",
            state_snapshot=initial_state,
        )
        self.db.add(run)
        self.db.commit()
        return run_id

    def rerun_for_course(
        self,
        course_id: str,
        user_id: int,
        provider: Optional[str] = None,
        model: Optional[str] = None,
        agent: Optional[str] = "TutorAgent",
    ) -> str:
        """
        Reset/archive previous runs for a course and start a clean new run with chosen model & agent.
        """
        course = (
            self.db.query(Course)
            .filter(Course.id == course_id, Course.user_id == user_id)
            .first()
        )
        if not course:
            raise ValueError("Course not found")

        existing_runs = (
            self.db.query(SyllabusRun)
            .filter(SyllabusRun.course_id == course_id, SyllabusRun.status == "running")
            .all()
        )
        for r in existing_runs:
            r.status = "archived"

        course.syllabus_confirmed = False
        self.db.commit()

        return self.start_run(course_id, user_id, provider=provider, model=model, agent=agent)

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

        state = run.state_snapshot if isinstance(run.state_snapshot, dict) else {}
        stored_provider = state.get("provider")
        stored_model = state.get("inference_model")
        resolved_provider, resolved_model = self._resolve_model_config(
            user_id, stored_provider, stored_model
        )

        llm = get_llm(provider=resolved_provider, model=resolved_model)
        agent_name = state.get("agent") or "TutorAgent"
        agent = TutorAgent(name=agent_name, llm=llm)
        plan = {
            "course_title": course.title,
            "subject": course.subject,
            "goals": course.goals,
        }

        # Initialize full graph state if not yet set
        if not state.get("current_level"):
            initial_state = agent.get_initial_syllabus_state(plan)
            state = {**initial_state, **state}

        stage = state.get("next_node") or "generate_concepts"
        new_state, done = await agent.run_one_step(state, inference_model=resolved_model)

        # Ensure model information is preserved in state
        new_state["provider"] = resolved_provider
        new_state["inference_model"] = resolved_model
        new_state["agent"] = agent.name

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
            "agent": agent.name,
            "provider": resolved_provider,
            "inference_model": resolved_model,
        }

    async def auto_run(self, run_id: str, user_id: int, max_steps: int = 30) -> dict:
        """
        Run the syllabus generation graph continuously until done=True or max_steps reached.
        Returns a structured summary dict with success, run_id, status, stage, steps_executed, etc.
        """
        last_result = None
        steps = 0
        error_msg = None
        for i in range(max_steps):
            try:
                res = await self.step_run(run_id, user_id)
            except Exception as e:
                logger.exception("Error during auto_run step %d: %s", i + 1, e)
                error_msg = str(e)
                break
            if not res:
                break
            steps += 1
            last_result = res
            if res.get("done"):
                break

        run = self.get_run(run_id, user_id)
        if not last_result:
            return {
                "success": bool(run and run.status == "completed"),
                "run_id": run_id,
                "status": run.status if run else "failed",
                "stage": run.phase if run else "unknown",
                "steps_executed": steps,
                "done": bool(run and run.status == "completed"),
                "modules_count": len((run.result or {}).get("modules", [])) if run and run.result else 0,
                "error": error_msg or "Run not found or already completed",
            }

        state = last_result.get("state") or {}
        modules = state.get("modules") or []
        return {
            "success": True,
            "run_id": run_id,
            "status": run.status if run else ("completed" if last_result.get("done") else "running"),
            "stage": last_result.get("stage"),
            "steps_executed": steps,
            "done": bool(last_result.get("done")),
            "modules_count": len(modules),
            "agent": last_result.get("agent"),
            "provider": last_result.get("provider"),
            "inference_model": last_result.get("inference_model"),
            "state": state,
            "error": error_msg,
        }

    async def stream_run(self, run_id: str, user_id: int) -> AsyncIterator[str]:
        """
        Stream syllabus generation for the run. Yields SSE strings.
        Events emitted: metadata_update (phase, type, data), error, run_ended.
        """
        run = self.get_run(run_id, user_id)
        if not run:
            yield f"event: {EVENT_ERROR}\ndata: {json.dumps({'error': 'Run not found'})}\n\n"
            yield f"event: {EVENT_RUN_ENDED}\ndata: {{}}\n\n"
            return

        course = (
            self.db.query(Course)
            .filter(Course.id == run.course_id, Course.user_id == user_id)
            .first()
        )
        if not course:
            yield f"event: {EVENT_ERROR}\ndata: {json.dumps({'error': 'Course not found'})}\n\n"
            yield f"event: {EVENT_RUN_ENDED}\ndata: {{}}\n\n"
            return

        # If already completed or failed, replay stored events from DB
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
            if run.error:
                yield f"event: {EVENT_ERROR}\ndata: {json.dumps({'error': run.error})}\n\n"
            yield f"event: {EVENT_RUN_ENDED}\ndata: {{}}\n\n"
            return

        state = run.state_snapshot if isinstance(run.state_snapshot, dict) else {}
        stored_provider = state.get("provider")
        stored_model = state.get("inference_model")
        resolved_provider, resolved_model = self._resolve_model_config(
            user_id, stored_provider, stored_model
        )

        try:
            llm = get_llm(provider=resolved_provider, model=resolved_model)
        except Exception as e:
            logger.warning("Failed to instantiate LLM %s/%s: %s. Falling back to user default.", resolved_provider, resolved_model, e)
            llm = get_llm_for_user(self.db, user_id)

        agent = TutorAgent(name="TutorAgent", llm=llm)

        def emit(phase: str, type_: str, state_data: dict | None = None) -> str:
            try:
                ev = SyllabusEvent(
                    id=str(uuid4()),
                    run_id=run_id,
                    phase=phase,
                    type=type_,
                    data=state_data,
                )
                self.db.add(ev)
                run.phase = phase
                run.updated_at = datetime.utcnow()
                if state_data and isinstance(state_data, dict) and type_ in ("phase_start", "state_update", "done"):
                    run.state_snapshot = state_data
                self.db.add(run)
                self.db.commit()
            except Exception as e:
                logger.error("syllabus emit error phase=%s type=%s: %s", phase, type_, e)
            payload = {"phase": phase, "type": type_, "data": state_data}
            return f"event: {EVENT_METADATA_UPDATE}\ndata: {json.dumps(payload)}\n\n"

        try:
            events_queue: deque = deque()
            generation_done = False
            syllabus_result_holder: list[SimpleNamespace] = []
            agent_error: list[str] = []

            async def run_curriculum_stream() -> None:
                nonlocal generation_done, syllabus_result_holder
                try:
                    plan = {
                        "course_title": course.title,
                        "subject": course.subject,
                        "goals": course.goals,
                    }
                    async for chunk in agent.run_syllabus_stream(plan):
                        try:
                            payload = json.loads(chunk)
                        except (json.JSONDecodeError, TypeError):
                            continue
                        event_type = payload.get("event_type")
                        stage = payload.get("stage", "planning")
                        state_val = payload.get("state") or {}
                        if isinstance(state_val, dict):
                            state_val["provider"] = resolved_provider
                            state_val["inference_model"] = resolved_model
                            state_val["agent"] = agent.name
                        events_queue.append((event_type, stage, state_val))
                        if event_type == "done":
                            modules = state_val.get("modules") or []
                            concepts_by_level = state_val.get("concepts_by_level") or {}
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
                    logger.exception("Error in run_curriculum_stream: %s", e)
                    agent_error.append(str(e))
                    events_queue.append(("error", "error", {"error": str(e)}))
                finally:
                    generation_done = True
                    await asyncio.sleep(0.1)

            agent_task = asyncio.create_task(run_curriculum_stream())

            last_agent_state: dict | None = None
            last_event_time = asyncio.get_event_loop().time()
            while not generation_done or events_queue:
                if events_queue:
                    event_type, stage, sdata = events_queue.popleft()
                    if event_type == "done" and isinstance(sdata, dict) and sdata:
                        last_agent_state = sdata
                    event_str = emit(stage, event_type, sdata if isinstance(sdata, dict) and sdata else None)
                    yield event_str
                    last_event_time = asyncio.get_event_loop().time()
                else:
                    if generation_done:
                        if asyncio.get_event_loop().time() - last_event_time > 0.5:
                            break
                    await asyncio.sleep(0.01)

            await agent_task

            if agent_error:
                run.status = "failed"
                run.error = "; ".join(agent_error)
                self.db.add(run)
                self.db.commit()
                yield f"event: {EVENT_ERROR}\ndata: {json.dumps({'error': run.error})}\n\n"
                yield f"event: {EVENT_RUN_ENDED}\ndata: {{}}\n\n"
                return

            result_ns = syllabus_result_holder[0] if syllabus_result_holder else None
            modules = result_ns.modules if result_ns else []
            concepts_by_level = result_ns.concepts_by_level if result_ns else {}

            if not modules and last_agent_state and isinstance(last_agent_state, dict):
                modules = last_agent_state.get("modules") or []
                concepts_by_level = last_agent_state.get("concepts_by_level") or {}

            run.status = "completed"
            run.phase = "finalize"
            run.result = {"modules": modules, "concepts_by_level": concepts_by_level or {}}
            run.updated_at = datetime.utcnow()
            course.syllabus_draft = {"modules": modules, "concepts_by_level": concepts_by_level or {}}
            self.db.add(run)
            self.db.add(course)
            self.db.commit()

            emit("finalize", "done", {"modules": modules, "concepts_by_level": concepts_by_level})
            yield f"event: {EVENT_RUN_ENDED}\ndata: {{}}\n\n"

        except Exception as e:
            logger.exception("Syllabus generation stream error: %s", e)
            run.status = "failed"
            run.error = str(e)
            self.db.add(run)
            self.db.commit()
            yield f"event: {EVENT_ERROR}\ndata: {json.dumps({'error': str(e)})}\n\n"
            yield f"event: {EVENT_RUN_ENDED}\ndata: {{}}\n\n"

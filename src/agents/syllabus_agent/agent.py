"""
SyllabusAgent: stub for clean state. No full-course generation.

New design: per-module path; LLM suggests next concept when user completes one.
This stub completes immediately with empty modules so the API stays valid.
"""

from __future__ import annotations

import json
from typing import Any, AsyncIterator, Dict, List, Optional, TypedDict

from agents.core.base_agent import BaseAgent
from agents.core.memory import Memory
from agents.core.tool import Tool


class SyllabusGraphState(TypedDict, total=False):
    """State for syllabus (stub: no graph)."""
    course_title: str
    subject: str
    goals: Optional[str]
    target_level: str
    time_budget_minutes: Optional[int]
    concepts_by_level: Optional[Dict[str, Any]]
    modules: Optional[List[Dict[str, Any]]]
    error: Optional[str]
    current_stage: str


def _serialize_state(state: SyllabusGraphState) -> Dict[str, Any]:
    """Serialize state to JSON-serializable dict."""
    out: Dict[str, Any] = {
        "course_title": state.get("course_title", ""),
        "subject": state.get("subject", ""),
        "goals": state.get("goals"),
        "target_level": state.get("target_level", "beginner"),
        "time_budget_minutes": state.get("time_budget_minutes"),
        "current_stage": state.get("current_stage", ""),
        "modules": state.get("modules") or [],
        "error": state.get("error"),
    }
    cbl = state.get("concepts_by_level")
    out["concepts_by_level"] = cbl if isinstance(cbl, dict) else None
    return out


class SyllabusAgent(BaseAgent):
    """
    Stub: no full-course generation. Yields done with empty modules.
    New design will be per-module, next-concept-on-completion.
    """

    def __init__(
        self,
        *,
        name: str,
        llm: Any,
        tools: Optional[List[Tool]] = None,
        memory: Optional[Memory] = None,
    ):
        super().__init__(
            name=name,
            llm=llm,
            tools=tools or [],
            memory=memory or _no_memory(),
        )

    def plan(self, input: str) -> Any:
        """Parse input JSON into plan (course_title, subject, goals)."""
        try:
            data = json.loads(input) if isinstance(input, str) else input
        except (json.JSONDecodeError, TypeError):
            data = {}
        return SyllabusGraphState(
            course_title=data.get("course_title", ""),
            subject=data.get("subject", ""),
            goals=data.get("goals"),
            target_level=data.get("target_level", "beginner"),
            time_budget_minutes=data.get("time_budget_minutes"),
            current_stage="",
        )

    def execute(self, plan: Any) -> str:
        """Stub: return empty modules."""
        return json.dumps({
            "modules": [],
            "concepts_by_level": {"beginner": [], "intermediate": [], "advanced": []},
        })

    async def execute_stream(self, plan: Any) -> AsyncIterator[str]:
        """Stub: yield phase_start then done with empty modules."""
        initial: SyllabusGraphState = {**plan, "current_stage": "planning"}
        yield json.dumps({
            "event_type": "phase_start",
            "stage": "planning",
            "state": _serialize_state(initial),
        })
        final: SyllabusGraphState = {
            **plan,
            "current_stage": "finalize",
            "modules": [],
            "concepts_by_level": {"beginner": [], "intermediate": [], "advanced": []},
        }
        yield json.dumps({
            "event_type": "done",
            "stage": "finalize",
            "state": _serialize_state(final),
        })


def _no_memory() -> Memory:
    from agents.core.no_memory import NoMemory
    return NoMemory()

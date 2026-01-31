"""
SyllabusAgent: LangGraph with three nodes per level — generate_concepts, validate, add_concepts (retry), add_module.
Validation node checks concept count; if not up to par, add_concepts runs (with retries).
"""

from __future__ import annotations

import json
from typing import Any, AsyncIterator, Dict, Optional

from agents.core.base_agent import BaseAgent
from agents.core.memory import Memory
from agents.core.tool import Tool
from agents.syllabus_agent.agentic.graph import build_syllabus_level_graph, get_levels, run_one_step as graph_run_one_step
from agents.syllabus_agent.agentic.prompts import SYLLABUS_AGENT_SYSTEM_PROMPT
from agents.syllabus_agent.agentic.schemas import SyllabusState


def _initial_level_state(plan: Dict[str, Any]) -> Dict[str, Any]:
    """Build initial LangGraph state (syllabus fields + per-level placeholders)."""
    state = SyllabusState.create_initial(
        course_title=plan.get("course_title", ""),
        subject=plan.get("subject", ""),
        goals=plan.get("goals"),
        target_level=plan.get("target_level", "beginner"),
        time_budget_minutes=plan.get("time_budget_minutes"),
    )
    out = state.to_serializable()
    out["current_level"] = ""
    out["current_concepts"] = []
    out["meets_threshold"] = False
    out["needed_count"] = 0
    out["add_concepts_rounds"] = 0
    return out


def _initial_step_state(plan: Dict[str, Any]) -> Dict[str, Any]:
    """Initial state for step-by-step run: includes next_node and current_level."""
    state = _initial_level_state(plan)
    levels = list(get_levels())
    state["next_node"] = "generate_concepts"
    state["current_level"] = levels[0] if levels else "beginner"
    return state


class SyllabusAgent(BaseAgent):
    """
    LangGraph: three nodes per level — generate_concepts, validate, add_concepts (retry), add_module.
    Validation checks concept count; add_concepts runs if not up to par (with retries).
    """

    def __init__(
        self,
        *,
        name: str,
        llm: Any,
        tools: Optional[list] = None,
        memory: Optional[Memory] = None,
        system_prompt: Optional[str] = None,
    ):
        super().__init__(
            name=name,
            llm=llm,
            tools=tools or [],
            memory=memory or _no_memory(),
        )
        self.system_prompt = system_prompt if system_prompt is not None else SYLLABUS_AGENT_SYSTEM_PROMPT

    def plan(self, input: str) -> Any:
        """Parse input JSON into plan (course_title, subject, goals)."""
        try:
            data = json.loads(input) if isinstance(input, str) else input
        except (json.JSONDecodeError, TypeError):
            data = {}
        return data

    def get_initial_step_state(self, plan: Dict[str, Any]) -> Dict[str, Any]:
        """Initial state for step-by-step run (next_node and current_level set)."""
        return _initial_step_state(plan)

    async def run_one_step(
        self,
        state: Dict[str, Any],
        *,
        inference_model: Optional[str] = None,
    ) -> tuple[Dict[str, Any], bool]:
        """Run one graph node; return (updated_state, done). Agent info and system_prompt stored in state."""
        return await graph_run_one_step(
            state,
            self.llm,
            system_prompt=self.system_prompt,
            agent_name=self.name,
            inference_model=inference_model,
        )

    def execute(self, plan: Any) -> str:
        """Sync run: not supported for graph; returns empty. Use execute_stream."""
        state = SyllabusState.create_initial(
            course_title=plan.get("course_title", ""),
            subject=plan.get("subject", ""),
            goals=plan.get("goals"),
            target_level=plan.get("target_level", "beginner"),
            time_budget_minutes=plan.get("time_budget_minutes"),
        )
        return json.dumps(state.to_serializable())

    async def execute_stream(self, plan: Any) -> AsyncIterator[str]:
        """Run LangGraph per level; yield node_result after each node so frontend can show every step."""
        state = _initial_level_state(plan)
        state["current_stage"] = "planning"
        yield json.dumps({
            "event_type": "phase_start",
            "stage": "planning",
            "state": state,
        })
        graph = build_syllabus_level_graph(self.llm, system_prompt=self.system_prompt)
        for level in get_levels():
            state["current_level"] = level
            # Stream each node; astream yields { node_name: state_update }
            async for event in graph.astream(state):
                if not isinstance(event, dict):
                    continue
                for node_name, update in event.items():
                    if isinstance(update, dict):
                        state = {**state, **update}
                    yield json.dumps({
                        "event_type": "node_result",
                        "stage": node_name,
                        "state": state,
                    })
        state["current_stage"] = "finalize"
        done_state = {
            "course_title": state.get("course_title", ""),
            "subject": state.get("subject", ""),
            "goals": state.get("goals"),
            "target_level": state.get("target_level", "beginner"),
            "time_budget_minutes": state.get("time_budget_minutes"),
            "modules": state.get("modules", []),
            "concepts_by_level": state.get("concepts_by_level", {}),
            "current_stage": "finalize",
            "error": state.get("error"),
        }
        yield json.dumps({
            "event_type": "done",
            "stage": "finalize",
            "state": done_state,
        })


def _no_memory() -> Memory:
    from agents.core.no_memory import NoMemory
    return NoMemory()

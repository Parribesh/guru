"""
Curriculum Planner: LangGraph-based syllabus generation engine.
Defines macro-pedagogy (course outline, modules, concepts, and estimated durations)
for the TutorAgent.
"""

from __future__ import annotations

import json
from typing import Any, AsyncIterator, Dict, Optional

from agents.tutor_agent.curriculum.graph import (
    build_syllabus_level_graph,
    get_levels,
    run_one_step as graph_run_one_step,
)
from agents.tutor_agent.curriculum.prompts import SYLLABUS_AGENT_SYSTEM_PROMPT
from agents.tutor_agent.curriculum.schemas import SyllabusState


def initial_level_state(plan: Dict[str, Any]) -> Dict[str, Any]:
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


def initial_step_state(plan: Dict[str, Any]) -> Dict[str, Any]:
    """Initial state for step-by-step run: includes next_node and current_level."""
    state = initial_level_state(plan)
    levels = list(get_levels())
    state["next_node"] = "generate_concepts"
    state["current_level"] = levels[0] if levels else "beginner"
    return state


async def step_curriculum(
    state: Dict[str, Any],
    llm: Any,
    *,
    system_prompt: Optional[str] = None,
    agent_name: str = "TutorAgent",
    inference_model: Optional[str] = None,
) -> tuple[Dict[str, Any], bool]:
    """Run one curriculum graph node; return (updated_state, done)."""
    prompt = system_prompt if system_prompt is not None else SYLLABUS_AGENT_SYSTEM_PROMPT
    return await graph_run_one_step(
        state,
        llm,
        system_prompt=prompt,
        agent_name=agent_name,
        inference_model=inference_model,
    )


async def stream_curriculum(
    plan: Dict[str, Any],
    llm: Any,
    *,
    system_prompt: Optional[str] = None,
) -> AsyncIterator[str]:
    """Stream curriculum generation through each level, emitting node_result after each step."""
    prompt = system_prompt if system_prompt is not None else SYLLABUS_AGENT_SYSTEM_PROMPT
    state = initial_level_state(plan)
    state["current_stage"] = "planning"
    yield json.dumps({
        "event_type": "phase_start",
        "stage": "planning",
        "state": state,
    })
    graph = build_syllabus_level_graph(llm, system_prompt=prompt)
    for level in get_levels():
        state["current_level"] = level
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

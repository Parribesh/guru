"""
LangGraph: three nodes per level — generate_concepts, validate, add_concepts (retry), add_module.
Validation node checks concept count; if not up to par, add_concepts runs (with retries).
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Literal, Optional, TypedDict

from agents.syllabus_agent.agentic.prompts import build_node_system_prompt
from agents.syllabus_agent.agentic.schemas import MODULE_LEVELS
from agents.syllabus_agent.agentic.stages.concept_generator import MAX_ADD_ROUNDS, MAX_PER_LEVEL, MIN_PER_LEVEL


def _other_modules_concepts_from_state(
    modules: List[Dict[str, Any]],
    current_level: str,
    levels_order: tuple[str, ...],
) -> Dict[str, List[str]]:
    """Build { "Beginner": [...], "Intermediate": [...] } for modules before current_level."""
    out: Dict[str, List[str]] = {}
    try:
        idx = levels_order.index(current_level)
    except ValueError:
        return out
    for i in range(idx):
        level_name = levels_order[i]
        title = level_name.title()
        if i < len(modules):
            objs = modules[i].get("objectives") or []
            if objs:
                out[title] = list(objs)
    return out


def _dedupe_objectives(objectives: List[str]) -> List[str]:
    """Preserve order; keep first occurrence (case-insensitive)."""
    seen: set[str] = set()
    out: List[str] = []
    for c in objectives or []:
        name = (c or "").strip()
        if not name:
            continue
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(name)
    return out


class SyllabusLevelGraphState(TypedDict, total=False):
    """State for one-level LangGraph. Passed through each node; merged back into syllabus state."""
    # Syllabus fields (read/write)
    course_title: str
    subject: str
    goals: Optional[str]
    target_level: str
    time_budget_minutes: Optional[int]
    modules: List[Dict[str, Any]]
    concepts_by_level: Dict[str, List[str]]
    current_stage: str
    error: Optional[str]
    # Per-level graph fields
    current_level: str
    current_concepts: List[str]
    meets_threshold: bool
    needed_count: int
    add_concepts_rounds: int
    # Step visibility (sent to frontend in syllabus builder state)
    next_node: Optional[str]
    step_prompt: Optional[str]
    step_output: Optional[str]
    # Base agent system prompt (scenario); unchanged for the run; shown once in frontend
    system_prompt: Optional[str]
    # Agent info (which agent and model used for inference)
    agent: Optional[str]
    inference_model: Optional[str]


def build_syllabus_level_graph(llm: Any, system_prompt: Optional[str] = None):
    """
    Build LangGraph for one module level: generate_concepts → validate → [add_concepts → validate]* → add_module.
    system_prompt is injected per node (scenario + node role). Returns compiled graph.
    """
    from langgraph.graph import END, StateGraph

    from agents.syllabus_agent.agentic.stages.add_concepts import add_missing_concepts
    from agents.syllabus_agent.agentic.stages.concept_generator import generate_concepts as run_generator
    from agents.syllabus_agent.agentic.stages.validator import validate_concept_count

    async def generate_concepts_node(state: SyllabusLevelGraphState) -> Dict[str, Any]:
        """Node 1: Generate concepts for current_level using state (course context + other modules)."""
        level = state.get("current_level") or "beginner"
        modules = state.get("modules") or []
        already_used: List[str] = []
        for mod in modules:
            already_used.extend(mod.get("objectives") or [])
        other = _other_modules_concepts_from_state(modules, level, get_levels())
        node_prompt = build_node_system_prompt(system_prompt, "generate_concepts", level)
        concepts, _ = await run_generator(
            llm,
            state.get("course_title") or "",
            state.get("subject") or "",
            state.get("goals"),
            level,
            already_used_concepts=already_used,
            other_modules_concepts=other,
            system_prompt=node_prompt,
        )
        return {
            "current_concepts": concepts,
            "add_concepts_rounds": 0,
        }

    def validate_node(state: SyllabusLevelGraphState) -> Dict[str, Any]:
        """Node 2: Check if concept count meets threshold; set meets_threshold and needed_count."""
        concepts = state.get("current_concepts") or []
        ok, needed = validate_concept_count(concepts)
        return {
            "meets_threshold": ok,
            "needed_count": needed,
        }

    async def add_concepts_node(state: SyllabusLevelGraphState) -> Dict[str, Any]:
        """Node 3: Ask LLM for extra concepts; merge, cap at MAX_PER_LEVEL."""
        level = state.get("current_level") or "beginner"
        modules = state.get("modules") or []
        concepts = list(state.get("current_concepts") or [])
        needed = min(state.get("needed_count") or 0, max(0, MAX_PER_LEVEL - len(concepts)))
        rounds = state.get("add_concepts_rounds") or 0
        already_used: List[str] = []
        for mod in modules:
            already_used.extend(mod.get("objectives") or [])
        other = _other_modules_concepts_from_state(modules, level, get_levels())
        node_prompt = build_node_system_prompt(system_prompt, "add_concepts", level)
        extra, _ = await add_missing_concepts(
            llm, level, concepts, needed,
            already_used_concepts=already_used,
            other_modules_concepts=other,
            subject=state.get("subject") or "",
            system_prompt=node_prompt,
        )
        merged = (concepts + extra)[:MAX_PER_LEVEL]
        return {
            "current_concepts": merged,
            "add_concepts_rounds": rounds + 1,
        }

    def add_module_node(state: SyllabusLevelGraphState) -> Dict[str, Any]:
        """Node 4: Append one module (deduped objectives, cap MAX_PER_LEVEL) and concepts_by_level."""
        level = state.get("current_level") or "beginner"
        concepts = _dedupe_objectives(list(state.get("current_concepts") or []))[:MAX_PER_LEVEL]
        modules = list(state.get("modules") or [])
        concepts_by_level = dict(state.get("concepts_by_level") or {})
        mod = {
            "title": level.title(),
            "objectives": concepts,
            "estimated_minutes": 30,
            "dependencies": [],
        }
        modules.append(mod)
        concepts_by_level[level] = concepts
        return {
            "modules": modules,
            "concepts_by_level": concepts_by_level,
            "current_concepts": [],
            "add_concepts_rounds": 0,
        }

    def route_after_validate(state: SyllabusLevelGraphState) -> Literal["add_concepts", "add_module"]:
        """If not up to par and retries left, go to add_concepts; else add_module."""
        meets = state.get("meets_threshold", False)
        rounds = state.get("add_concepts_rounds") or 0
        if meets or rounds >= MAX_ADD_ROUNDS:
            return "add_module"
        return "add_concepts"

    g = StateGraph(SyllabusLevelGraphState)
    g.add_node("generate_concepts", generate_concepts_node)
    g.add_node("validate", validate_node)
    g.add_node("add_concepts", add_concepts_node)
    g.add_node("add_module", add_module_node)

    g.set_entry_point("generate_concepts")
    g.add_edge("generate_concepts", "validate")
    g.add_conditional_edges("validate", route_after_validate, {
        "add_concepts": "add_concepts",
        "add_module": "add_module",
    })
    g.add_edge("add_concepts", "validate")  # retry: validate again
    g.add_edge("add_module", END)

    return g.compile()


def get_levels() -> tuple[str, ...]:
    """Order of module levels (same as MODULE_LEVELS)."""
    return MODULE_LEVELS


async def run_one_step(
    state: dict,
    llm: Any,
    system_prompt: Optional[str] = None,
    agent_name: Optional[str] = None,
    inference_model: Optional[str] = None,
) -> tuple[dict, bool]:
    """
    Run exactly one graph node based on state["next_node"]; return (updated_state, done).
    system_prompt is the base scenario (unchanged). agent_name and inference_model are stored in state.
    """
    from agents.syllabus_agent.agentic.stages.add_concepts import add_missing_concepts
    from agents.syllabus_agent.agentic.stages.concept_generator import generate_concepts as run_generator
    from agents.syllabus_agent.agentic.stages.validator import validate_concept_count

    levels_tuple = get_levels()
    levels = list(levels_tuple)
    next_node = state.get("next_node")
    if next_node is None:
        return state, True
    level = state.get("current_level") or (levels[0] if levels else "beginner")
    modules = state.get("modules") or []
    already_used: List[str] = []
    for mod in modules:
        already_used.extend(mod.get("objectives") or [])
    other = _other_modules_concepts_from_state(modules, level, levels_tuple)

    update: Dict[str, Any] = {}
    if next_node == "generate_concepts":
        node_prompt = build_node_system_prompt(system_prompt, "generate_concepts", level)
        concepts, prompt = await run_generator(
            llm,
            state.get("course_title") or "",
            state.get("subject") or "",
            state.get("goals"),
            level,
            already_used_concepts=already_used,
            other_modules_concepts=other,
            system_prompt=node_prompt,
        )
        update = {
            "current_concepts": concepts,
            "add_concepts_rounds": 0,
            "step_prompt": prompt,
            "step_output": json.dumps({"concepts": concepts}),
        }
    elif next_node == "validate":
        concepts = state.get("current_concepts") or []
        ok, needed = validate_concept_count(concepts)
        count = len(concepts)
        validator_prompt = (
            f"Requires ≥{MIN_PER_LEVEL} concepts. Current: {count}. Need {needed} more. Meets: {ok}."
        )
        update = {
            "meets_threshold": ok,
            "needed_count": needed,
            "step_prompt": validator_prompt,
            "step_output": json.dumps({
                "min_required": MIN_PER_LEVEL,
                "current_count": count,
                "meets_threshold": ok,
                "needed_count": needed,
            }),
        }
    elif next_node == "add_concepts":
        concepts = list(state.get("current_concepts") or [])
        needed = min(state.get("needed_count") or 0, max(0, MAX_PER_LEVEL - len(concepts)))
        rounds = state.get("add_concepts_rounds") or 0
        node_prompt = build_node_system_prompt(system_prompt, "add_concepts", level)
        extra, prompt = await add_missing_concepts(
            llm, level, concepts, needed,
            already_used_concepts=already_used,
            other_modules_concepts=other,
            subject=state.get("subject") or "",
            system_prompt=node_prompt,
        )
        merged = (concepts + extra)[:MAX_PER_LEVEL]
        update = {
            "current_concepts": merged,
            "add_concepts_rounds": rounds + 1,
            "step_prompt": prompt,
            "step_output": json.dumps({"added_concepts": extra, "concepts_after": merged}),
        }
    elif next_node == "add_module":
        concepts = _dedupe_objectives(list(state.get("current_concepts") or []))[:MAX_PER_LEVEL]
        modules = list(state.get("modules") or [])
        concepts_by_level = dict(state.get("concepts_by_level") or {})
        mod = {
            "title": level.title(),
            "objectives": concepts,
            "estimated_minutes": 30,
            "dependencies": [],
        }
        modules.append(mod)
        concepts_by_level[level] = concepts
        update = {
            "modules": modules,
            "concepts_by_level": concepts_by_level,
            "current_concepts": [],
            "add_concepts_rounds": 0,
            "step_prompt": None,
            "step_output": json.dumps({"module_added": level, "objectives_count": len(concepts)}),
        }
    else:
        return state, True

    new_state = {**state, **update}
    # Persist base agent system prompt and agent info in state for frontend
    if system_prompt is not None:
        new_state["system_prompt"] = system_prompt
    if agent_name is not None:
        new_state["agent"] = agent_name
    if inference_model is not None:
        new_state["inference_model"] = inference_model

    # Compute next node
    if next_node == "generate_concepts":
        new_state["next_node"] = "validate"
    elif next_node == "validate":
        meets = new_state.get("meets_threshold", False)
        rounds = new_state.get("add_concepts_rounds") or 0
        if meets or rounds >= MAX_ADD_ROUNDS:
            new_state["next_node"] = "add_module"
        else:
            new_state["next_node"] = "add_concepts"
    elif next_node == "add_concepts":
        new_state["next_node"] = "validate"
    elif next_node == "add_module":
        idx = levels.index(level) if level in levels else -1
        if idx >= 0 and idx < len(levels) - 1:
            new_state["current_level"] = levels[idx + 1]
            new_state["next_node"] = "generate_concepts"
        else:
            new_state["next_node"] = None

    return new_state, new_state.get("next_node") is None

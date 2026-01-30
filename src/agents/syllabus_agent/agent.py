"""
SyllabusAgent: BaseAgent that runs the syllabus pipeline as a LangGraph.

Single stage (Stage 1): concepts node -> ConceptListByLevel.
Each node completion emits agent state events for frontend progress.
"""

from __future__ import annotations

import json
from typing import Any, AsyncIterator, Dict, List, Optional, TypedDict

from agents.core.base_agent import BaseAgent
from agents.core.memory import Memory
from agents.core.tool import Tool
from agents.syllabus_agent.agentic.schemas import ConceptListByLevel, SyllabusPipelineResult
from agents.syllabus_agent.agentic.stages import ConceptGenerator


class SyllabusGraphState(TypedDict, total=False):
    """State for the syllabus LangGraph (Stage 1 only)."""
    course_title: str
    subject: str
    goals: Optional[str]
    target_level: str
    time_budget_minutes: Optional[int]
    concepts_by_level: Optional[ConceptListByLevel]
    modules: Optional[List[Dict[str, Any]]]
    error: Optional[str]
    current_stage: str


# Event shape session_service expects: (event_type, stage, data) -> emit(stage, event_type, data)
def _concepts_to_draft_modules(concepts: ConceptListByLevel) -> List[Dict[str, Any]]:
    """Map ConceptListByLevel to 3 draft modules for syllabus_draft."""
    return [
        {"title": "Beginner", "objectives": concepts.beginner, "estimated_minutes": 60},
        {"title": "Intermediate", "objectives": concepts.intermediate, "estimated_minutes": 90},
        {"title": "Advanced", "objectives": concepts.advanced, "estimated_minutes": 120},
    ]


def _build_syllabus_graph(llm: Any):
    """Build LangGraph with one node: concepts."""
    from langgraph.graph import END, StateGraph

    async def concepts_node(state: SyllabusGraphState) -> Dict[str, Any]:
        gen = ConceptGenerator(llm=llm)
        concepts = await gen.run(
            course_title=state["course_title"],
            subject=state["subject"],
            goals=state.get("goals"),
        )
        return {
            "concepts_by_level": concepts,
            "modules": _concepts_to_draft_modules(concepts),
            "current_stage": "concepts",
        }

    g: StateGraph = StateGraph(SyllabusGraphState)
    g.add_node("concepts", concepts_node)
    g.set_entry_point("concepts")
    g.add_edge("concepts", END)
    return g.compile()


class SyllabusAgent(BaseAgent):
    """
    Syllabus generation as a BaseAgent with LangGraph.
    plan(input) parses course JSON; execute_stream(plan) runs the graph and yields
    agent-state events (phase_start, task_update, done) for frontend progress.
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
        self._graph = _build_syllabus_graph(llm)

    def plan(self, input: str) -> Any:
        """Parse input JSON into syllabus plan (course_title, subject, goals, etc.)."""
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
        """Run graph synchronously; return final result as JSON string."""
        import asyncio
        state = asyncio.run(self._graph.ainvoke(plan))
        result = SyllabusPipelineResult(
            concepts_by_level=state.get("concepts_by_level"),
            modules=state.get("modules") or [],
        )
        return json.dumps({"modules": result.modules, "concepts_by_level": result.concepts_by_level.model_dump()})

    async def execute_stream(self, plan: Any) -> AsyncIterator[str]:
        """
        Run graph and yield agent-state events as JSON strings.
        Each chunk is a JSON object: { "event_type", "stage", "data" } for session_service to emit as SSE.
        """
        # Emit stage start
        yield json.dumps({
            "event_type": "phase_start",
            "stage": "planning",
            "data": {"stage": "concepts"},
        })

        # Run the single node; astream yields one update per node
        modules: List[Dict[str, Any]] = []
        async for state in self._graph.astream(plan):
            if not isinstance(state, dict):
                continue
            for _node_name, node_state in state.items():
                if not isinstance(node_state, dict):
                    continue
                concepts = node_state.get("concepts_by_level")
                modules = node_state.get("modules") or []
                total = 0
                if concepts:
                    total = len(concepts.beginner) + len(concepts.intermediate) + len(concepts.advanced)
                yield json.dumps({
                    "event_type": "task_update",
                    "stage": "planning",
                    "data": {
                        "agent_name": "concepts",
                        "stage": "planning",
                        "status": "completed",
                        "started_at": None,
                        "completed_at": None,
                        "error": None,
                        "metadata": {"concepts_count": total, "concepts_by_level": _serialize_concepts(concepts)},
                    },
                })
                break
            break

        yield json.dumps({
            "event_type": "done",
            "stage": "finalize",
            "data": {"modules": modules, "modules_count": len(modules)},
        })


def _serialize_concepts(c: Optional[ConceptListByLevel]) -> Optional[Dict[str, Any]]:
    if c is None:
        return None
    return c.model_dump()


def _no_memory() -> Memory:
    from agents.core.no_memory import NoMemory
    return NoMemory()

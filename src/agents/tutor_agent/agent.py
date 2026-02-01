"""Tutor agent: lesson streaming with its own graph and memory."""

from __future__ import annotations

from typing import Any, AsyncIterator
from logging import getLogger

from agents.core.base_agent import BaseAgent
from agents.core.llm import LLM
from agents.core.memory import Memory
from agents.core.no_memory import NoMemory
from agents.tutor_agent.graph import build_tutor_graph, TutorGraphState
from agents.tutor_agent.history_store import TutorHistoryStore

logger = getLogger(__name__)


class TutorAgent(BaseAgent):
    """Agent for lesson (tutor) streaming. Uses tutor graph and tutor memory (set by api)."""

    def __init__(
        self,
        *,
        name: str,
        llm: LLM,
        memory: Memory | None = None,
        system_prompt: str = "",
        max_history: int = 6,
        stream: bool = False,
    ):
        history_store = TutorHistoryStore()
        super().__init__(
            name=name,
            llm=llm,
            tools=[],
            memory=memory or NoMemory(),
            system_prompt=system_prompt,
            history_store=history_store,
        )
        self.max_history = max_history
        self._graph = build_tutor_graph(llm=llm, max_history=max_history)
        self.state.stream = stream

    def plan(self, input: str) -> Any:
        """History is loaded by base agent _before_run; plan uses state.history."""
        history = self.state.history or []
        memory_history = history
        # Per-run metadata overrides init default
        system_prompt = str(
            self.state.metadata.get("system_prompt") or self.system_prompt or ""
        )
        max_tokens = self.state.metadata.get("max_tokens")
        conversation_id = self.state.metadata.get("conversation_id")
        self.state.metadata["_plan_metadata"] = {
            "system_prompt": system_prompt,
            "retrieved_memory": memory_history,
        }
        return TutorGraphState(
            user_input=input,
            history=history,
            stream=self.state.stream,
            answer_stream=None,
            system_prompt=system_prompt,
            max_tokens=max_tokens,
            conversation_id=conversation_id,
        )

    def execute(self, plan: Any) -> str:
        if not isinstance(plan, dict):
            return self.llm.generate(str(plan))
        state = self._graph.invoke(plan)
        answer = state.get("answer")
        return answer if answer is not None else ""

    async def execute_stream(self, plan: Any) -> AsyncIterator[str]:
        import json

        plan_metadata = self.state.metadata.get("_plan_metadata", {})
        system_prompt = plan_metadata.get("system_prompt", "")
        retrieved_memory = plan_metadata.get("retrieved_memory", [])
        if retrieved_memory:
            memory_text = "\n\n".join(
                f"User: {u}\nAssistant: {a}" for u, a in retrieved_memory
            )
            yield f"event: memory_retrieved\ndata: {json.dumps({'history': memory_text})}\n\n"
        if system_prompt:
            yield f"event: system_prompt\ndata: {json.dumps({'system_prompt': system_prompt})}\n\n"
        if not isinstance(plan, dict):
            async for chunk in self.llm.stream(str(plan)):
                yield chunk
            return
        state = self._graph.invoke(plan)
        logger.debug("tutor execute_stream state: %s", state)
        answer_stream = state.get("answer_stream")
        if answer_stream is not None:
            async for chunk in answer_stream:
                yield chunk
            return
        answer = state.get("answer") or ""
        if answer:
            yield str(answer)

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Union, AsyncIterator

import logging

from agents.core.agent_state import AgentState
from agents.core.tool import Tool
from agents.core.memory import Memory

logger = logging.getLogger(__name__)

class BaseAgent(ABC):
    """
    Defines the lifecycle and contract for all agents.
    system_prompt: optional default set at init; can be overridden per run via state.metadata["system_prompt"].
    history_store: optional store for conversation history; each agent creates its own collection.
    """
    def __init__(
        self,
        *,
        name: str,
        llm: Any,
        tools: List[Tool],
        memory: Memory,
        system_prompt: str = "",
        history_store: Any = None,
    ):
        self.name = name
        self.llm = llm
        self.tools = tools
        self.memory = memory
        self.system_prompt = system_prompt or ""
        self.state = AgentState()
        self.history_store = history_store

    #-----Public API-----

    def run(self, input: str) -> Union[str, AsyncIterator[str]]:
        self._before_run(input)

        plan = self.plan(input)
        result = self.execute(plan)

        self._after_run(input, result)
        return result

    async def run_stream(self, input: str) -> AsyncIterator[str]:
        self._before_run(input)
        plan = self.plan(input)
        chunks: list[str] = []
        try:
            async for chunk in self.execute_stream(plan):
                # Collect chunks so we can persist the full assistant message to memory at the end.
                chunks.append(str(chunk))
                yield chunk
        except Exception as e:
            logger.exception("error streaming: %s", e)
            # Let the HTTP layer format this for SSE.
            yield f"error: {str(e)}"
        finally:
            final = "".join(chunks)
            self._after_run(input, final)
    #-----------EXTENSION POINTS-----------
    @abstractmethod
    def plan(self, input:str) -> Any:
        """DECIDE WHAT TO DO NEXT"""
    
    @abstractmethod
    def execute(self, plan: Any) -> str:
        """EXECUTE THE PLAN"""

    @abstractmethod
    async def execute_stream(self, plan: Any) -> AsyncIterator[str]:
        """EXECUTE THE PLAN STREAMING"""

    #-----------Hooks --------------------------------------------------------------


    def _before_run(self, input: str):
        """
        Persist user message (if memory supports), load history. Base agent owns retrieval.
        """
        if not self.memory:
            return
        try:
            if hasattr(self.memory, "save_user_message"):
                self.memory.save_user_message(input)
            if hasattr(self.memory, "set_query"):
                self.memory.set_query(input)
            history = self.memory.load()
            if history:
                self.state.history = history
        except Exception:
            pass

    def _after_run(self, input: str, result: Union[str, AsyncIterator[str]]):
        """
        Save exchange to vector store after run. Base agent owns vector persistence.
        API layer persists to DB (Message rows). Metadata must include
        _user_message_id, _assistant_message_id, _message_seq when available.
        """
        if not self.memory:
            return
        try:
            self.memory.save(input, str(result))
        except Exception:
            pass
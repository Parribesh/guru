from abc import ABC, abstractmethod
from typing import Any, Dict, List, Union, AsyncIterator

from agents.core.agent_state import AgentState
from agents.core.tool import Tool
from agents.core.memory import Memory
from logging import getLogger
from api.utils.logger import configure_logging

logger = configure_logging()

class BaseAgent(ABC):
    """
    Defines the lifecycle and contract for all agents.
    """
    def __init__(self, *, name: str, llm: Any, tools: List[Tool], memory: Memory):
        self.name = name
        self.llm = llm
        self.tools = tools
        self.memory = memory
        self.state = AgentState()

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
        # If the caller already preloaded history (e.g. from DB/session),
        # do not clobber it with in-memory history.
        if self.memory and not self.state.history:
            self.state.history = self.memory.load()

    def _after_run(self, input: str, result: Union[str, AsyncIterator[str]]):
        if self.memory: 
            self.memory.save(input, str(result))
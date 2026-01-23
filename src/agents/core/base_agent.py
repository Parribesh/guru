from abc import ABC, abstractmethod
from typing import Any, Dict, List

from agents.core.agent_state import AgentState
from agents.core.tool import Tool
from agents.core.memory import Memory

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

    def run(self, input: str) -> str:
        self._before_run(input)

        plan = self.plan(input)
        result = self.execute(plan)

        self._after_run(input, result)
        return result

    #-----------EXTENSION POINTS-----------
    @abstractmethod
    def plan(self, input:str) -> Any:
        """DECIDE WHAT TO DO NEXT"""
    
    @abstractmethod
    def execute(self, plan: Any) -> str:
        """EXECUTE THE PLAN"""

    #-----------Hooks --------------------------------------------------------------


    def _before_run(self, input: str):
        if self.memory:
            self.state.history = self.memory.load()

    def _after_run(self, input: str, result: str):
        if self.memory: 
            self.memory.save(input, result)
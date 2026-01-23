from typing import Dict, Callable
from agents.core.base_agent import BaseAgent

class AgentRegistry:
    def __init__(self):
        self._factories: Dict[str, Callable[[], BaseAgent]] = {}

    def register(self, name:str, factory: Callable[[], BaseAgent]) -> None:
        if name in self._factories:
            raise ValueError(f"Agent {name} already registered")
        self._factories[name] = factory

    def get(self, name:str) -> BaseAgent:
        if name not in self._factories:
            raise ValueError(f"Agent {name} not registered")
        return self._factories[name]()

    def list_agents(self) -> list[str]:
        return list(self._factories.keys())
        
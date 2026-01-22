from dataclasses import dataclass, field
from typing import Any, List

@dataclass
class AgentState:
    history: List[Any] = field(default_factory=list)
    intermediate_steps: List[Any] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)

    
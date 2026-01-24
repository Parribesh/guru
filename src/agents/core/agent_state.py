from dataclasses import dataclass, field
from typing import Any, List

@dataclass
class AgentState:
    history: List[Any] = field(default_factory=list)
    intermediate_steps: List[Any] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)
    # Optional list of document paths to use for RAG in the current run/session.
    doc_paths: List[str] = field(default_factory=list)
    # Whether the current run should stream output (used by chat streaming endpoints).
    stream: bool = False

    
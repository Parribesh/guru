from __future__ import annotations

from typing import Any, List, Optional

from agents.core.registry import AgentRegistry
from agents.core.base_agent import BaseAgent
from agents.core.tool import Tool
from agents.core.memory import Memory
from agents.chat_agent.memory import ChatAgentMemory
from agents.core.llm import LLM
from agents.chat_agent.graph import build_chat_graph, ChatGraphState

class ChatAgent(BaseAgent):
    def __init__(
        self,
        *,
        name: str,
        llm: LLM,
        registry: Optional[AgentRegistry] = None,
        tools: Optional[List[Tool]] = None,
        memory: Optional[Memory] = None,
        rag_agent_name: str = "rag",
        rag_k: int = 5,
        max_history: int = 6,
    ):
        super().__init__(name=name, llm=llm, tools=tools or [], memory=memory or ChatAgentMemory())
        self.registry = registry
        self.rag_agent_name = rag_agent_name
        self.rag_k = rag_k
        self.max_history = max_history
        self._graph = build_chat_graph(
            llm=llm,
            registry=registry,
            rag_agent_name=rag_agent_name,
            rag_k=rag_k,
            max_history=max_history,
        )

    def plan(self, input: str) -> Any:
        # Plan is the initial graph state. RAG usage is decided inside the LangGraph router.
        return ChatGraphState(user_input=input, history=self.state.history, doc_paths=self.state.doc_paths)

    def execute(self, plan: Any) -> str:
        if not isinstance(plan, dict):
            # fallback: treat as prompt string
            return self.llm.generate(str(plan))
        out = self._graph.invoke(plan)
        return str(out.get("answer") or "")

if __name__ == "__main__":
    # Optional local demo (only if langchain_ollama is installed)
    from langchain_ollama import OllamaLLM

    memory = ChatAgentMemory()
    agent = ChatAgent(name="ChatAgent", llm=OllamaLLM(model="llama3.2:latest"), memory=memory)
    print(agent.run("What is the capital of France?"))
    
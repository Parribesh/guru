from __future__ import annotations

from typing import Any, List, Optional, Union

from agents.core.registry import AgentRegistry
from agents.core.base_agent import BaseAgent
from agents.core.tool import Tool
from agents.core.memory import Memory
from agents.chat_agent.memory import ChatAgentMemory
from agents.core.llm import LLM
from agents.chat_agent.graph import build_chat_graph, ChatGraphState
from typing import AsyncIterator
from logging import getLogger

logger = getLogger(__name__)

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
        stream: bool = False,
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
        # Persist streaming preference on the agent state so routes can flip it dynamically.
        self.state.stream = stream

    def plan(self, input: str) -> Any:
        # Plan is the initial graph state. RAG usage is decided inside the LangGraph router.
        return ChatGraphState(
            user_input=input,
            history=self.state.history,
            doc_paths=self.state.doc_paths,
            stream=self.state.stream,
            answer_stream=None,
            system_prompt=str(self.state.metadata.get("system_prompt") or ""),
            max_tokens=self.state.metadata.get("max_tokens"),  # Token budget constraint (e.g., 150)
        )

    def execute(self, plan: Any) -> Union[str, AsyncIterator[str]]:
        if not isinstance(plan, dict):
            # fallback: treat as prompt string
            return self.llm.generate(str(plan))
        state = self._graph.invoke(plan)
        answer= state.get("answer")
        if answer is None:
            return ""
        return answer

    async def execute_stream(self, plan: Any) -> AsyncIterator[str]:
        if not isinstance(plan, dict):
            # fallback: treat as prompt string
            async for chunk in self.llm.stream(str(plan)):
                yield chunk
            return
        state = self._graph.invoke(plan)
        logger.debug("state in execute_stream: %s", state)

        answer_stream = state.get("answer_stream")
        if answer_stream is not None:
            async for chunk in answer_stream:
                yield chunk
            return

        # Fallback: non-streaming graph path; emit final answer as a single chunk.
        answer = state.get("answer") or ""
        if answer:
            yield str(answer)

if __name__ == "__main__":
    # Optional local demo (only if langchain_ollama is installed)
    from langchain_ollama import OllamaLLM

    memory = ChatAgentMemory()
    agent = ChatAgent(name="ChatAgent", llm=OllamaLLM(model="llama3.2:latest"), memory=memory)
    print(agent.run("What is the capital of France?"))
    
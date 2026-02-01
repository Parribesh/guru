from __future__ import annotations

from typing import Any, List, Optional, Union

from agents.core.registry import AgentRegistry
from agents.core.base_agent import BaseAgent
from agents.core.tool import Tool
from agents.core.memory import Memory
from agents.chat_agent.history_store import HistoryStore
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
        system_prompt: str = "",
        rag_agent_name: str = "rag",
        rag_k: int = 5,
        max_history: int = 6,
        stream: bool = False,
    ):
        history_store = HistoryStore()
        super().__init__(
            name=name,
            llm=llm,
            tools=tools or [],
            memory=memory or ChatAgentMemory(),
            system_prompt=system_prompt,
            history_store=history_store,
        )
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
        """
        Plan the agent's response.
        History is loaded by base agent _before_run; plan uses state.history.
        """
        history = self.state.history or []
        memory_history = history
        
        # Get system prompt: per-run metadata overrides init default
        system_prompt = str(
            self.state.metadata.get("system_prompt") or self.system_prompt or ""
        )
        max_tokens = self.state.metadata.get("max_tokens")
        conversation_id = self.state.metadata.get("conversation_id")
        
        # Store metadata for later emission (system prompt + retrieved memory)
        self.state.metadata["_plan_metadata"] = {
            "system_prompt": system_prompt,
            "retrieved_memory": memory_history,
        }
        
        return ChatGraphState(
            user_input=input,
            history=history,
            doc_paths=self.state.doc_paths,
            stream=self.state.stream,
            answer_stream=None,
            system_prompt=system_prompt,
            max_tokens=max_tokens,
            conversation_id=conversation_id,
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
        """
        Execute plan with streaming, yielding metadata first, then chunks.
        
        Yields:
            - First: metadata events (system_prompt, memory_retrieved) as SSE format
            - Then: LLM response chunks
        """
        import json
        
        # Yield metadata first (system prompt and retrieved memory)
        plan_metadata = self.state.metadata.get("_plan_metadata", {})
        system_prompt = plan_metadata.get("system_prompt", "")
        retrieved_memory = plan_metadata.get("retrieved_memory", [])
        
        # Format memory for display (items may be (u, a) or (u, a, agent_name))
        if retrieved_memory:
            parts = []
            for item in retrieved_memory:
                u, a = (item[0], item[1]) if len(item) >= 2 else ("", "")
                if len(item) >= 3 and item[2] == "tutor":
                    parts.append(f"[Tutor lesson] User: {u}\nTutor: {a}")
                else:
                    parts.append(f"User: {u}\nAssistant: {a}")
            memory_text = "\n\n".join(parts)
            # Yield memory_retrieved event as SSE
            yield f"event: memory_retrieved\ndata: {json.dumps({'history': memory_text})}\n\n"
        
        # Yield system_prompt event as SSE
        if system_prompt:
            yield f"event: system_prompt\ndata: {json.dumps({'system_prompt': system_prompt})}\n\n"
        
        # Now proceed with normal execution
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
    
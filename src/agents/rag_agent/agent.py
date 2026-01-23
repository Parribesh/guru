from agents.core.base_agent import BaseAgent
from agents.core.tool import Tool
from agents.core.memory import Memory
from agents.rag_agent.service import RAGService
from agents.rag_agent.store import VectorStore
from agents.rag_agent.types import RetrievedChunk, SourceDocument
from typing import Any, List, Optional

class RAGAgent(BaseAgent):
    """
    Thin agent wrapper around `RAGService`.

    Why keep this:
    - Your registry is agent-based (`AgentRegistry.get(...) -> BaseAgent`).
    - `chat_agent` can call `registry.get("rag").run(query)` to get retrieval context.

    What it should NOT do:
    - Choose an embedding model
    - Depend on Chroma/LangChain
    - Require an LLM
    """

    def __init__(
        self,
        *,
        name: str,
        store: VectorStore,
        tools: Optional[List[Tool]] = None,
        memory: Optional[Memory] = None,
        default_k: int = 5,
    ):
        # RAG doesn't need an LLM; keep llm=None.
        # RAG also doesn't need its own memory by default; the ChatAgent typically owns conversation memory.
        super().__init__(name=name, llm=None, tools=tools or [], memory=memory)
        self.rag = RAGService(store=store)
        self.default_k = default_k

    # Convenience API (preferred for direct calls)
    def ingest(self, docs: List[SourceDocument]) -> int:
        return self.rag.ingest(docs)

    def retrieve(self, query: str, k: Optional[int] = None) -> List[RetrievedChunk]:
        return self.rag.retrieve(query=query, k=k or self.default_k)

    def get_context(self, query: str, k: Optional[int] = None, separator: str = "\n\n") -> str:
        results = self.retrieve(query=query, k=k)
        return separator.join(r["text"] for r in results if r.get("text"))

    def plan(self, input: str) -> Any:
        # Minimal default: treat the user's input as a retrieval query.
        return {"op": "retrieve", "query": input, "k": self.default_k}

    def execute(self, plan: Any) -> str:
        if isinstance(plan, dict) and plan.get("op") == "retrieve":
            query = str(plan.get("query") or "")
            k = int(plan.get("k") or self.default_k)
            return self.get_context(query=query, k=k)
        return ""
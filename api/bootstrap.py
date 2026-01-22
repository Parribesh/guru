from agents.core.registry import AgentRegistry
from agents.chat_agent.agent import ChatAgent
from agents.rag_agent.agent import RAGAgent

from infra.llm.ollama import OllamaLLM
from infra.vector import ChromaStore


def build_registry() -> AgentRegistry:
    registry = AgentRegistry()

    llm = OllamaLLM(model="llama3.2:latest")
    vector_store = ChromaStore()

    registry.register(
        "rag",
        lambda: RAGAgent(
            llm=llm,
            vector_store=vector_store,
        ),
    )

    registry.register(
        "chat",
        lambda: ChatAgent(
            llm=llm,
            registry=registry,
        ),
    )

    return registry

from agents.core.registry import AgentRegistry
from agents.chat_agent.agent import ChatAgent
from agents.tutor_agent.agent import TutorAgent
from agents.rag_agent.agent import RAGAgent
from agents.syllabus_agent.agent import SyllabusAgent

from infra.llm.ollama import OllamaLLM
from infra.vector.chroma_store import ChromaStore


def build_registry() -> AgentRegistry:
    registry = AgentRegistry()

    llm = OllamaLLM(model="qwen:latest")
    vector_store = ChromaStore()

    registry.register(
        "rag",
        lambda: RAGAgent(
            name="RAGAgent",
            store=vector_store,
        ),
    )

    registry.register(
        "chat",
        lambda: ChatAgent(
            name="ChatAgent",
            llm=llm,
            registry=registry,
        ),
    )

    registry.register(
        "syllabus",
        lambda: SyllabusAgent(name="SyllabusAgent", llm=llm),
    )

    registry.register(
        "tutor",
        lambda: TutorAgent(name="TutorAgent", llm=llm),
    )
    registry.register(
        "tester",
        lambda: ChatAgent(
            name="TestAgent",
            llm=llm,
            registry=registry,
        ),
    )

    return registry

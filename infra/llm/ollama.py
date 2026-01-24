from langchain_ollama import OllamaLLM as LangChainOllamaLLM
from agents.core.llm import LLM
from typing import AsyncIterator

class OllamaLLM(LLM):
    def __init__(self, model: str, temperature: float = 0.7, base_url: str = "http://localhost:11434"):
        # Avoid infinite recursion: this wrapper is `OllamaLLM`, the LangChain class is aliased.
        self._llm = LangChainOllamaLLM(model=model, temperature=temperature, base_url=base_url)

    def generate(self, prompt: str) -> str:
        return self._llm.invoke(prompt)
    
    async def stream(self, prompt: str) -> AsyncIterator[str]:
        # LangChain astream yields chunk objects; normalize to plain text for SSE.
        async for chunk in self._llm.astream(prompt):
            text = getattr(chunk, "content", None)
            yield text if isinstance(text, str) else str(chunk)
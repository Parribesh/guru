from langchain_ollama import OllamaLLM
from agents.core.llm import LLM

class OllamaLLM(LLM):
    def __init__(self, model: str, temperature: float = 0.7, base_url: str = "http://localhost:11434"):
        self._llm = OllamaLLM(model=model, temperature=temperature, base_url=base_url)

    def generate(self, prompt: str) -> str:
        return self._llm.invoke(prompt)
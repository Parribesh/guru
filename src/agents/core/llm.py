from abc import ABC, abstractmethod
from typing import AsyncIterator

class LLM(ABC):
    """
    Defines the contract for all LLMs.
    """
    @abstractmethod
    def generate(self, prompt: str) -> str:
        raise NotImplementedError
    
    @abstractmethod
    def stream(self, prompt: str) -> AsyncIterator[str]:
        raise NotImplementedError
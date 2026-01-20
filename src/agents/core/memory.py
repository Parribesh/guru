from abc import ABC, abstractmethod

class Memory(ABC):
    @abstractmethod
    def load(self):
        pass

    @abstractmethod
    def save(self, input: str, result: str):
        pass
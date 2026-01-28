"""
Simple in-memory implementation of Memory interface.
"""

from agents.core.memory import Memory


class SimpleMemory(Memory):
    """Simple in-memory memory implementation."""
    
    def __init__(self):
        self._history = []
    
    def load(self):
        return self._history
    
    def save(self, input: str, result: str):
        self._history.append({"input": input, "result": result})


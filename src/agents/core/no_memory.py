"""
No Memory implementation - disables history/memory for agents that don't need it.
"""

from agents.core.memory import Memory


class NoMemory(Memory):
    """Memory implementation that does nothing - no history accumulation."""
    
    def load(self):
        """Return empty history."""
        return []
    
    def save(self, input: str, result: str):
        """Do nothing - don't save to history."""
        pass


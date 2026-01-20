from agents.core.memory import Memory

class ChatAgentMemory(Memory):
    def __init__(self):
        self.history = []

    def load(self):
        return self.history

    def save(self, input: str, result: str):
        self.history.append((input, result))
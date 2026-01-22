from langchain_ollama import OllamaLLM
from typing import AsyncGenerator, Any, List
from agents.core.base_agent import BaseAgent
from agents.core.tool import Tool
from agents.core.memory import Memory
from agents.chat_agent.memory import ChatAgentMemory


class ChatAgent(BaseAgent):
    def __init__(self, *, name: str, llm: Any, tools: List[Tool], memory: Memory):
        super().__init__(name=name, llm=llm, tools=tools, memory=memory)

    def plan(self, input: str) -> Any:
        pass

    def execute(self, plan: Any) -> str:
        return self.llm.invoke(plan)

if __name__ == "__main__":
    memory = ChatAgentMemory()
    agent = ChatAgent(name="ChatAgent", llm=OllamaLLM(model="llama3.2:latest"), tools=[], memory=memory)
    print(agent.run("What is the capital of France?"))
    
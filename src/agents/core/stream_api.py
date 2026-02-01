"""
Agent stream API: configure agent (memory, metadata) and run streaming response.
Callers (app services) use this API instead of touching agent internals.
"""

from typing import Any, AsyncIterator


async def run_stream(
    agent: Any,
    conversation_id: str,
    message: str,
    metadata: dict,
    memory: Any | None = None,
) -> AsyncIterator[str]:
    """
    Configure the agent for this conversation and run stream.
    If memory is provided (e.g. TutorVectorMemory), use it; else use chat VectorMemory.
    Sets metadata on the agent, then yields from agent.run_stream(message).
    Caller is responsible for persisting user/assistant messages; this only runs the agent.
    """
    if memory is None:
        from agents.chat_agent.vector_memory import VectorMemory

        if not getattr(agent, "history_store", None):
            raise ValueError("Chat agent must have history_store")
        memory = VectorMemory(
            conversation_id=conversation_id,
            history_store=agent.history_store,
            agent_state=agent.state,
        )
    agent.memory = memory
    agent.state.metadata = dict(metadata)

    async for chunk in agent.run_stream(message):
        yield chunk

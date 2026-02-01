"""
Tutor agent API: stream with metadata (same contract as chat).
Caller builds metadata (system_prompt, max_tokens, conversation_id, etc.); agent only runs stream.
"""

from typing import Any, AsyncIterator

from agents.core.stream_api import run_stream
from agents.tutor_agent.vector_memory import TutorVectorMemory


async def stream(agent: Any, conversation_id: str, message: str, metadata: dict) -> AsyncIterator[str]:
    """
    Run tutor agent stream. Metadata must already contain system_prompt, conversation_id, etc.
    Uses TutorVectorMemory so lesson history is separate from chat history.
    """
    memory = TutorVectorMemory(
        conversation_id=conversation_id,
        agent_state=agent.state,
    )
    async for chunk in run_stream(agent, conversation_id, message, metadata, memory=memory):
        yield chunk

"""
Tutor agent API: stream with metadata (same contract as chat).
Caller builds metadata (system_prompt, max_tokens, conversation_id, etc.); agent only runs stream.
"""

from typing import Any, AsyncIterator

from agents.core.stream_api import run_stream


async def stream(
    agent: Any,
    conversation_id: str,
    message: str,
    metadata: dict,
    memory: Any | None = None,
) -> AsyncIterator[str]:
    """
    Run tutor agent stream. Metadata must already contain system_prompt, conversation_id, etc.
    When memory is provided (e.g. ChatAgentMemory with db), it handles DB persistence.
    """
    async for chunk in run_stream(agent, conversation_id, message, metadata, memory=memory):
        yield chunk

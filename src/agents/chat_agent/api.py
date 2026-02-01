"""
Chat agent API: stream with metadata (same contract as tutor).
Caller builds metadata (system_prompt, max_tokens, conversation_id, etc.); agent only runs stream.
"""

from typing import Any, AsyncIterator

from agents.core.stream_api import run_stream


async def stream(agent: Any, conversation_id: str, message: str, metadata: dict) -> AsyncIterator[str]:
    """
    Run chat agent stream. Metadata must already contain system_prompt, conversation_id, etc.
    Uses default chat VectorMemory (set inside run_stream when memory=None).
    """
    async for chunk in run_stream(agent, conversation_id, message, metadata):
        yield chunk

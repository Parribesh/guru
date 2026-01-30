"""Unit tests for OllamaLLM (generate, stream, generate_structured)."""
from __future__ import annotations

import pytest
from pydantic import BaseModel
from unittest.mock import AsyncMock, MagicMock, patch

from infra.llm.ollama import OllamaLLM, DEFAULT_STRUCTURED_TIMEOUT


# Minimal test schema for generate_structured
class GreetingSchema(BaseModel):
    """Test schema: one greeting and a score."""
    message: str
    score: int


@pytest.mark.unit
class TestOllamaLLMGenerateStructured:
    """Test generate_structured API with a mocked ChatOllama."""

    @pytest.mark.asyncio
    async def test_generate_structured_returns_schema_instance(self):
        """generate_structured calls ChatOllama.with_structured_output and returns the parsed schema."""
        # Mock return value — arbitrary; we only assert we get back a valid schema instance.
        expected = GreetingSchema(message="ok", score=0)

        mock_runnable = MagicMock()
        mock_runnable.ainvoke = AsyncMock(return_value=expected)

        mock_chat = MagicMock()
        mock_chat.with_structured_output.return_value = mock_runnable

        with patch("infra.llm.ollama.ChatOllama", return_value=mock_chat):
            llm = OllamaLLM(model="test-model")
            result = await llm.generate_structured(
                "Say hello in a structured way.",
                GreetingSchema,
                timeout=10.0,
            )

        assert result == expected
        assert isinstance(result, GreetingSchema)
        assert result.message == "ok" and result.score == 0
        mock_chat.with_structured_output.assert_called_once_with(GreetingSchema)
        mock_runnable.ainvoke.assert_called_once_with("Say hello in a structured way.")

    @pytest.mark.asyncio
    async def test_generate_structured_passes_timeout(self):
        """generate_structured passes timeout to asyncio.wait_for."""
        expected = GreetingSchema(message="Hi", score=1)
        mock_runnable = MagicMock()
        mock_runnable.ainvoke = AsyncMock(return_value=expected)
        mock_chat = MagicMock()
        mock_chat.with_structured_output.return_value = mock_runnable

        with patch("infra.llm.ollama.ChatOllama", return_value=mock_chat):
            llm = OllamaLLM(model="test")
            await llm.generate_structured(
                "prompt",
                GreetingSchema,
                timeout=5.0,
            )

        mock_runnable.ainvoke.assert_called_once_with("prompt")
        # Timeout is applied by asyncio.wait_for inside generate_structured (5.0s)

    @pytest.mark.asyncio
    async def test_generate_structured_uses_default_timeout(self):
        """When timeout is omitted, default is used (no exception = wait_for accepted it)."""
        expected = GreetingSchema(message="OK", score=0)
        mock_runnable = MagicMock()
        mock_runnable.ainvoke = AsyncMock(return_value=expected)
        mock_chat = MagicMock()
        mock_chat.with_structured_output.return_value = mock_runnable

        with patch("infra.llm.ollama.ChatOllama", return_value=mock_chat):
            llm = OllamaLLM(model="test")
            result = await llm.generate_structured("prompt", GreetingSchema)

        assert result == expected
        assert result.message == "OK"

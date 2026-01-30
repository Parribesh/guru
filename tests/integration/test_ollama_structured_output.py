"""
Integration tests: real Ollama + LangChain structured output.

Answers: "How well does the LLM + with_structured_output perform for a given schema?"
- Simple schema: do we get valid output we can rely on?
- Complex schema (nested, lists, optional): does it still parse and validate?

Requires Ollama running (e.g. ollama serve). Skips if Ollama is unreachable.
Run with: pytest tests/integration/test_ollama_structured_output.py -v -m integration
"""

from __future__ import annotations

import asyncio
import pytest
from pydantic import BaseModel, Field
from typing import List, Optional

from infra.llm.ollama import OllamaLLM


# ----- Schemas used only for this test -----

class SimpleGreeting(BaseModel):
    """Minimal: two fields."""
    message: str
    score: int


class ComplexStructured(BaseModel):
    """More complex: nested object, list, optional field."""
    title: str = Field(description="Short title")
    items: List[str] = Field(description="List of 2-4 short items")
    optional_note: Optional[str] = Field(default=None, description="Optional note")


# ----- Fixture: skip if Ollama not available -----

@pytest.fixture
def ollama_llm():
    """Real OllamaLLM; skip if Ollama is not running. Function-scoped so each test gets a fresh LLM and connections (avoids 'Event loop is closed' on the second test)."""
    llm = OllamaLLM(model="llama3.2:1b", temperature=0.1)  # small model for speed
    try:
        # Quick check: plain invoke to see if Ollama responds
        llm.generate("Say OK")
    except Exception as e:
        pytest.skip(f"Ollama not available: {e}")
    return llm


@pytest.mark.integration
@pytest.mark.slow
class TestOllamaStructuredOutputReliability:
    """
    Test real LLM + structured output: do we get valid schema instances?
    This is what you wanted: "Can we rely on structured output for this schema?"
    """

    @pytest.mark.asyncio
    async def test_simple_schema_returns_valid_instance(self, ollama_llm):
        """Simple schema: LLM returns something that parses and validates."""
        prompt = (
            "Respond with a greeting and a score from 1 to 5. "
            "Example: message='Hello!', score=4."
        )
        result = await ollama_llm.generate_structured(
            prompt,
            SimpleGreeting,
            timeout=60.0,
        )
        assert isinstance(result, SimpleGreeting)
        assert isinstance(result.message, str)
        assert len(result.message) > 0
        assert isinstance(result.score, int)
        assert 1 <= result.score <= 5

    @pytest.mark.asyncio
    async def test_complex_schema_returns_valid_instance(self, ollama_llm):
        """Complex schema (nested, list, optional): still valid output?"""
        prompt = (
            "Give a short title, a list of 2-4 fruit names, and an optional note. "
            "Example: title='Fruits', items=['apple','banana'], optional_note='yummy'."
        )
        result = await ollama_llm.generate_structured(
            prompt,
            ComplexStructured,
            timeout=60.0,
        )
        assert isinstance(result, ComplexStructured)
        assert isinstance(result.title, str)
        assert isinstance(result.items, list)
        assert 2 <= len(result.items) <= 4
        for item in result.items:
            assert isinstance(item, str)
        # optional_note can be None or str
        assert result.optional_note is None or isinstance(result.optional_note, str)

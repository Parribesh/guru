"""
Ollama LLM wrapper. One ChatOllama backend for generate, stream, and structured output.
"""

from __future__ import annotations

import asyncio
from typing import AsyncIterator, Optional, Type, TypeVar

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_ollama import ChatOllama
from pydantic import BaseModel

from agents.core.llm import LLM

T = TypeVar("T", bound=BaseModel)

DEFAULT_STRUCTURED_TIMEOUT = 120.0


class OllamaLLM(LLM):
    def __init__(
        self,
        model: str,
        temperature: float = 0.7,
        base_url: str = "http://localhost:11434",
    ):
        self._llm = ChatOllama(
            model=model, temperature=temperature, base_url=base_url
        )

    def generate(self, prompt: str) -> str:
        response = self._llm.invoke(prompt)
        return getattr(response, "content", str(response))

    async def stream(self, prompt: str) -> AsyncIterator[str]:
        async for chunk in self._llm.astream(prompt):
            text = getattr(chunk, "content", None)
            yield text if isinstance(text, str) else str(chunk)

    async def generate_structured(
        self,
        prompt: str,
        schema: Type[T],
        *,
        timeout: float = DEFAULT_STRUCTURED_TIMEOUT,
        system_prompt: Optional[str] = None,
        **kwargs,
    ) -> T:
        """
        Invoke the LLM and return parsed structured output (Pydantic).
        If system_prompt is provided, it is sent as a system message before the user prompt.
        """
        structured = self._llm.with_structured_output(schema, **kwargs)
        if system_prompt:
            messages = [
                SystemMessage(content=system_prompt),
                HumanMessage(content=prompt),
            ]
            input_arg = messages
        else:
            input_arg = prompt
        return await asyncio.wait_for(
            structured.ainvoke(input_arg),
            timeout=timeout,
        )

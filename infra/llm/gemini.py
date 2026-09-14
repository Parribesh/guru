"""
Google Gemini LLM wrapper. One ChatGoogleGenerativeAI backend for generate, stream, and structured output.
"""

from __future__ import annotations

import asyncio
import os
from typing import AsyncIterator, Optional, Type, TypeVar

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel

from agents.core.llm import LLM

T = TypeVar("T", bound=BaseModel)

DEFAULT_STRUCTURED_TIMEOUT = 120.0


class GeminiLLM(LLM):
    def __init__(
        self,
        model: str = "gemini-2.5-flash",
        temperature: float = 0.7,
        api_key: Optional[str] = None,
    ):
        resolved_key = api_key or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        if not resolved_key:
            raise ValueError(
                "GEMINI_API_KEY is not configured. Please add GEMINI_API_KEY=your_api_key in your .env file."
            )
        self._llm = ChatGoogleGenerativeAI(
            model=model,
            temperature=temperature,
            google_api_key=resolved_key,
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
        Invoke Gemini and return parsed structured output (Pydantic model).
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

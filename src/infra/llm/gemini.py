"""
Google Gemini LLM wrapper. One ChatGoogleGenerativeAI backend for generate, stream, and structured output.
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Any, AsyncIterator, Optional, Type, TypeVar

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel

from agents.core.llm import LLM

# Suppress noisy Google GenAI AFC warning
logging.getLogger("google.genai").setLevel(logging.ERROR)
logging.getLogger("google.genai.models").setLevel(logging.ERROR)

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

DEFAULT_STRUCTURED_TIMEOUT = 90.0
FALLBACK_GEMINI_MODELS = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-flash-latest"]


def _extract_text(content: Any) -> str:
    """
    Extract clean string text from LangChain message content.
    Handles plain strings, list of text/thought parts, dict blocks, and objects.
    """
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for part in content:
            if isinstance(part, str):
                parts.append(part)
            elif isinstance(part, dict):
                if part.get("type") == "text":
                    parts.append(part.get("text", ""))
                elif "text" in part:
                    parts.append(part.get("text", ""))
            elif hasattr(part, "text"):
                parts.append(getattr(part, "text", ""))
        return "".join(parts)
    return str(content) if content is not None else ""


def _is_quota_or_not_found(err: Exception) -> bool:
    msg = str(err).lower()
    return (
        "resource_exhausted" in msg
        or "429" in msg
        or "quota" in msg
        or "rate-limit" in msg
        or "not_found" in msg
        or "404" in msg
        or "no longer available" in msg
    )


class GeminiLLM(LLM):
    def __init__(
        self,
        model: str = "gemini-3.6-flash",
        temperature: float = 0.7,
        api_key: Optional[str] = None,
    ):
        resolved_key = api_key or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        if not resolved_key:
            raise ValueError(
                "GEMINI_API_KEY is not configured. Please add GEMINI_API_KEY=your_api_key in your .env file."
            )
        self.model = model
        self.temperature = temperature
        self.api_key = resolved_key
        self._llm = self._create_chat_model(self.model)

    def _create_chat_model(self, model_name: str) -> ChatGoogleGenerativeAI:
        return ChatGoogleGenerativeAI(
            model=model_name,
            temperature=self.temperature,
            google_api_key=self.api_key,
            max_retries=1,
            timeout=DEFAULT_STRUCTURED_TIMEOUT,
        )

    def _get_fallback_llms(self) -> list[ChatGoogleGenerativeAI]:
        return [
            self._create_chat_model(m)
            for m in FALLBACK_GEMINI_MODELS
            if m != self.model
        ]

    def generate(self, prompt: str) -> str:
        try:
            response = self._llm.invoke(prompt)
            content = getattr(response, "content", response)
            return _extract_text(content)
        except Exception as e:
            if _is_quota_or_not_found(e):
                for fb in self._get_fallback_llms():
                    try:
                        logger.warning("Primary Gemini model %s failed (%s). Retrying with fallback %s", self.model, e, fb.model)
                        response = fb.invoke(prompt)
                        content = getattr(response, "content", response)
                        return _extract_text(content)
                    except Exception:
                        continue
            raise

    async def stream(self, prompt: str) -> AsyncIterator[str]:
        try:
            async for chunk in self._llm.astream(prompt):
                content = getattr(chunk, "content", chunk)
                text = _extract_text(content)
                if text:
                    yield text
        except Exception as e:
            if _is_quota_or_not_found(e):
                for fb in self._get_fallback_llms():
                    try:
                        logger.warning("Primary Gemini model %s stream failed (%s). Retrying with fallback %s", self.model, e, fb.model)
                        async for chunk in fb.astream(prompt):
                            content = getattr(chunk, "content", chunk)
                            text = _extract_text(content)
                            if text:
                                yield text
                        return
                    except Exception:
                        continue
            raise

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
        Includes automatic fallback to stable Gemini models if primary model hits 429 quota or 404.
        """
        if system_prompt:
            input_arg = [
                SystemMessage(content=system_prompt),
                HumanMessage(content=prompt),
            ]
        else:
            input_arg = prompt

        structured = self._llm.with_structured_output(schema, method="json_schema", **kwargs)
        try:
            return await asyncio.wait_for(
                structured.ainvoke(input_arg),
                timeout=timeout,
            )
        except Exception as e:
            if _is_quota_or_not_found(e):
                for fb in self._get_fallback_llms():
                    try:
                        logger.warning(
                            "Primary Gemini model %s failed with quota/availability error (%s). Automatically falling back to %s.",
                            self.model,
                            e,
                            fb.model,
                        )
                        fb_structured = fb.with_structured_output(schema, method="json_schema", **kwargs)
                        return await asyncio.wait_for(
                            fb_structured.ainvoke(input_arg),
                            timeout=timeout,
                        )
                    except Exception as fb_err:
                        logger.warning("Fallback model %s also failed: %s", fb.model, fb_err)
                        continue
            raise

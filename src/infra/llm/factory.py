"""
Unified LLM factory for instantiating model providers (Gemini, Ollama, etc.)
based on application settings and optional user overrides.
"""

from __future__ import annotations

from typing import Any, Optional
from sqlalchemy.orm import Session

from api.settings import settings
from agents.core.llm import LLM
from infra.llm.gemini import GeminiLLM
from infra.llm.ollama import OllamaLLM


def get_llm(
    provider: Optional[str] = None,
    model: Optional[str] = None,
    temperature: Optional[float] = None,
    **kwargs: Any,
) -> LLM:
    """
    Instantiate and return an LLM implementation based on provider and settings.
    """
    active_provider = (provider or settings.LLM_PROVIDER).lower()

    if active_provider == "gemini":
        import os
        resolved_model = model or settings.GEMINI_MODEL
        resolved_temp = temperature if temperature is not None else settings.GEMINI_TEMPERATURE
        resolved_api_key = (
            kwargs.pop("api_key", None)
            or settings.GEMINI_API_KEY
            or os.environ.get("GEMINI_API_KEY")
            or os.environ.get("GOOGLE_API_KEY")
        )
        if not resolved_api_key:
            raise ValueError(
                "GEMINI_API_KEY is not configured. Please set GEMINI_API_KEY in your .env file or environment."
            )
        return GeminiLLM(
            model=resolved_model,
            temperature=resolved_temp,
            api_key=resolved_api_key,
            **kwargs,
        )

    if active_provider == "ollama":
        resolved_model = model or settings.OLLAMA_MODEL
        resolved_temp = temperature if temperature is not None else settings.OLLAMA_TEMPERATURE
        return OllamaLLM(
            model=resolved_model,
            temperature=resolved_temp,
            base_url=settings.OLLAMA_BASE_URL,
        )

    raise ValueError(f"Unsupported LLM provider: '{active_provider}'. Supported: 'gemini', 'ollama'")


def get_llm_for_user(db: Session, user_id: int) -> LLM:
    """
    Retrieve user preferences from database and instantiate the appropriate LLM,
    falling back to system settings if preferences are not explicitly configured.
    """
    from api.models.models import User as DbUser

    user = db.query(DbUser).filter(DbUser.id == user_id).first()
    prefs = user.preferences if user and isinstance(user.preferences, dict) else {}

    provider = prefs.get("llm_provider") or settings.LLM_PROVIDER
    provider = str(provider).lower()

    if provider == "gemini":
        model = prefs.get("gemini_model") or settings.GEMINI_MODEL
    elif provider == "ollama":
        model = prefs.get("ollama_model") or settings.OLLAMA_MODEL
    else:
        model = settings.GEMINI_MODEL

    return get_llm(provider=provider, model=model)

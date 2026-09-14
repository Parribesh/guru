import pytest
from unittest.mock import MagicMock

from api.settings import Settings
from infra.llm.factory import get_llm, get_llm_for_user
from infra.llm.gemini import GeminiLLM
from infra.llm.ollama import OllamaLLM


def test_settings_defaults():
    s = Settings(
        DATABASE_URL="sqlite:///./test.db",
        LLM_PROVIDER="gemini",
        GEMINI_MODEL="gemini-2.5-flash",
    )
    assert s.DATABASE_URL == "sqlite:///./test.db"
    assert s.LLM_PROVIDER == "gemini"
    assert s.GEMINI_MODEL == "gemini-2.5-flash"
    assert s.OLLAMA_MODEL == "qwen:latest"


def test_get_llm_factory_gemini():
    llm = get_llm(provider="gemini", model="gemini-2.5-flash", api_key="fake-key")
    assert isinstance(llm, GeminiLLM)


def test_get_llm_factory_gemini_missing_key(monkeypatch):
    from api.settings import settings
    monkeypatch.setattr(settings, "GEMINI_API_KEY", None)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    with pytest.raises(ValueError, match="GEMINI_API_KEY is not configured"):
        get_llm(provider="gemini", model="gemini-2.5-flash")


def test_get_llm_factory_ollama():
    llm = get_llm(provider="ollama", model="qwen:latest")
    assert isinstance(llm, OllamaLLM)


def test_get_llm_factory_unsupported():
    with pytest.raises(ValueError, match="Unsupported LLM provider"):
        get_llm(provider="unknown_provider")


def test_get_llm_for_user_fallback(monkeypatch):
    from api.settings import settings
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "fake-key")
    db_mock = MagicMock()
    user_mock = MagicMock()
    user_mock.preferences = {}
    db_mock.query().filter().first.return_value = user_mock

    llm = get_llm_for_user(db_mock, 1)
    assert isinstance(llm, GeminiLLM)


def test_get_llm_for_user_with_ollama_preference():
    db_mock = MagicMock()
    user_mock = MagicMock()
    user_mock.preferences = {
        "llm_provider": "ollama",
        "ollama_model": "llama3.2",
    }
    db_mock.query().filter().first.return_value = user_mock

    llm = get_llm_for_user(db_mock, 1)
    assert isinstance(llm, OllamaLLM)

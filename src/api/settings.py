from __future__ import annotations

from typing import Literal, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Database
    DATABASE_URL: str = "sqlite:///./ml-guru.db"

    # Security & JWT
    SECRET_KEY: str = "your-secret-key-here-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # Default User Credentials
    DEFAULT_USER_EMAIL: str = "paribesh@guru.com"
    DEFAULT_USER_PASSWORD: str = "password123"

    # LLM Provider Configuration
    # Supported: "gemini", "ollama", "openai"
    LLM_PROVIDER: Literal["gemini", "ollama", "openai"] = "gemini"

    # Google Gemini Configuration
    GEMINI_API_KEY: Optional[str] = None
    GEMINI_MODEL: str = "gemini-3.6-flash"
    GEMINI_TEMPERATURE: float = 0.7

    # Ollama Configuration
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "qwen:latest"
    OLLAMA_TEMPERATURE: float = 0.7

    # OpenAI Configuration (Optional / Future-ready)
    OPENAI_API_KEY: Optional[str] = None
    OPENAI_MODEL: str = "gpt-4o-mini"
    OPENAI_TEMPERATURE: float = 0.7


settings = Settings()

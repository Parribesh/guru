from __future__ import annotations

import os
from enum import Enum
from typing import Any, List, Mapping, Optional


class AgentRole(str, Enum):
    CHAT = "chat"
    TUTOR = "tutor"
    TESTER = "tester"
    SYLLABUS_BUILDER = "syllabus_builder"


_DEFAULT_CHAT_SYSTEM_PROMPT = "You are a helpful assistant."


def build_chat_system_prompt(*, user_preferences: Optional[dict] = None, env: Mapping[str, str] | None = None) -> str:
    """
    System prompt for general chat. Priority:
    - user prefs: chat_system_prompt, system_prompt
    - env: CHAT_SYSTEM_PROMPT
    - fallback default
    """
    prefs = user_preferences or {}
    if isinstance(prefs, dict):
        sp = prefs.get("chat_system_prompt") or prefs.get("system_prompt")
        if isinstance(sp, str) and sp.strip():
            return sp.strip()
    env_map = env or os.environ
    env_sp = env_map.get("CHAT_SYSTEM_PROMPT")
    if isinstance(env_sp, str) and env_sp.strip():
        return env_sp.strip()
    return _DEFAULT_CHAT_SYSTEM_PROMPT


def build_tutor_system_prompt(*args, **kwargs) -> str:
    """Re-export from app prompt_builders for backward compatibility."""
    from api.prompt_builders import build_tutor_system_prompt as _build

    return _build(*args, **kwargs)


def build_test_system_prompt(*, module_title: str, objectives: list[str], compressed: bool = True) -> str:
    """Re-export from app prompt_builders."""
    from api.prompt_builders import build_test_system_prompt as _build

    return _build(module_title=module_title, objectives=objectives or [], compressed=compressed)



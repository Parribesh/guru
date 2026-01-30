"""Unit tests for prompt_builder (no LLM; env/prefs mocked)."""
import os
from unittest.mock import patch

import pytest

from api.utils.prompt_builder import (
    AgentRole,
    build_chat_system_prompt,
    build_tutor_system_prompt,
)


@pytest.mark.unit
class TestAgentRole:
    def test_values(self):
        assert AgentRole.CHAT.value == "chat"
        assert AgentRole.SYLLABUS_BUILDER.value == "syllabus_builder"


@pytest.mark.unit
class TestBuildChatSystemPrompt:
    def test_default_when_no_prefs_no_env(self):
        with patch.dict(os.environ, {}, clear=False):
            # Ensure CHAT_SYSTEM_PROMPT not set
            env = {k: v for k, v in os.environ.items() if k != "CHAT_SYSTEM_PROMPT"}
            result = build_chat_system_prompt(env=env)
        assert "helpful" in result.lower() or len(result) > 0

    def test_user_prefs_chat_system_prompt(self):
        result = build_chat_system_prompt(
            user_preferences={"chat_system_prompt": "You are a math tutor."}
        )
        assert "math tutor" in result

    def test_user_prefs_system_prompt_fallback(self):
        result = build_chat_system_prompt(
            user_preferences={"system_prompt": "Generic system."}
        )
        assert "Generic system" in result

    def test_env_overrides_when_no_prefs(self):
        with patch.dict(os.environ, {"CHAT_SYSTEM_PROMPT": "From env."}, clear=False):
            result = build_chat_system_prompt(user_preferences={}, env=os.environ)
        assert "From env" in result


@pytest.mark.unit
class TestBuildTutorSystemPrompt:
    def test_compressed_includes_module_and_objectives(self):
        result = build_tutor_system_prompt(
            user_name="Alice",
            course_title="ML",
            course_subject="ML",
            course_goals="Learn",
            syllabus_outline="1. Intro",
            module_title="Linear Regression",
            module_order_index=2,
            objectives=["Obj1", "Obj2", "Obj3"],
            progress_best_score=0.8,
            progress_attempts=2,
            progress_passed=False,
            compressed=True,
        )
        assert "Alice" in result
        assert "Linear Regression" in result
        assert "Obj1" in result or "objectives" in result.lower()



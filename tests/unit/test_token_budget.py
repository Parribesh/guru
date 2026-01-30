"""Unit tests for token_budget utils."""
import pytest

from api.utils.token_budget import (
    estimate_tokens,
    truncate_text,
    compress_system_prompt,
    build_constrained_prompt,
)


@pytest.mark.unit
class TestEstimateTokens:
    def test_empty(self):
        assert estimate_tokens("") == 0

    def test_single_word(self):
        # 1 word * 1.33 -> 1
        assert estimate_tokens("hello") == 1

    def test_multiple_words(self):
        text = "one two three four five"
        assert estimate_tokens(text) == int(5 * 1.33)

    def test_whitespace_only_treated_as_empty_words(self):
        # "   " -> split -> [] -> 0 words -> 0
        assert estimate_tokens("   ") == 0


@pytest.mark.unit
class TestTruncateText:
    def test_under_limit_unchanged(self):
        text = "short"
        assert truncate_text(text, max_tokens=100) == text

    def test_over_limit_truncated_with_suffix(self):
        text = " ".join(["word"] * 100)
        result = truncate_text(text, max_tokens=10, suffix="...")
        assert result.endswith("...")
        assert estimate_tokens(result) <= 15  # approximate

    def test_custom_suffix(self):
        text = " ".join(["x"] * 50)
        result = truncate_text(text, max_tokens=5, suffix=" [cut]")
        assert result.endswith(" [cut]")


@pytest.mark.unit
class TestCompressSystemPrompt:
    def test_under_budget_unchanged(self):
        prompt = "ROLE: Tutor\nShort line."
        assert compress_system_prompt(prompt, max_tokens=50) == prompt

    def test_role_line_preserved(self):
        prompt = "ROLE: Tutor Agent\n" + ("word " * 200)
        result = compress_system_prompt(prompt, max_tokens=20)
        assert result.strip().startswith("ROLE:")

    def test_no_role_truncates(self):
        prompt = "Just some long text. " * 50
        result = compress_system_prompt(prompt, max_tokens=10)
        assert len(result) < len(prompt)


@pytest.mark.unit
class TestBuildConstrainedPrompt:
    def test_basic_build(self):
        system = "You are a tutor."
        history = [("Hi", "Hello!")]
        query = "What is 2+2?"
        prompt = build_constrained_prompt(system, history, query, max_total_tokens=150)
        assert "tutor" in prompt or "Tutor" in prompt
        assert "2+2" in prompt
        assert "User:" in prompt and "Assistant:" in prompt

    def test_empty_history(self):
        prompt = build_constrained_prompt(
            "System prompt here",
            [],
            "User question",
            max_total_tokens=200,
        )
        assert "System prompt" in prompt or "System" in prompt
        assert "User question" in prompt

    def test_respects_budget_approximately(self):
        long_system = "ROLE: Tutor\n" + ("instruction " * 100)
        history = [("q1", "a1"), ("q2", "a2")]
        prompt = build_constrained_prompt(
            long_system, history, "Short query", max_total_tokens=150
        )
        # Should be compressed; allow some slack
        assert estimate_tokens(prompt) <= 200

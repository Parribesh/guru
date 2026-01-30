"""Unit tests for common utils (pure functions only; DB-backed ones need integration)."""
from datetime import datetime
import pytest

from api.utils.common import (
    iso_format,
    display_name,
    welcome_message,
    normalize_modules,
)
from api.schemas.user_schemas import User


@pytest.mark.unit
class TestIsoFormat:
    def test_appends_z(self):
        dt = datetime(2025, 1, 15, 12, 30, 0)
        result = iso_format(dt)
        assert result.endswith("Z")
        assert "2025" in result and "01" in result


@pytest.mark.unit
class TestDisplayName:
    def test_preferences_name(self):
        user = User(
            email="u@example.com",
            hashed_password="",
            preferences={"name": "Alice"},
        )
        assert display_name(user) == "Alice"

    def test_preferences_full_name(self):
        user = User(
            email="u@example.com",
            hashed_password="",
            preferences={"full_name": "Bob Smith"},
        )
        assert display_name(user) == "Bob Smith"

    def test_fallback_email_prefix(self):
        user = User(email="paribesh@example.com", hashed_password="", preferences=None)
        assert display_name(user) == "paribesh"

    def test_empty_prefs_fallback(self):
        user = User(email="test@test.com", hashed_password="", preferences={})
        assert display_name(user) == "test"


@pytest.mark.unit
class TestWelcomeMessage:
    def test_basic(self):
        result = welcome_message(name="Paribesh", context="Start the course.")
        assert "Paribesh" in result
        assert "Start the course" in result


@pytest.mark.unit
class TestNormalizeModules:
    def test_non_list_returns_empty(self):
        assert normalize_modules(None) == []
        assert normalize_modules("not a list") == []
        assert normalize_modules(123) == []

    def test_valid_dict_module(self):
        raw = [
            {
                "title": "Module 1",
                "objectives": ["O1", "O2", "O3"],
                "estimated_minutes": 60,
            },
        ]
        result = normalize_modules(raw)
        assert len(result) == 1
        assert result[0]["title"] == "Module 1"
        assert result[0]["objectives"] == ["O1", "O2", "O3"]
        assert result[0]["estimated_minutes"] == 60

    def test_skips_invalid_entries(self):
        raw = [
            {"title": "Valid", "objectives": ["A", "B", "C"], "estimated_minutes": 45},
            {"title": "", "objectives": ["X"], "estimated_minutes": 30},
            {"wrong": "shape"},
            [],
        ]
        result = normalize_modules(raw)
        assert len(result) == 1
        assert result[0]["title"] == "Valid"

    def test_max_10_modules(self):
        raw = [
            {"title": f"M{i}", "objectives": ["A", "B", "C"], "estimated_minutes": 40}
            for i in range(15)
        ]
        result = normalize_modules(raw)
        assert len(result) == 10

    def test_strips_whitespace(self):
        raw = [
            {
                "title": "  Title  ",
                "objectives": ["  O1  ", " O2 "],
                "estimated_minutes": 50,
            },
        ]
        result = normalize_modules(raw)
        assert result[0]["title"] == "Title"
        assert result[0]["objectives"] == ["O1", "O2"]

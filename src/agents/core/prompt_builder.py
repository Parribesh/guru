"""
Core prompt builder: template-based prompt construction for use by the app.
The app defines template strings and passes kwargs; the library fills them.
Use for system prompts or agent prompts (dynamic per request or at init).
"""

from __future__ import annotations

from typing import Any


class _SafeFormatDict(dict):
    """Mapping that returns empty string for missing keys (for str.format_map)."""

    def __missing__(self, key: str) -> str:
        return ""


def build_from_template(template: str, **kwargs: Any) -> str:
    """
    Fill a template with the given keyword arguments.
    Missing keys are replaced with empty string (safe for optional placeholders).
    """
    if not template:
        return ""
    # None -> "" so optional placeholders render as empty
    safe = {k: ("" if v is None else v) for k, v in kwargs.items()}
    return template.format_map(_SafeFormatDict(safe))

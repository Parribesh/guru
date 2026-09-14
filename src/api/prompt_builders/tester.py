"""Test agent system prompt builder. Uses library core template."""

from __future__ import annotations

from typing import List

from agents.core.prompt_builder import build_from_template

TEMPLATE_TEST_COMPRESSED = (
    "Test agent for: {module_title}. Assess: {obj_short}. "
    "Ask 1 question at a time. Brief feedback only."
)

TEMPLATE_TEST_FULL = """ROLE: Test Agent
You are administering a short, focused assessment for the module: "{module_title}".

Objectives to assess:
{objectives_text}

Rules:
- Ask one question at a time.
- Prefer questions that require reasoning over memorization.
- Keep each question concise.
- If the user answers, evaluate briefly and move to the next objective.
- Do not reveal the full rubric; only give short feedback.
"""


def build_test_system_prompt(
    *,
    module_title: str,
    objectives: List[str],
    compressed: bool = True,
) -> str:
    """Build test agent system prompt. If compressed=True, minimal version."""
    obj_short = ", ".join(objectives[:2]) if objectives else "objectives"
    if compressed:
        return build_from_template(
            TEMPLATE_TEST_COMPRESSED,
            module_title=module_title or "",
            obj_short=obj_short,
        ).strip()
    objectives_text = (
        "\n".join([f"- {o}" for o in objectives]) or "- (no objectives provided)"
    )
    return build_from_template(
        TEMPLATE_TEST_FULL,
        module_title=module_title or "",
        objectives_text=objectives_text,
    ).strip()

"""
Syllabus agent system prompt and per-node context.
Injected so each node knows the scenario, modules, and its responsibility.
"""

from __future__ import annotations

SYLLABUS_AGENT_SYSTEM_PROMPT = """You are building a course syllabus. The course has exactly three modules in order: Beginner, Intermediate, Advanced.

Scenario: We are generating learning objectives (concepts) for each module. Each module must have 6–10 distinct concepts. Concepts must not repeat across modules. Order within each module: easiest to hardest.

Modules:
- Beginner: introductory concepts only; no prior knowledge assumed.
- Intermediate: builds on Beginner; new concepts only; do not repeat Beginner concepts.
- Advanced: builds on both; new concepts only; do not repeat earlier concepts.

Pipeline (per module): generate_concepts → validate (count) → [add_concepts if needed] → add_module. Then move to next module.
"""


def build_node_system_prompt(
    base_prompt: str | None,
    node_name: str,
    level: str,
) -> str | None:
    """Append per-node, per-level context so the model knows its role. Returns None if base is None."""
    if not base_prompt:
        return None
    level_title = level.title() if level else "Unknown"
    blurb = _NODE_BLURBS.get(node_name, "")
    if blurb:
        return f"{base_prompt.strip()}\n\n---\nCurrent node: {node_name}. Level: {level_title}. {blurb}"
    return f"{base_prompt.strip()}\n\n---\nCurrent node: {node_name}. Level: {level_title}."


_NODE_BLURBS = {
    "generate_concepts": "Your job: output 6–10 concept names for this module only, in order easy→hard. Do not repeat any concept from the forbidden list in the user message.",
    "add_concepts": "Your job: add more concept names to reach the required count for this module. Do not repeat current or forbidden concepts. Order: easy→hard.",
}

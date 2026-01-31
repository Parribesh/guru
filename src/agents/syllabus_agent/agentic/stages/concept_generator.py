"""
Concept generator: one module level at a time, structured JSON output.
Validator node checks threshold; add_concepts node fills missing concepts.
Concise prompts; post-dedup so no concept from other modules appears.
"""

from __future__ import annotations

from typing import Any, Dict, List

from agents.syllabus_agent.agentic.schemas import ConceptsList

MIN_PER_LEVEL = 6
MAX_PER_LEVEL = 10
MAX_ADD_ROUNDS = 2


def _forbidden_set(
    already_used_concepts: List[str],
    other_modules_concepts: Dict[str, List[str]],
) -> set[str]:
    out: set[str] = set()
    for c in already_used_concepts or []:
        if (c or "").strip():
            out.add((c or "").strip().lower())
    for concepts in (other_modules_concepts or {}).values():
        for c in concepts or []:
            if (c or "").strip():
                out.add((c or "").strip().lower())
    return out


def _dedupe_concepts(concepts: List[str], forbidden: set[str]) -> List[str]:
    seen: set[str] = set()
    out: List[str] = []
    for c in concepts or []:
        name = (c or "").strip()
        if not name:
            continue
        key = name.lower()
        if key in forbidden or key in seen:
            continue
        seen.add(key)
        out.append(name)
    return out


async def generate_concepts(
    llm: Any,
    course_title: str,
    subject: str,
    goals: str | None,
    level: str,
    *,
    already_used_concepts: List[str] | None = None,
    other_modules_concepts: Dict[str, List[str]] | None = None,
    system_prompt: str | None = None,
) -> tuple[List[str], str]:
    """
    Generate concepts for one module level. Post-dedup against forbidden set.
    system_prompt is injected as LLM system message (scenario + node role). Returns (concepts, prompt_used).
    """
    gen = getattr(llm, "generate_structured", None)
    if not gen:
        return [], ""
    used = list(already_used_concepts or [])
    other = dict(other_modules_concepts or {})
    forbidden = _forbidden_set(used, other)
    prompt = _build_generate_prompt(course_title, subject, goals, level, forbidden)
    kwargs = {} if system_prompt is None else {"system_prompt": system_prompt}
    result = await gen(prompt, ConceptsList, **kwargs)
    raw = getattr(result, "concepts", []) or []
    concepts = _dedupe_concepts(raw, forbidden)[:MAX_PER_LEVEL]
    return concepts, prompt


def _build_generate_prompt(
    course_title: str,
    subject: str,
    goals: str | None,
    level: str,
    forbidden: set[str],
) -> str:
    level_lower = level.lower()
    scope = (
        "Intro only; no prior knowledge."
        if level_lower == "beginner"
        else "Builds on previous module; new concepts only, no repeat."
    )
    forbidden_line = ""
    if forbidden:
        forbidden_line = f"\nDo NOT use (already in other modules): {', '.join(sorted(forbidden)[:50])}."
    goals_bit = f" Goals: {goals}" if goals else ""
    return f"""Course: {course_title} ({subject}){goals_bit}
Module: {level.title()}. {scope}{forbidden_line}
Output: JSON with key "concepts": list of {MIN_PER_LEVEL}–{MAX_PER_LEVEL} short names, order easy→hard. No duplicate of list above."""

"""
Add-concepts node: when validator finds concept count below threshold, ask LLM for extra concepts.
Concise prompt; dedupe so no repeat of current or other modules.
"""

from __future__ import annotations

from typing import Any, Dict, List

from agents.syllabus_agent.agentic.schemas import AdditionalConceptsList


def _forbidden_set(
    current_concepts: List[str],
    already_used_concepts: List[str],
    other_modules_concepts: Dict[str, List[str]],
) -> set[str]:
    out: set[str] = set()
    for c in (current_concepts or []) + (already_used_concepts or []):
        if (c or "").strip():
            out.add((c or "").strip().lower())
    for concepts in (other_modules_concepts or {}).values():
        for c in concepts or []:
            if (c or "").strip():
                out.add((c or "").strip().lower())
    return out


async def add_missing_concepts(
    llm: Any,
    level: str,
    current_concepts: List[str],
    needed_count: int,
    *,
    already_used_concepts: List[str] | None = None,
    other_modules_concepts: Dict[str, List[str]] | None = None,
    subject: str = "",
    system_prompt: str | None = None,
) -> tuple[List[str], str]:
    """Ask LLM for extra concepts; dedupe against current + other modules. system_prompt injected as LLM system message."""
    gen = getattr(llm, "generate_structured", None)
    if not gen or needed_count <= 0:
        return [], ""
    forbidden = _forbidden_set(
        current_concepts,
        list(already_used_concepts or []),
        dict(other_modules_concepts or {}),
    )
    prompt = _build_add_prompt(level, current_concepts, needed_count, forbidden)
    kwargs = {} if system_prompt is None else {"system_prompt": system_prompt}
    result = await gen(prompt, AdditionalConceptsList, **kwargs)
    raw = getattr(result, "concepts", []) or []
    added: List[str] = []
    for c in raw:
        if len(added) >= needed_count:
            break
        name = (c or "").strip()
        if name and name.lower() not in forbidden:
            forbidden.add(name.lower())
            added.append(name)
    return added, prompt


def _build_add_prompt(
    level: str,
    current_concepts: List[str],
    needed_count: int,
    forbidden: set[str],
) -> str:
    existing = ", ".join(current_concepts) if current_concepts else "(none)"
    forbid_line = f"\nDo NOT use: {', '.join(sorted(forbidden)[:40])}." if forbidden else ""
    return f"""{level.title()} module. Current: {existing}. Add {needed_count}+ new concepts, easy→hard.{forbid_line}
Output: JSON key "concepts" (list of strings). Short names, no duplicate."""

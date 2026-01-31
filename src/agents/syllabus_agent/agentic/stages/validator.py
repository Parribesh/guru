"""
Validator node: check if concept list meets threshold. If not, add_concepts node is used to fill.
"""

from __future__ import annotations

from typing import List, Tuple

from agents.syllabus_agent.agentic.stages.concept_generator import MIN_PER_LEVEL


def validate_concept_count(concepts: List[str]) -> Tuple[bool, int]:
    """
    Return (meets_threshold, needed_count).
    meets_threshold is True if len(concepts) >= MIN_PER_LEVEL.
    needed_count is how many more are needed (0 if meets).
    """
    count = len(concepts) if concepts else 0
    if count >= MIN_PER_LEVEL:
        return True, 0
    return False, MIN_PER_LEVEL - count

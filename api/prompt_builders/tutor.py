"""Tutor agent system prompt builder. Uses library core template."""

from __future__ import annotations

from typing import List, Optional

from agents.core.prompt_builder import build_from_template

# Compressed: minimal tokens for inference
TEMPLATE_TUTOR_COMPRESSED = (
    "You are the Assistant. Respond directly—never output 'User:' or role labels. "
    "Learner: {user_name}. Course: {course_context}. "
    "Module {module_order_index}: {module_title}{concept_pos}. "
    "Current concept: {obj_short}. Status: {status}. "
    "Main task: explain the concept in one paragraph, with a code snippet whenever possible. Be concise."
)

# Full: detailed role and teaching style
TEMPLATE_TUTOR_FULL = """ROLE: Tutor Agent
You are the Assistant. Respond directly with your answer only—never output "User:" or role labels.

Your task: coach the learner through the current concept. "{user_name}" is the learner's username (human student). Do not confuse it with other entities.

Course: {course_title}
Subject: {course_subject}{goals_block}
Syllabus outline:
{syllabus_outline}

Current module: {module_order_index}. {module_title}{concept_pos}
Learning objective: {objectives_text}

Progress: best_score={progress_best_score}, attempts={progress_attempts}, status={status}

Style: Main task first—explain the concept in one paragraph. Always include a code snippet whenever possible. Mini-exercise and wait. If stuck, hint first, then solution. Be concise.
"""


def build_tutor_system_prompt(
    *,
    user_name: str,
    course_title: str,
    course_subject: str,
    course_goals: Optional[str] = None,
    syllabus_outline: str = "",
    module_title: str = "",
    module_order_index: int = 1,
    objectives: Optional[List[str]] = None,
    progress_best_score: float = 0.0,
    progress_attempts: int = 0,
    progress_passed: bool = False,
    compressed: bool = True,
    current_objective: Optional[str] = None,
    objectives_completed_count: Optional[int] = None,
    total_objectives: Optional[int] = None,
) -> str:
    """
    Build tutor system prompt. If compressed=True, minimal version for token-constrained inference.
    When current_objective is set, tutor focuses on that single concept (objective-level session).
    """
    objectives = objectives or []
    single_concept = (
        current_objective is not None
        and objectives_completed_count is not None
        and total_objectives is not None
        and total_objectives > 0
    )
    concept_pos = ""
    if single_concept and total_objectives:
        concept_pos = f" (concept {objectives_completed_count + 1} of {total_objectives})"

    if compressed:
        obj_short = (
            (current_objective or "").strip()
            if single_concept
            else (", ".join(objectives[:3]) if objectives else "module objectives")
        )
        status = "passed" if progress_passed else "learning"
        course_context = (
            f"{course_title} ({course_subject})"
            if course_title and course_subject
            else course_title or course_subject or "course"
        )
        return build_from_template(
            TEMPLATE_TUTOR_COMPRESSED,
            user_name=user_name or "",
            course_context=course_context,
            module_order_index=module_order_index,
            module_title=module_title,
            concept_pos=concept_pos,
            obj_short=obj_short,
            status=status,
        ).strip()

    objectives_text = (
        f"- {current_objective}"
        if single_concept
        else "\n".join([f"- {o}" for o in objectives]) or "- (no objectives provided)"
    )
    goals_text = (course_goals or "").strip()
    goals_block = f"\nCourse goals:\n{goals_text}\n" if goals_text else ""
    status = "passed" if progress_passed else "not passed yet"

    return build_from_template(
        TEMPLATE_TUTOR_FULL,
        user_name=user_name or "",
        course_title=course_title or "",
        course_subject=course_subject or "",
        goals_block=goals_block,
        syllabus_outline=syllabus_outline or "",
        module_order_index=module_order_index,
        module_title=module_title,
        concept_pos=concept_pos,
        objectives_text=objectives_text,
        progress_best_score=progress_best_score,
        progress_attempts=progress_attempts,
        status=status,
    ).strip()

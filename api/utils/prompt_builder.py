from __future__ import annotations

import os
from enum import Enum
from textwrap import dedent
from typing import Any, List, Mapping, Optional


class AgentRole(str, Enum):
    CHAT = "chat"
    TUTOR = "tutor"
    TESTER = "tester"
    SYLLABUS_BUILDER = "syllabus_builder"


_DEFAULT_CHAT_SYSTEM_PROMPT = "You are a helpful assistant."


def build_chat_system_prompt(*, user_preferences: Optional[dict] = None, env: Mapping[str, str] | None = None) -> str:
    """
    System prompt for general chat. Priority:
    - user prefs: chat_system_prompt, system_prompt
    - env: CHAT_SYSTEM_PROMPT
    - fallback default
    """
    prefs = user_preferences or {}
    if isinstance(prefs, dict):
        sp = prefs.get("chat_system_prompt") or prefs.get("system_prompt")
        if isinstance(sp, str) and sp.strip():
            return sp.strip()
    env_map = env or os.environ
    env_sp = env_map.get("CHAT_SYSTEM_PROMPT")
    if isinstance(env_sp, str) and env_sp.strip():
        return env_sp.strip()
    return _DEFAULT_CHAT_SYSTEM_PROMPT


def build_tutor_system_prompt(
    *,
    user_name: str,
    course_title: str,
    course_subject: str,
    course_goals: str | None,
    syllabus_outline: str,
    module_title: str,
    module_order_index: int,
    objectives: list[str],
    progress_best_score: float,
    progress_attempts: int,
    progress_passed: bool,
    compressed: bool = True,
) -> str:
    """
    Build tutor system prompt. If compressed=True, creates a minimal version for token-constrained inference.
    """
    if compressed:
        # Compressed version (~40-50 tokens) - includes essential context
        obj_short = ", ".join(objectives[:3]) if objectives else "module objectives"
        status = "passed" if progress_passed else "learning"
        course_context = f"{course_title} ({course_subject})" if course_title and course_subject else course_title or course_subject or "course"
        return (
            f"Tutor for {user_name}. Course: {course_context}. "
            f"Module {module_order_index}: {module_title}. "
            f"Objectives: {obj_short}. Status: {status}. "
            f"Be concise: explain briefly, give 1 example, ask 1 question."
        )
    
    # Full version (original)
    objectives_text = "\n".join([f"- {o}" for o in (objectives or [])]) or "- (no objectives provided)"
    goals_text = (course_goals or "").strip()
    goals_block = f"\nCourse goals:\n{goals_text}\n" if goals_text else ""
    status = "passed" if progress_passed else "not passed yet"

    return dedent(
        f"""
        ROLE: Tutor Agent
        You are an expert, patient tutor coaching {user_name} through a course module.

        Course: {course_title}
        Subject: {course_subject}{goals_block}
        Syllabus outline (for context):
        {syllabus_outline}

        Current module: {module_order_index}. {module_title}
        Learning objectives:
        {objectives_text}

        Learner progress:
        - best_score: {progress_best_score}
        - attempts: {progress_attempts}
        - status: {status}

        Teaching style:
        - Start with a short diagnostic question when needed.
        - Explain concepts with a tight example.
        - Give a mini-exercise and wait for the learner's answer.
        - Be concise and practical; avoid long lectures.
        - If the learner is stuck, provide a hint first, then the solution.
        """
    ).strip()


def build_test_system_prompt(*, module_title: str, objectives: list[str], compressed: bool = True) -> str:
    """
    Build test system prompt. If compressed=True, creates a minimal version for token-constrained inference.
    """
    if compressed:
        # Ultra-compressed version (~25-30 tokens)
        obj_short = ", ".join(objectives[:2]) if objectives else "objectives"
        return (
            f"Test agent for: {module_title}. Assess: {obj_short}. "
            f"Ask 1 question at a time. Brief feedback only."
        )
    
    # Full version (original)
    objectives_text = "\n".join([f"- {o}" for o in (objectives or [])]) or "- (no objectives provided)"
    return dedent(
        f"""
        ROLE: Test Agent
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
    ).strip()



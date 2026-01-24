from __future__ import annotations

import json
import os
from enum import Enum
from textwrap import dedent
from typing import Any, Mapping, Optional


class AgentRole(str, Enum):
    CHAT = "chat"
    TUTOR = "tutor"
    TESTER = "tester"
    SYLLABUS_BUILDER = "syllabus_builder"
    SYLLABUS_CRITIC = "syllabus_critic"


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
        # Ultra-compressed version (~30-40 tokens)
        obj_short = ", ".join(objectives[:3]) if objectives else "module objectives"
        status = "passed" if progress_passed else "learning"
        return (
            f"Tutor for {user_name}. Module {module_order_index}: {module_title}. "
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


def build_syllabus_generation_prompt(*, title: str, subject: str, goals: str | None) -> str:
    goals_text = (goals or "").strip()
    return dedent(
        f"""
        ROLE: Syllabus Builder
        You are an expert curriculum designer. Create a concise learning syllabus that can be:
        - taught by a Tutor Agent
        - assessed by a Test Agent

        Output constraints:
        - Return ONLY valid JSON (no markdown) in this exact shape:
          {{ "modules": [ {{ "title": str, "objectives": [str], "estimated_minutes": int }} ] }}

        Course title: {title}
        Subject: {subject}
        Goals/constraints: {goals_text}

        Quality rules:
        - Make 6-10 modules.
        - Each module should have 3-6 measurable objectives.
        - Order modules from prerequisites -> advanced topics.
        """
    ).strip()


def build_syllabus_critic_prompt(*, subject: str, modules: list[dict[str, Any]], goals: str | None) -> str:
    goals_text = (goals or "").strip()
    return dedent(
        f"""
        ROLE: Syllabus Critic
        You are a curriculum critic. Evaluate syllabus modules for completeness and ordering.

        Output constraints:
        - Return ONLY valid JSON (no markdown) with this shape:
          {{ "approved": bool, "issues": [str], "revised_modules": [ {{"title": str, "objectives": [str], "estimated_minutes": int}} ] }}

        Subject: {subject}
        Goals/constraints: {goals_text}
        Modules JSON: {json.dumps({"modules": modules})}

        Guidelines:
        - Ensure prerequisites come before advanced topics.
        - Ensure coverage of fundamentals through practice.
        - Ensure objectives are measurable and not vague.
        - If not approved, provide revised_modules with 6-10 modules.
        """
    ).strip()



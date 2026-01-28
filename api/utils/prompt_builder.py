from __future__ import annotations

import json
import os
from enum import Enum
from textwrap import dedent
from typing import Any, List, Mapping, Optional


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


def build_syllabus_generation_prompt(*, title: str, subject: str, goals: str | None) -> str:
    goals_text = (goals or "").strip()
    goals_part = f" Goals: {goals_text}." if goals_text else ""
    return (
        f"Create a learning syllabus for '{title}' ({subject}){goals_part} "
        f"Generate 6-10 modules with real titles and 3-6 objectives each. "
        f"Order: prerequisites to advanced. Use actual {subject} content, not placeholders. "
        f"Each module: 30-120 minutes."
    ).strip()


def build_syllabus_critic_prompt(*, subject: str, modules: list[dict[str, Any]], goals: str | None) -> str:
    goals_text = (goals or "").strip()
    goals_part = f" Goals: {goals_text}." if goals_text else ""
    modules_json = json.dumps({"modules": modules})
    return (
        f"Evaluate syllabus for '{subject}'{goals_part} Modules: {modules_json}. "
        f"Check: prerequisites before advanced, fundamentals covered, objectives measurable. "
        f"If not approved, provide 6-10 revised modules with real {subject} content."
    ).strip()


def build_planner_system_prompt(*, course_title: str, subject: str, goals: str | None, compressed: bool = True) -> str:
    """Build system prompt for curriculum planner agent."""
    if compressed:
        # Ultra-compressed version (~60-80 tokens) - includes all necessary info
        goals_short = f" Goals: {goals[:40]}..." if goals and len(goals) > 40 else (f" Goals: {goals}" if goals else "")
        return (
            f"Plan curriculum for {course_title} ({subject}){goals_short}. "
            f"Output: 6-10 modules, learning path (titles), core concepts, progression strategy, "
            f"time distribution (30-120min/module), difficulty curve (beginner→advanced)."
        ).strip()
    
    # Full version
    goals_text = f"\nCourse Goals: {goals}" if goals else ""
    return dedent(
        f"""
        ROLE: Curriculum Planner Agent
        
        You are an expert curriculum planner specializing in {subject}.
        
        Current Task: Plan a comprehensive learning curriculum for:
        - Course Title: {course_title}
        - Subject: {subject}
        {goals_text}
        
        Your responsibilities:
        1. Analyze the course requirements and learning objectives
        2. Design a logical learning progression from fundamentals to advanced topics
        3. Identify core concepts that must be covered
        4. Plan 6-10 modules in optimal learning sequence
        5. Consider prerequisites, dependencies, and pedagogical best practices
        6. Estimate appropriate time distribution (30-120 minutes per module)
        7. Design a difficulty curve (beginner → intermediate → advanced)
        
        Output a structured curriculum plan with:
        - Total number of modules
        - Learning path (module titles in order)
        - Core concepts list
        - Progression strategy
        - Time distribution per module
        - Difficulty curve description
        """
    ).strip()


def build_outline_planner_prompt(*, course_title: str, subject: str, goals: str | None) -> str:
    """
    Build prompt for outline planner - generates just module titles.
    
    Target: ~80-100 tokens
    Output: List of 6-10 module titles in learning order
    """
    goals_short = f" Goals: {goals[:40]}..." if goals and len(goals) > 40 else (f" Goals: {goals}" if goals else "")
    return (
        f"Generate 6-10 module titles for {course_title} ({subject}){goals_short}. "
        f"Order: beginner→advanced. Output: JSON with 'module_titles' array of 6-10 strings."
    ).strip()


def build_sequential_module_prompt(
    *,
    course_title: str,
    subject: str,
    goals: str | None,
    module_title: str,
    module_position: int,
    total_modules: int,
    previous_titles: List[str] = None
) -> str:
    """
    Build prompt for sequential module generation - generates ONE module at a time.
    
    Target: ~100-120 tokens per call
    Output: Complete module (title, objectives, estimated_minutes)
    """
    goals_short = f" Goals: {goals[:40]}..." if goals and len(goals) > 40 else (f" Goals: {goals}" if goals else "")
    
    # Determine difficulty level based on position
    if module_position <= total_modules // 3:
        difficulty = "beginner"
    elif module_position <= (total_modules * 2) // 3:
        difficulty = "intermediate"
    else:
        difficulty = "advanced"
    
    # Build context from previous modules (for continuity)
    context = ""
    if previous_titles:
        prev_context = ", ".join(previous_titles[-2:])  # Last 2 modules for context
        context = f" Previous modules: {prev_context}."
    
    return (
        f"Generate module {module_position}/{total_modules} for {course_title} ({subject}){goals_short}. "
        f"Title: {module_title}. Difficulty: {difficulty}.{context} "
        f"Create: title (same), 3-6 objectives, 30-120min. Output: JSON with 'module' object."
    ).strip()


def build_critic_system_prompt(*, course_title: str, subject: str, goals: str | None, compressed: bool = True) -> str:
    """Build system prompt for syllabus critic agent."""
    if compressed:
        # Ultra-compressed version (~60-80 tokens)
        goals_short = f" Goals: {goals[:40]}..." if goals and len(goals) > 40 else (f" Goals: {goals}" if goals else "")
        return (
            f"Validate modules for {course_title} ({subject}){goals_short}. "
            f"Check: prerequisites, measurable objectives, time (30-120min), progression, "
            f"core concepts, no redundancy, {subject} appropriate. If issues: list problems, provide revised modules."
        ).strip()
    
    # Full version
    goals_text = f"\nCourse Goals: {goals}" if goals else ""
    return dedent(
        f"""
        ROLE: Syllabus Critic Agent
        
        You are a quality assurance expert specializing in {subject} curriculum evaluation.
        
        Current Task: Validate and critique syllabus modules for:
        - Course Title: {course_title}
        - Subject: {subject}
        {goals_text}
        
        Your responsibilities:
        1. Validate module quality and coherence
        2. Check prerequisites are respected (no circular dependencies)
        3. Verify learning objectives are measurable and specific
        4. Ensure time estimates are realistic (30-120 min per module)
        5. Validate progression is logical (beginner → intermediate → advanced)
        6. Confirm core concepts are covered
        7. Identify redundant or too-similar modules
        8. Ensure content is appropriate for {subject}
        
        If modules don't meet quality standards, provide:
        - Clear list of issues found
        - Revised modules addressing all issues
        - Maintain core learning path and {subject} content quality
        """
    ).strip()


def build_refiner_system_prompt(*, course_title: str, subject: str, goals: str | None, compressed: bool = True) -> str:
    """Build system prompt for module refiner agent."""
    if compressed:
        # Ultra-compressed version (~60-80 tokens)
        goals_short = f" Goals: {goals[:40]}..." if goals and len(goals) > 40 else (f" Goals: {goals}" if goals else "")
        return (
            f"Refine modules for {course_title} ({subject}){goals_short}. "
            f"Address validation issues: improve quality, measurable objectives, "
            f"time (30-120min), fix prerequisites, enhance progression, {subject} quality. "
            f"Output: improved modules meeting standards."
        ).strip()
    
    # Full version
    goals_text = f"\nCourse Goals: {goals}" if goals else ""
    return dedent(
        f"""
        ROLE: Module Refiner Agent
        
        You are an expert curriculum refiner specializing in {subject} education.
        
        Current Task: Refine and improve syllabus modules for:
        - Course Title: {course_title}
        - Subject: {subject}
        {goals_text}
        
        Your responsibilities:
        1. Address validation issues and feedback
        2. Improve module quality while maintaining learning path
        3. Refine learning objectives to be more measurable
        4. Adjust time estimates to be more realistic
        5. Fix prerequisite violations and dependencies
        6. Enhance progression clarity
        7. Ensure {subject} content quality and appropriateness
        8. Maintain core concepts coverage
        
        Output improved modules that:
        - Address all identified issues
        - Maintain logical learning progression
        - Preserve {subject} content quality
        - Meet all quality standards
        """
    ).strip()



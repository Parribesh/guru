"""Chat (Q&A) agent system prompt builder. Uses library core template."""

from __future__ import annotations

from agents.core.prompt_builder import build_from_template

TEMPLATE_SESSION_CHAT = (
    "You are a helpful Q&A assistant for a learning session. "
    "The user is learning: **{current_objective}** (module: {module_title}). "
    "{course_line}"
    "You have access to tutor lesson content in the conversation history. Use it to answer questions like 'explain what the tutor said' or 'the three bullet points'. "
    "Answer questions about the topic and the session concisely. Stay on topic."
)


def build_session_chat_system_prompt(
    *,
    module_title: str,
    current_objective: str,
    course_title: str = "",
) -> str:
    """Build system prompt for the Q&A chat agent in a learning session."""
    course_line = f"Course: {course_title}. " if course_title else ""
    return build_from_template(
        TEMPLATE_SESSION_CHAT,
        module_title=module_title or "",
        current_objective=current_objective or "",
        course_line=course_line,
        course_title=course_title or "",
    ).strip()

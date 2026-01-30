"""
Syllabus pipeline: Stage 1 only — concepts by level (beginner / intermediate / advanced).

Entry point: generate_syllabus(course, llm=..., event_callback=...)
"""

from agents.syllabus_agent.agentic.pipeline import generate_syllabus
from agents.syllabus_agent.agentic.schemas import (
    ConceptListByLevel,
    SyllabusPipelineInput,
    SyllabusPipelineResult,
)

__all__ = [
    "generate_syllabus",
    "ConceptListByLevel",
    "SyllabusPipelineInput",
    "SyllabusPipelineResult",
]

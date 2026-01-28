"""
Syllabus generation agents - Sequential generation architecture.

New professional architecture:
- OutlinePlannerAgent: Generates just module titles (1 call, ~80 tokens)
- SequentialModuleGenerator: Generates one module at a time (6-10 calls, ~100 tokens each)
"""

from .outline_planner_agent import OutlinePlannerAgent
from .sequential_module_generator import SequentialModuleGenerator

__all__ = [
    "OutlinePlannerAgent",
    "SequentialModuleGenerator",
]


"""
Curriculum Planner Agent - Plans high-level curriculum structure.
"""

from typing import Any, List, Optional
from agents.core.base_agent import BaseAgent
from agents.core.tool import Tool
from agents.core.memory import Memory
from agents.core.simple_memory import SimpleMemory
from api.schemas.syllabus_schemas import CurriculumPlanOutput
from api.utils.logger import configure_logging

logger = configure_logging()


class PlannerAgent(BaseAgent):
    """Agent responsible for planning high-level curriculum structure."""
    
    def __init__(self, *, name: str, llm: Any, tools: List[Tool] = None, memory: Memory = None, system_prompt: str = None):
        super().__init__(name=name, llm=llm, tools=tools or [], memory=memory or SimpleMemory())
        # Store system prompt in agent metadata
        if system_prompt:
            if not self.state.metadata:
                self.state.metadata = {}
            self.state.metadata["system_prompt"] = system_prompt
            self.state.metadata["system_prompt_tokens"] = len(system_prompt) // 4
    
    def plan(self, input: str) -> dict:
        """Parse input to extract course information."""
        import json
        try:
            return json.loads(input) if isinstance(input, str) else input
        except:
            return {"course_title": input, "subject": "", "goals": None, "target_modules": 8}
    
    def execute(self, plan: dict) -> str:
        """Synchronous execution - not used, use execute_stream instead."""
        raise NotImplementedError("Use execute_stream for async execution")
    
    async def execute_stream(self, plan: dict) -> Any:
        """
        Generate curriculum plan using structured output.
        
        Returns CurriculumPlanOutput as Pydantic model.
        """
        # Get system prompt from agent metadata
        system_prompt = self.state.metadata.get("system_prompt") if self.state.metadata else None
        
        if not system_prompt:
            raise ValueError("System prompt not found in agent metadata")
        
        # Use system prompt directly - no execution prompt needed
        # Use structured output
        structured_planner = self.llm.with_structured_output(CurriculumPlanOutput)
        result = await structured_planner.ainvoke(system_prompt)
        
        # Update agent state
        if not self.state.metadata:
            self.state.metadata = {}
        self.state.metadata.update({
            "total_modules": result.total_modules,
            "core_concepts": result.core_concepts,
            "status": "completed"
        })
        
        return result


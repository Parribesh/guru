"""
Refiner Agent - Refines modules based on critic feedback.
"""

from typing import Any, List, Optional
from agents.core.base_agent import BaseAgent
from agents.core.tool import Tool
from agents.core.memory import Memory
from agents.core.simple_memory import SimpleMemory
from api.schemas.syllabus_schemas import SyllabusGenerationOutput
from api.utils.logger import configure_logging

logger = configure_logging()


class RefinerAgent(BaseAgent):
    """Agent responsible for refining modules based on validation feedback."""
    
    def __init__(self, *, name: str, llm: Any, tools: List[Tool] = None, memory: Memory = None, system_prompt: str = None):
        super().__init__(name=name, llm=llm, tools=tools or [], memory=memory or SimpleMemory())
        # Store system prompt in agent metadata
        if system_prompt:
            if not self.state.metadata:
                self.state.metadata = {}
            self.state.metadata["system_prompt"] = system_prompt
            self.state.metadata["system_prompt_tokens"] = len(system_prompt) // 4
    
    def plan(self, input: str) -> dict:
        """Parse input to extract modules, validation result, and course info."""
        import json
        try:
            return json.loads(input) if isinstance(input, str) else input
        except:
            return {"modules": [], "validation_result": None, "subject": "", "goals": None}
    
    def execute(self, plan: dict) -> str:
        """Synchronous execution - not used, use execute_stream instead."""
        raise NotImplementedError("Use execute_stream for async execution")
    
    async def execute_stream(self, plan: dict) -> Any:
        """
        Refine modules based on validation feedback.
        
        Returns SyllabusGenerationOutput as Pydantic model.
        """
        # Get system prompt from agent metadata
        system_prompt = self.state.metadata.get("system_prompt") if self.state.metadata else None
        
        if not system_prompt:
            raise ValueError("System prompt not found in agent metadata")
        
        modules = plan.get("modules", [])
        validation_result = plan.get("validation_result")
        
        if not modules or not validation_result:
            raise ValueError("Modules and validation result are required for refinement")
        
        # Extract issues for embedding
        issues_summary = "; ".join(validation_result.issues[:3]) if validation_result.issues else "No issues"
        
        # Enhance system prompt with minimal validation feedback
        enhanced_prompt = f"{system_prompt} Issues: {issues_summary[:150]}"
        
        # Use structured output
        structured_refiner = self.llm.with_structured_output(SyllabusGenerationOutput)
        result = await structured_refiner.ainvoke(enhanced_prompt)
        
        # Update agent state
        if not self.state.metadata:
            self.state.metadata = {}
        self.state.metadata.update({
            "modules_count": len(result.modules),
            "status": "completed"
        })
        
        return result


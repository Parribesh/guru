"""
Critic Agent - Validates and critiques generated modules.
"""

from typing import Any, List, Optional
from agents.core.base_agent import BaseAgent
from agents.core.tool import Tool
from agents.core.memory import Memory
from agents.core.simple_memory import SimpleMemory
from api.schemas.syllabus_schemas import SyllabusCriticOutput
from api.utils.logger import configure_logging

logger = configure_logging()


class CriticAgent(BaseAgent):
    """Agent responsible for validating and critiquing module quality."""
    
    def __init__(self, *, name: str, llm: Any, tools: List[Tool] = None, memory: Memory = None, system_prompt: str = None):
        super().__init__(name=name, llm=llm, tools=tools or [], memory=memory or SimpleMemory())
        # Store system prompt in agent metadata
        if system_prompt:
            if not self.state.metadata:
                self.state.metadata = {}
            self.state.metadata["system_prompt"] = system_prompt
            self.state.metadata["system_prompt_tokens"] = len(system_prompt) // 4
    
    def plan(self, input: str) -> dict:
        """Parse input to extract modules and course info."""
        import json
        try:
            return json.loads(input) if isinstance(input, str) else input
        except:
            return {"modules": [], "subject": "", "goals": None}
    
    def execute(self, plan: dict) -> str:
        """Synchronous execution - not used, use execute_stream instead."""
        raise NotImplementedError("Use execute_stream for async execution")
    
    async def execute_stream(self, plan: dict) -> Any:
        """
        Validate and critique modules.
        
        Returns SyllabusCriticOutput as Pydantic model.
        """
        # Get system prompt from agent metadata
        system_prompt = self.state.metadata.get("system_prompt") if self.state.metadata else None
        
        if not system_prompt:
            raise ValueError("System prompt not found in agent metadata")
        
        modules = plan.get("modules", [])
        
        if not modules:
            raise ValueError("Modules are required for validation")
        
        # Convert modules to compact format for embedding
        modules_summary = ", ".join([
            f"{m.title if hasattr(m, 'title') else m.get('title', '')} ({len(m.objectives if hasattr(m, 'objectives') else m.get('objectives', []))} objs)"
            for m in modules[:10]
        ])
        
        # Enhance system prompt with minimal modules data
        enhanced_prompt = f"{system_prompt} Modules: {modules_summary[:200]}"
        
        # Use structured output
        structured_critic = self.llm.with_structured_output(SyllabusCriticOutput)
        result = await structured_critic.ainvoke(enhanced_prompt)
        
        # Calculate quality scores
        scores = self._calculate_scores(modules, result)
        
        # Update agent state
        if not self.state.metadata:
            self.state.metadata = {}
        self.state.metadata.update({
            "approved": result.approved,
            "issues_count": len(result.issues),
            "scores": scores,
            "status": "completed"
        })
        
        return result
    
    def _calculate_scores(self, modules: List, validation_output) -> dict:
        """Calculate quality scores for different aspects."""
        scores = {}
        
        # Objective quality (average objectives per module)
        avg_objectives = sum(
            len(m.objectives if hasattr(m, 'objectives') else m.get("objectives", []))
            for m in modules
        ) / len(modules) if modules else 0
        scores["objectives_quality"] = min(avg_objectives / 5.0, 1.0)
        
        # Time distribution
        time_scores = []
        for m in modules:
            est_min = m.estimated_minutes if hasattr(m, 'estimated_minutes') else m.get("estimated_minutes", 60)
            if 30 <= est_min <= 120:
                time_scores.append(1.0)
            elif 20 <= est_min < 30 or 120 < est_min <= 150:
                time_scores.append(0.7)
            else:
                time_scores.append(0.3)
        scores["time_distribution"] = sum(time_scores) / len(time_scores) if time_scores else 0.5
        
        # Overall score
        scores["overall"] = (
            scores.get("objectives_quality", 0.5) * 0.6 +
            scores.get("time_distribution", 0.5) * 0.4
        )
        
        return scores


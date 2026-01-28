"""
Outline Planner Agent - Generates just module titles (6-10 titles in one call).

This is Phase 1 of the sequential generation architecture.
Generates a list of module titles that will be used to generate complete modules sequentially.
"""

from typing import Any, List, Optional
import time
import asyncio
from agents.core.base_agent import BaseAgent
from agents.core.tool import Tool
from agents.core.memory import Memory
from agents.core.no_memory import NoMemory
from api.schemas.syllabus_schemas import SyllabusOutlineOutput
from api.utils.logger import configure_logging

logger = configure_logging()


class OutlinePlannerAgent(BaseAgent):
    """Agent responsible for generating module outline (just titles)."""
    
    def __init__(self, *, name: str, llm: Any, tools: List[Tool] = None, memory: Memory = None, system_prompt: str = None):
        # Use NoMemory to prevent history accumulation - outline planning is a single independent call
        super().__init__(name=name, llm=llm, tools=tools or [], memory=memory or NoMemory())
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
            return {"course_title": "", "subject": "", "goals": None}
    
    def execute(self, plan: dict) -> str:
        """Synchronous execution - not used, use execute_stream instead."""
        raise NotImplementedError("Use execute_stream for async execution")
    
    async def execute_stream(self, plan: dict) -> SyllabusOutlineOutput:
        """
        Generate module outline (just titles).
        
        Returns SyllabusOutlineOutput with 6-10 module titles.
        
        Note: This bypasses _before_run/_after_run hooks to avoid history accumulation.
        Outline planning is a single independent call.
        """
        # Clear any existing history to prevent bloating
        self.state.history = []
        # Get system prompt from agent metadata
        system_prompt = self.state.metadata.get("system_prompt") if self.state.metadata else None
        
        if not system_prompt:
            raise ValueError("System prompt not found in agent metadata")
        
        # Get course info
        course_title = plan.get("course_title", "")
        subject = plan.get("subject", "")
        goals = plan.get("goals", "")
        
        # Build prompt using system prompt + course context
        prompt = f"{system_prompt}\n\nCourse: {course_title} | Subject: {subject}"
        if goals:
            prompt += f" | Goals: {goals[:50]}"
        
        # Use structured output
        structured_planner = self.llm.with_structured_output(SyllabusOutlineOutput)
        
        max_retries = 2
        retry_count = 0
        
        while retry_count <= max_retries:
            try:
                call_start = time.time()
                # Pass timeout explicitly (120 seconds for outline planning)
                result = await structured_planner.ainvoke(prompt, timeout=120.0)
                call_time = time.time() - call_start
                logger.info(f"Outline planner call {retry_count + 1} completed in {call_time:.2f}s")
                
                # Validate module count
                if len(result.module_titles) < 6:
                    retry_count += 1
                    if retry_count <= max_retries:
                        logger.warning(f"Generated only {len(result.module_titles)} titles (need 6-10), retrying...")
                        prompt = f"{system_prompt}\n\nRETRY: Generate EXACTLY 6-10 module titles. Previous attempt: {len(result.module_titles)} titles."
                        continue
                    else:
                        raise ValueError(f"Failed to generate minimum 6 titles after {max_retries} retries. Got {len(result.module_titles)} titles.")
                
                if len(result.module_titles) > 10:
                    logger.warning(f"Generated {len(result.module_titles)} titles (max 10), truncating")
                    result.module_titles = result.module_titles[:10]
                
                # Success!
                break
                
            except TimeoutError as e:
                logger.error(f"Outline planner timed out after 120s (attempt {retry_count + 1}/{max_retries + 1})")
                if retry_count < max_retries:
                    retry_count += 1
                    logger.info(f"Retrying outline planning...")
                    await asyncio.sleep(1)  # Brief delay before retry
                    continue
                # Re-raise with clearer message
                raise TimeoutError(
                    f"Outline planner timed out after {max_retries + 1} attempts. "
                    f"The model may be too slow. Consider using a faster model like 'qwen2:1.5b' or 'llama3.2:1b'"
                ) from e
            except Exception as e:
                error_str = str(e).lower()
                if "validation" in error_str or "parse" in error_str or "outputparser" in error_str:
                    retry_count += 1
                    if retry_count <= max_retries:
                        logger.warning(f"Parsing error (attempt {retry_count}/{max_retries}): {e}")
                        prompt = f"{system_prompt}\n\nRETRY: Output JSON with 'module_titles' array of 6-10 strings."
                        continue
                raise
        
        # Update agent state
        if not self.state.metadata:
            self.state.metadata = {}
        self.state.metadata.update({
            "titles_count": len(result.module_titles),
            "status": "completed"
        })
        
        return result


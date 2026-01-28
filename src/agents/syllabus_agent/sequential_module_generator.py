"""
Sequential Module Generator - Generates one module at a time.

This is Phase 2 of the sequential generation architecture.
Takes a module title and generates the complete module specification.
"""

from typing import Any, List, Optional
import time
import asyncio
from agents.core.base_agent import BaseAgent
from agents.core.tool import Tool
from agents.core.memory import Memory
from agents.core.no_memory import NoMemory
from api.schemas.syllabus_schemas import SingleModuleOutput, SyllabusModule
from api.utils.logger import configure_logging

logger = configure_logging()


class SequentialModuleGenerator(BaseAgent):
    """Agent responsible for generating a single module specification."""
    
    def __init__(self, *, name: str, llm: Any, tools: List[Tool] = None, memory: Memory = None, system_prompt: str = None):
        # Use NoMemory to prevent history accumulation - each module generation is independent
        super().__init__(name=name, llm=llm, tools=tools or [], memory=memory or NoMemory())
        # Store system prompt in agent metadata
        if system_prompt:
            if not self.state.metadata:
                self.state.metadata = {}
            self.state.metadata["system_prompt"] = system_prompt
            self.state.metadata["system_prompt_tokens"] = len(system_prompt) // 4
    
    def plan(self, input: str) -> dict:
        """Parse input to extract module generation parameters."""
        import json
        try:
            return json.loads(input) if isinstance(input, str) else input
        except:
            return {
                "module_title": "",
                "module_position": 1,
                "total_modules": 8,
                "previous_titles": []
            }
    
    def execute(self, plan: dict) -> str:
        """Synchronous execution - not used, use execute_stream instead."""
        raise NotImplementedError("Use execute_stream for async execution")
    
    async def execute_stream(self, plan: dict) -> SyllabusModule:
        """
        Generate a single complete module.
        
        Returns SyllabusModule with title, objectives, and estimated_minutes.
        
        Note: This bypasses _before_run/_after_run hooks to avoid history accumulation.
        Each module generation is independent and doesn't need memory.
        """
        # Clear any existing history to prevent bloating
        self.state.history = []
        # Get system prompt from agent metadata
        system_prompt = self.state.metadata.get("system_prompt") if self.state.metadata else None
        
        if not system_prompt:
            raise ValueError("System prompt not found in agent metadata")
        
        # Get module generation parameters
        module_title = plan.get("module_title", "")
        module_position = plan.get("module_position", 1)
        total_modules = plan.get("total_modules", 8)
        previous_titles = plan.get("previous_titles", [])
        course_title = plan.get("course_title", "")
        course_subject = plan.get("subject", "")
        course_goals = plan.get("goals", "")
        
        # Determine difficulty level based on position
        if module_position <= total_modules // 3:
            difficulty = "beginner"
        elif module_position <= (total_modules * 2) // 3:
            difficulty = "intermediate"
        else:
            difficulty = "advanced"
        
        # Build full prompt dynamically (~100-120 tokens total)
        # System prompt is minimal (~40 tokens), we add module-specific context here
        prompt_parts = [system_prompt]
        prompt_parts.append(f"Module {module_position}/{total_modules}: {module_title}")
        prompt_parts.append(f"Difficulty: {difficulty}")
        
        if course_title:
            prompt_parts.append(f"Course: {course_title} ({course_subject})")
        if course_goals:
            goals_short = course_goals[:40] + "..." if len(course_goals) > 40 else course_goals
            prompt_parts.append(f"Goals: {goals_short}")
        
        if previous_titles:
            prev_context = ", ".join(previous_titles[-2:])  # Last 2 for continuity
            prompt_parts.append(f"Previous modules: {prev_context}")
        
        prompt = "\n".join(prompt_parts)
        
        # Use structured output
        structured_generator = self.llm.with_structured_output(SingleModuleOutput)
        
        max_retries = 2
        retry_count = 0
        
        while retry_count <= max_retries:
            try:
                call_start = time.time()
                # Pass timeout explicitly (120 seconds per module)
                result = await structured_generator.ainvoke(prompt, timeout=120.0)
                call_time = time.time() - call_start
                logger.info(f"Module {module_position}/{total_modules} generation completed in {call_time:.2f}s")
                module = result.module
                
                # Validate module
                if not module.title:
                    raise ValueError("Module title is required")
                if len(module.objectives) < 3:
                    retry_count += 1
                    if retry_count <= max_retries:
                        logger.warning(f"Module has only {len(module.objectives)} objectives (need 3-6), retrying...")
                        prompt = f"{system_prompt}\n\nRETRY: Generate module '{module_title}' with 3-6 objectives."
                        continue
                    else:
                        raise ValueError(f"Failed to generate module with sufficient objectives after {max_retries} retries")
                
                if len(module.objectives) > 6:
                    logger.warning(f"Module has {len(module.objectives)} objectives (max 6), truncating")
                    module.objectives = module.objectives[:6]
                
                if module.estimated_minutes < 30 or module.estimated_minutes > 120:
                    logger.warning(f"Module time {module.estimated_minutes}min out of range (30-120), adjusting")
                    module.estimated_minutes = max(30, min(120, module.estimated_minutes))
                
                # Ensure title matches (in case LLM changed it)
                module.title = module_title
                
                # Success!
                break
                
            except TimeoutError as e:
                logger.error(f"Module {module_position}/{total_modules} ({module_title}) generation timed out after 120s (attempt {retry_count + 1}/{max_retries + 1})")
                if retry_count < max_retries:
                    retry_count += 1
                    logger.info(f"Retrying module {module_position} generation...")
                    await asyncio.sleep(1)  # Brief delay before retry
                    continue
                # Re-raise with clearer message
                raise TimeoutError(
                    f"Module {module_position}/{total_modules} ({module_title}) generation timed out after {max_retries + 1} attempts. "
                    f"The model may be too slow. Consider using a faster model like 'qwen2:1.5b' or 'llama3.2:1b'"
                ) from e
            except Exception as e:
                error_str = str(e).lower()
                if "validation" in error_str or "parse" in error_str or "outputparser" in error_str:
                    retry_count += 1
                    if retry_count <= max_retries:
                        logger.warning(f"Parsing error (attempt {retry_count}/{max_retries}): {e}")
                        prompt = f"{system_prompt}\n\nRETRY: Output JSON with 'module' object containing title, objectives (array), estimated_minutes."
                        continue
                raise
        
        # Update agent state
        if not self.state.metadata:
            self.state.metadata = {}
        self.state.metadata.update({
            "module_position": module_position,
            "status": "completed"
        })
        
        return module


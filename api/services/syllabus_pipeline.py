"""
Syllabus Generation Pipeline - Orchestrates multiple agents with monitoring.
"""

from typing import Dict, Any, List, Optional, Callable, AsyncIterator
from dataclasses import dataclass, field
from enum import Enum
from datetime import datetime
import json
import time
import asyncio
from sqlalchemy.orm import Session as DBSession

from api.models.models import Course
from api.utils.logger import configure_logging
from api.bootstrap import build_registry
from api.utils.common import normalize_modules

logger = configure_logging()


class PipelineStage(str, Enum):
    """Stages of the syllabus generation pipeline."""
    PLANNING = "planning"
    GENERATION = "generation"
    VALIDATION = "validation"
    REFINEMENT = "refinement"
    FINALIZATION = "finalization"


class AgentStatus(str, Enum):
    """Status of an agent task."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class AgentTask:
    """Represents a task being performed by an agent."""
    agent_name: str
    stage: PipelineStage
    status: AgentStatus = AgentStatus.PENDING
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    input_data: Dict[str, Any] = field(default_factory=dict)
    output_data: Optional[Any] = None
    error: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert task to dictionary for monitoring."""
        # Ensure metadata is JSON-serializable
        serializable_metadata = {}
        for key, value in self.metadata.items():
            try:
                # Try to serialize Pydantic models
                if hasattr(value, 'model_dump'):
                    serializable_metadata[key] = value.model_dump()
                elif hasattr(value, 'dict'):
                    serializable_metadata[key] = value.dict()
                elif isinstance(value, (dict, list, str, int, float, bool, type(None))):
                    # Already JSON-serializable types
                    serializable_metadata[key] = value
                else:
                    # Test if it's JSON serializable
                    json.dumps(value)
                    serializable_metadata[key] = value
            except (TypeError, ValueError) as e:
                # If not serializable, convert to string
                logger.debug(f"Converting non-serializable metadata key '{key}' to string: {e}")
                serializable_metadata[key] = str(value)
        
        result = {
            "agent_name": self.agent_name,
            "stage": self.stage.value,
            "status": self.status.value,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "error": self.error,
            "metadata": serializable_metadata,
        }
        
        # Include output_data summary in metadata if not already there
        if self.output_data and "output_summary" not in serializable_metadata:
            try:
                if hasattr(self.output_data, 'model_dump'):
                    result["metadata"]["output_summary"] = self.output_data.model_dump()
                elif hasattr(self.output_data, 'dict'):
                    result["metadata"]["output_summary"] = self.output_data.dict()
                elif isinstance(self.output_data, (dict, list)):
                    result["metadata"]["output_summary"] = self.output_data
                else:
                    result["metadata"]["output_summary"] = str(self.output_data)
            except Exception as e:
                result["metadata"]["output_summary"] = f"Error serializing output: {str(e)}"
        
        return result


class SyllabusPipeline:
    """
    Orchestrates the syllabus generation pipeline with multiple agents.
    
    Provides monitoring hooks for dashboard integration.
    """
    
    def __init__(self, db: DBSession, event_callback: Optional[Callable] = None, course: Optional[Course] = None):
        self.db = db
        self.registry = build_registry()
        self.llm = self.registry.get("chat").llm
        self.event_callback = event_callback or self._default_event_callback
        
        # Initialize sequential generation agents
        from agents.syllabus_agent import OutlinePlannerAgent, SequentialModuleGenerator
        from api.utils.prompt_builder import (
            build_outline_planner_prompt,
            build_sequential_module_prompt
        )
        
        # Build system prompts with course metadata if available
        if course:
            course_title = course.title
            course_subject = course.subject
            course_goals = course.goals
            
            # Outline planner prompt (~80 tokens)
            outline_prompt = build_outline_planner_prompt(
                course_title=course_title,
                subject=course_subject,
                goals=course_goals
            )
            
            # Sequential module generator system prompt (just course context, ~40 tokens)
            # Module-specific details will be added dynamically in execute_stream
            module_system_prompt = (
                f"Generate modules for {course_title} ({course_subject}). "
                f"Each module: title, 3-6 objectives, 30-120min."
            )
            
            self.outline_planner = OutlinePlannerAgent(
                name="outline_planner",
                llm=self.llm,
                system_prompt=outline_prompt
            )
            self.module_generator = SequentialModuleGenerator(
                name="module_generator",
                llm=self.llm,
                system_prompt=module_system_prompt
            )
            
            # Store course context for dynamic prompt building
            self.course_title = course_title
            self.course_subject = course_subject
            self.course_goals = course_goals
        else:
            self.outline_planner = None
            self.module_generator = None
            self.course_title = None
            self.course_subject = None
            self.course_goals = None
        
        # Task tracking
        self.tasks: List[AgentTask] = []
    
    def _default_event_callback(self, event_type: str, data: Dict[str, Any]):
        """Default event callback that just logs."""
        logger.info(f"Pipeline event: {event_type} - {data}")
    
    def _emit_event(self, event_type: str, data: Dict[str, Any]):
        """Emit event to callback."""
        self.event_callback(event_type, data)
    
    def _create_task(self, agent_name: str, stage: PipelineStage, input_data: Dict[str, Any]) -> AgentTask:
        """Create and track a new agent task."""
        task = AgentTask(
            agent_name=agent_name,
            stage=stage,
            status=AgentStatus.PENDING,
            input_data=input_data
        )
        self.tasks.append(task)
        return task
    
    def _update_task(self, task: AgentTask, status: AgentStatus, output_data: Any = None, error: str = None, metadata: Dict[str, Any] = None, agent_instance=None):
        """Update task status and emit event with detailed agent metadata."""
        task.status = status
        if status == AgentStatus.RUNNING and not task.started_at:
            task.started_at = datetime.utcnow()
        if status in [AgentStatus.COMPLETED, AgentStatus.FAILED]:
            task.completed_at = datetime.utcnow()
        if output_data is not None:
            task.output_data = output_data
        if error:
            task.error = error
        
        # Add detailed agent metadata FIRST (this includes the prompt)
        if agent_instance:
            agent_metadata = self._get_agent_metadata(agent_instance, task)
            task.metadata.update(agent_metadata)
        
        # Then update with any additional metadata (this won't overwrite prompt, but will add module-specific info)
        if metadata:
            # Merge metadata - preserve existing but add/update with new
            for key, value in metadata.items():
                if key in task.metadata and isinstance(task.metadata[key], dict) and isinstance(value, dict):
                    # Merge dictionaries
                    task.metadata[key] = {**task.metadata[key], **value}
                else:
                    # Overwrite or add new
                    task.metadata[key] = value
        
        # Emit monitoring event with full details
        task_dict = task.to_dict()
        # Ensure stage is included as a string value in the data
        if "stage" not in task_dict or hasattr(task_dict["stage"], "value"):
            task_dict["stage"] = task.stage.value if hasattr(task.stage, "value") else str(task.stage)
        logger.info(f"Emitting agent_task_update for {task.agent_name} at stage {task_dict.get('stage')}: status={task.status.value}, metadata_keys={list(task_dict.get('metadata', {}).keys())}, has_prompt={'prompt' in task.metadata or 'full_prompt' in task.metadata}")
        self._emit_event("agent_task_update", task_dict)
    
    def _get_agent_metadata(self, agent_instance, task: AgentTask) -> Dict[str, Any]:
        """Extract detailed metadata from agent instance."""
        metadata = {
            "agent_name": agent_instance.name,
            "agent_state": {
                "history_length": len(agent_instance.state.history) if agent_instance.state.history else 0,
                "intermediate_steps": len(agent_instance.state.intermediate_steps) if agent_instance.state.intermediate_steps else 0,
            }
        }
        
        # Add system prompt info from agent metadata (this is the only prompt we use now)
        if hasattr(agent_instance, 'state') and agent_instance.state.metadata:
            system_prompt = agent_instance.state.metadata.get("system_prompt")
            if system_prompt:
                metadata["input_preview"] = system_prompt[:1000] + "..." if len(system_prompt) > 1000 else system_prompt
                metadata["input_tokens_estimate"] = agent_instance.state.metadata.get("system_prompt_tokens", len(system_prompt) // 4)
                metadata["full_prompt"] = system_prompt  # Include full system prompt
                logger.info(f"Captured system prompt for {agent_instance.name}: {len(system_prompt)} chars")
            elif task.input_data:
                # Fallback to input_data if no system prompt
                input_str = json.dumps(task.input_data) if isinstance(task.input_data, dict) else str(task.input_data)
                metadata["input_tokens_estimate"] = len(input_str) // 4
                metadata["input_preview"] = input_str[:200] + "..." if len(input_str) > 200 else input_str
        
        # Add output info if available
        if task.output_data:
            try:
                # Try to serialize Pydantic model
                if hasattr(task.output_data, 'model_dump'):
                    output_dict = task.output_data.model_dump()
                    output_str = json.dumps(output_dict, indent=2, default=str)
                    metadata["output_tokens_estimate"] = len(output_str) // 4
                    metadata["output_preview"] = output_str[:500] + "..." if len(output_str) > 500 else output_str
                    # Add structured output data (already a dict, so JSON serializable)
                    metadata["output_data"] = output_dict
                elif hasattr(task.output_data, 'dict'):
                    output_dict = task.output_data.dict()
                    output_str = json.dumps(output_dict, indent=2, default=str)
                    metadata["output_tokens_estimate"] = len(output_str) // 4
                    metadata["output_preview"] = output_str[:500] + "..." if len(output_str) > 500 else output_str
                    metadata["output_data"] = output_dict
                elif isinstance(task.output_data, (dict, list)):
                    output_str = json.dumps(task.output_data, indent=2, default=str)
                    metadata["output_tokens_estimate"] = len(output_str) // 4
                    metadata["output_preview"] = output_str[:500] + "..." if len(output_str) > 500 else output_str
                    metadata["output_data"] = task.output_data
                else:
                    # For other types, convert to string
                    output_str = str(task.output_data)
                    metadata["output_tokens_estimate"] = len(output_str) // 4
                    metadata["output_preview"] = output_str[:500] + "..." if len(output_str) > 500 else output_str
                    metadata["output_data"] = {"raw": output_str}
            except Exception as e:
                logger.warning(f"Error serializing output_data for {agent_instance.name}: {e}", exc_info=True)
                metadata["output_preview"] = str(task.output_data)[:500]
                metadata["output_error"] = str(e)
        
        # Add agent-specific metadata from state
        if hasattr(agent_instance, 'state') and agent_instance.state.metadata:
            metadata.update(agent_instance.state.metadata)
        
        return metadata
    
    async def generate_syllabus(
        self,
        course: Course,
        max_refinement_iterations: int = 0,  # Deprecated - kept for compatibility
        skip_validation: bool = True,  # Deprecated - kept for compatibility
        skip_refinement: bool = True   # Deprecated - kept for compatibility
    ) -> List[Dict[str, Any]]:
        """
        Generate complete syllabus using sequential generation architecture.
        
        Phase 1: Outline Planning (1 LLM call, ~80 tokens)
        - Generate just module titles (6-10 titles)
        
        Phase 2: Sequential Module Generation (6-10 LLM calls, ~100 tokens each)
        - Generate one complete module at a time
        
        Phase 3: Finalization (no LLM)
        - Format, validate, persist
        
        Returns normalized module dictionaries ready for persistence.
        """
        try:
            # Extract course attributes while session is active to avoid binding errors
            course_title = course.title
            course_subject = course.subject
            course_goals = course.goals
            
            # Phase 1: Outline Planning
            self._emit_event("pipeline_stage_start", {"stage": PipelineStage.PLANNING.value})
            
            outline_task = self._create_task(
                "outline_planner",
                PipelineStage.PLANNING,
                {
                    "course_title": course_title,
                    "subject": course_subject,
                    "goals": course_goals
                }
            )
            
            self._update_task(outline_task, AgentStatus.RUNNING, agent_instance=self.outline_planner)
            logger.info("Starting outline planning (generating module titles)...")
            outline_start = time.time()
            
            outline_output = await self.outline_planner.execute_stream(outline_task.input_data)
            outline_time = time.time() - outline_start
            logger.info(f"Outline planning completed in {outline_time:.2f} seconds with {len(outline_output.module_titles)} titles")
            
            self._update_task(
                outline_task,
                AgentStatus.COMPLETED,
                output_data=outline_output,
                metadata=self.outline_planner.state.metadata,
                agent_instance=self.outline_planner
            )
            self._emit_event("pipeline_stage_complete", {
                "stage": PipelineStage.PLANNING.value,
                "result": {"titles_count": len(outline_output.module_titles)}
            })
            
            module_titles = outline_output.module_titles
            total_modules = len(module_titles)
            
            # Phase 2: Sequential Module Generation
            self._emit_event("pipeline_stage_start", {"stage": PipelineStage.GENERATION.value})
            
            generated_modules = []
            previous_titles = []
            
            for idx, module_title in enumerate(module_titles, start=1):
                module_task = self._create_task(
                    "module_generator",
                    PipelineStage.GENERATION,
                    {
                        "module_title": module_title,
                        "module_position": idx,
                        "total_modules": total_modules,
                        "previous_titles": previous_titles.copy(),
                        "course_title": course_title,
                        "subject": course_subject,
                        "goals": course_goals
                    }
                )
                
                # Add module-specific metadata BEFORE starting
                module_metadata = {
                    "current_module": module_title,
                    "module_index": idx,
                    "total_modules": total_modules,
                    "module_position": f"{idx}/{total_modules}"
                }
                
                self._update_task(
                    module_task, 
                    AgentStatus.RUNNING, 
                    agent_instance=self.module_generator,
                    metadata=module_metadata  # Include module info in metadata
                )
                
                # Emit module generation start event
                self._emit_event("module_generation_start", {
                    "module_index": idx,
                    "total_modules": total_modules,
                    "module_title": module_title
                })
                
                logger.info(f"Generating module {idx}/{total_modules}: {module_title}")
                module_start = time.time()
                
                try:
                    module = await self.module_generator.execute_stream(module_task.input_data)
                    module_time = time.time() - module_start
                    logger.info(f"Module {idx}/{total_modules} ({module_title}) completed in {module_time:.2f} seconds")
                    
                    generated_modules.append(module)
                    previous_titles.append(module_title)
                    
                    # Update metadata with execution time and module output
                    completed_metadata = {
                        **self.module_generator.state.metadata,
                        **module_metadata,  # Keep module info
                        "execution_time_seconds": round(module_time, 2),
                        "module_output": {
                            "title": module.title,
                            "objectives": module.objectives,  # Include full objectives array
                            "objectives_count": len(module.objectives),
                            "estimated_minutes": module.estimated_minutes
                        }
                    }
                    
                    self._update_task(
                        module_task,
                        AgentStatus.COMPLETED,
                        output_data=module,
                        metadata=completed_metadata,
                        agent_instance=self.module_generator
                    )
                    
                    # Emit progress update immediately with execution time
                    self._emit_event("module_generated", {
                        "module_index": idx,
                        "total_modules": total_modules,
                        "module_title": module_title,
                        "execution_time_seconds": round(module_time, 2),
                        "module": {
                            "title": module.title,
                            "objectives": module.objectives,
                            "estimated_minutes": module.estimated_minutes
                        }
                    })
                    
                    # Small delay to ensure event is processed by SSE stream
                    await asyncio.sleep(0.01)
                    
                except Exception as e:
                    logger.error(f"Failed to generate module {idx}/{total_modules} ({module_title}): {e}")
                    self._update_task(
                        module_task,
                        AgentStatus.FAILED,
                        error=str(e),
                        agent_instance=self.module_generator
                    )
                    # Emit error event for UI
                    self._emit_event("module_generation_failed", {
                        "module_index": idx,
                        "total_modules": total_modules,
                        "module_title": module_title,
                        "error": str(e)
                    })
                    # Continue with next module instead of failing entire pipeline
                    continue
            
            if len(generated_modules) < 6:
                error_msg = f"CRITICAL: Generated only {len(generated_modules)} modules (minimum 6 required)."
                logger.error(error_msg)
                raise ValueError(error_msg)
            
            self._emit_event("pipeline_stage_complete", {
                "stage": PipelineStage.GENERATION.value,
                "result": {"modules_count": len(generated_modules)}
            })
            
            # Phase 3: Finalization
            self._emit_event("pipeline_stage_start", {"stage": PipelineStage.FINALIZATION.value})
            
            # Convert to normalized dict format
            modules_dict = [
                {
                    "title": m.title,
                    "objectives": m.objectives,
                    "estimated_minutes": m.estimated_minutes
                }
                for m in generated_modules
            ]
            finalized_modules = normalize_modules(modules_dict)
            
            self._emit_event("pipeline_complete", {
                "modules_count": len(finalized_modules),
                "total_tasks": len(self.tasks)
            })
            
            # Persist modules to course syllabus_draft
            try:
                course.syllabus_draft = {"modules": finalized_modules}
                self.db.add(course)
                self.db.commit()
                logger.info(f"Persisted {len(finalized_modules)} modules to course {course.id}")
            except Exception as e:
                logger.warning(f"Failed to persist modules to course: {e}", exc_info=True)
            
            return finalized_modules
            
        except Exception as e:
            logger.error(f"Syllabus pipeline failed: {e}", exc_info=True)
            self._emit_event("pipeline_error", {"error": str(e)})
            raise
    
    def get_pipeline_status(self) -> Dict[str, Any]:
        """Get current pipeline status for dashboard."""
        return {
            "tasks": [task.to_dict() for task in self.tasks],
            "current_stage": self.tasks[-1].stage.value if self.tasks else None,
            "total_tasks": len(self.tasks),
            "completed_tasks": sum(1 for t in self.tasks if t.status == AgentStatus.COMPLETED),
            "failed_tasks": sum(1 for t in self.tasks if t.status == AgentStatus.FAILED),
        }
    
    async def generate_with_streaming(
        self,
        course: Course,
        emit_callback: Callable
    ) -> AsyncIterator[str]:
        """
        Generate syllabus with streaming events for real-time monitoring.
        
        Yields SSE events as they occur.
        emit_callback(phase, event_type, data) returns SSE string.
        """
        # Wrap emit_callback to also call our event system
        def combined_callback(event_type: str, data: Dict[str, Any]):
            self._emit_event(event_type, data)
            # Map to emit_callback format and yield
            if event_type.startswith("pipeline_stage_"):
                stage = data.get("stage", "unknown")
                if "start" in event_type:
                    return emit_callback(stage, "phase_start", {})
                elif "complete" in event_type:
                    return emit_callback(stage, "result", data.get("result", {}))
            elif event_type == "agent_task_update":
                return emit_callback(data.get("stage", "unknown"), "task_update", data)
            elif event_type == "pipeline_complete":
                return emit_callback("finalize", "done", data)
            elif event_type == "pipeline_error":
                return emit_callback("error", "error", data)
            return ""
        
        # Temporarily replace event callback
        original_callback = self.event_callback
        events_to_yield = []
        
        def collect_and_emit(event_type: str, data: Dict[str, Any]):
            """Collect events and prepare for yielding."""
            event_str = combined_callback(event_type, data)
            if event_str:
                events_to_yield.append(event_str)
        
        self.event_callback = collect_and_emit
        
        # Start generation
        import asyncio
        generation_task = asyncio.create_task(self.generate_syllabus(course))
        
        # Yield events as they come
        while not generation_task.done() or events_to_yield:
            if events_to_yield:
                yield events_to_yield.pop(0)
            else:
                await asyncio.sleep(0.05)
        
        # Get result
        modules = await generation_task
        
        # Restore original callback
        self.event_callback = original_callback
        
        # Return modules (but this is an async iterator, so we need a different approach)
        # Actually, we should just yield the final event and let caller get modules from status
        yield emit_callback("finalize", "done", {"modules_count": len(modules)})


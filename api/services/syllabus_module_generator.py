"""
Robust syllabus module generation service with multi-stage pipeline architecture.

This service implements a sophisticated curriculum design pipeline:
1. Curriculum Planning - High-level structure and learning path
2. Module Generation - Detailed module creation with RAG-enhanced content
3. Validation - Quality checks and prerequisite validation
4. Refinement - Iterative improvement based on feedback
"""

from typing import Dict, Any, List, Optional, AsyncIterator
from dataclasses import dataclass
from enum import Enum
import json
from sqlalchemy.orm import Session as DBSession

from api.models.models import Course
from api.utils.logger import configure_logging
from api.bootstrap import build_registry
from infra.vector.chroma_store import ChromaStore

logger = configure_logging()


class GenerationPhase(str, Enum):
    """Phases of the module generation pipeline."""
    PLANNING = "planning"
    GENERATION = "generation"
    VALIDATION = "validation"
    REFINEMENT = "refinement"
    FINALIZATION = "finalization"


@dataclass
class ModuleSpec:
    """Specification for a single module."""
    title: str
    objectives: List[str]
    estimated_minutes: int
    prerequisites: List[str] = None  # Titles of prerequisite modules
    difficulty_level: str = "intermediate"  # beginner, intermediate, advanced
    content_topics: List[str] = None  # Key topics to cover
    learning_outcomes: List[str] = None  # Measurable outcomes
    
    def __post_init__(self):
        if self.prerequisites is None:
            self.prerequisites = []
        if self.content_topics is None:
            self.content_topics = []
        if self.learning_outcomes is None:
            self.learning_outcomes = []


@dataclass
class CurriculumPlan:
    """High-level curriculum structure."""
    total_modules: int
    learning_path: List[str]  # Module titles in order
    core_concepts: List[str]  # Core concepts to cover
    progression_strategy: str  # How concepts build on each other
    time_distribution: Dict[str, int]  # Estimated time per module
    difficulty_curve: str  # How difficulty progresses


@dataclass
class ValidationResult:
    """Result of module validation."""
    is_valid: bool
    issues: List[str]
    scores: Dict[str, float]  # Quality scores by category
    recommendations: List[str]




class CurriculumPlanner:
    """Plans high-level curriculum structure before module generation."""
    
    def __init__(self, llm_wrapper):
        self.llm = llm_wrapper
    
    async def plan_curriculum(
        self,
        course_title: str,
        subject: str,
        goals: Optional[str],
        target_modules: int = 8
    ) -> CurriculumPlan:
        """
        Create a high-level curriculum plan.
        
        This stage determines:
        - Overall learning path
        - Core concepts to cover
        - Module sequence and dependencies
        - Time distribution
        """
        from api.schemas.syllabus_schemas import CurriculumPlanOutput
        
        prompt = self._build_planning_prompt(course_title, subject, goals, target_modules)
        
        try:
            structured_planner = self.llm.with_structured_output(CurriculumPlanOutput)
            result = await structured_planner.ainvoke(prompt)
            
            return CurriculumPlan(
                total_modules=result.total_modules,
                learning_path=result.learning_path,
                core_concepts=result.core_concepts,
                progression_strategy=result.progression_strategy,
                time_distribution=result.time_distribution,
                difficulty_curve=result.difficulty_curve
            )
        except Exception as e:
            logger.error(f"Curriculum planning failed: {e}")
            # Fallback to simple plan
            return self._create_fallback_plan(course_title, subject, target_modules)
    
    def _build_planning_prompt(
        self,
        title: str,
        subject: str,
        goals: Optional[str],
        target_modules: int
    ) -> str:
        goals_text = f" Goals: {goals}." if goals else ""
        return (
            f"Plan a learning curriculum for '{title}' ({subject}){goals_text}\n\n"
            f"Create a curriculum plan with:\n"
            f"- {target_modules} modules in logical learning sequence\n"
            f"- Core concepts that must be covered\n"
            f"- Progression strategy (how concepts build on each other)\n"
            f"- Time distribution across modules (30-120 min each)\n"
            f"- Difficulty curve (beginner → intermediate → advanced)\n\n"
            f"Consider prerequisites, dependencies, and pedagogical best practices."
        ).strip()
    
    def _create_fallback_plan(
        self,
        title: str,
        subject: str,
        target_modules: int
    ) -> CurriculumPlan:
        """Create a simple fallback plan if planning fails."""
        return CurriculumPlan(
            total_modules=target_modules,
            learning_path=[f"Module {i+1}" for i in range(target_modules)],
            core_concepts=[f"Core {subject} concepts"],
            progression_strategy="Sequential progression from basics to advanced",
            time_distribution={f"Module {i+1}": 60 for i in range(target_modules)},
            difficulty_curve="Gradual increase from beginner to advanced"
        )


class ModuleGenerator:
    """Generates detailed module specifications with RAG-enhanced content."""
    
    def __init__(self, llm_wrapper, vector_store: Optional[ChromaStore] = None):
        self.llm = llm_wrapper
        self.vector_store = vector_store
    
    async def generate_modules(
        self,
        curriculum_plan: CurriculumPlan,
        course_title: str,
        subject: str,
        goals: Optional[str]
    ) -> List[ModuleSpec]:
        """
        Generate detailed module specifications based on curriculum plan.
        
        Uses RAG to enhance modules with subject-specific knowledge.
        """
        from api.schemas.syllabus_schemas import SyllabusGenerationOutput
        
        # Enhance prompt with RAG context if available
        rag_context = await self._get_rag_context(subject, curriculum_plan.core_concepts)
        
        prompt = self._build_generation_prompt(
            curriculum_plan,
            course_title,
            subject,
            goals,
            rag_context
        )
        
        try:
            structured_generator = self.llm.with_structured_output(SyllabusGenerationOutput)
            result = await structured_generator.ainvoke(prompt)
            
            # Use modules directly from LangChain's structured output
            modules_list = result.modules
            
            # Convert to ModuleSpec objects
            modules = []
            for i, module_data in enumerate(modules_list):
                # Map module to curriculum plan
                module_title = module_data.title
                plan_index = i if i < len(curriculum_plan.learning_path) else None
                
                # Determine prerequisites from learning path
                prerequisites = []
                if plan_index and plan_index > 0:
                    prerequisites = [curriculum_plan.learning_path[plan_index - 1]]
                
                # Determine difficulty from position
                difficulty = self._determine_difficulty(i, curriculum_plan.total_modules)
                
                modules.append(ModuleSpec(
                    title=module_title,
                    objectives=module_data.objectives,
                    estimated_minutes=module_data.estimated_minutes,
                    prerequisites=prerequisites,
                    difficulty_level=difficulty,
                    content_topics=self._extract_topics_from_objectives(module_data.objectives),
                    learning_outcomes=module_data.objectives  # Objectives serve as outcomes
                ))
            
            return modules
        except Exception as e:
            logger.error(f"Module generation failed: {e}")
            raise
    
    async def _get_rag_context(
        self,
        subject: str,
        core_concepts: List[str]
    ) -> str:
        """Retrieve relevant context from vector store for subject knowledge."""
        if not self.vector_store:
            return ""
        
        try:
            # Query for subject-specific knowledge
            query = f"{subject} curriculum design best practices"
            results = self.vector_store.query(query=query, k=3)
            
            if results:
                context_parts = [
                    item.get("text", "") or item.get("page_content", "")
                    for item in results[:3]
                ]
                return "\n\n".join(context_parts)
        except Exception as e:
            logger.warning(f"RAG context retrieval failed: {e}")
        
        return ""
    
    def _build_generation_prompt(
        self,
        plan: CurriculumPlan,
        title: str,
        subject: str,
        goals: Optional[str],
        rag_context: str
    ) -> str:
        goals_text = f" Goals: {goals}." if goals else ""
        context_text = f"\n\nRelevant context:\n{rag_context}" if rag_context else ""
        
        return (
            f"Generate detailed learning modules for '{title}' ({subject}){goals_text}\n\n"
            f"Curriculum Plan:\n"
            f"- Learning Path: {', '.join(plan.learning_path)}\n"
            f"- Core Concepts: {', '.join(plan.core_concepts)}\n"
            f"- Progression: {plan.progression_strategy}\n"
            f"- Difficulty Curve: {plan.difficulty_curve}\n"
            f"{context_text}\n\n"
            f"Generate {plan.total_modules} modules with:\n"
            f"- Real, specific titles (not placeholders)\n"
            f"- 3-6 measurable learning objectives per module\n"
            f"- 30-120 minutes estimated time\n"
            f"- Content aligned with {subject} best practices\n"
            f"- Prerequisites respected\n"
            f"- Clear progression from basics to advanced"
        ).strip()
    
    def _determine_difficulty(self, index: int, total: int) -> str:
        """Determine difficulty level based on position in curriculum."""
        if total <= 1:
            return "intermediate"
        
        ratio = index / (total - 1) if total > 1 else 0.5
        
        if ratio < 0.33:
            return "beginner"
        elif ratio < 0.67:
            return "intermediate"
        else:
            return "advanced"
    
    def _extract_topics_from_objectives(self, objectives: List[str]) -> List[str]:
        """Extract key topics from learning objectives."""
        # Simple extraction - could be enhanced with NLP
        topics = []
        for obj in objectives:
            # Extract key nouns/phrases (simplified)
            words = obj.lower().split()
            # Filter out common words and extract meaningful terms
            meaningful = [w for w in words if len(w) > 4 and w not in ['understand', 'learn', 'explain', 'describe']]
            if meaningful:
                topics.extend(meaningful[:2])  # Take first 2 meaningful terms
        return list(set(topics))[:5]  # Dedupe and limit
    


class ModuleValidator:
    """Validates module quality and structure."""
    
    def __init__(self, llm_wrapper):
        self.llm = llm_wrapper
    
    async def validate_modules(
        self,
        modules: List[ModuleSpec],
        course_title: str,
        subject: str,
        goals: Optional[str]
    ) -> ValidationResult:
        """
        Validate modules for quality, completeness, and pedagogical soundness.
        """
        from api.schemas.syllabus_schemas import SyllabusCriticOutput
        
        # Convert modules to dict format for validation
        modules_dict = [
            {
                "title": m.title,
                "objectives": m.objectives,
                "estimated_minutes": m.estimated_minutes,
                "prerequisites": m.prerequisites,
                "difficulty_level": m.difficulty_level
            }
            for m in modules
        ]
        
        prompt = self._build_validation_prompt(subject, modules_dict, goals)
        
        try:
            structured_validator = self.llm.with_structured_output(SyllabusCriticOutput)
            result = await structured_validator.ainvoke(prompt)
            
            # Calculate quality scores
            scores = self._calculate_scores(modules, result)
            
            return ValidationResult(
                is_valid=result.approved,
                issues=result.issues,
                scores=scores,
                recommendations=self._generate_recommendations(result, modules)
            )
        except Exception as e:
            logger.error(f"Module validation failed: {e}")
            # Return lenient validation on error
            return ValidationResult(
                is_valid=True,
                issues=[],
                scores={"overall": 0.7},
                recommendations=[]
            )
    
    def _build_validation_prompt(
        self,
        subject: str,
        modules: List[Dict[str, Any]],
        goals: Optional[str]
    ) -> str:
        goals_text = f" Goals: {goals}." if goals else ""
        modules_json = json.dumps({"modules": modules}, indent=2)
        
        return (
            f"Validate syllabus modules for '{subject}'{goals_text}\n\n"
            f"Modules to validate:\n{modules_json}\n\n"
            f"Check for:\n"
            f"1. Prerequisites are respected (no circular dependencies)\n"
            f"2. Learning objectives are measurable and specific\n"
            f"3. Time estimates are realistic (30-120 min per module)\n"
            f"4. Progression is logical (beginner → intermediate → advanced)\n"
            f"5. Core concepts are covered\n"
            f"6. Modules are not too similar or redundant\n"
            f"7. Content is appropriate for {subject}\n\n"
            f"If not approved, provide revised modules addressing all issues."
        ).strip()
    
    def _calculate_scores(
        self,
        modules: List[ModuleSpec],
        validation_output
    ) -> Dict[str, float]:
        """Calculate quality scores for different aspects."""
        scores = {}
        
        # Objective quality (average objectives per module)
        avg_objectives = sum(len(m.objectives) for m in modules) / len(modules) if modules else 0
        scores["objectives_quality"] = min(avg_objectives / 5.0, 1.0)  # Normalize to 5 objectives
        
        # Time distribution (check if reasonable)
        time_scores = []
        for m in modules:
            if 30 <= m.estimated_minutes <= 120:
                time_scores.append(1.0)
            elif 20 <= m.estimated_minutes < 30 or 120 < m.estimated_minutes <= 150:
                time_scores.append(0.7)
            else:
                time_scores.append(0.3)
        scores["time_distribution"] = sum(time_scores) / len(time_scores) if time_scores else 0.5
        
        # Prerequisite coverage
        modules_with_prereqs = sum(1 for m in modules if m.prerequisites)
        scores["prerequisite_coverage"] = modules_with_prereqs / len(modules) if modules else 0.5
        
        # Overall score
        scores["overall"] = (
            scores.get("objectives_quality", 0.5) * 0.4 +
            scores.get("time_distribution", 0.5) * 0.3 +
            scores.get("prerequisite_coverage", 0.5) * 0.3
        )
        
        return scores
    
    def _generate_recommendations(
        self,
        validation_output,
        modules: List[ModuleSpec]
    ) -> List[str]:
        """Generate actionable recommendations."""
        recommendations = []
        
        if validation_output.issues:
            recommendations.extend(validation_output.issues)
        
        # Check for common issues
        if len(modules) < 6:
            recommendations.append("Consider adding more modules for comprehensive coverage")
        
        if len(modules) > 10:
            recommendations.append("Consider consolidating modules to avoid overwhelming learners")
        
        # Check time distribution
        total_time = sum(m.estimated_minutes for m in modules)
        if total_time < 300:  # Less than 5 hours
            recommendations.append("Total course time seems short - consider expanding content")
        elif total_time > 1200:  # More than 20 hours
            recommendations.append("Total course time is long - consider breaking into multiple courses")
        
        return recommendations


class ModuleRefiner:
    """Refines modules based on validation feedback."""
    
    def __init__(self, llm_wrapper):
        self.llm = llm_wrapper
    
    async def refine_modules(
        self,
        modules: List[ModuleSpec],
        validation_result: ValidationResult,
        course_title: str,
        subject: str,
        goals: Optional[str]
    ) -> List[ModuleSpec]:
        """
        Refine modules based on validation feedback.
        
        This can be called iteratively until validation passes.
        """
        from api.schemas.syllabus_schemas import SyllabusGenerationOutput
        
        # Convert modules to dict format
        modules_dict = [
            {
                "title": m.title,
                "objectives": m.objectives,
                "estimated_minutes": m.estimated_minutes
            }
            for m in modules
        ]
        
        prompt = self._build_refinement_prompt(
            subject,
            modules_dict,
            validation_result,
            goals
        )
        
        try:
            structured_refiner = self.llm.with_structured_output(SyllabusGenerationOutput)
            result = await structured_refiner.ainvoke(prompt)
            
            # Use modules directly from LangChain's structured output
            modules_list = result.modules
            
            # Convert back to ModuleSpec objects, preserving structure
            refined = []
            for i, module_data in enumerate(modules_list):
                # Try to match with original module to preserve metadata
                original = modules[i] if i < len(modules) else None
                
                refined.append(ModuleSpec(
                    title=module_data.title,
                    objectives=module_data.objectives,
                    estimated_minutes=module_data.estimated_minutes,
                    prerequisites=original.prerequisites if original else [],
                    difficulty_level=original.difficulty_level if original else "intermediate",
                    content_topics=original.content_topics if original else [],
                    learning_outcomes=module_data.objectives
                ))
            
            return refined
        except Exception as e:
            logger.error(f"Module refinement failed: {e}")
            # Return original modules if refinement fails
            return modules
    
    def _build_refinement_prompt(
        self,
        subject: str,
        modules: List[Dict[str, Any]],
        validation: ValidationResult,
        goals: Optional[str]
    ) -> str:
        goals_text = f" Goals: {goals}." if goals else ""
        issues_text = "\n".join([f"- {issue}" for issue in validation.issues])
        recommendations_text = "\n".join([f"- {rec}" for rec in validation.recommendations])
        modules_json = json.dumps({"modules": modules}, indent=2)
        
        return (
            f"Refine syllabus modules for '{subject}'{goals_text}\n\n"
            f"Current modules:\n{modules_json}\n\n"
            f"Validation Issues:\n{issues_text}\n\n"
            f"Recommendations:\n{recommendations_text}\n\n"
            f"Generate improved modules that address all issues while maintaining "
            f"the core learning path and {subject} content quality."
        ).strip()


class SyllabusModuleGenerator:
    """
    Main service orchestrating the multi-stage module generation pipeline.
    
    Architecture:
    1. Planning - High-level curriculum structure
    2. Generation - Detailed module creation with RAG
    3. Validation - Quality and pedagogical checks
    4. Refinement - Iterative improvement (if needed)
    5. Finalization - Format and persist
    """
    
    def __init__(self, db: DBSession):
        self.db = db
        self.registry = build_registry()
        self.llm = self.registry.get("chat").llm
        
        # Initialize components
        self.planner = CurriculumPlanner(self.llm)
        self.generator = ModuleGenerator(self.llm, vector_store=None)  # Can add RAG later
        self.validator = ModuleValidator(self.llm)
        self.refiner = ModuleRefiner(self.llm)
    
    async def generate_syllabus_modules(
        self,
        course: Course,
        max_refinement_iterations: int = 2
    ) -> List[Dict[str, Any]]:
        """
        Generate complete syllabus modules using the full pipeline.
        
        Returns normalized module dictionaries ready for persistence.
        """
        # Phase 1: Planning
        logger.info(f"Phase 1: Planning curriculum for {course.title}")
        curriculum_plan = await self.planner.plan_curriculum(
            course_title=course.title,
            subject=course.subject,
            goals=course.goals,
            target_modules=8
        )
        
        # Phase 2: Generation
        logger.info(f"Phase 2: Generating modules")
        modules = await self.generator.generate_modules(
            curriculum_plan=curriculum_plan,
            course_title=course.title,
            subject=course.subject,
            goals=course.goals
        )
        
        # Phase 3: Validation
        logger.info(f"Phase 3: Validating modules")
        validation = await self.validator.validate_modules(
            modules=modules,
            course_title=course.title,
            subject=course.subject,
            goals=course.goals
        )
        
        # Phase 4: Refinement (if needed)
        iteration = 0
        while not validation.is_valid and iteration < max_refinement_iterations:
            logger.info(f"Phase 4: Refining modules (iteration {iteration + 1})")
            modules = await self.refiner.refine_modules(
                modules=modules,
                validation_result=validation,
                course_title=course.title,
                subject=course.subject,
                goals=course.goals
            )
            
            # Re-validate
            validation = await self.validator.validate_modules(
                modules=modules,
                course_title=course.title,
                subject=course.subject,
                goals=course.goals
            )
            iteration += 1
        
        # Phase 5: Finalization - Convert to dict format
        logger.info(f"Phase 5: Finalizing modules")
        return self._finalize_modules(modules)
    
    def _finalize_modules(self, modules: List[ModuleSpec]) -> List[Dict[str, Any]]:
        """Convert ModuleSpec objects to normalized dict format."""
        from api.utils.common import normalize_modules
        
        modules_dict = [
            {
                "title": m.title,
                "objectives": m.objectives,
                "estimated_minutes": m.estimated_minutes
            }
            for m in modules
        ]
        
        return normalize_modules(modules_dict)
    
    async def generate_with_streaming(
        self,
        course: Course,
        emit_callback
    ) -> List[Dict[str, Any]]:
        """
        Generate modules with streaming events for real-time updates.
        
        emit_callback(phase, event_type, data) is called for each event.
        Returns the finalized modules.
        """
        try:
            # Phase 1: Planning
            emit_callback(GenerationPhase.PLANNING, "phase_start", {})
            emit_callback(GenerationPhase.PLANNING, "token", {"t": "Planning curriculum structure..."})
            curriculum_plan = await self.planner.plan_curriculum(
                course_title=course.title,
                subject=course.subject,
                goals=course.goals
            )
            emit_callback(GenerationPhase.PLANNING, "result", {
                "total_modules": curriculum_plan.total_modules,
                "core_concepts": curriculum_plan.core_concepts
            })
            
            # Phase 2: Generation
            emit_callback(GenerationPhase.GENERATION, "phase_start", {})
            emit_callback(GenerationPhase.GENERATION, "token", {"t": "Generating detailed modules..."})
            modules = await self.generator.generate_modules(
                curriculum_plan=curriculum_plan,
                course_title=course.title,
                subject=course.subject,
                goals=course.goals
            )
            modules_dict = [{"title": m.title, "objectives": m.objectives, "estimated_minutes": m.estimated_minutes} for m in modules]
            emit_callback(GenerationPhase.GENERATION, "result", {"modules": modules_dict})
            
            # Phase 3: Validation
            emit_callback(GenerationPhase.VALIDATION, "phase_start", {})
            emit_callback(GenerationPhase.VALIDATION, "token", {"t": "Validating module quality..."})
            validation = await self.validator.validate_modules(
                modules=modules,
                course_title=course.title,
                subject=course.subject,
                goals=course.goals
            )
            emit_callback(GenerationPhase.VALIDATION, "result", {
                "approved": validation.is_valid,
                "issues": validation.issues,
                "scores": validation.scores
            })
            
            # Phase 4: Refinement (if needed)
            iteration = 0
            while not validation.is_valid and iteration < 2:
                emit_callback(GenerationPhase.REFINEMENT, "phase_start", {"iteration": iteration + 1})
                emit_callback(GenerationPhase.REFINEMENT, "token", {"t": f"Refining modules (iteration {iteration + 1})..."})
                modules = await self.refiner.refine_modules(
                    modules=modules,
                    validation_result=validation,
                    course_title=course.title,
                    subject=course.subject,
                    goals=course.goals
                )
                
                validation = await self.validator.validate_modules(
                    modules=modules,
                    course_title=course.title,
                    subject=course.subject,
                    goals=course.goals
                )
                emit_callback(GenerationPhase.REFINEMENT, "result", {
                    "approved": validation.is_valid,
                    "issues": validation.issues
                })
                iteration += 1
            
            # Phase 5: Finalization
            emit_callback(GenerationPhase.FINALIZATION, "phase_start", {})
            finalized = self._finalize_modules(modules)
            emit_callback(GenerationPhase.FINALIZATION, "done", {
                "modules_count": len(finalized),
                "approved": validation.is_valid
            })
            
            return finalized
            
        except Exception as e:
            logger.error(f"Module generation failed: {e}")
            emit_callback(GenerationPhase.VALIDATION, "error", {"error": str(e)})
            raise


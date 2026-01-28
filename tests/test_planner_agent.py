"""
Test suite for Planner Agent - Curriculum Planning Performance
"""

import pytest
import asyncio
from typing import Any
from agents.syllabus_agent.planner_agent import PlannerAgent
from infra.llm.ollama import OllamaLLM
from api.schemas.syllabus_schemas import CurriculumPlanOutput
from api.utils.prompt_builder import build_planner_system_prompt


class TestPlannerAgent:
    """Test suite for Planner Agent functionality and performance."""
    
    @pytest.fixture
    def llm(self):
        """Create Ollama LLM instance for testing."""
        return OllamaLLM(model="llama3.2")
    
    @pytest.fixture
    def planner_agent(self, llm):
        """Create PlannerAgent instance with system prompt."""
        system_prompt = build_planner_system_prompt(
            course_title="Machine Learning Fundamentals",
            subject="Machine Learning",
            goals="Learn core ML concepts and practical applications",
            compressed=True
        )
        return PlannerAgent(
            name="test_planner",
            llm=llm,
            system_prompt=system_prompt
        )
    
    @pytest.mark.asyncio
    async def test_planner_basic_functionality(self, planner_agent):
        """Test that planner agent can generate a curriculum plan with metrics."""
        import time
        import json
        
        plan_input = {
            "course_title": "Machine Learning Fundamentals",
            "subject": "Machine Learning",
            "goals": "Learn core ML concepts and practical applications",
            "target_modules": 8
        }
        
        # Measure execution time
        start_time = time.time()
        result = await planner_agent.execute_stream(plan_input)
        execution_time = time.time() - start_time
        
        # Verify result is CurriculumPlanOutput
        assert isinstance(result, CurriculumPlanOutput)
        
        # Verify required fields
        assert hasattr(result, 'total_modules')
        assert hasattr(result, 'learning_path')
        assert hasattr(result, 'core_concepts')
        assert hasattr(result, 'progression_strategy')
        assert hasattr(result, 'time_distribution')
        assert hasattr(result, 'difficulty_curve')
        
        # Verify data types
        assert isinstance(result.total_modules, int)
        assert isinstance(result.learning_path, list)
        assert isinstance(result.core_concepts, list)
        assert isinstance(result.progression_strategy, str)
        assert isinstance(result.time_distribution, dict)
        assert isinstance(result.difficulty_curve, str)
        
        # Display metrics and output
        print("\n" + "="*80)
        print("PLANNER AGENT METRICS & OUTPUT")
        print("="*80)
        
        # System prompt metrics
        system_prompt = planner_agent.state.metadata.get("system_prompt", "")
        system_prompt_tokens = planner_agent.state.metadata.get("system_prompt_tokens", 0)
        
        print(f"\n📊 EXECUTION METRICS:")
        print(f"  Execution Time: {execution_time:.2f} seconds")
        print(f"  System Prompt Tokens: {system_prompt_tokens}")
        print(f"  System Prompt Length: {len(system_prompt)} characters")
        
        print(f"\n📋 CURRICULUM PLAN OUTPUT:")
        print(f"  Total Modules: {result.total_modules}")
        print(f"  Learning Path Length: {len(result.learning_path)}")
        print(f"  Core Concepts Count: {len(result.core_concepts)}")
        print(f"  Time Distribution Entries: {len(result.time_distribution)}")
        
        print(f"\n📚 LEARNING PATH:")
        for i, module_title in enumerate(result.learning_path, 1):
            time_min = result.time_distribution.get(module_title, "N/A")
            print(f"  {i}. {module_title} ({time_min} min)")
        
        print(f"\n💡 CORE CONCEPTS:")
        for i, concept in enumerate(result.core_concepts, 1):
            print(f"  {i}. {concept}")
        
        print(f"\n📈 PROGRESSION STRATEGY:")
        print(f"  {result.progression_strategy}")
        
        print(f"\n🎯 DIFFICULTY CURVE:")
        print(f"  {result.difficulty_curve}")
        
        print(f"\n⏱️  TIME DISTRIBUTION:")
        for module, minutes in result.time_distribution.items():
            print(f"  • {module}: {minutes} minutes")
        
        print(f"\n📦 FULL OUTPUT (JSON):")
        print(json.dumps(result.model_dump(), indent=2))
        
        print("\n" + "="*80)
        
        # Performance assertions
        assert execution_time < 60, f"Execution took too long: {execution_time:.2f}s"
        assert system_prompt_tokens <= 150, f"System prompt tokens exceed limit: {system_prompt_tokens}"
    
    @pytest.mark.asyncio
    async def test_planner_module_count(self, planner_agent):
        """Test that planner generates appropriate number of modules."""
        plan_input = {
            "course_title": "Deep Learning",
            "subject": "Deep Learning",
            "goals": "Master neural networks and deep learning",
            "target_modules": 8
        }
        
        result = await planner_agent.execute_stream(plan_input)
        
        # Verify module count is within expected range
        assert 6 <= result.total_modules <= 10, f"Expected 6-10 modules, got {result.total_modules}"
        
        # Verify learning path has matching number of modules
        assert len(result.learning_path) == result.total_modules, \
            f"Learning path length ({len(result.learning_path)}) should match total_modules ({result.total_modules})"
    
    @pytest.mark.asyncio
    async def test_planner_learning_path_quality(self, planner_agent):
        """Test that learning path is logical and non-empty."""
        plan_input = {
            "course_title": "Python Programming",
            "subject": "Programming",
            "goals": "Learn Python from basics to advanced",
            "target_modules": 8
        }
        
        result = await planner_agent.execute_stream(plan_input)
        
        # Verify learning path is not empty
        assert len(result.learning_path) > 0, "Learning path should not be empty"
        
        # Verify all items in learning path are strings
        assert all(isinstance(item, str) for item in result.learning_path), \
            "All learning path items should be strings"
        
        # Verify learning path items are not empty
        assert all(len(item.strip()) > 0 for item in result.learning_path), \
            "Learning path items should not be empty strings"
    
    @pytest.mark.asyncio
    async def test_planner_core_concepts(self, planner_agent):
        """Test that core concepts are identified."""
        plan_input = {
            "course_title": "Data Science",
            "subject": "Data Science",
            "goals": "Learn data analysis and visualization",
            "target_modules": 8
        }
        
        result = await planner_agent.execute_stream(plan_input)
        
        # Verify core concepts exist
        assert len(result.core_concepts) > 0, "Should identify at least one core concept"
        
        # Verify all concepts are strings
        assert all(isinstance(concept, str) for concept in result.core_concepts), \
            "All core concepts should be strings"
        
        # Verify concepts are not empty
        assert all(len(concept.strip()) > 0 for concept in result.core_concepts), \
            "Core concepts should not be empty strings"
    
    @pytest.mark.asyncio
    async def test_planner_progression_strategy(self, planner_agent):
        """Test that progression strategy is provided."""
        plan_input = {
            "course_title": "Web Development",
            "subject": "Web Development",
            "goals": "Build full-stack web applications",
            "target_modules": 8
        }
        
        result = await planner_agent.execute_stream(plan_input)
        
        # Verify progression strategy exists
        assert len(result.progression_strategy) > 0, "Progression strategy should not be empty"
        assert isinstance(result.progression_strategy, str), \
            "Progression strategy should be a string"
        
        # Verify it's meaningful (not just whitespace)
        assert len(result.progression_strategy.strip()) > 10, \
            "Progression strategy should be meaningful (at least 10 characters)"
    
    @pytest.mark.asyncio
    async def test_planner_time_distribution(self, planner_agent):
        """Test that time distribution is provided."""
        plan_input = {
            "course_title": "React Development",
            "subject": "Frontend Development",
            "goals": "Master React and modern frontend",
            "target_modules": 8
        }
        
        result = await planner_agent.execute_stream(plan_input)
        
        # Verify time distribution exists
        assert isinstance(result.time_distribution, dict), \
            "Time distribution should be a dictionary"
        
        # Verify time distribution has entries
        assert len(result.time_distribution) > 0, \
            "Time distribution should have at least one entry"
        
        # Verify time values are reasonable (30-120 minutes)
        for module_title, minutes in result.time_distribution.items():
            assert isinstance(minutes, (int, float)), \
                f"Time for {module_title} should be a number"
            assert 30 <= minutes <= 120, \
                f"Time for {module_title} should be between 30-120 minutes, got {minutes}"
    
    @pytest.mark.asyncio
    async def test_planner_difficulty_curve(self, planner_agent):
        """Test that difficulty curve is provided."""
        plan_input = {
            "course_title": "Advanced Algorithms",
            "subject": "Computer Science",
            "goals": "Master advanced algorithmic techniques",
            "target_modules": 8
        }
        
        result = await planner_agent.execute_stream(plan_input)
        
        # Verify difficulty curve exists
        assert len(result.difficulty_curve) > 0, "Difficulty curve should not be empty"
        assert isinstance(result.difficulty_curve, str), \
            "Difficulty curve should be a string"
        
        # Verify it mentions progression (beginner/intermediate/advanced)
        difficulty_lower = result.difficulty_curve.lower()
        has_progression = any(term in difficulty_lower for term in 
                            ['beginner', 'intermediate', 'advanced', 'basic', 'fundamental'])
        assert has_progression, \
            f"Difficulty curve should mention progression, got: {result.difficulty_curve}"
    
    @pytest.mark.asyncio
    async def test_planner_agent_state_metadata(self, planner_agent):
        """Test that agent state metadata is updated correctly."""
        plan_input = {
            "course_title": "Test Course",
            "subject": "Testing",
            "goals": "Test the planner",
            "target_modules": 8
        }
        
        # Verify system prompt is stored
        assert planner_agent.state.metadata is not None
        assert "system_prompt" in planner_agent.state.metadata
        assert "system_prompt_tokens" in planner_agent.state.metadata
        
        # Execute planner
        result = await planner_agent.execute_stream(plan_input)
        
        # Verify metadata is updated after execution
        assert "total_modules" in planner_agent.state.metadata
        assert "core_concepts" in planner_agent.state.metadata
        assert "status" in planner_agent.state.metadata
        assert planner_agent.state.metadata["status"] == "completed"
        assert planner_agent.state.metadata["total_modules"] == result.total_modules
    
    @pytest.mark.asyncio
    async def test_planner_without_system_prompt(self, llm):
        """Test that planner raises error without system prompt."""
        planner = PlannerAgent(
            name="test_planner_no_prompt",
            llm=llm,
            system_prompt=None
        )
        
        plan_input = {
            "course_title": "Test Course",
            "subject": "Testing",
            "goals": "Test",
            "target_modules": 8
        }
        
        with pytest.raises(ValueError, match="System prompt not found"):
            await planner.execute_stream(plan_input)
    
    @pytest.mark.asyncio
    async def test_planner_performance(self, planner_agent):
        """Test planner performance metrics."""
        import time
        
        plan_input = {
            "course_title": "Performance Test Course",
            "subject": "Performance Testing",
            "goals": "Test performance",
            "target_modules": 8
        }
        
        start_time = time.time()
        result = await planner_agent.execute_stream(plan_input)
        end_time = time.time()
        
        execution_time = end_time - start_time
        
        # Verify result is valid
        assert isinstance(result, CurriculumPlanOutput)
        
        # Log performance metrics
        print(f"\nPlanner Performance Metrics:")
        print(f"  Execution Time: {execution_time:.2f} seconds")
        print(f"  Total Modules: {result.total_modules}")
        print(f"  Learning Path Length: {len(result.learning_path)}")
        print(f"  Core Concepts: {len(result.core_concepts)}")
        print(f"  System Prompt Tokens: {planner_agent.state.metadata.get('system_prompt_tokens', 'N/A')}")
        
        # Performance assertions (adjust thresholds as needed)
        assert execution_time < 60, f"Execution took too long: {execution_time:.2f}s"
        assert result.total_modules >= 6, "Should generate at least 6 modules"


if __name__ == "__main__":
    # Run tests directly
    pytest.main([__file__, "-v", "-s"])


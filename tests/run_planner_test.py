#!/usr/bin/env python3
"""
Standalone test script for Planner Agent - can run without pytest.
"""

import asyncio
import sys
import os
from pathlib import Path

# Add project root and src to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))
sys.path.insert(0, str(project_root / "src"))

from agents.syllabus_agent.planner_agent import PlannerAgent
from infra.llm.ollama import OllamaLLM
from api.schemas.syllabus_schemas import CurriculumPlanOutput
from api.utils.prompt_builder import build_planner_system_prompt


async def test_planner_basic():
    """Test basic planner functionality."""
    print("\n" + "="*80)
    print("TEST 1: Basic Functionality")
    print("="*80)
    
    llm = OllamaLLM(model="llama3.2")
    system_prompt = build_planner_system_prompt(
        course_title="Machine Learning Fundamentals",
        subject="Machine Learning",
        goals="Learn core ML concepts and practical applications",
        compressed=True
    )
    
    planner = PlannerAgent(
        name="test_planner",
        llm=llm,
        system_prompt=system_prompt
    )
    
    plan_input = {
        "course_title": "Machine Learning Fundamentals",
        "subject": "Machine Learning",
        "goals": "Learn core ML concepts and practical applications",
        "target_modules": 8
    }
    
    print(f"System Prompt ({planner.state.metadata.get('system_prompt_tokens', 'N/A')} tokens):")
    print(f"  {system_prompt[:200]}...")
    print("\nExecuting planner...")
    
    import time
    start_time = time.time()
    result = await planner.execute_stream(plan_input)
    execution_time = time.time() - start_time
    
    print(f"\n✅ Execution completed in {execution_time:.2f} seconds")
    print(f"\nResults:")
    print(f"  Total Modules: {result.total_modules}")
    print(f"  Learning Path: {result.learning_path}")
    print(f"  Core Concepts: {result.core_concepts}")
    print(f"  Progression Strategy: {result.progression_strategy[:100]}...")
    print(f"  Difficulty Curve: {result.difficulty_curve}")
    print(f"  Time Distribution: {result.time_distribution}")
    
    # Validations
    assert isinstance(result, CurriculumPlanOutput), "Result should be CurriculumPlanOutput"
    assert 6 <= result.total_modules <= 10, f"Expected 6-10 modules, got {result.total_modules}"
    assert len(result.learning_path) == result.total_modules, "Learning path length should match total_modules"
    assert len(result.core_concepts) > 0, "Should have core concepts"
    assert len(result.progression_strategy) > 0, "Should have progression strategy"
    assert len(result.difficulty_curve) > 0, "Should have difficulty curve"
    assert len(result.time_distribution) > 0, "Should have time distribution"
    
    print("\n✅ All validations passed!")


async def test_planner_different_subjects():
    """Test planner with different subjects."""
    print("\n" + "="*80)
    print("TEST 2: Different Subjects")
    print("="*80)
    
    llm = OllamaLLM(model="llama3.2")
    
    test_cases = [
        {
            "course_title": "Python Programming",
            "subject": "Programming",
            "goals": "Learn Python from basics to advanced",
        },
        {
            "course_title": "Deep Learning",
            "subject": "Deep Learning",
            "goals": "Master neural networks and deep learning",
        },
        {
            "course_title": "Web Development",
            "subject": "Web Development",
            "goals": "Build full-stack web applications",
        },
    ]
    
    for i, test_case in enumerate(test_cases, 1):
        print(f"\n--- Test Case {i}: {test_case['course_title']} ---")
        
        system_prompt = build_planner_system_prompt(
            course_title=test_case["course_title"],
            subject=test_case["subject"],
            goals=test_case["goals"],
            compressed=True
        )
        
        planner = PlannerAgent(
            name=f"test_planner_{i}",
            llm=llm,
            system_prompt=system_prompt
        )
        
        plan_input = {
            "course_title": test_case["course_title"],
            "subject": test_case["subject"],
            "goals": test_case["goals"],
            "target_modules": 8
        }
        
        import time
        start_time = time.time()
        result = await planner.execute_stream(plan_input)
        execution_time = time.time() - start_time
        
        print(f"  ✅ Completed in {execution_time:.2f}s")
        print(f"  Modules: {result.total_modules}")
        print(f"  Learning Path: {', '.join(result.learning_path[:3])}...")
        print(f"  Core Concepts: {', '.join(result.core_concepts[:3])}...")
        
        # Validate
        assert 6 <= result.total_modules <= 10, f"Expected 6-10 modules, got {result.total_modules}"
        assert len(result.learning_path) == result.total_modules, "Learning path length mismatch"


async def test_planner_performance():
    """Test planner performance metrics."""
    print("\n" + "="*80)
    print("TEST 3: Performance Metrics")
    print("="*80)
    
    llm = OllamaLLM(model="llama3.2")
    system_prompt = build_planner_system_prompt(
        course_title="Performance Test Course",
        subject="Performance Testing",
        goals="Test performance",
        compressed=True
    )
    
    planner = PlannerAgent(
        name="performance_planner",
        llm=llm,
        system_prompt=system_prompt
    )
    
    plan_input = {
        "course_title": "Performance Test Course",
        "subject": "Performance Testing",
        "goals": "Test performance",
        "target_modules": 8
    }
    
    import time
    times = []
    
    print("Running 3 iterations for performance measurement...")
    for i in range(3):
        start_time = time.time()
        result = await planner.execute_stream(plan_input)
        execution_time = time.time() - start_time
        times.append(execution_time)
        print(f"  Iteration {i+1}: {execution_time:.2f}s")
    
    avg_time = sum(times) / len(times)
    min_time = min(times)
    max_time = max(times)
    
    print(f"\nPerformance Summary:")
    print(f"  Min: {min_time:.2f}s")
    print(f"  Avg: {avg_time:.2f}s")
    print(f"  Max: {max_time:.2f}s")
    print(f"  System Prompt Tokens: {planner.state.metadata.get('system_prompt_tokens', 'N/A')}")
    
    if avg_time < 60:
        print(f"  ✅ Performance acceptable (< 60s)")
    else:
        print(f"  ⚠️  Performance slow (> 60s)")


async def test_planner_metadata():
    """Test that agent metadata is properly stored."""
    print("\n" + "="*80)
    print("TEST 4: Agent Metadata")
    print("="*80)
    
    llm = OllamaLLM(model="llama3.2")
    system_prompt = build_planner_system_prompt(
        course_title="Metadata Test",
        subject="Testing",
        goals="Test metadata storage",
        compressed=True
    )
    
    planner = PlannerAgent(
        name="metadata_planner",
        llm=llm,
        system_prompt=system_prompt
    )
    
    # Check initial metadata
    print("Initial metadata:")
    print(f"  System Prompt: {'present' if 'system_prompt' in planner.state.metadata else 'missing'}")
    print(f"  System Prompt Tokens: {planner.state.metadata.get('system_prompt_tokens', 'N/A')}")
    
    plan_input = {
        "course_title": "Metadata Test",
        "subject": "Testing",
        "goals": "Test metadata storage",
        "target_modules": 8
    }
    
    result = await planner.execute_stream(plan_input)
    
    # Check post-execution metadata
    print("\nPost-execution metadata:")
    print(f"  Total Modules: {planner.state.metadata.get('total_modules', 'N/A')}")
    print(f"  Core Concepts: {len(planner.state.metadata.get('core_concepts', []))} concepts")
    print(f"  Status: {planner.state.metadata.get('status', 'N/A')}")
    
    assert "system_prompt" in planner.state.metadata, "System prompt should be in metadata"
    assert "system_prompt_tokens" in planner.state.metadata, "System prompt tokens should be in metadata"
    assert "total_modules" in planner.state.metadata, "Total modules should be in metadata after execution"
    assert planner.state.metadata["status"] == "completed", "Status should be completed"
    
    print("\n✅ All metadata checks passed!")


async def main():
    """Run all tests."""
    print("\n" + "="*80)
    print("PLANNER AGENT TEST SUITE")
    print("="*80)
    
    try:
        await test_planner_basic()
        await test_planner_different_subjects()
        await test_planner_performance()
        await test_planner_metadata()
        
        print("\n" + "="*80)
        print("✅ ALL TESTS PASSED!")
        print("="*80)
        
    except Exception as e:
        print(f"\n❌ TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())


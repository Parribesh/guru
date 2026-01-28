"""
Full Syllabus Generation Integration Test
Tests the complete pipeline: Planning -> Generation -> Validation -> Refinement -> Finalization
"""

import pytest
import asyncio
import time
import json
from unittest.mock import MagicMock
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from api.models.models import Base, Course
from api.services.syllabus_pipeline import SyllabusPipeline, PipelineStage


class TestSyllabusIntegration:
    """Integration test for full syllabus generation pipeline."""
    
    @pytest.fixture
    def db_session(self):
        """Create an in-memory database session for testing."""
        # Create in-memory SQLite database
        engine = create_engine("sqlite:///:memory:", echo=False)
        Base.metadata.create_all(engine)
        SessionLocal = sessionmaker(bind=engine)
        session = SessionLocal()
        
        yield session
        
        session.close()
    
    @pytest.fixture
    def test_course(self, db_session):
        """Create a test course object."""
        course = Course(
            id="test-course-123",
            user_id=1,
            title="Machine Learning Fundamentals",
            subject="Machine Learning",
            goals="Learn core ML concepts, supervised and unsupervised learning, neural networks, and practical applications",
            syllabus_draft=None
        )
        db_session.add(course)
        db_session.commit()
        db_session.refresh(course)
        return course
    
    @pytest.fixture
    def pipeline(self, db_session, test_course):
        """Create syllabus pipeline with event tracking."""
        events = []
        
        def event_callback(event_type: str, data: dict):
            """Track all pipeline events."""
            events.append({
                "type": event_type,
                "stage": data.get("stage", "unknown"),
                "data": data
            })
        
        pipeline = SyllabusPipeline(
            db=db_session,
            event_callback=event_callback,
            course=test_course
        )
        pipeline._events = events  # Store events for inspection
        return pipeline
    
    @pytest.mark.asyncio
    async def test_full_syllabus_generation(self, pipeline, test_course):
        """Test complete syllabus generation pipeline with metrics."""
        print("\n" + "="*80)
        print("FULL SYLLABUS GENERATION INTEGRATION TEST")
        print("="*80)
        
        # Track execution time
        start_time = time.time()
        
        # Execute full pipeline with timeout
        print("\n🚀 Starting syllabus generation pipeline...")
        print(f"   Course: {test_course.title}")
        print(f"   Subject: {test_course.subject}")
        print(f"   Goals: {test_course.goals}")
        print(f"   ⏱️  Timeout: 300 seconds (5 minutes)")
        
        try:
            # Add timeout to prevent hanging and progress tracking
            print("   📍 Stage: Planning...")
            stage_start = time.time()
            
            modules = await asyncio.wait_for(
                pipeline.generate_syllabus(test_course, max_refinement_iterations=1),  # Reduce iterations for speed
                timeout=300.0  # 5 minute timeout
            )
            execution_time = time.time() - start_time
            print(f"   ✅ Pipeline completed in {execution_time:.2f} seconds")
            
            # Display results
            self._display_results(pipeline, modules, execution_time, test_course)
            
            # Assertions
            assert modules is not None, "Modules should not be None"
            assert len(modules) > 0, "Should generate at least one module"
            
            # Validate module count - with helpful error message
            if len(modules) < 6:
                print(f"\n⚠️  WARNING: Generated only {len(modules)} modules (expected 6-10)")
                print(f"   This indicates the LLM didn't follow the module count requirement.")
                print(f"   The pipeline should have retried, but if this persists, check the prompt.")
            assert 6 <= len(modules) <= 10, (
                f"Should generate 6-10 modules, got {len(modules)}. "
                f"This error should be prevented by pipeline validation/retry logic. "
                f"Check generator prompt and retry mechanism."
            )
            
            # Verify module structure
            for module in modules:
                assert "title" in module, "Module should have title"
                assert "objectives" in module, "Module should have objectives"
                assert "estimated_minutes" in module, "Module should have estimated_minutes"
                assert isinstance(module["objectives"], list), "Objectives should be a list"
                assert len(module["objectives"]) >= 3, f"Module should have at least 3 objectives, got {len(module.get('objectives', []))}"
                assert 30 <= module["estimated_minutes"] <= 120, f"Time should be 30-120 min, got {module['estimated_minutes']}"
            
            print("\n✅ All assertions passed!")
            
        except asyncio.TimeoutError:
            execution_time = time.time() - start_time
            print(f"\n❌ Pipeline timed out after {execution_time:.2f} seconds")
            print(f"   The pipeline exceeded the 5-minute timeout limit")
            raise
        except Exception as e:
            execution_time = time.time() - start_time
            print(f"\n❌ Pipeline failed after {execution_time:.2f} seconds")
            print(f"   Error: {str(e)}")
            import traceback
            traceback.print_exc()
            raise
    
    def _display_results(self, pipeline, modules, execution_time, course):
        """Display comprehensive results and metrics."""
        print("\n" + "="*80)
        print("PIPELINE EXECUTION METRICS")
        print("="*80)
        
        # Overall metrics
        print(f"\n⏱️  TOTAL EXECUTION TIME: {execution_time:.2f} seconds")
        print(f"📚 FINAL MODULES COUNT: {len(modules)}")
        
        # Pipeline events summary
        if hasattr(pipeline, '_events') and pipeline._events:
            print(f"\n📊 PIPELINE EVENTS: {len(pipeline._events)} events captured")
            
            # Group events by stage
            stages = {}
            for event in pipeline._events:
                stage = event.get("stage", "unknown")
                if stage not in stages:
                    stages[stage] = []
                stages[stage].append(event["type"])
            
            print(f"\n📈 STAGES EXECUTED:")
            for stage, event_types in stages.items():
                print(f"   • {stage}: {len(event_types)} events")
                unique_types = set(event_types)
                for event_type in unique_types:
                    count = event_types.count(event_type)
                    print(f"     - {event_type}: {count}")
        
        # Agent metrics (if available in pipeline)
        if hasattr(pipeline, 'planner') and pipeline.planner:
            planner_metadata = pipeline.planner.state.metadata
            print(f"\n🤖 PLANNER AGENT METRICS:")
            print(f"   System Prompt Tokens: {planner_metadata.get('system_prompt_tokens', 'N/A')}")
            print(f"   Status: {planner_metadata.get('status', 'N/A')}")
            if 'total_modules' in planner_metadata:
                print(f"   Planned Modules: {planner_metadata['total_modules']}")
        
        if hasattr(pipeline, 'generator') and pipeline.generator:
            generator_metadata = pipeline.generator.state.metadata
            print(f"\n📝 GENERATOR AGENT METRICS:")
            print(f"   System Prompt Tokens: {generator_metadata.get('system_prompt_tokens', 'N/A')}")
            print(f"   Status: {generator_metadata.get('status', 'N/A')}")
            if 'modules_count' in generator_metadata:
                print(f"   Generated Modules: {generator_metadata['modules_count']}")
        
        if hasattr(pipeline, 'critic') and pipeline.critic:
            critic_metadata = pipeline.critic.state.metadata
            print(f"\n🔍 CRITIC AGENT METRICS:")
            print(f"   System Prompt Tokens: {critic_metadata.get('system_prompt_tokens', 'N/A')}")
            print(f"   Status: {critic_metadata.get('status', 'N/A')}")
            if 'approved' in critic_metadata:
                print(f"   Approved: {critic_metadata['approved']}")
            if 'issues_count' in critic_metadata:
                print(f"   Issues Found: {critic_metadata['issues_count']}")
        
        # Display final syllabus
        print("\n" + "="*80)
        print("FINAL SYLLABUS OUTPUT")
        print("="*80)
        
        total_time = sum(m.get("estimated_minutes", 0) for m in modules)
        total_objectives = sum(len(m.get("objectives", [])) for m in modules)
        
        print(f"\n📚 Course: {course.title}")
        print(f"   Subject: {course.subject}")
        print(f"   Total Modules: {len(modules)}")
        print(f"   Total Time: {total_time} minutes ({total_time/60:.1f} hours)")
        print(f"   Total Learning Objectives: {total_objectives}")
        
        print(f"\n📖 MODULE BREAKDOWN:")
        for i, module in enumerate(modules, 1):
            print(f"\n   Module {i}: {module['title']}")
            print(f"   ⏱️  Time: {module['estimated_minutes']} minutes")
            print(f"   🎯 Objectives ({len(module['objectives'])}):")
            for j, objective in enumerate(module['objectives'], 1):
                print(f"      {j}. {objective}")
        
        print(f"\n📄 FULL JSON OUTPUT:")
        print(json.dumps(modules, indent=2))
        
        print("\n" + "="*80)
    
    @pytest.mark.asyncio
    async def test_pipeline_stages_execution(self, pipeline, test_course):
        """Verify that all pipeline stages execute in order."""
        print("\n" + "="*80)
        print("PIPELINE STAGES EXECUTION TEST")
        print("="*80)
        
        expected_stages = [
            PipelineStage.PLANNING,
            PipelineStage.GENERATION,
            PipelineStage.VALIDATION,
        ]
        
        modules = await pipeline.generate_syllabus(test_course)
        
        # Check that events were captured for each stage
        if hasattr(pipeline, '_events') and pipeline._events:
            stages_seen = set()
            for event in pipeline._events:
                stage = event.get("stage")
                if stage:
                    stages_seen.add(stage)
            
            print(f"\n📊 Stages executed: {sorted(stages_seen)}")
            print(f"📊 Expected stages: {[s.value for s in expected_stages]}")
            
            # Verify planning stage executed
            assert PipelineStage.PLANNING.value in stages_seen, "Planning stage should execute"
            assert PipelineStage.GENERATION.value in stages_seen, "Generation stage should execute"
            assert PipelineStage.VALIDATION.value in stages_seen, "Validation stage should execute"
        
        assert modules is not None, "Should generate modules"
        print("\n✅ All expected stages executed!")
    
    @pytest.mark.asyncio
    async def test_pipeline_performance(self, pipeline, test_course):
        """Measure pipeline performance metrics."""
        print("\n" + "="*80)
        print("PIPELINE PERFORMANCE TEST")
        print("="*80)
        
        times = []
        
        print("\nRunning 2 iterations for performance measurement (reduced for speed)...")
        for i in range(2):  # Reduced from 3 to 2
            # Create new pipeline for each iteration
            new_pipeline = SyllabusPipeline(
                db=pipeline.db,
                course=test_course
            )
            
            start_time = time.time()
            try:
                modules = await asyncio.wait_for(
                    new_pipeline.generate_syllabus(test_course, max_refinement_iterations=1),  # Reduce iterations
                    timeout=300.0
                )
                execution_time = time.time() - start_time
                times.append(execution_time)
                print(f"  Iteration {i+1}: {execution_time:.2f}s ({len(modules)} modules)")
            except asyncio.TimeoutError:
                execution_time = time.time() - start_time
                print(f"  Iteration {i+1}: TIMEOUT after {execution_time:.2f}s")
                raise
        
        if times:
            avg_time = sum(times) / len(times)
            min_time = min(times)
            max_time = max(times)
            
            print(f"\n📊 PERFORMANCE SUMMARY:")
            print(f"   Min: {min_time:.2f}s")
            print(f"   Avg: {avg_time:.2f}s")
            print(f"   Max: {max_time:.2f}s")
            
            # Performance assertions
            assert avg_time < 300, f"Average execution time should be < 300s, got {avg_time:.2f}s"
            print("\n✅ Performance acceptable!")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])


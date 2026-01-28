"""
Full Sequential Syllabus Generation Integration Test
Tests the new sequential generation architecture:
1. Outline Planning (1 LLM call, ~80 tokens)
2. Sequential Module Generation (6-10 LLM calls, ~100 tokens each)
3. Finalization (format, validate, persist)
"""

import pytest
import asyncio
import time
import json
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from api.models.models import Base, Course
from api.services.syllabus_pipeline import SyllabusPipeline, PipelineStage, AgentStatus


class TestSequentialSyllabusIntegration:
    """Integration test for sequential syllabus generation pipeline."""
    
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
            id="test-course-sequential-123",
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
    async def test_sequential_syllabus_generation(self, pipeline, test_course):
        """Test complete sequential syllabus generation with detailed metrics."""
        print("\n" + "="*80)
        print("SEQUENTIAL SYLLABUS GENERATION INTEGRATION TEST")
        print("="*80)
        
        # Track execution time
        total_start = time.time()
        phase_times = {}
        
        print("\n🚀 Starting sequential syllabus generation...")
        print(f"   Course: {test_course.title}")
        print(f"   Subject: {test_course.subject}")
        print(f"   Goals: {test_course.goals}")
        print(f"   ⏱️  Timeout: 600 seconds (10 minutes)")
        print(f"   Architecture: Outline Planning → Sequential Module Generation → Finalization")
        
        try:
            # Execute full pipeline with timeout
            modules = await asyncio.wait_for(
                pipeline.generate_syllabus(test_course),
                timeout=600.0  # 10 minute timeout (more time for sequential calls)
            )
            
            total_time = time.time() - total_start
            
            # Calculate phase times from tasks
            for task in pipeline.tasks:
                if task.started_at and task.completed_at:
                    duration = (task.completed_at - task.started_at).total_seconds()
                    phase_times[task.agent_name] = duration
            
            print(f"\n✅ Pipeline completed in {total_time:.2f} seconds")
            
            # Display detailed results
            self._display_results(pipeline, modules, total_time, phase_times, test_course)
            
            # Assertions
            assert len(modules) >= 6, f"Should generate at least 6 modules, got {len(modules)}"
            assert len(modules) <= 10, f"Should generate at most 10 modules, got {len(modules)}"
            
            # Validate module structure
            for idx, module in enumerate(modules, 1):
                assert "title" in module, f"Module {idx} missing title"
                assert "objectives" in module, f"Module {idx} missing objectives"
                assert "estimated_minutes" in module, f"Module {idx} missing estimated_minutes"
                assert isinstance(module["objectives"], list), f"Module {idx} objectives should be a list"
                assert len(module["objectives"]) >= 3, f"Module {idx} should have at least 3 objectives"
                assert len(module["objectives"]) <= 6, f"Module {idx} should have at most 6 objectives"
                assert 30 <= module["estimated_minutes"] <= 120, f"Module {idx} time should be 30-120 minutes"
            
            # Verify persistence
            db_session = pipeline.db
            db_session.refresh(test_course)
            assert test_course.syllabus_draft is not None, "Syllabus should be persisted"
            assert "modules" in test_course.syllabus_draft, "Syllabus draft should contain modules"
            assert len(test_course.syllabus_draft["modules"]) == len(modules), "Persisted modules count should match"
            
            print("\n✅ All assertions passed!")
            
        except asyncio.TimeoutError:
            print(f"\n❌ Pipeline timed out after 600 seconds")
            print(f"   Tasks completed: {sum(1 for t in pipeline.tasks if t.status == AgentStatus.COMPLETED)}/{len(pipeline.tasks)}")
            raise
        except Exception as e:
            print(f"\n❌ Pipeline failed: {e}")
            print(f"   Tasks: {len(pipeline.tasks)}")
            for task in pipeline.tasks:
                print(f"   - {task.agent_name}: {task.status.value}")
                if task.error:
                    print(f"     Error: {task.error}")
            raise
    
    def _display_results(self, pipeline, modules, total_time, phase_times, course):
        """Display detailed test results."""
        print("\n" + "="*80)
        print("RESULTS")
        print("="*80)
        
        # Overall metrics
        print(f"\n📊 Overall Metrics:")
        print(f"   Total Time: {total_time:.2f} seconds ({total_time/60:.2f} minutes)")
        print(f"   Modules Generated: {len(modules)}")
        print(f"   Total Tasks: {len(pipeline.tasks)}")
        print(f"   Completed Tasks: {sum(1 for t in pipeline.tasks if t.status == AgentStatus.COMPLETED)}")
        print(f"   Failed Tasks: {sum(1 for t in pipeline.tasks if t.status == AgentStatus.FAILED)}")
        
        # Phase breakdown
        print(f"\n⏱️  Phase Breakdown:")
        outline_tasks = [t for t in pipeline.tasks if t.agent_name == "outline_planner"]
        module_tasks = [t for t in pipeline.tasks if t.agent_name == "module_generator"]
        
        if outline_tasks:
            outline_time = phase_times.get("outline_planner", 0)
            print(f"   Outline Planning: {outline_time:.2f}s (1 call)")
        
        if module_tasks:
            total_module_time = sum(phase_times.get("module_generator", 0) for _ in module_tasks)
            avg_module_time = total_module_time / len(module_tasks) if module_tasks else 0
            print(f"   Module Generation: {total_module_time:.2f}s ({len(module_tasks)} calls, avg {avg_module_time:.2f}s per module)")
        
        # Task details
        print(f"\n📋 Task Details:")
        for task in pipeline.tasks:
            duration = ""
            if task.started_at and task.completed_at:
                duration = f" ({(task.completed_at - task.started_at).total_seconds():.2f}s)"
            print(f"   - {task.agent_name}: {task.status.value}{duration}")
            if task.error:
                print(f"     Error: {task.error}")
        
        # Module details
        print(f"\n📚 Generated Modules:")
        for idx, module in enumerate(modules, 1):
            print(f"   {idx}. {module['title']}")
            print(f"      Objectives: {len(module['objectives'])}")
            print(f"      Time: {module['estimated_minutes']} minutes")
            if idx <= 3:  # Show first 3 objectives for first 3 modules
                for obj_idx, obj in enumerate(module['objectives'][:3], 1):
                    print(f"        {obj_idx}. {obj[:60]}...")
        
        # Token estimates
        print(f"\n💬 Token Usage (Estimates):")
        total_input_tokens = 0
        total_output_tokens = 0
        
        for task in pipeline.tasks:
            if task.metadata:
                input_tokens = task.metadata.get("input_tokens_estimate", 0)
                output_tokens = task.metadata.get("output_tokens_estimate", 0)
                total_input_tokens += input_tokens
                total_output_tokens += output_tokens
        
        print(f"   Total Input Tokens: ~{total_input_tokens}")
        print(f"   Total Output Tokens: ~{total_output_tokens}")
        print(f"   Total Tokens: ~{total_input_tokens + total_output_tokens}")
        
        # Performance analysis
        print(f"\n⚡ Performance Analysis:")
        if len(modules) > 0:
            time_per_module = total_time / len(modules)
            print(f"   Time per Module: {time_per_module:.2f}s")
        if module_tasks:
            print(f"   Average Module Generation Time: {avg_module_time:.2f}s")
        
        print("\n" + "="*80)
    
    @pytest.mark.asyncio
    async def test_pipeline_stages_execution(self, pipeline, test_course):
        """Test that all pipeline stages execute in correct order."""
        print("\n🧪 Testing pipeline stage execution order...")
        
        stages_seen = []
        
        def track_stage(event_type: str, data: dict):
            if event_type == "pipeline_stage_start":
                stage = data.get("stage")
                if stage:
                    stages_seen.append(stage)
        
        pipeline.event_callback = track_stage
        
        modules = await asyncio.wait_for(
            pipeline.generate_syllabus(test_course),
            timeout=600.0
        )
        
        # Verify stages executed
        assert PipelineStage.PLANNING.value in stages_seen, "Planning stage should execute"
        assert PipelineStage.GENERATION.value in stages_seen, "Generation stage should execute"
        assert PipelineStage.FINALIZATION.value in stages_seen, "Finalization stage should execute"
        
        # Verify order
        planning_idx = stages_seen.index(PipelineStage.PLANNING.value)
        generation_idx = stages_seen.index(PipelineStage.GENERATION.value)
        finalization_idx = stages_seen.index(PipelineStage.FINALIZATION.value)
        
        assert planning_idx < generation_idx, "Planning should come before generation"
        assert generation_idx < finalization_idx, "Generation should come before finalization"
        
        print("✅ Pipeline stages executed in correct order")
    
    @pytest.mark.asyncio
    async def test_individual_module_generation(self, pipeline, test_course):
        """Test that individual modules are generated correctly."""
        print("\n🧪 Testing individual module generation quality...")
        
        modules = await asyncio.wait_for(
            pipeline.generate_syllabus(test_course),
            timeout=600.0
        )
        
        # Check each module has unique title
        titles = [m["title"] for m in modules]
        assert len(titles) == len(set(titles)), "All module titles should be unique"
        
        # Check objectives quality
        for module in modules:
            objectives = module["objectives"]
            # Objectives should be non-empty strings
            assert all(isinstance(obj, str) and len(obj) > 0 for obj in objectives), \
                f"Module '{module['title']}' has invalid objectives"
            
            # Objectives should be reasonably descriptive (at least 10 chars)
            assert all(len(obj) >= 10 for obj in objectives), \
                f"Module '{module['title']}' has objectives that are too short"
        
        print("✅ Individual module generation quality verified")


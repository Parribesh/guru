"""
Quick Syllabus Generation Test - Minimal test to verify pipeline works
"""

import pytest
import asyncio
import time
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from api.models.models import Base, Course
from api.services.syllabus_pipeline import SyllabusPipeline


class TestSyllabusQuick:
    """Quick test to verify pipeline works without full output."""
    
    @pytest.fixture
    def db_session(self):
        """Create an in-memory database session."""
        engine = create_engine("sqlite:///:memory:", echo=False)
        Base.metadata.create_all(engine)
        SessionLocal = sessionmaker(bind=engine)
        session = SessionLocal()
        yield session
        session.close()
    
    @pytest.fixture
    def test_course(self, db_session):
        """Create a minimal test course."""
        course = Course(
            id="quick-test-123",
            user_id=1,
            title="Python Basics",
            subject="Programming",
            goals="Learn Python fundamentals",
            syllabus_draft=None
        )
        db_session.add(course)
        db_session.commit()
        db_session.refresh(course)
        return course
    
    @pytest.mark.asyncio
    async def test_pipeline_quick(self, db_session, test_course):
        """Quick test - just verify pipeline runs without hanging."""
        print("\n🚀 Quick Pipeline Test")
        print(f"   Course: {test_course.title}")
        
        # Test Ollama connection first
        print("   🔍 Testing Ollama connection...")
        try:
            import httpx
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get("http://localhost:11434/api/tags")
                if response.status_code == 200:
                    print("   ✅ Ollama is running")
                else:
                    print(f"   ⚠️  Ollama returned status {response.status_code}")
        except Exception as e:
            print(f"   ❌ Ollama connection failed: {e}")
            pytest.skip("Ollama not available")
        
        pipeline = SyllabusPipeline(db=db_session, course=test_course)
        
        start_time = time.time()
        stage_times = {}
        
        try:
            # Add progress tracking
            async def track_progress():
                last_stage = None
                while True:
                    await asyncio.sleep(5)
                    elapsed = time.time() - start_time
                    if hasattr(pipeline, '_events') and pipeline._events:
                        latest_event = pipeline._events[-1] if pipeline._events else None
                        current_stage = latest_event.get('stage', 'unknown') if latest_event else 'unknown'
                        if current_stage != last_stage:
                            print(f"   📍 Stage: {current_stage} (elapsed: {elapsed:.1f}s)")
                            last_stage = current_stage
                    else:
                        print(f"   ⏳ Waiting... (elapsed: {elapsed:.1f}s)")
            
            # Start progress tracker
            progress_task = asyncio.create_task(track_progress())
            
            modules = await asyncio.wait_for(
                pipeline.generate_syllabus(test_course),  # Uses optimized 2-phase pipeline by default
                timeout=180.0  # 3 minute timeout (increased)
            )
            
            progress_task.cancel()
            elapsed = time.time() - start_time
            
            print(f"\n✅ Pipeline completed in {elapsed:.2f}s")
            print(f"   Generated {len(modules)} modules")
            
            assert len(modules) > 0, "Should generate modules"
            assert len(modules) <= 10, f"Should generate <= 10 modules, got {len(modules)}"
            
            # Persist modules to course
            print("\n💾 Persisting modules to database...")
            test_course.syllabus_draft = {"modules": modules}
            db_session.add(test_course)
            db_session.commit()
            db_session.refresh(test_course)
            
            # Verify persistence
            assert test_course.syllabus_draft is not None, "syllabus_draft should be set"
            assert "modules" in test_course.syllabus_draft, "syllabus_draft should contain modules"
            assert len(test_course.syllabus_draft["modules"]) == len(modules), "Persisted modules count should match"
            print(f"   ✅ Modules persisted successfully ({len(test_course.syllabus_draft['modules'])} modules)")
            
            # Display persisted modules
            print("\n📚 Persisted Modules:")
            for i, module in enumerate(test_course.syllabus_draft["modules"], 1):
                print(f"   {i}. {module.get('title', 'N/A')} ({module.get('estimated_minutes', 0)} min)")
            
        except asyncio.TimeoutError:
            elapsed = time.time() - start_time
            print(f"\n❌ Pipeline timed out after {elapsed:.2f}s")
            if hasattr(pipeline, '_events') and pipeline._events:
                print(f"   Last event: {pipeline._events[-1] if pipeline._events else 'None'}")
            raise
        except Exception as e:
            elapsed = time.time() - start_time
            print(f"\n❌ Pipeline failed after {elapsed:.2f}s: {e}")
            import traceback
            traceback.print_exc()
            raise


# Planner Agent Test Suite

## Overview
This test suite validates the Planner Agent's functionality and performance. The Planner Agent is responsible for generating high-level curriculum plans with:
- Module count (6-10 modules)
- Learning path (ordered module titles)
- Core concepts
- Progression strategy
- Time distribution (30-120 min per module)
- Difficulty curve (beginner → advanced)

## Test Files

### 1. `test_planner_agent.py` (pytest-based)
Comprehensive pytest test suite with the following test cases:

- **test_planner_basic_functionality**: Validates basic curriculum plan generation
- **test_planner_module_count**: Ensures 6-10 modules are generated
- **test_planner_learning_path_quality**: Validates learning path structure
- **test_planner_core_concepts**: Ensures core concepts are identified
- **test_planner_progression_strategy**: Validates progression strategy
- **test_planner_time_distribution**: Checks time distribution (30-120 min)
- **test_planner_difficulty_curve**: Validates difficulty progression
- **test_planner_agent_state_metadata**: Checks agent metadata storage
- **test_planner_without_system_prompt**: Validates error handling
- **test_planner_performance**: Measures execution time

### 2. `run_planner_test.py` (standalone)
Standalone test script that can run without pytest. Includes:
- Basic functionality test
- Different subjects test (Python, Deep Learning, Web Development)
- Performance metrics (3 iterations)
- Metadata validation

## Running the Tests

### Prerequisites
1. Ensure all dependencies are installed (pydantic, langchain-ollama, etc.)
2. Ollama must be running with `llama3.2` model available
3. Set up Python path correctly

### Option 1: Using pytest (Recommended)
```bash
# Install pytest if needed
pip install pytest pytest-asyncio

# Run all tests
pytest tests/test_planner_agent.py -v -s

# Run specific test
pytest tests/test_planner_agent.py::TestPlannerAgent::test_planner_basic_functionality -v -s
```

### Option 2: Standalone Script
```bash
# Make sure PYTHONPATH includes project root and src
export PYTHONPATH=/path/to/project/src:$PYTHONPATH

# Run the standalone test
python3 tests/run_planner_test.py
```

## Expected Results

### Performance Benchmarks
- **Execution Time**: < 60 seconds per plan generation
- **System Prompt Tokens**: ~60-80 tokens (compressed version)
- **Module Count**: 6-10 modules per curriculum
- **Learning Path**: Should match total_modules count

### Validation Checks
- ✅ Result is `CurriculumPlanOutput` Pydantic model
- ✅ All required fields present and non-empty
- ✅ Module count within 6-10 range
- ✅ Learning path length matches total_modules
- ✅ Core concepts identified
- ✅ ✅ Progression strategy is meaningful (>10 chars)
- ✅ ✅ Time distribution values are 30-120 minutes
- ✅ Difficulty curve mentions progression terms

## Test Coverage

The test suite covers:
1. **Functionality**: Basic curriculum generation
2. **Data Quality**: Structure and content validation
3. **Edge Cases**: Missing system prompt handling
4. **Performance**: Execution time measurement
5. **Metadata**: Agent state tracking
6. **Multi-subject**: Different course subjects

## Troubleshooting

### Import Errors
If you see `ModuleNotFoundError`, ensure:
- Virtual environment is activated (if using one)
- Dependencies are installed: `pip install -r requirements.txt`
- PYTHONPATH includes project root and src directory

### Ollama Connection Issues
If Ollama is not accessible:
- Start Ollama: `ollama serve`
- Verify model exists: `ollama list`
- Pull model if needed: `ollama pull llama3.2`

### Test Failures
Common issues:
- **Module count out of range**: LLM may generate unexpected counts - adjust validation
- **Empty fields**: Check system prompt quality
- **Timeout**: Increase timeout or check Ollama performance

## Example Output

```
================================================================================
PLANNER AGENT TEST SUITE
================================================================================

================================================================================
TEST 1: Basic Functionality
================================================================================
System Prompt (18 tokens):
  Plan curriculum for Machine Learning Fundamentals (Machine Learning) Goals: Learn core ML concepts and practical applications. Output: 6-10 modules...

Executing planner...

✅ Execution completed in 12.34 seconds

Results:
  Total Modules: 8
  Learning Path: ['Introduction to ML', 'Supervised Learning', ...]
  Core Concepts: ['Neural Networks', 'Gradient Descent', ...]
  Progression Strategy: Concepts build from basic statistics to advanced deep learning...
  Difficulty Curve: beginner→intermediate→advanced
  Time Distribution: {'Introduction to ML': 60, ...}

✅ All validations passed!
```


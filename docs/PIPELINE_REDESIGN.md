# Syllabus Pipeline Redesign - Minimal Phases

## Overview

The pipeline has been redesigned to minimize inference time by reducing phases from 5 to 2.

## New Pipeline Structure

### Phase 1: Unified Generation (~100-110s)
**Combines Planning + Module Generation in one LLM call**

- **What it does**: 
  - Plans curriculum structure (learning path, progression)
  - Generates detailed modules with titles, objectives, time estimates
  - All in a single LLM inference call

- **Time**: ~100-110 seconds
- **LLM Calls**: 1

### Phase 2: Finalization (<1s)
**Formatting and persistence**

- **What it does**:
  - Normalizes module format
  - Persists to database
  - Emits completion event

- **Time**: <1 second
- **LLM Calls**: 0

## Performance Comparison

| Pipeline Version | Phases | LLM Calls | Time | Speed Improvement |
|-----------------|--------|-----------|------|-------------------|
| **Old (5 phases)** | Planning → Generation → Validation → Refinement → Finalization | 3-5+ | ~150-200s | Baseline |
| **New (2 phases)** | Unified Generation → Finalization | 1 | ~100-110s | **~40-50% faster** |

## Key Changes

### 1. Unified Generator Prompt
The generator now includes planning instructions in its system prompt:
```
"Create complete syllabus for {course} ({subject}). 
Plan 6-10 modules with logical progression (beginner→advanced), 
then generate each module with: real titles, 3-6 objectives, 
30-120min, {subject} content, prerequisites respected."
```

### 2. Removed Separate Planning Phase
- Planning is now embedded in the generation prompt
- No separate curriculum plan structure needed
- Saves ~5-10s and 1 LLM call

### 3. Removed Validation/Refinement by Default
- Validation and refinement phases are skipped by default
- These can be re-enabled if needed, but add ~30-60s
- Quality is maintained through better prompts

## Benefits

1. **Faster Generation**: ~40-50% reduction in total time
2. **Simpler Architecture**: 2 phases instead of 5
3. **Lower Cost**: 1 LLM call instead of 3-5+
4. **Better UX**: Users get results faster

## Usage

```python
# Default - uses optimized 2-phase pipeline
modules = await pipeline.generate_syllabus(course)

# This is equivalent to:
# modules = await pipeline.generate_syllabus(
#     course,
#     skip_validation=True,   # Default
#     skip_refinement=True    # Default
# )
```

## Future Enhancements

1. **Streaming**: Stream modules as they're generated
2. **Parallel Module Generation**: Generate multiple modules in parallel (if model supports)
3. **Caching**: Cache common curriculum patterns
4. **Model Selection**: Use faster models for generation


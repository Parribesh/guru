# Syllabus Pipeline Optimization Guide

## Current Pipeline Phases

1. **Planning** (~5-10s) - 1 LLM call
2. **Generation** (~100-120s) - 1 LLM call (longest)
3. **Validation** (~10-20s) - 1 LLM call
4. **Refinement** (variable) - 2+ LLM calls if needed
5. **Finalization** (instant) - Just formatting

**Total time: ~130-150s (2-2.5 minutes) with all phases**

## Optimization Strategies

### Strategy 1: Minimal Pipeline (Fastest - ~110s)
**Skip validation and refinement entirely**

```python
modules = await pipeline.generate_syllabus(
    course,
    skip_validation=True,   # Saves ~10-20s
    skip_refinement=True     # Saves potential 20-40s
)
```

**Phases**: Planning → Generation → Finalization
**Time**: ~110-130s
**Use case**: Quick drafts, testing, when quality is less critical

### Strategy 2: Balanced Pipeline (Recommended - ~140s)
**Keep validation, skip refinement**

```python
modules = await pipeline.generate_syllabus(
    course,
    skip_validation=False,  # Keep quality check
    skip_refinement=True     # Skip refinement loop
)
```

**Phases**: Planning → Generation → Validation → Finalization
**Time**: ~130-150s
**Use case**: Production use, good balance of speed and quality

### Strategy 3: Full Pipeline (Slowest - ~150-200s)
**All phases enabled**

```python
modules = await pipeline.generate_syllabus(
    course,
    skip_validation=False,
    skip_refinement=False,
    max_refinement_iterations=1  # Limit iterations
)
```

**Phases**: All phases
**Time**: ~150-200s (depends on refinement iterations)
**Use case**: When maximum quality is required

## Performance Breakdown

| Phase | Time | LLM Calls | Can Skip? |
|-------|------|-----------|-----------|
| Planning | 5-10s | 1 | No (needed for structure) |
| Generation | 100-120s | 1 | No (core functionality) |
| Validation | 10-20s | 1 | Yes (optional quality check) |
| Refinement | 20-40s | 2+ | Yes (only if validation fails) |
| Finalization | <1s | 0 | No (just formatting) |

## Recommendations

### For Testing/Development:
- Use **Strategy 1** (Minimal) - Fastest iteration
- `skip_validation=True, skip_refinement=True`

### For Production:
- Use **Strategy 2** (Balanced) - Good quality/speed tradeoff
- `skip_validation=False, skip_refinement=True`

### For High-Quality Output:
- Use **Strategy 3** (Full) - Maximum quality
- `skip_validation=False, skip_refinement=False, max_refinement_iterations=1`

## Future Optimizations

1. **Parallel Processing**: Run validation in parallel with generation (if possible)
2. **Caching**: Cache planning results for similar courses
3. **Streaming**: Stream generation results as they come
4. **Model Selection**: Use faster models for validation/refinement
5. **Batch Processing**: Generate multiple modules in one call (if model supports)


# Professional Syllabus Generation Architecture

## Problem Analysis

### Current Issues
1. **Monolithic Generation**: Trying to generate 6-10 modules in ONE LLM call
   - Too much for LLM to handle reliably
   - Violates 150 token input constraint
   - Quality suffers (LLM gets overwhelmed)
   - Retries are expensive and often fail

2. **Token Constraints**: Each inference must be <150 tokens input
   - Current approach sends full course context + requirements for all modules
   - This easily exceeds 150 tokens

3. **Reliability**: Single point of failure
   - If one module is bad, entire generation fails
   - Can't retry individual modules

## Professional Solution: Sequential Generation

### Architecture Overview

```
Phase 1: Outline Planning (1 LLM call, ~80-100 tokens)
  └─> Generate just module titles (6-10 titles)
      └─> Output: ["Module 1 Title", "Module 2 Title", ...]

Phase 2: Sequential Module Generation (6-10 LLM calls, each ~100-120 tokens)
  └─> For each module title:
      └─> Generate ONE complete module
          └─> Input: Course context (minimal) + Module title + Position
          └─> Output: Complete module (title, objectives, time)

Phase 3: Finalization (No LLM)
  └─> Format, validate, persist
```

### Why This Is Professional

1. **Focused Generation**: Each LLM call generates ONE thing well
2. **Token Efficient**: Each call is <150 tokens (minimal context)
3. **Quality**: Each module gets full LLM attention
4. **Reliability**: Can retry individual modules if they fail
5. **Scalable**: Can generate 100+ modules if needed
6. **Predictable**: Each step is small and testable

### Token Breakdown (Per Module Generation)

```
System Prompt: ~40 tokens
  "Generate module for {course_title} ({subject}). 
   Module {n}/{total}: {module_title}. 
   Create: title, 3-6 objectives, 30-120min."

Course Context: ~30 tokens
  "{course_title} | {subject} | Goals: {goals[:50]}"

Previous Modules (for continuity): ~20 tokens
  "Previous: {prev_title_1}, {prev_title_2}"

Module Position: ~10 tokens
  "Position: {n}/{total} (beginner/intermediate/advanced)"

Total: ~100-120 tokens per call ✅
```

### Benefits

1. **Consistent Quality**: Each module is generated with full focus
2. **Respects Constraints**: Every call is <150 tokens
3. **Error Recovery**: Can retry individual modules
4. **Progress Tracking**: Can show progress (Module 3/8...)
5. **Parallelization**: Could generate multiple modules in parallel (future)

## Implementation Plan

1. **Outline Planner Agent**: Generates just titles
2. **Sequential Module Generator**: Generates one module at a time
3. **Updated Pipeline**: Orchestrates sequential generation
4. **New Schemas**: Support for outline and single module generation


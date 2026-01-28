# Performance Diagnosis: Sequential Syllabus Generation

## Issue
Sequential syllabus generation is taking ~170 seconds (almost 3 minutes), which feels slow.

## Root Causes Identified

### 1. **Large Model** (Primary Issue)
- **Current Model**: `qwen:latest` (likely 7B+ parameters)
- **Location**: `api/bootstrap.py` line 12
- **Impact**: Each LLM call takes 15-30 seconds
- **Total Impact**: 1 outline call + 6-10 module calls = 90-300 seconds total

### 2. **Sequential Architecture**
- **Design**: Sequential calls (correct for token constraints)
- **Impact**: Total time = sum of all individual call times
- **Trade-off**: Reliability vs. Speed (we chose reliability)

### 3. **Timeout Settings**
- **Previous**: 300 seconds (5 minutes) per call - too long
- **Fixed**: 60 seconds (1 minute) per call - more reasonable
- **Impact**: Faster failure detection, but doesn't speed up successful calls

## Performance Breakdown (Estimated)

```
Outline Planning:      ~20s  (1 call)
Module Generation:     ~150s (8 calls × ~18s each)
Finalization:         ~0.5s (no LLM)
─────────────────────────────────────
Total:                ~170s (2m 50s)
```

## Optimizations Applied

### 1. **Added Timing Diagnostics**
- Each LLM call now logs start/end time
- Warnings if calls take > 30 seconds
- Token usage estimates logged

### 2. **Reduced Timeout**
- Changed from 300s to 60s per call
- Faster failure detection
- Doesn't affect successful calls

### 3. **Better Logging**
- Agent-level timing for each module
- Pipeline-level phase timing
- Clear visibility into bottlenecks

## Recommendations for Speed Improvement

### Option 1: Use Faster Model (Recommended)
**Change model to smaller, faster variant:**

```python
# In api/bootstrap.py
llm = OllamaLLM(model="qwen2:1.5b")  # 1.5B params - much faster
# OR
llm = OllamaLLM(model="llama3.2:1b")  # 1B params - fastest
```

**Expected Impact**: 
- Current: ~18s per call → New: ~3-5s per call
- Total time: ~170s → ~30-50s (3-4x faster)

**Trade-off**: Slightly lower quality, but still good for structured output

### Option 2: Parallel Module Generation (Future)
**Generate 2-3 modules in parallel:**
- Current: 8 sequential calls = 8 × 18s = 144s
- Parallel (2 at a time): 4 batches × 18s = 72s
- **Impact**: 2x faster, but more complex

**Note**: Must ensure token constraints still met per call

### Option 3: Optimize Prompts
**Reduce prompt size:**
- Current prompts: ~100-120 tokens
- Could reduce to ~80-100 tokens
- **Impact**: ~10-20% faster per call

## Current Status

✅ **Diagnostics Added**: Can now see exactly where time is spent
✅ **Timeout Optimized**: Faster failure detection
✅ **Logging Enhanced**: Clear visibility into performance

## Next Steps

1. **Run test with diagnostics** to see actual timing:
   ```bash
   pytest tests/test_sequential_syllabus_integration.py -v -s
   ```

2. **Check logs** for:
   - Individual call times
   - Which calls are slowest
   - Token usage per call

3. **Consider model change** if speed is critical:
   - Test with `qwen2:1.5b` or `llama3.2:1b`
   - Verify quality is acceptable
   - Measure speed improvement

## Expected Performance After Model Change

**With `qwen2:1.5b` (1.5B params):**
- Outline: ~3-5s
- Each Module: ~3-5s
- Total (8 modules): ~27-45s

**With `llama3.2:1b` (1B params):**
- Outline: ~2-4s
- Each Module: ~2-4s
- Total (8 modules): ~18-36s


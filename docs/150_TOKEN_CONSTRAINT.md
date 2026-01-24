# 150 Token Constraint Implementation

## Overview

The application now supports a **150 token input constraint** for fast inference with Ollama models. This constraint ensures that all prompts fit within 150 tokens, enabling faster time-to-first-token (TTFT) performance.

## Token Budget Allocation

With a 150 token limit, the budget is allocated as follows:

- **System Prompt**: 30-40 tokens (compressed)
- **Conversation History**: 60-80 tokens (1-2 recent exchanges, truncated)
- **Current Query**: 20-30 tokens
- **Formatting Overhead**: ~10 tokens (labels, separators)

## Key Optimizations

### 1. Compressed System Prompts

System prompts are now generated in **compressed mode** by default:

- **Tutor Prompt**: Reduced from ~200-300 tokens to ~30-40 tokens
  - Original: Full course details, syllabus outline, objectives, progress, teaching style
  - Compressed: Essential role, module, objectives (first 3), status, brief instructions

- **Test Prompt**: Reduced from ~100-150 tokens to ~25-30 tokens
  - Original: Full module details, objectives list, detailed rules
  - Compressed: Module name, objectives (first 2), core rules

### 2. Intelligent History Truncation

- **Max Pairs**: Only last 1-2 conversation exchanges are kept
- **Message Truncation**: Long messages are truncated to fit budget
- **Priority**: Most recent context is preserved

### 3. Token Budget Management

New utility module: `api/utils/token_budget.py`

- `estimate_tokens()`: Approximate token counting (~1.33 tokens/word)
- `truncate_text()`: Smart text truncation preserving word boundaries
- `compress_system_prompt()`: Compresses system prompts to fit budget
- `truncate_history()`: Intelligently truncates conversation history
- `build_constrained_prompt()`: Builds complete prompt within token budget

## Implementation Details

### Graph State

Added `max_tokens` field to `ChatGraphState`:

```python
class ChatGraphState(TypedDict, total=False):
    # ... existing fields ...
    max_tokens: Optional[int]  # Token budget constraint (e.g., 150)
```

### Agent Configuration

Agents now receive `max_tokens` in their state metadata:

```python
agent.state.metadata["max_tokens"] = 150
```

### Prompt Building

The chat graph automatically uses token budget management when `max_tokens` is set:

- **No RAG**: Uses `build_constrained_prompt()` to fit system + history + query
- **With RAG**: Allocates budget between context, system, history, and query

## Usage

### Enabling 150 Token Constraint

The constraint is **automatically enabled** for:
- Learning sessions (`/learning/{conversation_id}/stream`)
- Test sessions (`/tests/{attempt_id}/stream`)
- Regular chat (`/chat/stream`)

### Disabling Constraint

To disable the constraint, simply don't set `max_tokens` in agent state metadata, or set it to `None`.

### Custom Token Limits

You can adjust the limit by changing:

```python
agent.state.metadata["max_tokens"] = 200  # Custom limit
```

## Performance Impact

### Expected Improvements

- **Faster TTFT**: Smaller prompts = faster first token generation
- **Lower Latency**: Reduced processing time for prompt construction
- **Better Throughput**: More requests can be handled per second

### Trade-offs

- **Less Context**: Only 1-2 recent exchanges in history
- **Compressed Instructions**: System prompts are more concise
- **No Long Context**: RAG context is truncated if needed

## Testing

To verify token counts, you can use the token budget utilities:

```python
from api.utils.token_budget import estimate_tokens, build_constrained_prompt

# Estimate tokens
tokens = estimate_tokens("Your text here")

# Build constrained prompt
prompt = build_constrained_prompt(
    system_prompt="...",
    history=[("user", "msg"), ("assistant", "response")],
    current_query="What is...?",
    max_total_tokens=150
)
```

## Future Enhancements

Potential improvements:
- Use `tiktoken` for accurate token counting
- Implement sliding window for history (keep summary + recent)
- Add prompt caching for repeated system prompts
- Dynamic budget allocation based on query complexity


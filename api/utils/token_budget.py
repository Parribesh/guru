"""
Token budget management for constrained inference (150 token limit).

Provides utilities to:
- Estimate token counts
- Compress prompts to fit within budget
- Basic text truncation

NOTE: History retrieval will be handled by semantic search (separate feature).
"""

def estimate_tokens(text: str) -> int:
    """
    Estimate token count from text.
    Rough approximation: ~1.33 tokens per word, or ~4 chars per token.
    """
    if not text:
        return 0
    # Use word count as primary method (more accurate for English)
    words = len(text.split())
    # Average English: ~1.33 tokens per word
    return int(words * 1.33)


def truncate_text(text: str, max_tokens: int, suffix: str = "...") -> str:
    """
    Truncate text to fit within max_tokens.
    Tries to preserve word boundaries.
    """
    if estimate_tokens(text) <= max_tokens:
        return text
    
    # Start with character-based truncation (faster)
    # ~4 chars per token
    max_chars = max_tokens * 3  # Conservative estimate
    truncated = text[:max_chars]
    
    # Find last word boundary
    last_space = truncated.rfind(' ')
    if last_space > max_chars * 0.8:  # Only if we're not cutting too much
        truncated = truncated[:last_space]
    
    return truncated + suffix


def compress_system_prompt(prompt: str, max_tokens: int = 50) -> str:
    """
    Compress a system prompt to fit within token budget.
    Removes verbose instructions, keeps essential role/context.
    """
    current_tokens = estimate_tokens(prompt)
    if current_tokens <= max_tokens:
        return prompt
    
    # Strategy: Keep first line (role), then truncate rest
    lines = prompt.split('\n')
    if not lines:
        return truncate_text(prompt, max_tokens)
    
    # Keep role line if it exists
    role_line = lines[0] if lines[0].strip().startswith('ROLE:') else None
    rest = '\n'.join(lines[1:]) if role_line else prompt
    
    # Calculate budget for rest
    role_tokens = estimate_tokens(role_line) if role_line else 0
    budget_for_rest = max_tokens - role_tokens - 5  # 5 token buffer
    
    compressed_rest = truncate_text(rest, budget_for_rest)
    
    if role_line:
        return f"{role_line}\n{compressed_rest}"
    return compressed_rest


def build_constrained_prompt(
    system_prompt: str,
    history: list[tuple[str, str]],
    current_query: str,
    max_total_tokens: int = 150
) -> str:
    """
    Build a prompt that fits within token budget.
    
    NOTE: This is a placeholder. History will be retrieved via semantic search
    in the semantic-history-retrieval feature.
    
    For now, uses simple truncation of recent history.
    """
    # Reserve tokens for query and formatting
    query_tokens = estimate_tokens(current_query)
    formatting_overhead = 15  # "User:", "Assistant:", "Conversation so far:", etc.
    available_for_system_and_history = max_total_tokens - query_tokens - formatting_overhead
    
    # Allocate budget: 40% system, 60% history
    system_budget = int(available_for_system_and_history * 0.4)
    history_budget = available_for_system_and_history - system_budget
    
    # Compress system prompt
    compressed_system = compress_system_prompt(system_prompt, system_budget)
    
    # Simple history truncation (will be replaced by semantic retrieval)
    # Keep only last 1-2 exchanges, truncate if needed
    truncated_history = []
    tokens_used = 0
    
    for user_msg, assistant_msg in reversed(history[-2:]):  # Last 2 exchanges
        pair_tokens = estimate_tokens(user_msg) + estimate_tokens(assistant_msg)
        
        if tokens_used + pair_tokens <= history_budget:
            truncated_history.insert(0, (user_msg, assistant_msg))
            tokens_used += pair_tokens
        else:
            # Truncate to fit remaining budget
            remaining = history_budget - tokens_used
            if remaining > 10:  # Only if we have meaningful space
                user_budget = remaining // 2
                assistant_budget = remaining // 2
                truncated_history.insert(0, (
                    truncate_text(user_msg, user_budget),
                    truncate_text(assistant_msg, assistant_budget)
                ))
            break
    
    # Build prompt
    parts = [compressed_system]
    
    if truncated_history:
        history_text = "\n".join([
            f"User: {u}\nAssistant: {a}"
            for u, a in truncated_history
        ])
        parts.append(f"\nConversation:\n{history_text}")
    
    parts.append(f"\nUser: {current_query}\nAssistant:")
    
    final_prompt = "\n".join(parts)
    
    # Verify we're within budget (with small buffer)
    final_tokens = estimate_tokens(final_prompt)
    if final_tokens > max_total_tokens * 1.1:  # 10% buffer
        # Emergency truncation
        return truncate_text(final_prompt, max_total_tokens)
    
    return final_prompt

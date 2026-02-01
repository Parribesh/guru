"""
Token budget utilities for constrained inference.
Used by chat agent (prompt building, history truncation). No app (api) dependencies.
"""


def estimate_tokens(text: str) -> int:
    """
    Estimate token count from text.
    Rough approximation: ~1.33 tokens per word, or ~4 chars per token.
    """
    if not text:
        return 0
    words = len(text.split())
    return int(words * 1.33)


def truncate_text(text: str, max_tokens: int, suffix: str = "...") -> str:
    """
    Truncate text to fit within max_tokens.
    Tries to preserve word boundaries.
    """
    if estimate_tokens(text) <= max_tokens:
        return text
    max_chars = max_tokens * 3
    truncated = text[:max_chars]
    last_space = truncated.rfind(" ")
    if last_space > max_chars * 0.8:
        truncated = truncated[:last_space]
    return truncated + suffix


def compress_system_prompt(prompt: str, max_tokens: int = 50) -> str:
    """
    Compress a system prompt to fit within token budget.
    Removes verbose instructions, keeps essential role/context.
    """
    if estimate_tokens(prompt) <= max_tokens:
        return prompt
    lines = prompt.split("\n")
    if not lines:
        return truncate_text(prompt, max_tokens)
    role_line = lines[0] if lines[0].strip().startswith("ROLE:") else None
    rest = "\n".join(lines[1:]) if role_line else prompt
    role_tokens = estimate_tokens(role_line) if role_line else 0
    budget_for_rest = max_tokens - role_tokens - 5
    compressed_rest = truncate_text(rest, budget_for_rest)
    if role_line:
        return f"{role_line}\n{compressed_rest}"
    return compressed_rest


def build_constrained_prompt(
    system_prompt: str,
    history: list[tuple[str, str]],
    current_query: str,
    max_total_tokens: int = 150,
) -> str:
    """
    Build a prompt that fits within token budget.
    Uses simple truncation of recent history.
    """
    query_tokens = estimate_tokens(current_query)
    formatting_overhead = 15
    available_for_system_and_history = max_total_tokens - query_tokens - formatting_overhead
    system_budget = int(available_for_system_and_history * 0.4)
    history_budget = available_for_system_and_history - system_budget
    compressed_system = compress_system_prompt(system_prompt, system_budget)
    truncated_history = []
    tokens_used = 0
    for user_msg, assistant_msg in reversed(history[-2:]):
        pair_tokens = estimate_tokens(user_msg) + estimate_tokens(assistant_msg)
        if tokens_used + pair_tokens <= history_budget:
            truncated_history.insert(0, (user_msg, assistant_msg))
            tokens_used += pair_tokens
        else:
            remaining = history_budget - tokens_used
            if remaining > 10:
                truncated_history.insert(
                    0,
                    (
                        truncate_text(user_msg, remaining // 2),
                        truncate_text(assistant_msg, remaining // 2),
                    ),
                )
            break
    parts = [compressed_system]
    if truncated_history:
        history_text = "\n".join(
            f"User: {u}\nAssistant: {a}" for u, a in truncated_history
        )
        parts.append(f"\nConversation:\n{history_text}")
    parts.append(f"\nUser: {current_query}\nAssistant:")
    final_prompt = "\n".join(parts)
    if estimate_tokens(final_prompt) > max_total_tokens * 1.1:
        return truncate_text(final_prompt, max_total_tokens)
    return final_prompt

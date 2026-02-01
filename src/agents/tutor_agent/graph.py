"""Tutor graph: no RAG, lesson-only path (history + system_prompt -> LLM)."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, TypedDict

from agents.core.llm import LLM
from typing import AsyncIterator


class TutorGraphState(TypedDict, total=False):
    user_input: str
    query: str
    history: List[Any]
    system_prompt: str
    max_tokens: Optional[int]
    conversation_id: Optional[str]
    stream: bool
    prompt: str
    answer: str
    answer_stream: AsyncIterator[str]


def _format_history(history: List[Any]) -> str:
    lines: List[str] = []
    for item in history:
        if isinstance(item, tuple) and len(item) == 2:
            u, a = item
            if isinstance(u, str) and isinstance(a, str):
                lines.append(f"User: {u}\nAssistant: {a}")
    return "\n".join(lines)


def build_tutor_graph(
    *,
    llm: LLM,
    max_history: int = 6,
):
    """Tutor-only graph: parse -> build_prompt -> answer (no RAG)."""

    def _parse(state: TutorGraphState) -> Dict[str, Any]:
        user_input = (state.get("user_input") or "").strip()
        history = state.get("history") or []
        return {
            "query": user_input,
            "history": history[-max_history:] if history else [],
        }

    def _build_prompt(state: TutorGraphState) -> Dict[str, Any]:
        query = state.get("query") or ""
        history = state.get("history") or []  # from parse
        sys_prompt = (state.get("system_prompt") or "").strip() or "You are a helpful tutor."
        max_tokens = state.get("max_tokens")

        if max_tokens:
            try:
                from agents.core.token_utils import (
                    estimate_tokens,
                    compress_system_prompt,
                    truncate_text,
                )

                query_tokens = estimate_tokens(query)
                formatting_overhead = 15
                available = max_tokens - query_tokens - formatting_overhead
                system_budget = int(available * 0.4)
                history_budget = available - system_budget
                compressed_system = compress_system_prompt(sys_prompt, system_budget)
                history_text = ""
                if history:
                    history_parts = []
                    tokens_used = 0
                    for u, a in history:
                        pair_text = f"User: {u}\nAssistant: {a}"
                        pair_tokens = estimate_tokens(pair_text)
                        if tokens_used + pair_tokens <= history_budget:
                            history_parts.append(pair_text)
                            tokens_used += pair_tokens
                        else:
                            remaining = history_budget - tokens_used
                            if remaining > 10:
                                user_budget = remaining // 2
                                assistant_budget = remaining // 2
                                truncated_u = truncate_text(u, user_budget)
                                truncated_a = truncate_text(a, assistant_budget)
                                history_parts.append(
                                    f"User: {truncated_u}\nAssistant: {truncated_a}"
                                )
                            break
                    history_text = "\n".join(history_parts)
                parts = [compressed_system]
                if history_text:
                    parts.append(
                        f"\n\nPrevious lesson context:\n{history_text}"
                    )
                parts.append(f"\n\nCurrent learner input:\nUser: {query}\nAssistant:")
                prompt = "\n".join(parts)
                final_tokens = estimate_tokens(prompt)
                if final_tokens > max_tokens * 1.1:
                    prompt = truncate_text(prompt, max_tokens)
                return {"prompt": prompt}
            except (ImportError, Exception) as e:
                import logging
                logging.getLogger(__name__).warning(
                    "Tutor token budget failed: %s, fallback", e
                )
        history_text = _format_history(history)
        prompt = f"{sys_prompt}\n\n"
        if history_text:
            prompt += f"Lesson so far:\n{history_text}\n\n"
        prompt += f"User: {query}\nAssistant:"
        return {"prompt": prompt}

    def _answer(state: TutorGraphState) -> Dict[str, Any]:
        prompt = state.get("prompt") or ""
        is_stream = state.get("stream") or False
        if is_stream:
            async def stream():
                async for chunk in llm.stream(prompt):
                    yield chunk
            return {"answer": None, "answer_stream": stream()}
        answer = llm.generate(prompt)
        return {"answer": answer}

    try:
        from langgraph.graph import END, StateGraph  # type: ignore

        g: StateGraph = StateGraph(TutorGraphState)
        g.add_node("parse", _parse)
        g.add_node("prompt", _build_prompt)
        g.add_node("answer", _answer)
        g.set_entry_point("parse")
        g.add_edge("parse", "prompt")
        g.add_edge("prompt", "answer")
        g.add_edge("answer", END)
        return g.compile()
    except ModuleNotFoundError:
        return _FallbackTutorGraph(
            parse=_parse,
            prompt=_build_prompt,
            answer=_answer,
        )


class _FallbackTutorGraph:
    def __init__(self, *, parse, prompt, answer):
        self._parse = parse
        self._prompt = prompt
        self._answer = answer

    def invoke(self, state: Dict[str, Any]) -> Dict[str, Any]:
        out: Dict[str, Any] = dict(state)
        out.update(self._parse(out))
        out.update(self._prompt(out))
        out.update(self._answer(out))
        return out

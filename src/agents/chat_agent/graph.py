from __future__ import annotations

import os
from typing import Any, Dict, List, Optional, TypedDict

from agents.core.llm import LLM
from agents.core.registry import AgentRegistry
from agents.rag_agent.text_extractor import extract_text_from_path, UnsupportedDocumentTypeError
from typing import AsyncIterator

class ChatGraphState(TypedDict, total=False):
    user_input: str
    query: str
    doc_path: Optional[str]
    doc_paths: List[str]
    history: List[Any]
    context: str
    prompt: str
    answer: str
    stream: bool
    answer_stream: AsyncIterator[str]
    system_prompt: str
    max_tokens: Optional[int]  # Token budget constraint (e.g., 150)

def build_chat_graph(
    *,
    llm: LLM,
    registry: Optional[AgentRegistry],
    rag_agent_name: str = "rag",
    rag_k: int = 5,
    max_history: int = 6,
):
    """
    LangGraph router:
    - If `doc_path` is present in the user's input, ingest that doc and use RAG for context.
    - Otherwise, answer directly without RAG.
    """

    def _parse(state: ChatGraphState) -> Dict[str, Any]:
        user_input = (state.get("user_input") or "").strip()
        history = state.get("history") or []

        # Primary signal: explicit doc paths passed via AgentState.
        explicit_paths = [p for p in (state.get("doc_paths") or []) if isinstance(p, str) and p]
        if explicit_paths:
            doc_path, query = None, user_input
            doc_paths = explicit_paths
        else:
            # Secondary signal: if the user input contains any *existing* file paths,
            # route to RAG using those paths (no special query syntax required).
            doc_paths, query = _extract_doc_paths_and_query(user_input)
            doc_path = doc_paths[0] if doc_paths else None
        return {
            "doc_path": doc_path,  # retained for backwards compatibility / debugging
            "doc_paths": doc_paths,
            "query": query,
            "history": history[-max_history:] if history else [],
        }

    def _route(state: ChatGraphState) -> str:
        return "rag" if (state.get("doc_paths") or []) else "no_rag"

    def _ingest_doc(state: ChatGraphState) -> Dict[str, Any]:
        if registry is None:
            return {}
        doc_paths = state.get("doc_paths") or []
        if not doc_paths:
            return {}
        rag = registry.get(rag_agent_name)
        if not hasattr(rag, "ingest"):
            return {}

        docs = []
        for doc_path in doc_paths:
            if not os.path.exists(doc_path):
                continue
            try:
                text = extract_text_from_path(doc_path)
            except (UnsupportedDocumentTypeError, OSError):
                continue
            docs.append({"source_id": doc_path, "text": text, "metadata": {"path": doc_path}})

        if docs:
            rag.ingest(docs)
        return {}

    def _retrieve_context(state: ChatGraphState) -> Dict[str, Any]:
        if registry is None:
            return {"context": ""}
        rag = registry.get(rag_agent_name)
        query = state.get("query") or ""
        context = ""
        if hasattr(rag, "get_context"):
            context = rag.get_context(query, k=rag_k)
        else:
            # Fallback: treat it as a normal agent.
            context = rag.run(query)
        return {"context": context}

    def _build_prompt_no_rag(state: ChatGraphState) -> Dict[str, Any]:
        query = state.get("query") or ""
        history = state.get("history") or []
        sys_prompt = (state.get("system_prompt") or "").strip() or "You are a helpful assistant."
        
        # Use token budget management if max_tokens is set
        max_tokens = state.get("max_tokens")
        if max_tokens:
            try:
                import sys
                from pathlib import Path
                # Add project root to path for imports
                project_root = Path(__file__).parent.parent.parent.parent
                if str(project_root) not in sys.path:
                    sys.path.insert(0, str(project_root))
                from api.utils.token_budget import build_constrained_prompt
                prompt = build_constrained_prompt(sys_prompt, history, query, max_tokens)
                return {"prompt": prompt}
            except (ImportError, Exception):
                pass  # Fall back to original if token_budget not available
        
        # Original behavior (no token constraint)
        history_text = _format_history(history)
        prompt = f"{sys_prompt}\n\n"
        if history_text:
            prompt += f"Conversation so far:\n{history_text}\n\n"
        prompt += f"User: {query}\nAssistant:"
        return {"prompt": prompt}

    def _build_prompt_with_rag(state: ChatGraphState) -> Dict[str, Any]:
        query = state.get("query") or ""
        context = state.get("context") or ""
        history = state.get("history") or []
        
        sys_prompt = (state.get("system_prompt") or "").strip() or "You are a helpful assistant. Use the provided context if it is relevant."
        
        # Use token budget management if max_tokens is set
        max_tokens = state.get("max_tokens")
        if max_tokens:
            try:
                import sys
                from pathlib import Path
                # Add project root to path for imports
                project_root = Path(__file__).parent.parent.parent.parent
                if str(project_root) not in sys.path:
                    sys.path.insert(0, str(project_root))
                from api.utils.token_budget import truncate_text, estimate_tokens
                # Reserve tokens for context
                context_tokens = estimate_tokens(context)
                query_tokens = estimate_tokens(query)
                formatting_overhead = 20
                available = max_tokens - context_tokens - query_tokens - formatting_overhead
                
                if available > 30:  # Only if we have room
                    # Truncate context if needed
                    if context_tokens > available * 0.4:  # Context gets 40% of available
                        context = truncate_text(context, int(available * 0.4))
                    
                    # Build constrained prompt with context
                    sys_and_history_budget = available - estimate_tokens(context)
                    compressed_sys = truncate_text(sys_prompt, int(sys_and_history_budget * 0.4))
                    
                    # Simple history: keep last 1 exchange (will be replaced by semantic retrieval)
                    history_budget = int(sys_and_history_budget * 0.6)
                    truncated_history = []
                    if history:
                        last_user, last_assistant = history[-1]
                        pair_tokens = estimate_tokens(last_user) + estimate_tokens(last_assistant)
                        if pair_tokens <= history_budget:
                            truncated_history = [(last_user, last_assistant)]
                        else:
                            user_budget = history_budget // 2
                            assistant_budget = history_budget // 2
                            truncated_history = [
                                (truncate_text(last_user, user_budget), truncate_text(last_assistant, assistant_budget))
                            ]
                    
                    history_text = "\n".join([f"User: {u}\nAssistant: {a}" for u, a in truncated_history]) if truncated_history else ""
                    
                    parts = [compressed_sys]
                    if context:
                        parts.append(f"\nContext:\n{context}")
                    if history_text:
                        parts.append(f"\nConversation:\n{history_text}")
                    parts.append(f"\nUser: {query}\nAssistant:")
                    
                    prompt = "\n".join(parts)
                    return {"prompt": prompt}
            except (ImportError, Exception):
                pass  # Fall back to original
        
        # Original behavior (no token constraint)
        history_text = _format_history(history)
        prompt = f"{sys_prompt}\n\n"
        if context:
            prompt += f"Context:\n{context}\n\n"
        if history_text:
            prompt += f"Conversation so far:\n{history_text}\n\n"
        prompt += f"User: {query}\nAssistant:"
        return {"prompt": prompt}

    def _answer(state: ChatGraphState) -> Dict[str, Any]:
        prompt = state.get("prompt") or ""
        is_stream = state.get("stream") or False
        if is_stream:
            async def stream():
                async for chunk in llm.stream(prompt):
                    yield chunk
            return {"answer": None, "answer_stream": stream()}
        else:
            answer = llm.generate(prompt)
            return {"answer": answer}

    # Prefer LangGraph if available; fall back to a tiny local runner if it's not installed.
    try:
        from langgraph.graph import END, StateGraph  # type: ignore

        g: StateGraph = StateGraph(ChatGraphState)
        g.add_node("parse", _parse)
        g.add_node("ingest_doc", _ingest_doc)
        g.add_node("retrieve_context", _retrieve_context)
        g.add_node("prompt_no_rag", _build_prompt_no_rag)
        g.add_node("prompt_with_rag", _build_prompt_with_rag)
        g.add_node("answer", _answer)

        g.set_entry_point("parse")
        g.add_conditional_edges("parse", _route, {"rag": "ingest_doc", "no_rag": "prompt_no_rag"})

        # RAG path
        g.add_edge("ingest_doc", "retrieve_context")
        g.add_edge("retrieve_context", "prompt_with_rag")
        g.add_edge("prompt_with_rag", "answer")

        # No-RAG path
        g.add_edge("prompt_no_rag", "answer")

        g.add_edge("answer", END)
        return g.compile()
    except ModuleNotFoundError:
        return _FallbackGraph(
            parse=_parse,
            route=_route,
            ingest_doc=_ingest_doc,
            retrieve_context=_retrieve_context,
            prompt_no_rag=_build_prompt_no_rag,
            prompt_with_rag=_build_prompt_with_rag,
            answer=_answer,
        )


class _FallbackGraph:
    """
    Minimal `.invoke(state)` runner used only when `langgraph` isn't installed.
    """

    def __init__(self, **steps):
        self.steps = steps

    def invoke(self, state: Dict[str, Any]) -> Dict[str, Any]:
        out: Dict[str, Any] = dict(state)
        out.update(self.steps["parse"](out))
        branch = self.steps["route"](out)
        if branch == "rag":
            out.update(self.steps["ingest_doc"](out))
            out.update(self.steps["retrieve_context"](out))
            out.update(self.steps["prompt_with_rag"](out))
        else:
            out.update(self.steps["prompt_no_rag"](out))
        out.update(self.steps["answer"](out))
        return out


def _extract_doc_paths_and_query(user_input: str) -> tuple[List[str], str]:
    """
    Heuristic parser:
    - Accepts absolute/relative paths present as a token in the input
    - Query is the remaining text

    Examples:
      "/tmp/doc.txt what is this about?" -> doc_path=/tmp/doc.txt, query="what is this about?"
      "what is the capital of France?"  -> doc_path=None, query="what is the capital of France?"
    """

    tokens = user_input.split()
    doc_paths: List[str] = []
    keep_tokens: List[str] = []

    for tok in tokens:
        candidate = tok.strip().strip('"').strip("'")
        if candidate.startswith("file://"):
            candidate = candidate[len("file://") :]
        if candidate and os.path.exists(candidate):
            doc_paths.append(candidate)
        else:
            keep_tokens.append(tok)

    query = " ".join(keep_tokens).strip()
    if doc_paths and not query:
        query = "Summarize this document."
    return doc_paths, query


def _format_history(history: List[Any]) -> str:
    lines: List[str] = []
    for item in history:
        if isinstance(item, tuple) and len(item) == 2:
            u, a = item
            if isinstance(u, str) and isinstance(a, str):
                lines.append(f"User: {u}\nAssistant: {a}")
    return "\n".join(lines)



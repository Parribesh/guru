from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from agents.rag_agent.chunking import Chunker, SlidingWindowChunker
from agents.rag_agent.store import VectorStore
from agents.rag_agent.types import Chunk, RetrievedChunk, SourceDocument


@dataclass
class RAGService:
    """
    Core-library RAG use-case logic.

    - No Chroma imports.
    - No PDF parsing.
    - No network calls.
    - Depends only on `VectorStore` + a chunking policy.
    """

    store: VectorStore
    chunker: Chunker = SlidingWindowChunker()

    def ingest(self, docs: List[SourceDocument]) -> int:
        chunks: List[Chunk] = []
        for doc in docs:
            chunks.extend(self.chunker.chunk(doc))

        if not chunks:
            return 0

        # `VectorStore` interface currently accepts List[Dict[str, Any]].
        self.store.add_documents([_chunk_to_store_doc(c) for c in chunks])
        return len(chunks)

    def retrieve(self, query: str, k: int = 5) -> List[RetrievedChunk]:
        raw = self.store.query(query=query, k=k)
        return [_normalize_retrieved_item(item) for item in raw]

    def delete(self, ids: List[str]) -> None:
        self.store.delete_documents(ids)


def _chunk_to_store_doc(chunk: Chunk) -> Dict[str, Any]:
    # Stable contract we expect infra adapters to support.
    return {"id": chunk["id"], "text": chunk["text"], "metadata": chunk.get("metadata") or {}}


def _normalize_retrieved_item(item: Dict[str, Any]) -> RetrievedChunk:
    """
    Accepts a few common shapes because different vector backends return different payloads.
    Expected canonical shape:
      { "id": str, "text": str, "metadata": dict, "score": float? }
    """

    _id: Optional[str] = item.get("id")
    text: Optional[str] = item.get("text") or item.get("document") or item.get("page_content")
    metadata: Dict[str, Any] = item.get("metadata") or item.get("metadatas") or {}
    score = item.get("score")

    if _id is None:
        # Best-effort fallback: allow stores that don't return ids.
        _id = metadata.get("chunk_id") or metadata.get("id") or "unknown"

    if text is None:
        text = ""

    return {"id": str(_id), "text": str(text), "metadata": dict(metadata), "score": score}



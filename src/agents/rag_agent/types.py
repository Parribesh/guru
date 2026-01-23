from __future__ import annotations

from typing import Any, Dict, Optional, TypedDict


class SourceDocument(TypedDict):
    """
    Library-level input to RAG ingestion.
    Keep this vendor-agnostic: plain text + metadata.
    """

    source_id: str
    text: str
    metadata: Dict[str, Any]


class Chunk(TypedDict):
    """
    A retrievable unit stored in a vector store.
    """

    id: str
    text: str
    metadata: Dict[str, Any]


class RetrievedChunk(Chunk):
    """
    Result returned from retrieval.
    `score` is optional because not all stores return it.
    """

    score: Optional[float]



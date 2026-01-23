from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any, Dict, List, Protocol

from agents.rag_agent.types import Chunk, SourceDocument


class Chunker(Protocol):
    def chunk(self, doc: SourceDocument) -> List[Chunk]: ...


@dataclass(frozen=True)
class SlidingWindowChunker:
    """
    Vendor-agnostic default chunker.

    Why this exists:
    - We don't want `rag_agent` to assume LangChain splitters are installed.
    - We still need deterministic, testable chunking for ingestion.
    """

    chunk_size: int = 1000
    chunk_overlap: int = 100

    def chunk(self, doc: SourceDocument) -> List[Chunk]:
        text = (doc.get("text") or "").strip()
        if not text:
            return []

        source_id = doc["source_id"]
        base_meta: Dict[str, Any] = {"source_id": source_id, **(doc.get("metadata") or {})}

        size = max(1, int(self.chunk_size))
        overlap = max(0, int(self.chunk_overlap))
        step = max(1, size - overlap)

        chunks: List[Chunk] = []
        chunk_index = 0
        for start in range(0, len(text), step):
            end = min(len(text), start + size)
            chunk_text = text[start:end].strip()
            if not chunk_text:
                continue

            chunk_id = self._stable_chunk_id(source_id=source_id, start=start, end=end, chunk_index=chunk_index)
            meta = {
                **base_meta,
                "chunk_index": chunk_index,
                "start": start,
                "end": end,
            }
            chunks.append({"id": chunk_id, "text": chunk_text, "metadata": meta})
            chunk_index += 1

            if end >= len(text):
                break

        return chunks

    @staticmethod
    def _stable_chunk_id(*, source_id: str, start: int, end: int, chunk_index: int) -> str:
        raw = f"{source_id}:{chunk_index}:{start}:{end}".encode("utf-8")
        return hashlib.sha1(raw).hexdigest()



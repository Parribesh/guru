"""
Compatibility shim.

The `VectorStore` interface is a core contract for RAG logic, so it now lives in:
  `agents.rag_agent.store.VectorStore`

Infrastructure implementations should import that interface and implement it.
This module remains as a thin re-export to avoid breaking older imports.
"""

from agents.rag_agent.store import VectorStore

__all__ = ["VectorStore"]
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict, List


class VectorStore(ABC):
    """
    Core RAG contract.

    This interface lives in `rag_agent` because it's part of the *library* API that
    RAG logic depends on. Infrastructure (e.g., Chroma) should implement it.
    """

    @abstractmethod
    def add_documents(self, documents: List[Dict[str, Any]]) -> None:
        """
        Add documents/chunks to the store.

        Canonical expected shape per item:
          { "id": str, "text": str, "metadata": dict }
        """

        raise NotImplementedError

    @abstractmethod
    def query(self, query: str, k: int) -> List[Dict[str, Any]]:
        """
        Query the store and return top-k results.

        Canonical expected shape per result:
          { "id": str, "text": str, "metadata": dict, "score": float? }
        """

        raise NotImplementedError

    @abstractmethod
    def delete_documents(self, ids: List[str]) -> None:
        raise NotImplementedError



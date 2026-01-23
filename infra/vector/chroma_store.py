from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from agents.rag_agent.store import VectorStore


@dataclass
class ChromaStore(VectorStore):
    """
    Chroma-backed VectorStore implementation.

    - Embeddings are handled by Chroma via `embedding_function` (if provided).
    - Uses a persistent client when `persist_dir` is set.
    """

    collection_name: str = "docs"
    persist_dir: Optional[str] = None
    embedding_function: Any = None

    _client: Any = None
    _collection: Any = None

    def _get_client(self):
        if self._client is not None:
            return self._client

        try:
            import chromadb  # type: ignore
            from chromadb.config import Settings  # type: ignore
        except ModuleNotFoundError as e:
            raise ModuleNotFoundError(
                "chromadb is required to use ChromaStore. Install it with `pip install chromadb` "
                "or add it to your environment."
            ) from e

        if self.persist_dir:
            # Persistent storage on disk
            self._client = chromadb.PersistentClient(
                path=self.persist_dir,
                settings=Settings(anonymized_telemetry=False),
            )
        else:
            # In-memory (ephemeral)
            self._client = chromadb.Client(Settings(anonymized_telemetry=False))
        return self._client

    def _get_collection(self):
        if self._collection is not None:
            return self._collection

        client = self._get_client()
        self._collection = client.get_or_create_collection(
            name=self.collection_name,
            embedding_function=self.embedding_function,
        )
        return self._collection

    def add_documents(self, documents: List[Dict[str, Any]]) -> None:
        col = self._get_collection()
        ids: List[str] = []
        texts: List[str] = []
        metadatas: List[Dict[str, Any]] = []

        for doc in documents:
            _id = doc.get("id")
            text = doc.get("text")
            meta = doc.get("metadata") or {}
            if not _id or not isinstance(_id, str):
                raise ValueError("Each document must include a string 'id'")
            if text is None:
                text = ""
            ids.append(_id)
            texts.append(str(text))
            metadatas.append(dict(meta))

        # Chroma expects `documents=` for texts.
        col.add(ids=ids, documents=texts, metadatas=metadatas)

    def query(self, query: str, k: int) -> List[Dict[str, Any]]:
        col = self._get_collection()
        res = col.query(query_texts=[query], n_results=k)

        ids = (res.get("ids") or [[]])[0]
        docs = (res.get("documents") or [[]])[0]
        metas = (res.get("metadatas") or [[]])[0]
        dists = (res.get("distances") or [[]])[0]

        out: List[Dict[str, Any]] = []
        for i in range(min(len(ids), len(docs))):
            meta = metas[i] if i < len(metas) and metas[i] is not None else {}
            score = None
            # Chroma returns distances; treat "score" as distance for now (lower is better).
            if i < len(dists):
                score = dists[i]
            out.append({"id": ids[i], "text": docs[i], "metadata": dict(meta), "score": score})
        return out

    def delete_documents(self, ids: List[str]) -> None:
        col = self._get_collection()
        col.delete(ids=ids)



from typing import TypedDict

class ChunkSchema(TypedDict):
    id: str
    text: str
    embedding: list[float]
    metadata: dict
    chunk_type: str
    chunk_subtype: str
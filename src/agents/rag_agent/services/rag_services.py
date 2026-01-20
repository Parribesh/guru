from services.retriver import get_pdf_from_db
from services.embedding_store import EmbeddingStore
from services.retriver import create_chunks_from_pdf
from models.chunks import ChunkSchema

class RAGServices:
    def __init__(self):
        self.embedding_store = EmbeddingStore()

    def create_embedding(self, chunks: list[ChunkSchema]):
        self.embedding_store.add_documents(chunks)

    def search_embedding(self, query):
        return self.embedding_store.query(query)

    def get_similiar_chunks(self, query: str):
        return self.embedding_store.query(query)

    def create_embedding_from_pdf(self, file_path: str):
        chunks = create_chunks_from_pdf(file_path)
        self.create_embedding(chunks)
        return chunks
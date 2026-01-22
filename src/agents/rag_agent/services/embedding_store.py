import chromadb
from chromadb.utils import embedding_functions
from langchain_core.documents import Document
from typing import List

class EmbeddingStore:
    def __init__(self):
        self.chroma_client = chromadb.Client()
        self.collection = self.chroma_client.create_collection(name="docs", 
        embedding_function=embedding_functions.SentenceTransformerEmbeddingFunction(model_name="all-MiniLM-L6-v2")  )

    def add_documents(self, documents:List[Document]):
        self.collection.add(documents=[doc.page_content for doc in documents], ids=[doc.metadata["chunk_id"] for doc in documents], metadatas=[doc.metadata for doc in documents])

    def query(self, query, k=10):
        return self.collection.query(query_texts=[query], n_results=k)

    def delete_documents(self, ids):
        self.collection.delete(ids=ids)

    def delete_collection(self):
        self.chroma_client.delete_collection(name="docs")

    def close(self):
        self.chroma_client.close()

    def __del__(self):
        self.close()
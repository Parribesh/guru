from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import OpenAIEmbeddings
from dbconfig import session
from models.pdf import PDFModel, PageSchema
from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import OpenAIEmbeddings
from langchain_community.vectorstores import Chroma
import pdfplumber
import random
from langchain_text_splitters import CharacterTextSplitter
import uuid
from langchain_core.documents import Document

chunk_size = 1000
chunk_overlap = 100

class Analytics:
    def __init__(self, pdf_models):
        self.pdf_models = pdf_models

    def print_random_page(self):
        random_page = random.randint(0, len(self.pdf_models) - 1)
        print("random page:[", random_page, "] ", self.pdf_models[random_page].page_schema["page_text"])

def create_chunks(text: str, position: int) -> list[Document]:
    text_splitter = CharacterTextSplitter(chunk_size=chunk_size, chunk_overlap=chunk_overlap)
    docs = [Document(page_content=text, metadata={"page_number": position})]
    chunks = text_splitter.split_documents(docs)
    for doc in chunks:
        doc.metadata["page_number"] = position
        doc.metadata["chunk_id"] = str(uuid.uuid4())
    return chunks

def create_chunks_from_pdf(file_path=file_path) -> list[Document]:
    all_chunks = []
    with pdfplumber.open(file_path) as pdf:
        for page_number, page in enumerate(pdf.pages):
            text = page.extract_text()
            all_chunks.extend(create_chunks(text, page_number))
    return all_chunks

def save_pdf_to_db(file_path):
    with pdfplumber.open(file_path) as pdf:
        pages = []
        for page_number, page in enumerate(pdf.pages):
            pages.append({"page_number": page_number, "page_text": page.extract_text()})
        pdf_name = file_path.split("/")[-1]
        for page in pages:
            page_schema = PageSchema(page_number=page["page_number"], page_text=page["page_text"])
            page_schema = page_schema.model_dump()
            pdf_model = PDFModel(pdf_name=pdf_name, file_path=file_path, page_schema=page_schema)
            session.add(pdf_model)
            session.commit()
            print("page saved: ", page["page_number"])
    print("total pages: ", len(pages)) 



def get_pdf_from_db(file_path):
    save_pdf_to_db(file_path)
    pdf_model = session.query(PDFModel).filter(PDFModel.file_path == file_path).all()
    if pdf_model:
        print("pdf found in db, total pages: ", len(pdf_model))
        return pdf_model
    else:
        print("pdf not found in db, saving to database")
        pdf_model = save_pdf_to_db(file_path)
        print("pdf saved to database")
        return pdf_model

def create_vector_store(pdf_models):
    vector_store = Chroma.from_documents(documents=pdf_models, embedding=OpenAIEmbeddings())
    return vector_store

def search_vector_store(vector_store, query):
    search_results = vector_store.similarity_search(query)
    return search_results

def main():
    pdf_models = get_pdf_from_db(file_path)
    vector_store = create_vector_store(pdf_models)
    search_results = search_vector_store(vector_store, "What is the main idea of the book?")
    print(search_results)
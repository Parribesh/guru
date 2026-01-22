from dbconfig import Base   
from sqlalchemy import Column, Integer, String, JSON
from pydantic import BaseModel

class PageSchema(BaseModel):
    page_number: int
    page_text: str

class PDFModel(Base):
    __tablename__ = "pdfs"
    id = Column(Integer, primary_key=True, index=True)
    pdf_name = Column(String, index=True)
    file_path = Column(String, index=True)
    page_schema = Column(JSON, index=True)
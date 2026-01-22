import pdfplumber   
import random
from rag_agent.models.pdf import PDFModel, PageSchema
from rag_agent.dbconfig import session, init_db

# Initialize database after all imports are complete
init_db()


if __name__ == "__main__":
    
    session.close()
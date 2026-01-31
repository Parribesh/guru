from pydantic_settings import BaseSettings
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base
import os
from dotenv import load_dotenv
load_dotenv()

engine = create_engine(os.getenv("DATABASE_URL"))
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def reset_db():
    Base.metadata.drop_all(bind=engine)
    print("Database dropped")
    create_db()

def create_db():
    Base.metadata.create_all(bind=engine)
    print("Database created")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
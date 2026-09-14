from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base

from api.settings import settings

connect_args = {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(settings.DATABASE_URL, connect_args=connect_args)
OLLAMA_BASE_URL = settings.OLLAMA_BASE_URL
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
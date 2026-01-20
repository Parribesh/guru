from chat_agent.config import Base, get_db
from sqlalchemy import Column, Integer, String, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declarative_base
from chat_agent.src.auth_utils import get_password_hash

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    preferences = Column(JSON)

def get_user_by_email(email: str) -> User | None:
    db = next(get_db())
    return db.query(User).filter(User.email == email).first()

def create_user(email: str, password: str) -> User:
    print(f"Creating user: {email}")
    hashed_password = get_password_hash(password)
    try:
        db = next(get_db())
        user = User(email=email, hashed_password=hashed_password)
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
    except Exception as e:
        print(f"Error creating user: {e}")
        raise e
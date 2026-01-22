from api.config import Base, get_db
from sqlalchemy import Column, Integer, String, JSON
from api.utils.auth_utils import get_password_hash

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    preferences = Column(JSON)


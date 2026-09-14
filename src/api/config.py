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

    # Lightweight migration for SQLite/existing tables
    try:
        from sqlalchemy import inspect, text
        inspector = inspect(engine)
        if "users" in inspector.get_table_names():
            columns = [c["name"] for c in inspector.get_columns("users")]
            if "role" not in columns:
                with engine.begin() as conn:
                    conn.execute(text("ALTER TABLE users ADD COLUMN role VARCHAR DEFAULT 'user'"))
                print("Added 'role' column to users table")
    except Exception as e:
        print(f"Error checking/migrating users table schema: {e}")

    # Ensure default user paribesh@guru.com is present and admin
    try:
        from api.models.models import User
        from api.utils.jwt import get_password_hash
        with SessionLocal() as db:
            admin_user = db.query(User).filter(User.email == settings.DEFAULT_USER_EMAIL).first()
            if admin_user:
                changed = False
                if getattr(admin_user, "role", None) != "admin":
                    admin_user.role = "admin"
                    changed = True
                    print(f"Promoted {settings.DEFAULT_USER_EMAIL} to admin")
                prefs = admin_user.preferences or {}
                if prefs.get("ollama_model") == "deepseek-r1:7b" or not prefs.get("llm_provider") or prefs.get("gemini_model") == "gemini-3.7-flash":
                    admin_user.preferences = {
                        "llm_provider": "gemini",
                        "gemini_model": "gemini-3.6-flash",
                    }
                    changed = True
                    print("Normalized user preferences to Gemini default")
                if changed:
                    db.commit()
            else:
                new_admin = User(
                    email=settings.DEFAULT_USER_EMAIL,
                    hashed_password=get_password_hash(settings.DEFAULT_USER_PASSWORD),
                    role="admin",
                    preferences={
                        "llm_provider": "gemini",
                        "gemini_model": "gemini-3.6-flash",
                    }
                )
                db.add(new_admin)
                db.commit()
                print(f"Seeded admin user {settings.DEFAULT_USER_EMAIL}")
    except Exception as e:
        print(f"Error ensuring default admin user: {e}")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
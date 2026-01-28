"""
Migration script to add sessions table.
"""

import sqlite3
import os
from datetime import datetime

def run_migration():
    db_path = os.getenv("DATABASE_URL", "sqlite:///./ml-guru.db").replace("sqlite:///", "")
    conn = None
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # Check if table already exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'")
        if cursor.fetchone():
            print("sessions table already exists. Skipping migration.")
            return

        print("Creating sessions table...")
        
        # Create sessions table
        cursor.execute("""
            CREATE TABLE sessions (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                session_type TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                conversation_id TEXT NOT NULL,
                module_id TEXT,
                course_id TEXT,
                attempt_id TEXT,
                started_at TIMESTAMP NOT NULL,
                ended_at TIMESTAMP,
                last_activity_at TIMESTAMP NOT NULL,
                agent_name TEXT,
                agent_metadata TEXT,
                session_state TEXT,
                session_metadata TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (conversation_id) REFERENCES conversations(id),
                FOREIGN KEY (module_id) REFERENCES modules(id),
                FOREIGN KEY (course_id) REFERENCES courses(id)
            )
        """)
        
        # Create indexes
        cursor.execute("CREATE INDEX idx_sessions_user_id ON sessions(user_id)")
        cursor.execute("CREATE INDEX idx_sessions_session_type ON sessions(session_type)")
        cursor.execute("CREATE INDEX idx_sessions_status ON sessions(status)")
        cursor.execute("CREATE INDEX idx_sessions_conversation_id ON sessions(conversation_id)")
        
        conn.commit()
        print("✓ Migration completed successfully!")

    except sqlite3.Error as e:
        print(f"Error during migration: {e}")
        if conn:
            conn.rollback()
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    run_migration()


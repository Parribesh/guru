"""
Migration script to rename 'metadata' column to 'session_metadata' in sessions table.
This fixes the SQLAlchemy reserved keyword conflict.
"""

import sqlite3
import os

def run_migration():
    db_path = os.getenv("DATABASE_URL", "sqlite:///./ml-guru.db").replace("sqlite:///", "")
    conn = None
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # Check if sessions table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'")
        if not cursor.fetchone():
            print("sessions table does not exist. Skipping migration.")
            return

        # Check if column already renamed
        cursor.execute("PRAGMA table_info(sessions)")
        columns = [row[1] for row in cursor.fetchall()]
        if "session_metadata" in columns:
            print("session_metadata column already exists. Skipping migration.")
            return

        if "metadata" not in columns:
            print("metadata column does not exist. Skipping migration.")
            return

        print("Renaming metadata column to session_metadata...")
        
        # SQLite doesn't support ALTER TABLE RENAME COLUMN directly in older versions
        # We need to recreate the table
        cursor.execute("""
            CREATE TABLE sessions_new (
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
        
        # Copy data from old table to new table
        cursor.execute("""
            INSERT INTO sessions_new 
            SELECT id, user_id, session_type, status, conversation_id, module_id, course_id, 
                   attempt_id, started_at, ended_at, last_activity_at, agent_name, 
                   agent_metadata, session_state, metadata
            FROM sessions
        """)
        
        # Drop old table
        cursor.execute("DROP TABLE sessions")
        
        # Rename new table
        cursor.execute("ALTER TABLE sessions_new RENAME TO sessions")
        
        # Recreate indexes
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_session_type ON sessions(session_type)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_conversation_id ON sessions(conversation_id)")
        
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


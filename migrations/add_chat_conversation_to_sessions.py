"""
Migration: add chat_conversation_id to sessions for learning sessions.

Learning sessions have two conversations: lesson (tutor) and chat (Q&A).
conversation_id = lesson, chat_conversation_id = chat.
"""

import sqlite3
import os


def run_migration():
    db_path = os.getenv("DATABASE_URL", "sqlite:///./ml-guru.db").replace("sqlite:///", "")
    conn = None
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'"
        )
        if not cursor.fetchone():
            print("sessions table not found. Skipping.")
            return

        cursor.execute(
            "SELECT 1 FROM pragma_table_info('sessions') WHERE name='chat_conversation_id'"
        )
        if cursor.fetchone():
            print("sessions.chat_conversation_id already exists. Skipping.")
            return

        print("Adding chat_conversation_id to sessions...")
        cursor.execute(
            "ALTER TABLE sessions ADD COLUMN chat_conversation_id TEXT REFERENCES conversations(id)"
        )
        conn.commit()
        print("✓ Migration add_chat_conversation_to_sessions completed successfully!")

    except sqlite3.Error as e:
        print(f"Error during migration: {e}")
        if conn:
            conn.rollback()
    finally:
        if conn:
            conn.close()


if __name__ == "__main__":
    run_migration()

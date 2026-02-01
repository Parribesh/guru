"""
Migration: add objective-level progression.

- module_progress: add completed_objectives (JSON list of int indices).
- sessions: add objective_index (INTEGER, nullable) for learning sessions.
"""

import sqlite3
import os


def run_migration():
    db_path = os.getenv("DATABASE_URL", "sqlite:///./ml-guru.db").replace("sqlite:///", "")
    conn = None
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # module_progress: add completed_objectives
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='module_progress'"
        )
        if cursor.fetchone():
            try:
                cursor.execute(
                    "ALTER TABLE module_progress ADD COLUMN completed_objectives TEXT DEFAULT '[]'"
                )
                print("module_progress: added completed_objectives")
            except sqlite3.OperationalError as e:
                if "duplicate column" in str(e).lower():
                    print("module_progress.completed_objectives already exists. Skipping.")
                else:
                    raise
        else:
            print("module_progress table not found. Skipping column add.")

        # sessions: add objective_index
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'"
        )
        if cursor.fetchone():
            try:
                cursor.execute(
                    "ALTER TABLE sessions ADD COLUMN objective_index INTEGER"
                )
                print("sessions: added objective_index")
            except sqlite3.OperationalError as e:
                if "duplicate column" in str(e).lower():
                    print("sessions.objective_index already exists. Skipping.")
                else:
                    raise
        else:
            print("sessions table not found. Skipping column add.")

        conn.commit()
        print("✓ Migration add_module_progression completed successfully!")

    except sqlite3.Error as e:
        print(f"Error during migration: {e}")
        if conn:
            conn.rollback()
    finally:
        if conn:
            conn.close()


if __name__ == "__main__":
    run_migration()

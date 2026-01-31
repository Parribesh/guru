"""
Migration: add state_snapshot to syllabus_runs for LangGraph state persistence.
"""

import os
import sqlite3


def run_migration():
    db_path = os.getenv("DATABASE_URL", "sqlite:///./ml-guru.db").replace("sqlite:///", "")
    conn = None
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='syllabus_runs'"
        )
        if not cursor.fetchone():
            print("syllabus_runs table does not exist. Skipping migration.")
            return
        cursor.execute(
            "SELECT 1 FROM pragma_table_info('syllabus_runs') WHERE name='state_snapshot'"
        )
        if cursor.fetchone():
            print("state_snapshot column already exists. Skipping migration.")
            return
        print("Adding state_snapshot to syllabus_runs...")
        cursor.execute(
            "ALTER TABLE syllabus_runs ADD COLUMN state_snapshot TEXT"
        )
        conn.commit()
        print("Done.")
    finally:
        if conn:
            conn.close()


if __name__ == "__main__":
    run_migration()

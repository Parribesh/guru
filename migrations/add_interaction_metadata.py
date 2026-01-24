#!/usr/bin/env python3
"""
Migration: Add interaction_metadata column to messages table.

This migration adds the interaction_metadata JSON column to store
retrieved history and system prompt metadata for each interaction.
"""

import sqlite3
import sys
from pathlib import Path

# Get database path from environment or use default
DB_PATH = Path(__file__).parent.parent / "ml-guru.db"

def migrate():
    """Add interaction_metadata column to messages table."""
    if not DB_PATH.exists():
        print(f"Database not found at {DB_PATH}")
        return
    
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()
    
    try:
        # Check if column already exists
        cursor.execute("PRAGMA table_info(messages)")
        columns = [row[1] for row in cursor.fetchall()]
        
        if "interaction_metadata" in columns:
            print("Column 'interaction_metadata' already exists. Migration not needed.")
            return
        
        # Add the column
        print("Adding interaction_metadata column to messages table...")
        cursor.execute("""
            ALTER TABLE messages 
            ADD COLUMN interaction_metadata TEXT
        """)
        
        conn.commit()
        print("✓ Migration completed successfully!")
        
    except Exception as e:
        conn.rollback()
        print(f"✗ Migration failed: {e}")
        sys.exit(1)
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()


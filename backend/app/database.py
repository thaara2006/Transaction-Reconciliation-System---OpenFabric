import sqlite3
from contextlib import contextmanager
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
DATABASE_PATH = BACKEND_DIR / "data" / "reconciliation.db"


@contextmanager
def get_connection():
    """Open a SQLite connection and close it after use."""
    if not DATABASE_PATH.is_file():
        raise FileNotFoundError(
            f"Database not found: {DATABASE_PATH}. "
            "Place reconciliation.db inside the backend/data folder."
        )

    connection = sqlite3.connect(DATABASE_PATH, timeout=15)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")

    try:
        yield connection
    finally:
        connection.close()


def initialize_upload_history():
    """Create upload tables and safely migrate existing upload history."""
    if not DATABASE_PATH.is_file():
        raise FileNotFoundError(
            f"Database not found: {DATABASE_PATH}"
        )

    with sqlite3.connect(DATABASE_PATH, timeout=15) as connection:
        connection.execute("PRAGMA foreign_keys = ON")

        connection.execute("""
            CREATE TABLE IF NOT EXISTS upload_history (
                upload_id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL,
                upload_type TEXT NOT NULL
                    CHECK (upload_type IN ('TRANSACTIONS', 'SETTLEMENTS')),
                imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                rows_received INTEGER NOT NULL DEFAULT 0,
                rows_processed INTEGER NOT NULL DEFAULT 0,
                duplicates_skipped INTEGER NOT NULL DEFAULT 0,
                errors_count INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL,
                message TEXT
            )
        """)

        # Add the file path to an existing table without deleting its data.
        columns = {
            row[1]
            for row in connection.execute(
                "PRAGMA table_info(upload_history)"
            ).fetchall()
        }

        if "stored_path" not in columns:
            connection.execute("""
                ALTER TABLE upload_history
                ADD COLUMN stored_path TEXT
            """)

        # Preserve every original CSV data row as JSON.
        connection.execute("""
            CREATE TABLE IF NOT EXISTS uploaded_csv_records (
                record_id INTEGER PRIMARY KEY AUTOINCREMENT,
                upload_id INTEGER NOT NULL,
                row_number INTEGER NOT NULL,
                record_data TEXT NOT NULL,
                FOREIGN KEY (upload_id)
                    REFERENCES upload_history(upload_id)
                    ON DELETE CASCADE,
                UNIQUE (upload_id, row_number)
            )
        """)

        connection.execute("""
            CREATE INDEX IF NOT EXISTS
            idx_uploaded_csv_records_upload_id
            ON uploaded_csv_records(upload_id)
        """)

        # Migration: add settlement_status if missing
        columns = {
            row[1]
            for row in connection.execute(
                "PRAGMA table_info(upload_history)"
            ).fetchall()
        }
        if "settlement_status" not in columns:
            connection.execute("""
                ALTER TABLE upload_history
                ADD COLUMN settlement_status TEXT NOT NULL DEFAULT 'PENDING'
            """)

        connection.commit()

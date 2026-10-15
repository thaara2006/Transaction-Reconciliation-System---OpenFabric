"""
csv_archive_db.py
=================
Dedicated SQLite database for permanent original-CSV archiving.
This is SEPARATE from reconciliation.db and must never touch that database.
"""

import hashlib
import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
ARCHIVE_DB_PATH = BACKEND_DIR / "data" / "csv_archive.db"
ARCHIVE_FILE_DIR = BACKEND_DIR / "data" / "csv_archive"

# ---------------------------------------------------------------------------
# Connection helper
# ---------------------------------------------------------------------------

@contextmanager
def get_archive_connection():
    """Open a connection to the CSV archive database."""
    ARCHIVE_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(ARCHIVE_DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    try:
        yield conn
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Schema initialisation (called at application startup)
# ---------------------------------------------------------------------------

def initialize_csv_archive():
    """Create archive tables if they do not yet exist. Safe to call repeatedly."""
    ARCHIVE_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    ARCHIVE_FILE_DIR.mkdir(parents=True, exist_ok=True)

    with sqlite3.connect(ARCHIVE_DB_PATH, timeout=15) as conn:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")

        # Main upload metadata table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS csv_uploads (
                upload_id    TEXT PRIMARY KEY,
                filename     TEXT NOT NULL,
                upload_type  TEXT NOT NULL
                    CHECK (upload_type IN ('TRANSACTIONS', 'SETTLEMENTS')),
                uploaded_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
                file_size    INTEGER NOT NULL DEFAULT 0,
                content_type TEXT,
                checksum_sha256 TEXT NOT NULL,
                archive_status  TEXT NOT NULL DEFAULT 'ARCHIVED'
                    CHECK (archive_status IN ('ARCHIVED', 'FAILED')),
                reconciliation_status TEXT NOT NULL DEFAULT 'PENDING'
                    CHECK (reconciliation_status IN (
                        'PENDING', 'PROCESSED', 'FAILED', 'SKIPPED'
                    )),
                rows_received   INTEGER NOT NULL DEFAULT 0,
                rows_processed  INTEGER NOT NULL DEFAULT 0,
                error_details   TEXT,
                original_headers TEXT
            )
        """)

        # Original CSV rows stored as JSON (one row per data record)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS csv_records (
                record_id   INTEGER PRIMARY KEY AUTOINCREMENT,
                upload_id   TEXT NOT NULL,
                row_number  INTEGER NOT NULL,
                record_json TEXT NOT NULL,
                FOREIGN KEY (upload_id)
                    REFERENCES csv_uploads(upload_id)
                    ON DELETE CASCADE,
                UNIQUE (upload_id, row_number)
            )
        """)

        # Index on upload_id for fast record retrieval
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_csv_records_upload
            ON csv_records(upload_id)
        """)

        # Index for listing + filtering uploads
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_csv_uploads_uploaded_at
            ON csv_uploads(uploaded_at DESC)
        """)

        # Migration: add settlement_status column if it doesn't exist
        existing_cols = {
            row[1]
            for row in conn.execute(
                "PRAGMA table_info(csv_uploads)"
            ).fetchall()
        }
        if "settlement_status" not in existing_cols:
            conn.execute("""
                ALTER TABLE csv_uploads
                ADD COLUMN settlement_status TEXT NOT NULL DEFAULT 'PENDING'
            """)

        conn.commit()


# ---------------------------------------------------------------------------
# Archive helpers
# ---------------------------------------------------------------------------

def _compute_sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def _store_file(upload_id: str, content: bytes, filename: str) -> Path:
    """Write original bytes to the dedicated archive directory."""
    ARCHIVE_FILE_DIR.mkdir(parents=True, exist_ok=True)
    # Use upload_id prefix to guarantee uniqueness even with identical filenames.
    safe_name = Path(filename).name  # strip any path separators
    dest = ARCHIVE_FILE_DIR / f"{upload_id}_{safe_name}"
    dest.write_bytes(content)
    return dest


def archive_csv_upload(
    *,
    upload_id: str,
    filename: str,
    upload_type: str,
    content: bytes,
    content_type: str | None,
    reconciliation_status: str,
    settlement_status: str = "PENDING",
    rows_received: int,
    rows_processed: int,
    error_details: str | None,
    headers: list[str],
    records: list[dict],
):
    """
    Persist the original CSV file bytes and all parsed records in a single
    database transaction. If any step fails the whole archive entry is rolled
    back so partial uploads never appear as successful.

    Parameters
    ----------
    upload_id:              Unique identifier (usually a UUID string).
    filename:               Original filename as reported by the client.
    upload_type:            'TRANSACTIONS' or 'SETTLEMENTS'.
    content:                Raw file bytes exactly as received.
    content_type:           MIME type from the upload, may be None.
    reconciliation_status:  Outcome of reconciliation ('PROCESSED', 'FAILED', …).
    rows_received:          Number of CSV data rows parsed.
    rows_processed:         Number of rows successfully written to reconciliation DB.
    error_details:          Human-readable error string, or None on success.
    headers:                Ordered list of CSV column names.
    records:                List of dicts representing each CSV data row.
    """
    checksum = _compute_sha256(content)

    # Store original file bytes on disk
    _store_file(upload_id, content, filename)

    headers_json = json.dumps(headers, ensure_ascii=False)

    with get_archive_connection() as conn:
        with conn:
            conn.execute(
                """
                INSERT INTO csv_uploads (
                    upload_id,
                    filename,
                    upload_type,
                    file_size,
                    content_type,
                    checksum_sha256,
                    archive_status,
                    reconciliation_status,
                    settlement_status,
                    rows_received,
                    rows_processed,
                    error_details,
                    original_headers
                )
                VALUES (?, ?, ?, ?, ?, ?, 'ARCHIVED', ?, ?, ?, ?, ?, ?)
                """,
                (
                    upload_id,
                    filename,
                    upload_type,
                    len(content),
                    content_type,
                    checksum,
                    reconciliation_status,
                    settlement_status,
                    rows_received,
                    rows_processed,
                    error_details,
                    headers_json,
                ),
            )

            # Insert all records in one batch
            if records:
                conn.executemany(
                    """
                    INSERT INTO csv_records (upload_id, row_number, record_json)
                    VALUES (?, ?, ?)
                    """,
                    [
                        (upload_id, idx + 1, json.dumps(row, ensure_ascii=False))
                        for idx, row in enumerate(records)
                    ],
                )


def update_archive_upload_status(
    upload_id: str,
    *,
    reconciliation_status: str,
    rows_received: int | None = None,
    rows_processed: int | None = None,
    error_details: str | None = None,
):
    """Update archive processing status and metrics after processing finishes or fails."""
    with get_archive_connection() as conn:
        with conn:
            updates = ["reconciliation_status = ?"]
            params: list = [reconciliation_status]
            if rows_received is not None:
                updates.append("rows_received = ?")
                params.append(rows_received)
            if rows_processed is not None:
                updates.append("rows_processed = ?")
                params.append(rows_processed)
            if error_details is not None:
                updates.append("error_details = ?")
                params.append(error_details)
            params.append(upload_id)
            conn.execute(
                f"UPDATE csv_uploads SET {', '.join(updates)} WHERE upload_id = ?",
                params,
            )


# ---------------------------------------------------------------------------
# Query helpers (used by API endpoints)
# ---------------------------------------------------------------------------

def list_archived_uploads(
    *,
    search: str | None = None,
    upload_type: str | None = None,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[dict], int]:
    """Return a page of archived uploads together with the total count."""
    conditions = []
    params: list = []

    if search:
        conditions.append("filename LIKE ?")
        params.append(f"%{search}%")
    if upload_type and upload_type != "ALL":
        conditions.append("upload_type = ?")
        params.append(upload_type.upper())
    if status and status != "ALL":
        conditions.append("reconciliation_status = ?")
        params.append(status.upper())

    where = "WHERE " + " AND ".join(conditions) if conditions else ""

    with get_archive_connection() as conn:
        total = conn.execute(
            f"SELECT COUNT(*) AS n FROM csv_uploads {where}", params
        ).fetchone()["n"]

        rows = conn.execute(
            f"""
            SELECT
                upload_id, filename, upload_type, uploaded_at,
                file_size, checksum_sha256, archive_status,
                reconciliation_status,
                reconciliation_status AS status,
                settlement_status,
                rows_received, rows_processed,
                error_details
            FROM csv_uploads
            {where}
            ORDER BY uploaded_at DESC, upload_id DESC
            LIMIT ? OFFSET ?
            """,
            [*params, limit, offset],
        ).fetchall()

    return [dict(r) for r in rows], total


def get_archived_upload_detail(upload_id: str) -> dict | None:
    """Return metadata + headers for one archived upload, or None if not found."""
    with get_archive_connection() as conn:
        row = conn.execute(
            "SELECT * FROM csv_uploads WHERE upload_id = ?",
            (upload_id,),
        ).fetchone()

    if row is None:
        return None

    result = dict(row)
    try:
        result["original_headers"] = json.loads(result["original_headers"] or "[]")
    except (json.JSONDecodeError, TypeError):
        result["original_headers"] = []
    return result


def get_archived_records(
    upload_id: str,
    limit: int = 200,
    offset: int = 0,
) -> tuple[list[dict], int]:
    """Return a page of original CSV records for an upload."""
    with get_archive_connection() as conn:
        total = conn.execute(
            "SELECT COUNT(*) AS n FROM csv_records WHERE upload_id = ?",
            (upload_id,),
        ).fetchone()["n"]

        rows = conn.execute(
            """
            SELECT row_number, record_json
            FROM csv_records
            WHERE upload_id = ?
            ORDER BY row_number
            LIMIT ? OFFSET ?
            """,
            (upload_id, limit, offset),
        ).fetchall()

    records = []
    for r in rows:
        try:
            data = json.loads(r["record_json"])
        except (json.JSONDecodeError, TypeError):
            data = {}
        records.append({"row_number": r["row_number"], **data})

    return records, total


def get_archived_file_bytes(upload_id: str) -> tuple[bytes, str] | None:
    """
    Return (file_bytes, original_filename) for download, or None if not found.
    Reads from disk; the archive file is the canonical copy.
    """
    with get_archive_connection() as conn:
        row = conn.execute(
            "SELECT filename FROM csv_uploads WHERE upload_id = ?",
            (upload_id,),
        ).fetchone()

    if row is None:
        return None

    filename = row["filename"]
    safe_name = Path(filename).name

    # Find the archived file (upload_id prefix + original filename)
    candidate = ARCHIVE_FILE_DIR / f"{upload_id}_{safe_name}"
    if candidate.is_file():
        return candidate.read_bytes(), filename

    return None

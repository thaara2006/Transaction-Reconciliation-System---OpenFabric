from datetime import date
from decimal import Decimal
from pathlib import Path
import sqlite3
import uuid

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from app.database import get_connection, initialize_upload_history
from app.csv_archive_db import (
    initialize_csv_archive,
    archive_csv_upload,
    update_archive_upload_status,
    list_archived_uploads,
    get_archived_upload_detail,
    get_archived_records,
    get_archived_file_bytes,
)
from app.services.reconciliation_service import (
    reconcile_csv,
    detect_issues,
)
from app.services.dashboard_service import get_dashboard_summary
from app.services.upload_service import (
    import_transactions_csv,
    import_settlements_csv,
    save_upload_history,
    update_upload_history,
    list_upload_history,
)
from app.repositories.transaction_repository import (
    list_transactions,
    get_transaction,
    get_settlements,
)
from app.schemas import (
    TransactionResponse,
    TransactionDetailResponse,
    ReconciliationResponse,
    DashboardSummary,
)

app = FastAPI(
    title="Transaction Reconciliation System",
    description=(
        "API for transaction reconciliation, settlement tracking, "
        "manual CSV imports, and dashboard metrics."
    ),
    version="1.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "https://transaction-reconciliation-system-fzw6.onrender.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

CSV_PATH = Path(__file__).resolve().parents[1] / "settlement_report.csv"

# ---------------------------------------------------------------------------
# CSV file-size guard (10 MB)
# ---------------------------------------------------------------------------
MAX_CSV_BYTES = 10 * 1024 * 1024


@app.on_event("startup")
def startup():
    initialize_upload_history()
    initialize_csv_archive()


@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "TRS API"}


# ---------------------------------------------------------------------------
# Reconciliation
# ---------------------------------------------------------------------------

@app.post("/reconcile", response_model=ReconciliationResponse)
def run_reconciliation():
    try:
        return reconcile_csv(CSV_PATH)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    except sqlite3.Error as error:
        raise HTTPException(status_code=500, detail=f"Database error: {error}")


# ---------------------------------------------------------------------------
# CSV uploads (with archive)
# ---------------------------------------------------------------------------

@app.post("/uploads/transactions")
async def upload_transactions(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Upload a CSV file.")

    content = await file.read()
    await file.close()

    if not content:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    if len(content) > MAX_CSV_BYTES:
        raise HTTPException(status_code=413, detail="CSV file exceeds the 10 MB limit.")

    upload_id = str(uuid.uuid4())
    rows_received = 0
    rows_processed = 0
    headers = []
    records = []

    try:
        import csv, io as _io
        text = content.decode("utf-8-sig", errors="replace")
        reader = csv.DictReader(_io.StringIO(text))
        headers = [(f or "").strip() for f in (reader.fieldnames or [])]
        records = [
            {str(k).strip(): (v or "").strip() for k, v in row.items() if k}
            for row in reader
        ]
        rows_received = len(records)
    except Exception:
        pass

    # 1. Archive with PENDING status initially
    try:
        archive_csv_upload(
            upload_id=upload_id,
            filename=file.filename,
            upload_type="TRANSACTIONS",
            content=content,
            content_type=file.content_type,
            reconciliation_status="PENDING",
            settlement_status="PENDING",
            rows_received=rows_received,
            rows_processed=0,
            error_details=None,
            headers=headers,
            records=records,
        )
    except Exception:
        pass

    # 2. Record upload history with PENDING status
    upload_hist_id = save_upload_history(
        filename=file.filename,
        upload_type="TRANSACTIONS",
        rows_received=rows_received,
        rows_processed=0,
        duplicates_skipped=0,
        errors_count=0,
        status="PENDING",
        message="Processing transaction CSV...",
    )

    result = {}
    try:
        result = import_transactions_csv(file.filename, content, upload_id=upload_hist_id)
        rows_received = result.get("rows_received", rows_received)
        rows_processed = result.get("rows_processed", 0)
        update_archive_upload_status(
            upload_id=upload_id,
            reconciliation_status="PROCESSED",
            rows_received=rows_received,
            rows_processed=rows_processed,
        )
    except (ValueError, sqlite3.Error) as exc:
        error_details = str(exc)
        update_upload_history(
            upload_id=upload_hist_id,
            status="FAILED",
            rows_received=rows_received,
            rows_processed=0,
            duplicates_skipped=0,
            errors_count=1,
            message=error_details,
        )
        update_archive_upload_status(
            upload_id=upload_id,
            reconciliation_status="FAILED",
            rows_received=rows_received,
            rows_processed=0,
            error_details=error_details,
        )
        raise HTTPException(
            status_code=400 if isinstance(exc, ValueError) else 500,
            detail=error_details,
        )

    return {
        "message": "Transaction CSV imported successfully.",
        "archive_upload_id": upload_id,
        **result,
    }


@app.post("/uploads/settlements")
async def upload_settlements(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Upload a CSV file.")

    content = await file.read()
    await file.close()

    if not content:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    if len(content) > MAX_CSV_BYTES:
        raise HTTPException(status_code=413, detail="CSV file exceeds the 10 MB limit.")

    upload_id = str(uuid.uuid4())
    rows_received = 0
    rows_processed = 0
    headers = []
    records = []

    try:
        import csv, io as _io
        text = content.decode("utf-8-sig", errors="replace")
        reader = csv.DictReader(_io.StringIO(text))
        headers = [(f or "").strip() for f in (reader.fieldnames or [])]
        records = [
            {str(k).strip(): (v or "").strip() for k, v in row.items() if k}
            for row in reader
        ]
        rows_received = len(records)
    except Exception:
        pass

    # 1. Archive with PENDING status initially
    try:
        archive_csv_upload(
            upload_id=upload_id,
            filename=file.filename,
            upload_type="SETTLEMENTS",
            content=content,
            content_type=file.content_type,
            reconciliation_status="PENDING",
            settlement_status="PENDING",
            rows_received=rows_received,
            rows_processed=0,
            error_details=None,
            headers=headers,
            records=records,
        )
    except Exception:
        pass

    # 2. Record upload history with PENDING status
    upload_hist_id = save_upload_history(
        filename=file.filename,
        upload_type="SETTLEMENTS",
        rows_received=rows_received,
        rows_processed=0,
        duplicates_skipped=0,
        errors_count=0,
        status="PENDING",
        message="Processing settlement CSV...",
    )

    result = {}
    try:
        result = import_settlements_csv(file.filename, content, upload_id=upload_hist_id)
        rows_received = result.get("rows_received", rows_received)
        rows_processed = result.get("processed", 0)
        update_archive_upload_status(
            upload_id=upload_id,
            reconciliation_status="PROCESSED",
            rows_received=rows_received,
            rows_processed=rows_processed,
        )
    except (ValueError, FileNotFoundError, sqlite3.Error) as exc:
        error_details = str(exc)
        update_upload_history(
            upload_id=upload_hist_id,
            status="FAILED",
            rows_received=rows_received,
            rows_processed=0,
            duplicates_skipped=0,
            errors_count=1,
            message=error_details,
        )
        update_archive_upload_status(
            upload_id=upload_id,
            reconciliation_status="FAILED",
            rows_received=rows_received,
            rows_processed=0,
            error_details=error_details,
        )
        raise HTTPException(
            status_code=400 if isinstance(exc, ValueError) else 500,
            detail=error_details,
        )

    return {
        "message": "Settlement CSV processed successfully.",
        "archive_upload_id": upload_id,
        **result,
        "status": "PROCESSED",
    }


@app.get("/uploads")
def fetch_upload_history(
    limit: int = Query(default=50, ge=1, le=200),
):
    try:
        return list_upload_history(limit=limit)
    except sqlite3.Error as error:
        raise HTTPException(status_code=500, detail=f"Database error: {error}")


# ---------------------------------------------------------------------------
# CSV Archive endpoints
# ---------------------------------------------------------------------------

@app.get("/archive/uploads")
def fetch_archive_uploads(
    search: str | None = Query(default=None),
    upload_type: str | None = Query(default=None),
    status: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    """List archived CSV uploads with optional search and filter."""
    rows, total = list_archived_uploads(
        search=search,
        upload_type=upload_type,
        status=status,
        limit=limit,
        offset=offset,
    )
    return {"items": rows, "total": total, "limit": limit, "offset": offset}


@app.get("/archive/uploads/{upload_id}")
def fetch_archive_upload_detail(upload_id: str):
    """Return metadata and headers for a single archived upload."""
    if not upload_id or len(upload_id) > 64:
        raise HTTPException(status_code=400, detail="Invalid upload ID.")
    detail = get_archived_upload_detail(upload_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Archived upload not found.")
    return detail


@app.get("/archive/uploads/{upload_id}/records")
def fetch_archive_records(
    upload_id: str,
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    """Return paginated original CSV records for an archived upload with transaction status."""
    if not upload_id or len(upload_id) > 64:
        raise HTTPException(status_code=400, detail="Invalid upload ID.")
    detail = get_archived_upload_detail(upload_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Archived upload not found.")
    records, total = get_archived_records(upload_id, limit=limit, offset=offset)

    # Attach authoritative transaction reconciliation status
    txn_ids = {
        r.get("transaction_id")
        for r in records
        if r.get("transaction_id")
    }
    txn_status_map = {}
    if txn_ids:
        try:
            with get_connection() as conn:
                placeholders = ",".join("?" for _ in txn_ids)
                rows = conn.execute(
                    f"SELECT transaction_id, settlement_status FROM transactions WHERE transaction_id IN ({placeholders})",
                    list(txn_ids),
                ).fetchall()
                for row in rows:
                    txn_status_map[row["transaction_id"]] = row["settlement_status"]
        except Exception:
            pass

    for r in records:
        tid = r.get("transaction_id")
        r["reconciliation_status"] = txn_status_map.get(tid) if tid else None

    return {"records": records, "total": total, "limit": limit, "offset": offset}


@app.get("/archive/uploads/{upload_id}/download")
def download_archive_file(upload_id: str):
    """Download the exact original CSV bytes for an archived upload."""
    if not upload_id or len(upload_id) > 64:
        raise HTTPException(status_code=400, detail="Invalid upload ID.")
    result = get_archived_file_bytes(upload_id)
    if result is None:
        raise HTTPException(
            status_code=404, detail="Archive file not found."
        )
    file_bytes, filename = result
    safe_name = Path(filename).name
    return Response(
        content=file_bytes,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_name}"',
            "Content-Length": str(len(file_bytes)),
        },
    )


# ---------------------------------------------------------------------------
# Transactions
# ---------------------------------------------------------------------------

@app.get("/transactions", response_model=list[TransactionResponse])
def fetch_transactions(
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    status: str | None = Query(default=None),
    search: str | None = Query(default=None),
    sort_by: str | None = Query(default=None),
):
    try:
        rows = list_transactions(
            limit=limit,
            offset=offset,
            status=status.upper() if status else None,
            search=search,
            sort_by=sort_by,
        )

        results = []

        for row in rows:
            transaction = dict(row)
            settlements = [
                dict(item)
                for item in get_settlements(transaction["transaction_id"])
            ]

            net_amount = Decimal(
                str(transaction.get("total_settled_amount") or "0")
            )

            issues = detect_issues(
                transaction,
                net_amount,
                settlements,
                as_of=date.today(),
            )

            transaction["issues"] = [
                {
                    "severity": issue["severity"],
                    "message": issue["message"],
                    "recommendation": issue["recommendation"],
                }
                for issue in issues
            ]
            results.append(transaction)

        return results

    except sqlite3.Error as error:
        raise HTTPException(status_code=500, detail=f"Database error: {error}")


@app.get("/transactions/{transaction_id}", response_model=TransactionDetailResponse)
def fetch_transaction(transaction_id: str):
    try:
        row = get_transaction(transaction_id)

        if row is None:
            raise HTTPException(
                status_code=404,
                detail=f"Transaction {transaction_id} not found",
            )

        transaction = dict(row)
        settlements = [
            dict(item) for item in get_settlements(transaction_id)
        ]

        net_amount = Decimal(
            str(transaction.get("total_settled_amount") or "0")
        )

        issues = detect_issues(
            transaction,
            net_amount,
            settlements,
            as_of=date.today(),
        )

        transaction["issues"] = [
            {
                "severity": issue["severity"],
                "message": issue["message"],
                "recommendation": issue["recommendation"],
            }
            for issue in issues
        ]
        transaction["settlements"] = settlements
        return transaction

    except HTTPException:
        raise
    except sqlite3.Error as error:
        raise HTTPException(status_code=500, detail=f"Database error: {error}")


@app.get("/dashboard/summary", response_model=DashboardSummary)
def fetch_dashboard_summary():
    try:
        return get_dashboard_summary()
    except sqlite3.Error as error:
        raise HTTPException(status_code=500, detail=f"Database error: {error}")
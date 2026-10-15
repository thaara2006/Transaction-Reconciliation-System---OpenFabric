
import csv
import io
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path
from tempfile import NamedTemporaryFile

from app.database import get_connection
from app.services.reconciliation_service import reconcile_csv


TRANSACTION_REQUIRED_FIELDS = {
    "transaction_id",
    "account_id",
    "merchant_name",
    "transaction_date",
    "transaction_amount",
    "currency",
    "status",
}


def save_upload_history(
    filename,
    upload_type,
    rows_received,
    rows_processed,
    duplicates_skipped,
    errors_count,
    status,
    message="",
    settlement_status="PENDING",
):
    with get_connection() as connection:
        with connection:
            cursor = connection.execute(
                """
                INSERT INTO upload_history (
                    filename,
                    upload_type,
                    rows_received,
                    rows_processed,
                    duplicates_skipped,
                    errors_count,
                    status,
                    message,
                    settlement_status
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    filename,
                    upload_type,
                    rows_received,
                    rows_processed,
                    duplicates_skipped,
                    errors_count,
                    status,
                    message,
                    settlement_status,
                ),
            )
            upload_id = cursor.lastrowid

    return upload_id


def update_upload_history(
    upload_id,
    *,
    status,
    rows_received=None,
    rows_processed=None,
    duplicates_skipped=None,
    errors_count=None,
    message=None,
    settlement_status=None,
):
    with get_connection() as connection:
        with connection:
            updates = ["status = ?"]
            params = [status]
            if rows_received is not None:
                updates.append("rows_received = ?")
                params.append(rows_received)
            if rows_processed is not None:
                updates.append("rows_processed = ?")
                params.append(rows_processed)
            if duplicates_skipped is not None:
                updates.append("duplicates_skipped = ?")
                params.append(duplicates_skipped)
            if errors_count is not None:
                updates.append("errors_count = ?")
                params.append(errors_count)
            if message is not None:
                updates.append("message = ?")
                params.append(message)
            if settlement_status is not None:
                updates.append("settlement_status = ?")
                params.append(settlement_status)
            params.append(upload_id)
            connection.execute(
                f"UPDATE upload_history SET {', '.join(updates)} WHERE upload_id = ?",
                params,
            )


def list_upload_history(limit=50):
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT *
            FROM upload_history
            ORDER BY imported_at DESC, upload_id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

        return [dict(row) for row in rows]


def import_transactions_csv(filename, content, upload_id=None):
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise ValueError("CSV must use UTF-8 encoding.") from None

    reader = csv.DictReader(io.StringIO(text))

    if not reader.fieldnames:
        raise ValueError("CSV is empty or has no header.")

    reader.fieldnames = [
        (field or "").strip() for field in reader.fieldnames
    ]

    missing = TRANSACTION_REQUIRED_FIELDS - set(reader.fieldnames)

    if missing:
        raise ValueError(
            "Missing transaction CSV columns: "
            + ", ".join(sorted(missing))
        )

    rows = list(reader)

    if not rows:
        raise ValueError("CSV contains no transaction records.")

    validated = []
    seen_ids = set()

    for line_number, original in enumerate(rows, start=2):
        row = {
            str(key).strip(): (value or "").strip()
            for key, value in original.items()
            if key is not None
        }

        missing_values = [
            field
            for field in TRANSACTION_REQUIRED_FIELDS
            if not row.get(field)
        ]

        if missing_values:
            raise ValueError(
                f"Row {line_number}: missing "
                + ", ".join(sorted(missing_values))
            )

        transaction_id = row["transaction_id"]

        if transaction_id in seen_ids:
            raise ValueError(
                f"Row {line_number}: duplicate transaction ID "
                f"{transaction_id} within the uploaded file."
            )

        seen_ids.add(transaction_id)

        try:
            date.fromisoformat(row["transaction_date"])
        except ValueError:
            raise ValueError(
                f"Row {line_number}: transaction_date must be YYYY-MM-DD."
            ) from None

        try:
            amount = Decimal(row["transaction_amount"])
        except (InvalidOperation, ValueError):
            raise ValueError(
                f"Row {line_number}: invalid transaction_amount."
            ) from None

        if not amount.is_finite() or amount <= 0:
            raise ValueError(
                f"Row {line_number}: transaction_amount must be positive."
            )

        currency = row["currency"].upper()

        if len(currency) != 3 or not currency.isalpha():
            raise ValueError(
                f"Row {line_number}: currency must be a 3-letter code."
            )

        validated.append(
            {
                "transaction_id": transaction_id,
                "lifecycle_id": row.get("lifecycle_id") or None,
                "account_id": row["account_id"],
                "merchant_name": row["merchant_name"],
                "transaction_date": row["transaction_date"],
                "transaction_amount": str(amount),
                "currency": currency,
                "status": row["status"].upper(),
            }
        )

    processed = 0
    duplicates = 0

    with get_connection() as connection:
        with connection:
            for row in validated:
                exists = connection.execute(
                    """
                    SELECT transaction_id
                    FROM transactions
                    WHERE transaction_id = ?
                    """,
                    (row["transaction_id"],),
                ).fetchone()

                if exists:
                    duplicates += 1
                    continue

                connection.execute(
                    """
                    INSERT INTO transactions (
                        transaction_id,
                        lifecycle_id,
                        account_id,
                        merchant_name,
                        transaction_date,
                        transaction_amount,
                        currency,
                        status,
                        settlement_status,
                        total_settled_amount
                    )
                    VALUES (
                        ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', '0.00'
                    )
                    """,
                    (
                        row["transaction_id"],
                        row["lifecycle_id"],
                        row["account_id"],
                        row["merchant_name"],
                        row["transaction_date"],
                        row["transaction_amount"],
                        row["currency"],
                        row["status"],
                    ),
                )

                processed += 1

    if upload_id is not None:
        update_upload_history(
            upload_id=upload_id,
            status="PROCESSED",
            rows_received=len(rows),
            rows_processed=processed,
            duplicates_skipped=duplicates,
            errors_count=0,
            message="Transaction import completed.",
        )
    else:
        save_upload_history(
            filename=filename,
            upload_type="TRANSACTIONS",
            rows_received=len(rows),
            rows_processed=processed,
            duplicates_skipped=duplicates,
            errors_count=0,
            status="PROCESSED",
            message="Transaction import completed.",
            settlement_status="PENDING",
        )

    return {
        "upload_type": "TRANSACTIONS",
        "rows_received": len(rows),
        "rows_processed": processed,
        "duplicates_skipped": duplicates,
        "status": "PROCESSED",
    }


def import_settlements_csv(filename, content, upload_id=None):
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise ValueError("CSV must use UTF-8 encoding.") from None

    reader = csv.DictReader(io.StringIO(text))

    if not reader.fieldnames:
        raise ValueError("CSV is empty or has no header.")

    reader.fieldnames = [
        (field or "").strip() for field in reader.fieldnames
    ]

    rows = list(reader)

    if not rows:
        raise ValueError("CSV contains no settlement records.")

    temp_path = None

    try:
        with NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            newline="",
            suffix=".csv",
            delete=False,
        ) as temp_file:
            temp_file.write(text)
            temp_path = Path(temp_file.name)

        result = reconcile_csv(temp_path)

    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)

    msg = (
        f"{len(result['unmatched'])} unmatched settlement(s)."
        if result["unmatched"]
        else "Settlement import and reconciliation completed."
    )

    if upload_id is not None:
        update_upload_history(
            upload_id=upload_id,
            status="PROCESSED",
            rows_received=len(rows),
            rows_processed=result["processed"],
            duplicates_skipped=result["duplicates"],
            errors_count=len(result["unmatched"]),
            message=msg,
        )
    else:
        save_upload_history(
            filename=filename,
            upload_type="SETTLEMENTS",
            rows_received=len(rows),
            rows_processed=result["processed"],
            duplicates_skipped=result["duplicates"],
            errors_count=len(result["unmatched"]),
            status="PROCESSED",
            message=msg,
            settlement_status="PROCESSED",
        )

    return {
        "upload_type": "SETTLEMENTS",
        **result,
        "status": "PROCESSED",
    }
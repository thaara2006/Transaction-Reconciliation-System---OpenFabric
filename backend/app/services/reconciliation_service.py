
import csv
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path

from app.database import get_connection


CENT = Decimal("0.01")

REQUIRED_FIELDS = {
    "settlement_id",
    "lifecycle_id",
    "account_id",
    "merchant_name",
    "transaction_date",
    "settlement_date",
    "settlement_amount",
    "settlement_type",
    "currency",
}


def calculate_net_settlement(settlements):
    """Calculate debit amounts minus credit amounts."""

    total = Decimal("0.00")

    for settlement in settlements:
        amount = Decimal(str(settlement["settlement_amount"]))
        settlement_type = settlement["settlement_type"].upper()

        if settlement_type == "DEBIT":
            total += amount
        elif settlement_type == "CREDIT":
            total -= amount
        else:
            raise ValueError(
                f"Invalid settlement type: {settlement_type}"
            )

    return total.quantize(CENT)


def determine_settlement_status(
    transaction_amount,
    net_amount,
    settlements,
    transaction_status,
):
    if transaction_status in ("FAILED", "DECLINED"):
        return "NOT_APPLICABLE"

    if not settlements:
        return "PENDING"

    transaction_amount = Decimal(str(transaction_amount)).quantize(CENT)
    net_amount = Decimal(str(net_amount)).quantize(CENT)

    if net_amount > transaction_amount:
        return "OVER_SETTLED"

    if net_amount == Decimal("0.00") and any(
        str(s["settlement_type"]).upper() == "CREDIT"
        for s in settlements
    ):
        return "REFUNDED"

    if net_amount == transaction_amount:
        return "FULLY_SETTLED"

    return "PARTIAL"


def detect_issues(
    transaction,
    net_amount,
    settlements,
    as_of=None,
):
    """Identify critical settlement issues and warnings."""

    if transaction["status"] != "COMPLETED":
        return []

    today = as_of or date.today()
    transaction_date = date.fromisoformat(
        str(transaction["transaction_date"])
    )

    amount = Decimal(str(transaction["transaction_amount"]))
    net = Decimal(str(net_amount))

    has_credit = any(
        row["settlement_type"].upper() == "CREDIT"
        for row in settlements
    )

    issues = []

    if net > amount:
        issues.append({
            "severity": "CRITICAL",
            "message": "Settlement exceeds the transaction amount.",
            "recommendation": (
                "Review the settlement records and investigate "
                "the excess amount."
            ),
        })

    if not settlements and (today - transaction_date).days > 7:
        issues.append({
            "severity": "CRITICAL",
            "message": "No settlement received within 7 days.",
            "recommendation": (
                "Contact the settlement provider and investigate "
                "the missing settlement."
            ),
        })

    if net < amount and not has_credit:
        issues.append({
            "severity": "WARNING",
            "message": "Outstanding settlement amount remains.",
            "recommendation": (
                "Check whether the remaining amount is pending "
                "or missing."
            ),
        })

    return issues


def validate_settlement(raw_row):
    """Validate one CSV settlement record."""

    row = {
        str(key).strip(): str(value or "").strip()
        for key, value in raw_row.items()
        if key is not None
    }

    missing = [
        field
        for field in REQUIRED_FIELDS
        if field != "lifecycle_id" and not row.get(field)
    ]

    if missing:
        raise ValueError(
            "Missing required field(s): "
            + ", ".join(sorted(missing))
        )

    if not row["settlement_id"]:
        raise ValueError("settlement_id cannot be empty.")

    row["settlement_type"] = row["settlement_type"].upper()

    if row["settlement_type"] not in {"DEBIT", "CREDIT"}:
        raise ValueError(
            "settlement_type must be DEBIT or CREDIT."
        )

    row["currency"] = row["currency"].upper()

    if (
        len(row["currency"]) != 3
        or not row["currency"].isalpha()
    ):
        raise ValueError(
            "currency must be a three-letter code."
        )

    try:
        amount = Decimal(row["settlement_amount"])
    except (InvalidOperation, ValueError):
        raise ValueError(
            "settlement_amount must be numeric."
        ) from None

    if not amount.is_finite() or amount <= 0:
        raise ValueError(
            "settlement_amount must be greater than zero."
        )

    if amount.as_tuple().exponent < -2:
        raise ValueError(
            "settlement_amount cannot have more than "
            "two decimal places."
        )

    for field in ("transaction_date", "settlement_date"):
        try:
            date.fromisoformat(row[field])
        except ValueError:
            raise ValueError(
                f"{field} must use YYYY-MM-DD format."
            ) from None

    row["lifecycle_id"] = row.get("lifecycle_id", "")
    row["settlement_amount"] = amount.quantize(CENT)

    return row


def find_transaction(connection, settlement):
    """Match by lifecycle ID, or use fallback fields if it is blank."""

    lifecycle_id = settlement["lifecycle_id"]

    if lifecycle_id:
        matches = connection.execute(
            """
            SELECT *
            FROM transactions
            WHERE lifecycle_id = ?
            """,
            (lifecycle_id,),
        ).fetchall()
    else:
        matches = connection.execute(
            """
            SELECT *
            FROM transactions
            WHERE account_id = ?
            AND LOWER(TRIM(merchant_name)) =
            LOWER(TRIM(?))
            AND transaction_date = ?
            """,
            (
                settlement["account_id"],
                settlement["merchant_name"],
                settlement["transaction_date"],
            ),
        ).fetchall()

    if len(matches) > 1:
        raise ValueError(
            f"Settlement {settlement['settlement_id']} "
            "matches multiple transactions."
        )

    return matches[0] if matches else None


def refresh_transaction_summaries(connection):
    """Recalculate settlement totals and statuses for all transactions."""

    transactions = connection.execute(
        "SELECT * FROM transactions"
    ).fetchall()

    for transaction in transactions:
        settlements = connection.execute(
            """
            SELECT settlement_amount, settlement_type,
                   settlement_date
            FROM settlement_history
            WHERE transaction_id = ?
            """,
            (transaction["transaction_id"],),
        ).fetchall()

        if transaction["status"] in {"FAILED", "DECLINED"}:
            connection.execute(
                """
                UPDATE transactions
                SET settlement_status = 'NOT_APPLICABLE',
                    total_settled_amount = '0.00',
                    last_settlement_date = NULL
                WHERE transaction_id = ?
                """,
                (transaction["transaction_id"],),
            )
            continue

        net_amount = calculate_net_settlement(settlements)

        status = determine_settlement_status(
            transaction["transaction_amount"],
            net_amount,
            settlements,
            transaction["status"],
        )

        last_date = max(
            (row["settlement_date"] for row in settlements),
            default=None,
        )

        connection.execute(
            """
            UPDATE transactions
            SET settlement_status = ?,
                total_settled_amount = ?,
                last_settlement_date = ?
            WHERE transaction_id = ?
            """,
            (
                status,
                str(net_amount),
                last_date,
                transaction["transaction_id"],
            ),
        )


def reconcile_csv(file_path):
    """Process the CSV and update the database atomically."""

    path = Path(file_path)

    if not path.is_file():
        raise FileNotFoundError(
            f"CSV file not found: {path}"
        )

    with path.open(
        "r",
        newline="",
        encoding="utf-8-sig",
    ) as file:
        reader = csv.DictReader(file)

        if not reader.fieldnames:
            raise ValueError(
                "CSV is empty or has no header."
            )

        reader.fieldnames = [
            name.strip() for name in reader.fieldnames
        ]

        missing_columns = REQUIRED_FIELDS - set(reader.fieldnames)

        if missing_columns:
            raise ValueError(
                "Missing CSV columns: "
                + ", ".join(sorted(missing_columns))
            )

        rows = [
            validate_settlement(row)
            for row in reader
        ]

    if not rows:
        raise ValueError(
            "CSV contains no settlement records."
        )

    result = {
        "processed": 0,
        "duplicates": 0,
        "unmatched": [],
        "updated_transactions": [],
        "issues": [],
    }

    with get_connection() as connection:
        with connection:
            seen_ids = set()

            for settlement in rows:
                settlement_id = settlement["settlement_id"]

                if settlement_id in seen_ids:
                    result["duplicates"] += 1
                    continue

                seen_ids.add(settlement_id)

                existing = connection.execute(
                    """
                    SELECT 1
                    FROM settlement_history
                    WHERE settlement_id = ?
                    """,
                    (settlement_id,),
                ).fetchone()

                if existing:
                    result["duplicates"] += 1
                    continue

                transaction = find_transaction(
                    connection,
                    settlement,
                )

                transaction_id = None

                if transaction:
                    if settlement["currency"] != transaction["currency"]:
                        raise ValueError(
                            f"Currency mismatch for settlement "
                            f"{settlement_id}."
                        )

                    if transaction["status"] in {
                        "FAILED",
                        "DECLINED",
                    }:
                        result["unmatched"].append(settlement_id)
                    else:
                        transaction_id = transaction["transaction_id"]
                else:
                    result["unmatched"].append(settlement_id)

                connection.execute(
                    """
                    INSERT INTO settlement_history (
                        settlement_id,
                        transaction_id,
                        lifecycle_id,
                        settlement_date,
                        settlement_amount,
                        settlement_type,
                        currency
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        settlement_id,
                        transaction_id,
                        settlement["lifecycle_id"] or None,
                        settlement["settlement_date"],
                        str(settlement["settlement_amount"]),
                        settlement["settlement_type"],
                        settlement["currency"],
                    ),
                )

                result["processed"] += 1

                if transaction_id:
                    result["updated_transactions"].append(
                        transaction_id
                    )

            refresh_transaction_summaries(connection)

            transactions = connection.execute(
                """
                SELECT *
                FROM transactions
                ORDER BY transaction_id
                """
            ).fetchall()

            for transaction in transactions:
                settlements = connection.execute(
                    """
                    SELECT settlement_amount, settlement_type,
                           settlement_date
                    FROM settlement_history
                    WHERE transaction_id = ?
                    """,
                    (transaction["transaction_id"],),
                ).fetchall()

                net_amount = calculate_net_settlement(settlements)

                for issue in detect_issues(
                    transaction,
                    net_amount,
                    settlements,
                ):
                    result["issues"].append({
                        "transaction_id": transaction["transaction_id"],
                        **issue,
                    })

    result["updated_transactions"] = sorted(
        set(result["updated_transactions"])
    )

    return result

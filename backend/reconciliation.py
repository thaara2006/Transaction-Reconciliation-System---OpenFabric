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


def determine_settlement_status(
    transaction_amount,
    net_settled_amount,
    has_settlement,
    has_credit=False,
):
    transaction_amount = Decimal(str(transaction_amount))
    net_settled_amount = Decimal(str(net_settled_amount))

    if not has_settlement:
        return "PENDING"

    if net_settled_amount > transaction_amount:
        return "OVER_SETTLED"

    if net_settled_amount == transaction_amount:
        return "FULLY_SETTLED"

    if has_credit and net_settled_amount >= 0:
        return "REFUNDED"

    return "PARTIAL"


def calculate_net_settlement(settlements):
    total = Decimal("0.00")

    for settlement in settlements:
        amount = Decimal(str(settlement["settlement_amount"]))
        settlement_type = str(settlement["settlement_type"]).upper()

        if settlement_type == "DEBIT":
            total += amount
        elif settlement_type == "CREDIT":
            total -= amount
        else:
            raise ValueError(
                f"Invalid settlement type: {settlement_type}"
            )

    return total.quantize(CENT)


def detect_reconciliation_issues(
    transaction_amount,
    net_settled_amount,
    transaction_date,
    has_settlement,
    transaction_status="COMPLETED",
    as_of=None,
    has_credit=False,
):
    amount = Decimal(str(transaction_amount))
    net_amount = Decimal(str(net_settled_amount))
    txn_date = date.fromisoformat(str(transaction_date))
    as_of = as_of or date.today()

    issues = []

    if transaction_status != "COMPLETED":
        return issues

    if net_amount > amount:
        issues.append({
            "severity": "CRITICAL",
            "message": "Settlement exceeds the transaction amount.",
        })

    if not has_settlement and (as_of - txn_date).days > 7:
        issues.append({
            "severity": "CRITICAL",
            "message": "No settlement received within 7 days.",
        })

    if net_amount < amount and not has_credit:
        issues.append({
            "severity": "WARNING",
            "message": "Outstanding settlement amount remains.",
        })

    return issues


def validate_settlement(row):
    row = {
        str(key).strip(): (value or "").strip()
        for key, value in row.items()
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

    settlement_type = row["settlement_type"].upper()

    if settlement_type not in {"DEBIT", "CREDIT"}:
        raise ValueError("Settlement type must be DEBIT or CREDIT.")

    currency = row["currency"].upper()

    if len(currency) != 3 or not currency.isalpha():
        raise ValueError("Currency must be a three-letter code.")

    try:
        amount = Decimal(row["settlement_amount"])
    except (InvalidOperation, ValueError):
        raise ValueError(
            "Settlement amount must be a valid number."
        ) from None

    if not amount.is_finite() or amount <= 0:
        raise ValueError(
            "Settlement amount must be greater than zero."
        )

    if amount.as_tuple().exponent < -2:
        raise ValueError(
            "Settlement amount cannot have more than 2 decimals."
        )

    for field in ("transaction_date", "settlement_date"):
        try:
            date.fromisoformat(row[field])
        except ValueError:
            raise ValueError(
                f"{field} must use YYYY-MM-DD format."
            ) from None

    row["lifecycle_id"] = row.get("lifecycle_id", "")
    row["settlement_type"] = settlement_type
    row["currency"] = currency
    row["settlement_amount"] = amount

    return row


def find_transaction(connection, settlement):
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
              AND LOWER(TRIM(merchant_name)) = LOWER(?)
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
            f"More than one transaction matches "
            f"{settlement['settlement_id']}."
        )

    return matches[0] if matches else None


def refresh_transaction_summaries(connection):
    transactions = connection.execute(
        "SELECT * FROM transactions"
    ).fetchall()

    for transaction in transactions:
        settlements = connection.execute(
            """
            SELECT settlement_amount, settlement_type, settlement_date
            FROM settlement_history
            WHERE transaction_id = ?
            """,
            (transaction["transaction_id"],),
        ).fetchall()

        net_amount = calculate_net_settlement(settlements)

        has_credit = any(
            row["settlement_type"] == "CREDIT"
            for row in settlements
        )

        status = determine_settlement_status(
            transaction["transaction_amount"],
            net_amount,
            bool(settlements),
            has_credit,
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


def reconcile_rows(rows):
    rows = [validate_settlement(row) for row in rows]

    if not rows:
        raise ValueError("The settlement file contains no records.")

    result = {
        "processed": 0,
        "duplicates": 0,
        "unmatched": [],
        "updated_transactions": [],
        "issues": [],
    }

    with get_connection() as connection:
        with connection:
            for settlement in rows:
                existing = connection.execute(
                    """
                    SELECT settlement_id
                    FROM settlement_history
                    WHERE settlement_id = ?
                    """,
                    (settlement["settlement_id"],),
                ).fetchone()

                if existing:
                    result["duplicates"] += 1
                    continue

                transaction = find_transaction(
                    connection, settlement
                )
                transaction_id = None

                if transaction:
                    if settlement["currency"] != transaction["currency"]:
                        raise ValueError(
                            f"Currency mismatch for "
                            f"{settlement['settlement_id']}."
                        )

                    transaction_id = transaction["transaction_id"]
                else:
                    result["unmatched"].append(
                        settlement["settlement_id"]
                    )

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
                        settlement["settlement_id"],
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
                SELECT transaction_id, transaction_amount,
                    transaction_date, status
                FROM transactions
                ORDER BY transaction_id
                """
            ).fetchall()

            for transaction in transactions:
                settlements = connection.execute(
                    """
                    SELECT settlement_amount, settlement_type
                    FROM settlement_history
                    WHERE transaction_id = ?
                    """,
                    (transaction["transaction_id"],),
                ).fetchall()

                net_amount = calculate_net_settlement(settlements)

                has_credit = any(
                    row["settlement_type"] == "CREDIT"
                    for row in settlements
                )

                issues = detect_reconciliation_issues(
                    transaction["transaction_amount"],
                    net_amount,
                    transaction["transaction_date"],
                    bool(settlements),
                    transaction["status"],
                    has_credit=has_credit,
                )

                for issue in issues:
                    result["issues"].append({
                        "transaction_id": transaction["transaction_id"],
                        **issue,
                    })

    result["updated_transactions"] = sorted(
        set(result["updated_transactions"])
    )

    return result


def reconcile_csv(file_path):
    path = Path(file_path)

    if not path.is_file():
        raise FileNotFoundError(f"CSV file not found: {path}")

    with path.open(
        "r",
        newline="",
        encoding="utf-8-sig",
    ) as file:
        reader = csv.DictReader(file)

        if not reader.fieldnames:
            raise ValueError("CSV file is empty or has no header.")

        reader.fieldnames = [
            name.strip() if name else name
            for name in reader.fieldnames
        ]

        missing = REQUIRED_FIELDS - set(reader.fieldnames)

        if missing:
            raise ValueError(
                "Missing CSV columns: "
                + ", ".join(sorted(missing))
            )

        rows = list(reader)

    return reconcile_rows(rows)


def print_report(result):
    print("\n========== RECONCILIATION REPORT ==========")
    print(f"Settlements processed : {result['processed']}")
    print(f"Duplicates skipped    : {result['duplicates']}")
    print(f"Unmatched settlements : {result['unmatched']}")
    print(f"Updated transactions  : {result['updated_transactions']}")
    print(f"Total issues detected : {len(result['issues'])}")

    for issue in result["issues"]:
        print(
            f"[{issue['severity']}] "
            f"{issue['transaction_id']}: {issue['message']}"
        )

    print("===========================================\n")


if __name__ == "__main__":
    csv_path = Path(__file__).resolve().parent / "settlement_report.csv"

    try:
        result = reconcile_csv(csv_path)
        print_report(result)
    except (ValueError, FileNotFoundError) as error:
        print(f"Reconciliation failed: {error}")

from datetime import date, datetime, timedelta
from collections import defaultdict
from datetime import date
from decimal import Decimal

from app.database import get_connection
from app.repositories.transaction_repository import (
    get_all_transactions,
    get_settlement_count,
    get_status_breakdown,
)
from app.services.reconciliation_service import (
    calculate_net_settlement,
    detect_issues,
)


def get_dashboard_summary():
    transactions = get_all_transactions()

    completed_transactions = [
        transaction
        for transaction in transactions
        if transaction["status"] == "COMPLETED"
    ]

    settlement_count = get_settlement_count()
    status_breakdown = get_status_breakdown()

    critical_transactions = set()
    warning_transactions = set()

    outstanding_by_currency = defaultdict(
        lambda: Decimal("0.00")
    )

    settlement_days = []
    fully_settled_count = 0

    with get_connection() as connection:
        for transaction in transactions:
            settlements = connection.execute(
                """
                SELECT
                    settlement_amount,
                    settlement_type,
                    settlement_date
                FROM settlement_history
                WHERE transaction_id = ?
                ORDER BY settlement_date
                """,
                (transaction["transaction_id"],),
            ).fetchall()

            net_amount = calculate_net_settlement(settlements)

            issues = detect_issues(
                transaction,
                net_amount,
                settlements,
            )

            for issue in issues:
                if issue["severity"] == "CRITICAL":
                    critical_transactions.add(
                        transaction["transaction_id"]
                    )
                elif issue["severity"] == "WARNING":
                    warning_transactions.add(
                        transaction["transaction_id"]
                    )

            if transaction["status"] != "COMPLETED":
                continue

            transaction_amount = Decimal(
                str(transaction["transaction_amount"])
            )

            has_credit = any(
                row["settlement_type"].upper() == "CREDIT"
                for row in settlements
            )

            if (
                net_amount < transaction_amount
                and not has_credit
            ):
                outstanding_by_currency[
                    transaction["currency"]
                ] += transaction_amount - net_amount

            if transaction["settlement_status"] == "FULLY_SETTLED":
                fully_settled_count += 1

                last_settlement_date = transaction[
                    "last_settlement_date"
                ]

                if last_settlement_date:
                    start_date = date.fromisoformat(
                        str(transaction["transaction_date"])
                    )
                    end_date = date.fromisoformat(
                        str(last_settlement_date)
                    )

                    settlement_days.append(
                        max(0, (end_date - start_date).days)
                    )

    completed_count = len(completed_transactions)

    average_days = (
        round(
            sum(settlement_days) / len(settlement_days),
            2,
        )
        if settlement_days
        else 0.0
    )

    settlement_rate = (
        round(
            fully_settled_count / completed_count * 100,
            2,
        )
        if completed_count
        else 0.0
    )

    now = datetime.now()
    current_start = now - timedelta(days=30)
    previous_start = current_start - timedelta(days=30)

    with get_connection() as connection:
        current_volume = connection.execute(
            """
            SELECT COUNT(*) AS total
            FROM transactions
            WHERE datetime(created_at) >= datetime(?)
            AND datetime(created_at) <= datetime(?)
            """,
            (current_start.isoformat(), now.isoformat()),
        ).fetchone()["total"]

        previous_volume = connection.execute(
            """
            SELECT COUNT(*) AS total
            FROM transactions
            WHERE datetime(created_at) >= datetime(?)
            AND datetime(created_at) < datetime(?)
            """,
            (previous_start.isoformat(), current_start.isoformat()),
        ).fetchone()["total"]

    volume_change = (
        round(
            (current_volume - previous_volume)
            / previous_volume * 100,
            1,
        )
        if previous_volume > 0
        else None
    )


    return {
        "total_transactions": len(transactions),
        "completed_transactions": completed_count,
        "settlements_processed": settlement_count,
        "status_breakdown": status_breakdown,
        "critical_issue_count": len(critical_transactions),
        "warning_issue_count": len(warning_transactions),
        "total_outstanding_by_currency": {
            currency: str(amount.quantize(Decimal("0.01")))
            for currency, amount in sorted(
                outstanding_by_currency.items()
            )
        },
        "average_days_to_settle": average_days,
        "settlement_rate": settlement_rate,
        "transaction_volume_change_percent": volume_change,
        "previous_period_transactions": previous_volume,
        "transaction_volume_period_days": 30,
    }

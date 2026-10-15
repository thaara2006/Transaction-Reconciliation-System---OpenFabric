from decimal import Decimal

from reconciliation import (
    calculate_net_settlement,
    determine_settlement_status,
)

from datetime import date

from reconciliation import detect_reconciliation_issues

def test_over_settlement_is_critical():
    issues = detect_reconciliation_issues(
        "100.00", "120.00", "2025-08-01", True,
        as_of=date(2025, 8, 10),
    )
    assert any(issue["severity"] == "CRITICAL" for issue in issues)


def test_missing_settlement_after_seven_days():
    issues = detect_reconciliation_issues(
        "100.00", "0.00", "2025-08-01", False,
        as_of=date(2025, 8, 10),
    )
    assert any(
        "No settlement" in issue["message"] for issue in issues
    )


def test_partial_settlement_is_warning():
    issues = detect_reconciliation_issues(
        "100.00", "70.00", "2025-08-01", True,
        as_of=date(2025, 8, 10),
    )
    assert any(issue["severity"] == "WARNING" for issue in issues)

def test_full_settlement():
    assert determine_settlement_status(
        "100.00", "100.00", True
    ) == "FULLY_SETTLED"


def test_partial_settlement():
    assert determine_settlement_status(
        "100.00", "70.00", True
    ) == "PARTIAL"


def test_over_settlement():
    assert determine_settlement_status(
        "100.00", "120.00", True
    ) == "OVER_SETTLED"


def test_pending_settlement():
    assert determine_settlement_status(
        "100.00", "0.00", False
    ) == "PENDING"


def test_refunded_transaction():
    assert determine_settlement_status(
        "100.00", "70.00", True, has_credit=True
    ) == "REFUNDED"


def test_debits_and_credits():
    settlements = [
        {"settlement_amount": "100.00", "settlement_type": "DEBIT"},
        {"settlement_amount": "30.00", "settlement_type": "CREDIT"},
    ]

    assert calculate_net_settlement(settlements) == Decimal("70.00")

def test_credit_without_debit_is_not_refunded():
    assert determine_settlement_status(
        "4.75", "-1.50", True, has_credit=True
    ) == "PARTIAL"


def test_list_transactions_sorting():
    from app.repositories.transaction_repository import list_transactions

    # Test sorting by newest
    txns_newest = list_transactions(limit=10, sort_by="newest")
    assert len(txns_newest) > 0
    dates = [t["transaction_date"] for t in txns_newest]
    assert dates == sorted(dates, reverse=True)

    # Test sorting by oldest
    txns_oldest = list_transactions(limit=10, sort_by="oldest")
    dates_oldest = [t["transaction_date"] for t in txns_oldest]
    assert dates_oldest == sorted(dates_oldest)

    # Test sorting by id_asc
    txns_id_asc = list_transactions(limit=10, sort_by="id_asc")
    ids = [t["transaction_id"] for t in txns_id_asc]
    assert ids == sorted(ids)

    # Test sorting by id_desc
    txns_id_desc = list_transactions(limit=10, sort_by="id_desc")
    ids_desc = [t["transaction_id"] for t in txns_id_desc]
    assert ids_desc == sorted(ids_desc, reverse=True)

    # Test sorting by amount_desc
    txns_amt_desc = list_transactions(limit=10, sort_by="amount_desc")
    amounts_desc = [float(t["transaction_amount"]) for t in txns_amt_desc]
    assert amounts_desc == sorted(amounts_desc, reverse=True)

    # Test sorting by amount_asc
    txns_amt_asc = list_transactions(limit=10, sort_by="amount_asc")
    amounts_asc = [float(t["transaction_amount"]) for t in txns_amt_asc]
    assert amounts_asc == sorted(amounts_asc)

    # Test sorting by status_asc
    txns_status_asc = list_transactions(limit=10, sort_by="status_asc")
    statuses = [t["settlement_status"] for t in txns_status_asc]
    assert statuses == sorted(statuses)


def test_archive_status_filter():
    from app.csv_archive_db import list_archived_uploads

    # Test filtering by status
    processed, total_proc = list_archived_uploads(status="PROCESSED")
    for item in processed:
        assert item["reconciliation_status"] == "PROCESSED"
        assert item["status"] == "PROCESSED"

    
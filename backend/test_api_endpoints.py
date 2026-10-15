import io
import time
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.csv_archive_db import list_archived_uploads
from app.services.upload_service import list_upload_history

client = TestClient(app)

def test_api_transactions_sorting():
    response = client.get("/transactions?sort_by=amount_desc")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    if len(data) >= 2:
        for i in range(len(data) - 1):
            assert float(data[i]["transaction_amount"]) >= float(data[i+1]["transaction_amount"])

    response_asc = client.get("/transactions?sort_by=amount_asc")
    assert response_asc.status_code == 200
    data_asc = response_asc.json()
    if len(data_asc) >= 2:
        for i in range(len(data_asc) - 1):
            assert float(data_asc[i]["transaction_amount"]) <= float(data_asc[i+1]["transaction_amount"])

    response_oldest = client.get("/transactions?sort_by=oldest")
    assert response_oldest.status_code == 200

    response_id = client.get("/transactions?sort_by=id_asc")
    assert response_id.status_code == 200

def test_archive_uploads_and_filtering():
    # Test all statuses
    resp_all = client.get("/archive/uploads")
    assert resp_all.status_code == 200
    all_uploads = resp_all.json()["items"]
    assert isinstance(all_uploads, list)

    # Test status filter PROCESSED
    resp_processed = client.get("/archive/uploads?status=PROCESSED")
    assert resp_processed.status_code == 200
    processed_uploads = resp_processed.json()["items"]
    for item in processed_uploads:
        assert item["status"] == "PROCESSED"

def test_upload_lifecycle_success_and_failure():
    # 1. Test invalid CSV upload -> Should fail and be recorded as FAILED
    invalid_csv_content = b"invalid,headers,only\n1,2,3\n"
    resp_fail = client.post(
        "/uploads/transactions",
        files={"file": ("invalid_tx.csv", io.BytesIO(invalid_csv_content), "text/csv")}
    )
    assert resp_fail.status_code == 400

    # Verify that the failed upload was tracked with status FAILED
    history = list_upload_history(limit=5)
    latest_fail = next((h for h in history if h["filename"] == "invalid_tx.csv"), None)
    assert latest_fail is not None
    assert latest_fail["status"] == "FAILED"

    # Verify in archive DB as well
    archive_uploads, _ = list_archived_uploads(limit=5)
    latest_arch_fail = next((a for a in archive_uploads if a["filename"] == "invalid_tx.csv"), None)
    assert latest_arch_fail is not None
    assert latest_arch_fail["status"] == "FAILED"

    # 2. Test valid transaction CSV upload -> Should succeed and be recorded as PROCESSED
    unique_tx_id = f"TX_TEST_{int(time.time())}"
    valid_tx_csv = (
        f"transaction_id,account_id,merchant_name,transaction_amount,currency,status,transaction_date\n"
        f"{unique_tx_id},ACC_TEST,Test Merchant,150.00,USD,SALE,2026-10-15\n"
    ).encode("utf-8")

    resp_succ = client.post(
        "/uploads/transactions",
        files={"file": ("valid_tx.csv", io.BytesIO(valid_tx_csv), "text/csv")}
    )
    assert resp_succ.status_code == 200

    # Verify upload history
    history = list_upload_history(limit=5)
    latest_succ = next((h for h in history if h["filename"] == "valid_tx.csv"), None)
    assert latest_succ is not None
    assert latest_succ["status"] == "PROCESSED"

    # Verify in archive DB
    archive_uploads, _ = list_archived_uploads(limit=5)
    latest_arch_succ = next((a for a in archive_uploads if a["filename"] == "valid_tx.csv"), None)
    assert latest_arch_succ is not None
    assert latest_arch_succ["status"] == "PROCESSED"

    # Verify records preview endpoint returns row with reconciliation status
    resp_records = client.get(f"/archive/uploads/{latest_arch_succ['upload_id']}/records")
    assert resp_records.status_code == 200
    records_data = resp_records.json()
    assert "records" in records_data
    assert len(records_data["records"]) > 0
    record_row = records_data["records"][0]
    assert "reconciliation_status" in record_row
    assert record_row["reconciliation_status"] in ["PENDING", "UNSETTLED", "NOT_APPLICABLE"]

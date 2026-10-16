# Transaction Reconciliation System (TRS)

A full-stack transaction reconciliation application that matches transaction records with settlement reports, calculates net settlement amounts, identifies discrepancies, and presents reconciliation results in a dashboard.

## Overview

Financial transactions may receive one or more settlement entries. TRS compares transaction amounts with settlement records, accounts for debit and credit entries, updates settlement status, and flags discrepancies for investigation. The dashboard supports reviewing transactions, settlement history, issues, upload history, and archived CSV files.

## Features

- Import transaction records and settlement reports from CSV files.
- Match settlements primarily by `lifecycle_id`.
- Use `account_id`, `merchant_name`, and `transaction_date` as fallback matching fields when `lifecycle_id` is missing.
- Support multiple settlements per transaction and both `DEBIT` and `CREDIT` entries.
- Calculate net settlement amounts and update settlement status and last settlement date.
- Identify critical issues and warnings.
- View dashboard summary metrics and charts.
- Search, filter, and sort records where supported by the interface.
- Archive and review original CSV uploads if the CSV Archive feature is enabled.

## Technology Stack

| Layer | Technology |
|---|---|
| Backend | Python, FastAPI |
| Database | SQLite |
| Frontend | React, Vite |
| Charts | Recharts |
| Icons | Lucide React |
| Testing | pytest |

## Architecture

1. **Frontend:** React pages provide the dashboard, transaction list, issue review, CSV uploads, and CSV archive interface.
2. **API layer:** FastAPI exposes endpoints consumed by the frontend.
3. **Reconciliation services:** Backend services validate uploaded data, match settlements, update transaction settlement fields, and identify issues.
4. **Reconciliation database:** `reconciliation.db` stores transaction and settlement records.
5. **CSV archive:** If enabled, separate archive storage preserves original uploads and metadata independently from normalized reconciliation records.

## Project Structure

The exact layout may vary as the project evolves.

```text
TRS-OpenFabric/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   └── services/
│   ├── data/
│   ├── test_reconciliation.py
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── components/
    │   ├── pages/
    │   ├── styles/
    │   ├── App.jsx
    │   └── main.jsx
    ├── package.json
    └── .env
```

## Prerequisites

- Python 3.13 or a compatible version supported by the installed dependencies.
- Node.js and npm.
- Git (optional).

## Installation and Setup

### Backend

In PowerShell, navigate to the backend directory:

```powershell
cd D:\TRS-OpenFabric\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

If PowerShell blocks activation, use the virtual environment's Python executable directly:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

If `requirements.txt` is not present, add a dependency file based on the project's actual imports before setting up a clean environment.

### Frontend

Open a second PowerShell terminal:

```powershell
cd D:\TRS-OpenFabric\frontend
npm install
```

Ensure `frontend/.env` contains the API base URL expected by the frontend:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

Restart Vite after changing environment variables.

## Running the Application

Run the backend and frontend in separate terminals.

### Backend

```powershell
cd D:\TRS-OpenFabric\backend
python -m uvicorn app.main:app --reload
```

- API base URL: `http://127.0.0.1:8000`
- Interactive API documentation: `http://127.0.0.1:8000/docs`

### Frontend

```powershell
cd D:\TRS-OpenFabric\frontend
npm run dev
```

Open the local URL printed by Vite, usually `http://localhost:5173`.

## CSV File Formats

### Transaction CSV

The task's transaction schema includes:

| Field | Description |
|---|---|
| `transaction_id` | Unique transaction identifier |
| `lifecycle_id` | Lifecycle identifier used for primary matching |
| `account_id` | Account identifier |
| `merchant_name` | Merchant name |
| `transaction_date` | Transaction date |
| `transaction_amount` | Original transaction amount |
| `currency` | Currency code, such as `USD` |
| `status` | Original transaction status, such as `COMPLETED`, `FAILED`, or `DECLINED` |

The database also maintains reconciliation fields such as `settlement_status`, `total_settled_amount`, and `last_settlement_date`. Follow the exact headers accepted by the current transaction-upload validator.

### Settlement CSV

The settlement report format specified in the task is:

```csv
settlement_id,lifecycle_id,account_id,merchant_name,transaction_date,settlement_date,settlement_amount,settlement_type,currency
```

| Field | Description |
|---|---|
| `settlement_id` | Unique settlement entry identifier |
| `lifecycle_id` | Lifecycle identifier; may be blank for fallback matching |
| `account_id` | Account identifier |
| `merchant_name` | Merchant name |
| `transaction_date` | Original transaction date |
| `settlement_date` | Settlement entry date |
| `settlement_amount` | Positive settlement amount |
| `settlement_type` | `DEBIT` or `CREDIT` |
| `currency` | Currency code |

Validate headers, data types, dates, amounts, and currency consistency. File-processing status is separate from the reconciliation status of transactions inside a file.

## Reconciliation Logic

### Matching strategy

1. Match by `lifecycle_id` when it is present.
2. If `lifecycle_id` is missing, use `account_id`, `merchant_name`, and `transaction_date` as fallback matching fields.
3. Record valid settlement entries in `settlement_history`.
4. Recalculate the net settled amount, settlement status, and most recent settlement date.

### Net settlement calculation

**Net settled amount = total DEBIT amounts − total CREDIT amounts**

A credit represents a reduction or refund against the debit settlement amount.

### Settlement status rules

| Status | Meaning |
|---|---|
| `PENDING` | No settlement has been recorded |
| `PARTIAL` | Net settled amount is less than the transaction amount |
| `FULLY_SETTLED` | Net settled amount equals the transaction amount |
| `OVER_SETTLED` | Net settled amount exceeds the transaction amount |
| `REFUNDED` | Net settlement after credits is less than the transaction amount in a refund case |

The precedence between `PARTIAL` and `REFUNDED` should follow the implemented business rules. The task expects a $100 debit and $30 credit in its complex refund scenario to produce a $70 net settlement and `REFUNDED` status.

## Issue Detection

| Severity | Condition |
|---|---|
| Critical | Total settlement amount exceeds the transaction amount |
| Critical | No settlement is received within 7 days of the transaction date |
| Warning | Total settlement amount is less than the transaction amount |

Issue flags identify records requiring review; they do not, by themselves, prove fraud.

## API Endpoints

The task requires these REST API capabilities. The current application may expose additional routes for uploads, issues, and CSV archive management. Confirm exact paths, request schemas, and response fields at `http://127.0.0.1:8000/docs`.

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/reconcile` | Process a settlement CSV and reconcile settlement records |
| `GET` | `/transactions` | List transactions with settlement status and issue flags |
| `GET` | `/transactions/{id}` | Retrieve one transaction and its settlement details |
| `GET` | `/dashboard/summary` | Retrieve dashboard summary metrics |

The running application's OpenAPI documentation is the source of truth for its actual route paths.

## Database

### `transactions`

Core fields defined by the task:

- `transaction_id` — primary key.
- `lifecycle_id`, `account_id`, `merchant_name`.
- `transaction_date`, `transaction_amount`, `currency`, `status`.
- `settlement_status`, `total_settled_amount`, `last_settlement_date`, `created_at`.

### `settlement_history`

Core fields defined by the task:

- `settlement_id` — primary key.
- `transaction_id` — reference to a matched transaction when available.
- `lifecycle_id`, `settlement_date`, `settlement_amount`.
- `settlement_type`, `currency`, `processed_at`.

The supplied SQLite database is named `reconciliation.db`. Preserve existing project data. If the CSV Archive feature is implemented, its storage should remain separate from the reconciliation database.

## Testing

Run backend tests from the backend directory:

```powershell
cd D:\TRS-OpenFabric\backend
python -m pytest -v
```

If tests are in a specific file:

```powershell
python -m pytest -v test_reconciliation.py
```

Build the frontend:

```powershell
cd D:\TRS-OpenFabric\frontend
npm run build
```

### Required test scenarios

1. **Perfect match:** $100 transaction and $100 `DEBIT` settlement — no issues.
2. **Partial settlement:** $100 transaction and $80 `DEBIT` settlement — warning.
3. **Debit and refund credit:** $100 `DEBIT` plus $20 `CREDIT` — net settlement $80; the task expects no issues for this scenario.
4. **Critical over-settlement:** $100 transaction and $120 `DEBIT` settlement — critical issue.
5. **Missing lifecycle ID:** match using account, merchant, and transaction date.
6. **Status transitions:** a $100 transaction with two $50 debit settlements changes from `PARTIAL` to `FULLY_SETTLED`.
7. **Complex refund:** $100 `DEBIT` plus $30 `CREDIT` — net settlement $70 and status `REFUNDED`.

Also test invalid CSV headers, malformed dates or amounts, currency mismatches, duplicate settlement IDs, unmatched settlements, and the seven-day settlement rule.

## Assumptions

- CSV settlement amounts are positive; `settlement_type` determines debit or credit.
- Net settlement is calculated by subtracting credits from debits.
- `lifecycle_id` is the primary matching key when available.
- Fallback matching uses `account_id`, `merchant_name`, and `transaction_date`.
- An unmatched settlement should not be silently attached to an unrelated transaction.
- File-processing status describes upload processing; settlement status describes transaction reconciliation.
- The task's specified rules and scenario expectations take precedence over assumptions not explicitly defined.

## Known Limitations and Future Improvements

Confirm these against the current implementation. Potential areas for improvement include:

- More comprehensive API integration and upload-validation tests.
- Clear reporting for unmatched settlements and validation errors.
- Explicit currency mismatch handling.
- Idempotent reprocessing and duplicate settlement protection.
- Detailed audit logs for reconciliation changes.
- Authentication and role-based access control for production use.
- Background processing and progress reporting for large CSV uploads.
- Exportable reconciliation and issue reports.
- More precise documentation of implemented routes and business-rule precedence.

## Submission Checklist

- [ ] Include this `README.md`.
- [ ] Include backend dependency information.
- [ ] Include frontend package and lock files.
- [ ] Include database initialization or seeding instructions, if applicable.
- [ ] Run reconciliation unit tests and API integration tests.
- [ ] Run the frontend production build.
- [ ] Verify the application using the task's sample scenarios.
- [ ] Confirm that secrets and credentials are not committed.
- [ ] Record the requested 2–3 minute demo.
- [ ] Include the repository URL and any submission notes.

from decimal import Decimal
from pydantic import BaseModel


class IssueResponse(BaseModel):
    severity: str
    message: str
    recommendation: str


class SettlementResponse(BaseModel):
    settlement_id: str
    transaction_id: str | None = None
    lifecycle_id: str | None = None
    settlement_date: str
    settlement_amount: Decimal
    settlement_type: str
    currency: str
    processed_at: str | None = None


class TransactionResponse(BaseModel):
    transaction_id: str
    lifecycle_id: str | None = None
    account_id: str
    merchant_name: str
    transaction_date: str
    transaction_amount: Decimal
    currency: str
    status: str
    settlement_status: str
    total_settled_amount: Decimal = Decimal("0.00")
    last_settlement_date: str | None = None
    created_at: str | None = None
    issues: list[IssueResponse] = []


class TransactionDetailResponse(TransactionResponse):
    settlements: list[SettlementResponse] = []


class ReconciliationIssue(BaseModel):
    transaction_id: str | None = None
    severity: str
    message: str
    recommendation: str


class ReconciliationResponse(BaseModel):
    processed: int
    duplicates: int
    unmatched: list[str]
    updated_transactions: list[str]
    issues: list[ReconciliationIssue]


class DashboardSummary(BaseModel):
    total_transactions: int
    completed_transactions: int
    settlements_processed: int
    status_breakdown: dict[str, int]
    critical_issue_count: int
    warning_issue_count: int
    total_outstanding_by_currency: dict[str, Decimal]
    average_days_to_settle: float
    settlement_rate: float
    transaction_volume_change_percent: float | None = None
    previous_period_transactions: int = 0
    transaction_volume_period_days: int = 30
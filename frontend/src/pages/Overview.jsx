import { useMemo } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileSpreadsheet,
  FileText,
  ShieldCheck,
  Wallet,
} from "lucide-react";

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  Dot,
} from "recharts";

import MetricCard from "../components/MetricCard";
import IssuesPreview from "../components/IssuesPreview";
import { money, dateLabel, formatDateTimeIST } from "../utils/formatting";

import "../styles/Overview.css";
import "../styles/RecentImports.css";

const COLORS = ["#16845b", "#3478f6", "#e7a12b", "#d94c4c", "#8b96a8"];

const STATUS_LABELS = {
  FULLY_SETTLED: "Fully settled",
  PARTIAL: "Partially settled",
  PENDING: "Pending",
  OVER_SETTLED: "Over-settled",
  REFUNDED: "Refunded",
  NOT_APPLICABLE: "Not applicable",
};

function getStatus(transaction) {
  return String(
    transaction.settlement_status || transaction.status || "PENDING"
  ).toUpperCase();
}

function getAmount(transaction) {
  return Number(
    transaction.transaction_amount ?? transaction.amount ?? 0
  );
}

function getSettledAmount(transaction) {
  return Number(
    transaction.total_settled_amount ??
      transaction.settlement_amount ??
      transaction.settled_amount ??
      null   // null = missing, not zero
  );
}

function getCurrency(transaction) {
  return transaction.currency || "USD";
}

function getDateValue(transaction) {
  return (
    transaction.transaction_date ||
    transaction.created_at ||
    transaction.timestamp ||
    null
  );
}

function getIssueType(transaction) {
  const issues = Array.isArray(transaction.issues)
    ? transaction.issues
    : [];

  const text = [
    transaction.issue_flag,
    transaction.issue_details,
    transaction.issue_description,
    ...issues.map((issue) =>
      typeof issue === "string"
        ? issue
        : `${issue.severity || ""} ${issue.issue_type || ""}`
    ),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (transaction.has_critical_issue || text.includes("critical")) {
    return "Critical";
  }
  if (transaction.has_warning || text.includes("warning")) {
    return "Warning";
  }
  if (
    issues.length > 0 ||
    transaction.issue_flag ||
    transaction.issue_details ||
    transaction.issue_description
  ) {
    return "Review";
  }
  return "None";
}

function formatDateTime(value) {
  return dateLabel(value);
}

function getSummaryNumber(summary, keys, fallback = 0) {
  for (const key of keys) {
    if (summary?.[key] !== undefined && summary[key] !== null) {
      const value = Number(summary[key]);
      if (Number.isFinite(value)) return value;
    }
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Line-chart tooltip
// ---------------------------------------------------------------------------

function LineChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  const transactionPayload = payload.find((p) => p.dataKey === "transaction");
  const settledPayload = payload.find((p) => p.dataKey === "settled");
  const currency = payload[0]?.payload?.currency || "USD";

  return (
    <div className="rounded-chart-tooltip">
      <span className="tooltip-eyebrow">{label}</span>
      {transactionPayload && (
        <>
          <div className="tooltip-value-row">
            <span className="tooltip-dot transaction-dot" />
            <span>Transaction amount</span>
          </div>
          <div className="tooltip-amount">
            {money(transactionPayload.value, currency)}
          </div>
        </>
      )}
      {settledPayload ? (
        <>
          <div className="tooltip-value-row" style={{ marginTop: 6 }}>
            <span className="tooltip-dot settled-dot" />
            <span>Settled amount</span>
          </div>
          <div className="tooltip-amount">
            {money(settledPayload.value, currency)}
          </div>
        </>
      ) : (
        <div className="tooltip-secondary" style={{ marginTop: 6 }}>
          Settlement data not available
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard metrics component
// ---------------------------------------------------------------------------

function DashboardMetrics({
  summary,
  transactions,
  issueTransactions,
  transactionCount,
  issueTransactionsCount,
  onOpenTransactions,
  onOpenIssues,
}) {
  const totalTransactions = getSummaryNumber(
    summary,
    ["total_transactions", "transaction_count"],
    transactionCount
  );

  const totalSettlements = getSummaryNumber(
    summary,
    [
      "total_settlements",
      "settlements_processed",
      "total_settlements_processed",
    ],
    0
  );

  const settlementRate = getSummaryNumber(
    summary,
    ["settlement_rate"],
    0
  );

  const criticalCount = getSummaryNumber(
    summary,
    ["critical_issue_count", "critical_issues"],
    issueTransactions.filter(
      (transaction) => getIssueType(transaction) === "Critical"
    ).length
  );

  const warningCount = getSummaryNumber(
    summary,
    ["warning_issue_count", "warning_issues"],
    issueTransactions.filter(
      (transaction) => getIssueType(transaction) === "Warning"
    ).length
  );

  const averageDays = getSummaryNumber(
    summary,
    ["average_days_to_settle", "average_settlement_days"],
    0
  );

  const outstandingTotal = transactions.reduce((total, transaction) => {
    return (
      total +
      Math.max(
        getAmount(transaction) - getSettledAmount(transaction),
        0
      )
    );
  }, 0);

  return (
    <>
      <section className="metrics-grid">
        <MetricCard
          title="Total transactions"
          value={totalTransactions}
          subtitle="View all transaction records"
          icon={Wallet}
          tone="blue"
          onClick={onOpenTransactions}
        />

        <MetricCard
          title="Settlement rate"
          value={`${settlementRate.toFixed(1)}%`}
          subtitle="Settlement performance"
          icon={CheckCircle2}
          tone="green"
          onClick={onOpenTransactions}
        />

        <MetricCard
          title="Critical issues"
          value={criticalCount}
          subtitle="View issues requiring attention"
          icon={AlertTriangle}
          tone="red"
          onClick={onOpenIssues}
        />

        <MetricCard
          title="Average days to settle"
          value={averageDays.toFixed(1)}
          subtitle="Average settlement duration"
          icon={Clock3}
          tone="orange"
          onClick={onOpenTransactions}
        />
      </section>

      <section className="secondary-metrics">
        <button
          type="button"
          className="secondary-metric secondary-metric-button"
          onClick={onOpenTransactions}
        >
          <span className="secondary-icon orange">
            <CircleDollarSign size={19} />
          </span>
          <div>
            <span>Total outstanding</span>
            <strong>{money(outstandingTotal)}</strong>
          </div>
          <ArrowUpRight className="metric-link-icon" size={15} />
        </button>

        <button
          type="button"
          className="secondary-metric secondary-metric-button"
          onClick={onOpenTransactions}
        >
          <span className="secondary-icon blue">
            <Activity size={19} />
          </span>
          <div>
            <span>Settlement records</span>
            <strong>{totalSettlements}</strong>
          </div>
          <ArrowUpRight className="metric-link-icon" size={15} />
        </button>

        <button
          type="button"
          className="secondary-metric secondary-metric-button"
          onClick={onOpenIssues}
        >
          <span className="secondary-icon yellow">
            <AlertTriangle size={19} />
          </span>
          <div>
            <span>Warnings</span>
            <strong>{warningCount}</strong>
          </div>
          <ArrowUpRight className="metric-link-icon" size={15} />
        </button>

        <button
          type="button"
          className="secondary-metric secondary-metric-button"
          onClick={onOpenIssues}
        >
          <span className="secondary-icon green">
            <ShieldCheck size={19} />
          </span>
          <div>
            <span>Transactions flagged</span>
            <strong>{issueTransactionsCount}</strong>
          </div>
          <ArrowUpRight className="metric-link-icon" size={15} />
        </button>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Overview page
// ---------------------------------------------------------------------------

export default function Overview({
  summary = {},
  transactions = [],
  issueTransactions = [],
  transactionCount = 0,
  issueTransactionsCount = 0,
  onOpenTransactions,
  onOpenIssues,
}) {
  const statusData = useMemo(() => {
    const breakdown = summary.status_breakdown || {};

    if (Array.isArray(breakdown)) {
      return breakdown
        .map((item) => ({
          name:
            STATUS_LABELS[item.status || item.name] ||
            item.status ||
            item.name ||
            "Unknown",
          value: Number(item.count ?? item.value ?? 0),
        }))
        .filter((item) => item.value > 0);
    }

    return Object.entries(breakdown)
      .map(([status, count]) => ({
        name: STATUS_LABELS[status] || status.replaceAll("_", " "),
        value: Number(count) || 0,
      }))
      .filter((item) => item.value > 0);
  }, [summary.status_breakdown]);

  // Build line-chart data: keep null for missing settlement to avoid misleading zero
  const transactionChartData = useMemo(() => {
    return transactions.slice(0, 30).map((transaction) => {
      const rawSettled =
        transaction.total_settled_amount ??
        transaction.settlement_amount ??
        transaction.settled_amount;

      const settled =
        rawSettled !== undefined && rawSettled !== null
          ? Number(rawSettled)
          : null;

      return {
        transactionId:
          transaction.transaction_id || transaction.id || "Unknown",
        merchant: transaction.merchant_name || "Unknown merchant",
        currency: getCurrency(transaction),
        transaction: getAmount(transaction),
        settled,        // null = no settlement data; do not plot this point
      };
    });
  }, [transactions]);

  const recentTransactions = useMemo(() => {
    return [...transactions]
      .sort((a, b) => {
        const dateA = new Date(getDateValue(a) || 0).getTime();
        const dateB = new Date(getDateValue(b) || 0).getTime();
        return dateB - dateA;
      })
      .slice(0, 5);
  }, [transactions]);

  return (
    <div className="overview-page page-transition">
      <DashboardMetrics
        summary={summary}
        transactions={transactions}
        issueTransactions={issueTransactions}
        transactionCount={transactionCount}
        issueTransactionsCount={issueTransactionsCount}
        onOpenTransactions={onOpenTransactions}
        onOpenIssues={onOpenIssues}
      />

      <section className="charts-grid">
        {/* ── Settlement status donut ── */}
        <article className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <h3>Settlement status</h3>
              <p>Distribution of settlement outcomes</p>
            </div>
            <span className="panel-icon">
              <Activity size={18} />
            </span>
          </div>

          {statusData.length > 0 ? (
            <div className="chart-container donut-chart-container">
              <ResponsiveContainer width="100%" height={230}>
                <PieChart>
                  <Pie
                    data={statusData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={82}
                    innerRadius={52}
                    paddingAngle={3}
                    cornerRadius={4}
                  >
                    {statusData.map((item, index) => (
                      <Cell
                        key={`${item.name}-${index}`}
                        fill={COLORS[index % COLORS.length]}
                        stroke="none"
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const item = payload[0];
                      return (
                        <div className="rounded-chart-tooltip donut-tooltip">
                          <strong>{item.name}</strong>
                          <div className="tooltip-amount">
                            {item.value} transactions
                          </div>
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="chart-empty">
              No settlement status data available.
            </div>
          )}

          <div className="status-legend status-legend-grid">
            {statusData.map((item, index) => (
              <div className="legend-item" key={item.name}>
                <span
                  className="legend-dot"
                  style={{
                    backgroundColor: COLORS[index % COLORS.length],
                  }}
                />
                <span>{item.name}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </article>

        {/* ── Transaction vs settled amount — Line chart ── */}
        <article className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <h3>Transaction vs settled amount</h3>
              <p>
                Each point is one transaction record (categorical X-axis, not a time trend)
              </p>
            </div>
            <span className="panel-icon">
              <CircleDollarSign size={18} />
            </span>
          </div>

          {transactionChartData.length > 0 ? (
            <div className="chart-container transaction-chart-container">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart
                  data={transactionChartData}
                  margin={{ top: 14, right: 18, left: 4, bottom: 56 }}
                >
                  <CartesianGrid
                    stroke="#e8edf5"
                    strokeDasharray="4 4"
                    vertical={false}
                  />

                  <XAxis
                    dataKey="transactionId"
                    interval={0}
                    angle={-35}
                    textAnchor="end"
                    height={70}
                    tick={{ fill: "#71819a", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />

                  <YAxis
                    tick={{ fill: "#71819a", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) =>
                      Intl.NumberFormat("en", {
                        notation: "compact",
                        compactDisplay: "short",
                      }).format(v)
                    }
                  />

                  <Tooltip content={<LineChartTooltip />} />

                  {/* Transaction amount line — blue */}
                  <Line
                    type="linear"
                    dataKey="transaction"
                    name="Transaction amount"
                    stroke="#3478f6"
                    strokeWidth={2}
                    dot={{ r: 4, fill: "#3478f6", strokeWidth: 0 }}
                    activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }}
                    connectNulls={false}
                  />

                  {/* Settled amount line — orange; null gaps show missing data */}
                  <Line
                    type="linear"
                    dataKey="settled"
                    name="Settled amount"
                    stroke="#f28c28"
                    strokeWidth={2}
                    dot={{ r: 4, fill: "#f28c28", strokeWidth: 0 }}
                    activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }}
                    connectNulls={false}
                    strokeDasharray="0"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="chart-empty">
              No transaction amount data available.
            </div>
          )}

          {transactions.length > 30 && (
            <p className="chart-note">
              Showing the first 30 transactions. Open Transactions to inspect
              all records.
            </p>
          )}

          <div className="chart-legend">
            <span className="legend-item">
              <span className="legend-dot transaction-dot" />
              Transaction amount
            </span>
            <span className="legend-item">
              <span className="legend-dot settled-dot" />
              Settled amount
            </span>
          </div>
        </article>
      </section>

      {/* ── Recent transactions table ── */}
      <section className="panel recent-imports-panel">
        <div className="panel-heading">
          <div>
            <h3>Recent transaction records</h3>
            <p>Latest transaction records available in the system</p>
          </div>
          <span className="panel-icon">
            <FileSpreadsheet size={18} />
          </span>
        </div>

        {recentTransactions.length > 0 ? (
          <div className="recent-imports-table-wrap">
            <table className="recent-imports-table">
              <thead>
                <tr>
                  <th>Transaction</th>
                  <th>Merchant</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentTransactions.map((transaction, index) => {
                  const id =
                    transaction.transaction_id ||
                    transaction.id ||
                    `transaction-${index}`;
                  const status = getStatus(transaction);

                  return (
                    <tr key={id}>
                      <td>
                        <button
                          type="button"
                          className="transaction-link"
                          onClick={onOpenTransactions}
                          title={id}
                        >
                          <FileText size={13} />
                          {id}
                        </button>
                      </td>
                      <td>{transaction.merchant_name || "—"}</td>
                      <td>{formatDateTime(getDateValue(transaction))}</td>
                      <td>
                        <strong>
                          {money(getAmount(transaction), getCurrency(transaction))}
                        </strong>
                      </td>
                      <td>
                        <span
                          className={`status-badge status-${status.toLowerCase()}`}
                        >
                          <span className="status-dot" />
                          {STATUS_LABELS[status] ||
                            status.replaceAll("_", " ")}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="chart-empty">
            No transaction records are available yet.
          </div>
        )}

        <button
          type="button"
          className="overview-view-all"
          onClick={onOpenTransactions}
        >
          View all transactions <ArrowUpRight size={15} />
        </button>
      </section>

      <IssuesPreview
        critical={getSummaryNumber(
          summary,
          ["critical_issue_count", "critical_issues"],
          issueTransactions.filter(
            (transaction) => getIssueType(transaction) === "Critical"
          ).length
        )}
        warnings={getSummaryNumber(
          summary,
          ["warning_issue_count", "warning_issues"],
          issueTransactions.filter(
            (transaction) => getIssueType(transaction) === "Warning"
          ).length
        )}
        flaggedCount={issueTransactionsCount}
        issues={issueTransactions}
        onOpenIssues={onOpenIssues}
      />
    </div>
  );
}
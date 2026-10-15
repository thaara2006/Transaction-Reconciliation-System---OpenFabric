
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ChevronRight,
} from "lucide-react";

import {
  getAmount,
  getCurrency,
  getSettledAmount,
  money,
} from "../utils/formatting";

function getIssues(transaction) {
  return Array.isArray(transaction?.issues)
    ? transaction.issues
    : [];
}

function getSeverity(transaction) {
  const issues = getIssues(transaction);

  const severities = issues.map((issue) =>
    String(
      typeof issue === "string" ? "" : issue?.severity || ""
    ).toUpperCase()
  );

  if (
    transaction?.has_critical_issue ||
    severities.includes("CRITICAL")
  ) {
    return "Critical";
  }

  if (
    transaction?.has_warning ||
    severities.includes("WARNING")
  ) {
    return "Warning";
  }

  return "Review";
}

function getSeverityCounts(transactions) {
  let critical = 0;
  let warnings = 0;

  transactions.forEach((transaction) => {
    const issues = getIssues(transaction);

    if (issues.length > 0) {
      let foundCritical = false;
      let foundWarning = false;

      issues.forEach((issue) => {
        const severity = String(
          typeof issue === "string" ? "" : issue?.severity || ""
        ).toUpperCase();

        if (severity === "CRITICAL") foundCritical = true;
        if (severity === "WARNING") foundWarning = true;
      });

      if (foundCritical) critical += 1;
      if (foundWarning) warnings += 1;
    } else {
      const severity = getSeverity(transaction);

      if (severity === "Critical") critical += 1;
      if (severity === "Warning") warnings += 1;
    }
  });

  return { critical, warnings };
}

export default function IssuesPreview({
  issues = [],
  onOpenIssues,
}) {
  const uniqueTransactions = Array.from(
    new Map(
      issues.map((transaction, index) => [
        transaction.transaction_id ||
          transaction.id ||
          `unknown-${index}`,
        transaction,
      ])
    ).values()
  );

  const { critical, warnings } = getSeverityCounts(uniqueTransactions);

  const sortedIssues = [...uniqueTransactions]
    .map((transaction) => {
      const amount = getAmount(transaction);
      const settled = getSettledAmount(transaction);
      const difference = amount - settled;

      return {
        transaction,
        difference,
        severity: getSeverity(transaction),
      };
    })
    .sort((a, b) => {
      const severityRank = {
        Critical: 0,
        Warning: 1,
        Review: 2,
        "Needs review": 3,
      };

      const rankDifference =
        severityRank[a.severity] - severityRank[b.severity];

      return rankDifference || Math.abs(b.difference) - Math.abs(a.difference);
    })
    .slice(0, 3);

  return (
    <article className="overview-panel issues-preview-panel">
      <div className="overview-panel-heading">
        <div>
          <span className="overview-eyebrow">EXCEPTIONS</span>
          <h2>Needs attention</h2>
          <p>Review transactions with reconciliation issues.</p>
        </div>

        <button
          type="button"
          className="overview-icon-button"
          onClick={onOpenIssues}
          aria-label="Open issues center"
          title="Open Issues Center"
        >
          <ArrowRight size={18} />
        </button>
      </div>

      <div className="issue-summary-grid">
        <div className="issue-summary critical">
          <AlertCircle size={17} />
          <span>Critical issues</span>
          <strong>{critical}</strong>
        </div>

        <div className="issue-summary warning">
          <AlertTriangle size={17} />
          <span>Warnings</span>
          <strong>{warnings}</strong>
        </div>
      </div>

      <div className="issues-preview-heading">
        <strong>Flagged transactions</strong>
        <span>{uniqueTransactions.length} unique transactions</span>
      </div>

      {sortedIssues.length > 0 ? (
        <div className="issues-preview-list">
          {sortedIssues.map(({ transaction, difference, severity }) => {
            const transactionId =
              transaction.transaction_id ||
              transaction.id ||
              "Unknown transaction";

            return (
              <button
                type="button"
                className="issue-preview-row"
                key={transactionId}
                onClick={onOpenIssues}
                title={`Open Issues Center for ${transactionId}`}
              >
                <span
                  className={`issue-severity-marker ${severity
                    .toLowerCase()
                    .replaceAll(" ", "-")}`}
                />

                <span className="issue-preview-main">
                  <strong>{transactionId}</strong>
                  <small>
                    {transaction.merchant_name || "Unknown merchant"}
                  </small>
                </span>

                <span className="issue-preview-amount">
                  <strong>
                    {money(
                      Math.abs(difference),
                      getCurrency(transaction)
                    )}
                  </strong>
                  <small>
                    {difference > 0
                      ? "Outstanding"
                      : difference < 0
                      ? "Over-settled"
                      : "No amount difference"}
                  </small>
                </span>

                <span className={`issue-severity-label ${severity.toLowerCase()}`}>
                  {severity}
                </span>

                <ChevronRight
                  size={16}
                  className="issue-preview-chevron"
                />
              </button>
            );
          })}
        </div>
      ) : (
        <div className="issues-preview-empty">
          <AlertCircle size={22} />
          <strong>No flagged transactions</strong>
          <span>
            Transactions with reconciliation issues will appear here.
          </span>
        </div>
      )}

      <button
        type="button"
        className="issues-view-all"
        onClick={onOpenIssues}
      >
        Open Issues Center <ArrowRight size={15} />
      </button>
    </article>
  );
}

import { useEffect, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  RefreshCw,
  X,
} from "lucide-react";

import { getTransactionDetails } from "../services/api";
import {
  dateLabel,
  getAmount,
  getCurrency,
  getSettledAmount,
  money,
} from "../utils/formatting";
import StatusBadge from "./StatusBadge";
import IssueBadge from "./IssueBadge";

import "../styles/TransactionDetailModal.css";

function severityClass(severity) {
  const s = String(severity || "").toUpperCase();
  if (s === "CRITICAL") return "";        // default red callout
  if (s === "WARNING")  return "warning"; // amber callout
  return "warning";                       // review → amber
}

function SeverityIcon({ severity }) {
  const s = String(severity || "").toUpperCase();
  if (s === "CRITICAL") return <AlertCircle size={17} />;
  return <AlertTriangle size={17} />;
}

export default function TransactionDetailModal({ transaction, onClose }) {
  const [details, setDetails] = useState(transaction);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setDetails(transaction);
    setError("");
    setLoading(true);

    getTransactionDetails(transaction.transaction_id)
      .then((data) => {
        if (active) setDetails((prev) => ({ ...prev, ...data }));
      })
      .catch((err) => {
        if (active) setError(err.message || "Could not load transaction details.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [transaction]);

  // Close on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const issues = Array.isArray(details.issues) ? details.issues : [];
  const settlements = Array.isArray(details.settlements) ? details.settlements : [];

  const fields = [
    ["Merchant",             details.merchant_name],
    ["Transaction date",     dateLabel(details.transaction_date)],
    ["Transaction amount",   money(getAmount(details), getCurrency(details))],
    ["Total settled amount", money(getSettledAmount(details), getCurrency(details))],
    ["Account ID",           details.account_id],
    ["Last settlement date", dateLabel(details.last_settlement_date)],
  ];

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <section className="detail-modal" role="dialog" aria-modal="true">
        {/* Header */}
        <div className="modal-header">
          <div>
            <span className="modal-eyebrow">TRANSACTION DETAILS</span>
            <h2>{details.transaction_id || "—"}</h2>
          </div>
          <button
            className="close-button"
            onClick={onClose}
            aria-label="Close transaction details"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="modal-body">
          {/* Status pills */}
          <div className="detail-status">
            <StatusBadge status={details.settlement_status || details.status} />
            <IssueBadge transaction={details} />
          </div>

          {/* Loading / error */}
          {loading && (
            <p className="modal-loading">
              <RefreshCw size={15} className="spin" />
              Loading latest details…
            </p>
          )}
          {error && (
            <div className="notice notice-error">
              <span>{error}</span>
            </div>
          )}

          {/* Key-value grid */}
          <div>
            <div className="modal-section-heading">
              <Clock3 size={15} />
              Transaction information
            </div>
            <div className="detail-grid" style={{ marginTop: 10 }}>
              {fields.map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value || "—"}</strong>
                </div>
              ))}
            </div>
          </div>

          {/* Issues */}
          <div>
            <div className="modal-section-heading">
              <AlertTriangle size={15} />
              Issues
              {issues.length > 0 && (
                <span
                  style={{
                    marginLeft: "auto",
                    fontSize: 11,
                    fontWeight: 500,
                    color: "var(--trs-muted)",
                  }}
                >
                  {issues.length} flagged
                </span>
              )}
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                marginTop: 10,
              }}
            >
              {issues.length > 0 ? (
                issues.map((issue, index) => {
                  const cls = severityClass(issue.severity);
                  return (
                    <div
                      key={index}
                      className={`detail-callout ${cls}`}
                    >
                      <SeverityIcon severity={issue.severity} />
                      <div>
                        <strong>
                          {issue.severity || "Review"}
                        </strong>
                        <p>{issue.message || String(issue)}</p>
                        {issue.recommendation && (
                          <p>
                            <b>Recommendation:</b> {issue.recommendation}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="no-issues-note">
                  No issues were returned by the backend for this transaction.
                </p>
              )}
            </div>
          </div>

          {/* Settlement history */}
          <div>
            <div className="modal-section-heading">
              <CheckCircle2 size={15} />
              Settlement history
              {settlements.length > 0 && (
                <span
                  style={{
                    marginLeft: "auto",
                    fontSize: 11,
                    fontWeight: 500,
                    color: "var(--trs-muted)",
                  }}
                >
                  {settlements.length} record{settlements.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            {settlements.length > 0 ? (
              <div
                className="modal-settlement-wrap"
                style={{ marginTop: 10 }}
              >
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Amount</th>
                        <th>Currency</th>
                      </tr>
                    </thead>
                    <tbody>
                      {settlements.map((settlement, index) => (
                        <tr key={settlement.settlement_id || index}>
                          <td>{dateLabel(settlement.settlement_date)}</td>
                          <td>{settlement.settlement_type || "—"}</td>
                          <td className="amount-cell">
                            {money(
                              settlement.settlement_amount,
                              settlement.currency || getCurrency(details)
                            )}
                          </td>
                          <td>
                            {settlement.currency || getCurrency(details)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p
                className="no-issues-note"
                style={{ marginTop: 10 }}
              >
                No settlement records were returned.
              </p>
            )}
          </div>

          {/* Footer action */}
          <button
            className="button button-primary full-button"
            onClick={onClose}
          >
            Close details
          </button>
        </div>
      </section>
    </div>
  );
}

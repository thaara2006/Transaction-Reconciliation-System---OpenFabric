import { STATUS_LABELS, getStatus } from "../utils/formatting";
export default function StatusBadge({ transaction, status }) {
  const value = String(status || (transaction && getStatus(transaction)) || "PENDING").toUpperCase();
  return <span className={`status-badge status-${value.toLowerCase()}`}><span className="status-dot" />{STATUS_LABELS[value] || value.replaceAll("_", " ")}</span>;
}

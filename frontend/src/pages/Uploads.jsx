
import { useEffect, useState } from "react";
import {
  FileUp,
  FileSpreadsheet,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock3,
  SlidersHorizontal,
} from "lucide-react";

import {
  getUploadHistory,
  uploadTransactionsCsv,
  uploadSettlementsCsv,
} from "../services/api";

import Dropdown from "../components/Dropdown";
import { formatDateTimeIST } from "../utils/formatting";
import "../styles/Uploads.css";

// ---------------------------------------------------------------------------
// Sort options
// ---------------------------------------------------------------------------
const SORT_OPTIONS = [
  { value: "imported_at_desc", label: "Newest first" },
  { value: "imported_at_asc",  label: "Oldest first" },
  { value: "filename_asc",     label: "Filename A→Z" },
  { value: "filename_desc",    label: "Filename Z→A" },
  { value: "type_asc",         label: "Type A→Z" },
  { value: "records_desc",     label: "Most records" },
  { value: "records_asc",      label: "Fewest records" },
  { value: "status_asc",       label: "Status A→Z" },
];

function sortHistory(items, sortKey) {
  const sorted = [...items];
  switch (sortKey) {
    case "imported_at_asc":
      return sorted.sort((a, b) =>
        (a.imported_at || "").localeCompare(b.imported_at || "")
      );
    case "imported_at_desc":
      return sorted.sort((a, b) =>
        (b.imported_at || "").localeCompare(a.imported_at || "")
      );
    case "filename_asc":
      return sorted.sort((a, b) =>
        (a.filename || "").localeCompare(b.filename || "")
      );
    case "filename_desc":
      return sorted.sort((a, b) =>
        (b.filename || "").localeCompare(a.filename || "")
      );
    case "type_asc":
      return sorted.sort((a, b) =>
        (a.upload_type || "").localeCompare(b.upload_type || "")
      );
    case "records_desc":
      return sorted.sort(
        (a, b) => (b.rows_received || 0) - (a.rows_received || 0)
      );
    case "records_asc":
      return sorted.sort(
        (a, b) => (a.rows_received || 0) - (b.rows_received || 0)
      );
    case "status_asc":
      return sorted.sort((a, b) =>
        (a.status || "").localeCompare(b.status || "")
      );
    default:
      return sorted;
  }
}

// ---------------------------------------------------------------------------
// Upload panel
// ---------------------------------------------------------------------------
function UploadPanel({ title, description, type, onUpload, busy }) {
  const [file, setFile] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!file || busy) return;
    await onUpload(type, file);
    setFile(null);
    event.target.reset();
  }

  const isSettlement = type === "SETTLEMENTS";

  return (
    <form className="upload-panel" onSubmit={handleSubmit}>
      <div className={`upload-panel-icon${isSettlement ? " settlement" : ""}`}>
        {isSettlement ? <FileUp size={22} /> : <FileSpreadsheet size={22} />}
      </div>

      <h3 style={{ color: "var(--trs-navy)", fontSize: 16, fontWeight: 700, margin: 0 }}>
        {title}
      </h3>
      <p>{description}</p>

      <label className="upload-file-label">
        <span>Select CSV file</span>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
      </label>

      {file && (
        <div className="selected-file">
          <FileSpreadsheet size={14} style={{ flexShrink: 0, color: "var(--trs-blue)" }} />
          <span className="upload-filename">{file.name}</span>
        </div>
      )}

      <button
        className="button button-primary upload-submit"
        type="submit"
        disabled={!file || busy}
      >
        {busy ? "Processing…" : "Upload and process"}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatDate(value) {
  return formatDateTimeIST(value);
}

// ---------------------------------------------------------------------------
// Main Uploads page
// ---------------------------------------------------------------------------
export default function Uploads({ onUploaded }) {
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sortKey, setSortKey] = useState("imported_at_desc");

  async function refreshHistory() {
    const result = await getUploadHistory();
    setHistory(Array.isArray(result) ? result : []);
  }

  useEffect(() => {
    refreshHistory().catch((err) => setError(err.message));
  }, []);

  async function handleUpload(type, file) {
    setBusy(type);
    setError("");
    setNotice("");

    try {
      const uploadFunction =
        type === "TRANSACTIONS"
          ? uploadTransactionsCsv
          : uploadSettlementsCsv;

      const result = await uploadFunction(file);

      setNotice(
        `${result.message || "Upload completed."} ` +
          `Processed: ${result.rows_processed ?? result.processed ?? 0}. ` +
          `Duplicates skipped: ${
            result.duplicates_skipped ?? result.duplicates ?? 0
          }.`
      );

      await refreshHistory();
      await onUploaded?.();
    } catch (err) {
      setError(err.message || "Upload failed.");
      await refreshHistory().catch(() => {});
    } finally {
      setBusy("");
    }
  }

  const displayHistory = sortHistory(history, sortKey);

  return (
    <div className="uploads-page">
      <div className="uploads-intro">
        <div>
          <span className="overview-eyebrow">DATA INGESTION</span>
          <h2>Upload transaction data</h2>
          <p>
            Import transaction records and settlement reports into the
            reconciliation database. Each upload is permanently archived.
          </p>
        </div>

        <button
          className="button button-secondary"
          type="button"
          onClick={() => refreshHistory().catch((err) => setError(err.message))}
        >
          <RefreshCw size={16} />
          Refresh history
        </button>
      </div>

      {error && (
        <div className="upload-message upload-error">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {notice && (
        <div className="upload-message upload-success">
          <CheckCircle2 size={18} />
          {notice}
        </div>
      )}

      <section className="upload-panels">
        <UploadPanel
          title="Transaction CSV"
          description="Add new transaction records to the database."
          type="TRANSACTIONS"
          onUpload={handleUpload}
          busy={busy === "TRANSACTIONS"}
        />

        <UploadPanel
          title="Settlement CSV"
          description="Process settlement records and update reconciliation statuses."
          type="SETTLEMENTS"
          onUpload={handleUpload}
          busy={busy === "SETTLEMENTS"}
        />
      </section>

      <section className="panel upload-history-panel">
        <div className="upload-history-heading">
          <div>
            <span className="overview-eyebrow">IMPORT ACTIVITY</span>
            <h2>Upload history</h2>
            <p>All imports, ordered by time added (IST, GMT+5:30).</p>
          </div>

          <div className="upload-history-heading-right">
            <Dropdown
              value={sortKey}
              onChange={setSortKey}
              options={SORT_OPTIONS}
              icon={SlidersHorizontal}
              header="Sort by"
              ariaLabel="Sort upload history"
            />
            <Clock3 size={22} className="upload-clock-icon" />
          </div>
        </div>

        <div className="upload-history-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Imported date (IST)</th>
                <th>File</th>
                <th>Type</th>
                <th>Received</th>
                <th>Processed</th>
                <th>Duplicates</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {displayHistory.map((item) => (
                <tr key={item.upload_id}>
                  <td>{formatDate(item.imported_at)}</td>
                  <td className="upload-filename">{item.filename}</td>
                  <td>
                    {item.upload_type === "TRANSACTIONS"
                      ? "Transactions"
                      : "Settlements"}
                  </td>
                  <td>{item.rows_received}</td>
                  <td>{item.rows_processed}</td>
                  <td>{item.duplicates_skipped}</td>
                  <td>
                    <span
                      className={`upload-status ${String(
                        item.status
                      ).toLowerCase()}`}
                    >
                      {item.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {history.length === 0 && (
            <div className="upload-history-empty">
              No uploads yet. Completed imports will appear here.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

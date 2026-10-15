import { useCallback, useEffect, useRef, useState } from "react";
import {
  Archive,
  Download,
  Search,
  SlidersHorizontal,
  FileSpreadsheet,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
} from "lucide-react";

import {
  getArchivedUploads,
  getArchivedUploadDetail,
  getArchivedRecords,
  getArchiveDownloadUrl,
} from "../services/api";

import Dropdown from "../components/Dropdown";
import { formatDateTimeIST } from "../utils/formatting";
import "../styles/CsvArchive.css";

const PAGE_SIZE = 50;
const RECORD_PAGE_SIZE = 200;

const TYPE_OPTIONS = [
  { value: "ALL", label: "All types" },
  { value: "TRANSACTIONS", label: "Transactions" },
  { value: "SETTLEMENTS", label: "Settlements" },
];

const STATUS_OPTIONS = [
  { value: "ALL", label: "All statuses" },
  { value: "PROCESSED", label: "Processed" },
  { value: "FAILED", label: "Failed" },
  { value: "PENDING", label: "Pending" },
];

const SORT_OPTIONS = [
  { value: "uploaded_at_desc", label: "Newest first" },
  { value: "uploaded_at_asc",  label: "Oldest first" },
  { value: "filename_asc",     label: "Filename A→Z" },
  { value: "filename_desc",    label: "Filename Z→A" },
  { value: "size_desc",        label: "Largest file" },
  { value: "size_asc",         label: "Smallest file" },
  { value: "records_desc",     label: "Most records" },
  { value: "records_asc",      label: "Fewest records" },
  { value: "status_asc",       label: "Status A→Z" },
];

function formatDate(value) {
  return formatDateTimeIST(value);
}

function formatBytes(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function StatusPill({ status }) {
  const s = String(status || "").toUpperCase();
  const className =
    s === "PROCESSED"
      ? "archive-status processed"
      : s === "FAILED"
      ? "archive-status failed"
      : "archive-status pending";
  return <span className={className}>{s || "PENDING"}</span>;
}

function SettlementStatusPill({ status }) {
  const s = String(status || "").toUpperCase();
  const className =
    s === "FULLY_SETTLED" || s === "SETTLED"
      ? "archive-settlement-status settled"
      : s === "PARTIAL" || s === "PARTIALLY_SETTLED"
      ? "archive-settlement-status partial"
      : s === "UNMATCHED" || s === "FAILED"
      ? "archive-settlement-status unmatched"
      : s === "PENDING"
      ? "archive-settlement-status pending"
      : "archive-settlement-status unknown";
  const label =
    s === "FULLY_SETTLED"
      ? "Fully Settled"
      : s === "SETTLED"
      ? "Settled"
      : s === "PARTIAL" || s === "PARTIALLY_SETTLED"
      ? "Partially Settled"
      : s === "UNMATCHED"
      ? "Unmatched"
      : s === "PENDING"
      ? "Pending"
      : s === "FAILED"
      ? "Failed"
      : s === "OVER_SETTLED"
      ? "Over-settled"
      : s === "REFUNDED"
      ? "Refunded"
      : s === "NOT_APPLICABLE"
      ? "Not Applicable"
      : status || "—";
  return <span className={className}>{label}</span>;
}

// ---------------------------------------------------------------------------
// Records modal
// ---------------------------------------------------------------------------

function RecordsModal({ upload, onClose }) {
  const [records, setRecords] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(
    async (currentOffset) => {
      setLoading(true);
      setError("");
      try {
        const [detail, page] = await Promise.all([
          getArchivedUploadDetail(upload.upload_id),
          getArchivedRecords(upload.upload_id, {
            limit: RECORD_PAGE_SIZE,
            offset: currentOffset,
          }),
        ]);
        setHeaders(detail.original_headers || []);
        setRecords(page.records || []);
        setTotal(page.total || 0);
      } catch (err) {
        setError(err.message || "Failed to load records.");
      } finally {
        setLoading(false);
      }
    },
    [upload.upload_id]
  );

  useEffect(() => {
    load(0);
  }, [load]);

  const handlePrev = () => {
    const next = Math.max(0, offset - RECORD_PAGE_SIZE);
    setOffset(next);
    load(next);
  };

  const handleNext = () => {
    const next = offset + RECORD_PAGE_SIZE;
    setOffset(next);
    load(next);
  };

  return (
    <div
      className="archive-modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="archive-modal">
        <div className="archive-modal-header">
          <div>
            <h2>{upload.filename}</h2>
            <p>
              {upload.upload_type} · Uploaded {formatDate(upload.uploaded_at)} ·{" "}
              {total} records
            </p>
          </div>
          <div className="archive-modal-actions">
            <a
              className="button button-secondary"
              href={getArchiveDownloadUrl(upload.upload_id)}
              download={upload.filename}
              target="_blank"
              rel="noreferrer"
            >
              <Download size={15} />
              Download original
            </a>
            <button
              className="archive-modal-close"
              onClick={onClose}
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="archive-modal-body">
          {loading ? (
            <div className="archive-loading">
              <RefreshCw size={18} className="spin" />
              Loading records…
            </div>
          ) : error ? (
            <div className="archive-error">{error}</div>
          ) : records.length === 0 ? (
            <div className="archive-empty">No records stored for this upload.</div>
          ) : (
            <>
              <div className="archive-records-table-wrap">
                <table className="archive-records-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Reconciliation Status</th>
                      {headers.map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((rec) => (
                      <tr key={rec.row_number}>
                        <td className="archive-row-num">{rec.row_number}</td>
                        <td>
                          {rec.reconciliation_status ? (
                            <SettlementStatusPill status={rec.reconciliation_status} />
                          ) : (
                            <span style={{ color: "var(--trs-muted)" }}>—</span>
                          )}
                        </td>
                        {headers.map((h) => (
                          <td key={h}>{rec[h] ?? "—"}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="archive-records-pagination">
                <span>
                  Showing {offset + 1}–{Math.min(offset + RECORD_PAGE_SIZE, total)}{" "}
                  of {total}
                </span>
                <div className="pagination-buttons">
                  <button
                    className="button button-secondary"
                    onClick={handlePrev}
                    disabled={offset === 0}
                  >
                    <ChevronLeft size={15} />
                    Prev
                  </button>
                  <button
                    className="button button-secondary"
                    onClick={handleNext}
                    disabled={offset + RECORD_PAGE_SIZE >= total}
                  >
                    Next
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sort helper — runs client-side on the loaded page of items
// ---------------------------------------------------------------------------
function sortItems(items, sortKey) {
  const sorted = [...items];
  switch (sortKey) {
    case "uploaded_at_asc":
      return sorted.sort((a, b) =>
        (a.uploaded_at || "").localeCompare(b.uploaded_at || "")
      );
    case "uploaded_at_desc":
      return sorted.sort((a, b) =>
        (b.uploaded_at || "").localeCompare(a.uploaded_at || "")
      );
    case "filename_asc":
      return sorted.sort((a, b) =>
        (a.filename || "").localeCompare(b.filename || "")
      );
    case "filename_desc":
      return sorted.sort((a, b) =>
        (b.filename || "").localeCompare(a.filename || "")
      );
    case "size_desc":
      return sorted.sort((a, b) => (b.file_size || 0) - (a.file_size || 0));
    case "size_asc":
      return sorted.sort((a, b) => (a.file_size || 0) - (b.file_size || 0));
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
        (a.reconciliation_status || "").localeCompare(
          b.reconciliation_status || ""
        )
      );
    default:
      return sorted;
  }
}

// ---------------------------------------------------------------------------
// Main CSV Archive page
// ---------------------------------------------------------------------------

export default function CsvArchive() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortKey, setSortKey] = useState("uploaded_at_desc");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selected, setSelected] = useState(null);

  const load = useCallback(
    async (currentOffset, currentSearch, currentType, currentStatus) => {
      setLoading(true);
      setError("");
      try {
        const data = await getArchivedUploads({
          search: currentSearch,
          uploadType: currentType,
          status: currentStatus,
          limit: PAGE_SIZE,
          offset: currentOffset,
        });
        setItems(data.items || []);
        setTotal(data.total || 0);
      } catch (err) {
        setError(err.message || "Failed to load archive.");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    load(0, search, typeFilter, statusFilter);
  }, [load]); // eslint-disable-line

  function applyFilters() {
    setOffset(0);
    load(0, search, typeFilter, statusFilter);
  }

  function handleSearchKey(e) {
    if (e.key === "Enter") applyFilters();
  }

  function handlePrev() {
    const next = Math.max(0, offset - PAGE_SIZE);
    setOffset(next);
    load(next, search, typeFilter, statusFilter);
  }

  function handleNext() {
    const next = offset + PAGE_SIZE;
    setOffset(next);
    load(next, search, typeFilter, statusFilter);
  }

  const displayItems = sortItems(items, sortKey);

  return (
    <div className="csv-archive-page page-transition">
      {/* Header */}
      <div className="archive-intro">
        <div>
          <span className="overview-eyebrow">ORIGINAL FILES</span>
          <h2>CSV Archive</h2>
          <p>Permanently archived original CSV uploads (IST, GMT+5:30). Download or review records at any time.</p>
        </div>
        <button
          className="button button-secondary"
          onClick={() => load(offset, search, typeFilter, statusFilter)}
          disabled={loading}
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="archive-banner archive-banner-error">
          <span>{error}</span>
          <button onClick={() => setError("")} aria-label="Dismiss">
            <X size={15} />
          </button>
        </div>
      )}

      {/* Filter bar */}
      <div className="panel archive-filter-panel">
        <div className="filter-bar">
          <label className="search-box">
            <Search size={16} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKey}
              placeholder="Search by filename…"
            />
          </label>

          <Dropdown
            value={typeFilter}
            onChange={(v) => {
              setTypeFilter(v);
              setOffset(0);
              load(0, search, v, statusFilter);
            }}
            options={TYPE_OPTIONS}
            icon={SlidersHorizontal}
            header="File Type"
            ariaLabel="Filter by file type"
          />

          <Dropdown
            value={statusFilter}
            onChange={(v) => {
              setStatusFilter(v);
              setOffset(0);
              load(0, search, typeFilter, v);
            }}
            options={STATUS_OPTIONS}
            icon={SlidersHorizontal}
            header="Processing Status"
            ariaLabel="Filter by processing status"
          />

          <Dropdown
            value={sortKey}
            onChange={setSortKey}
            options={SORT_OPTIONS}
            icon={SlidersHorizontal}
            header="Sort by"
            ariaLabel="Sort archived files"
          />

          <span className="results-count">{total} archived uploads</span>
        </div>
      </div>

      {/* Table */}
      <div className="panel archive-table-panel">
        {loading ? (
          <div className="archive-loading">
            <RefreshCw size={18} className="spin" />
            Loading archive…
          </div>
        ) : items.length === 0 ? (
          <div className="archive-empty">
            <Archive size={32} />
            <strong>No archived uploads found</strong>
            <span>Uploads will appear here after the first CSV import.</span>
          </div>
        ) : (
          <>
            <div className="archive-table-wrap">
              <table className="archive-table">
                <thead>
                  <tr>
                    <th>Filename</th>
                    <th>Type</th>
                    <th>Uploaded (IST)</th>
                    <th>Size</th>
                    <th>Records</th>
                    <th>Processed</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayItems.map((item) => (
                    <tr key={item.upload_id}>
                      <td className="archive-filename">
                        <FileSpreadsheet size={14} />
                        <span title={item.filename}>{item.filename}</span>
                      </td>
                      <td>
                        <span
                          className={`archive-type-pill ${item.upload_type?.toLowerCase()}`}
                        >
                          {item.upload_type === "TRANSACTIONS"
                            ? "Transaction"
                            : "Settlement"}
                        </span>
                      </td>
                      <td>{formatDate(item.uploaded_at)}</td>
                      <td>{formatBytes(item.file_size)}</td>
                      <td>{item.rows_received ?? "—"}</td>
                      <td>{item.rows_processed ?? "—"}</td>
                      <td>
                        <StatusPill status={item.status || item.reconciliation_status} />
                      </td>
                      <td>
                        <div className="archive-row-actions">
                          <button
                            className="button button-secondary archive-view-btn"
                            onClick={() => setSelected(item)}
                          >
                            View records
                          </button>
                          <a
                            className="archive-dl-btn"
                            href={getArchiveDownloadUrl(item.upload_id)}
                            download={item.filename}
                            target="_blank"
                            rel="noreferrer"
                            title="Download original CSV"
                            aria-label={`Download ${item.filename}`}
                          >
                            <Download size={15} />
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="archive-pagination">
              <span>
                Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
              </span>
              <div className="pagination-buttons">
                <button
                  className="button button-secondary"
                  onClick={handlePrev}
                  disabled={offset === 0 || loading}
                >
                  <ChevronLeft size={15} />
                  Previous
                </button>
                <button
                  className="button button-secondary"
                  onClick={handleNext}
                  disabled={offset + PAGE_SIZE >= total || loading}
                >
                  Next
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {selected && (
        <RecordsModal upload={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

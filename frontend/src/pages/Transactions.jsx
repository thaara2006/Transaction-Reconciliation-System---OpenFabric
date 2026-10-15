import { Download, Search, SlidersHorizontal, AlertTriangle } from "lucide-react";
import TransactionTable from "../components/TransactionTable";
import Dropdown from "../components/Dropdown";
import { STATUS_LABELS } from "../utils/formatting";

const TRANSACTION_SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "id_asc", label: "Transaction ID A–Z" },
  { value: "id_desc", label: "Transaction ID Z–A" },
  { value: "amount_desc", label: "Transaction amount: highest first" },
  { value: "amount_asc", label: "Transaction amount: lowest first" },
  { value: "status_asc", label: "Status A–Z" },
];

const STATUS_OPTIONS = [
  { value: "ALL", label: "All statuses" },
  ...Object.entries(STATUS_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
];

const ISSUE_OPTIONS = [
  { value: "ALL", label: "All issues" },
  { value: "CRITICAL", label: "Critical" },
  { value: "WARNING", label: "Warnings" },
  { value: "REVIEW", label: "Review" },
];

export default function Transactions({
  transactions = [],
  page,
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  issueFilter,
  setIssueFilter,
  sortKey = "newest",
  setSortKey,
  onSelect,
  onExport,
}) {
  const issuesPage = page === "Issues";

  return (
    <section className="panel transactions-panel page-transition">
      <div className="panel-heading table-heading">
        <div>
          <h3>{issuesPage ? "Issues Center" : "All transactions"}</h3>
          <p>
            {issuesPage
              ? "Backend-reported issues and affected transactions."
              : "Select a transaction to inspect its details."}
          </p>
        </div>
        <button
          className="button button-secondary export-button"
          onClick={onExport}
          type="button"
        >
          <Download size={16} /> Export CSV
        </button>
      </div>

      <div className="filter-bar">
        <label className="search-box">
          <Search size={17} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ID, merchant, or account..."
            aria-label="Search transactions"
          />
        </label>

        <Dropdown
          value={statusFilter}
          onChange={setStatusFilter}
          options={STATUS_OPTIONS}
          icon={SlidersHorizontal}
          header="Status"
          ariaLabel="Filter by transaction status"
        />

        {issuesPage && (
          <Dropdown
            value={issueFilter}
            onChange={setIssueFilter}
            options={ISSUE_OPTIONS}
            icon={AlertTriangle}
            header="Issue Type"
            ariaLabel="Filter by issue type"
          />
        )}

        <Dropdown
          value={sortKey}
          onChange={setSortKey}
          options={TRANSACTION_SORT_OPTIONS}
          icon={SlidersHorizontal}
          header="Sort by"
          ariaLabel="Sort transactions"
        />

        <span className="results-count">{transactions.length} results</span>
      </div>

      <TransactionTable transactions={transactions} onSelect={onSelect} />

      <div className="table-footer">
        <span>Showing {transactions.length} records</span>
      </div>
    </section>
  );
}

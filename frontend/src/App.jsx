import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Activity,
  AlertTriangle,
  Archive,
  Wallet,
  FileUp,
  RefreshCw,
  ShieldCheck,
  X,
  CheckCircle2,
} from "lucide-react";

import {
  getDashboardSummary,
  getTransactions,
  reconcileTransactions,
} from "./services/api";

import HelpButton from "./components/HelpButton";
import { getList } from "./utils/formatting";
import { getIssueType, needsReview } from "./utils/issueHelpers";

import Overview from "./pages/Overview";
import Transactions from "./pages/Transactions";
import Uploads from "./pages/Uploads";
import CsvArchive from "./pages/CsvArchive";
import TransactionDetailModal from "./components/TransactionDetailModal";

import "./App.css";

const PAGE_TITLES = {
  Overview: "Dashboard overview",
  Transactions: "Transactions",
  Issues: "Issues Center",
  Uploads: "Upload center",
  Archive: "CSV Archive",
};

const PAGE_SUBTITLES = {
  Overview: "Monitor settlement performance and reconciliation health.",
  Transactions: "Search, filter, and inspect individual transaction records.",
  Issues: "Review backend-reported issues and recommendations.",
  Uploads: "Import transaction and settlement CSV files.",
  Archive: "Browse and download original uploaded CSV files.",
};

export default function App() {
  const [page, setPage] = useState("Overview");
  const [summary, setSummary] = useState({});
  const [transactions, setTransactions] = useState([]);
  const [selected, setSelected] = useState(null);

  const [loading, setLoading] = useState(true);
  const [reconciling, setReconciling] = useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [issueFilter, setIssueFilter] = useState("ALL");
  const [sortKey, setSortKey] = useState("newest");

  const loadDashboard = useCallback(async () => {
    setError("");

    try {
      const [dashboardData, transactionData] = await Promise.all([
        getDashboardSummary(),
        getTransactions(),
      ]);

      setSummary(dashboardData || {});
      setTransactions(getList(transactionData));
    } catch (err) {
      setError(
        err.message ||
          "Unable to load data. Check whether the backend is running."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const issueTransactions = useMemo(
    () => transactions.filter(needsReview),
    [transactions]
  );

  const visibleTransactions = useMemo(() => {
    const source =
      page === "Issues" ? issueTransactions : transactions;

    return source.filter((transaction) => {
      const searchableText = [
        transaction.transaction_id,
        transaction.merchant_name,
        transaction.account_id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const settlementStatus = String(
        transaction.settlement_status ||
          transaction.status ||
          "PENDING"
      ).toUpperCase();

      const issueType = getIssueType(transaction).toUpperCase();

      const matchesSearch = searchableText.includes(
        search.trim().toLowerCase()
      );

      const matchesStatus =
        statusFilter === "ALL" ||
        settlementStatus === statusFilter;

      const matchesIssue =
        page !== "Issues" ||
        issueFilter === "ALL" ||
        issueType === issueFilter ||
        (issueFilter === "WARNING" && issueType === "REVIEW");

      return matchesSearch && matchesStatus && matchesIssue;
    });
  }, [
    page,
    transactions,
    issueTransactions,
    search,
    statusFilter,
    issueFilter,
  ]);

  const sortedVisibleTransactions = useMemo(() => {
    const list = [...visibleTransactions];
    switch (sortKey) {
      case "oldest":
        return list.sort((a, b) => {
          const diff =
            new Date(a.transaction_date || 0) -
            new Date(b.transaction_date || 0);
          if (diff !== 0) return diff;
          return String(a.transaction_id || "").localeCompare(
            String(b.transaction_id || "")
          );
        });
      case "id_asc":
        return list.sort((a, b) =>
          String(a.transaction_id || "").localeCompare(
            String(b.transaction_id || "")
          )
        );
      case "id_desc":
        return list.sort((a, b) =>
          String(b.transaction_id || "").localeCompare(
            String(a.transaction_id || "")
          )
        );
      case "amount_desc":
        return list.sort((a, b) => {
          const amtA = Number(a.transaction_amount ?? a.amount ?? 0);
          const amtB = Number(b.transaction_amount ?? b.amount ?? 0);
          if (amtB !== amtA) return amtB - amtA;
          return String(a.transaction_id || "").localeCompare(
            String(b.transaction_id || "")
          );
        });
      case "amount_asc":
        return list.sort((a, b) => {
          const amtA = Number(a.transaction_amount ?? a.amount ?? 0);
          const amtB = Number(b.transaction_amount ?? b.amount ?? 0);
          if (amtA !== amtB) return amtA - amtB;
          return String(a.transaction_id || "").localeCompare(
            String(b.transaction_id || "")
          );
        });
      case "status_asc":
        return list.sort((a, b) => {
          const stA = String(a.settlement_status || a.status || "");
          const stB = String(b.settlement_status || b.status || "");
          const cmp = stA.localeCompare(stB);
          if (cmp !== 0) return cmp;
          return String(a.transaction_id || "").localeCompare(
            String(b.transaction_id || "")
          );
        });
      case "newest":
      default:
        return list.sort((a, b) => {
          const diff =
            new Date(b.transaction_date || 0) -
            new Date(a.transaction_date || 0);
          if (diff !== 0) return diff;
          return String(b.transaction_id || "").localeCompare(
            String(a.transaction_id || "")
          );
        });
    }
  }, [visibleTransactions, sortKey]);

  const changePage = (nextPage) => {
    setPage(nextPage);
    setSearch("");
    setStatusFilter("ALL");
    setIssueFilter("ALL");
    setSortKey("newest");
    setSelected(null);
    setError("");
    setNotice("");
  };

  const handleReconcile = async () => {
    setReconciling(true);
    setError("");
    setNotice("");

    try {
      await reconcileTransactions();
      await loadDashboard();
      setNotice("Reconciliation completed successfully.");
    } catch (err) {
      setError(err.message || "Reconciliation failed.");
    } finally {
      setReconciling(false);
    }
  };

  const exportCsv = () => {
    const columns = [
      ["Transaction ID", "transaction_id"],
      ["Date", "transaction_date"],
      ["Merchant", "merchant_name"],
      ["Account ID", "account_id"],
      ["Amount", "transaction_amount"],
      ["Currency", "currency"],
      ["Settlement Status", "settlement_status"],
      ["Settled Amount", "total_settled_amount"],
    ];

    const escapeCsv = (value) =>
      `"${String(value ?? "").replaceAll('"', '""')}"`;

    const csvRows = [
      columns.map(([heading]) => escapeCsv(heading)).join(","),
      ...sortedVisibleTransactions.map((transaction) =>
        columns
          .map(([, key]) => escapeCsv(transaction[key]))
          .join(",")
      ),
    ];

    const blob = new Blob([csvRows.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download =
      page === "Issues" ? "trs-issues.csv" : "trs-transactions.csv";

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  };

  function renderPage() {
    if (loading) {
      return (
        <div className="loading-card">
          <RefreshCw className="spin" size={20} />
          Loading reconciliation data...
        </div>
      );
    }

    if (page === "Overview") {
      return (
        <Overview
          summary={summary}
          transactions={transactions}
          issueTransactions={issueTransactions}
          transactionCount={transactions.length}
          issueTransactionsCount={issueTransactions.length}
          onOpenTransactions={() => changePage("Transactions")}
          onOpenIssues={() => changePage("Issues")}
        />
      );
    }

    if (page === "Uploads") {
      return <Uploads onUploaded={loadDashboard} />;
    }

    if (page === "Archive") {
      return <CsvArchive />;
    }

    return (
      <Transactions
        page={page}
        transactions={sortedVisibleTransactions}
        search={search}
        setSearch={setSearch}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        issueFilter={issueFilter}
        setIssueFilter={setIssueFilter}
        sortKey={sortKey}
        setSortKey={setSortKey}
        onSelect={setSelected}
        onExport={exportCsv}
      />
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Activity size={20} />
          </div>
          <div className="brand-text">
            <small>Transaction Reconciliation System</small>
          </div>
        </div>

        <p className="nav-caption">WORKSPACE</p>

        <nav className="navigation">
          <button
            className={`nav-item ${page === "Overview" ? "active" : ""}`}
            onClick={() => changePage("Overview")}
          >
            <Activity size={18} />
            <span>Overview</span>
          </button>

          <button
            className={`nav-item ${
              page === "Transactions" ? "active" : ""
            }`}
            onClick={() => changePage("Transactions")}
          >
            <Wallet size={18} />
            <span>Transactions</span>
          </button>

          <button
            className={`nav-item ${page === "Issues" ? "active" : ""}`}
            onClick={() => changePage("Issues")}
          >
            <AlertTriangle size={18} />
            <span>Issues</span>

            {issueTransactions.length > 0 && (
              <span className="nav-count">
                {issueTransactions.length}
              </span>
            )}
          </button>

          <button
            className={`nav-item ${page === "Uploads" ? "active" : ""}`}
            onClick={() => changePage("Uploads")}
          >
            <FileUp size={18} />
            <span>Uploads</span>
          </button>

          <button
            className={`nav-item ${page === "Archive" ? "active" : ""}`}
            onClick={() => changePage("Archive")}
          >
            <Archive size={18} />
            <span>CSV Archive</span>
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="secure-card">
            <ShieldCheck size={21} />
            <strong>Reconciliation workspace</strong>
            <p>
              Review transaction settlement outcomes and exceptions.
            </p>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div>
            <div className="breadcrumb">
              Workspace <span>/</span> {page}
            </div>

            <h1>{PAGE_TITLES[page]}</h1>

            <p className="page-subtitle">
              {PAGE_SUBTITLES[page]}
            </p>
          </div>

          <div className="topbar-actions">
            <button
              className="button button-secondary"
              onClick={loadDashboard}
              disabled={loading || reconciling}
            >
              <RefreshCw size={16} />
              Refresh
            </button>

            <button
              className="button button-primary"
              onClick={handleReconcile}
              disabled={reconciling || loading}
            >
              <Activity size={17} />
              {reconciling ? "Reconciling…" : "Run reconciliation"}
            </button>

            <HelpButton />
          </div>
        </header>

        {error && (
          <div className="notice notice-error">
            <span>{error}</span>
            <button
              onClick={() => setError("")}
              aria-label="Dismiss error"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {notice && (
          <div className="notice notice-success">
            <CheckCircle2 size={18} />
            <span>{notice}</span>
            <button
              onClick={() => setNotice("")}
              aria-label="Dismiss notification"
            >
              <X size={16} />
            </button>
          </div>
        )}

        <div className="page-content">
          {renderPage()}
        </div>

        <footer className="app-footer">
          <span>Transaction Reconciliation System</span>
          <span>Settlement visibility, simplified. • Time zone: India (GMT+5:30)</span>
        </footer>
      </main>

      {selected && (
        <TransactionDetailModal
          transaction={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
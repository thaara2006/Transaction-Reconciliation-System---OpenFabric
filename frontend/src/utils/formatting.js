export const STATUS_LABELS = {
  FULLY_SETTLED: "Fully settled",
  PARTIAL: "Partially settled",
  PENDING: "Pending",
  OVER_SETTLED: "Over-settled",
  REFUNDED: "Refunded",
  NOT_APPLICABLE: "Not applicable",
};

export function getList(data) {
  if (Array.isArray(data)) return data;
  return data?.transactions || data?.items || data?.results || [];
}
export function getStatus(transaction) {
  return String(transaction?.settlement_status || transaction?.status || "PENDING").toUpperCase();
}
export function getAmount(transaction) {
  return Number(transaction?.transaction_amount ?? transaction?.amount ?? 0);
}
export function getSettledAmount(transaction) {
  return Number(transaction?.total_settled_amount ?? transaction?.settlement_amount ?? transaction?.settled_amount ?? 0);
}
export function getCurrency(transaction) { return transaction?.currency || "USD"; }
export function money(value, currency = "USD") {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value) || 0); }
  catch { return `${currency} ${(Number(value) || 0).toFixed(2)}`; }
}
export function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  const s = String(val).trim();
  // If pure date 'YYYY-MM-DD', treat as midnight in India (GMT+5:30)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(`${s}T00:00:00+05:30`);
  }
  // If 'YYYY-MM-DD HH:MM:SS' or 'YYYY-MM-DDTHH:MM:SS' without timezone offset, treat as UTC from SQLite
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?(\.\d+)?$/.test(s)) {
    return new Date(s.replace(" ", "T") + "Z");
  }
  return new Date(s);
}

export function formatDateTimeIST(value, includeSeconds = false) {
  if (!value) return "—";
  const date = parseDate(value);
  if (!date || Number.isNaN(date.getTime())) return String(value);

  const formatted = date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...(includeSeconds ? { second: "2-digit" } : {}),
    hour12: true,
  });

  return `${formatted} IST`;
}

export function dateLabel(value) {
  if (!value) return "—";
  const s = String(value).trim();
  if (s.includes(":") || s.includes("T")) {
    return formatDateTimeIST(value);
  }
  const date = parseDate(value);
  if (!date || Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

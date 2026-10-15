const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, options);

  if (!response.ok) {
    let message = `Request failed (${response.status})`;

    try {
      const body = await response.json();
      message = body.detail || body.message || message;
    } catch {
      // Keep the default error message.
    }

    throw new Error(message);
  }

  return response.json();
}

export const getDashboardSummary = () =>
  request("/dashboard/summary");

export const getTransactions = () =>
  request("/transactions");

export const getTransactionDetails = (id) => {
  if (!id) throw new Error("Transaction ID is required");

  return request(`/transactions/${encodeURIComponent(id)}`);
};

export const reconcileTransactions = () =>
  request("/reconcile", { method: "POST" });

export const getUploadHistory = () =>
  request("/uploads");

async function uploadCsv(path, file) {
  if (!file) throw new Error("Choose a CSV file first.");

  const formData = new FormData();
  formData.append("file", file);

  return request(path, {
    method: "POST",
    body: formData,
  });
}

export const uploadTransactionsCsv = (file) =>
  uploadCsv("/uploads/transactions", file);

export const uploadSettlementsCsv = (file) =>
  uploadCsv("/uploads/settlements", file);
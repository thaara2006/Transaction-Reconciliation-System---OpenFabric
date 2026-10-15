// Issue severity is derived only from explicit backend issue records.
// Do not infer an issue from PARTIAL/PENDING status; status and issue severity are different concepts.
export function getIssueType(transaction) {
  const issues = Array.isArray(transaction?.issues) ? transaction.issues : [];
  const severities = issues.map((issue) =>
    String(typeof issue === "string" ? issue : issue?.severity || "").toUpperCase()
  );
  if (severities.includes("CRITICAL")) return "Critical";
  if (severities.includes("WARNING")) return "Warning";
  if (severities.includes("REVIEW")) return "Review";
  return issues.length ? "Review" : "None";
}
export function needsReview(transaction) { return getIssueType(transaction) !== "None"; }
export function getIssueRecords(transactions) {
  return transactions.flatMap((transaction) => {
    const issues = Array.isArray(transaction.issues) ? transaction.issues : [];
    return issues.map((issue, index) => ({
      ...((typeof issue === "object" && issue) ? issue : { message: String(issue) }),
      transaction_id: transaction.transaction_id,
      merchant_name: transaction.merchant_name,
      currency: transaction.currency || "USD",
      transaction_amount: transaction.transaction_amount,
      _key: `${transaction.transaction_id || "transaction"}-${index}`,
    }));
  });
}

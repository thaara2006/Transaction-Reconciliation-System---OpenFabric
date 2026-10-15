import { dateLabel, getAmount, getCurrency, getSettledAmount, getStatus, money } from "../utils/formatting";
import StatusBadge from "./StatusBadge";
import IssueBadge from "./IssueBadge";
export default function TransactionTable({ transactions, onSelect }) {
  return <div className="table-wrap"><table><thead><tr><th>Transaction ID</th><th>Date</th><th>Merchant</th><th>Amount</th><th>Settlement status</th><th>Settled amount</th><th>Issue flag</th><th /></tr></thead><tbody>
    {transactions.map((t, index) => <tr key={t.transaction_id || index} className="clickable-row" onClick={() => onSelect(t)}>
      <td><strong className="transaction-id">{t.transaction_id || "—"}</strong><small className="account-id">{t.account_id || "Account not listed"}</small></td>
      <td>{dateLabel(t.transaction_date)}</td><td className="merchant-cell">{t.merchant_name || "—"}</td>
      <td className="amount-cell">{money(getAmount(t), getCurrency(t))}</td><td><StatusBadge status={getStatus(t)} /></td>
      <td className="amount-cell">{money(getSettledAmount(t), getCurrency(t))}</td><td><IssueBadge transaction={t} /></td><td><button className="row-arrow" aria-label={`View ${t.transaction_id} details`} onClick={(e) => { e.stopPropagation(); onSelect(t); }}>→</button></td>
    </tr>)}</tbody></table>{transactions.length === 0 && <div className="empty-table">No records match these filters.</div>}</div>;
}

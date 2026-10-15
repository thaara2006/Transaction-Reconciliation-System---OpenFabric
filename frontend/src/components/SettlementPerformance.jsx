
import { useMemo } from "react";
import {
  AlertTriangle,
  ChartNoAxesCombined,
} from "lucide-react";

import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  PieChart,
  Pie,
} from "recharts";

import {
  getAmount,
  getCurrency,
  getSettledAmount,
  money,
} from "../utils/formatting";

const COLORS = [
  "#16845b",
  "#3478f6",
  "#e7a12b",
  "#d94c4c",
  "#8b96a8",
];

function RoundedTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;

  const item = payload[0]?.payload;

  if (!item) return null;

  return (
    <div className="rounded-chart-tooltip">
      <span className="tooltip-eyebrow">{item.transactionId}</span>
      <strong>{item.merchant}</strong>

      <div className="tooltip-value-row">
        Transaction amount
      </div>
      <div className="tooltip-amount">
        {money(item.transactionAmount, item.currency)}
      </div>

      <div className="tooltip-value-row">
        Settled amount
      </div>
      <div className="tooltip-amount">
        {money(item.settledAmount, item.currency)}
      </div>

      <div className="tooltip-secondary">
        {item.difference > 0
          ? "Outstanding amount"
          : item.difference < 0
          ? "Over-settled amount"
          : "No amount difference"}
      </div>
      <div className="tooltip-amount">
        {money(Math.abs(item.difference), item.currency)}
      </div>
    </div>
  );
}

function StatusTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;

  const item = payload[0]?.payload;

  if (!item) return null;

  return (
    <div className="rounded-chart-tooltip donut-tooltip">
      <strong>{item.name}</strong>
      <div className="tooltip-amount">{item.value} transactions</div>
      <div className="tooltip-secondary">
        {item.percentage.toFixed(1)}% of transactions
      </div>
    </div>
  );
}

export default function SettlementPerformance({
  data = [],
  statusData = [],
  onSelectTransaction,
}) {
  const discrepancies = useMemo(() => {
    return data
      .map((transaction) => {
        const transactionAmount = getAmount(transaction);
        const settledAmount = getSettledAmount(transaction);
        const difference = transactionAmount - settledAmount;

        return {
          transactionId:
            transaction.transaction_id ||
            transaction.id ||
            "Unknown",
          merchant: transaction.merchant_name || "Unknown merchant",
          currency: getCurrency(transaction),
          transactionAmount,
          settledAmount,
          difference,
          discrepancy: Math.abs(difference),
          type:
            difference > 0
              ? "Outstanding"
              : difference < 0
              ? "Over-settled"
              : "Matched",
        };
      })
      .filter((item) => item.discrepancy > 0)
      .sort((a, b) => b.discrepancy - a.discrepancy)
      .slice(0, 10);
  }, [data]);

  const statusTotal = statusData.reduce(
    (total, item) => total + Number(item.value || 0),
    0
  );

  const normalizedStatus = statusData
    .filter((item) => Number(item.value) > 0)
    .map((item) => ({
      ...item,
      percentage: statusTotal
        ? (Number(item.value) / statusTotal) * 100
        : 0,
    }));

  return (
    <section className="settlement-performance">
      <article className="performance-chart-card">
        <div className="overview-panel-heading">
          <div>
            <span className="overview-eyebrow">RECONCILIATION ANALYTICS</span>
            <h2>Top Discrepancies</h2>
            <p>
              Transactions with the largest differences between transaction
              and settled amounts.
            </p>
          </div>

          <ChartNoAxesCombined size={22} color="#3478F6" />
        </div>

        {discrepancies.length === 0 ? (
          <div className="chart-empty">
            <AlertTriangle size={20} />
            <span>No amount discrepancies found.</span>
          </div>
        ) : (
          <>
            <div className="discrepancy-chart">
              <ResponsiveContainer width="100%" height={Math.max(280, discrepancies.length * 42)}>
                <BarChart
                  data={discrepancies}
                  layout="vertical"
                  margin={{ top: 8, right: 22, left: 12, bottom: 8 }}
                  barCategoryGap={12}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    horizontal={false}
                    stroke="#E8EDF5"
                  />

                  <XAxis
                    type="number"
                    tick={{ fill: "#78869A", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value) => Number(value).toLocaleString()}
                  />

                  <YAxis
                    type="category"
                    dataKey="transactionId"
                    width={90}
                    tick={{ fill: "#536984", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />

                  <Tooltip
                    content={<RoundedTooltip />}
                    cursor={{ fill: "#F3F7FC" }}
                  />

                  <Bar
                    dataKey="discrepancy"
                    name="Amount difference"
                    radius={[0, 7, 7, 0]}
                    maxBarSize={22}
                    onClick={(entry) =>
                      onSelectTransaction?.(entry)
                    }
                    cursor={onSelectTransaction ? "pointer" : "default"}
                  >
                    {discrepancies.map((item) => (
                      <Cell
                        key={item.transactionId}
                        fill={
                          item.difference < 0
                            ? "#D94C4C"
                            : "#F28C28"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="chart-legend discrepancy-legend">
              <span className="legend-item">
                <i className="legend-dot" style={{ background: "#F28C28" }} />
                Outstanding amount
              </span>
              <span className="legend-item">
                <i className="legend-dot" style={{ background: "#D94C4C" }} />
                Over-settled amount
              </span>
            </div>
          </>
        )}
      </article>

      <article className="status-chart-card">
        <div className="overview-panel-heading">
          <div>
            <span className="overview-eyebrow">RECONCILIATION STATUS</span>
            <h2>Settlement status</h2>
            <p>Distribution of settlement outcomes.</p>
          </div>
        </div>

        {normalizedStatus.length === 0 ? (
          <div className="chart-empty">
            No settlement status data is available.
          </div>
        ) : (
          <>
            <div className="status-donut">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={normalizedStatus}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={83}
                    paddingAngle={3}
                  >
                    {normalizedStatus.map((item, index) => (
                      <Cell
                        key={item.name}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>

                  <Tooltip content={<StatusTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="status-legend status-legend-grid">
              {normalizedStatus.map((item, index) => (
                <div className="legend-item" key={item.name}>
                  <span
                    className="legend-dot"
                    style={{
                      backgroundColor: COLORS[index % COLORS.length],
                    }}
                  />
                  <span>{item.name}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </>
        )}
      </article>
    </section>
  );
}

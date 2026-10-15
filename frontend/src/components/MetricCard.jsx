import { ArrowUpRight } from "lucide-react";

export default function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  tone = "blue",
  trendPercent,
  previousPeriodCount,
  onClick,
}) {
  const hasTrend =
    trendPercent !== undefined &&
    trendPercent !== null &&
    Number.isFinite(Number(trendPercent));

  const percentage = hasTrend ? Number(trendPercent) : null;

  const trendClass =
    !hasTrend || percentage === 0
      ? "trend-neutral"
      : percentage > 0
        ? "trend-up"
        : "trend-down";

  const trendSymbol =
    !hasTrend || percentage === 0
      ? "→"
      : percentage > 0
        ? "↑"
        : "↓";

  const content = (
    <>
      <div className="metric-top">
        <span className={`metric-icon ${tone}`}>
          {Icon && <Icon size={20} />}
        </span>

        {onClick && (
          <ArrowUpRight className="metric-link-icon" size={16} />
        )}

        {title === "Transaction volume" && (
          <span className={`volume-trend ${trendClass}`}>
            {hasTrend
              ? `${trendSymbol} ${Math.abs(percentage).toFixed(1)}%`
              : "No previous-period data"}
          </span>
        )}
      </div>

      <p className="metric-title">{title}</p>

      <h2 className="metric-value">{value ?? 0}</h2>

      <p className="metric-subtitle">
        {title === "Transaction volume"
          ? hasTrend
            ? `Previous 30 days: ${previousPeriodCount ?? 0} transactions`
            : "Comparison unavailable"
          : subtitle}
      </p>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className="metric-card metric-card-clickable"
        onClick={onClick}
        aria-label={`Open ${title}`}
      >
        {content}
      </button>
    );
  }

  return <article className="metric-card">{content}</article>;
}
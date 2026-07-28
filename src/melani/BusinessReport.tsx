import type { CSSProperties } from "react";
import "./business-report.css";
import type {
  BusinessQuarterKey,
  BusinessQuarterOption,
  BusinessQuarterReport,
} from "./financeBusinessReport";

type BusinessReportProps = {
  report: BusinessQuarterReport;
  availableQuarters: BusinessQuarterOption[];
  selectedQuarter: BusinessQuarterKey;
  onQuarterChange: (quarter: BusinessQuarterKey) => void;
  onExport: () => void;
  onPrint: () => void;
  onReviewLedger: () => void;
};

function dollars(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Math.abs(value) >= 100_000 ? 0 : 2,
  }).format(value);
}

function compactDollars(value: number): string {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) {
    return `${value < 0 ? "−" : ""}$${(absolute / 1_000_000).toFixed(1)}M`;
  }
  if (absolute >= 10_000) {
    return `${value < 0 ? "−" : ""}$${(absolute / 1_000).toFixed(1)}K`;
  }
  return dollars(value).replace("-", "−");
}

function percent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "Unavailable";
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}%`;
}

function margin(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "Unavailable";
  return `${value.toFixed(1)}%`;
}

function TrendNote({
  value,
  comparison,
  inverse = false,
}: {
  value: number | null;
  comparison: string;
  inverse?: boolean;
}) {
  if (value == null || !Number.isFinite(value)) {
    return <span className="wbr-kpi-note is-neutral">No comparable baseline</span>;
  }
  const favorable = inverse ? value <= 0 : value >= 0;
  return (
    <span className={`wbr-kpi-note ${favorable ? "is-good" : "is-bad"}`}>
      <span aria-hidden="true">{value >= 0 ? "▲" : "▼"}</span>{" "}
      {Math.abs(value).toFixed(1)}% {comparison}
    </span>
  );
}

function KpiCard({
  label,
  value,
  children,
  tone,
}: {
  label: string;
  value: string;
  children: React.ReactNode;
  tone?: "good" | "bad" | "neutral";
}) {
  return (
    <article className="wbr-kpi">
      <h3>{label}</h3>
      <strong className={tone ? `is-${tone}` : undefined}>{value}</strong>
      {children}
    </article>
  );
}

function TrendChart({
  rows,
}: {
  rows: BusinessQuarterReport["trend"];
}) {
  const width = 620;
  const height = 250;
  const left = 58;
  const right = 20;
  const top = 24;
  const bottom = 44;
  const innerWidth = width - left - right;
  const innerHeight = height - top - bottom;
  const maxValue = Math.max(
    1,
    ...rows.flatMap((row) => [row.revenue, row.operatingExpenses]),
  );
  const x = (index: number) =>
    left + (rows.length <= 1 ? innerWidth / 2 : (index / (rows.length - 1)) * innerWidth);
  const y = (value: number) => top + innerHeight - (value / maxValue) * innerHeight;
  const revenuePoints = rows
    .map((row, index) => `${x(index)},${y(row.revenue)}`)
    .join(" ");
  const expensePoints = rows
    .map((row, index) => `${x(index)},${y(row.operatingExpenses)}`)
    .join(" ");

  return (
    <div className="wbr-trend-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Quarterly operating income and spend trend"
      >
        <title>Operating income and spend by quarter</title>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const gridY = top + innerHeight * ratio;
          const value = maxValue * (1 - ratio);
          return (
            <g key={ratio}>
              <line
                x1={left}
                x2={width - right}
                y1={gridY}
                y2={gridY}
                className="wbr-grid-line"
              />
              <text x={left - 10} y={gridY + 4} textAnchor="end">
                {value >= 1_000 ? `$${Math.round(value / 1_000)}k` : `$${Math.round(value)}`}
              </text>
            </g>
          );
        })}
        <polyline points={revenuePoints} className="wbr-line is-income" />
        <polyline points={expensePoints} className="wbr-line is-expense" />
        {rows.map((row, index) => (
          <g key={row.key}>
            <circle cx={x(index)} cy={y(row.revenue)} r="4" className="wbr-dot is-income" />
            <circle cx={x(index)} cy={y(row.operatingExpenses)} r="4" className="wbr-dot is-expense" />
            <text
              x={x(index)}
              y={height - 14}
              textAnchor="middle"
              className={row.isPartial ? "is-partial" : undefined}
            >
              {row.label}
            </text>
          </g>
        ))}
      </svg>
      <div className="wbr-chart-legend" aria-label="Chart legend">
        <span><i className="is-income" />Operating income</span>
        <span><i className="is-expense" />Operating spend</span>
        <em>* QTD</em>
      </div>
    </div>
  );
}

function CashFlowBars({
  cashFlow,
}: {
  cashFlow: BusinessQuarterReport["cashFlow"];
}) {
  const rows = [
    { label: "Operating", value: cashFlow.operating },
    { label: "Investing", value: cashFlow.investing },
    { label: "Financing", value: cashFlow.financing },
    ...(cashFlow.unclassified
      ? [{ label: "Unclassified", value: cashFlow.unclassified }]
      : []),
  ];
  const max = Math.max(1, ...rows.map((row) => Math.abs(row.value)));
  return (
    <div className="wbr-cash-bars" aria-label="Cash flow by class">
      {rows.map((row) => {
        const width = Math.max(2, (Math.abs(row.value) / max) * 48);
        const style = { "--wbr-bar-size": `${width}%` } as CSSProperties;
        return (
          <div className="wbr-cash-row" key={row.label}>
            <span>{row.label}</span>
            <div className="wbr-cash-track">
              <i className="wbr-cash-axis" />
              <i
                className={`wbr-cash-bar ${row.value >= 0 ? "is-positive" : "is-negative"}`}
                style={style}
              />
            </div>
            <strong>{compactDollars(row.value)}</strong>
          </div>
        );
      })}
      <p>
        Net known + unclassified cash movement{" "}
        <strong>{compactDollars(cashFlow.netChange)}</strong>
      </p>
    </div>
  );
}

function ExpenseDonut({
  rows,
}: {
  rows: BusinessQuarterReport["expenseBreakdown"];
}) {
  let cursor = 0;
  const segments = rows.map((row) => {
    const start = cursor;
    cursor += row.percent;
    return `${row.color} ${start}% ${cursor}%`;
  });
  const donutStyle = {
    background: rows.length
      ? `conic-gradient(${segments.join(",")})`
      : "conic-gradient(var(--wbr-empty-ring) 0 100%)",
  };
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  return (
    <div className="wbr-expense-mix">
      <div
        className="wbr-donut"
        style={donutStyle}
        role="img"
        aria-label={
          rows.length
            ? rows
                .map((row) => `${row.label} ${row.percent.toFixed(0)} percent`)
                .join(", ")
            : "No recognized operating expenses"
        }
      >
        <div>
          <strong>{compactDollars(total)}</strong>
          <span>recognized spend</span>
        </div>
      </div>
      <ul>
        {rows.length ? (
          rows.map((row) => (
            <li key={row.id}>
              <i style={{ background: row.color }} />
              <span>{row.label}</span>
              <strong>{row.percent.toFixed(0)}%</strong>
              <em>{compactDollars(row.amount)}</em>
            </li>
          ))
        ) : (
          <li className="is-empty">No recognized operating expenses this period.</li>
        )}
      </ul>
    </div>
  );
}

function Panel({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`wbr-panel ${className}`.trim()}>
      <h2>{title}</h2>
      <div className="wbr-panel-body">{children}</div>
    </section>
  );
}

export function BusinessReport({
  report,
  availableQuarters,
  selectedQuarter,
  onQuarterChange,
  onExport,
  onPrint,
  onReviewLedger,
}: BusinessReportProps) {
  const priorProfit =
    report.metrics.priorRevenue - report.metrics.priorOperatingExpenses;
  const profitChange =
    priorProfit > 0
      ? ((report.metrics.netProfit - priorProfit) / Math.abs(priorProfit)) * 100
      : null;
  const integrityTone =
    report.integrity.status === "ready"
      ? "is-ready"
      : report.integrity.status === "blocked"
        ? "is-blocked"
        : "is-review";

  return (
    <section className="wbr" aria-labelledby="wbr-title">
      <header className="wbr-header">
        <div>
          <p>Personal enterprise · transaction basis</p>
          <h1 id="wbr-title">Quarterly operating review</h1>
          <span>
            {report.quarter.label} · through {report.quarter.asOfDate} ·{" "}
            {report.quarter.comparisonLabel}
          </span>
        </div>
        <div className="wbr-controls">
          <label>
            Quarter
            <select
              value={selectedQuarter}
              onChange={(event) =>
                onQuarterChange(event.target.value as BusinessQuarterKey)
              }
            >
              {availableQuarters.map((quarter) => (
                <option key={quarter.key} value={quarter.key}>
                  {quarter.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={onReviewLedger}>
            Supporting ledger
          </button>
          <button type="button" onClick={onExport}>
            Export CSV
          </button>
          <button type="button" className="is-primary" onClick={onPrint}>
            Print / PDF
          </button>
        </div>
      </header>

      <div className={`wbr-integrity ${integrityTone}`}>
        <strong>{report.integrity.label}</strong>
        <span>Control score {report.integrity.score}/100</span>
      </div>

      <div className="wbr-grid">
        <div className="wbr-kpis">
          <KpiCard label="Operating income" value={compactDollars(report.metrics.revenue)}>
            <TrendNote
              value={report.metrics.revenueGrowthPct}
              comparison={report.quarter.comparisonLabel}
            />
          </KpiCard>
          <KpiCard label="Operating spend" value={compactDollars(report.metrics.operatingExpenses)}>
            <TrendNote
              value={report.metrics.expenseChangePct}
              comparison={report.quarter.comparisonLabel}
              inverse
            />
          </KpiCard>
          <KpiCard
            label="Operating surplus"
            value={compactDollars(report.metrics.netProfit)}
            tone={report.metrics.netProfit >= 0 ? "good" : "bad"}
          >
            <TrendNote value={profitChange} comparison={report.quarter.comparisonLabel} />
          </KpiCard>
          <KpiCard label="Income growth" value={percent(report.metrics.revenueGrowthPct)}>
            <span className="wbr-kpi-note is-neutral">
              {report.quarter.comparisonBasis === "matched-qtd"
                ? "Matched-day QTD comparison"
                : "Full calendar-quarter comparison"}
            </span>
          </KpiCard>
          <KpiCard label="Operating margin" value={margin(report.metrics.operatingMarginPct)}>
            <span className="wbr-kpi-note is-neutral">
              Surplus ÷ recognized income
            </span>
          </KpiCard>
        </div>

        <Panel title="Expense breakdown" className="wbr-expenses">
          <ExpenseDonut rows={report.expenseBreakdown} />
        </Panel>

        <Panel title="Income & expense trend" className="wbr-trend">
          <TrendChart rows={report.trend} />
        </Panel>

        <Panel title="Cash flow" className="wbr-cash">
          <CashFlowBars cashFlow={report.cashFlow} />
        </Panel>

        <Panel title="Highlights" className="wbr-highlights">
          <ul>
            {report.highlights.map((highlight) => (
              <li key={highlight}>{highlight}</li>
            ))}
          </ul>
        </Panel>

        <Panel title="Outlook / next steps" className="wbr-next">
          <ol>
            {report.nextSteps.map((step) => (
              <li key={step.id} className={`is-${step.priority}`}>
                <strong>{step.title}</strong>
                <span>{step.detail}</span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>

      <footer className="wbr-footer">
        <div>
          <strong>Report basis</strong>
          <p>{report.basisNote}</p>
          <p>{report.ebitdaNote}</p>
        </div>
        <details>
          <summary>Control notes · {report.integrity.warnings.length}</summary>
          <ul>
            {report.integrity.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </details>
      </footer>
    </section>
  );
}

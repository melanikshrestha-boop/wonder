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
  onReviewSlice: (slice: {
    kind: "income" | "expense";
    category: string | null;
    label: string;
    transactionIds: string[];
  }) => void;
};

type BreakdownRow =
  BusinessQuarterReport["personal"]["expenseBreakdown"][number];

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

function signedDollars(value: number): string {
  if (Math.abs(value) < 0.005) return "$0.00";
  return `${value > 0 ? "+" : "−"}${dollars(Math.abs(value))}`;
}

function changePercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "No baseline";
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}%`;
}

function rate(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
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
      {value >= 0 ? "↑" : "↓"} {Math.abs(value).toFixed(1)}% {comparison}
    </span>
  );
}

function Kpi({
  label,
  value,
  children,
  tone = "neutral",
  onClick,
}: {
  label: string;
  value: string;
  children: React.ReactNode;
  tone?: "good" | "bad" | "neutral";
  onClick?: () => void;
}) {
  const content = (
    <>
      <h3>{label}</h3>
      <strong className={`is-${tone}`}>{value}</strong>
      {children}
      {onClick ? <span className="wbr-open-cue">View ledger →</span> : null}
    </>
  );
  if (!onClick) {
    return <article className="wbr-kpi">{content}</article>;
  }
  return (
    <button
      type="button"
      className="wbr-kpi is-clickable"
      onClick={onClick}
      aria-label={`Open ${label.toLowerCase()} transactions`}
    >
      {content}
    </button>
  );
}

function TrendChart({
  rows,
}: {
  rows: BusinessQuarterReport["personal"]["trend"];
}) {
  const width = 720;
  const height = 270;
  const left = 62;
  const right = 24;
  const top = 22;
  const bottom = 46;
  const innerWidth = width - left - right;
  const innerHeight = height - top - bottom;
  const maxValue = Math.max(
    1,
    ...rows.flatMap((row) => [row.moneyIn, row.moneyOut]),
  );
  const x = (index: number) =>
    left +
    (rows.length <= 1
      ? innerWidth / 2
      : (index / (rows.length - 1)) * innerWidth);
  const y = (value: number) =>
    top + innerHeight - (value / maxValue) * innerHeight;
  const inPoints = rows
    .map((row, index) => `${x(index)},${y(row.moneyIn)}`)
    .join(" ");
  const outPoints = rows
    .map((row, index) => `${x(index)},${y(row.moneyOut)}`)
    .join(" ");

  return (
    <div className="wbr-trend-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Money in and money out by quarter"
      >
        <title>Money in and money out by quarter</title>
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
                {value >= 1_000
                  ? `$${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k`
                  : `$${Math.round(value)}`}
              </text>
            </g>
          );
        })}
        <polyline points={inPoints} className="wbr-line is-income" />
        <polyline points={outPoints} className="wbr-line is-expense" />
        {rows.map((row, index) => (
          <g key={row.key}>
            <circle
              cx={x(index)}
              cy={y(row.moneyIn)}
              r="4"
              className="wbr-dot is-income"
            />
            <circle
              cx={x(index)}
              cy={y(row.moneyOut)}
              r="4"
              className="wbr-dot is-expense"
            />
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
        <span>
          <i className="is-income" />
          Money in
        </span>
        <span>
          <i className="is-expense" />
          Money out
        </span>
        <em>* QTD</em>
      </div>
    </div>
  );
}

function Mix({
  rows,
  total,
  centerLabel,
  kind,
  onSelect,
}: {
  rows: BreakdownRow[];
  total: number;
  centerLabel: string;
  kind: "income" | "expense";
  onSelect: (row: BreakdownRow) => void;
}) {
  let cursor = 0;
  const segments = rows.map((row) => {
    const start = cursor;
    cursor += row.percent;
    return `${row.color} ${start}% ${cursor}%`;
  });
  const style = {
    background: rows.length
      ? `conic-gradient(${segments.join(",")})`
      : "conic-gradient(var(--wbr-empty-ring) 0 100%)",
  };

  return (
    <div className="wbr-mix">
      <div
        className="wbr-donut"
        style={style}
        role="img"
        aria-label={
          rows.length
            ? rows
                .map((row) => `${row.label} ${row.percent.toFixed(0)} percent`)
                .join(", ")
            : `No ${centerLabel.toLowerCase()} recorded`
        }
      >
        <div>
          <strong>{compactDollars(total)}</strong>
          <span>{centerLabel}</span>
        </div>
      </div>
      <ul>
        {rows.length ? (
          rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => onSelect(row)}
                aria-label={`Open ${row.label} ${kind} transactions`}
              >
                <i style={{ background: row.color }} />
                <span title={row.label}>{row.label}</span>
                <strong>{row.percent.toFixed(0)}%</strong>
                <em>
                  {compactDollars(row.amount)} <span aria-hidden>→</span>
                </em>
              </button>
            </li>
          ))
        ) : (
          <li className="is-empty">Nothing recorded in this lane.</li>
        )}
      </ul>
    </div>
  );
}

function Movement({
  movement,
}: {
  movement: BusinessQuarterReport["personal"]["movement"];
}) {
  const rows = [
    { label: "Income & support", value: movement.income },
    { label: "Cash spending", value: movement.spending },
    { label: "Investing", value: movement.investing },
    { label: "Borrowing / principal", value: movement.financing },
    { label: "Card settlements", value: movement.cardSettlements },
    { label: "Transfers between accounts", value: movement.transfers },
  ];
  const max = Math.max(1, ...rows.map((row) => Math.abs(row.value)));

  return (
    <div className="wbr-movement">
      {rows.map((row) => {
        const width = Math.max(1.5, (Math.abs(row.value) / max) * 48);
        const style = { "--wbr-bar-size": `${width}%` } as CSSProperties;
        return (
          <div className="wbr-movement-row" key={row.label}>
            <span>{row.label}</span>
            <div className="wbr-movement-track">
              <i className="wbr-movement-axis" />
              <i
                className={`wbr-movement-bar ${
                  row.value >= 0 ? "is-positive" : "is-negative"
                }`}
                style={style}
              />
            </div>
            <strong className={row.value >= 0 ? "is-positive" : "is-negative"}>
              {signedDollars(row.value)}
            </strong>
          </div>
        );
      })}
      <p>
        Net change across cash, checking, and savings
        <strong
          className={
            movement.netCashChange >= 0 ? "is-positive" : "is-negative"
          }
        >
          {signedDollars(movement.netCashChange)}
        </strong>
      </p>
    </div>
  );
}

function MonthlyBook({
  rows,
}: {
  rows: BusinessQuarterReport["personal"]["months"];
}) {
  return (
    <div className="wbr-month-book">
      <div className="wbr-month-row is-head" aria-hidden="true">
        <span>Month</span>
        <span>In</span>
        <span>Out</span>
        <span>Kept</span>
        <span>Rows</span>
      </div>
      {rows.map((row) => (
        <div className="wbr-month-row" key={row.key}>
          <strong>{row.label}</strong>
          <span className="is-positive">{compactDollars(row.moneyIn)}</span>
          <span className="is-negative">{compactDollars(row.moneyOut)}</span>
          <span className={row.net >= 0 ? "is-positive" : "is-negative"}>
            {signedDollars(row.net)}
          </span>
          <span>{row.transactionCount}</span>
        </div>
      ))}
    </div>
  );
}

function Section({
  title,
  detail,
  children,
  className = "",
}: {
  title: string;
  detail?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`wbr-section ${className}`.trim()}>
      <header>
        <h2>{title}</h2>
        {detail ? <p>{detail}</p> : null}
      </header>
      {children}
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
  onReviewSlice,
}: BusinessReportProps) {
  const integrityTone =
    report.integrity.status === "ready"
      ? "is-ready"
      : report.integrity.status === "blocked"
        ? "is-blocked"
        : "is-review";

  return (
    <section className="wbr" aria-labelledby="wbr-title">
      <header className="wbr-header">
        <div className="wbr-heading">
          <p>Personal cash book · every dollar accounted for</p>
          <h1 id="wbr-title">Quarterly money review</h1>
          <span>
            {report.quarter.label} · through {report.quarter.asOfDate} ·{" "}
            {report.quarter.comparisonLabel}
          </span>
        </div>
        <div className="wbr-controls">
          <label>
            <span>Quarter</span>
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
            Open ledger
          </button>
          <button type="button" onClick={onExport}>
            Export CSV
          </button>
          <button type="button" onClick={onPrint}>
            Print / PDF
          </button>
        </div>
      </header>

      <div className={`wbr-integrity ${integrityTone}`}>
        <span>{report.integrity.label}</span>
        <strong>Records {report.integrity.score}/100</strong>
      </div>

      <div className="wbr-kpis">
        <Kpi
          label="Money in"
          value={compactDollars(report.personal.moneyIn)}
          tone="good"
          onClick={() =>
            onReviewSlice({
              kind: "income",
              category: null,
              label: "all money in",
              transactionIds: report.personal.moneyInTransactionIds,
            })
          }
        >
          <TrendNote
            value={report.personal.moneyInChangePct}
            comparison={report.quarter.comparisonLabel}
          />
        </Kpi>
        <Kpi
          label="Money out"
          value={compactDollars(report.personal.moneyOut)}
          tone="bad"
          onClick={() =>
            onReviewSlice({
              kind: "expense",
              category: null,
              label: "all money out",
              transactionIds: report.personal.moneyOutTransactionIds,
            })
          }
        >
          <TrendNote
            value={report.personal.moneyOutChangePct}
            comparison={report.quarter.comparisonLabel}
            inverse
          />
        </Kpi>
        <Kpi
          label="Net kept"
          value={signedDollars(report.personal.net)}
          tone={report.personal.net >= 0 ? "good" : "bad"}
        >
          <span className="wbr-kpi-note is-neutral">Money in − money out</span>
        </Kpi>
        <Kpi
          label="Keep rate"
          value={rate(report.personal.keepRatePct)}
          tone={
            report.personal.keepRatePct == null
              ? "neutral"
              : report.personal.keepRatePct >= 0
                ? "good"
                : "bad"
          }
        >
          <span className="wbr-kpi-note is-neutral">Net kept ÷ money in</span>
        </Kpi>
        <Kpi
          label="Needs purpose"
          value={String(report.integrity.openClassificationCount)}
          tone={report.integrity.openClassificationCount ? "bad" : "good"}
        >
          <span className="wbr-kpi-note is-neutral">
            {report.integrity.openClassificationCount
              ? `${compactDollars(report.personal.reviewAmount)} to review`
              : "Every posted row named"}
          </span>
        </Kpi>
      </div>

      <div className="wbr-grid">
        <Section
          title="Money in and out"
          detail="All posted external inflows and purchases; transfers and settlements cannot inflate these lines."
          className="wbr-trend"
        >
          <TrendChart rows={report.personal.trend} />
        </Section>

        <Section title="Where money went" className="wbr-expenses">
          <Mix
            rows={report.personal.expenseBreakdown}
            total={report.personal.moneyOut}
            centerLabel="money out"
            kind="expense"
            onSelect={(row) =>
              onReviewSlice({
                kind: "expense",
                category: row.label === "Other" ? null : row.label,
                label: `${row.label} expenses`,
                transactionIds: row.transactionIds,
              })
            }
          />
        </Section>

        <Section title="Where money came from" className="wbr-income">
          <Mix
            rows={report.personal.incomeBreakdown}
            total={report.personal.moneyIn}
            centerLabel="money in"
            kind="income"
            onSelect={(row) =>
              onReviewSlice({
                kind: "income",
                category: row.label === "Other" ? null : row.label,
                label: `${row.label} income`,
                transactionIds: row.transactionIds,
              })
            }
          />
        </Section>

        <Section
          title="Cash-account movement"
          detail="The bank view: checking, savings, and physical cash only."
          className="wbr-cash"
        >
          <Movement movement={report.personal.movement} />
        </Section>

        <Section
          title="Month book"
          detail="Every complete posted row in the selected quarter."
          className="wbr-months"
        >
          <MonthlyBook rows={report.personal.months} />
        </Section>

        <Section
          title="What requires attention"
          className="wbr-next"
        >
          <ol>
            {report.nextSteps.map((step) => (
              <li key={step.id} className={`is-${step.priority}`}>
                <strong>{step.title}</strong>
                <span>{step.detail}</span>
              </li>
            ))}
          </ol>
        </Section>
      </div>

      <footer className="wbr-footer">
        <div>
          <strong>How this report counts money</strong>
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

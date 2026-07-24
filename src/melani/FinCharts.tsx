/**
 * Labeled finance charts — every chart has a title, x/y axis labels,
 * and per-point hover tooltips (native SVG <title> + highlight dot).
 * Data first, no filler words.
 */
import { useState } from "react";
import type { FinanceTx } from "./financeStore";
import { money, moneyCents } from "./financeStore";

const PALETTE = [
  "#1f6f8b", "#e8743b", "#4b8f6b", "#b5651d", "#7d5ba6",
  "#c94f7c", "#3a7d99", "#d1a13a", "#5c8d5c", "#a0522d",
  "#6b8e9e", "#9e6b8e",
];

/* ────────────────────────── Line / area chart ────────────────────────── */

export type LinePoint = { x: string; y: number; label: string };

export function LabeledLineChart({
  title,
  xLabel,
  yLabel,
  points,
  color = "#1f6f8b",
  height = 220,
}: {
  title: string;
  xLabel: string;
  yLabel: string;
  points: LinePoint[];
  color?: string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = height;
  const PAD_L = 64;
  const PAD_R = 16;
  const PAD_T = 34;
  const PAD_B = 44;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  if (!points.length) return null;

  const ys = points.map((p) => p.y);
  const yMaxRaw = Math.max(...ys, 0);
  const yMinRaw = Math.min(...ys, 0);
  const span = yMaxRaw - yMinRaw || 1;
  const yMax = yMaxRaw + span * 0.08;
  const yMin = yMinRaw - span * 0.08;

  const px = (i: number) =>
    PAD_L + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const py = (v: number) => PAD_T + ((yMax - v) / (yMax - yMin)) * plotH;

  // 4 y-axis ticks
  const ticks = [0, 1, 2, 3].map((i) => yMin + ((yMax - yMin) * i) / 3);

  // x tick indices — first, middle-ish, last (avoid crowding)
  const xTickIdx = Array.from(
    new Set([0, Math.floor(points.length / 2), points.length - 1])
  );

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${py(p.y).toFixed(1)}`)
    .join(" ");
  const area = `${path} L${px(points.length - 1).toFixed(1)},${py(Math.max(yMin, 0)).toFixed(1)} L${px(0).toFixed(1)},${py(Math.max(yMin, 0)).toFixed(1)} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="wd-linechart"
      role="img"
      aria-label={title}
    >
      {/* Title */}
      <text x={W / 2} y={18} textAnchor="middle" className="wd-chart-title">
        {title}
      </text>

      {/* Grid + y ticks */}
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={PAD_L}
            y1={py(t)}
            x2={W - PAD_R}
            y2={py(t)}
            className="wd-chart-grid"
          />
          <text
            x={PAD_L - 8}
            y={py(t) + 4}
            textAnchor="end"
            className="wd-chart-tick"
          >
            {money(t)}
          </text>
        </g>
      ))}

      {/* Zero line if the range crosses zero */}
      {yMin < 0 && yMax > 0 ? (
        <line
          x1={PAD_L}
          y1={py(0)}
          x2={W - PAD_R}
          y2={py(0)}
          className="wd-chart-zero"
        />
      ) : null}

      {/* Axes */}
      <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} className="wd-chart-axis" />
      <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} className="wd-chart-axis" />

      {/* Axis labels */}
      <text
        x={PAD_L + plotW / 2}
        y={H - 8}
        textAnchor="middle"
        className="wd-chart-axis-label"
      >
        {xLabel}
      </text>
      <text
        x={14}
        y={PAD_T + plotH / 2}
        textAnchor="middle"
        transform={`rotate(-90 14 ${PAD_T + plotH / 2})`}
        className="wd-chart-axis-label"
      >
        {yLabel}
      </text>

      {/* x ticks */}
      {xTickIdx.map((i) => (
        <text
          key={i}
          x={px(i)}
          y={H - PAD_B + 16}
          textAnchor="middle"
          className="wd-chart-tick"
        >
          {points[i].x}
        </text>
      ))}

      {/* Area + line */}
      <path d={area} fill={color} opacity={0.12} />
      <path d={path} fill="none" stroke={color} strokeWidth={2} />

      {/* Points with hover labels */}
      {points.map((p, i) => (
        <g key={i}>
          <circle
            cx={px(i)}
            cy={py(p.y)}
            r={hover === i ? 5 : 3}
            fill={color}
            stroke="var(--wd-bg, #101010)"
            strokeWidth={1.5}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <title>{p.label}</title>
          </circle>
          {/* wide invisible hit area so hovering is easy */}
          <rect
            x={px(i) - (plotW / Math.max(points.length - 1, 1)) / 2}
            y={PAD_T}
            width={plotW / Math.max(points.length - 1, 1)}
            height={plotH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <title>{p.label}</title>
          </rect>
        </g>
      ))}

      {/* Hover readout pinned to the top of the plot */}
      {hover != null ? (
        <g>
          <line
            x1={px(hover)}
            y1={PAD_T}
            x2={px(hover)}
            y2={H - PAD_B}
            className="wd-chart-cursor"
          />
          <text
            x={Math.min(Math.max(px(hover), PAD_L + 70), W - PAD_R - 70)}
            y={PAD_T + 14}
            textAnchor="middle"
            className="wd-chart-hover"
          >
            {points[hover].label}
          </text>
        </g>
      ) : null}
    </svg>
  );
}

/* ────────────────────────── Pie chart ────────────────────────── */

export type PieSlice = { name: string; value: number };

export function LabeledPieChart({
  title,
  slices,
  size = 200,
}: {
  title: string;
  slices: PieSlice[];
  size?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (!slices.length || total <= 0) return null;

  const R = size / 2 - 10;
  const CX = size / 2;
  const CY = size / 2 + 14;
  const H = size + 28;

  let angle = -Math.PI / 2;
  const arcs = slices.map((s, i) => {
    const frac = s.value / total;
    const a0 = angle;
    const a1 = angle + frac * 2 * Math.PI;
    angle = a1;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const x0 = CX + R * Math.cos(a0);
    const y0 = CY + R * Math.sin(a0);
    const x1 = CX + R * Math.cos(a1);
    const y1 = CY + R * Math.sin(a1);
    const mid = (a0 + a1) / 2;
    const d =
      frac >= 0.999
        ? // full circle
          `M${CX - R},${CY} a${R},${R} 0 1,0 ${R * 2},0 a${R},${R} 0 1,0 ${-R * 2},0`
        : `M${CX},${CY} L${x0.toFixed(2)},${y0.toFixed(2)} A${R},${R} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)} Z`;
    return { d, mid, frac, slice: s, color: PALETTE[i % PALETTE.length] };
  });

  return (
    <div className="wd-pie-wrap">
      <svg
        viewBox={`0 0 ${size} ${H}`}
        width={size}
        height={H}
        role="img"
        aria-label={title}
      >
        <text x={size / 2} y={16} textAnchor="middle" className="wd-chart-title">
          {title}
        </text>
        {arcs.map((a, i) => (
          <path
            key={a.slice.name}
            d={a.d}
            fill={a.color}
            opacity={hover == null || hover === i ? 1 : 0.35}
            transform={
              hover === i
                ? `translate(${Math.cos(a.mid) * 4},${Math.sin(a.mid) * 4})`
                : undefined
            }
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <title>
              {`${a.slice.name}: ${moneyCents(a.slice.value)} (${(a.frac * 100).toFixed(1)}%)`}
            </title>
          </path>
        ))}
      </svg>
      <ul className="wd-pie-legend">
        {arcs.map((a, i) => (
          <li
            key={a.slice.name}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            className={hover === i ? "is-hot" : undefined}
          >
            <span className="wd-sub-dot" style={{ background: a.color }} />
            <span className="wd-sub-legend-name">{a.slice.name}</span>
            <span className="wd-sub-legend-val">
              {moneyCents(a.slice.value)} · {(a.frac * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─────────────── Month charts under each ledger book ─────────────── */

/** Build day-by-day spend/income and category split for one month. */
export function monthChartData(rows: FinanceTx[], month: string) {
  // month = YYYY-MM
  const [y, m] = month.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  const out = new Array<number>(days).fill(0);
  const inn = new Array<number>(days).fill(0);
  const byCat = new Map<string, number>();

  for (const t of rows) {
    const d = Number(t.date.slice(8, 10));
    if (!d || d > days) continue;
    if (t.kind === "expense") {
      out[d - 1] += t.amount;
      byCat.set(t.category || "Uncategorized", (byCat.get(t.category || "Uncategorized") || 0) + t.amount);
    } else if (t.kind === "income") {
      inn[d - 1] += t.amount;
    }
  }

  let run = 0;
  const netPoints: LinePoint[] = [];
  for (let d = 0; d < days; d++) {
    run += inn[d] - out[d];
    netPoints.push({
      x: String(d + 1),
      y: Math.round(run * 100) / 100,
      label: `Day ${d + 1}: net ${moneyCents(run)} (in ${moneyCents(inn[d])} · out ${moneyCents(out[d])})`,
    });
  }

  const slices: PieSlice[] = Array.from(byCat.entries())
    .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
    .sort((a, b) => b.value - a.value);

  // group tiny slices into Other so the pie stays readable
  const MAX = 9;
  const top = slices.slice(0, MAX);
  const rest = slices.slice(MAX);
  if (rest.length) {
    top.push({
      name: `Other (${rest.length})`,
      value: Math.round(rest.reduce((s, x) => s + x.value, 0) * 100) / 100,
    });
  }

  return { netPoints, slices: top };
}

export function MonthBookCharts({
  rows,
  month,
  monthLabel,
}: {
  rows: FinanceTx[];
  month: string;
  monthLabel: string;
}) {
  const { netPoints, slices } = monthChartData(rows, month);
  if (!rows.length) return null;
  return (
    <div className="wd-month-charts">
      <div className="wd-month-charts-line">
        <LabeledLineChart
          title={`${monthLabel} — running net cash flow`}
          xLabel="Day of month"
          yLabel="Net flow ($)"
          points={netPoints}
        />
      </div>
      <LabeledPieChart title={`${monthLabel} — spend by category`} slices={slices} />
    </div>
  );
}

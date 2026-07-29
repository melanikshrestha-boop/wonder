/**
 * Finance charts — soft Habits fill + real X/Y axes + clear title.
 * Cursor-follow hover (no precise click targets). Fluid width.
 */
import {
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import type { FinanceTx } from "./financeStore";
import { money, moneyCents } from "./financeStore";
import {
  CATEGORY_COLOR_EVENT,
  categoryColor,
  clearCategoryColorOverride,
  defaultCategoryColor,
  getCategoryColorOverride,
  normalizeTransactionCategory,
  setCategoryColorOverride,
  toColorInputValue,
} from "./financeCategorize";
import { isTransferLike } from "./financeTransfers";
import {
  fitChartHoverLabel,
} from "./chartLayout";
import { pieSlicePath } from "./pieGeometry";
import { pushUndo } from "../undoStack";

const PALETTE = [
  "#7c3aed",
  "#0891b2",
  "#f97316",
  "#16a34a",
  "#db2777",
  "#2563eb",
  "#ca8a04",
  "#dc2626",
  "#0d9488",
  "#9333ea",
  "#ea580c",
  "#475569",
];

export type LinePoint = { x: string; y: number; label: string };

/** Compact axis money: $0 · $1k · −$200 */
function axisMoney(n: number): string {
  if (!Number.isFinite(n)) return "";
  if (Math.abs(n) >= 1000) {
    const k = n / 1000;
    const s = k % 1 === 0 ? String(k) : k.toFixed(1);
    return `${n < 0 ? "−" : ""}$${Math.abs(Number(s))}k`;
  }
  return money(n).replace("-", "−");
}

/** Nice upper bound for axes (0, 1, 2, 2.5, 5, 10… scale). */
function niceCeil(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const exp = Math.floor(Math.log10(raw));
  const base = Math.pow(10, exp);
  const err = raw / base;
  if (err <= 1) return base;
  if (err <= 2) return 2 * base;
  if (err <= 2.5) return 2.5 * base;
  if (err <= 5) return 5 * base;
  return 10 * base;
}

/** Drop ticks that would render as the same label (stops stacked “5.2h”). */
function uniqueTicks(values: number[], format: (n: number) => string): number[] {
  const seen = new Set<string>();
  const out: number[] = [];
  for (const v of values) {
    const label = format(v);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push(v);
  }
  return out.length ? out : values.slice(0, 1);
}

/**
 * Catmull-Rom → cubic bezier path. Soft sleep-style curves (not jagged L segments).
 */
function smoothLinePath(
  pts: { x: number; y: number }[],
  tension = 0.18
): string {
  if (!pts.length) return "";
  if (pts.length === 1) return `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  if (pts.length === 2) {
    return `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)} L${pts[1].x.toFixed(1)},${pts[1].y.toFixed(1)}`;
  }
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? 0 : i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + ((p2.x - p0.x) * tension);
    const c1y = p1.y + ((p2.y - p0.y) * tension);
    const c2x = p2.x - ((p3.x - p1.x) * tension);
    const c2y = p2.y - ((p3.y - p1.y) * tension);
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

/**
 * Soft cyan area (Habits) + labeled axes so the graph is readable.
 * Hover follows the cursor across the plot — no thin hit columns.
 */
export function LabeledLineChart({
  title,
  xLabel,
  yLabel,
  points,
  color = "#38bdf8",
  height = 220,
  /** Default formats as money (finance). Pass e.g. (n) => `${n}h` for hours. */
  formatY,
}: {
  title: string;
  xLabel: string;
  yLabel: string;
  points: LinePoint[];
  color?: string;
  height?: number;
  formatY?: (n: number) => string;
}) {
  const tickY = formatY ?? axisMoney;
  const [hover, setHover] = useState<number | null>(null);
  const gradId = useId().replace(/:/g, "");
  const W = 640;
  // Allow compact charts (Focus Mac/Phone) — min was 200 and ate the page
  const H = Math.max(100, height);
  const compact = H < 160;
  // Room for Y ticks left — no space reserved for rotated axis title on compact
  // (rotated "h"/"Hours" was cutting through middle tick labels)
  const showYTitle = Boolean(yLabel?.trim()) && !compact;
  const showXTitle = Boolean(xLabel?.trim()) && !compact;
  const PAD_L = compact ? 40 : showYTitle ? 56 : 48;
  const PAD_R = 12;
  const PAD_T = compact ? 8 : 12;
  const PAD_B = compact ? 18 : showXTitle ? 40 : 28;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  if (!points.length) return null;

  const ys = points.map((p) => p.y);
  const yMaxRaw = Math.max(...ys, 0);
  const yMinRaw = Math.min(...ys, 0);
  // Hours / counts that never go negative: don't invent −1.1h axis padding
  const yMin = yMinRaw >= 0 ? 0 : yMinRaw;
  // Nice ceiling so ticks are 0 / 4 / 8 / 12 not 0 / 3.1 / 6.2 / 9.3
  const yMax = niceCeil(Math.max(yMaxRaw * 1.05, yMin + 1e-6));

  const px = (i: number) =>
    PAD_L + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const py = (v: number) => PAD_T + ((yMax - v) / (yMax - yMin || 1)) * plotH;

  // Compact: 4 ticks; full: 5 — dedupe after format so labels never stack
  const tickCount = compact ? 3 : 4;
  const yTicksRaw = Array.from({ length: tickCount + 1 }, (_, i) =>
    yMin + ((yMax - yMin) * i) / tickCount
  );
  const yTicks = uniqueTicks(yTicksRaw, tickY);
  const xTickIdx = Array.from(
    new Set([
      0,
      Math.floor(points.length / 4),
      Math.floor(points.length / 2),
      Math.floor((points.length * 3) / 4),
      points.length - 1,
    ].filter((i) => i >= 0 && i < points.length))
  );

  // Smooth path (catmull-rom → cubic) — sleep/fitness feel, not jagged polyline
  const pts = points.map((p, i) => ({ x: px(i), y: py(p.y) }));
  const path = smoothLinePath(pts);
  // Area to zero baseline when range crosses 0; else to bottom of plot
  const baseY = yMin < 0 && yMax > 0 ? py(0) : PAD_T + plotH;
  const area = `${path} L${px(points.length - 1).toFixed(1)},${baseY.toFixed(1)} L${px(0).toFixed(1)},${baseY.toFixed(1)} Z`;
  const hoverLabel =
    hover == null ? "" : fitChartHoverLabel(points[hover].label, plotW);

  /** Nearest day under the cursor — move freely, no precise target. */
  function onPlotMove(e: MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * H;
    if (x < PAD_L - 4 || x > W - PAD_R + 4 || y < PAD_T - 4 || y > PAD_T + plotH + 8) {
      setHover(null);
      return;
    }
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < points.length; i++) {
      const d = Math.abs(px(i) - x);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    setHover((prev) => (prev === best ? prev : best));
  }

  return (
    <div className="wd-hab-chart-wrap">
      {title ? (
        <header className="wd-hab-chart-head">
          <h3 className="wd-hab-chart-title">{title}</h3>
        </header>
      ) : null}
      <div className="wd-hab-hover-lane" aria-live="polite">
        {hoverLabel ? (
          <span>{hoverLabel}</span>
        ) : (
          <span className="is-empty" aria-hidden="true">
            Hover for details
          </span>
        )}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="wd-hab-chart"
        role="img"
        aria-label={title}
        onMouseMove={onPlotMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.42" />
            <stop offset="55%" stopColor={color} stopOpacity="0.12" />
            <stop offset="100%" stopColor={color} stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Soft horizontal grid + Y axis labels */}
        {yTicks.map((t) => (
          <g key={`y-${t}`}>
            <line
              x1={PAD_L}
              y1={py(t)}
              x2={W - PAD_R}
              y2={py(t)}
              className="wd-hab-grid"
            />
            <text
              x={PAD_L - 6}
              y={py(t) + 3.5}
              textAnchor="end"
              className={`wd-hab-chart-tick${compact ? " is-compact" : ""}`}
            >
              {tickY(t)}
            </text>
          </g>
        ))}

        {/* Zero emphasis when range crosses 0 */}
        {yMin < 0 && yMax > 0 ? (
          <line
            x1={PAD_L}
            y1={py(0)}
            x2={W - PAD_R}
            y2={py(0)}
            className="wd-hab-zero"
          />
        ) : null}

        {/* X + Y axes */}
        <line
          x1={PAD_L}
          y1={PAD_T}
          x2={PAD_L}
          y2={PAD_T + plotH}
          className="wd-hab-axis"
        />
        <line
          x1={PAD_L}
          y1={PAD_T + plotH}
          x2={W - PAD_R}
          y2={PAD_T + plotH}
          className="wd-hab-axis"
        />

        {/* Soft area + smooth line (sleep / Focus language) */}
        <path d={area} fill={`url(#${gradId})`} style={{ pointerEvents: "none" }} />
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth="2.75"
          strokeLinejoin="round"
          strokeLinecap="round"
          style={{ pointerEvents: "none" }}
        />

        {/* X ticks */}
        {xTickIdx.map((i) => (
          <text
            key={`x-${i}`}
            x={px(i)}
            y={PAD_T + plotH + 16}
            textAnchor="middle"
            className="wd-hab-chart-tick"
          >
            {points[i].x}
          </text>
        ))}

        {/* Axis titles — skip on compact (was colliding with tick labels) */}
        {showXTitle ? (
          <text
            x={PAD_L + plotW / 2}
            y={H - 4}
            textAnchor="middle"
            className="wd-hab-axis-label"
          >
            {xLabel}
          </text>
        ) : null}
        {showYTitle ? (
          <text
            x={14}
            y={PAD_T + plotH / 2}
            textAnchor="middle"
            transform={`rotate(-90 14 ${PAD_T + plotH / 2})`}
            className="wd-hab-axis-label"
          >
            {yLabel}
          </text>
        ) : null}

        {/* Full-plot hit slab so mousemove always fires over empty areas */}
        <rect
          x={PAD_L}
          y={PAD_T}
          width={plotW}
          height={plotH}
          fill="rgba(0,0,0,0.001)"
          style={{ cursor: "crosshair" }}
        />

        {hover != null ? (
          <g style={{ pointerEvents: "none" }}>
            <line
              x1={px(hover)}
              y1={PAD_T}
              x2={px(hover)}
              y2={PAD_T + plotH}
              className="wd-hab-cursor"
            />
            <circle
              cx={px(hover)}
              cy={py(points[hover].y)}
              r={5.5}
              fill={color}
              stroke="#f7f7fa"
              strokeWidth={2.2}
              className="wd-hab-hover-dot"
            />
          </g>
        ) : null}
      </svg>
    </div>
  );
}

export type PieSlice = {
  name: string;
  value: number;
  /** Optional fixed color; otherwise category palette */
  color?: string;
};

type CategoryDrilldown = (
  kind: "income" | "expense",
  category: string,
  scope?: { month?: string }
) => void;

/**
 * Interactive pie / donut — every chart should use this.
 * Cursor on the disk: black border + pop + dim others + name/value.
 */
export function InteractivePieChart({
  title,
  slices,
  size = 220,
  /** 0 = full pie; ~0.55 = donut hole */
  holeRatio = 0,
  centerPrimary,
  centerSecondary,
  showLegend = true,
  formatValue,
  className = "",
  onSliceDoubleClick,
}: {
  title?: string;
  slices: PieSlice[];
  size?: number;
  holeRatio?: number;
  centerPrimary?: string;
  centerSecondary?: string;
  showLegend?: boolean;
  formatValue?: (value: number, frac: number) => string;
  className?: string;
  onSliceDoubleClick?: (slice: PieSlice) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  // Bumps when user saves a category color so slice + legend re-read categoryColor()
  const [colorRev, setColorRev] = useState(0);
  const [colorPick, setColorPick] = useState<{
    name: string;
    color: string;
  } | null>(null);
  const colorInputRef = useRef<HTMLInputElement | null>(null);
  const blockRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onColor = () => setColorRev((n) => n + 1);
    window.addEventListener(CATEGORY_COLOR_EVENT, onColor);
    return () => window.removeEventListener(CATEGORY_COLOR_EVENT, onColor);
  }, []);

  // Open system color UI as soon as the popover mounts
  useEffect(() => {
    if (!colorPick) return;
    const t = window.setTimeout(() => {
      try {
        colorInputRef.current?.focus();
        colorInputRef.current?.click();
      } catch {
        /* some browsers block programmatic open after double-click — panel still works */
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, [colorPick?.name]);

  useEffect(() => {
    if (!colorPick) return;
    const onDoc = (event: Event) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (blockRef.current?.contains(target)) return;
      setColorPick(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setColorPick(null);
    };
    document.addEventListener("pointerdown", onDoc, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [colorPick]);

  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0);
  if (!slices.length || total <= 0) return null;

  const pad = 14;
  const R = size / 2 - pad;
  const rInner = Math.max(0, R * Math.min(0.85, Math.max(0, holeRatio)));
  const CX = size / 2;
  const CY = size / 2;
  const H = size;
  const HIT_R = R + 10;
  const popDist = holeRatio > 0 ? 6 : 9;

  let angle = -Math.PI / 2;
  // colorRev forces recompute after localStorage color change
  void colorRev;
  const arcs = slices.map((s, i) => {
    const frac = Math.max(0, s.value) / total;
    const a0 = angle;
    const a1 = angle + frac * 2 * Math.PI;
    angle = a1;
    const mid = (a0 + a1) / 2;
    const full = frac >= 0.999;
    const d = pieSlicePath(CX, CY, R, rInner, a0, a1, full);
    const live =
      colorPick && colorPick.name === s.name
        ? colorPick.color
        : s.color || categoryColor(s.name) || PALETTE[i % PALETTE.length];
    return {
      d,
      a0,
      a1,
      mid,
      frac,
      slice: s,
      color: live,
    };
  });

  function sliceAtPointer(
    clientX: number,
    clientY: number,
    svg: SVGSVGElement
  ): number | null {
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const x = ((clientX - rect.left) / rect.width) * size;
    const y = ((clientY - rect.top) / rect.height) * H;
    const dx = x - CX;
    const dy = y - CY;
    const dist = Math.hypot(dx, dy);
    // Outside ring or in donut hole → no hit
    if (dist > HIT_R) return null;
    if (rInner > 2 && dist < rInner - 2) return null;

    let ang = Math.atan2(dy, dx);
    if (ang < -Math.PI / 2) ang += 2 * Math.PI;

    for (let i = 0; i < arcs.length; i++) {
      const a = arcs[i];
      if (ang >= a.a0 && (ang < a.a1 || i === arcs.length - 1)) return i;
    }
    return null;
  }

  function onPieMove(e: MouseEvent<SVGSVGElement>) {
    const next = sliceAtPointer(e.clientX, e.clientY, e.currentTarget);
    setHover((prev) => (prev === next ? prev : next));
  }

  const selectedIndex = selectedName
    ? arcs.findIndex((arc) => arc.slice.name === selectedName)
    : -1;
  const activeIndex =
    hover != null ? hover : selectedIndex >= 0 ? selectedIndex : null;
  const hot = activeIndex != null ? arcs[activeIndex] : null;
  const toggleSelected = (index: number) => {
    const name = arcs[index]?.slice.name;
    if (!name) return;
    setSelectedName((previous) => (previous === name ? null : name));
  };
  /** Old double-click job — still available via Shift+double-click */
  const filterToSlice = (index: number) => {
    const slice = arcs[index]?.slice;
    if (!slice) return;
    setSelectedName(null);
    onSliceDoubleClick?.(slice);
  };
  const openColorPick = (index: number) => {
    const arc = arcs[index];
    if (!arc) return;
    const name = arc.slice.name;
    setColorPick({
      name,
      color: toColorInputValue(arc.color || categoryColor(name)),
    });
  };
  const applyColor = (name: string, next: string, commit: boolean) => {
    const hex = toColorInputValue(next);
    setColorPick((prev) =>
      prev && prev.name === name ? { ...prev, color: hex } : prev
    );
    if (!commit) return;
    const previous = getCategoryColorOverride(name);
    const hadOverride = Boolean(previous);
    pushUndo(`Color · ${name}`, () => {
      if (hadOverride && previous) setCategoryColorOverride(name, previous);
      else clearCategoryColorOverride(name);
    });
    setCategoryColorOverride(name, hex);
    setColorRev((n) => n + 1);
  };
  const resetColor = (name: string) => {
    const previous = getCategoryColorOverride(name);
    if (!previous) {
      setColorPick({
        name,
        color: toColorInputValue(defaultCategoryColor(name)),
      });
      return;
    }
    pushUndo(`Reset color · ${name}`, () => {
      setCategoryColorOverride(name, previous);
    });
    clearCategoryColorOverride(name);
    setColorPick({
      name,
      color: toColorInputValue(defaultCategoryColor(name)),
    });
    setColorRev((n) => n + 1);
  };
  const valueLine = (v: number, frac: number) =>
    formatValue
      ? formatValue(v, frac)
      : `${moneyCents(v)} · ${(frac * 100).toFixed(0)}%`;

  // Donut / static center: labels live in the SVG hole.
  // Full pie (no hole, no static center): labels live only in the HTML chip.
  // Never both — that stacked "Credit card paym…" + full name on the pie.
  const useSvgCenter = Boolean(
    centerPrimary || centerSecondary || holeRatio > 0
  );
  const centerMain = useSvgCenter
    ? hot
      ? hot.slice.name
      : centerPrimary ?? null
    : null;
  const centerSub = useSvgCenter
    ? hot
      ? valueLine(hot.slice.value, hot.frac)
      : centerSecondary ?? null
    : null;

  return (
    <div className={`wd-pie-block ${className}`.trim()} ref={blockRef}>
      {title ? (
        <div className="wd-hab-chart-title" title={title}>
          {title}
        </div>
      ) : null}
      <div className="wd-pie-wrap">
        {/* SVG + optional HTML chip share one box so the chip centers on the pie, not the legend */}
        <div className="wd-pie-disk">
          <svg
            viewBox={`0 0 ${size} ${H}`}
            role="img"
            aria-label={title || "Pie chart"}
            className="wd-pie-svg"
            onMouseMove={onPieMove}
            onMouseLeave={() => setHover(null)}
            onClick={(event) => {
              const index = sliceAtPointer(
                event.clientX,
                event.clientY,
                event.currentTarget
              );
              if (index != null) toggleSelected(index);
            }}
            onDoubleClick={(event) => {
              event.preventDefault();
              const index = sliceAtPointer(
                event.clientX,
                event.clientY,
                event.currentTarget
              );
              if (index == null) return;
              // Shift+double-click keeps ledger filter for power users
              if (event.shiftKey && onSliceDoubleClick) {
                filterToSlice(index);
                return;
              }
              openColorPick(index);
            }}
          >
            {arcs.map((a, i) => {
              const isHot = activeIndex === i;
              const dim = activeIndex != null && !isHot;
              const tx = isHot ? Math.cos(a.mid) * popDist : 0;
              const ty = isHot ? Math.sin(a.mid) * popDist : 0;
              return (
                <path
                  key={`${a.slice.name}-${i}`}
                  d={a.d}
                  fill={a.color}
                  fillRule="evenodd"
                  clipRule="evenodd"
                  className={
                    isHot
                      ? "wd-pie-slice is-hot"
                      : dim
                        ? "wd-pie-slice is-dim"
                        : "wd-pie-slice"
                  }
                  transform={
                    isHot
                      ? `translate(${tx.toFixed(2)},${ty.toFixed(2)})`
                      : undefined
                  }
                  style={{
                    pointerEvents: "none",
                    opacity: dim ? 0.28 : 1,
                    paintOrder: "stroke fill",
                    transition:
                      "opacity 0.15s ease, transform 0.15s ease, stroke-width 0.12s ease",
                  }}
                  stroke={isHot ? "#0a0a0a" : "rgba(0,0,0,0.14)"}
                  strokeWidth={isHot ? 2.75 : 0.65}
                  strokeLinejoin="round"
                />
              );
            })}
            {/* Hit layer */}
            <circle
              cx={CX}
              cy={CY}
              r={HIT_R}
              fill="rgba(0,0,0,0.001)"
              style={{ cursor: "pointer" }}
            />
            {/* Center labels — donut / static center only (never stacked with HTML chip) */}
            {centerMain || centerSub ? (
              <g className="wd-pie-center" style={{ pointerEvents: "none" }}>
                {centerMain ? (
                  <text
                    x={CX}
                    y={centerSub ? CY - 4 : CY + 5}
                    textAnchor="middle"
                    className={
                      hot ? "wd-pie-center-hot" : "wd-pie-center-main"
                    }
                  >
                    {centerMain.length > 18
                      ? `${centerMain.slice(0, 16)}…`
                      : centerMain}
                  </text>
                ) : null}
                {centerSub ? (
                  <text
                    x={CX}
                    y={centerMain ? CY + 14 : CY + 5}
                    textAnchor="middle"
                    className="wd-pie-center-sub"
                  >
                    {centerSub}
                  </text>
                ) : null}
              </g>
            ) : null}
          </svg>
          {/* Full-pie hover: one clean label over the disk (not the legend) */}
          {hot && !useSvgCenter ? (
            <div className="wd-pie-hover" aria-live="polite">
              <p className="wd-pie-hover-name">{hot.slice.name}</p>
              <p className="wd-pie-hover-val">
                {valueLine(hot.slice.value, hot.frac)}
              </p>
            </div>
          ) : null}
        </div>
        {showLegend ? (
          <ul className="wd-pie-legend">
            {arcs.map((a, i) => (
              <li
                key={`${a.slice.name}-${i}`}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onClick={() => toggleSelected(i)}
                onDoubleClick={(event) => {
                  event.preventDefault();
                  if (event.shiftKey && onSliceDoubleClick) {
                    filterToSlice(i);
                    return;
                  }
                  openColorPick(i);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleSelected(i);
                  }
                }}
                className={activeIndex === i ? "is-hot" : undefined}
                role="button"
                tabIndex={0}
                aria-pressed={selectedIndex === i}
                title="Click to highlight · double-click to recolor · Shift+double-click to filter ledger"
              >
                <span
                  className="wd-sub-dot"
                  style={{ background: a.color }}
                />
                <span className="wd-sub-legend-name">{a.slice.name}</span>
                <span className="wd-sub-legend-val">
                  {valueLine(a.slice.value, a.frac)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {colorPick ? (
        <div
          className="wd-pie-color-pop"
          role="dialog"
          aria-label={`Color for ${colorPick.name}`}
        >
          <div className="wd-pie-color-pop-head">
            <strong className="wd-pie-color-pop-name">{colorPick.name}</strong>
            <button
              type="button"
              className="wd-pie-color-pop-close"
              onClick={() => setColorPick(null)}
              aria-label="Close color picker"
            >
              ×
            </button>
          </div>
          <p className="wd-pie-color-pop-hint">
            Drag around the color field — no codes to remember. Legend updates
            with the slice.
          </p>
          <label className="wd-pie-color-pop-field">
            <span className="wd-pie-color-pop-swatch" style={{ background: colorPick.color }} />
            <input
              ref={colorInputRef}
              type="color"
              value={colorPick.color}
              /* Live preview only — commit when the OS picker closes (change) or Done */
              onInput={(event) =>
                applyColor(
                  colorPick.name,
                  (event.target as HTMLInputElement).value,
                  false
                )
              }
              onChange={(event) =>
                applyColor(colorPick.name, event.target.value, true)
              }
              aria-label={`Pick color for ${colorPick.name}`}
            />
          </label>
          <div className="wd-pie-color-pop-actions">
            <button
              type="button"
              className="wd-pie-color-pop-btn"
              onClick={() => {
                applyColor(colorPick.name, colorPick.color, true);
                setColorPick(null);
              }}
            >
              Done
            </button>
            <button
              type="button"
              className="wd-pie-color-pop-btn is-quiet"
              onClick={() => resetColor(colorPick.name)}
            >
              Use default
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Spend-by-category pie (month books, copilot) */
export function LabeledPieChart({
  title,
  slices,
  size = 220,
}: {
  title: string;
  slices: PieSlice[];
  size?: number;
}) {
  return (
    <InteractivePieChart
      title={title}
      slices={slices}
      size={size}
      holeRatio={0}
      showLegend
    />
  );
}

export function monthChartData(rows: FinanceTx[], month: string) {
  const [y, m] = month.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  const out = new Array<number>(days).fill(0);
  const inn = new Array<number>(days).fill(0);
  const expenseByCat = new Map<string, number>();
  const incomeByCat = new Map<string, number>();
  let movementIn = 0;
  let movementOut = 0;

  for (const t of rows) {
    if (t.pending) continue;
    const d = Number(t.date.slice(8, 10));
    if (!d || d > days) continue;
    const cat = normalizeTransactionCategory(
      t.category,
      `${t.merchant || ""} ${t.note || ""}`,
      t.kind
    );
    const movement = isTransferLike({ ...t, category: cat });
    if (t.kind === "expense") {
      if (movement) {
        movementOut += t.amount;
        continue;
      }
      out[d - 1] += t.amount;
      if (!cat || cat === "Income") continue;
      expenseByCat.set(cat, (expenseByCat.get(cat) || 0) + t.amount);
    } else if (t.kind === "income") {
      if (movement) {
        movementIn += t.amount;
        continue;
      }
      inn[d - 1] += t.amount;
      if (cat) incomeByCat.set(cat, (incomeByCat.get(cat) || 0) + t.amount);
    }
  }

  // Cumulative spend (always has shape) — primary sleep-style series
  let runSpend = 0;
  let runNet = 0;
  let totalIn = 0;
  let totalOut = 0;
  const spendPoints: LinePoint[] = [];
  const netPoints: LinePoint[] = [];
  for (let d = 0; d < days; d++) {
    runSpend += out[d];
    runNet += inn[d] - out[d];
    totalIn += inn[d];
    totalOut += out[d];
    const spend = Math.round(runSpend * 100) / 100;
    const net = Math.round(runNet * 100) / 100;
    spendPoints.push({
      x: String(d + 1),
      y: spend,
      label: `Day ${d + 1}: spent ${moneyCents(spend)} · that day ${moneyCents(out[d])}`,
    });
    netPoints.push({
      x: String(d + 1),
      y: net,
      label: `Day ${d + 1}: net ${moneyCents(net)} (in ${moneyCents(inn[d])} · out ${moneyCents(out[d])})`,
    });
  }

  function topSlices(source: Map<string, number>): PieSlice[] {
    return Array.from(source.entries())
      .filter(([name, value]) => Boolean(name) && value > 0)
      .map(([name, value]) => ({
        name,
        value: Math.round(value * 100) / 100,
      }))
      .sort((a, b) => b.value - a.value);
  }

  const expenseSlices = topSlices(expenseByCat);
  const incomeSlices = topSlices(incomeByCat);
  return {
    spendPoints,
    netPoints,
    /** Legacy alias retained for any existing callers. */
    slices: expenseSlices,
    expenseSlices,
    incomeSlices,
    movementIn: Math.round(movementIn * 100) / 100,
    movementOut: Math.round(movementOut * 100) / 100,
    totalIn: Math.round(totalIn * 100) / 100,
    totalOut: Math.round(totalOut * 100) / 100,
    net: Math.round((totalIn - totalOut) * 100) / 100,
  };
}

export function MonthBookCharts({
  rows,
  month,
  monthLabel,
  onCategoryDoubleClick,
}: {
  rows: FinanceTx[];
  month: string;
  monthLabel: string;
  onCategoryDoubleClick?: CategoryDrilldown;
}) {
  const {
    spendPoints,
    expenseSlices,
    incomeSlices,
    movementIn,
    movementOut,
    totalIn,
    totalOut,
    net,
  } = monthChartData(
    rows,
    month
  );
  if (!rows.length) return null;

  // Whoop Recovery format: TITLE · big avg · latest / Δ / range · soft graph
  const vals = spendPoints.map((p) => p.y);
  const n = vals.length;
  // Average daily spend on days that actually moved
  const daysWithSpend = spendPoints.filter((p, i) => {
    const prev = i === 0 ? 0 : spendPoints[i - 1].y;
    return p.y > prev;
  }).length;
  const avgDaily =
    daysWithSpend > 0
      ? Math.round((totalOut / daysWithSpend) * 100) / 100
      : totalOut;
  const latest = vals[vals.length - 1] ?? 0;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const delta = latest - avgDaily;

  return (
    <div className="wd-month-charts">
      <div className="wd-month-charts-line wx">
        <article className="wx-panel wd-fin-metric">
          <header className="wx-panel-head">
            <div className="wx-panel-title-row">
              <h3 className="wx-panel-title">SPEND · {monthLabel.toUpperCase()}</h3>
            </div>
            <div className="wx-panel-nums">
              <span className="wx-panel-v">
                {moneyCents(avgDaily).replace(/\.00$/, "")}
                <small>avg / active day</small>
              </span>
              <span className="wx-panel-meta">
                <span className="wx-panel-latest">
                  latest: {moneyCents(latest)}
                </span>
                {Math.abs(delta) >= 0.5 ? (
                  <span
                    className={`wx-metric-delta ${
                      delta > 0 ? "is-down" : "is-up"
                    }`}
                  >
                    {delta > 0 ? "+" : ""}
                    {moneyCents(delta)} vs avg
                  </span>
                ) : null}
                <span className="wx-panel-range">
                  {moneyCents(min)}–{moneyCents(max)}
                </span>
              </span>
            </div>
          </header>
          <LabeledLineChart
            title=""
            xLabel=""
            yLabel=""
            points={spendPoints}
            color="#0284c7"
            height={180}
          />
          <footer className="wx-panel-foot">
            <span>
              n = {n || spendPoints.length}
              {" · out "}
              {moneyCents(totalOut)}
              {" · in "}
              {moneyCents(totalIn)}
              {" · net "}
              {moneyCents(net)}
              {movementIn + movementOut > 0
                ? ` · money movement ${moneyCents(movementIn + movementOut)}`
                : ""}
            </span>
          </footer>
        </article>
      </div>
      <div className="wd-month-charts-pies">
        {expenseSlices.length ? (
          <InteractivePieChart
            title="Expenses by category"
            slices={expenseSlices}
            size={220}
            holeRatio={0.58}
            centerPrimary={moneyCents(totalOut)}
            centerSecondary="total expenses"
            showLegend
            onSliceDoubleClick={(slice) =>
              onCategoryDoubleClick?.("expense", slice.name, { month })
            }
          />
        ) : null}
        {incomeSlices.length ? (
          <InteractivePieChart
            title="Income by category"
            slices={incomeSlices}
            size={220}
            holeRatio={0.58}
            centerPrimary={moneyCents(totalIn)}
            centerSecondary="total income"
            showLegend
            onSliceDoubleClick={(slice) =>
              onCategoryDoubleClick?.("income", slice.name, { month })
            }
          />
        ) : null}
      </div>
    </div>
  );
}

export function AllLedgerCharts({
  rows,
  scopeLabel,
  onCategoryDoubleClick,
}: {
  rows: FinanceTx[];
  scopeLabel?: string;
  onCategoryDoubleClick?: (
    kind: "income" | "expense",
    category: string,
    scope?: { month?: string }
  ) => void;
}) {
  if (!rows.length) return null;

  const monthKeys = Array.from(
    new Set(
      rows
        .map((row) => row.date.slice(0, 7))
        .filter((month) => /^\d{4}-\d{2}$/.test(month))
    )
  ).sort();
  const months = monthKeys.map((month) => {
    const data = monthChartData(
      rows.filter((row) => row.date.startsWith(month)),
      month
    );
    return { month, data };
  });
  const totalIncome = months.reduce((sum, item) => sum + item.data.totalIn, 0);
  const totalExpenses = months.reduce((sum, item) => sum + item.data.totalOut, 0);
  const totalMovementIn = months.reduce(
    (sum, item) => sum + item.data.movementIn,
    0,
  );
  const totalMovementOut = months.reduce(
    (sum, item) => sum + item.data.movementOut,
    0,
  );
  const expenseMap = new Map<string, number>();
  const incomeMap = new Map<string, number>();
  const movementOutMap = new Map<string, number>();
  for (const row of rows) {
    if (row.pending) continue;
    const name = normalizeTransactionCategory(
      row.category,
      `${row.merchant || ""} ${row.note || ""}`,
      row.kind
    );
    const map = row.kind === "income" ? incomeMap : expenseMap;
    if (!name) continue;
    if (isTransferLike({ ...row, category: name })) {
      if (row.kind === "expense") {
        movementOutMap.set(name, (movementOutMap.get(name) || 0) + row.amount);
      }
      continue;
    }
    map.set(name, (map.get(name) || 0) + row.amount);
  }
  const toSlices = (map: Map<string, number>) =>
    Array.from(map.entries())
      .filter(([name, value]) => Boolean(name) && value > 0)
      .map(([name, value]) => ({
        name,
        value: Math.round(value * 100) / 100,
      }))
      .sort((left, right) => right.value - left.value);
  const earnedNames = new Set([
    "Online income",
    "Technology income",
    "Photography",
    "Reselling",
  ]);
  const earnedIncome = Array.from(incomeMap.entries()).reduce(
    (sum, [name, value]) => sum + (earnedNames.has(name) ? value : 0),
    0,
  );
  const familySupport = incomeMap.get("Family") || 0;
  const paybacks = Math.max(0, totalIncome - earnedIncome - familySupport);
  const cashChange =
    totalIncome + totalMovementIn - totalExpenses - totalMovementOut;
  const breakdown = (entries: [string, number][]) =>
    entries
      .filter(([, value]) => value > 0)
      .sort((left, right) => right[1] - left[1])
      .map(([name, value]) => `${name} ${moneyCents(value)}`)
      .join(" + ") || "$0.00";
  const earnedBreakdown = breakdown(
    Array.from(incomeMap.entries()).filter(([name]) => earnedNames.has(name)),
  );
  const familyBreakdown = breakdown(
    Array.from(incomeMap.entries()).filter(([name]) => name === "Family"),
  );
  const paybackBreakdown = breakdown(
    Array.from(incomeMap.entries()).filter(
      ([name]) => !earnedNames.has(name) && name !== "Family",
    ),
  );
  const spendingBreakdown = breakdown(Array.from(expenseMap.entries()));
  const movedOutBreakdown = breakdown(Array.from(movementOutMap.entries()));
  const latestBalanceRow =
    [...rows]
      .filter(
        (row) =>
          !row.pending &&
          row.statementBalance != null &&
          Number.isFinite(row.statementBalance),
      )
      .sort((left, right) => {
        const dateCmp = right.date.localeCompare(left.date);
        if (dateCmp) return dateCmp;
        return (right.statementOrder ?? -1) - (left.statementOrder ?? -1);
      })[0] || null;
  const monthlyNet: LinePoint[] = months.map(({ month, data }) => ({
    x: new Date(`${month}-01T12:00:00`).toLocaleString("en-US", {
      month: "short",
    }),
    y: data.net,
    label: `${month}: income ${moneyCents(data.totalIn)} · expenses ${moneyCents(data.totalOut)} · net ${moneyCents(data.net)}`,
  }));

  return (
    <section className="wd-panel wd-all-ledger-charts" aria-label="All ledger data">
      <header className="wd-all-ledger-head">
        <p className="wd-ledger-scope">{scopeLabel || "Selected period"}</p>
        <dl>
          <div className="wd-math-metric" tabIndex={0}>
            <dt>Earned</dt>
            <dd className="is-pos">{moneyCents(earnedIncome)}</dd>
            <span className="wd-math-popover">
              <strong>Earned income</strong>
              {earnedBreakdown}
            </span>
          </div>
          <div className="wd-math-metric" tabIndex={0}>
            <dt>Family</dt>
            <dd>{moneyCents(familySupport)}</dd>
            <span className="wd-math-popover">
              <strong>Family support</strong>
              {familyBreakdown}
            </span>
          </div>
          <div className="wd-math-metric" tabIndex={0}>
            <dt>Paybacks</dt>
            <dd>{moneyCents(paybacks)}</dd>
            <span className="wd-math-popover">
              <strong>Reimbursements, gifts, rewards</strong>
              {paybackBreakdown}
            </span>
          </div>
          <div className="wd-math-metric" tabIndex={0}>
            <dt>Spent</dt>
            <dd className="is-neg">{moneyCents(totalExpenses)}</dd>
            <span className="wd-math-popover">
              <strong>Posted expenses</strong>
              {spendingBreakdown}
            </span>
          </div>
          <div className="wd-math-metric" tabIndex={0}>
            <dt>Moved in</dt>
            <dd>{moneyCents(totalMovementIn)}</dd>
            <span className="wd-math-popover">
              <strong>Not income: money pulled from elsewhere</strong>
              Transfers into this ledger total {moneyCents(totalMovementIn)}.
            </span>
          </div>
          <div className="wd-math-metric" tabIndex={0}>
            <dt>Moved out</dt>
            <dd className="is-neg">{moneyCents(totalMovementOut)}</dd>
            <span className="wd-math-popover">
              <strong>Not spending: money sent elsewhere</strong>
              {movedOutBreakdown}
            </span>
          </div>
          <div className="wd-math-metric" tabIndex={0}>
            <dt>Cash change</dt>
            <dd className={cashChange >= 0 ? "is-pos" : "is-neg"}>
              {moneyCents(cashChange)}
            </dd>
            <span className="wd-math-popover">
              <strong>Received + moved in - spent - moved out</strong>
              {moneyCents(totalIncome)} + {moneyCents(totalMovementIn)} -{" "}
              {moneyCents(totalExpenses)} - {moneyCents(totalMovementOut)} ={" "}
              {moneyCents(cashChange)}
            </span>
          </div>
          <div className="wd-math-metric" tabIndex={0}>
            <dt>Checking</dt>
            <dd
              className={
                latestBalanceRow == null
                  ? "is-unavailable"
                  : latestBalanceRow.statementBalance! >= 0
                  ? "is-pos"
                  : "is-neg"
              }
            >
              {latestBalanceRow == null
                ? "—"
                : moneyCents(latestBalanceRow.statementBalance!)}
            </dd>
            <span className="wd-math-popover">
              <strong>Latest bank-supplied balance</strong>
              {latestBalanceRow == null
                ? "No imported statement balance in this scope."
                : `${latestBalanceRow.date} after ${
                    latestBalanceRow.merchant || latestBalanceRow.note
                  }.`}
            </span>
          </div>
        </dl>
      </header>
      <div className="wd-all-ledger-grid">
        <article className="wd-all-ledger-trend">
          <LabeledLineChart
            title="Monthly cash net"
            xLabel=""
            yLabel=""
            points={monthlyNet}
            color="#1f6f8b"
            height={190}
          />
        </article>
        <InteractivePieChart
          title="Received by source"
          slices={toSlices(incomeMap)}
          size={220}
          holeRatio={0.58}
          centerPrimary={moneyCents(totalIncome)}
          centerSecondary="received"
          showLegend
          onSliceDoubleClick={(slice) =>
            onCategoryDoubleClick?.("income", slice.name)
          }
        />
        <InteractivePieChart
          title="All expenses by category"
          slices={toSlices(expenseMap)}
          size={220}
          holeRatio={0.58}
          centerPrimary={moneyCents(totalExpenses)}
          centerSecondary="expenses"
          showLegend
          onSliceDoubleClick={(slice) =>
            onCategoryDoubleClick?.("expense", slice.name)
          }
        />
        <InteractivePieChart
          title="Moved out, not spending"
          slices={toSlices(movementOutMap)}
          size={220}
          holeRatio={0.58}
          centerPrimary={moneyCents(totalMovementOut)}
          centerSecondary="moved out"
          showLegend
          onSliceDoubleClick={(slice) =>
            onCategoryDoubleClick?.("expense", slice.name)
          }
        />
      </div>
    </section>
  );
}

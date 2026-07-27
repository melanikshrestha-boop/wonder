/**
 * Whoop time graphs — geometry, fixed axes, hover popup per point.
 */
import { useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { MetricSeries } from "./whoopStore";
import { resolveSleepForDay } from "./whoopStore";
import { metricDef } from "./whoopMetrics";
import { formatHm12 } from "./sleepStore";

export function formatValue(v: number | null | undefined, unit: string): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (unit === "h") return v.toFixed(1);
  if (
    unit === "%" ||
    unit === "bpm" ||
    unit === "min" ||
    unit === "cal" ||
    unit === "ms"
  ) {
    return Math.abs(v) >= 100
      ? String(Math.round(v))
      : Number.isInteger(v)
        ? String(v)
        : v.toFixed(1);
  }
  if (Math.abs(v) >= 100) return String(Math.round(v));
  return v.toFixed(1);
}

/**
 * Display dates as M/D — e.g. 2026-07-24 → 7/24.
 * Accepts date-only or ISO datetime strings.
 */
export function shortDay(iso: string): string {
  if (!iso) return "—";
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${Number(m[2])}/${Number(m[3])}`;
}

type ChartGeom = {
  line: string;
  area: string;
  dots: { x: number; y: number; v: number; day: string }[];
  yTicks: { y: number; label: string }[];
  xLabels: { x: number; label: string }[];
  w: number;
  h: number;
  padL: number;
  padR: number;
  padT: number;
  padB: number;
  /** Map a value to SVG Y (for goal lines etc.) */
  yOf: (v: number) => number;
  /** Regression fit through history (deep sleep) */
  fitLine?: string;
  /** Forecast dashed segment (history end → future) */
  forecastLine?: string;
  forecastDots?: { x: number; y: number; v: number; day: string }[];
};

/**
 * Pick a clean tick step (1, 2, 2.5, 5, 10, 20…) so axes aren’t noisy.
 */
function niceStep(rough: number): number {
  if (!Number.isFinite(rough) || rough <= 0) return 1;
  const exp = Math.floor(Math.log10(rough));
  const base = Math.pow(10, exp);
  const err = rough / base;
  if (err <= 1.2) return base;
  if (err <= 2.2) return 2 * base;
  if (err <= 5) return 5 * base;
  return 10 * base;
}

/**
 * Whoop metrics that physically cannot be negative.
 * Unit is the reliable signal; key catches strain / empty-unit series.
 */
function seriesIsNonNegative(key: string, unit: string): boolean {
  if (
    unit === "%" ||
    unit === "cal" ||
    unit === "min" ||
    unit === "ms" ||
    unit === "bpm" ||
    unit === "h" ||
    unit === "rpm" ||
    unit === "°C"
  ) {
    return true;
  }
  // Day / workout strain — unit is empty string but never negative
  if (key === "strain" || key === "woStrain" || key === "woMin" || key === "cal") {
    return true;
  }
  return false;
}

/**
 * Snap [lo, hi] to clean tick steps.
 * `floor` only lifts if we went under it (e.g. stop −1000 under cal).
 * It does NOT drag a data min of 18 down to a forced 0 baseline.
 */
function snapDomain(
  lo: number,
  hi: number,
  rails?: { floor?: number; ceil?: number }
): { lo: number; hi: number; step: number } {
  let a = Number.isFinite(lo) ? lo : 0;
  let b = Number.isFinite(hi) ? hi : a + 1;
  if (b <= a) b = a + 1;

  const span = Math.max(b - a, 1e-6);
  // ~4–5 intervals across the data window
  const step = niceStep(span / 4);
  let outLo = Math.floor(a / step - 1e-12) * step;
  let outHi = Math.ceil(b / step + 1e-12) * step;
  // Always leave at least 2 steps of height so ticks look sane
  if (outHi - outLo < step * 2) {
    outHi = outLo + step * 2;
  }

  if (rails?.floor != null && outLo < rails.floor) {
    outLo = rails.floor;
    if (outHi - outLo < step * 2) outHi = outLo + step * 2;
  }
  if (rails?.ceil != null && outHi > rails.ceil) {
    outHi = rails.ceil;
    if (outHi - outLo < step * 2) {
      outLo =
        rails.floor != null ? rails.floor : Math.min(outLo, outHi - step * 2);
    }
  }

  if (Object.is(outLo, -0)) outLo = 0;
  if (Object.is(outHi, -0)) outHi = 0;
  if (rails?.floor != null && outLo < rails.floor) outLo = rails.floor;
  if (outHi <= outLo) outHi = outLo + (step || 1);

  return { lo: outLo, hi: outHi, step };
}

/**
 * Y domain for every Whoop graph — hug the data.
 *
 *   lowest tick  ≈ min(data) − a little pad
 *   highest tick ≈ max(data) + a little pad
 *
 * Never invent empty space down to 0 when the lowest real point is 18.
 * Never invent negatives when every point is ≥ 0.
 * Never clip a real max (e.g. summed workout strain 210) under a fake 21 ceiling.
 *
 * `fixed` is only a soft physical rail (SpO₂ ≤ 100, day strain ≤ 21 when data fits).
 */
function yDomainFor(
  vals: number[],
  fixed: { lo: number; hi: number } | null,
  nonNegative: boolean
): { lo: number; hi: number; step: number } {
  const clean = vals.filter((v) => Number.isFinite(v));
  if (!clean.length) {
    return snapDomain(0, 1, nonNegative ? { floor: 0 } : undefined);
  }

  const dataLo = Math.min(...clean);
  const dataHi = Math.max(...clean);
  const dataSpan = Math.max(dataHi - dataLo, 0);

  // Little air under the lowest point and above the highest (~12% of span).
  // Flat series: absolute pad so the line isn’t glued to both edges.
  const pad =
    dataSpan < 1e-9
      ? Math.max(Math.abs(dataHi) * 0.06, 0.75)
      : Math.max(dataSpan * 0.12, dataSpan * 0.08, 0.35);

  let lo = dataLo - pad;
  let hi = dataHi + pad;

  // Include every real point exactly
  lo = Math.min(lo, dataLo);
  hi = Math.max(hi, dataHi);

  // Non-negative metrics: refuse negative axis only — do NOT force baseline to 0
  if (nonNegative && lo < 0) lo = 0;

  // Soft physical ceilings (don’t invent SpO₂ 110% or day-strain 40 when max is 18)
  if (fixed) {
    // Cap top only when data actually sits under the physical max
    if (dataHi <= fixed.hi && hi > fixed.hi) hi = fixed.hi;
    // Cap bottom only when we went under a meaningful physical floor (> 0 rare)
    if (fixed.lo > 0 && dataLo >= fixed.lo && lo < fixed.lo) lo = fixed.lo;
  }

  if (hi <= lo) hi = lo + Math.max(pad, 1);

  return snapDomain(lo, hi, {
    // Only stop negatives — never force empty 0→min dead zone
    floor: nonNegative ? 0 : undefined,
    // Soft ceil only if data never exceeded it
    ceil:
      fixed && dataHi <= fixed.hi ? fixed.hi : undefined,
  });
}

/** Tick values from snapped domain — never emits a tick below lo. */
function yTicksFor(lo: number, hi: number, step: number): number[] {
  const s = step > 0 ? step : niceStep((hi - lo) / 4);
  const ticks: number[] = [];
  // Start at first multiple ≥ lo (never walk below floor)
  let v = Math.ceil((lo - s * 1e-9) / s) * s;
  if (v < lo) v += s;
  for (let i = 0; i < 24 && v <= hi + s * 1e-6; i++) {
    let r = Math.round(v / s) * s;
    if (Object.is(r, -0)) r = 0;
    // Hard reject any negative tick when the domain starts at ≥ 0
    if (lo >= 0 && r < 0) {
      v += s;
      continue;
    }
    if (r + s * 1e-9 >= lo) ticks.push(r);
    v += s;
  }
  if (ticks.length < 2) {
    const a = lo >= 0 ? Math.max(0, lo) : lo;
    const b = Math.max(a + (s || 1), hi);
    return [a, b];
  }
  // Prefer 3–6 labels
  if (ticks.length > 7) {
    return yTicksFor(lo, hi, s * 2);
  }
  return ticks;
}

function chartGeom(
  series: MetricSeries,
  w: number,
  h: number,
  opts?: {
    padL?: number;
    padR?: number;
    padT?: number;
    padB?: number;
    maxXLabels?: number;
    /** Extra values to expand Y domain only (goal lines) — never drawn as points */
    domainExtra?: number[];
  }
): ChartGeom | null {
  const pts = series.points;
  if (pts.length < 1) return null;
  const padL = opts?.padL ?? 4;
  const padR = opts?.padR ?? 4;
  const padT = opts?.padT ?? 4;
  const padB = opts?.padB ?? 4;
  const plotW = Math.max(1, w - padL - padR);
  const plotH = Math.max(1, h - padT - padB);

  const future = series.forecast?.future ?? [];
  const fit = series.forecast?.fit ?? [];
  // X axis = history + forecast days (so the dashed tail has room)
  const allDays = [...pts.map((p) => p.day)];
  for (const f of future) {
    if (!allDays.includes(f.day)) allDays.push(f.day);
  }
  allDays.sort((a, b) => a.localeCompare(b));
  const dayIndex = new Map(allDays.map((d, i) => [d, i]));
  const nX = Math.max(allDays.length, 1);

  const vals = [
    ...pts.map((p) => p.value),
    ...fit.map((p) => p.value),
    ...future.map((p) => p.value),
    ...(opts?.domainExtra ?? []),
  ].filter((v) => Number.isFinite(v));
  if (!vals.length) return null;

  const fixed = metricDef(series.key)?.yRange ?? null;
  const nonNeg = seriesIsNonNegative(series.key, series.unit);
  const { lo, hi, step } = yDomainFor(vals, fixed, nonNeg);

  const yOf = (v: number) => {
    const clamped = Math.min(hi, Math.max(lo, v));
    return padT + ((hi - clamped) / (hi - lo || 1)) * plotH;
  };
  const xOfDay = (day: string) => {
    const i = dayIndex.get(day) ?? 0;
    return padL + (nX === 1 ? plotW / 2 : (i / (nX - 1)) * plotW);
  };

  const dots = pts.map((p) => ({
    x: xOfDay(p.day),
    y: yOf(p.value),
    v: p.value,
    day: p.day,
  }));

  const line = dots
    .map((d, i) => `${i === 0 ? "M" : "L"}${d.x.toFixed(2)},${d.y.toFixed(2)}`)
    .join(" ");
  const baseY = padT + plotH;
  const area =
    dots.length > 0
      ? `${line} L${dots[dots.length - 1].x.toFixed(2)},${baseY} L${dots[0].x.toFixed(2)},${baseY} Z`
      : "";

  // Regression fit line (through history)
  let fitLine: string | undefined;
  if (fit.length >= 2) {
    const sorted = [...fit].sort((a, b) => a.day.localeCompare(b.day));
    fitLine = sorted
      .map(
        (p, i) =>
          `${i === 0 ? "M" : "L"}${xOfDay(p.day).toFixed(2)},${yOf(p.value).toFixed(2)}`
      )
      .join(" ");
  }

  // Forecast: connect last actual → future points
  let forecastLine: string | undefined;
  let forecastDots: ChartGeom["forecastDots"];
  if (future.length >= 1 && pts.length >= 1) {
    const lastPt = pts[pts.length - 1];
    const chain = [
      { day: lastPt.day, value: lastPt.value },
      ...[...future].sort((a, b) => a.day.localeCompare(b.day)),
    ];
    forecastLine = chain
      .map(
        (p, i) =>
          `${i === 0 ? "M" : "L"}${xOfDay(p.day).toFixed(2)},${yOf(p.value).toFixed(2)}`
      )
      .join(" ");
    forecastDots = future.map((p) => ({
      x: xOfDay(p.day),
      y: yOf(p.value),
      v: p.value,
      day: p.day,
    }));
  }

  // High → low for top-of-axis first (visual match)
  const tickVals = yTicksFor(lo, hi, step).sort((a, b) => b - a);
  const yTicks = tickVals.map((v) => ({
    y: yOf(v),
    label: formatValue(v, series.unit),
  }));

  const maxX = opts?.maxXLabels ?? 5;
  const xLabels: { x: number; label: string }[] = [];
  if (allDays.length === 1) {
    xLabels.push({ x: xOfDay(allDays[0]), label: shortDay(allDays[0]) });
  } else {
    const idxs = new Set<number>();
    for (let i = 0; i < maxX; i++) {
      idxs.add(Math.round((i / Math.max(1, maxX - 1)) * (allDays.length - 1)));
    }
    for (const i of [...idxs].sort((a, b) => a - b)) {
      xLabels.push({ x: xOfDay(allDays[i]), label: shortDay(allDays[i]) });
    }
  }

  return {
    line,
    area,
    dots,
    yTicks,
    xLabels,
    w,
    h,
    padL,
    padR,
    padT,
    padB,
    yOf,
    fitLine,
    forecastLine,
    forecastDots,
  };
}

function trendPolarity(
  series: MetricSeries
): "good" | "bad" | "neutral" {
  const hib =
    series.key === "weight"
      ? false
      : metricDef(series.key)?.higherIsBetter ?? null;
  if (series.trend === "na" || series.trend === "flat" || hib === null) {
    return "neutral";
  }
  if (series.trend === "up") return hib ? "good" : "bad";
  return hib ? "bad" : "good";
}

function strokeFor(series: MetricSeries): string {
  const pol = trendPolarity(series);
  if (pol === "good") return "var(--wx-up)";
  if (pol === "bad") return "var(--wx-down)";
  return "var(--wx-accent)";
}

export function TimeGraph({
  series,
  /** Optional horizontal goal / target line (e.g. 110 lb weight) */
  goal,
  goalLabel,
}: {
  series: MetricSeries;
  goal?: number | null;
  goalLabel?: string;
}) {
  const w = 640;
  const h = 180;
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const g = useMemo(
    () =>
      chartGeom(series, w, h, {
        padL: 40,
        padR: 16,
        padT: 12,
        padB: 28,
        maxXLabels: 6,
        domainExtra:
          goal != null && Number.isFinite(goal) ? [goal] : undefined,
      }),
    [series, goal]
  );

  if (!g || series.points.length < 1) {
    return <p className="wx-empty">Not enough points for a graph.</p>;
  }

  const stroke = strokeFor(series);
  const gradId = `tg-${series.key}`;
  const hover = hoverIdx != null ? g.dots[hoverIdx] : null;
  const goalY =
    goal != null && Number.isFinite(goal) ? g.yOf(goal) : null;

  function nearestIndex(svgX: number): number {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < g!.dots.length; i++) {
      const dist = Math.abs(g!.dots[i].x - svgX);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    return best;
  }

  function onPointerMove(e: ReactMouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const svgX = ((e.clientX - rect.left) / rect.width) * w;
    setHoverIdx(nearestIndex(svgX));
  }

  const tipStyle = hover
    ? (() => {
        const leftPct = (hover.x / w) * 100;
        const topPct = (hover.y / h) * 100;
        const flipX = leftPct > 72;
        const flipY = topPct < 28;
        return {
          left: `${leftPct}%`,
          top: `${topPct}%`,
          transform: `translate(${flipX ? "-110%" : "12px"}, ${
            flipY ? "8px" : "calc(-100% - 10px)"
          })`,
        } as const;
      })()
    : undefined;

  return (
    <div className="wx-graph-wrap">
      <svg
        className="wx-graph is-interactive"
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={`${series.label} over time — hover for each day`}
        onMouseMove={onPointerMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.26" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        {g.yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={g.padL}
              x2={w - g.padR}
              y1={t.y}
              y2={t.y}
              className="wx-grid-line"
            />
            <text x={g.padL - 6} y={t.y + 3} className="wx-axis-y" textAnchor="end">
              {t.label}
            </text>
          </g>
        ))}
        {g.area ? <path d={g.area} fill={`url(#${gradId})`} /> : null}
        {/* Goal / target dashed line (weight 110 lb, etc.) */}
        {goalY != null ? (
          <g pointerEvents="none">
            <line
              x1={g.padL}
              x2={w - g.padR}
              y1={goalY}
              y2={goalY}
              stroke="var(--wx-goal, #d4a017)"
              strokeWidth="1.5"
              strokeDasharray="5 4"
              opacity="0.9"
            />
            <text
              x={w - g.padR}
              y={goalY - 5}
              textAnchor="end"
              className="wx-goal-label"
            >
              {goalLabel ||
                `${formatValue(goal!, series.unit)}${series.unit} goal`}
            </text>
          </g>
        ) : null}
        <path
          d={g.line}
          fill="none"
          stroke={stroke}
          strokeWidth="2.25"
          strokeLinejoin="round"
          strokeLinecap="round"
          pointerEvents="none"
        />
        {/* Linear (or multi-linear) fit through history */}
        {g.fitLine ? (
          <path
            d={g.fitLine}
            fill="none"
            stroke="var(--wx-accent, #7eb8ff)"
            strokeWidth="1.75"
            strokeOpacity="0.85"
            strokeLinejoin="round"
            strokeLinecap="round"
            pointerEvents="none"
          />
        ) : null}
        {/* 7-day forecast — dashed */}
        {g.forecastLine ? (
          <path
            d={g.forecastLine}
            fill="none"
            stroke="var(--wx-accent, #7eb8ff)"
            strokeWidth="2"
            strokeDasharray="5 4"
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity="0.9"
            pointerEvents="none"
          />
        ) : null}
        {g.forecastDots?.map((d, i) => (
          <circle
            key={`f-${i}`}
            cx={d.x}
            cy={d.y}
            r={3}
            fill="none"
            stroke="var(--wx-accent, #7eb8ff)"
            strokeWidth="1.5"
            pointerEvents="none"
          />
        ))}
        {g.dots.map((d, i) => (
          <circle
            key={i}
            cx={d.x}
            cy={d.y}
            r={hoverIdx === i ? 5 : 2.5}
            fill={stroke}
            opacity={hoverIdx == null || hoverIdx === i ? 1 : 0.35}
            pointerEvents="none"
          />
        ))}
        {hover ? (
          <g pointerEvents="none">
            <line
              x1={hover.x}
              x2={hover.x}
              y1={g.padT}
              y2={h - g.padB}
              stroke={stroke}
              strokeWidth="1"
              strokeDasharray="3 3"
              opacity="0.55"
            />
            <circle
              cx={hover.x}
              cy={hover.y}
              r="7"
              fill="none"
              stroke={stroke}
              strokeWidth="1.5"
              opacity="0.9"
            />
          </g>
        ) : null}
        {g.xLabels.map((t, i) => (
          <text key={i} x={t.x} y={h - 8} className="wx-axis-x" textAnchor="middle">
            {t.label}
          </text>
        ))}
        <rect
          x={g.padL}
          y={g.padT}
          width={Math.max(1, w - g.padL - g.padR)}
          height={Math.max(1, h - g.padT - g.padB)}
          fill="transparent"
        />
      </svg>

      {hover && tipStyle ? (
        <div className="wx-tip" style={tipStyle} role="tooltip">
          <div className="wx-tip-day">{shortDay(hover.day)}</div>
          <div className="wx-tip-val">
            {formatValue(hover.v, series.unit)}
            {series.unit}
            <span className="wx-tip-label"> {series.label}</span>
          </div>
          {/* Sleep graphs: bedtime only for real nights (not forecast hollow dots) */}
          {metricDef(series.key)?.group === "sleep" &&
          series.points.some((p) => p.day === hover.day) ? (
            (() => {
              const night = resolveSleepForDay(hover.day);
              if (!night.bedtime && !night.wake) return null;
              const a = night.bedtime ? formatHm12(night.bedtime).toLowerCase() : "—";
              const b = night.wake ? formatHm12(night.wake).toLowerCase() : "—";
              return <div className="wx-tip-times">{a} - {b}</div>;
            })()
          ) : null}
        </div>
      ) : null}

      <div className="wx-graph-foot">
        <span className="wx-graph-n">n = {series.points.length}</span>
        <span>
          {series.latest != null ? (
            <>
              latest: {formatValue(series.latest, series.unit)}
              {series.unit}
              {series.min != null && series.max != null
                ? ` · range ${formatValue(series.min, series.unit)}–${formatValue(series.max, series.unit)}`
                : ""}
            </>
          ) : null}
        </span>
      </div>
    </div>
  );
}

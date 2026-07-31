/**
 * Fitness page — Wonder Fitness (Sleep · Meals · Gym · Focus).
 * Quote + subnav; Focus is app hours (where attention goes).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CIRC,
  DAILY_SUPPLEMENTS,
  MACRO_GOALS,
  MEAL_PRESETS,
  pct,
  todayKey,
  type ConsumeLog,
} from "./data";
import {
  addEntry,
  applyPendingSnackSeed,
  loadDay as loadNutriDay,
  NUTRITION_EVENT,
  removeEntry,
  totalsFor as nutriTotalsFor,
  type NutriEntry,
} from "./nutrition/nutritionStore";
import { GymExact } from "./GymExact";
import { ScreenTime } from "./ScreenTime";
import { MEL_DATA_EVENT } from "./melTools";
import { notifyHabitAutoSync, WATER_GOAL_ML } from "./habitAutoSync";

import {
  buildWhoopAnalytics,
  importWhoopCsvTexts,
  importWhoopFromPublicLatest,
  listWhoopSleepNights,
  loadWhoopDay,
  loadWhoopStore,
  resolveSleepForDay,
  syncAllWhoopSleepToSleepStore,
  WHOOP_EVENT,
  type WhoopDay,
} from "./whoopStore";
import { groupMetricsBySection, metricDef } from "./whoopMetrics";
import { MetricExplainModal, MetricGraphPanel } from "./whoopMetricUi";
import { QuoteRefreshControl } from "./QuoteRefreshControl";
import { useQuoteRotation } from "./useQuoteRotation";
import "./fitness-exact.css";
import "./gym-exact.css";
import "./whoop-lab.css";

const CONSUME_KEY = "dr-melani-meals-consume";

type DayLog = Record<string, ConsumeLog>;

function loadDayLog(day: string): DayLog {
  try {
    const raw = localStorage.getItem(`${CONSUME_KEY}:${day}`);
    if (raw) return JSON.parse(raw) as DayLog;
  } catch {
    /* ignore */
  }
  return {};
}

function saveDayLog(day: string, log: DayLog) {
  try {
    localStorage.setItem(`${CONSUME_KEY}:${day}`, JSON.stringify(log));
  } catch {
    /* ignore */
  }
}

export type FitnessTab = "sleep" | "meals" | "gym" | "focus";

function tabFromPageId(pageId: string): FitnessTab {
  if (pageId === "pg-meals") return "meals";
  if (pageId === "pg-gym") return "gym";
  // Focus was "Screen Time" — same desk, new name under Fitness
  if (
    pageId === "pg-focus" ||
    pageId === "pg-screentime" ||
    pageId === "pg-screen-time"
  ) {
    return "focus";
  }
  // Old Whoop page → Sleep (data lives on Sleep / Gym / Meals, not a Whoop tab)
  return "sleep";
}

/** Quiet silhouettes for dark Fitness page (not a loud medical poster). */
function BowelLookIcon({ look }: { look: BowelLook }) {
  const fill = "rgba(196, 165, 116, 0.92)";
  if (look === 1) {
    return (
      <svg viewBox="0 0 56 28" width="52" height="26" aria-hidden>
        <circle cx="10" cy="14" r="5" fill={fill} />
        <circle cx="24" cy="11" r="4.5" fill={fill} />
        <circle cx="36" cy="16" r="5" fill={fill} />
        <circle cx="48" cy="12" r="4" fill={fill} />
      </svg>
    );
  }
  if (look === 2) {
    return (
      <svg viewBox="0 0 56 28" width="52" height="26" aria-hidden>
        <path
          d="M6 16c2-8 8-11 14-8 4 2 6 5 10 5 5 0 7-4 12-4 6 0 10 4 10 9 0 4-4 7-12 7H16C8 25 4 21 6 16z"
          fill={fill}
        />
        <circle cx="18" cy="12" r="2.2" fill="#c4a574" opacity="0.5" />
        <circle cx="28" cy="11" r="2" fill="#c4a574" opacity="0.45" />
      </svg>
    );
  }
  if (look === 3) {
    return (
      <svg viewBox="0 0 56 28" width="52" height="26" aria-hidden>
        <path
          d="M4 15c2-7 8-11 16-11 7 0 11 3 14 3s10 1 14 7c2 3-1 9-11 9H16C7 23 2 20 4 15z"
          fill={fill}
        />
        <path
          d="M14 11h6M24 10h8M36 11h6"
          stroke="#f5efe6"
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity="0.55"
        />
      </svg>
    );
  }
  if (look === 4) {
    return (
      <svg viewBox="0 0 56 28" width="52" height="26" aria-hidden>
        <path
          d="M3 15c2-7 9-11 18-11 7 0 11 3 14 3s11 1 14 7c2 3-1 9-12 9H15C6 23 1 20 3 15z"
          fill={fill}
        />
      </svg>
    );
  }
  if (look === 5) {
    return (
      <svg viewBox="0 0 56 28" width="52" height="26" aria-hidden>
        <ellipse cx="14" cy="15" rx="8" ry="6.5" fill={fill} />
        <ellipse cx="32" cy="13" rx="7" ry="5.5" fill={fill} />
        <ellipse cx="46" cy="16" rx="6.5" ry="5" fill={fill} />
      </svg>
    );
  }
  if (look === 6) {
    return (
      <svg viewBox="0 0 56 28" width="52" height="26" aria-hidden>
        <path
          d="M6 18c0-5 4-9 8-7 3 1 4 3 7 2 3-2 3-6 8-6s5 4 8 3 4-4 8-2 6 4 5 9c-1 4-5 6-11 6H14c-5 0-8-2-8-5z"
          fill={fill}
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 56 28" width="52" height="26" aria-hidden>
      <path
        d="M4 9c5 0 6 4 10 4s6-4 12-4 7 4 11 4 6-3 11-3v12H4V9z"
        fill={fill}
        opacity="0.5"
      />
      <path
        d="M8 16c4 0 5-3 9-3s5 3 9 3 6-3 10-3 6 2 10 2"
        stroke={fill}
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

import {
  BOWEL_DETAIL_RESTORE_EVENT,
  BOWEL_EXTERNAL_RESTORE_EVENT,
  BOWEL_LOOK_GUIDE,
  BOWEL_TYPE_POPUP,
  FOG_EXTERNAL_RESTORE_EVENT,
  FOG_LOCK_HOUR,
  FOG_LOCK_MINUTE,
  applyPendingBowelCorrections,
  isFogDayWritable,
  loadBowelDetailMap,
  loadBowelMap,
  loadFogMap,
  msUntilFogLock,
  setFogDay,
  saveBowelDetailMap,
  saveSleepDay,
  seedBowelDetailUndoBaseline,
  seedBowelUndoBaseline,
  seedFogUndoBaseline,
  upsertBowelDay,
  type BowelDayLog,
  type BowelLook,
  SLEEP_EXTERNAL_RESTORE_EVENT,
  formatHm12,
  sleepWeekDays,
} from "./sleepStore";

/**
 * Fog day clock — isolated so Sleep graphs don't re-render on every tick.
 * Timeline: local midnight → 11:59 PM lock.
 */
function FogDayClock({
  dayIso,
  onWritableChange,
}: {
  dayIso: string;
  onWritableChange: (writable: boolean) => void;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    // 30s is enough for countdown; was 15s and re-rendered entire Sleep page
    const id = window.setInterval(tick, 30_000);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", tick);
    };
  }, []);

  const writable = isFogDayWritable(dayIso, now);
  useEffect(() => {
    onWritableChange(writable);
  }, [writable, onWritableChange]);

  const lockMs = msUntilFogLock(now);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const lockAt = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    FOG_LOCK_HOUR,
    FOG_LOCK_MINUTE,
    0,
    0
  );
  const span = Math.max(1, lockAt.getTime() - start.getTime());
  const elapsed = Math.min(span, Math.max(0, now.getTime() - start.getTime()));
  const pct = Math.round((elapsed / span) * 100);
  const leftMin = Math.ceil(lockMs / 60_000);
  const leftH = Math.floor(leftMin / 60);
  const leftM = leftMin % 60;
  const leftLabel =
    leftMin <= 0
      ? "locked"
      : leftH > 0
        ? `${leftH}h ${leftM}m left`
        : `${leftM}m left`;

  return (
    <div
      className={`fx-bf-clock${writable ? "" : " is-locked"}`}
      aria-label={
        writable
          ? `Fog answer open. Locks at 11:59 PM. ${leftLabel}.`
          : "Fog answer locked for today at 11:59 PM"
      }
    >
      <div className="fx-bf-clock-rail" aria-hidden>
        <span className="fx-bf-clock-fill" style={{ width: `${pct}%` }} />
        <span className="fx-bf-clock-now" style={{ left: `${pct}%` }} />
      </div>
      <p className="fx-bf-clock-meta">
        {writable
          ? `open · locks 11:59 PM · ${leftLabel}`
          : "locked · final for today"}
      </p>
    </div>
  );
}

/** Thin donut slice paths (shared geometry for fog + Bristol pies). */
function donutSlicePath(
  cx: number,
  cy: number,
  rOuter: number,
  startFrac: number,
  endFrac: number
): string {
  const tau = Math.PI * 2;
  if (endFrac - startFrac >= 0.999) {
    return `M ${cx} ${cy - rOuter} A ${rOuter} ${rOuter} 0 1 1 ${cx} ${cy + rOuter} A ${rOuter} ${rOuter} 0 1 1 ${cx} ${cy - rOuter}`;
  }
  const a0 = -Math.PI / 2 + startFrac * tau;
  const a1 = -Math.PI / 2 + endFrac * tau;
  const x0 = cx + rOuter * Math.cos(a0);
  const y0 = cy + rOuter * Math.sin(a0);
  const x1 = cx + rOuter * Math.cos(a1);
  const y1 = cy + rOuter * Math.sin(a1);
  const large = endFrac - startFrac > 0.5 ? 1 : 0;
  return `M ${cx} ${cy} L ${x0} ${y0} A ${rOuter} ${rOuter} 0 ${large} 1 ${x1} ${y1} Z`;
}

/** Bristol 1–7 lifetime colors (type 4 = ideal green). */
const BRISTOL_LINE_COLORS: Record<1 | 2 | 3 | 4 | 5 | 6 | 7, string> = {
  1: "#78716c",
  2: "#a8a29e",
  3: "#a3e635",
  4: "#22c55e",
  5: "#eab308",
  6: "#f97316",
  7: "#ef4444",
};

type BristolType = 1 | 2 | 3 | 4 | 5 | 6 | 7;
const BRISTOL_TYPES: BristolType[] = [1, 2, 3, 4, 5, 6, 7];

type BowelConsistencyPoint = {
  day: string;
  yes: number;
  no: number;
  logged: "yes" | "no";
  look?: BowelLook;
};

/**
 * Lifetime Bristol multi-line graph — one cumulative line per type 1–7.
 * Same Recovery panel language (title · big n · soft lines · footer).
 */
function BowelBristolLifetimeGraph({
  series,
  counts,
  n,
}: {
  /** day → cumulative count for each type after that day */
  series: { day: string; byType: Record<BristolType, number> }[];
  counts: Record<BristolType, number>;
  n: number;
}) {
  const [hoverDay, setHoverDay] = useState<string | null>(null);
  const [hotType, setHotType] = useState<BristolType | null>(null);

  if (n < 1 || series.length < 1) {
    return (
      <p className="fx-bf-pie-empty">
        Log Yes and pick type 1–7 — the graph fills for life.
      </p>
    );
  }

  const w = 640;
  const h = 180;
  const padL = 36;
  const padR = 14;
  const padT = 12;
  const padB = 28;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const maxY = Math.max(
    1,
    ...BRISTOL_TYPES.map((t) => counts[t]),
    ...series.flatMap((s) => BRISTOL_TYPES.map((t) => s.byType[t]))
  );
  // Nice top
  const yHi = maxY <= 2 ? 2 : maxY <= 5 ? 5 : Math.ceil(maxY * 1.12);
  const yOf = (v: number) => padT + ((yHi - v) / yHi) * plotH;
  const xOf = (i: number) =>
    padL + (series.length === 1 ? plotW / 2 : (i / (series.length - 1)) * plotW);

  const activeTypes = BRISTOL_TYPES.filter((t) => counts[t] > 0);
  const lines = activeTypes.map((t) => {
    const pts = series.map((s, i) => ({
      x: xOf(i),
      y: yOf(s.byType[t]),
      v: s.byType[t],
      day: s.day,
    }));
    const d = pts
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(" ");
    return { t, pts, d, color: BRISTOL_LINE_COLORS[t] };
  });

  const yTicks = [0, Math.round(yHi / 2), yHi].filter(
    (v, i, a) => a.indexOf(v) === i
  );
  const xIdx =
    series.length <= 4
      ? series.map((_, i) => i)
      : [
          0,
          Math.floor(series.length / 3),
          Math.floor((series.length * 2) / 3),
          series.length - 1,
        ];

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const svgX = ((e.clientX - rect.left) / rect.width) * w;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < series.length; i++) {
      const d = Math.abs(xOf(i) - svgX);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    setHoverDay(series[best].day);
  }

  const hoverIdx = hoverDay
    ? series.findIndex((s) => s.day === hoverDay)
    : -1;
  const hoverRow = hoverIdx >= 0 ? series[hoverIdx] : null;

  const shortDay = (iso: string) => {
    const m = iso.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return iso;
    return `${Number(m[2])}/${Number(m[3])}`;
  };

  // Dominant type (most logs)
  const topType = activeTypes.reduce((a, b) =>
    counts[a] >= counts[b] ? a : b
  );

  return (
    <article className="wx-panel fx-bm-type-graph">
      <header className="wx-panel-head">
        <div className="wx-panel-title-row">
          <h3 className="wx-panel-title">BRISTOL TYPES</h3>
        </div>
        <div className="wx-panel-nums">
          <span className="wx-panel-v">
            {n}
            <small>logs</small>
          </span>
          <span className="wx-panel-meta">
            <span className="wx-panel-latest">
              top: Type {topType} · {counts[topType]} (
              {Math.round((counts[topType] / n) * 100)}%)
            </span>
            <span className="wx-panel-range">
              {activeTypes.length} type{activeTypes.length === 1 ? "" : "s"}{" "}
              seen
            </span>
          </span>
        </div>
      </header>

      <div className="wx-graph-wrap">
        <svg
          className="wx-graph is-interactive fx-bm-multi"
          viewBox={`0 0 ${w} ${h}`}
          role="img"
          aria-label="Lifetime Bristol types — cumulative counts by type"
          onMouseMove={onMove}
          onMouseLeave={() => setHoverDay(null)}
        >
          {yTicks.map((v) => (
            <g key={v}>
              <line
                x1={padL}
                x2={padL + plotW}
                y1={yOf(v)}
                y2={yOf(v)}
                className="wx-grid-line"
              />
              <text
                x={padL - 6}
                y={yOf(v) + 3}
                textAnchor="end"
                className="wx-axis-y"
              >
                {v}
              </text>
            </g>
          ))}
          {lines.map((line) => {
            const dim =
              (hotType != null && hotType !== line.t) ||
              (hoverDay != null && hotType == null && false);
            const emphasis = hotType === line.t;
            return (
              <g key={line.t} opacity={dim ? 0.22 : 1}>
                <path
                  d={line.d}
                  fill="none"
                  stroke={line.color}
                  strokeWidth={emphasis ? 3 : 2.25}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  pointerEvents="none"
                />
                {line.pts.map((p, i) => (
                  <circle
                    key={`${line.t}-${i}`}
                    cx={p.x}
                    cy={p.y}
                    r={
                      hoverIdx === i
                        ? emphasis
                          ? 5
                          : 3.5
                        : emphasis
                          ? 3
                          : 2.2
                    }
                    fill={line.color}
                    pointerEvents="none"
                  />
                ))}
              </g>
            );
          })}
          {hoverIdx >= 0 ? (
            <line
              x1={xOf(hoverIdx)}
              x2={xOf(hoverIdx)}
              y1={padT}
              y2={padT + plotH}
              stroke="rgba(26,28,34,0.2)"
              strokeDasharray="3 3"
              pointerEvents="none"
            />
          ) : null}
          {xIdx.map((i) => (
            <text
              key={series[i].day}
              x={xOf(i)}
              y={h - 8}
              textAnchor="middle"
              className="wx-axis-x"
            >
              {shortDay(series[i].day)}
            </text>
          ))}
          <rect
            x={padL}
            y={padT}
            width={plotW}
            height={plotH}
            fill="transparent"
          />
        </svg>
        {hoverRow ? (
          <div className="fx-bm-graph-tip" role="tooltip">
            <strong>{shortDay(hoverRow.day)}</strong>
            <ul>
              {activeTypes.map((t) => (
                <li key={t} style={{ color: BRISTOL_LINE_COLORS[t] }}>
                  T{t}: {hoverRow.byType[t]}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="fx-bm-line-legend" role="list">
        {activeTypes.map((t) => {
          const pct = Math.round((counts[t] / n) * 100);
          return (
            <button
              key={t}
              type="button"
              role="listitem"
              className={`fx-bm-line-leg${hotType === t ? " is-hot" : ""}`}
              onMouseEnter={() => setHotType(t)}
              onMouseLeave={() => setHotType(null)}
              onFocus={() => setHotType(t)}
              onBlur={() => setHotType(null)}
            >
              <i style={{ background: BRISTOL_LINE_COLORS[t] }} aria-hidden />
              Type {t} · {counts[t]} ({pct}%)
            </button>
          );
        })}
      </div>
      <footer className="wx-panel-foot">
        <span>
          n = {n} · cumulative count of each Bristol type over time
        </span>
      </footer>
    </article>
  );
}

/**
 * Bowel consistency graph — cumulative Yes vs No.
 * The health goal: Yes climbs, No stops climbing and becomes a flatline.
 */
function BowelConsistencyGraph({
  points,
  yes,
  no,
}: {
  points: BowelConsistencyPoint[];
  yes: number;
  no: number;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const n = yes + no;

  if (n < 1 || points.length < 1) {
    return (
      <p className="fx-bf-pie-empty">
        Log bowel Yes or No — this becomes your consistency graph.
      </p>
    );
  }

  const w = 660;
  const h = 220;
  const padL = 42;
  const padR = 18;
  const padT = 26;
  const padB = 34;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const maxY = Math.max(1, yes, no, ...points.map((p) => Math.max(p.yes, p.no)));
  const yHi = maxY <= 2 ? 2 : maxY <= 5 ? 5 : Math.ceil(maxY * 1.12);
  const yOf = (v: number) => padT + ((yHi - v) / yHi) * plotH;
  const xOf = (i: number) =>
    padL + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const shortDay = (iso: string) => {
    const m = iso.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return iso;
    return `${Number(m[2])}/${Number(m[3])}`;
  };
  const stepPath = (key: "yes" | "no") => {
    if (!points.length) return "";
    const first = points[0];
    let d = `M${xOf(0).toFixed(1)},${yOf(first[key]).toFixed(1)}`;
    for (let i = 1; i < points.length; i++) {
      const nextX = xOf(i);
      const nextY = yOf(points[i][key]);
      d += ` H${nextX.toFixed(1)} V${nextY.toFixed(1)}`;
    }
    return d;
  };
  const yTicks = [0, Math.round(yHi / 2), yHi].filter(
    (v, i, a) => a.indexOf(v) === i
  );
  const xIdx =
    points.length <= 4
      ? points.map((_, i) => i)
      : [
          0,
          Math.floor(points.length / 3),
          Math.floor((points.length * 2) / 3),
          points.length - 1,
        ];
  const noLastMovedAt = points.reduce(
    (last, p, i) => (p.logged === "no" ? i : last),
    -1
  );
  const noFlatFor =
    noLastMovedAt < 0 ? points.length : Math.max(0, points.length - noLastMovedAt - 1);
  const gap = yes - no;
  const hover = hoverIndex == null ? null : points[hoverIndex];

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const svgX = ((e.clientX - rect.left) / rect.width) * w;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < points.length; i++) {
      const d = Math.abs(xOf(i) - svgX);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    setHoverIndex(best);
  }

  return (
    <article className="wx-panel fx-bm-consistency-graph">
      <header className="wx-panel-head">
        <div className="wx-panel-title-row">
          <h3 className="wx-panel-title">BOWEL CONSISTENCY</h3>
        </div>
        <div className="fx-bm-consistency-stats">
          <span className="is-yes">Yes {yes}</span>
          <span className="is-no">No {no}</span>
          <span>
            Gap {gap >= 0 ? "+" : ""}
            {gap}
          </span>
          <span>
            No flat {noFlatFor} log{noFlatFor === 1 ? "" : "s"}
          </span>
        </div>
      </header>

      <div className="fx-bm-consistency-hover" aria-live="polite">
        {hover ? (
          <span>
            {shortDay(hover.day)} · {hover.logged === "yes" ? "Yes" : "No"}{" "}
            logged · Yes {hover.yes} · No {hover.no}
            {hover.look ? ` · Type ${hover.look}` : ""}
          </span>
        ) : (
          <span className="is-empty" aria-hidden="true">
            Hover for the exact day
          </span>
        )}
      </div>

      <div className="wx-graph-wrap">
        <svg
          className="wx-graph is-interactive fx-bm-consistency-svg"
          viewBox={`0 0 ${w} ${h}`}
          role="img"
          aria-label="Cumulative bowel movement Yes versus No count"
          onMouseMove={onMove}
          onMouseLeave={() => setHoverIndex(null)}
        >
          <text x={padL} y={16} className="fx-bm-axis-title">
            Count
          </text>
          {yTicks.map((v) => (
            <g key={v}>
              <line
                x1={padL}
                x2={padL + plotW}
                y1={yOf(v)}
                y2={yOf(v)}
                className="wx-grid-line"
              />
              <text
                x={padL - 8}
                y={yOf(v) + 4}
                textAnchor="end"
                className="wx-axis-y"
              >
                {v}
              </text>
            </g>
          ))}
          <line
            x1={padL}
            x2={padL + plotW}
            y1={yOf(0)}
            y2={yOf(0)}
            className="fx-bm-axis-line"
          />
          <path
            d={stepPath("no")}
            fill="none"
            stroke="rgba(239, 68, 68, 0.88)"
            strokeWidth={2.35}
            strokeLinejoin="round"
            strokeLinecap="round"
            pointerEvents="none"
          />
          <path
            d={stepPath("yes")}
            fill="none"
            stroke="rgba(34, 197, 94, 0.96)"
            strokeWidth={3}
            strokeLinejoin="round"
            strokeLinecap="round"
            pointerEvents="none"
          />
          {points.map((p, i) => (
            <g key={p.day} pointerEvents="none">
              <circle
                cx={xOf(i)}
                cy={yOf(p.no)}
                r={hoverIndex === i ? 4 : 2.6}
                fill="rgba(239, 68, 68, 0.88)"
              />
              <circle
                cx={xOf(i)}
                cy={yOf(p.yes)}
                r={hoverIndex === i ? 5 : 3}
                fill="rgba(34, 197, 94, 0.96)"
              />
            </g>
          ))}
          {hoverIndex != null ? (
            <line
              x1={xOf(hoverIndex)}
              x2={xOf(hoverIndex)}
              y1={padT}
              y2={padT + plotH}
              stroke="rgba(148, 163, 184, 0.38)"
              strokeDasharray="4 4"
              pointerEvents="none"
            />
          ) : null}
          {xIdx.map((i) => (
            <text
              key={points[i].day}
              x={xOf(i)}
              y={h - 10}
              textAnchor="middle"
              className="wx-axis-x"
            >
              {shortDay(points[i].day)}
            </text>
          ))}
          <text
            x={padL + plotW}
            y={h - 10}
            textAnchor="end"
            className="fx-bm-axis-title"
          >
            Days
          </text>
          <rect
            x={padL}
            y={padT}
            width={plotW}
            height={plotH}
            fill="transparent"
          />
        </svg>
      </div>

      <div className="fx-bm-line-legend" role="list">
        <span className="fx-bm-consistency-leg is-yes" role="listitem">
          <i aria-hidden />
          Yes climbs · {yes}
        </span>
        <span className="fx-bm-consistency-leg is-no" role="listitem">
          <i aria-hidden />
          No flatlines · {no}
        </span>
      </div>
    </article>
  );
}

/** Lifetime yes/no pie — hover = black border + which slice */
function BrainFogLifetimePie({ yes, no }: { yes: number; no: number }) {
  const [hover, setHover] = useState<"yes" | "no" | null>(null);
  const n = yes + no;
  if (n < 1) {
    return (
      <p className="fx-bf-pie-empty">
        Tap Yes or No today — the pie fills as you log for life.
      </p>
    );
  }
  const yesPct = (yes / n) * 100;
  const noPct = (no / n) * 100;
  const rOuter = 54;
  const rHole = 44;
  const cx = 70;
  const cy = 70;
  const yesEnd = yes / n;

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 140;
    const y = ((e.clientY - rect.top) / rect.height) * 140;
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > rOuter + 4 || dist < rHole - 2) {
      setHover(null);
      return;
    }
    let ang = Math.atan2(dy, dx);
    if (ang < -Math.PI / 2) ang += 2 * Math.PI;
    const aYesEnd = -Math.PI / 2 + yesEnd * Math.PI * 2;
    if (yes > 0 && ang < aYesEnd) setHover("yes");
    else if (no > 0) setHover("no");
    else setHover(yes > 0 ? "yes" : null);
  }

  return (
    <div className="fx-bf-pie-wrap">
      <svg
        className="fx-bf-pie"
        viewBox="0 0 140 140"
        role="img"
        aria-label={`Brain fog lifetime: yes ${yes}, no ${no}, n ${n}`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        style={{ cursor: "crosshair" }}
      >
        {yes > 0 ? (
          <path
            className="fx-bf-pie-yes"
            d={donutSlicePath(cx, cy, rOuter, 0, yesEnd)}
            opacity={hover === "no" ? 0.28 : 1}
            stroke={hover === "yes" ? "#0a0a0a" : "transparent"}
            strokeWidth={hover === "yes" ? 2.5 : 0}
            style={{ pointerEvents: "none", paintOrder: "stroke fill" }}
          />
        ) : null}
        {no > 0 ? (
          <path
            className="fx-bf-pie-no"
            d={donutSlicePath(cx, cy, rOuter, yesEnd, 1)}
            opacity={hover === "yes" ? 0.28 : 1}
            stroke={hover === "no" ? "#0a0a0a" : "transparent"}
            strokeWidth={hover === "no" ? 2.5 : 0}
            style={{ pointerEvents: "none", paintOrder: "stroke fill" }}
          />
        ) : null}
        <circle className="fx-bf-pie-hole" cx={cx} cy={cy} r={rHole} />
        <text className="fx-bf-pie-n" x={cx} y={cy + 4} textAnchor="middle">
          {hover === "yes"
            ? `Yes ${Math.round(yesPct)}%`
            : hover === "no"
              ? `No ${Math.round(noPct)}%`
              : `n = ${n}`}
        </text>
      </svg>
      <div className="fx-bf-pie-legend">
        <span
          className={`fx-bf-leg-yes${hover === "yes" ? " is-hot" : ""}`}
          onMouseEnter={() => setHover("yes")}
          onMouseLeave={() => setHover(null)}
        >
          Yes {yes} ({Math.round(yesPct)}%)
        </span>
        <span
          className={`fx-bf-leg-no${hover === "no" ? " is-hot" : ""}`}
          onMouseEnter={() => setHover("no")}
          onMouseLeave={() => setHover(null)}
        >
          No {no} ({Math.round(noPct)}%)
        </span>
      </div>
    </div>
  );
}

function SleepPanel() {
  // Calendar day this panel is editing (local YYYY-MM-DD).
  // When the clock rolls to a new day, bed/wake go blank for that day;
  // older nights stay in storage and still show on the weekly line.
  const [dayIso, setDayIso] = useState(() => todayKey());

  // Prefer Whoop band onset/wake when present
  const [bedtime, setBedtime] = useState(() => resolveSleepForDay(todayKey()).bedtime);
  const [wake, setWake] = useState(() => resolveSleepForDay(todayKey()).wake);
  const [nightsTick, setNightsTick] = useState(0);
  const [fogMap, setFogMap] = useState<Record<string, boolean>>(() => {
    const map = loadFogMap();
    seedFogUndoBaseline(map);
    return map;
  });
  const [whoop, setWhoop] = useState<WhoopDay | null>(() =>
    loadWhoopDay(todayKey())
  );
  const [whoopStoreTick, setWhoopStoreTick] = useState(0);
  const [explainKey, setExplainKey] = useState<string | null>(null);
  /** Lifetime brain-fog pie (yes vs no) — not a weekly strip */
  const [fogPieOpen, setFogPieOpen] = useState(false);
  /** Collapsed by default — every-night log lives at page bottom */
  const [nightsOpen, setNightsOpen] = useState(false);
  /** Quiet CSV import (no separate Whoop page) */
  const whoopFileRef = useRef<HTMLInputElement>(null);
  const [whoopImportBusy, setWhoopImportBusy] = useState(false);
  const nights = useMemo(
    () => listWhoopSleepNights(45),
    [nightsTick, whoop]
  );

  // Sleep page: Sleep · Overnight · Body signals (titled like Body signals)
  const sleepPageSections = useMemo(() => {
    const analytics = buildWhoopAnalytics(loadWhoopStore());
    const onSleep = analytics.series.filter((m) => {
      const g = metricDef(m.key)?.group;
      return g === "sleep" || g === "body";
    });
    return groupMetricsBySection(onSleep);
  }, [whoopStoreTick, nightsTick]);
  const explainSeries =
    explainKey != null
      ? sleepPageSections
          .flatMap((s) => s.metrics)
          .find((m) => m.key === explainKey) ?? null
      : null;

  const todayFogYes = fogMap[dayIso] === true;
  const todayFogNo = fogMap[dayIso] === false;
  // Lock state only — clock UI lives in FogDayClock so graphs don't re-render every tick
  const [fogWritable, setFogWritable] = useState(() => isFogDayWritable(dayIso));
  const onFogWritableChange = useCallback((w: boolean) => {
    setFogWritable(w);
  }, []);
  useEffect(() => {
    setFogWritable(isFogDayWritable(dayIso));
  }, [dayIso]);

  // Lifetime tallies — every logged day, forever (no week window)
  const fogLife = useMemo(() => {
    let yes = 0;
    let no = 0;
    for (const v of Object.values(fogMap)) {
      if (v === true) yes += 1;
      else if (v === false) no += 1;
    }
    return { yes, no, n: yes + no };
  }, [fogMap]);

  /**
   * Free Yes ↔ No switch while the day is open (before 11:59 PM).
   * Same answer re-tap keeps it (no accidental clear). Past days / after lock refuse.
   */
  function setTodayFog(value: boolean) {
    // Re-check clock at click time (not stale 15s state)
    if (!isFogDayWritable(dayIso, new Date())) {
      setFogWritable(false);
      return;
    }
    const next = setFogDay(dayIso, value);
    setFogMap(next);
    seedFogUndoBaseline(next);
    try {
      window.dispatchEvent(
        new CustomEvent(MEL_DATA_EVENT, {
          detail: { domain: "brainFog", day: dayIso },
        })
      );
    } catch {
      /* ignore */
    }
  }

  // On mount: hydrate from local store first (instant). Network import only if empty.
  useEffect(() => {
    const s = loadWhoopStore();
    const empty = Object.keys(s.days).length === 0 && s.workouts.length === 0;
    const hydrate = () => {
      const r = resolveSleepForDay(dayIso);
      setBedtime(r.bedtime);
      setWake(r.wake);
      setWhoop(loadWhoopDay(dayIso));
      setNightsTick((t) => t + 1);
      setWhoopStoreTick((t) => t + 1);
    };
    // Instant path — never block first paint on /whoop/latest fetches
    hydrate();
    if (!empty) return;
    void importWhoopFromPublicLatest()
      .catch(() => ({ ok: false as const }))
      .finally(hydrate);
    // dayIso only for initial hydrate of "today"; intentional empty deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onWhoopFiles(fileList: FileList | null) {
    if (!fileList?.length || whoopImportBusy) return;
    setWhoopImportBusy(true);
    try {
      const files: Array<{ name: string; text: string }> = [];
      for (const file of Array.from(fileList)) {
        if (/\.zip$/i.test(file.name)) continue;
        if (!/\.csv$/i.test(file.name) && !/\.txt$/i.test(file.name)) continue;
        files.push({ name: file.name, text: await file.text() });
      }
      if (files.length) {
        importWhoopCsvTexts(files);
        syncAllWhoopSleepToSleepStore();
        setWhoop(loadWhoopDay(dayIso));
        setNightsTick((t) => t + 1);
        setWhoopStoreTick((t) => t + 1);
      }
    } catch {
      /* ignore */
    } finally {
      setWhoopImportBusy(false);
      if (whoopFileRef.current) whoopFileRef.current.value = "";
    }
  }

  // New calendar day → load that day's Whoop/manual times
  useEffect(() => {
    function rollToToday() {
      const now = todayKey();
      if (now === dayIso) return;
      setDayIso(now);
      const next = resolveSleepForDay(now);
      setBedtime(next.bedtime);
      setWake(next.wake);
    }
    rollToToday();
    const id = window.setInterval(rollToToday, 20_000);
    window.addEventListener("focus", rollToToday);
    document.addEventListener("visibilitychange", rollToToday);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", rollToToday);
      document.removeEventListener("visibilitychange", rollToToday);
    };
  }, [dayIso]);

  // When the open day changes, hydrate bed/wake from Whoop first
  useEffect(() => {
    const r = resolveSleepForDay(dayIso);
    setBedtime(r.bedtime);
    setWake(r.wake);
    setWhoop(loadWhoopDay(dayIso));
  }, [dayIso]);

  // Persist sleep only when values actually changed (was rewriting every hydrate)
  useEffect(() => {
    if (!bedtime && !wake) return;
    try {
      const raw = localStorage.getItem(`dr-melani-sleep-v1:${dayIso}`);
      if (raw) {
        const prev = JSON.parse(raw) as { bedtime?: string; wake?: string };
        if (prev.bedtime === bedtime && prev.wake === wake) return;
      }
    } catch {
      /* write through */
    }
    saveSleepDay(dayIso, bedtime, wake);
    notifyHabitAutoSync(dayIso);
  }, [bedtime, wake, dayIso]);

  // Fog: setTodayFog already persists — do not re-save entire map every render tick

  // Whoop import → light refresh (skip full re-sync of every night unless import changed times)
  useEffect(() => {
    const onWhoop = () => {
      syncAllWhoopSleepToSleepStore();
      const r = resolveSleepForDay(dayIso);
      setBedtime(r.bedtime);
      setWake(r.wake);
      setWhoop(loadWhoopDay(dayIso));
      setNightsTick((t) => t + 1);
      setWhoopStoreTick((t) => t + 1);
    };
    window.addEventListener(WHOOP_EVENT, onWhoop);
    return () => window.removeEventListener(WHOOP_EVENT, onWhoop);
  }, [dayIso]);

  useEffect(() => {
    const refresh = (event: Event) => {
      const domain = (event as CustomEvent<{ domain?: string }>).detail?.domain;
      if (domain !== "sleep" && domain !== "brainFog") return;
      const r = resolveSleepForDay(dayIso);
      setBedtime(r.bedtime);
      setWake(r.wake);
      setFogMap(loadFogMap());
    };
    window.addEventListener(MEL_DATA_EVENT, refresh);
    return () => window.removeEventListener(MEL_DATA_EVENT, refresh);
  }, [dayIso]);

  // Global key **U** undoes brain-fog / sleep saves — rehydrate UI
  useEffect(() => {
    const onFog = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, boolean>>).detail;
      if (detail && typeof detail === "object") {
        seedFogUndoBaseline(detail);
        setFogMap(detail);
      } else {
        const map = loadFogMap();
        seedFogUndoBaseline(map);
        setFogMap(map);
      }
    };
    const onSleep = (event: Event) => {
      const iso =
        (event as CustomEvent<{ iso?: string }>).detail?.iso || dayIso;
      const sleep = resolveSleepForDay(iso);
      if (iso === dayIso) {
        setBedtime(sleep.bedtime);
        setWake(sleep.wake);
      }
    };
    window.addEventListener(FOG_EXTERNAL_RESTORE_EVENT, onFog);
    window.addEventListener(SLEEP_EXTERNAL_RESTORE_EVENT, onSleep);
    return () => {
      window.removeEventListener(FOG_EXTERNAL_RESTORE_EVENT, onFog);
      window.removeEventListener(SLEEP_EXTERNAL_RESTORE_EVENT, onSleep);
    };
  }, [dayIso]);

  return (
    /* Wide screens put sleep + brain fog side by side; chart under both */
    <div className="fx-sleep-spread">
      {/* No "SLEEP" heading — subnav already says Sleep. Weight lives on Gym. */}
      {whoop && (whoop.sleepScore != null || whoop.sleepHours != null) ? (
        <section className="fx-section fx-section-sleep" aria-label="Tonight sleep from Whoop">
          <div className="fx-whoop-metrics">
            {whoop.sleepScore != null ? (
              <p className="fx-line">
                <span className="fx-key">Sleep score:</span>
                <span className="fx-val">{Math.round(whoop.sleepScore)}%</span>
              </p>
            ) : null}
            {whoop.sleepHours != null ? (
              <p className="fx-line">
                <span className="fx-key">Asleep:</span>
                <span className="fx-val">{whoop.sleepHours} h</span>
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="fx-section fx-bf-section" aria-label="Brain fog">
        <h2 className="fx-h2">BRAIN FOG</h2>
        <div
          className="fx-bf-btns"
          role="group"
          aria-label={
            fogWritable
              ? "Brain fog today — change freely until 11:59 PM"
              : "Brain fog locked for today"
          }
        >
          <button
            type="button"
            className={`fx-bf-tap fx-bf-yes${todayFogYes ? " is-on" : ""}${
              !fogWritable ? " is-locked" : ""
            }`}
            aria-pressed={todayFogYes}
            disabled={!fogWritable}
            title={
              fogWritable
                ? "Had fog today — you can switch until 11:59 PM"
                : "Locked at 11:59 PM — final for this day"
            }
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setTodayFog(true);
            }}
          >
            Yes
          </button>
          <button
            type="button"
            className={`fx-bf-tap fx-bf-no${todayFogNo ? " is-on" : ""}${
              !fogWritable ? " is-locked" : ""
            }`}
            aria-pressed={todayFogNo}
            disabled={!fogWritable}
            title={
              fogWritable
                ? "No fog today — you can switch until 11:59 PM"
                : "Locked at 11:59 PM — final for this day"
            }
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setTodayFog(false);
            }}
          >
            No
          </button>
        </div>
        <FogDayClock dayIso={dayIso} onWritableChange={onFogWritableChange} />
        {/* Lifetime pie — not a week row; n = all days ever logged */}
        <button
          type="button"
          className="fx-bf-life-toggle"
          aria-expanded={fogPieOpen}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setFogPieOpen((o) => !o);
          }}
        >
          Lifetime · n = {fogLife.n}
          {fogLife.n > 0
            ? ` · yes ${fogLife.yes} · no ${fogLife.no}`
            : ""}
        </button>
        {fogPieOpen ? (
          <BrainFogLifetimePie yes={fogLife.yes} no={fogLife.no} />
        ) : null}
      </section>

      {/* Whoop trends — titled sections (Sleep · Overnight · Body signals) */}
      {sleepPageSections.length > 0 ? (
        <section className="fx-section fx-sleep-whoop-graphs" aria-label="Sleep graphs">
          <div className="wx wx-on-sleep">
            {sleepPageSections.map((sec, i) => (
              <div
                key={sec.title}
                className={`wx-metric-section${i === 0 ? " is-first" : ""}`}
              >
                <h3 className="wx-h">{sec.title}</h3>
                <div className="wx-panel-stack">
                  {sec.metrics.map((m) => (
                    <MetricGraphPanel
                      key={m.key}
                      series={m}
                      onOpenExplain={() => setExplainKey(m.key)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
          {explainSeries ? (
            <MetricExplainModal
              series={explainSeries}
              onClose={() => setExplainKey(null)}
            />
          ) : null}
        </section>
      ) : null}

      {/* Bottom: every night log + quiet weekly CSV import (no Whoop page) */}
      <footer className="fx-nights-footer">
        {nights.length > 0 ? (
          <>
            <button
              type="button"
              className={`fx-nights-toggle${nightsOpen ? " is-open" : ""}`}
              aria-expanded={nightsOpen}
              onClick={() => setNightsOpen((o) => !o)}
            >
              every night logged
              <span className="fx-nights-count">{nights.length}</span>
            </button>
            {nightsOpen ? (
              <div className="fx-sleep-nights-list" role="list">
                {nights.map((n) => (
                  <button
                    key={n.day}
                    type="button"
                    className={`fx-sleep-night${n.day === dayIso ? " is-active" : ""}`}
                    onClick={() => setDayIso(n.day)}
                  >
                    <span className="fx-sleep-night-day">
                      {(() => {
                        const parts = n.day.split("-").map(Number);
                        return `${parts[1]}/${parts[2]}`;
                      })()}
                    </span>
                    <span className="fx-sleep-night-span">
                      {formatHm12(n.bedtime)} - {formatHm12(n.wake)}
                    </span>
                    <span className="fx-sleep-night-h">
                      {n.hours != null ? `${n.hours}h` : "—"}
                      {n.score != null ? ` · ${Math.round(n.score)}%` : ""}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </>
        ) : null}
        <div className="fx-whoop-import">
          <button
            type="button"
            className="fx-whoop-import-btn"
            disabled={whoopImportBusy}
            onClick={() => whoopFileRef.current?.click()}
          >
            {whoopImportBusy ? "Importing…" : "Import weekly data"}
          </button>
          <input
            ref={whoopFileRef}
            type="file"
            accept=".csv,text/csv,.txt"
            multiple
            hidden
            onChange={(e) => void onWhoopFiles(e.target.files)}
          />
        </div>
      </footer>
    </div>
  );
}

// Single food ledger = nutritionStore (item rows). Legacy key is mirrored for twin/brief.
type MacroBag = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
};

type UsualDayLog = {
  loggedIds: string[];
  totals: MacroBag;
};

function emptyMacros(): MacroBag {
  return { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 };
}

/** Read day from nutrition item ledger (source of truth). */
function loadUsualDay(day: string): UsualDayLog {
  try {
    const entries = loadNutriDay(day);
    const t = nutriTotalsFor(day);
    const loggedIds = [
      ...new Set(
        entries.map((e) => e.presetId || e.id).filter(Boolean) as string[]
      ),
    ];
    return {
      loggedIds,
      totals: {
        calories: Math.round(t.calories),
        protein_g: Math.round(t.protein_g * 10) / 10,
        carbs_g: Math.round(t.carbs_g * 10) / 10,
        fat_g: Math.round(t.fat_g * 10) / 10,
        fiber_g: Math.round(t.fiber_g * 10) / 10,
      },
    };
  } catch {
    return { loggedIds: [], totals: emptyMacros() };
  }
}

function shiftIsoDay(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + delta);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function shortIsoLabel(iso: string): string {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return iso;
  return `${Number(match[2])}/${Number(match[3])}`;
}

function mealNames(entries: NutriEntry[]): string {
  if (!entries.length) return "No food logged yet";
  return entries
    .slice(0, 4)
    .map((e) => e.name)
    .join(" · ")
    .concat(entries.length > 4 ? ` · +${entries.length - 4} more` : "");
}

function mealAuditLine(day: string): string {
  const entries = loadNutriDay(day);
  const totals = nutriTotalsFor(day);
  return `${shortIsoLabel(day)} · ${Math.round(totals.calories)} cal · ${Math.round(
    totals.fiber_g * 10
  ) / 10}g fiber · ${mealNames(entries)}`;
}

function waterAuditLine(day: string): string {
  const ml = loadWater(day);
  const drinks = loadWaterHist(day).length;
  const liters = Math.round((ml / 1000) * 10) / 10;
  return `${shortIsoLabel(day)} · ${liters}L${drinks ? ` · ${drinks} water taps` : ""}`;
}

function sleepAuditLine(day: string): string {
  const sleep = resolveSleepForDay(day);
  if (sleep.hours == null) return `${shortIsoLabel(day)} · no sleep logged`;
  return `${shortIsoLabel(day)} · ${Math.round(sleep.hours * 10) / 10}h sleep · ${sleep.source}`;
}

function activityAuditLine(day: string): string {
  const whoop = loadWhoopDay(day);
  const workouts = whoop?.workouts || [];
  const workoutBits = workouts
    .slice(0, 2)
    .map((w) =>
      [
        w.activity,
        w.durationMin != null ? `${Math.round(w.durationMin)}m` : null,
        w.strain != null ? `strain ${Math.round(w.strain * 10) / 10}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    );
  const bodyBits = [
    whoop?.strain != null ? `day strain ${Math.round(whoop.strain * 10) / 10}` : null,
    whoop?.recoveryPct != null ? `recovery ${Math.round(whoop.recoveryPct)}%` : null,
  ].filter(Boolean);
  const bits = [...workoutBits, ...bodyBits];
  return `${shortIsoLabel(day)} · ${bits.length ? bits.join(" · ") : "no workout/strain logged"}`;
}

type BowelAudit = {
  tone: "hard" | "loose";
  title: string;
  summary: string;
  suspects: string[];
  checks: { label: string; value: string }[];
  experiment: string[];
};

function buildBowelAudit(day: string, look: BowelLook | undefined): BowelAudit | null {
  if (look == null || (look >= 3 && look <= 5)) return null;
  const yesterday = shiftIsoDay(day, -1);
  const todayTotals = nutriTotalsFor(day);
  const yesterdayTotals = nutriTotalsFor(yesterday);
  const todayWater = loadWater(day);
  const yesterdayWater = loadWater(yesterday);
  const todaySleep = resolveSleepForDay(day);
  const yesterdaySleep = resolveSleepForDay(yesterday);
  const todayWhoop = loadWhoopDay(day);
  const yesterdayWhoop = loadWhoopDay(yesterday);
  const hard = look <= 2;

  const suspects: string[] = [];
  if (hard) {
    if (todayWater < 2500 && yesterdayWater < 2500) {
      suspects.push("Water looks low across today/yesterday, so stool may have dried out.");
    }
    if (todayTotals.fiber_g < 18 && yesterdayTotals.fiber_g < 18) {
      suspects.push("Fiber looks low in the logged meals, which can slow transit.");
    }
    if ((todaySleep.hours ?? 8) < 7 || (yesterdaySleep.hours ?? 8) < 7) {
      suspects.push("Short sleep can mess with gut rhythm and morning movement.");
    }
  } else {
    if (todayTotals.fiber_g < 15 || yesterdayTotals.fiber_g < 15) {
      suspects.push("Logged fiber is light, so stool may be less formed.");
    }
    if ((todayWhoop?.strain ?? 0) >= 12 || (yesterdayWhoop?.strain ?? 0) >= 12) {
      suspects.push("High strain/training can push stress chemistry and gut speed.");
    }
    if ((todaySleep.hours ?? 8) < 7 || (yesterdaySleep.hours ?? 8) < 7) {
      suspects.push("Short sleep is a plausible fast-transit trigger.");
    }
  }
  if (!loadNutriDay(day).length && !loadNutriDay(yesterday).length) {
    suspects.push("No meals are logged yet, so Wonder cannot explain the food side.");
  }
  if (!suspects.length) {
    suspects.push(
      hard
        ? "No obvious single cause in the logs yet — run one variable at a time."
        : "No obvious single cause in the logs yet — treat it as a trigger hunt, not proof."
    );
  }

  return {
    tone: hard ? "hard" : "loose",
    title: hard ? "Type outside 3–5: slow-transit audit" : "Type outside 3–5: fast-transit audit",
    summary: hard
      ? "We’re checking hydration, fiber, sleep, and movement before guessing."
      : "We’re checking food changes, sleep, stress/strain, and hydration before guessing.",
    suspects,
    checks: [
      { label: "Food", value: `${mealAuditLine(yesterday)} / ${mealAuditLine(day)}` },
      { label: "Water", value: `${waterAuditLine(yesterday)} / ${waterAuditLine(day)}` },
      { label: "Sleep", value: `${sleepAuditLine(yesterday)} / ${sleepAuditLine(day)}` },
      { label: "Activity", value: `${activityAuditLine(yesterday)} / ${activityAuditLine(day)}` },
    ],
    experiment: hard
      ? [
          "Tomorrow: hit 3.5L water, add a real fiber anchor, and walk 10 minutes.",
          "Keep the rest normal so we can tell if fiber + water moved Type 1/2 toward 3–4.",
        ]
      : [
          "Next 24h: keep food simple, hydrate, and avoid surprise spicy/greasy/dairy-heavy changes.",
          "If it repeats, compare the exact meals + sleep against the last Type 3–5 day.",
        ],
  };
}

function MealsPanel() {
  // Track calendar day so midnight clears "logged today" and starts a fresh log
  const [day, setDay] = useState(() => todayKey());
  const g = MACRO_GOALS;
  const week = useMemo(() => {
    const [y, m, d] = day.split("-").map(Number);
    return sleepWeekDays(new Date(y, m - 1, d));
  }, [day]);

  // One-tap usual log — nutritionStore is the single ledger (Mel writes here too)
  const [usualDay, setUsualDay] = useState<UsualDayLog>(() =>
    loadUsualDay(todayKey())
  );
  const [flash, setFlash] = useState("");

  // Mel / NL / snack seed → same rings
  useEffect(() => {
    const refresh = () => setUsualDay(loadUsualDay(day));
    window.addEventListener(NUTRITION_EVENT, refresh);
    window.addEventListener(MEL_DATA_EVENT, refresh);
    return () => {
      window.removeEventListener(NUTRITION_EVENT, refresh);
      window.removeEventListener(MEL_DATA_EVENT, refresh);
    };
  }, [day]);
  // Open "What's in it" when linked with ?details=breakfast (or leave closed)
  const [openDetails, setOpenDetails] = useState<string | null>(() => {
    try {
      const d = new URLSearchParams(window.location.search).get("details");
      if (d === "breakfast" || d === "1") return "breakfast_usual";
    } catch {
      /* ignore */
    }
    return null;
  });

  // Bowel movement (moved from Sleep — body log next to food)
  const [bowelDetail, setBowelDetail] = useState<Record<string, BowelDayLog>>(
    () => {
      // One-shot: apply explicit missed-day corrections (e.g. Sunday = No)
      // + merge recovered archive so wiped browser profiles get history back
      applyPendingBowelCorrections();
      const map = loadBowelDetailMap();
      seedBowelDetailUndoBaseline(map);
      seedBowelUndoBaseline(loadBowelMap());
      return map;
    }
  );

  // Pull ~/.wonder/local bowel mirror (merge-only) — survives profile swaps
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(
          "/api/wonder-state?key=dr-melani-bowel-detail-v1"
        );
        if (!res.ok) return;
        const body = (await res.json()) as {
          value?: Record<string, BowelDayLog> | null;
        };
        if (!body.value || typeof body.value !== "object") return;
        // save merges richer; then reload UI
        saveBowelDetailMap(body.value);
        const next = loadBowelDetailMap();
        setBowelDetail(next);
        seedBowelDetailUndoBaseline(next);
        seedBowelUndoBaseline(loadBowelMap());
      } catch {
        /* offline */
      }
    })();
  }, []);
  const [bowelTypesOpen, setBowelTypesOpen] = useState(false);
  /** Graphs closed by default — open via “logged days” toggle (like sleep nights). */
  const [bowelLogsOpen, setBowelLogsOpen] = useState(false);
  /** Bristol types graph nested under the same toggle */
  const [bowelPieOpen, setBowelPieOpen] = useState(true);
  const todayLog = bowelDetail[day];
  const todayBowel = todayLog?.had === true;
  const todayBowelNo = todayLog?.had === false;
  const selectedBowelLook = todayBowel && todayLog?.look ? todayLog.look : undefined;
  const bowelConsistency = useMemo(() => {
    let yes = 0;
    let no = 0;
    const points = Object.entries(bowelDetail)
      .filter(([, log]) => log?.had === true || log?.had === false)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([loggedDay, log]) => {
        const logged = log!.had === true ? "yes" : "no";
        if (logged === "yes") yes += 1;
        else no += 1;
        return {
          day: loggedDay,
          yes,
          no,
          logged,
          look: log!.had === true ? log!.look : undefined,
        } satisfies BowelConsistencyPoint;
      });
    return { points, yes, no };
  }, [bowelDetail]);
  // Lifetime type tallies + cumulative multi-line series (one line per type)
  const bristolLife = useMemo(() => {
    const counts: Record<BristolType, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
      6: 0,
      7: 0,
    };
    const days = Object.entries(bowelDetail)
      .filter(
        ([, log]) =>
          log?.had === true &&
          log.look != null &&
          log.look >= 1 &&
          log.look <= 7
      )
      .map(([day, log]) => ({ day, look: log!.look as BristolType }))
      .sort((a, b) => a.day.localeCompare(b.day));

    const series: { day: string; byType: Record<BristolType, number> }[] = [];
    for (const { day, look } of days) {
      counts[look] += 1;
      series.push({
        day,
        byType: {
          1: counts[1],
          2: counts[2],
          3: counts[3],
          4: counts[4],
          5: counts[5],
          6: counts[6],
          7: counts[7],
        },
      });
    }
    const n = days.length;
    return { counts, n, series };
  }, [bowelDetail]);

  function patchBowel(patch: Partial<BowelDayLog> & { had: boolean }) {
    const next = upsertBowelDay(day, patch, "ui");
    setBowelDetail((m) => ({ ...m, [day]: next }));
    if (patch.had === false) setBowelTypesOpen(false);
    else if (patch.look != null) setBowelTypesOpen(false);
    else if (patch.had === true) setBowelTypesOpen(true);
  }

  function setTodayBowel(had: boolean) {
    patchBowel({ had });
  }

  // New day → load that day's meals (empty if nothing logged yet)
  useEffect(() => {
    function roll() {
      const now = todayKey();
      if (now === day) return;
      setDay(now);
      setUsualDay(loadUsualDay(now));
      setBowelTypesOpen(false);
    }
    roll();
    const id = window.setInterval(roll, 20_000);
    window.addEventListener("focus", roll);
    document.addEventListener("visibilitychange", roll);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", roll);
      document.removeEventListener("visibilitychange", roll);
    };
  }, [day]);

  // One-shot: log Pocky / pomegranate / cherries into nutrition + meals totals
  useEffect(() => {
    void applyPendingSnackSeed().then((next) => {
      if (next) {
        setUsualDay(loadUsualDay(todayKey()));
        setFlash("Logged snacks: 2× Pocky · pomegranate · cherries (~998 cal)");
        window.setTimeout(() => setFlash(""), 4000);
      }
    });
  }, []);

  useEffect(() => {
    const refresh = (event: Event) => {
      const domain = (event as CustomEvent<{ domain?: string }>).detail?.domain;
      if (domain === "meals") setUsualDay(loadUsualDay(day));
      if (domain === "bowel") setBowelDetail(loadBowelDetailMap());
    };
    window.addEventListener(MEL_DATA_EVENT, refresh);
    return () => window.removeEventListener(MEL_DATA_EVENT, refresh);
  }, [day]);

  useEffect(() => {
    const onYn = () => {
      setBowelDetail(loadBowelDetailMap());
      seedBowelUndoBaseline(loadBowelMap());
    };
    const onDetail = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, BowelDayLog>>).detail;
      if (detail && typeof detail === "object") {
        setBowelDetail(detail);
        seedBowelDetailUndoBaseline(detail);
      } else {
        const map = loadBowelDetailMap();
        setBowelDetail(map);
        seedBowelDetailUndoBaseline(map);
      }
    };
    window.addEventListener(BOWEL_EXTERNAL_RESTORE_EVENT, onYn);
    window.addEventListener(BOWEL_DETAIL_RESTORE_EVENT, onDetail);
    return () => {
      window.removeEventListener(BOWEL_EXTERNAL_RESTORE_EVENT, onYn);
      window.removeEventListener(BOWEL_DETAIL_RESTORE_EVENT, onDetail);
    };
  }, []);

  const c = usualDay.totals;
  const p = {
    calories: pct(c.calories, g.calories),
    protein_g: pct(c.protein_g, g.protein_g),
    carbs_g: pct(c.carbs_g, g.carbs_g),
    fat_g: pct(c.fat_g, g.fat_g),
    fiber_g: pct(c.fiber_g, g.fiber_g),
  };
  const off = (circ: number, percent: number) =>
    (circ * (1 - percent / 100)).toFixed(2);

  // Keep day log for usual meal checkmarks (no OTHER/SNACK row anymore)
  const [, setLog] = useState<DayLog>(() => loadDayLog(day));

  function patch(id: string, next: Partial<ConsumeLog>) {
    setLog((prev) => {
      const cur = prev[id] || { done: false, time: "" };
      const merged = { ...cur, ...next };
      const out = { ...prev, [id]: merged };
      saveDayLog(day, out);
      return out;
    });
  }

  /** Log a usual meal once → nutritionStore (Mel uses the same path) */
  function logUsual(presetId: string) {
    const preset = MEAL_PRESETS.find((m) => m.id === presetId);
    if (!preset) return;
    if (loadNutriDay(day).some((e) => e.presetId === presetId)) {
      setFlash("Already logged today");
      window.setTimeout(() => setFlash(""), 1600);
      return;
    }
    const slot =
      /breakfast/i.test(preset.id) || /breakfast/i.test(preset.title)
        ? "breakfast"
        : /lunch/i.test(preset.id)
          ? "lunch"
          : /dinner/i.test(preset.id)
            ? "dinner"
            : "snack";
    addEntry(
      {
        slot,
        name: preset.title,
        grams: 0,
        qtyLabel: "Usual meal",
        macros: {
          calories: preset.calories,
          protein_g: preset.protein_g,
          carbs_g: preset.carbs_g,
          fat_g: preset.fat_g,
          fiber_g: preset.fiber_g,
        },
        presetId: preset.id,
        source: "preset",
      },
      day
    );
    setUsualDay(loadUsualDay(day));
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    patch(`meal-${presetId}`, { done: true, time: `${hh}:${mm}` });
    notifyHabitAutoSync(day);
    setFlash(`Logged ${preset.title.toLowerCase()} — macros updated`);
    window.setTimeout(() => setFlash(""), 2200);
  }

  /** Undo a usual so you can log again */
  function undoUsual(presetId: string) {
    const preset = MEAL_PRESETS.find((m) => m.id === presetId);
    if (!preset) return;
    const hit = loadNutriDay(day).find((e) => e.presetId === presetId);
    if (!hit) return;
    removeEntry(hit.id, day);
    setUsualDay(loadUsualDay(day));
    patch(`meal-${presetId}`, { done: false });
    notifyHabitAutoSync(day);
    setFlash("Undone");
    window.setTimeout(() => setFlash(""), 1400);
  }

  return (
    <>
      <section className="fx-section">
        <h2 className="fx-h2">TODAY&apos;S MACROS</h2>
        <div className="macro-ring-wrap">
          <svg className="macro-rings" viewBox="0 0 200 200" aria-hidden>
            <circle className="ring-track" cx="100" cy="100" r="88" />
            <circle
              className="ring-cal"
              cx="100"
              cy="100"
              r="88"
              strokeDasharray={CIRC.cal}
              strokeDashoffset={off(CIRC.cal, p.calories)}
            />
            <circle className="ring-track" cx="100" cy="100" r="77" />
            <circle
              className="ring-protein"
              cx="100"
              cy="100"
              r="77"
              strokeDasharray={CIRC.protein}
              strokeDashoffset={off(CIRC.protein, p.protein_g)}
            />
            <circle className="ring-track" cx="100" cy="100" r="66" />
            <circle
              className="ring-carbs"
              cx="100"
              cy="100"
              r="66"
              strokeDasharray={CIRC.carbs}
              strokeDashoffset={off(CIRC.carbs, p.carbs_g)}
            />
            <circle className="ring-track" cx="100" cy="100" r="55" />
            <circle
              className="ring-fat"
              cx="100"
              cy="100"
              r="55"
              strokeDasharray={CIRC.fat}
              strokeDashoffset={off(CIRC.fat, p.fat_g)}
            />
            <circle className="ring-track" cx="100" cy="100" r="44" />
            <circle
              className="ring-fiber"
              cx="100"
              cy="100"
              r="44"
              strokeDasharray={CIRC.fiber}
              strokeDashoffset={off(CIRC.fiber, p.fiber_g)}
            />
            <circle className="ring-hole" cx="100" cy="100" r="32" />
          </svg>
          <div className="macro-ring-center">
            <span className="macro-ring-num">
              {c.protein_g}
              <small>g</small>
            </span>
            <span className="macro-ring-sub">protein</span>
            <span className="macro-ring-goal">of {g.protein_g}g</span>
          </div>
        </div>
        <ul className="macro-stats">
          <li>
            <span className="dot dot-cal" />
            Calories <strong>{c.calories}</strong> / {g.calories}
          </li>
          <li>
            <span className="dot dot-protein" />
            Protein <strong>{c.protein_g}g</strong> / {g.protein_g}g
          </li>
          <li>
            <span className="dot dot-carbs" />
            Carbs <strong>{c.carbs_g}g</strong> / {g.carbs_g}g
          </li>
          <li>
            <span className="dot dot-fat" />
            Fat <strong>{c.fat_g}g</strong> / {g.fat_g}g
          </li>
          <li>
            <span className="dot dot-fiber" />
            Fiber <strong>{c.fiber_g}g</strong> / {g.fiber_g}g
          </li>
        </ul>
      </section>

      {/* Breakfast only — no lunch / dinner / snack clutter for now */}
      <section className="fx-section usuals-section">
        {flash ? <p className="usual-flash">{flash}</p> : null}

        {MEAL_PRESETS.map((u) => {
          const logged = usualDay.loggedIds.includes(u.id);
          const open = openDetails === u.id;
          return (
            <div
              key={u.id}
              className={`usual-card is-breakfast${logged ? " is-logged" : ""}`}
            >
              <h3 className="usual-title">{u.title}</h3>
              <p className="usual-macro-line">
                {u.calories} cal · {u.protein_g}g protein · {u.carbs_g}g C ·{" "}
                {u.fat_g}g F
              </p>

              {logged ? (
                <div className="usual-logged-row">
                  <span className="usual-logged-label">Logged today ✓</span>
                  <button
                    type="button"
                    className="usual-undo-btn"
                    onClick={() => undoUsual(u.id)}
                  >
                    Undo
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="usual-log-btn"
                  onClick={() => logUsual(u.id)}
                >
                  Log breakfast today
                </button>
              )}

              <button
                type="button"
                className="usual-details-toggle"
                aria-expanded={open}
                onClick={() =>
                  setOpenDetails((cur) => (cur === u.id ? null : u.id))
                }
              >
                {open ? "▾" : "▸"} What&apos;s in it
              </button>
              {open && (
                <div className="usual-details">
                  {u.notes ? <p className="usual-notes">{u.notes}</p> : null}
                  {u.sections && u.sections.length > 0 ? (
                    u.sections.map((sec, si) => (
                      <div key={sec.title || `sec-${si}`} className="usual-sec">
                        {sec.title ? (
                          <p className="usual-sec-title">{sec.title}</p>
                        ) : null}
                        <ul className="usual-ingredients">
                          {sec.items.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ))
                  ) : (
                    <ul className="usual-ingredients">
                      {u.ingredients.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </section>

      <WaterTracker day={day} />
      <SupplementsList day={day} />

      {/*
        BOWEL — on Meals (body/digestion next to food).
        Only *today* is writable; week strip is history.
      */}
      <section className="fx-section fx-bowel">
        <div className="fx-bowel-head">
          <h2 className="fx-h2">BOWEL MOVEMENT</h2>
        </div>

        <div className="fx-bf-btns" role="group" aria-label="Bowel movement today only">
          <button
            type="button"
            className={`fx-bf-tap fx-bm-yes${todayBowel ? " is-on" : ""}`}
            aria-pressed={todayBowel}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setTodayBowel(true);
            }}
          >
            Yes
          </button>
          <button
            type="button"
            className={`fx-bf-tap fx-bm-no${todayBowelNo ? " is-on" : ""}`}
            aria-pressed={todayBowelNo}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setTodayBowel(false);
            }}
          >
            No
          </button>
        </div>

        <div
          className="fx-bf-week fx-bm-week-ro"
          role="list"
          aria-label="Bowel this week (history only)"
        >
          {week.map((d) => {
            const log = bowelDetail[d.iso];
            const isYes = log?.had === true;
            const isNo = log?.had === false;
            const isToday = d.iso === day;
            const isFuture = d.iso > day;
            const title = isFuture
              ? `${d.label}: not open yet`
              : isYes
                ? `${d.label}: Type ${log?.look ?? "yes"} (locked)`
                : isNo
                  ? `${d.label}: No (locked)`
                  : isToday
                    ? `${d.label}: today — use Yes / No above`
                    : `${d.label}: not logged`;
            return (
              <span
                key={d.iso}
                role="listitem"
                className={`fx-bf-day fx-bm-day-ro${isYes ? " is-bm" : ""}${
                  isNo ? " is-bm-no" : ""
                }${isToday ? " is-today" : ""}${isFuture ? " is-future" : ""}`}
                title={title}
              >
                {d.short[0]}
                {isYes && log?.look != null ? (
                  <span className="fx-bm-week-type">{log.look}</span>
                ) : null}
              </span>
            );
          })}
        </div>
        {/* Type picker only after Yes — keeps the surface minimal */}
        {todayBowel ? (
          <div className="fx-bm-details">
            {!bowelTypesOpen ? (
              <div className="fx-bm-closed-row">
                <p className="fx-bm-type-hint" aria-live="polite">
                  {todayLog?.look != null
                    ? `Type ${todayLog.look} saved`
                    : "Yes logged — pick type"}
                </p>
                <button
                  type="button"
                  className="fx-bm-toggle"
                  onClick={() => setBowelTypesOpen(true)}
                >
                  {todayLog?.look != null ? "Change type" : "Pick type"}
                </button>
              </div>
            ) : (
              <>
                <div className="fx-bm-closed-row">
                  <p className="fx-bm-type-hint" aria-live="polite">
                    {todayLog?.look != null
                      ? `Type ${todayLog.look} — tap to change`
                      : "Tap a type (1–7)"}
                  </p>
                  <button
                    type="button"
                    className="fx-bm-toggle"
                    onClick={() => setBowelTypesOpen(false)}
                  >
                    Done
                  </button>
                </div>
                <div
                  className="fx-bm-pills"
                  role="listbox"
                  aria-label="Bristol type for today"
                >
                  {BOWEL_LOOK_GUIDE.map((g) => {
                    const isLogged = todayLog?.look === g.look;
                    return (
                      <div
                        key={g.look}
                        className={`fx-bm-chip${isLogged ? " is-on" : ""}`}
                      >
                        <button
                          type="button"
                          className="fx-bm-chip-btn"
                          role="option"
                          aria-selected={isLogged}
                          onClick={() =>
                            patchBowel({
                              had: true,
                              look: g.look as BowelLook,
                            })
                          }
                        >
                          <span className="fx-bm-pill-n">{g.look}</span>
                          <span className="fx-bm-pill-art" aria-hidden>
                            <BowelLookIcon look={g.look} />
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        ) : null}

        {/*
          Graphs hidden until toggle — same pattern as sleep “every night logged”.
          Big charts only when you ask; count stays conspicuous.
        */}
        <footer className="fx-bm-logs-footer">
          <button
            type="button"
            className={`fx-nights-toggle fx-bm-nights-toggle${
              bowelLogsOpen ? " is-open" : ""
            }`}
            aria-expanded={bowelLogsOpen}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setBowelLogsOpen((open) => !open);
            }}
          >
            bowel days logged
            <span className="fx-nights-count">
              {bowelConsistency.yes + bowelConsistency.no}
            </span>
          </button>
          {bowelLogsOpen ? (
            <div className="fx-bm-logs-panel">
              <BowelConsistencyGraph
                points={bowelConsistency.points}
                yes={bowelConsistency.yes}
                no={bowelConsistency.no}
              />
              <p className="fx-bm-graph-goal">
                Goal: Yes climbs · No stays flat.
              </p>
              <button
                type="button"
                className="fx-bf-life-toggle"
                aria-expanded={bowelPieOpen}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setBowelPieOpen((o) => !o);
                }}
              >
                types · n = {bristolLife.n}
                {bristolLife.n > 0
                  ? ` · ${([1, 2, 3, 4, 5, 6, 7] as const)
                      .filter((t) => bristolLife.counts[t] > 0)
                      .map((t) => `${t}×${bristolLife.counts[t]}`)
                      .join(" · ")}`
                  : ""}
              </button>
              {bowelPieOpen ? (
                <BowelBristolLifetimeGraph
                  series={bristolLife.series}
                  counts={bristolLife.counts}
                  n={bristolLife.n}
                />
              ) : null}
            </div>
          ) : null}
        </footer>
      </section>
    </>
  );
}

// Goal matches Habits “3.5L water + Diet” (shared with habitAutoSync)
const WATER_ADDS = [
  { ml: 250, label: "+250 ml" },
  { ml: 500, label: "+500 ml" },
  { ml: 1000, label: "+1 L" },
] as const;

const WATER_KEY = "dr-melani-water-ml";
const WATER_HIST_KEY = "dr-melani-water-hist";

function loadWater(day: string): number {
  try {
    const raw = localStorage.getItem(`${WATER_KEY}:${day}`);
    if (raw) return Math.max(0, Number(raw) || 0);
  } catch {
    /* ignore */
  }
  return 0;
}

function saveWater(day: string, ml: number) {
  try {
    localStorage.setItem(`${WATER_KEY}:${day}`, String(ml));
  } catch {
    /* ignore */
  }
  // Habits ↔ water: bar at 3.5 L checks “3.5L water + Diet”; habit check fills bar
  notifyHabitAutoSync(day);
  try {
    window.dispatchEvent(
      new CustomEvent(MEL_DATA_EVENT, { detail: { domain: "water", day } })
    );
  } catch {
    /* ignore */
  }
}

function loadWaterHist(day: string): number[] {
  try {
    const raw = localStorage.getItem(`${WATER_HIST_KEY}:${day}`);
    if (raw) return JSON.parse(raw) as number[];
  } catch {
    /* ignore */
  }
  return [];
}

function saveWaterHist(day: string, hist: number[]) {
  try {
    localStorage.setItem(`${WATER_HIST_KEY}:${day}`, JSON.stringify(hist));
  } catch {
    /* ignore */
  }
}

/** Water like Melani: bar + plain text adds (no underlines, no boxes) */
function WaterTracker({ day }: { day: string }) {
  const [ml, setMl] = useState(() => loadWater(day));
  const [hist, setHist] = useState<number[]>(() => loadWaterHist(day));
  const goal = WATER_GOAL_ML; // 3.5 L — same as Habits water goal
  const liters = (ml / 1000).toFixed(1);
  const goalL = (goal / 1000).toFixed(1); // 3.5
  const pctFill = Math.min(100, Math.round((ml / goal) * 100));

  useEffect(() => {
    setMl(loadWater(day));
    setHist(loadWaterHist(day));
  }, [day]);

  useEffect(() => {
    const refresh = (event: Event) => {
      const domain = (event as CustomEvent<{ domain?: string }>).detail?.domain;
      if (domain !== "water") return;
      setMl(loadWater(day));
      setHist(loadWaterHist(day));
    };
    // Habit check fills water → same event; also re-sync if habits grid changes
    window.addEventListener(MEL_DATA_EVENT, refresh);
    window.addEventListener("wonder-habits-update", refresh);
    return () => {
      window.removeEventListener(MEL_DATA_EVENT, refresh);
      window.removeEventListener("wonder-habits-update", refresh);
    };
  }, [day]);

  function add(amount: number) {
    setMl((prev) => {
      const next = Math.min(goal, prev + amount);
      const added = next - prev;
      if (added > 0) {
        setHist((h) => {
          const nh = [...h, added];
          saveWaterHist(day, nh);
          return nh;
        });
      }
      saveWater(day, next);
      return next;
    });
  }

  function undoLast() {
    setHist((h) => {
      if (!h.length) return h;
      const last = h[h.length - 1];
      const rest = h.slice(0, -1);
      setMl((prev) => {
        const next = Math.max(0, prev - last);
        saveWater(day, next);
        return next;
      });
      saveWaterHist(day, rest);
      return rest;
    });
  }

  function reset() {
    setMl(0);
    setHist([]);
    saveWater(day, 0);
    saveWaterHist(day, []);
  }

  return (
    <section className="fx-section fx-water">
      <h2 className="fx-h2 fx-water-title">
        Water — {liters} / {goalL} L
      </h2>
      <div className="fx-water-bar" aria-hidden>
        <div className="fx-water-fill" style={{ width: `${pctFill}%` }} />
      </div>
      <div className="fx-water-btns">
        {WATER_ADDS.map((b) => (
          <button
            key={b.ml}
            type="button"
            className="fx-water-btn"
            onClick={() => add(b.ml)}
            disabled={ml >= goal}
          >
            {b.label}
          </button>
        ))}
      </div>
      <div className="fx-water-actions">
        <button
          type="button"
          className="fx-water-action"
          onClick={undoLast}
          disabled={!hist.length}
        >
          Undo last
        </button>
        <button
          type="button"
          className="fx-water-action"
          onClick={reset}
          disabled={ml <= 0}
        >
          Reset today
        </button>
      </div>
    </section>
  );
}

const SUP_KEY = "dr-melani-supplements-done";

function loadSupDone(day: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(`${SUP_KEY}:${day}`);
    if (raw) return JSON.parse(raw) as Record<string, boolean>;
  } catch {
    /* ignore */
  }
  return {};
}

function saveSupDone(day: string, map: Record<string, boolean>) {
  try {
    localStorage.setItem(`${SUP_KEY}:${day}`, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/** Supplements: name (pink) · brand (gold) · when to take (gold) — tap to cross out */
function SupplementsList({ day }: { day: string }) {
  const [done, setDone] = useState(() => loadSupDone(day));

  useEffect(() => {
    const refresh = (event: Event) => {
      const domain = (event as CustomEvent<{ domain?: string }>).detail?.domain;
      if (domain === "supplements") setDone(loadSupDone(day));
    };
    window.addEventListener(MEL_DATA_EVENT, refresh);
    return () => window.removeEventListener(MEL_DATA_EVENT, refresh);
  }, [day]);

  function toggle(id: string) {
    setDone((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      saveSupDone(day, next);
      return next;
    });
  }

  return (
    <section className="fx-section fx-supps">
      <h2 className="fx-h2">Supplements</h2>
      <ol className="fx-supp-list">
        {DAILY_SUPPLEMENTS.map((s, i) => {
          const isDone = !!done[s.id];
          return (
            <li key={s.id}>
              <button
                type="button"
                className={`fx-supp-item${isDone ? " is-done" : ""}`}
                onClick={() => toggle(s.id)}
              >
                <span className="fx-supp-num">{i + 1}.</span>
                <span className="fx-supp-body">
                  <span className="fx-supp-name">{s.name}</span>
                  {s.dose ? (
                    <span className="fx-supp-when"> · {s.dose}</span>
                  ) : null}
                  {s.when ? (
                    <span className="fx-supp-when"> · {s.when}</span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function GymPanel() {
  // Full Melani gym: warm-up, plans, sets, rest timer
  return <GymExact />;
}

function FocusPanel() {
  // Mac/app focus hours — mental load, not "mental health" branding
  return <ScreenTime />;
}

type Props = {
  pageId: string;
  onGo: (id: string) => void;
};

const TAB_TO_PAGE: Record<FitnessTab, string> = {
  sleep: "pg-sleep",
  meals: "pg-meals",
  gym: "pg-gym",
  focus: "pg-focus",
};

export function FitnessExact({ pageId, onGo }: Props) {
  const tab = useMemo(() => tabFromPageId(pageId), [pageId]);

  // Legacy routes → canonical Fitness tabs
  useEffect(() => {
    if (pageId === "pg-whoop" || pageId === "pg-body") {
      onGo("pg-sleep");
    }
    if (pageId === "pg-screentime" || pageId === "pg-screen-time") {
      onGo("pg-focus");
    }
  }, [pageId, onGo]);

  function selectTab(t: FitnessTab) {
    onGo(TAB_TO_PAGE[t]);
  }

  const { quote, remaining, limit, msUntilReset, nextQuote } =
    useQuoteRotation();

  return (
    <div className="fx-page">
      <div className="fx-inner">
        <div className="fx-quote">
          <div className="fx-quote-copy">
            <p className="fx-quote-text">“{quote.text}”</p>
            <p className="fx-quote-author">{quote.source}</p>
          </div>
          <QuoteRefreshControl
            remaining={remaining}
            limit={limit}
            msUntilReset={msUntilReset}
            onChange={nextQuote}
            className="fx-quote-refresh"
          />
        </div>

        {/* Sleep · Meals · Gym · Focus */}
        <nav className="fx-subnav" aria-label="Fitness pages">
          {(
            [
              ["sleep", "Sleep"],
              ["meals", "Meals"],
              ["gym", "Gym"],
              ["focus", "Focus"],
            ] as const
          ).map(([id, label]) => (
            <span key={id} className="fx-subnav-item">
              <button
                type="button"
                className={`fx-subnav-link${tab === id ? " is-active" : ""}`}
                onClick={() => selectTab(id)}
              >
                {label}
              </button>
            </span>
          ))}
        </nav>

        {tab === "sleep" && <SleepPanel />}
        {tab === "meals" && <MealsPanel />}
        {tab === "gym" && <GymPanel />}
        {tab === "focus" && <FocusPanel />}
      </div>
    </div>
  );
}

export function isFitnessPage(pageId: string): boolean {
  return [
    "pg-fitness",
    "pg-sleep",
    "pg-meals",
    "pg-gym",
    "pg-focus",
    "pg-screentime", // legacy name → Focus
    "pg-screen-time",
    "pg-body",
    "pg-whoop", // legacy route → redirects to Sleep
  ].includes(pageId);
}

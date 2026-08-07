/**
 * Fitness page — Wonder Fitness (Sleep · Meals · Gym).
 * Focus / Screen Time permanently removed (owner: space for no value).
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  CIRC,
  DAILY_SUPPLEMENTS,
  supplementPackLasts,
  MACRO_GOALS,
  MEAL_PRESETS,
  pct,
  mealShopYearCost,
  shopRunOut,
  sumMeasureMacros,
  macrosMeaningful,
  todayKey,
  loadMealVariantId,
  saveMealVariantId,
  resolveMealPreset,
  VITAMIN_GOALS,
  VITAMIN_RING_TRACKS,
  VITAMIN_LIST_EXTRA,
  VITAMIN_DISPLAY_ROWS,
  vitaminTotalsFromLogged,
  vitaminRingAveragePct,
  vitaminsFromMeasures,
  vitaminsMeaningful,
  type ConsumeLog,
  type MealPreset,
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

import { MEL_DATA_EVENT } from "./melTools";
import { notifyHabitAutoSync, WATER_GOAL_ML } from "./habitAutoSync";
import {
  addWaterDrink,
  loadWater,
  loadWaterHist,
  removeWaterDrink,
  saveWater,
  saveWaterHist,
  waterMlFromPreset,
} from "./waterLog";

import {
  importWhoopFromPublicLatest,
  listWhoopSleepNights,
  loadWhoopDay,
  loadWhoopStore,
  resolveSleepForDay,
  syncAllWhoopSleepToSleepStore,
  WHOOP_EVENT,
  type WhoopDay,
} from "./whoopStore";
import { buildWhoopAnalytics } from "./whoopAnalytics";
import { groupMetricsBySection, metricDef } from "./whoopMetrics";
import { MetricExplainModal, MetricGraphPanel } from "./whoopMetricUi";
import { QuoteRefreshControl } from "./QuoteRefreshControl";
import { useQuoteRotation } from "./useQuoteRotation";
import { WhoopCsvDrop } from "./WhoopCsvDrop";
import { FoodPlateGuide } from "./FoodPlateGuide";
// MealCutoutTrack (MEAL FLAGS UI) — permanently removed; do not reintroduce.
// flagDayMeals still feeds the trash can hit highlights only.
import { flagDayMeals } from "./MealCutoutTrack";
import { reportMealCutouts } from "./foodGuide";
import { MealsShop } from "./MealsShop";
import "./fitness-exact.css";
import "./gym-exact.css";
import "./whoop-lab.css";
import "./meal-cutout-track.css";
import "./meals-shop.css";

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

export type FitnessTab = "sleep" | "meals" | "gym";

function tabFromPageId(pageId: string): FitnessTab {
  if (pageId === "pg-meals") return "meals";
  if (pageId === "pg-gym") return "gym";
  // Legacy Focus / Screen Time / Whoop → Sleep (data stays; page is gone)
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
  replaceBowelDetailMap,
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

type BristolSeriesPoint = {
  day: string;
  byType: Record<BristolType, number>;
  /** The one Bristol type logged that day (only one BM type per day). */
  eventType: BristolType;
};

type BowelConsistencyPoint = {
  day: string;
  yes: number;
  no: number;
  logged: "yes" | "no";
  look?: BowelLook;
};

type LineSeg = { d: string; solid: boolean };

/** Straight segments: solid on event day, dotted carry-forward otherwise. */
function buildStraightSegs(
  pts: { x: number; y: number }[],
  solidAtEnd: (endIdx: number) => boolean
): LineSeg[] {
  const segs: LineSeg[] = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    segs.push({
      solid: solidAtEnd(i),
      d: `M${a.x.toFixed(1)},${a.y.toFixed(1)} L${b.x.toFixed(1)},${b.y.toFixed(1)}`,
    });
  }
  return segs;
}

/**
 * Step segments (H then V): solid when this series was the log that day,
 * dotted when the count is only carried forward.
 */
function buildStepSegs(
  pts: { x: number; y: number }[],
  solidAtEnd: (endIdx: number) => boolean
): LineSeg[] {
  const segs: LineSeg[] = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    segs.push({
      solid: solidAtEnd(i),
      d: `M${a.x.toFixed(1)},${a.y.toFixed(1)} H${b.x.toFixed(1)} V${b.y.toFixed(1)}`,
    });
  }
  return segs;
}

/**
 * Lifetime Bristol multi-line graph — one cumulative line per type 1–7.
 * Solid = that type was logged that day · dotted = carry-forward (no new log of that type).
 * Dots only on real event days so a one-time Type 7 does not paint every day.
 */
function BowelBristolLifetimeGraph({
  series,
  counts,
  n,
}: {
  series: BristolSeriesPoint[];
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

  // Compact — sits beside consistency graph in a 2-col row
  const w = 400;
  const h = 132;
  const padL = 28;
  const padR = 10;
  const padT = 10;
  const padB = 22;
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
  // Tiny y-nudge when several types share the same count so flat carry lines
  // don't fully erase each other (still one type per day in the data).
  const yNudge = (t: BristolType, v: number, i: number) => {
    const same = activeTypes.filter((u) => series[i].byType[u] === v);
    if (same.length < 2) return 0;
    const rank = same.indexOf(t);
    const mid = (same.length - 1) / 2;
    return (rank - mid) * 2.4; // px in SVG space
  };

  const lines = activeTypes.map((t) => {
    const pts = series.map((s, i) => ({
      x: xOf(i),
      y: yOf(s.byType[t]) + yNudge(t, s.byType[t], i),
      v: s.byType[t],
      day: s.day,
      isEvent: s.eventType === t,
    }));
    // Segment into day i is solid only when type t was the BM that day
    const segs = buildStraightSegs(pts, (endIdx) => pts[endIdx].isEvent);
    return { t, pts, segs, color: BRISTOL_LINE_COLORS[t] };
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
          aria-label="Lifetime Bristol types — solid when that type logged, dotted carry-forward"
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
          {/* Dotted carry-forward under solid event segments so real logs win visually */}
          {lines.map((line) => {
            const dim = hotType != null && hotType !== line.t;
            const emphasis = hotType === line.t;
            const sw = emphasis ? 3 : 2.25;
            return (
              <g key={line.t} opacity={dim ? 0.22 : 1}>
                {line.segs
                  .filter((s) => !s.solid)
                  .map((s, si) => (
                    <path
                      key={`d-${line.t}-${si}`}
                      d={s.d}
                      fill="none"
                      stroke={line.color}
                      strokeWidth={sw}
                      strokeDasharray="5 5"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      pointerEvents="none"
                    />
                  ))}
                {line.segs
                  .filter((s) => s.solid)
                  .map((s, si) => (
                    <path
                      key={`s-${line.t}-${si}`}
                      d={s.d}
                      fill="none"
                      stroke={line.color}
                      strokeWidth={sw + 0.35}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      pointerEvents="none"
                    />
                  ))}
                {/* Dots only on days this type was actually logged */}
                {line.pts
                  .filter((p) => p.isEvent)
                  .map((p) => {
                    const i = series.findIndex((s) => s.day === p.day);
                    return (
                      <circle
                        key={`${line.t}-${p.day}`}
                        cx={p.x}
                        cy={p.y}
                        r={
                          hoverIdx === i
                            ? emphasis
                              ? 5.5
                              : 4
                            : emphasis
                              ? 3.5
                              : 2.8
                        }
                        fill={line.color}
                        stroke="rgba(255,255,255,0.85)"
                        strokeWidth={1}
                        pointerEvents="none"
                      />
                    );
                  })}
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
          {xIdx.map((i) => {
            const anchor =
              i === 0 ? "start" : i === series.length - 1 ? "end" : "middle";
            return (
              <text
                key={series[i].day}
                x={xOf(i)}
                y={h - 8}
                textAnchor={anchor}
                className="wx-axis-x"
              >
                {shortDay(series[i].day)}
              </text>
            );
          })}
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
            <strong>
              {shortDay(hoverRow.day)} · Type {hoverRow.eventType}
            </strong>
            <ul>
              {activeTypes.map((t) => (
                <li key={t} style={{ color: BRISTOL_LINE_COLORS[t] }}>
                  T{t}: {hoverRow.byType[t]}
                  {hoverRow.eventType === t ? " · logged" : ""}
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
          n = {n} · solid = logged that type · dotted = carry-forward
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

  // Compact — sits beside Bristol types in a 2-col row
  const w = 400;
  const h = 132;
  const padL = 32;
  const padR = 10;
  const padT = 18;
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
  // Solid when this series was the day's log; dotted carry-forward otherwise
  const yesPts = points.map((p, i) => ({
    x: xOf(i),
    y: yOf(p.yes),
    event: p.logged === "yes",
  }));
  const noPts = points.map((p, i) => ({
    x: xOf(i),
    y: yOf(p.no),
    event: p.logged === "no",
  }));
  const yesSegs = buildStepSegs(yesPts, (i) => yesPts[i].event);
  const noSegs = buildStepSegs(noPts, (i) => noPts[i].event);

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

  function renderSegs(
    segs: LineSeg[],
    color: string,
    solidW: number,
    dashW: number
  ) {
    return (
      <>
        {segs
          .filter((s) => !s.solid)
          .map((s, i) => (
            <path
              key={`d-${i}`}
              d={s.d}
              fill="none"
              stroke={color}
              strokeWidth={dashW}
              strokeDasharray="6 5"
              strokeLinejoin="round"
              strokeLinecap="round"
              pointerEvents="none"
            />
          ))}
        {segs
          .filter((s) => s.solid)
          .map((s, i) => (
            <path
              key={`s-${i}`}
              d={s.d}
              fill="none"
              stroke={color}
              strokeWidth={solidW}
              strokeLinejoin="round"
              strokeLinecap="round"
              pointerEvents="none"
            />
          ))}
      </>
    );
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
          aria-label="Cumulative Yes vs No — solid on log day, dotted carry-forward"
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
          {renderSegs(noSegs, "rgba(239, 68, 68, 0.88)", 2.35, 2.1)}
          {renderSegs(yesSegs, "rgba(34, 197, 94, 0.96)", 3, 2.5)}
          {/* Dots only on the series that was logged that day */}
          {points.map((p, i) => (
            <g key={p.day} pointerEvents="none">
              {p.logged === "no" ? (
                <circle
                  cx={xOf(i)}
                  cy={yOf(p.no)}
                  r={hoverIndex === i ? 4.5 : 3}
                  fill="rgba(239, 68, 68, 0.88)"
                  stroke="rgba(255,255,255,0.85)"
                  strokeWidth={1}
                />
              ) : (
                <circle
                  cx={xOf(i)}
                  cy={yOf(p.yes)}
                  r={hoverIndex === i ? 5 : 3.2}
                  fill="rgba(34, 197, 94, 0.96)"
                  stroke="rgba(255,255,255,0.85)"
                  strokeWidth={1}
                />
              )}
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
          {xIdx.map((i) => {
            // Anchor edges so first/last dates never sit under another label
            const x = xOf(i);
            const anchor =
              i === 0 ? "start" : i === points.length - 1 ? "end" : "middle";
            return (
              <text
                key={points[i].day}
                x={x}
                y={h - 10}
                textAnchor={anchor}
                className="wx-axis-x"
              >
                {shortDay(points[i].day)}
              </text>
            );
          })}
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
      <footer className="wx-panel-foot">
        <span>solid = that day’s log · dotted = carry-forward</span>
      </footer>
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

  // On mount: hydrate store, then merge /whoop/latest (new days only — no dupes).
  useEffect(() => {
    const hydrate = () => {
      const r = resolveSleepForDay(dayIso);
      setBedtime(r.bedtime);
      setWake(r.wake);
      setWhoop(loadWhoopDay(dayIso));
      setNightsTick((t) => t + 1);
      setWhoopStoreTick((t) => t + 1);
    };
    hydrate();
    void importWhoopFromPublicLatest()
      .catch(() => ({ ok: false as const }))
      .finally(hydrate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

type MacroFocusKey = "calories" | "protein" | "carbs" | "fat" | "fiber";

/** One macro chip — same class → same color on every meal / total row. */
function MacroVal({
  kind,
  focus,
  children,
}: {
  kind: "cal" | "pro" | "carb" | "fat" | "fib";
  focus?: MacroFocusKey | null;
  children: ReactNode;
}) {
  const focusMap = {
    cal: "calories",
    pro: "protein",
    carb: "carbs",
    fat: "fat",
    fib: "fiber",
  } as const;
  const hi = focus != null && focus === focusMap[kind];
  return (
    <span className={`umv umv-${kind}${hi ? " is-hi" : ""}`}>{children}</span>
  );
}

/** Full cal · protein · carbs · fat · fiber strip (color only, never bold). */
function MacroStrip({
  mac,
  focus = null,
}: {
  mac: MacroBag;
  focus?: MacroFocusKey | null;
}) {
  const n = (v: number, unit = "") =>
    `${Number.isInteger(v) ? v : Number(v.toFixed(1))}${unit}`;
  return (
    <>
      <MacroVal kind="cal" focus={focus}>
        Calories: {n(mac.calories)}
      </MacroVal>
      <span className="umv-sep"> · </span>
      <MacroVal kind="pro" focus={focus}>
        Protein: {n(mac.protein_g, "g")}
      </MacroVal>
      <span className="umv-sep"> · </span>
      <MacroVal kind="carb" focus={focus}>
        Carbs: {n(mac.carbs_g, "g")}
      </MacroVal>
      <span className="umv-sep"> · </span>
      <MacroVal kind="fat" focus={focus}>
        Fat: {n(mac.fat_g, "g")}
      </MacroVal>
      <span className="umv-sep"> · </span>
      <MacroVal kind="fib" focus={focus}>
        Fiber: {n(mac.fiber_g, "g")}
      </MacroVal>
    </>
  );
}

/**
 * Preset ids renamed over time (e.g. dinner steak → dinner_main).
 * Old nutrition rows keep the old presetId — map so UI/undo still match.
 */
const PRESET_ID_ALIASES: Record<string, string> = {
  dinner_grass_fed_steak: "dinner_main",
  dinner_sockeye: "dinner_main",
  preworkout_ag1: "morning_blueprint",
  preworkout_longevity_mix: "morning_blueprint",
};

function canonicalPresetId(id: string | undefined | null): string | null {
  if (!id) return null;
  return PRESET_ID_ALIASES[id] || id;
}

/** All stored presetIds that count as this canonical meal. */
function presetIdAliases(canonicalId: string): string[] {
  const ids = [canonicalId];
  for (const [oldId, canon] of Object.entries(PRESET_ID_ALIASES)) {
    if (canon === canonicalId) ids.push(oldId);
  }
  return ids;
}

/** Read day from nutrition item ledger (source of truth). */
function loadUsualDay(day: string): UsualDayLog {
  try {
    const entries = loadNutriDay(day);
    const t = nutriTotalsFor(day);
    const loggedIds = [
      ...new Set(
        entries
          .map((e) => canonicalPresetId(e.presetId) || e.presetId || e.id)
          .filter(Boolean) as string[]
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
  // Eat = daily log · Shop = TJ plan (separate — no stacking)
  const [mealsView, setMealsView] = useState<"eat" | "shop">("eat");
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
  const [flashCutout, setFlashCutout] = useState(false);
  /** Bumps meal-flag UI when nutrition ledger changes */
  const [mealTick, setMealTick] = useState(0);

  // Mel / NL / snack seed → same rings + cut-out scan
  useEffect(() => {
    const refresh = () => {
      setUsualDay(loadUsualDay(day));
      setMealTick((t) => t + 1);
    };
    window.addEventListener(NUTRITION_EVENT, refresh);
    window.addEventListener(MEL_DATA_EVENT, refresh);
    return () => {
      window.removeEventListener(NUTRITION_EVENT, refresh);
      window.removeEventListener(MEL_DATA_EVENT, refresh);
    };
  }, [day]);
  /**
   * Click a ring/stat → open every meal’s Ingredients + macros and highlight
   * that macro color.
   */
  type MacroFocus = "calories" | "protein" | "carbs" | "fat" | "fiber";
  const [macroFocus, setMacroFocus] = useState<MacroFocus | null>(null);
  /** One face at a time: macros ↔ vitamins (never both). */
  const [ringFace, setRingFace] = useState<"macros" | "vitamins">("macros");
  const [ringTurning, setRingTurning] = useState(false);
  function flipRingFace() {
    if (ringTurning) return;
    setRingTurning(true);
    // Mid-turn swap so only one set of rings is ever painted
    window.setTimeout(() => {
      setRingFace((f) => {
        const next = f === "macros" ? "vitamins" : "macros";
        if (next === "vitamins") setMacroFocus(null);
        return next;
      });
    }, 160);
    window.setTimeout(() => setRingTurning(false), 320);
  }
  /** Which meal’s Ingredients + macros list is open (null = all closed). */
  const [openIngredients, setOpenIngredients] = useState<string | null>(null);
  /** Open every meal’s Ingredients + macros at once. */
  const [ingredientsExpandAll, setIngredientsExpandAll] = useState(false);
  /** Meal card id with Vitamins open (separate from ingredients + macros). */
  const [openVitamins, setOpenVitamins] = useState<string | null>(null);

  function toggleMacroFocus(key: MacroFocus) {
    setMacroFocus((cur) => {
      const next = cur === key ? null : key;
      if (next) setIngredientsExpandAll(true);
      return next;
    });
  }

  /** Dinner protein swap (steak | salmon) — drives ingredients + macros */
  const [dinnerVariantId, setDinnerVariantId] = useState(() => {
    const dinner = MEAL_PRESETS.find((m) => m.slot === "dinner" && m.variants);
    return dinner ? loadMealVariantId(dinner) || dinner.defaultVariantId || "steak" : "steak";
  });

  function activePreset(raw: MealPreset): MealPreset {
    if (!raw.variants?.length) return raw;
    return resolveMealPreset(raw, dinnerVariantId);
  }

  function setDinnerVariant(nextId: string) {
    const dinner = MEAL_PRESETS.find((m) => m.id === "dinner_main");
    if (dinner) saveMealVariantId(dinner.id, nextId);
    setDinnerVariantId(nextId);
  }


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

  // Pull ~/.wonder/local bowel mirror — survives profile swaps.
  // Re-run corrections after disk hydrate so seed days stay pruned.
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
        // Disk is source of truth for multi-device; replace (don't merge-back seed days)
        replaceBowelDetailMap(body.value);
        applyPendingBowelCorrections();
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

    const series: BristolSeriesPoint[] = [];
    for (const { day, look } of days) {
      counts[look] += 1;
      series.push({
        day,
        eventType: look,
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
  // Vitamins: morning stack → daily-need rings (19-year-old woman targets)
  const vit = vitaminTotalsFromLogged(usualDay.loggedIds, dinnerVariantId);
  const vitPct = {
    d_mcg: pct(vit.d_mcg, VITAMIN_GOALS.d_mcg),
    c_mg: pct(vit.c_mg, VITAMIN_GOALS.c_mg),
    folate_mcg: pct(vit.folate_mcg, VITAMIN_GOALS.folate_mcg),
    ca_mg: pct(vit.ca_mg, VITAMIN_GOALS.ca_mg),
    mg_mg: pct(vit.mg_mg, VITAMIN_GOALS.mg_mg),
  };
  const vitAvg = vitaminRingAveragePct(vit);
  const morningVitLogged = usualDay.loggedIds.includes("morning_blueprint");
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
    const raw = MEAL_PRESETS.find((m) => m.id === presetId);
    if (!raw) return;
    const preset = activePreset(raw);
    const already = loadNutriDay(day).some((e) => {
      const canon = canonicalPresetId(e.presetId) || e.presetId;
      return canon === presetId || e.presetId === presetId;
    });
    if (already) {
      setFlash("Already logged today");
      window.setTimeout(() => setFlash(""), 1600);
      return;
    }
    const slot =
      /breakfast/i.test(preset.id) || /breakfast/i.test(preset.title)
        ? "breakfast"
        : /lunch/i.test(preset.id)
          ? "lunch"
          : /dinner/i.test(preset.id) || preset.slot === "dinner"
            ? "dinner"
            : "snack";
    // Prefer summed per-item macros (active dinner variant / locked meals)
    const fromItems = sumMeasureMacros(preset.measures);
    const macros = fromItems || {
      calories: preset.calories,
      protein_g: preset.protein_g,
      carbs_g: preset.carbs_g,
      fat_g: preset.fat_g,
      fiber_g: preset.fiber_g,
    };
    addEntry(
      {
        slot,
        name: preset.title,
        grams: 0,
        qtyLabel: "Usual meal",
        macros: {
          calories: Math.round(macros.calories * 10) / 10,
          protein_g: Math.round(macros.protein_g * 10) / 10,
          carbs_g: Math.round(macros.carbs_g * 10) / 10,
          fat_g: Math.round(macros.fat_g * 10) / 10,
          fiber_g: Math.round(macros.fiber_g * 10) / 10,
        },
        presetId: preset.id,
        source: "preset",
      },
      day
    );
    // Blueprint slots carry 250 ml water — log that pour on the water bar too
    const waterMl = waterMlFromPreset(preset);
    const waterAdded = waterMl > 0 ? addWaterDrink(day, waterMl) : 0;
    setUsualDay(loadUsualDay(day));
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    patch(`meal-${presetId}`, { done: true, time: `${hh}:${mm}` });
    notifyHabitAutoSync(day);
    setMealTick((t) => t + 1);
    // Immediate cut-out flag from name + full ingredient list
    const report = reportMealCutouts(preset.title, [
      preset.notes,
      ...preset.ingredients,
      ...(preset.sections || []).flatMap((s) => s.items),
    ]);
    if (report.flagged) {
      const labels = report.hits.map((h) => h.label).join(" · ");
      setFlashCutout(true);
      setFlash(`Cut out: ${labels}`);
    } else {
      setFlashCutout(false);
      setFlash(
        waterAdded > 0
          ? `Logged ${preset.title.toLowerCase()} · +${waterAdded} ml water`
          : `Logged ${preset.title.toLowerCase()} — macros updated`
      );
    }
    window.setTimeout(() => {
      setFlash("");
      setFlashCutout(false);
    }, 3200);
  }

  /** Undo a usual so you can log again (includes legacy dinner preset ids). */
  function undoUsual(presetId: string) {
    const preset = MEAL_PRESETS.find((m) => m.id === presetId);
    if (!preset) return;
    const aliases = new Set(presetIdAliases(presetId));
    const entries = loadNutriDay(day);
    // Match current id, renamed aliases, or dinner slot presets with dinner title
    const hits = entries.filter((e) => {
      if (e.presetId && aliases.has(e.presetId)) return true;
      if (e.presetId && aliases.has(canonicalPresetId(e.presetId) || "")) {
        return true;
      }
      // Orphan dinner rows after id rename (steak title, old presetId)
      if (
        presetId === "dinner_main" &&
        e.slot === "dinner" &&
        e.source === "preset"
      ) {
        return true;
      }
      return false;
    });
    if (!hits.length) {
      // Still stuck rings? wipe any leftover preset row that maps to this meal
      setFlash("Nothing to undo for this meal");
      window.setTimeout(() => setFlash(""), 1600);
      return;
    }
    for (const hit of hits) {
      removeEntry(hit.id, day);
    }
    // Peel meal water pour(s) off the bar (250 ml per Blueprint slot)
    const resolved = activePreset(preset);
    const waterMl = waterMlFromPreset(resolved);
    if (waterMl > 0) {
      for (let i = 0; i < hits.length; i++) {
        removeWaterDrink(day, waterMl);
      }
    }
    setUsualDay(loadUsualDay(day));
    patch(`meal-${presetId}`, { done: false });
    notifyHabitAutoSync(day);
    setMealTick((t) => t + 1);
    setFlashCutout(false);
    setFlash(
      waterMl > 0
        ? hits.length > 1
          ? `Undone (${hits.length}) · −${waterMl * hits.length} ml water`
          : `Undone · −${waterMl} ml water`
        : hits.length > 1
          ? `Undone (${hits.length})`
          : "Undone"
    );
    window.setTimeout(() => setFlash(""), 1400);
  }

  /** Nuclear clear — when rings stay full after undos (orphan ledger rows). */
  function resetTodayMeals() {
    const entries = loadNutriDay(day);
    for (const e of entries) {
      removeEntry(e.id, day);
    }
    setUsualDay(loadUsualDay(day));
    for (const m of MEAL_PRESETS) {
      patch(`meal-${m.id}`, { done: false });
    }
    notifyHabitAutoSync(day);
    setMealTick((t) => t + 1);
    setMacroFocus(null);
    setFlashCutout(false);
    setFlash("Today’s meals cleared");
    window.setTimeout(() => setFlash(""), 1800);
  }

  return (
    <>
      <nav className="fx-subnav fx-meals-sub" aria-label="Meals sections">
        {(
          [
            ["eat", "Eat"],
            ["shop", "Shop"],
          ] as const
        ).map(([id, label]) => (
          <span key={id} className="fx-subnav-item">
            <button
              type="button"
              className={`fx-subnav-link${mealsView === id ? " is-active" : ""}`}
              onClick={() => setMealsView(id)}
            >
              {label}
            </button>
          </span>
        ))}
      </nav>

      {mealsView === "shop" ? <MealsShop /> : null}

      {mealsView === "eat" ? (
      <>
      <section
        className={`fx-section ring-flip-section${
          macroFocus ? ` is-macro-focus-${macroFocus}` : ""
        }${ringFace === "vitamins" ? " is-vitamins" : " is-macros"}`}
      >
        {/* One label only — tap to turn to the other face */}
        <button
          type="button"
          className="ring-face-title"
          onClick={flipRingFace}
          title={
            ringFace === "macros" ? "Turn to vitamins" : "Turn to macros"
          }
          aria-label={
            ringFace === "macros"
              ? "Macros. Turn to vitamins."
              : "Vitamins. Turn to macros."
          }
        >
          {ringFace === "macros" ? "Macros" : "Vitamins"}
        </button>

        <div
          className={`ring-flip-scene${ringTurning ? " is-turning" : ""}`}
        >
          {ringFace === "macros" ? (
            <div className="macro-ring-wrap">
              <svg
                className={`macro-rings${macroFocus ? ` is-focus-${macroFocus}` : ""}`}
                viewBox="0 0 200 200"
                role="img"
                aria-label="Macro rings — tap a ring to scan meals"
              >
                <circle className="ring-track" cx="100" cy="100" r="88" />
                <circle
                  className={`ring-cal ring-hit${macroFocus === "calories" ? " is-on" : ""}`}
                  cx="100"
                  cy="100"
                  r="88"
                  strokeDasharray={CIRC.cal}
                  strokeDashoffset={off(CIRC.cal, p.calories)}
                  onClick={() => toggleMacroFocus("calories")}
                  style={{ cursor: "pointer", pointerEvents: "stroke" }}
                >
                  <title>Calories — open meal breakdowns</title>
                </circle>
                <circle className="ring-track" cx="100" cy="100" r="77" />
                <circle
                  className={`ring-protein ring-hit${macroFocus === "protein" ? " is-on" : ""}`}
                  cx="100"
                  cy="100"
                  r="77"
                  strokeDasharray={CIRC.protein}
                  strokeDashoffset={off(CIRC.protein, p.protein_g)}
                  onClick={() => toggleMacroFocus("protein")}
                  style={{ cursor: "pointer", pointerEvents: "stroke" }}
                >
                  <title>Protein — open meal breakdowns</title>
                </circle>
                <circle className="ring-track" cx="100" cy="100" r="66" />
                <circle
                  className={`ring-carbs ring-hit${macroFocus === "carbs" ? " is-on" : ""}`}
                  cx="100"
                  cy="100"
                  r="66"
                  strokeDasharray={CIRC.carbs}
                  strokeDashoffset={off(CIRC.carbs, p.carbs_g)}
                  onClick={() => toggleMacroFocus("carbs")}
                  style={{ cursor: "pointer", pointerEvents: "stroke" }}
                >
                  <title>Carbs — open meal breakdowns</title>
                </circle>
                <circle className="ring-track" cx="100" cy="100" r="55" />
                <circle
                  className={`ring-fat ring-hit${macroFocus === "fat" ? " is-on" : ""}`}
                  cx="100"
                  cy="100"
                  r="55"
                  strokeDasharray={CIRC.fat}
                  strokeDashoffset={off(CIRC.fat, p.fat_g)}
                  onClick={() => toggleMacroFocus("fat")}
                  style={{ cursor: "pointer", pointerEvents: "stroke" }}
                >
                  <title>Fat — open meal breakdowns</title>
                </circle>
                <circle className="ring-track" cx="100" cy="100" r="44" />
                <circle
                  className={`ring-fiber ring-hit${macroFocus === "fiber" ? " is-on" : ""}`}
                  cx="100"
                  cy="100"
                  r="44"
                  strokeDasharray={CIRC.fiber}
                  strokeDashoffset={off(CIRC.fiber, p.fiber_g)}
                  onClick={() => toggleMacroFocus("fiber")}
                  style={{ cursor: "pointer", pointerEvents: "stroke" }}
                >
                  <title>Fiber — open meal breakdowns</title>
                </circle>
                <circle className="ring-hole" cx="100" cy="100" r="40" />
              </svg>
              <button
                type="button"
                className="macro-ring-center macro-ring-center-btn"
                onClick={flipRingFace}
                title="Turn to vitamins"
                aria-label="Turn ring to vitamins"
              >
                <span className="macro-ring-num macro-ring-cal-num">
                  {Math.round(c.calories)}
                </span>
                <span className="macro-ring-sub">cal</span>
                <span className="macro-ring-num macro-ring-pro-num">
                  {Number.isInteger(c.protein_g)
                    ? c.protein_g
                    : Number(c.protein_g).toFixed(1)}
                  <small>g</small>
                </span>
                <span className="macro-ring-sub">protein</span>
              </button>
            </div>
          ) : (
            <div className="macro-ring-wrap vit-ring-wrap">
              <svg
                className="macro-rings vit-rings"
                viewBox="0 0 200 200"
                role="img"
                aria-label="Vitamin rings toward daily need for a 19-year-old woman"
              >
                {(
                  [
                    ["d_mcg", CIRC.cal, 88, "ring-vit-d", "Vitamin D"],
                    ["c_mg", CIRC.protein, 77, "ring-vit-c", "Vitamin C"],
                    ["folate_mcg", CIRC.carbs, 66, "ring-vit-folate", "Folate"],
                    ["ca_mg", CIRC.fat, 55, "ring-vit-ca", "Calcium"],
                    ["mg_mg", CIRC.fiber, 44, "ring-vit-mg", "Magnesium"],
                  ] as const
                ).map(([key, circ, r, cls, title]) => (
                  <g key={key}>
                    <circle className="ring-track" cx="100" cy="100" r={r} />
                    <circle
                      className={`${cls} ring-hit`}
                      cx="100"
                      cy="100"
                      r={r}
                      strokeDasharray={circ}
                      strokeDashoffset={off(circ, vitPct[key])}
                    >
                      <title>
                        {title}: {vit[key]}
                        {key.endsWith("mcg") ? " mcg" : " mg"} of{" "}
                        {VITAMIN_GOALS[key]}
                        {key.endsWith("mcg") ? " mcg" : " mg"} daily need
                      </title>
                    </circle>
                  </g>
                ))}
                <circle className="ring-hole" cx="100" cy="100" r="40" />
              </svg>
              <button
                type="button"
                className="macro-ring-center macro-ring-center-btn"
                onClick={flipRingFace}
                title="Turn to macros"
                aria-label="Turn ring to macros"
              >
                <span className="macro-ring-num macro-ring-vit-num">{vitAvg}</span>
                <span className="macro-ring-sub">% need</span>
                <span className="macro-ring-sub macro-ring-vit-note">
                  {morningVitLogged ? "morning in" : "log morning"}
                </span>
              </button>
            </div>
          )}
        </div>

        {ringFace === "macros" ? (
          <ul className="macro-stats" aria-label="Macro goals">
            {(
              [
                ["calories", "Calories", "dot-cal", c.calories, g.calories, ""],
                ["protein", "Protein", "dot-protein", c.protein_g, g.protein_g, "g"],
                ["carbs", "Carbs", "dot-carbs", c.carbs_g, g.carbs_g, "g"],
                ["fat", "Fat", "dot-fat", c.fat_g, g.fat_g, "g"],
                ["fiber", "Fiber", "dot-fiber", c.fiber_g, g.fiber_g, "g"],
              ] as const
            ).map(([key, label, dot, cur, goal, unit]) => (
              <li key={key}>
                <button
                  type="button"
                  className={`macro-stats-btn${macroFocus === key ? " is-on" : ""}`}
                  onClick={() => toggleMacroFocus(key)}
                  aria-pressed={macroFocus === key}
                  title={
                    macroFocus === key
                      ? `Clear ${label} highlight`
                      : `Show ${label} in every meal breakdown`
                  }
                >
                  <span className={`dot ${dot}`} />
                  <span className="macro-stats-label">{label}</span>
                  <strong>
                    {cur}
                    {unit}
                  </strong>
                  <span className="macro-stats-goal">
                    {" "}
                    / {goal}
                    {unit}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <>
            <ul
              className="macro-stats"
              aria-label="Vitamins today versus daily need for a 19-year-old woman"
            >
              {[...VITAMIN_RING_TRACKS, ...VITAMIN_LIST_EXTRA].map((row) => {
                const cur = vit[row.key];
                const goal = VITAMIN_GOALS[row.key];
                const over = cur > goal && goal > 0;
                return (
                  <li key={row.key}>
                    <span className="macro-stats-btn vit-stats-row">
                      <span className={`dot ${row.dot}`} />
                      <span className="macro-stats-label">{row.label}</span>
                      <strong>
                        {cur % 1 === 0 ? cur : cur.toFixed(1)}
                        {row.unit}
                      </strong>
                      <span className="macro-stats-goal">
                        {" "}
                        / {goal}
                        {row.unit} need
                        {over ? " · over need" : ""}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
            {!morningVitLogged ? (
              <p className="vit-hint">
                Log first thing in the morning to count your stack toward daily need
              </p>
            ) : null}
          </>
        )}
      </section>

      <section className="fx-section usuals-section">
        <div className="usuals-head">
          <h2 className="fx-h2">MEALS + SUPPLEMENTS</h2>
        </div>
        {usualDay.totals.calories > 0 || usualDay.loggedIds.length > 0 ? (
          <button
            type="button"
            className="usual-reset-day"
            onClick={resetTodayMeals}
            title="Clear every logged meal today (fixes stuck rings)"
          >
            Clear today’s log
          </button>
        ) : null}
        {flash ? (
          <p className={`usual-flash${flashCutout ? " is-cutout" : ""}`}>
            {flash}
          </p>
        ) : null}

        {MEAL_PRESETS.map((raw) => {
          const u = activePreset(raw);
          const logged = usualDay.loggedIds.includes(u.id);
          const itemMacros = sumMeasureMacros(u.measures);
          const shopYear = mealShopYearCost(u.measures);
          // Ingredients + macros: text toggle (no chevron) · open when focused too
          const ingredientsOpen =
            openIngredients === u.id ||
            ingredientsExpandAll ||
            macroFocus != null;
          const logLabel =
            u.id === "morning_blueprint"
              ? "Log first thing in the morning"
              : u.id === "post_workout_shake"
                ? "Log post-workout"
                : u.id === "midday_metabolic"
                  ? "Log Metabolic Protein"
                    : u.slot === "breakfast"
                      ? "Log breakfast"
                      : u.slot === "lunch"
                        ? "Log lunch"
                        : u.slot === "dinner"
                          ? "Log dinner"
                          : "Log meal";
          const presetHits = reportMealCutouts(u.title, [
            u.notes,
            ...u.ingredients,
            ...(u.sections || []).flatMap((s) => s.items),
          ]);
          return (
            <div
              key={u.id}
              className={`usual-card is-core${logged ? " is-logged" : ""}${
                logged && presetHits.flagged ? " is-cutout" : ""
              }`}
            >
              <h3 className="usual-title">{u.title}</h3>

              {/* Dinner protein always visible — steak ↔ sockeye */}
              {raw.variants && raw.variants.length > 1 ? (
                <div
                  className="usual-swap usual-swap-top"
                  role="group"
                  aria-label="Dinner protein"
                >
                  <button
                    type="button"
                    className="usual-swap-btn"
                    title="Swap steak and sockeye salmon"
                    onClick={() => {
                      const ids = raw.variants!.map((v) => v.id);
                      const i = ids.indexOf(dinnerVariantId);
                      const next = ids[(i + 1) % ids.length] || ids[0];
                      setDinnerVariant(next);
                    }}
                  >
                    <span className="usual-swap-icon" aria-hidden>
                      ⇄
                    </span>
                    <span className="usual-swap-label">Swap</span>
                  </button>
                  <div className="usual-swap-options">
                    {raw.variants.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        className={`usual-swap-opt${
                          dinnerVariantId === v.id ? " is-on" : ""
                        }`}
                        aria-pressed={dinnerVariantId === v.id}
                        onClick={() => setDinnerVariant(v.id)}
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Log / undo first — then ingredients always open (no toggle) */}
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
                  {logLabel}
                </button>
              )}

              {logged && presetHits.flagged ? (
                <p className="usual-cutout-flag">
                  Cut out:{" "}
                  <strong>
                    {presetHits.hits.map((h) => h.label).join(" · ")}
                  </strong>
                </p>
              ) : null}

              {/*
                Toggle is plain gray text only — no ▸/▾ chevron.
                Click “Ingredients + macros” → list opens / closes.
              */}
              {u.measures && u.measures.length > 0 ? (
                <>
                  <button
                    type="button"
                    className={`usual-ingredients-head${
                      ingredientsOpen ? " is-open" : ""
                    }`}
                    aria-expanded={ingredientsOpen}
                    onClick={() => {
                      if (ingredientsExpandAll || macroFocus) {
                        setIngredientsExpandAll(false);
                        setMacroFocus(null);
                        setOpenIngredients(u.id);
                        return;
                      }
                      setOpenIngredients((cur) =>
                        cur === u.id ? null : u.id
                      );
                    }}
                  >
                    Ingredients + macros
                  </button>
                  {ingredientsOpen ? (
                    <div
                      className={`usual-measure usual-details-combined${
                        macroFocus ? ` is-focus-${macroFocus}` : ""
                      }`}
                    >
                      {u.ingredientsNote ? (
                        <p className="usual-ingredients-note">
                          {u.ingredientsNote}
                        </p>
                      ) : null}
                      <ol className="usual-measure-list">
                        {u.measures
                          .filter((row) => !/^water\b/i.test(row.item.trim()))
                          .map((row, i) => {
                            const hasFoodMacros = macrosMeaningful(row.macros);
                            const isBlueprintShop =
                              !!row.shop &&
                              (/blueprint/i.test(row.shop.source || "") ||
                                /blueprint|big stack/i.test(
                                  row.shop.product || ""
                                ));
                            const shop =
                              row.shop && !isBlueprintShop
                                ? row.shop
                                : undefined;
                            const math = shop
                              ? shopRunOut(shop, row.amount)
                              : null;
                            const title = row.item;
                            const amt = row.amount
                              ? row.amount.replace(/\s+/g, " ").trim()
                              : "";
                            const shopLine =
                              math && math.buyPart
                                ? `Buy ${math.buyPart.replace(/^;\s*/, "")}; ${math.lastsLine}`
                                : math
                                  ? math.lastsLine
                                  : null;
                            return (
                              <li
                                key={row.item}
                                className="usual-measure-row"
                              >
                                <span className="usual-measure-n" aria-hidden>
                                  {i + 1}.
                                </span>
                                <span className="usual-measure-body">
                                  <span className="usual-measure-name">
                                    {shop?.url ? (
                                      <a
                                        className="usual-product-link"
                                        href={shop.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        title={title}
                                      >
                                        {title}
                                      </a>
                                    ) : (
                                      title
                                    )}
                                    {amt ? (
                                      <span className="usual-measure-amt">
                                        : {amt}
                                      </span>
                                    ) : null}
                                  </span>
                                  {shopLine ? (
                                    <span
                                      className="usual-shop-line"
                                      title={
                                        math?.pricePerPackTip ||
                                        math?.daysTip ||
                                        undefined
                                      }
                                    >
                                      {shopLine}
                                    </span>
                                  ) : null}
                                  {hasFoodMacros && row.macros ? (
                                    <span className="usual-macro-break-vals">
                                      <MacroStrip
                                        mac={row.macros}
                                        focus={macroFocus}
                                      />
                                    </span>
                                  ) : null}
                                  {row.activesGroups &&
                                  row.activesGroups.length > 0
                                    ? row.activesGroups.map((g) =>
                                        g.actives.length > 0 ? (
                                          <MeasureActivesToggle
                                            key={g.label}
                                            label={g.label}
                                            actives={g.actives}
                                          />
                                        ) : null
                                      )
                                    : row.actives && row.actives.length > 0 ? (
                                        <MeasureActivesToggle
                                          label={row.activesLabel || "Actives"}
                                          actives={row.actives}
                                        />
                                      ) : null}
                                </span>
                              </li>
                            );
                          })}
                      </ol>
                      {itemMacros ? (
                        <p className="usual-macro-break-total">
                          Total ·{" "}
                          <MacroStrip mac={itemMacros} focus={macroFocus} />
                        </p>
                      ) : null}
                      {shopYear && shopYear.perMonth > 0 ? (
                        <div className="usual-spend">
                          <p className="usual-spend-line">
                            Monthly:{" "}
                            <span>${Math.round(shopYear.perMonth)}</span>
                          </p>
                          <p className="usual-spend-line">
                            Yearly:{" "}
                            <span>${Math.round(shopYear.perYear)}</span>
                          </p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : null}

              {/* Vitamins — food + stack for this meal only. Below ingredients + macros. */}
              {(() => {
                const mealVits = vitaminsFromMeasures(u.measures);
                if (!vitaminsMeaningful(mealVits)) return null;
                const vOpen = openVitamins === u.id;
                return (
                  <>
                    <button
                      type="button"
                      className={`usual-ingredients-head usual-vitamins-head${
                        vOpen ? " is-open" : ""
                      }`}
                      aria-expanded={vOpen}
                      onClick={() =>
                        setOpenVitamins((cur) => (cur === u.id ? null : u.id))
                      }
                    >
                      Vitamins
                    </button>
                    {vOpen ? (
                      <ul className="usual-meal-vitamins">
                        {VITAMIN_DISPLAY_ROWS.map((row) => {
                          const n = mealVits[row.key];
                          if (!n || n <= 0) return null;
                          const rounded =
                            n >= 10
                              ? Math.round(n)
                              : Math.round(n * 10) / 10;
                          return (
                            <li key={row.key}>
                              <span className="usual-meal-vit-lab">
                                {row.label}
                              </span>
                              <span className="usual-meal-vit-amt">
                                {rounded} {row.unit}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </>
                );
              })()}
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
              {/* Side-by-side compact charts — no full-width stack */}
              <div className="fx-bm-graphs-row">
                <div className="fx-bm-graphs-col">
                  <BowelConsistencyGraph
                    points={bowelConsistency.points}
                    yes={bowelConsistency.yes}
                    no={bowelConsistency.no}
                  />
                  <p className="fx-bm-graph-goal">
                    Goal: Yes climbs · No stays flat.
                  </p>
                </div>
                <div className="fx-bm-graphs-col">
                  <BowelBristolLifetimeGraph
                    series={bristolLife.series}
                    counts={bristolLife.counts}
                    n={bristolLife.n}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </footer>
      </section>

      {/*
        Plate + cut-out bin — reference / reminder only.
        Bottom of Meals so daily macros · usuals · water · supps · bowel stay first.
        PRESERVE: do not delete; do not move above daily logging without explicit order.
      */}
      <FoodPlateGuide
        today={{
          calories: c.calories,
          protein_g: c.protein_g,
          carbs_g: c.carbs_g,
          fat_g: c.fat_g,
          fiber_g: c.fiber_g,
        }}
        hitLabels={flagDayMeals(day).flatMap((m) =>
          m.report.hits.map((h) => h.label)
        )}
      />
      </>
      ) : null}
    </>
  );
}

// Goal matches Habits “3.5L water + Diet” (shared with habitAutoSync)
const WATER_ADDS = [
  { ml: 250, label: "+250 ml" },
  { ml: 500, label: "+500 ml" },
  { ml: 1000, label: "+1 L" },
] as const;

/**
 * Vitamins / actives list.
 * Layout (scan dose on the right):
 *   1  Name (what it’s for)                    2.5 g
 * Hover tip: rich multi-paragraph detail (female-focused) from data.ts.
 */
function MeasureActivesToggle({
  label,
  actives,
}: {
  label: string;
  actives: { name: string; amount?: string; role: string; detail: string }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="usual-actives">
      <button
        type="button"
        className={`usual-actives-toggle${open ? " is-open" : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
      </button>
      {open ? (
        <ol className="usual-actives-list">
          {actives.map((a, i) => (
            <li key={a.name} className="usual-actives-item" tabIndex={0}>
              <span className="usual-actives-n">{i + 1}</span>
              <span className="usual-actives-main">
                <span className="usual-actives-name">{a.name}</span>
                {a.role ? (
                  <span className="usual-actives-role"> ({a.role})</span>
                ) : null}
              </span>
              {a.amount ? (
                <span className="usual-actives-amt">{a.amount}</span>
              ) : (
                <span className="usual-actives-amt is-empty" aria-hidden>
                  {" "}
                </span>
              )}
              <span className="usual-actives-tip" role="tooltip">
                <span className="usual-actives-tip-head">
                  {a.name}
                  {a.amount ? ` · ${a.amount}` : ""}
                </span>
                {a.role ? (
                  <span className="usual-actives-tip-role">{a.role}</span>
                ) : null}
                <span className="usual-actives-tip-body">{a.detail}</span>
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

/** Water like Melani: bar + plain text adds (no underlines, no boxes) */
function WaterTracker({ day }: { day: string }) {
  const [ml, setMl] = useState(() => loadWater(day));
  const [hist, setHist] = useState<number[]>(() => loadWaterHist(day));
  const goal = WATER_GOAL_ML; // 3.5 L — same as Habits water goal
  const liters = (ml / 1000).toFixed(1);
  const goalL = (goal / 1000).toFixed(1); // 3.5
  const pctFill = Math.min(100, Math.round((ml / goal) * 100));
  // Block double-fire (double click / StrictMode impurity) on the same tap
  const addLockRef = useRef(false);

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
    // Meal log also fires water domain so bar updates without reload
    window.addEventListener(MEL_DATA_EVENT, refresh);
    window.addEventListener("wonder-habits-update", refresh);
    return () => {
      window.removeEventListener(MEL_DATA_EVENT, refresh);
      window.removeEventListener("wonder-habits-update", refresh);
    };
  }, [day]);

  /**
   * Add ml from localStorage truth — never side-effect inside setState.
   * (Side effects in setMl updaters ran twice and logged +1 L as +2 L.)
   */
  function add(amount: number) {
    if (addLockRef.current) return;
    addLockRef.current = true;
    try {
      const added = addWaterDrink(day, amount, goal);
      if (added <= 0) return;
      setMl(loadWater(day));
      setHist(loadWaterHist(day));
    } finally {
      // Release on next frame so one physical click can't double-apply
      window.setTimeout(() => {
        addLockRef.current = false;
      }, 0);
    }
  }

  function undoLast() {
    const h = loadWaterHist(day);
    if (!h.length) return;
    const last = h[h.length - 1];
    const rest = h.slice(0, -1);
    const next = Math.max(0, loadWater(day) - last);
    saveWater(day, next);
    saveWaterHist(day, rest);
    setMl(next);
    setHist(rest);
  }

  function reset() {
    saveWater(day, 0);
    saveWaterHist(day, []);
    setMl(0);
    setHist([]);
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

/** Supplements: single-tap = done · double-tap = pack/buy math (creatine) */
function SupplementsList({ day }: { day: string }) {
  const [done, setDone] = useState(() => loadSupDone(day));
  const [openBuy, setOpenBuy] = useState<string | null>(null);
  const clickTimer = useRef<number | null>(null);

  useEffect(() => {
    const refresh = (event: Event) => {
      const domain = (event as CustomEvent<{ domain?: string }>).detail?.domain;
      if (domain === "supplements") setDone(loadSupDone(day));
    };
    window.addEventListener(MEL_DATA_EVENT, refresh);
    return () => window.removeEventListener(MEL_DATA_EVENT, refresh);
  }, [day]);

  useEffect(() => {
    return () => {
      if (clickTimer.current) window.clearTimeout(clickTimer.current);
    };
  }, []);

  function toggleDone(id: string) {
    setDone((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      saveSupDone(day, next);
      return next;
    });
  }

  function onItemClick(id: string) {
    // Delay single-tap so double-tap can cancel (won't flip done)
    if (clickTimer.current) window.clearTimeout(clickTimer.current);
    clickTimer.current = window.setTimeout(() => {
      toggleDone(id);
      clickTimer.current = null;
    }, 280);
  }

  function onItemDoubleClick(id: string, hasShop: boolean) {
    if (clickTimer.current) {
      window.clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    if (!hasShop) return;
    setOpenBuy((cur) => (cur === id ? null : id));
  }

  return (
    <section className="fx-section fx-supps">
      <h2 className="fx-h2">Supplements</h2>
      <ol className="fx-supp-list">
        {DAILY_SUPPLEMENTS.map((s, i) => {
          const isDone = !!done[s.id];
          const shop = s.shop;
          const buyOpen = openBuy === s.id && !!shop;
          const pack = shop ? supplementPackLasts(shop) : null;
          return (
            <li key={s.id} className={buyOpen ? "is-buy-open" : undefined}>
              <button
                type="button"
                className={`fx-supp-item${isDone ? " is-done" : ""}`}
                onClick={() => onItemClick(s.id)}
                onDoubleClick={() => onItemDoubleClick(s.id, !!shop)}
              >
                <span className="fx-supp-num">{i + 1}.</span>
                <span className="fx-supp-body">
                  <span className="fx-supp-name-row">
                    <span className="fx-supp-name">{s.name}</span>
                    {s.dose ? (
                      <span className="fx-supp-when"> · {s.dose}</span>
                    ) : null}
                    {s.when ? (
                      <span className="fx-supp-when"> · {s.when}</span>
                    ) : null}
                  </span>
                </span>
              </button>
              {buyOpen && shop && pack ? (
                <div className="fx-supp-buy">
                  <p className="fx-supp-buy-line">
                    {shop.url ? (
                      <a
                        className="fx-supp-link"
                        href={shop.url}
                        target="_blank"
                        rel="noreferrer"
                        title={shop.product}
                      >
                        {shop.product}
                      </a>
                    ) : (
                      <span className="fx-supp-product-plain">
                        {shop.product}
                      </span>
                    )}
                  </p>
                  <p className="fx-supp-buy-line">
                    {shop.dailyG} g/day · {shop.size} · online
                  </p>
                  <p className="fx-supp-buy-line">
                    Buy {pack.buyLine} · {pack.daysLabel}
                  </p>
                  <p className="fx-supp-buy-line fx-supp-buy-math">
                    {shop.buyQty && shop.buyQty > 1
                      ? `${shop.buyQty} × ${Math.round(shop.packG)} g · ${shop.dailyG} g/day · once a year · $80`
                      : `${Math.round(shop.packG)} g ÷ ${shop.dailyG} g = ${Math.round(pack.days)} days`}
                  </p>
                </div>
              ) : null}
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

type Props = {
  pageId: string;
  onGo: (id: string) => void;
};

const TAB_TO_PAGE: Record<FitnessTab, string> = {
  sleep: "pg-sleep",
  meals: "pg-meals",
  gym: "pg-gym",
};

export function FitnessExact({ pageId, onGo }: Props) {
  const tab = useMemo(() => tabFromPageId(pageId), [pageId]);

  // Legacy routes → Sleep once (do NOT depend on onGo identity — that re-fired on every
  // sidebar toggle and could blank the shell)
  useEffect(() => {
    if (
      pageId === "pg-whoop"
      || pageId === "pg-body"
      || pageId === "pg-focus"
      || pageId === "pg-screentime"
      || pageId === "pg-screen-time"
      || pageId === "pg-fitness"
    ) {
      onGo("pg-sleep");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when pageId changes
  }, [pageId]);

  function selectTab(t: FitnessTab) {
    onGo(TAB_TO_PAGE[t]);
  }

  // Meals → diet / body / life bank only · Sleep & Gym → founder hero bank
  const quoteChannel = tab === "meals" ? "meals" : "hero";
  const { quote, remaining, limit, msUntilReset, nextQuote } =
    useQuoteRotation(quoteChannel);

  return (
    <div className="fx-page">
      <div className="fx-inner">
        <div
          className={`fx-quote${tab === "meals" ? " is-meals-diet" : ""}`}
          data-quote-channel={quoteChannel}
        >
          <div className="fx-quote-copy">
            <p className="fx-quote-text">“{quote.text}”</p>
            <p className="fx-quote-author">{quote.source}</p>
          </div>
          <div className="fx-quote-tools">
            <QuoteRefreshControl
              remaining={remaining}
              limit={limit}
              msUntilReset={msUntilReset}
              onChange={nextQuote}
              className="fx-quote-refresh"
            />
            {/* + opens Dropbox-style Whoop CSV drop — merge new days only */}
            <WhoopCsvDrop
              onImported={() => {
                window.dispatchEvent(new CustomEvent(WHOOP_EVENT));
              }}
            />
          </div>
        </div>

        {/* Sleep · Meals · Gym only — Focus permanently removed */}
        <nav className="fx-subnav" aria-label="Fitness pages">
          {(
            [
              ["sleep", "Sleep"],
              ["meals", "Meals + Supplements"],
              ["gym", "Gym"],
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
    "pg-focus", // legacy → redirects to Sleep
    "pg-screentime",
    "pg-screen-time",
    "pg-body",
    "pg-whoop",
  ].includes(pageId);
}

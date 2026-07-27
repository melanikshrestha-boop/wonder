/**
 * HabitTracker — Claude soft light artifact.
 *
 *   Continuous day strip from TRACKER_START → today
 *   (new day appears beside the last; scroll left/right for past)
 *   Rings, chart, top habits, habit × day grid
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  addHabit,
  bestStreak,
  currentStreak,
  dayCompletion,
  isChecked,
  loadChecks,
  loadHabits,
  momentum,
  onHabitsChange,
  removeHabit,
  saveChecks,
  saveHabits,
  toggleCheck,
  updateHabit,
  weeklyProgress,
} from "./habitStore";
import type { Habit } from "./habitStore";
import { todayKey } from "./data";
import {
  applyHabitToggleToFitness,
  syncHabitsFromFitness,
} from "./habitAutoSync";
import { MEL_DATA_EVENT } from "./melTools";
import "./habit-tracker.css";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const WEEKDAY = ["S", "M", "T", "W", "T", "F", "S"];

/** First day this tracker exists — nothing before this. */
const TRACKER_START = "2026-07-24";

/** Every calendar day from `from` through `to` inclusive (YYYY-MM-DD). */
function dayRange(from: string, to: string): string[] {
  if (to < from) return [];
  const out: string[] = [];
  let cur = from;
  for (let i = 0; i < 1200 && cur <= to; i++) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/** First day of the calendar month for an ISO date. */
function monthStartOf(iso: string): string {
  const [y, m] = iso.split("-");
  return `${y}-${m}-01`;
}

/** Last day of the calendar month for an ISO date. */
function monthEndOf(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  const last = new Date(y, m, 0).getDate(); // day 0 of next month = last of this
  return `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

/** max of two ISO dates as strings (YYYY-MM-DD sorts lexicographically). */
function isoMax(a: string, b: string): string {
  return a >= b ? a : b;
}

function isoWeekday(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

function monthLabel(iso: string): { year: number; month: number } {
  const [y, m] = iso.split("-").map(Number);
  return { year: y, month: m - 1 };
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/**
 * Soft ring — Claude panel + % in center (not harsh heavy hoops).
 */
function Ring({
  label,
  value,
  color,
  size = 84,
}: {
  label: string;
  value: number;
  color: string;
  size?: number;
}) {
  const stroke = 6;
  const r = size / 2 - stroke - 1;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(1, Math.max(0, value));
  const dash = c * clamped;
  return (
    <div className="hab-ring">
      <div className="hab-ring-dial" style={{ width: size, height: size }}>
        <svg width={size} height={size} aria-hidden>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="rgba(0,0,0,0.06)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeDasharray={`${dash} ${c}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>
        <span className="hab-ring-pct">{pct(value)}</span>
      </div>
      <span className="hab-ring-lbl">{label}</span>
    </div>
  );
}

/** Daily progress chart — Claude soft fill + thin stroke */
function AreaChart({ points, color }: { points: { x: string; y: number }[]; color: string }) {
  const w = 620;
  const h = 150;
  const pad = 8;
  if (!points.length) return null;
  const xs = (i: number) => pad + (i / (points.length - 1 || 1)) * (w - pad * 2);
  const ys = (v: number) => h - pad - v * (h - pad * 2);
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${xs(i)},${ys(p.y)}`).join(" ");
  const area = `${line} L${xs(points.length - 1)},${h - pad} L${xs(0)},${h - pad} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="hab-chart">
      <defs>
        <linearGradient id="hab-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#hab-grad)" />
      <path d={line} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" />
    </svg>
  );
}

export function HabitTracker() {
  const [habits, setHabits] = useState<Habit[]>(() => loadHabits());
  const [checks, setChecks] = useState(() => loadChecks());
  /**
   * Live calendar day. When the clock rolls past midnight:
   *  - a new day column appears to the right of yesterday
   *  - yesterday’s unchecked cells flip to missed (red ×)
   */
  const [today, setToday] = useState(() => todayKey());
  const [newHabit, setNewHabit] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const todayHeadRef = useRef<HTMLTableCellElement>(null);

  useEffect(() => onHabitsChange(() => {
    setHabits(loadHabits());
    setChecks(loadChecks());
  }), []);

  // Pull sleep / water / meals into habit checks on open + whenever fitness logs
  useEffect(() => {
    syncHabitsFromFitness(todayKey());
    setChecks(loadChecks());
    const onData = (event: Event) => {
      const domain = (event as CustomEvent<{ domain?: string }>).detail?.domain;
      if (
        domain
        && !["water", "sleep", "meals", "food", "habits"].includes(domain)
      ) {
        return;
      }
      syncHabitsFromFitness(todayKey());
      setChecks(loadChecks());
    };
    // Also listen to habit store emits from auto-sync (other tabs / Mel)
    const onHabits = () => {
      setChecks(loadChecks());
      setHabits(loadHabits());
    };
    window.addEventListener(MEL_DATA_EVENT, onData);
    window.addEventListener("wonder-habits-update", onHabits);
    return () => {
      window.removeEventListener(MEL_DATA_EVENT, onData);
      window.removeEventListener("wonder-habits-update", onHabits);
    };
  }, []);

  // Keep `today` honest across midnight / tab focus
  useEffect(() => {
    const syncToday = () => {
      const next = todayKey();
      setToday((prev) => (prev === next ? prev : next));
    };
    syncToday();
    const id = window.setInterval(syncToday, 30_000);
    window.addEventListener("focus", syncToday);
    document.addEventListener("visibilitychange", syncToday);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", syncToday);
      document.removeEventListener("visibilitychange", syncToday);
    };
  }, []);

  /**
   * Current month strip:
   *   start = max(TRACKER_START, 1st of this month)  → Jul 24 for July 2026
   *   end   = last day of this month                 → Jul 31
   * Today is open; earlier days miss/check; later days are locked until they arrive.
   * August only appears when the real calendar is in August.
   */
  const liveToday = today < TRACKER_START ? TRACKER_START : today;
  const stripStart = useMemo(
    () => isoMax(TRACKER_START, monthStartOf(liveToday)),
    [liveToday]
  );
  const stripEnd = useMemo(() => monthEndOf(liveToday), [liveToday]);
  const days = useMemo(
    () => dayRange(stripStart, stripEnd),
    [stripStart, stripEnd]
  );
  /** Days that already happened (through today) — for hits / chart / rings */
  const daysElapsed = useMemo(
    () => days.filter((d) => d <= liveToday),
    [days, liveToday]
  );

  const active = habits.filter((h) => !h.archivedAt);
  // Title is ALWAYS the real current month of `today` — not navigable.
  const title = monthLabel(liveToday);

  const canScrollPast = days.length > 10;

  // Keep “today” column in view (not the empty end of month)
  useEffect(() => {
    if (todayHeadRef.current) {
      todayHeadRef.current.scrollIntoView({
        inline: "center",
        block: "nearest",
        behavior: "smooth",
      });
    }
  }, [liveToday, days.length, active.length]);

  function scrollDays(dir: -1 | 1) {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 7 * 24, behavior: "smooth" });
  }

  const dailyToday = active.length
    ? active.filter((h) => isChecked(checks, today, h.id)).length / active.length
    : 0;

  const mom = useMemo(
    () => momentum(active, checks, liveToday),
    [active, checks, liveToday]
  );
  const weekly = useMemo(
    () => weeklyProgress(active, checks, 1, liveToday),
    [active, checks, liveToday]
  );
  const monthly = useMemo(() => {
    if (!daysElapsed.length) return 0;
    let total = 0;
    for (const d of daysElapsed) total += dayCompletion(active, checks, d).ratio;
    return total / daysElapsed.length;
  }, [active, checks, daysElapsed]);

  /** Progress chart: elapsed days this month only (restarts each new month) */
  const trend = useMemo(
    () => daysElapsed.map((d) => ({
      x: d,
      y: dayCompletion(active, checks, d).ratio,
    })),
    [active, checks, daysElapsed]
  );

  /** Top habits for elapsed days in this month strip */
  const top = useMemo(() => {
    return active
      .map((habit) => ({
        habit,
        hits: daysElapsed.filter((d) => isChecked(checks, d, habit.id)).length,
      }))
      .filter((r) => r.hits > 0)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 6);
  }, [active, checks, daysElapsed]);

  /**
   * Real progress only: at least one ✓ this month strip.
   * Also true if any stored check exists for an active habit on/after TRACKER_START
   * (covers edge cases) — chart/top stay fully unmounted until then.
   */
  const hasProgress = useMemo(() => {
    for (const d of daysElapsed) {
      for (const h of active) {
        if (isChecked(checks, d, h.id)) return true;
      }
    }
    // Fallback: any check-in on/after tracker start for a live habit
    const ids = new Set(active.map((h) => h.id));
    for (const [iso, list] of Object.entries(checks)) {
      if (iso < TRACKER_START) continue;
      if (list.some((id) => ids.has(id))) return true;
    }
    return false;
  }, [daysElapsed, active, checks]);

  const showChart = hasProgress && trend.some((p) => p.y > 0);

  const toggle = useCallback((iso: string, hid: string) => {
    setChecks((prev) => {
      const next = toggleCheck(prev, iso, hid);
      saveChecks(next);
      // Water habit ↔ Meals water bar (3.5 L)
      applyHabitToggleToFitness(iso, hid, isChecked(next, iso, hid));
      return next;
    });
  }, []);

  function commitAdd() {
    const name = newHabit.trim();
    if (!name) {
      setAdding(false);
      return;
    }
    // Color + goal auto-picked by store (no emoji in UI)
    const next = addHabit(habits, { name });
    setHabits(next);
    saveHabits(next);
    setNewHabit("");
    setAdding(false);
  }

  function commitEdit(id: string, patch: Partial<Habit>) {
    const next = updateHabit(habits, id, patch);
    setHabits(next);
    saveHabits(next);
  }

  function commitRemove(id: string) {
    if (!confirm("Delete this habit permanently?")) return;
    const next = removeHabit(habits, id);
    setHabits(next);
    saveHabits(next);
  }

  const maxHits = Math.max(1, ...top.map((t) => t.hits));

  return (
    <div className="hab">
      <header className="hab-head">
        {/*
          Arrows ONLY scroll the day strip (past days). They never jump months.
          Hidden until there are enough real past days to scroll.
        */}
        <button
          type="button"
          className="hab-nav"
          onClick={() => scrollDays(-1)}
          aria-label="Scroll to earlier days"
          title="Scroll to earlier days"
          disabled={!canScrollPast}
        >
          ‹
        </button>
        <div className="hab-title">
          <span className="hab-title-year">{title.year}</span>
          <h1>{MONTHS[title.month]}</h1>
        </div>
        <button
          type="button"
          className="hab-nav"
          onClick={() => scrollDays(1)}
          aria-label="Scroll toward today"
          title="Scroll toward today"
          disabled={!canScrollPast}
        >
          ›
        </button>
      </header>

      <section className="hab-rings" aria-label="Progress rings">
        <Ring label="Momentum" value={mom} color="#38bdf8" />
        <Ring label="Today" value={dailyToday} color="#22d3ee" />
        <Ring label="This week" value={weekly} color="#10b981" />
        <Ring label="This month" value={monthly} color="#a78bfa" />
      </section>

      {/* Fully unmounted until real ✓ progress exists — no empty white cards */}
      {showChart ? (
        <section className="hab-panel hab-panel-chart">
          <div className="hab-panel-title">
            Daily progress · {MONTHS[title.month]}
          </div>
          <AreaChart points={trend} color="#38bdf8" />
        </section>
      ) : null}

      {top.length > 0 ? (
        <section className="hab-panel">
          <div className="hab-panel-title">Top habits</div>
          <ul className="hab-bar-list">
            {top.map(({ habit, hits }) => (
              <li key={habit.id}>
                <span className="hab-bar-lbl">
                  <span
                    className="hab-swatch"
                    style={{ background: habit.color }}
                    aria-hidden
                  />
                  {habit.name}
                </span>
                <div className="hab-bar-track">
                  <div
                    className="hab-bar-fill"
                    style={{
                      width: `${(hits / maxHits) * 100}%`,
                      background: habit.color,
                    }}
                  />
                </div>
                <b className="hab-bar-val">{hits}</b>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="hab-grid-wrap">
        <div
          className={`hab-grid-scroll${days.length <= 12 ? " is-short" : ""}`}
          ref={scrollRef}
        >
          <table className="hab-grid">
            <thead>
              <tr>
                <th className="hab-grid-name">Habit</th>
                {days.map((d) => {
                  const dayNum = Number(d.slice(-2));
                  const wd = WEEKDAY[isoWeekday(d)];
                  const isToday = d === today;
                  return (
                    <th
                      key={d}
                      ref={isToday ? todayHeadRef : undefined}
                      className={`hab-grid-day${isToday ? " is-today" : ""}`}
                      data-iso={d}
                    >
                      <span className="hab-grid-wd">{wd}</span>
                      <span className="hab-grid-dn">{dayNum}</span>
                    </th>
                  );
                })}
                <th className="hab-grid-tot">Hits</th>
                <th className="hab-grid-tot">Streak</th>
                <th className="hab-grid-tot">Best</th>
              </tr>
            </thead>
            <tbody>
              {active.map((h) => {
                // Hits so far this month (through today) / days elapsed
                const hits = daysElapsed.filter((d) => isChecked(checks, d, h.id)).length;
                const elapsed = daysElapsed.length || 1;
                const streak = currentStreak(checks, h.id);
                const best = bestStreak(checks, h.id);
                return (
                  <tr key={h.id}>
                    <td className="hab-grid-name">
                      <div className="hab-name-row">
                        {editingId === h.id ? (
                          <input
                            autoFocus
                            className="hab-name-input"
                            defaultValue={h.name}
                            onBlur={(e) => {
                              commitEdit(h.id, {
                                name: e.target.value.trim() || h.name,
                              });
                              setEditingId(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter")
                                (e.target as HTMLInputElement).blur();
                              if (e.key === "Escape") setEditingId(null);
                            }}
                          />
                        ) : (
                          <button
                            type="button"
                            className="hab-grid-name-btn"
                            onClick={() => setEditingId(h.id)}
                            title="Rename"
                          >
                            <span
                              className="hab-swatch"
                              style={{ background: h.color }}
                              aria-hidden
                            />
                            <span className="hab-name-text">{h.name}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          className="hab-x"
                          onClick={() => commitRemove(h.id)}
                          aria-label={`Remove ${h.name}`}
                          title="Remove habit"
                        >
                          <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
                            <path
                              d="M1.2 1.2l5.6 5.6M6.8 1.2L1.2 6.8"
                              stroke="currentColor"
                              strokeWidth="1.2"
                              strokeLinecap="round"
                            />
                          </svg>
                        </button>
                      </div>
                    </td>
                    {days.map((d) => {
                      const on = isChecked(checks, d, h.id);
                      const future = d > liveToday;
                      const past = d < liveToday;
                      const missed = past && !on;
                      return (
                        <td
                          key={d}
                          className={
                            "hab-cell"
                            + (on ? " on" : "")
                            + (missed ? " missed" : "")
                            + (future ? " future" : "")
                          }
                          style={
                            on
                              ? { background: h.color }
                              : missed
                                ? { background: "#ef4444" }
                                : undefined
                          }
                          onClick={() => {
                            if (!future) toggle(d, h.id);
                          }}
                          title={
                            future
                              ? "Not yet — day hasn’t started"
                              : missed
                                ? "Missed (day ended unchecked) — click to mark done"
                                : on
                                  ? "Done — click to undo"
                                  : undefined
                          }
                        >
                          {on ? "✓" : missed ? "×" : ""}
                        </td>
                      );
                    })}
                    <td className="hab-grid-tot"><b>{hits}</b>/{elapsed}</td>
                    <td className="hab-grid-tot" style={{ color: streak > 0 ? h.color : undefined }}>
                      <b>{streak}</b>
                    </td>
                    <td className="hab-grid-tot">{best}</td>
                  </tr>
                );
              })}

              {/*
                Ghost + under the color swatch column — only visible when
                hovering the row below the last habit. Click → name, rest auto.
              */}
              <tr className={`hab-add-row${adding ? " is-open" : ""}`}>
                <td className="hab-grid-name" colSpan={1}>
                  <div className="hab-add-ghost">
                    {adding ? (
                      <input
                        autoFocus
                        className="hab-name-input hab-add-input"
                        value={newHabit}
                        placeholder="New habit name…"
                        onChange={(e) => setNewHabit(e.target.value)}
                        onBlur={() => commitAdd()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitAdd();
                          if (e.key === "Escape") {
                            setNewHabit("");
                            setAdding(false);
                          }
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className="hab-add-plus"
                        aria-label="Add habit"
                        title="Add habit"
                        onClick={() => setAdding(true)}
                      >
                        +
                      </button>
                    )}
                  </div>
                </td>
                {days.map((d) => (
                  <td key={`add-${d}`} className="hab-cell-spacer" />
                ))}
                <td className="hab-grid-tot" />
                <td className="hab-grid-tot" />
                <td className="hab-grid-tot" />
              </tr>
            </tbody>
          </table>
        </div>
      </section>

    </div>
  );
}

export const HABITS_PAGE_ID = "pg-habits";
export function isHabitsPage(id: string): boolean {
  return id === HABITS_PAGE_ID || id === "pg-habit" || id === "pg-habit-tracker";
}

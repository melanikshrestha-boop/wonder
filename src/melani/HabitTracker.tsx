/**
 * HabitTracker — the audacious dashboard.
 *
 * Layout (single page, dense, dark):
 *   ┌─ month title & KPIs (start / end / days left / totals) ┐
 *   │ Momentum ring · Daily ring · Weekly ring · Monthly ring │
 *   │ Daily-progress area chart (30d)                         │
 *   │ Top habits bar · Active streaks bar                     │
 *   │ Habits × days month grid (checkboxes, per-habit color)  │
 *   └─────────────────────────────────────────────────────────┘
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  activeStreaks,
  addHabit,
  bestStreak,
  currentStreak,
  isChecked,
  last30Hits,
  loadChecks,
  loadHabits,
  momentum,
  monthDays,
  monthlyProgress,
  onHabitsChange,
  removeHabit,
  saveChecks,
  saveHabits,
  toggleCheck,
  topHabits,
  trendPoints,
  updateHabit,
  weeklyProgress,
  ymd,
} from "./habitStore";
import type { Habit } from "./habitStore";
import { todayKey } from "./data";
import "./habit-tracker.css";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const WEEKDAY = ["S", "M", "T", "W", "T", "F", "S"];

function isoWeekday(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function Ring({
  label,
  value,
  color,
  size = 96,
}: {
  label: string;
  value: number;
  color: string;
  size?: number;
}) {
  const r = size / 2 - 8;
  const c = 2 * Math.PI * r;
  const dash = c * Math.min(1, Math.max(0, value));
  return (
    <div className="hab-ring">
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
        <circle cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} ${c}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
          fill="#fff" fontSize="18" fontWeight="700">
          {pct(value)}
        </text>
      </svg>
      <span className="hab-ring-lbl">{label}</span>
    </div>
  );
}

function AreaChart({ points, color }: { points: { x: string; y: number }[]; color: string }) {
  const w = 620;
  const h = 140;
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
          <stop offset="0%" stopColor={color} stopOpacity="0.45" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1={pad} x2={w - pad}
          y1={ys(g)} y2={ys(g)}
          stroke="rgba(255,255,255,0.06)" strokeDasharray="3 4" />
      ))}
      <path d={area} fill="url(#hab-grad)" />
      <path d={line} fill="none" stroke={color} strokeWidth="2" />
    </svg>
  );
}

export function HabitTracker() {
  const [habits, setHabits] = useState<Habit[]>(() => loadHabits());
  const [checks, setChecks] = useState(() => loadChecks());
  const today = todayKey();
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [newHabit, setNewHabit] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => onHabitsChange(() => {
    setHabits(loadHabits());
    setChecks(loadChecks());
  }), []);

  const days = useMemo(() => monthDays(viewYear, viewMonth), [viewYear, viewMonth]);
  const monthEnd = days[days.length - 1];
  const monthStart = days[0];
  const daysLeft = Math.max(0, days.filter((d) => d > today).length);
  const active = habits.filter((h) => !h.archivedAt);

  const totalGoal = active.length * days.length;
  const totalDone = days.reduce((sum, d) =>
    sum + active.filter((h) => isChecked(checks, d, h.id)).length, 0);

  const dailyToday = active.length
    ? active.filter((h) => isChecked(checks, today, h.id)).length / active.length
    : 0;

  const mom = useMemo(() => momentum(active, checks), [active, checks]);
  const weekly = useMemo(() => weeklyProgress(active, checks, 1), [active, checks]);
  const monthly = useMemo(() => monthlyProgress(active, checks), [active, checks]);
  const trend = useMemo(() => trendPoints(active, checks, 30), [active, checks]);
  const top = useMemo(() => topHabits(active, checks, 6), [active, checks]);
  const streaks = useMemo(() => activeStreaks(active, checks), [active, checks]);

  const toggle = useCallback((iso: string, hid: string) => {
    setChecks((prev) => {
      const next = toggleCheck(prev, iso, hid);
      saveChecks(next);
      return next;
    });
  }, []);

  function commitAdd() {
    const name = newHabit.trim();
    if (!name) return;
    const next = addHabit(habits, { name });
    setHabits(next);
    saveHabits(next);
    setNewHabit("");
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

  function changeMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setViewMonth(m);
    setViewYear(y);
  }

  const maxHits = Math.max(1, ...top.map((t) => t.hits));
  const maxStreak = Math.max(1, ...streaks.map((s) => s.streak));

  return (
    <div className="hab">
      <header className="hab-head">
        <button className="hab-nav" onClick={() => changeMonth(-1)} aria-label="Previous month">‹</button>
        <div className="hab-title">
          <span className="hab-title-year">{viewYear}</span>
          <h1>{MONTHS[viewMonth]}</h1>
          <p>Habit tracker · every day, or it doesn't count</p>
        </div>
        <button className="hab-nav" onClick={() => changeMonth(1)} aria-label="Next month">›</button>
      </header>

      <section className="hab-kpi-row">
        <div className="hab-kpi-block">
          <div className="hab-kpi"><span>Start</span><b>{monthStart}</b></div>
          <div className="hab-kpi"><span>End</span><b>{monthEnd}</b></div>
          <div className="hab-kpi"><span>Days left</span><b>{daysLeft}</b></div>
          <div className="hab-kpi"><span>Habits</span><b>{active.length}</b></div>
          <div className="hab-kpi"><span>Goal</span><b>{totalGoal}</b></div>
          <div className="hab-kpi hab-kpi-done"><span>Done</span><b>{totalDone}</b></div>
        </div>
        <div className="hab-rings">
          <Ring label="Momentum"  value={mom}       color="#38bdf8" />
          <Ring label="Today"     value={dailyToday} color="#22d3ee" />
          <Ring label="This week" value={weekly}    color="#10b981" />
          <Ring label="This month" value={monthly}  color="#a78bfa" />
        </div>
      </section>

      <section className="hab-panel">
        <div className="hab-panel-title">Daily progress · last 30 days</div>
        <AreaChart points={trend} color="#22d3ee" />
      </section>

      <section className="hab-two">
        <div className="hab-panel">
          <div className="hab-panel-title">Top habits · last 30 days</div>
          <ul className="hab-bar-list">
            {top.length === 0 ? (
              <li className="hab-empty">No check-ins yet. Start clicking.</li>
            ) : top.map(({ habit, hits }) => (
              <li key={habit.id}>
                <span className="hab-bar-lbl">{habit.emoji} {habit.name}</span>
                <div className="hab-bar-track">
                  <div className="hab-bar-fill"
                    style={{ width: `${(hits / maxHits) * 100}%`, background: habit.color }} />
                </div>
                <b className="hab-bar-val">{hits}</b>
              </li>
            ))}
          </ul>
        </div>
        <div className="hab-panel">
          <div className="hab-panel-title">Active streaks</div>
          <ul className="hab-bar-list">
            {streaks.length === 0 ? (
              <li className="hab-empty">No live streaks — hit something today.</li>
            ) : streaks.map(({ habit, streak }) => (
              <li key={habit.id}>
                <span className="hab-bar-lbl">{habit.emoji} {habit.name}</span>
                <div className="hab-bar-track">
                  <div className="hab-bar-fill"
                    style={{ width: `${(streak / maxStreak) * 100}%`, background: habit.color }} />
                </div>
                <b className="hab-bar-val">{streak}d</b>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="hab-grid-wrap">
        <div className="hab-panel-title">
          Month grid — click a cell to mark
          <span className="hab-add-inline">
            <input
              value={newHabit}
              placeholder="+ add habit"
              onChange={(e) => setNewHabit(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") commitAdd(); }}
            />
            <button type="button" onClick={commitAdd}>Add</button>
          </span>
        </div>
        <div className="hab-grid-scroll">
          <table className="hab-grid">
            <thead>
              <tr>
                <th className="hab-grid-name">Habit</th>
                <th className="hab-grid-goal">Goal</th>
                {days.map((d) => {
                  const dayNum = Number(d.slice(-2));
                  const wd = WEEKDAY[isoWeekday(d)];
                  const isToday = d === today;
                  return (
                    <th key={d} className={`hab-grid-day${isToday ? " is-today" : ""}`}>
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
                const hits = days.filter((d) => isChecked(checks, h.id ? d : d, h.id)).length;
                const streak = currentStreak(checks, h.id);
                const best = bestStreak(checks, h.id);
                return (
                  <tr key={h.id}>
                    <td className="hab-grid-name">
                      {editingId === h.id ? (
                        <input
                          autoFocus
                          defaultValue={h.name}
                          onBlur={(e) => { commitEdit(h.id, { name: e.target.value.trim() || h.name }); setEditingId(null); }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                            if (e.key === "Escape") setEditingId(null);
                          }}
                        />
                      ) : (
                        <button className="hab-grid-name-btn" onClick={() => setEditingId(h.id)}>
                          <span className="hab-swatch" style={{ background: h.color }} />
                          <span className="hab-emoji">{h.emoji}</span>
                          <span>{h.name}</span>
                        </button>
                      )}
                      <button className="hab-x" onClick={() => commitRemove(h.id)} aria-label="Remove">×</button>
                    </td>
                    <td className="hab-grid-goal">{h.weeklyTarget}/w</td>
                    {days.map((d) => {
                      const on = isChecked(checks, d, h.id);
                      const future = d > today;
                      return (
                        <td key={d}
                          className={`hab-cell${on ? " on" : ""}${future ? " future" : ""}${d === today ? " today" : ""}`}
                          style={on ? { background: h.color } : undefined}
                          onClick={() => { if (!future) toggle(d, h.id); }}
                        >
                          {on ? "✓" : ""}
                        </td>
                      );
                    })}
                    <td className="hab-grid-tot"><b>{hits}</b>/{days.length}</td>
                    <td className="hab-grid-tot" style={{ color: streak > 0 ? h.color : undefined }}>
                      <b>{streak}</b>
                    </td>
                    <td className="hab-grid-tot">{best}</td>
                  </tr>
                );
              })}
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

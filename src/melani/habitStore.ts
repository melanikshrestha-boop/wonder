/**
 * Habit tracker store.
 * Ten seed habits, per-day check-ins persisted to localStorage, and
 * aggregations (streaks, momentum, weekly/monthly/annual roll-ups) built
 * so the UI can render Excel-style dashboards without recomputing.
 */
import { todayKey } from "./data";

export type HabitCadence = "daily" | "weekly" | "monthly";

export type Habit = {
  id: string;
  name: string;
  emoji: string;
  color: string;         // accent hex used everywhere in the UI
  cadence: HabitCadence; // for now everything is daily; kept for schema
  weeklyTarget: number;  // times/week you want to hit it (1..7)
  createdAt: number;
  archivedAt: number | null;
};

/** iso day -> Set of habit ids checked that day */
export type CheckMap = Record<string, string[]>;

const HABITS_KEY = "wonder-habits-v1";
const CHECKS_KEY = "wonder-habit-checks-v1";
const EVENT = "wonder-habits-update";

const SEED_PALETTE = [
  "#f472b6", // pink
  "#f59e0b", // amber
  "#10b981", // emerald
  "#6366f1", // indigo
  "#22d3ee", // cyan
  "#ef4444", // red
  "#a78bfa", // violet
  "#84cc16", // lime
  "#f97316", // orange
  "#38bdf8", // sky
];

const SEED_HABITS: Omit<Habit, "createdAt" | "archivedAt">[] = [
  { id: "hb-1",  name: "Wake at 5:30",           emoji: "⏰", color: SEED_PALETTE[0], cadence: "daily", weeklyTarget: 7 },
  { id: "hb-2",  name: "Gym — hard hour",        emoji: "🏋", color: SEED_PALETTE[1], cadence: "daily", weeklyTarget: 6 },
  { id: "hb-3",  name: "3L water",               emoji: "💧", color: SEED_PALETTE[2], cadence: "daily", weeklyTarget: 7 },
  { id: "hb-4",  name: "Deep work — 4h",         emoji: "🧠", color: SEED_PALETTE[3], cadence: "daily", weeklyTarget: 6 },
  { id: "hb-5",  name: "Read 30 min",            emoji: "📖", color: SEED_PALETTE[4], cadence: "daily", weeklyTarget: 7 },
  { id: "hb-6",  name: "Skin routine (AM + PM)", emoji: "✨", color: SEED_PALETTE[5], cadence: "daily", weeklyTarget: 7 },
  { id: "hb-7",  name: "Track every dollar",     emoji: "💸", color: SEED_PALETTE[6], cadence: "daily", weeklyTarget: 7 },
  { id: "hb-8",  name: "No sugar",               emoji: "🚫", color: SEED_PALETTE[7], cadence: "daily", weeklyTarget: 6 },
  { id: "hb-9",  name: "Journal — 10 min",       emoji: "📓", color: SEED_PALETTE[8], cadence: "daily", weeklyTarget: 7 },
  { id: "hb-10", name: "Sleep by 10:30",         emoji: "🌙", color: SEED_PALETTE[9], cadence: "daily", weeklyTarget: 7 },
];

function emitChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EVENT));
}

export function onHabitsChange(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

export function loadHabits(): Habit[] {
  try {
    const raw = typeof localStorage !== "undefined"
      ? localStorage.getItem(HABITS_KEY)
      : null;
    if (raw) {
      const parsed = JSON.parse(raw) as Habit[];
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch { /* ignore */ }
  const now = Date.now();
  const seeded = SEED_HABITS.map((h) => ({
    ...h,
    createdAt: now,
    archivedAt: null,
  }));
  saveHabits(seeded);
  return seeded;
}

export function saveHabits(habits: Habit[]) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(HABITS_KEY, JSON.stringify(habits));
    }
  } catch { /* ignore */ }
  emitChange();
}

export function loadChecks(): CheckMap {
  try {
    const raw = typeof localStorage !== "undefined"
      ? localStorage.getItem(CHECKS_KEY)
      : null;
    if (raw) {
      const parsed = JSON.parse(raw) as CheckMap;
      if (parsed && typeof parsed === "object") return parsed;
    }
  } catch { /* ignore */ }
  return {};
}

export function saveChecks(map: CheckMap) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(CHECKS_KEY, JSON.stringify(map));
    }
  } catch { /* ignore */ }
  emitChange();
}

export function toggleCheck(map: CheckMap, iso: string, habitId: string): CheckMap {
  const list = new Set(map[iso] || []);
  if (list.has(habitId)) list.delete(habitId);
  else list.add(habitId);
  const next: CheckMap = { ...map };
  if (list.size) next[iso] = Array.from(list);
  else delete next[iso];
  return next;
}

export function isChecked(map: CheckMap, iso: string, habitId: string): boolean {
  return (map[iso] || []).includes(habitId);
}

// ─── Aggregations ────────────────────────────────────────────────────────────

export function ymd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + delta);
  return ymd(date);
}

export function monthDays(year: number, month0: number): string[] {
  const last = new Date(year, month0 + 1, 0).getDate();
  const days: string[] = [];
  for (let d = 1; d <= last; d++) {
    days.push(ymd(new Date(year, month0, d)));
  }
  return days;
}

/** Longest run of days ending at `until` for this habit. */
export function currentStreak(map: CheckMap, habitId: string, until: string = todayKey()): number {
  let streak = 0;
  let cursor = until;
  while (isChecked(map, cursor, habitId)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** Longest historical streak ever recorded for the habit. */
export function bestStreak(map: CheckMap, habitId: string): number {
  const dates = Object.keys(map).sort();
  if (!dates.length) return 0;
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const iso of dates) {
    if (!isChecked(map, iso, habitId)) { run = 0; prev = iso; continue; }
    if (prev && addDays(prev, 1) === iso) run += 1;
    else run = 1;
    if (run > best) best = run;
    prev = iso;
  }
  return best;
}

/** How many of the past 30 days you hit this habit (0..30). */
export function last30Hits(map: CheckMap, habitId: string, until: string = todayKey()): number {
  let hits = 0;
  let cursor = until;
  for (let i = 0; i < 30; i++) {
    if (isChecked(map, cursor, habitId)) hits += 1;
    cursor = addDays(cursor, -1);
  }
  return hits;
}

/** Daily completion ratio for one day: how many habits (active) you hit. */
export function dayCompletion(
  habits: Habit[],
  map: CheckMap,
  iso: string
): { done: number; total: number; ratio: number } {
  const active = habits.filter((h) => !h.archivedAt);
  const done = active.filter((h) => isChecked(map, iso, h.id)).length;
  const total = active.length || 1;
  return { done, total, ratio: done / total };
}

/** Momentum: exponentially weighted 30-day completion (higher = hotter). */
export function momentum(habits: Habit[], map: CheckMap, until: string = todayKey()): number {
  let total = 0;
  let weight = 0;
  let cursor = until;
  for (let i = 0; i < 30; i++) {
    const w = Math.pow(0.94, i);
    total += dayCompletion(habits, map, cursor).ratio * w;
    weight += w;
    cursor = addDays(cursor, -1);
  }
  return weight > 0 ? total / weight : 0;
}

/** Weekly completion for the past N ISO weeks. */
export function weeklyProgress(
  habits: Habit[],
  map: CheckMap,
  weeks = 1,
  until: string = todayKey()
): number {
  const days = weeks * 7;
  let total = 0;
  let cursor = until;
  for (let i = 0; i < days; i++) {
    total += dayCompletion(habits, map, cursor).ratio;
    cursor = addDays(cursor, -1);
  }
  return days > 0 ? total / days : 0;
}

/** Monthly completion for the current month up to `until`. */
export function monthlyProgress(
  habits: Habit[],
  map: CheckMap,
  until: string = todayKey()
): number {
  const [y, m] = until.split("-").map(Number);
  const days = monthDays(y, m - 1).filter((d) => d <= until);
  if (!days.length) return 0;
  let total = 0;
  for (const d of days) total += dayCompletion(habits, map, d).ratio;
  return total / days.length;
}

/** Line-chart points: daily completion % for last N days (oldest → newest). */
export function trendPoints(
  habits: Habit[],
  map: CheckMap,
  days = 30,
  until: string = todayKey()
): { x: string; y: number }[] {
  const out: { x: string; y: number }[] = [];
  let cursor = addDays(until, -(days - 1));
  for (let i = 0; i < days; i++) {
    out.push({ x: cursor, y: dayCompletion(habits, map, cursor).ratio });
    cursor = addDays(cursor, 1);
  }
  return out;
}

/** Top-hit habits over last 30 days, sorted desc. */
export function topHabits(
  habits: Habit[],
  map: CheckMap,
  n = 5
): { habit: Habit; hits: number }[] {
  return habits
    .filter((h) => !h.archivedAt)
    .map((habit) => ({ habit, hits: last30Hits(map, habit.id) }))
    .sort((a, b) => b.hits - a.hits)
    .slice(0, n);
}

/** All active streaks, sorted longest first. */
export function activeStreaks(
  habits: Habit[],
  map: CheckMap
): { habit: Habit; streak: number }[] {
  return habits
    .filter((h) => !h.archivedAt)
    .map((habit) => ({ habit, streak: currentStreak(map, habit.id) }))
    .filter((r) => r.streak > 0)
    .sort((a, b) => b.streak - a.streak);
}

export function addHabit(habits: Habit[], partial: Partial<Habit> & { name: string }): Habit[] {
  const now = Date.now();
  const id = partial.id || `hb-${now.toString(36)}`;
  const color = partial.color || SEED_PALETTE[habits.length % SEED_PALETTE.length];
  const habit: Habit = {
    id,
    name: partial.name,
    emoji: partial.emoji || "✅",
    color,
    cadence: partial.cadence || "daily",
    weeklyTarget: partial.weeklyTarget ?? 7,
    createdAt: now,
    archivedAt: null,
  };
  return [...habits, habit];
}

export function updateHabit(habits: Habit[], id: string, patch: Partial<Habit>): Habit[] {
  return habits.map((h) => (h.id === id ? { ...h, ...patch } : h));
}

export function removeHabit(habits: Habit[], id: string): Habit[] {
  return habits.filter((h) => h.id !== id);
}

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

/**
 * Curated swatch palette — every entry is distinct. Used first when
 * assigning colors; never recycle a hex already owned by another habit.
 * Beyond this list we synthesize unique HSL colors forever.
 */
const HABIT_PALETTE = [
  "#f472b6", // pink
  "#f59e0b", // amber
  "#10b981", // emerald
  "#6366f1", // indigo
  "#22d3ee", // cyan
  "#fb7185", // soft rose
  "#a78bfa", // violet
  "#84cc16", // lime
  "#f97316", // orange
  "#38bdf8", // sky
  "#e11d48", // rose-700
  "#0d9488", // teal
  "#7c3aed", // violet-600
  "#ea580c", // orange-600
  "#059669", // emerald-600
  "#2563eb", // blue-600
  "#db2777", // pink-600
  "#ca8a04", // yellow-600
  "#4f46e5", // indigo-600
  "#0891b2", // cyan-600
  "#be123c", // rose-700 deep
  "#65a30d", // lime-600
  "#9333ea", // purple-600
  "#dc2626", // red-600 (deeper than pure brick)
  "#0ea5e9", // sky-500
  "#c026d3", // fuchsia
  "#16a34a", // green-600
  "#d97706", // amber-600
  "#8b5cf6", // violet-500
  "#14b8a6", // teal-500
  "#f43f5e", // rose-500
  "#3b82f6", // blue-500
  "#a3e635", // lime-400
  "#e879f9", // fuchsia-400
  "#2dd4bf", // teal-400
  "#fb923c", // orange-400
  "#818cf8", // indigo-400
  "#4ade80", // green-400
  "#fbbf24", // amber-400
  "#f9a8d4", // pink-300
  "#67e8f9", // cyan-300
  "#c084fc", // purple-400
  "#fdba74", // orange-300
  "#86efac", // green-300
  "#93c5fd", // blue-300
  "#fcd34d", // amber-300
  "#fda4af", // rose-300
  "#5eead4", // teal-300
];

const SEED_HABITS: Omit<Habit, "createdAt" | "archivedAt">[] = [
  { id: "hb-1",  name: "Wake at 5:30",           emoji: "⏰", color: HABIT_PALETTE[0], cadence: "daily", weeklyTarget: 7 },
  { id: "hb-2",  name: "Gym — hard hour",        emoji: "🏋", color: HABIT_PALETTE[1], cadence: "daily", weeklyTarget: 6 },
  { id: "hb-3",  name: "3.5L water + Diet",      emoji: "💧", color: HABIT_PALETTE[2], cadence: "daily", weeklyTarget: 7 },
  { id: "hb-4",  name: "Deep work — 4h",         emoji: "🧠", color: HABIT_PALETTE[3], cadence: "daily", weeklyTarget: 6 },
  { id: "hb-5",  name: "Read 30 min",            emoji: "📖", color: HABIT_PALETTE[4], cadence: "daily", weeklyTarget: 7 },
  { id: "hb-6",  name: "Skin routine (AM + PM)", emoji: "✨", color: HABIT_PALETTE[5], cadence: "daily", weeklyTarget: 7 },
  { id: "hb-7",  name: "Track every dollar",     emoji: "💸", color: HABIT_PALETTE[6], cadence: "daily", weeklyTarget: 7 },
  { id: "hb-8",  name: "No sugar",               emoji: "🚫", color: HABIT_PALETTE[7], cadence: "daily", weeklyTarget: 6 },
  { id: "hb-9",  name: "Journal — 10 min",       emoji: "📓", color: HABIT_PALETTE[8], cadence: "daily", weeklyTarget: 7 },
  { id: "hb-10", name: "Sleep by 10:30",         emoji: "🌙", color: HABIT_PALETTE[9], cadence: "daily", weeklyTarget: 7 },
];

/** Normalize hex to lowercase #rrggbb so comparisons never miss case/format. */
export function normalizeHabitColor(hex: string | null | undefined): string {
  if (!hex || typeof hex !== "string") return "";
  let s = hex.trim().toLowerCase();
  if (!s.startsWith("#")) s = `#${s}`;
  // #rgb → #rrggbb
  if (/^#[0-9a-f]{3}$/.test(s)) {
    s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  }
  if (!/^#[0-9a-f]{6}$/.test(s)) return "";
  return s;
}

function hslToHex(h: number, s: number, l: number): string {
  // h 0–360, s/l 0–100 → #rrggbb
  const sat = Math.max(0, Math.min(100, s)) / 100;
  const light = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) { r = c; g = x; }
  else if (hp < 2) { r = x; g = c; }
  else if (hp < 3) { g = c; b = x; }
  else if (hp < 4) { g = x; b = c; }
  else if (hp < 5) { r = x; b = c; }
  else { r = c; b = x; }
  const m = light - c / 2;
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/**
 * Synthesize a unique-looking color by index when the curated palette is
 * exhausted. Golden-angle hue steps keep neighbors far apart on the wheel.
 */
function syntheticColor(index: number): string {
  const hue = (index * 137.508) % 360;
  const sat = 58 + (index % 4) * 7;   // 58–79
  const light = 46 + (index % 3) * 6; // 46–58 — solid on white/dark
  return hslToHex(hue, sat, light);
}

/** Every color currently owned by a habit (normalized). */
export function usedHabitColors(habits: Habit[], exceptId?: string): Set<string> {
  const set = new Set<string>();
  for (const h of habits) {
    if (exceptId && h.id === exceptId) continue;
    const c = normalizeHabitColor(h.color);
    if (c) set.add(c);
  }
  return set;
}

/**
 * Next free color that no other habit uses. Never reuses a taken hex.
 * Prefer curated palette, then infinite synthetic hues.
 */
export function nextUniqueHabitColor(habits: Habit[], exceptId?: string): string {
  const used = usedHabitColors(habits, exceptId);
  for (const p of HABIT_PALETTE) {
    const n = normalizeHabitColor(p);
    if (n && !used.has(n)) return n;
  }
  // Palette full — walk synthetic forever until free
  for (let i = 0; i < 10_000; i++) {
    const n = normalizeHabitColor(syntheticColor(i));
    if (n && !used.has(n)) return n;
  }
  // Astronomically unreachable; still unique-ish
  return syntheticColor(Date.now() % 10_000);
}

/** First free color not in `seen` (palette, then synthetic forever). */
function firstFreeColor(seen: Set<string>): string {
  for (const p of HABIT_PALETTE) {
    const n = normalizeHabitColor(p);
    if (n && !seen.has(n)) return n;
  }
  for (let i = 0; i < 10_000; i++) {
    const n = normalizeHabitColor(syntheticColor(i));
    if (n && !seen.has(n)) return n;
  }
  return syntheticColor(Date.now() % 10_000);
}

/**
 * Ensure every habit has a distinct color. First-seen keeps its color;
 * later duplicates get the next free unique. Also maps legacy pure-red.
 */
export function ensureUniqueHabitColors(habits: Habit[]): { habits: Habit[]; changed: boolean } {
  const seen = new Set<string>();
  let changed = false;
  const out = habits.map((h) => {
    let color = normalizeHabitColor(h.color);
    // Legacy pure-red → soft rose (uniqueness may reassign if already taken)
    if (h.color === "#ef4444" || h.color === "#EF4444") {
      color = "#fb7185";
    }
    if (!color || seen.has(color)) {
      color = firstFreeColor(seen);
    }
    seen.add(color);
    if (color !== h.color) {
      changed = true;
      return { ...h, color };
    }
    return h;
  });
  return { habits: out, changed };
}

function emitChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EVENT));
}

/** Union two check maps — never drop a day or a habit id already present. */
export function mergeCheckMaps(a: CheckMap, b: CheckMap | null | undefined): CheckMap {
  const out: CheckMap = { ...a };
  if (!b || typeof b !== "object") return out;
  for (const [day, ids] of Object.entries(b)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    if (!Array.isArray(ids)) continue;
    const set = new Set([...(out[day] || []), ...ids.filter(Boolean)]);
    if (set.size) out[day] = Array.from(set);
  }
  return out;
}

function checkMapSize(map: CheckMap): number {
  return Object.values(map).reduce((n, ids) => n + (ids?.length || 0), 0);
}

/**
 * Recovered checks from Chrome LevelDB forensics (2026-07-31).
 * Merged on load — never used to wipe fuller local history.
 */
const HABIT_CHECKS_ARCHIVE: CheckMap = {
  // Only recoverable fragment after empty-disk overwrite incident
  "2026-07-25": ["hb-10"], // Sleep by 10:30
};

/** Push a key to ~/.wonder/local — refuse to mirror empty over known non-empty. */
function pushSharedState(key: string, value: unknown) {
  if (typeof fetch === "undefined") return;
  // Never publish empty checks — that is how history got wiped before
  if (key === CHECKS_KEY) {
    const map = (value && typeof value === "object" ? value : {}) as CheckMap;
    if (checkMapSize(map) === 0) return;
  }
  if (key === HABITS_KEY && Array.isArray(value) && value.length === 0) return;
  try {
    void fetch("/api/wonder-state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
      keepalive: true,
    }).catch(() => {
      /* server optional */
    });
  } catch {
    /* ignore */
  }
}

/**
 * Pull shared state from disk into localStorage (widget ↔ Chrome bridge).
 * MERGE ONLY — empty disk must never erase local checks.
 */
export async function hydrateHabitsFromShared(): Promise<boolean> {
  if (typeof fetch === "undefined" || typeof localStorage === "undefined") {
    return false;
  }
  let changed = false;
  try {
    // Always fold forensic archive first
    const local0 = loadChecks();
    const withArchive = mergeCheckMaps(local0, HABIT_CHECKS_ARCHIVE);
    if (checkMapSize(withArchive) > checkMapSize(local0)) {
      localStorage.setItem(CHECKS_KEY, JSON.stringify(withArchive));
      changed = true;
    }

    const [hRes, cRes] = await Promise.all([
      fetch(`/api/wonder-state?key=${encodeURIComponent(HABITS_KEY)}`),
      fetch(`/api/wonder-state?key=${encodeURIComponent(CHECKS_KEY)}`),
    ]);
    if (hRes.ok) {
      const body = (await hRes.json()) as { value?: Habit[] | null };
      // Only take remote habits if we have none local (or remote is longer list)
      const localRaw = localStorage.getItem(HABITS_KEY);
      let localHabits: Habit[] = [];
      try {
        if (localRaw) localHabits = JSON.parse(localRaw) as Habit[];
      } catch {
        /* ignore */
      }
      if (
        Array.isArray(body.value) &&
        body.value.length &&
        (!Array.isArray(localHabits) || localHabits.length === 0)
      ) {
        localStorage.setItem(HABITS_KEY, JSON.stringify(body.value));
        changed = true;
      }
    }
    if (cRes.ok) {
      const body = (await cRes.json()) as { value?: CheckMap | null };
      const remote = body.value;
      // CRITICAL: empty {} remote must NOT overwrite local
      if (remote && typeof remote === "object" && !Array.isArray(remote)) {
        if (checkMapSize(remote) === 0) {
          // disk is empty — push local up if we have data
          const local = loadChecks();
          if (checkMapSize(local) > 0) pushSharedState(CHECKS_KEY, local);
        } else {
          const local = loadChecks();
          const merged = mergeCheckMaps(local, remote);
          if (JSON.stringify(merged) !== JSON.stringify(local)) {
            localStorage.setItem(CHECKS_KEY, JSON.stringify(merged));
            changed = true;
          }
          // Mirror the richer merge back to disk
          pushSharedState(CHECKS_KEY, merged);
        }
      }
    }
  } catch {
    /* offline / no API */
  }
  if (changed) emitChange();
  return changed;
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
      if (Array.isArray(parsed) && parsed.length) {
        // Never allow two habits to share a swatch — migrate on read
        const { habits: fixed, changed } = ensureUniqueHabitColors(parsed);
        if (changed) {
          try {
            localStorage.setItem(HABITS_KEY, JSON.stringify(fixed));
            pushSharedState(HABITS_KEY, fixed);
          } catch { /* ignore */ }
        }
        return fixed;
      }
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
  pushSharedState(HABITS_KEY, habits);
  emitChange();
}

const CHECKS_RECOVERY_FLAG = "wonder-habit-checks-recovered-v2";

/**
 * One-shot: fold forensic archive into local checks (never again if already done).
 * Safe to call on every load — flag prevents re-adding after user unchecks.
 */
export function ensureHabitChecksRecovered(): CheckMap {
  const local = (() => {
    try {
      const raw = localStorage.getItem(CHECKS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CheckMap;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch {
      /* ignore */
    }
    return {} as CheckMap;
  })();

  try {
    if (localStorage.getItem(CHECKS_RECOVERY_FLAG) === "1") {
      return local;
    }
  } catch {
    /* ignore */
  }

  const merged = mergeCheckMaps(local, HABIT_CHECKS_ARCHIVE);
  try {
    localStorage.setItem(CHECKS_KEY, JSON.stringify(merged));
    localStorage.setItem(CHECKS_RECOVERY_FLAG, "1");
    if (checkMapSize(merged) > 0) pushSharedState(CHECKS_KEY, merged);
  } catch {
    /* ignore */
  }
  return merged;
}

export function loadChecks(): CheckMap {
  return ensureHabitChecksRecovered();
}

export function saveChecks(map: CheckMap) {
  // Full map from UI (toggle owns truth for each day). Never push empty to disk.
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(CHECKS_KEY, JSON.stringify(map));
    }
  } catch { /* ignore */ }
  pushSharedState(CHECKS_KEY, map);
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

/** Force a habit on or off for a day (Mel + fitness auto-sync). */
export function setCheck(
  map: CheckMap,
  iso: string,
  habitId: string,
  checked: boolean
): CheckMap {
  const list = new Set(map[iso] || []);
  if (checked) list.add(habitId);
  else list.delete(habitId);
  const next: CheckMap = { ...map };
  if (list.size) next[iso] = Array.from(list);
  else delete next[iso];
  return next;
}

/** Check or uncheck every active habit for one day. */
export function setAllChecks(
  map: CheckMap,
  iso: string,
  habitIds: string[],
  checked: boolean
): CheckMap {
  let next = map;
  for (const id of habitIds) {
    next = setCheck(next, iso, id, checked);
  }
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
  map: CheckMap,
  until: string = todayKey()
): { habit: Habit; streak: number }[] {
  return habits
    .filter((h) => !h.archivedAt)
    .map((habit) => ({ habit, streak: currentStreak(map, habit.id, until) }))
    .filter((r) => r.streak > 0)
    .sort((a, b) => b.streak - a.streak);
}

const ADD_EMOJIS = ["✅", "💪", "🔥", "⭐", "🎯", "🌿", "💎", "🚀", "✨", "📌"];

export function addHabit(habits: Habit[], partial: Partial<Habit> & { name: string }): Habit[] {
  const now = Date.now();
  const id = partial.id || `hb-${now.toString(36)}`;
  const n = habits.length;
  // Never reuse a color already on another habit
  const requested = normalizeHabitColor(partial.color);
  const used = usedHabitColors(habits);
  const color =
    requested && !used.has(requested)
      ? requested
      : nextUniqueHabitColor(habits);
  const habit: Habit = {
    id,
    name: partial.name,
    emoji: partial.emoji || ADD_EMOJIS[n % ADD_EMOJIS.length],
    color,
    cadence: partial.cadence || "daily",
    weeklyTarget: partial.weeklyTarget ?? 7,
    createdAt: now,
    archivedAt: null,
  };
  return [...habits, habit];
}

export function updateHabit(habits: Habit[], id: string, patch: Partial<Habit>): Habit[] {
  return habits.map((h) => {
    if (h.id !== id) return h;
    const next = { ...h, ...patch };
    // If color was set/changed, force uniqueness vs every other habit
    if (patch.color != null) {
      const requested = normalizeHabitColor(patch.color);
      const used = usedHabitColors(habits, id);
      next.color =
        requested && !used.has(requested)
          ? requested
          : nextUniqueHabitColor(habits, id);
    }
    return next;
  });
}

export function removeHabit(habits: Habit[], id: string): Habit[] {
  return habits.filter((h) => h.id !== id);
}

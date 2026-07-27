/**
 * Auto-link Fitness data ↔ Habit checks (bidirectional for water).
 *
 * Fitness → Habits:
 *   Sleep ≥ 8h  → sleep habit
 *   Water ≥ 3.5L → water / "3.5L water + Diet" habit
 *   Meals logged → diet half of water+diet (or soft flag from habit check)
 *   Wake ≤ 6:00 → wake habit
 *
 * Habits → Fitness:
 *   Checking a water habit fills Meals water bar to 3.5 L
 *   (the other way: logging water to 3.5 L checks the habit)
 */
import { todayKey } from "./data";
import {
  isChecked,
  loadChecks,
  loadHabits,
  saveChecks,
  setCheck,
  type CheckMap,
  type Habit,
} from "./habitStore";
import { loadSleepDay } from "./sleepStore";

// Same event string as melTools.MEL_DATA_EVENT (avoid circular import)
const MEL_DATA_EVENT = "dr-melani-data-update";

/** Shared goal: Meals water bar + habit threshold (3.5 L) */
export const WATER_GOAL_ML = 3500;
const WATER_HABIT_ML = WATER_GOAL_ML;
const SLEEP_HABIT_HOURS = 8;
const WAKE_HABIT_MINS = 6 * 60; // 06:00
const WATER_KEY = "dr-melani-water-ml";
const DIET_OK_KEY = "dr-melani-habit-diet-ok"; // soft flag when combined habit is checked

function waterMl(day: string): number {
  try {
    return Math.max(0, Number(localStorage.getItem(`${WATER_KEY}:${day}`)) || 0);
  } catch {
    return 0;
  }
}

function setWaterMl(day: string, ml: number) {
  const next = Math.max(0, Math.round(ml));
  try {
    localStorage.setItem(`${WATER_KEY}:${day}`, String(next));
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(MEL_DATA_EVENT, { detail: { domain: "water", day } })
    );
  }
}

function dietOk(day: string): boolean {
  try {
    return localStorage.getItem(`${DIET_OK_KEY}:${day}`) === "1";
  } catch {
    return false;
  }
}

function setDietOk(day: string, ok: boolean) {
  try {
    if (ok) localStorage.setItem(`${DIET_OK_KEY}:${day}`, "1");
    else localStorage.removeItem(`${DIET_OK_KEY}:${day}`);
  } catch {
    /* ignore */
  }
}

function mealsLoggedCount(day: string): number {
  try {
    const raw = localStorage.getItem(`dr-melani-meals-usuals:${day}`);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { loggedIds?: string[] };
    return Array.isArray(parsed?.loggedIds) ? parsed.loggedIds.length : 0;
  } catch {
    return 0;
  }
}

function parseWakeMins(wake: string): number | null {
  if (!wake) return null;
  const parts = wake.trim().split(":").map(Number);
  if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return null;
  return parts[0] * 60 + parts[1];
}

function nameOf(h: Habit): string {
  return (h.name || "").toLowerCase();
}

/** Which auto-rule a habit name maps to (null = manual only). */
export function habitAutoKind(
  habit: Habit
): "sleep" | "water_diet" | "water" | "diet" | "wake" | null {
  const n = nameOf(habit);
  if (/sleep/.test(n) && /\d/.test(n)) return "sleep";
  if (/sleep\s*8|8\s*hours?\s*sleep|sleep\s*hours/.test(n)) return "sleep";
  if (/water/.test(n) && /diet|meal/.test(n)) return "water_diet";
  if (/3\.?5\s*l|water/.test(n) && !/diet|meal/.test(n)) return "water";
  if (/^diet\b|meals?\s*logged|track\s*meals?/.test(n)) return "diet";
  if (/wake/.test(n)) return "wake";
  return null;
}

function shouldBeChecked(kind: NonNullable<ReturnType<typeof habitAutoKind>>, day: string): boolean {
  if (kind === "sleep") {
    const sleep = loadSleepDay(day);
    // Only judge when times are set so empty days stay blank (not false X noise)
    if (!sleep.bedtime && !sleep.wake) return false;
    return (sleep.hours ?? 0) >= SLEEP_HABIT_HOURS;
  }
  if (kind === "water") {
    return waterMl(day) >= WATER_HABIT_ML;
  }
  if (kind === "diet") {
    return mealsLoggedCount(day) >= 1 || dietOk(day);
  }
  if (kind === "water_diet") {
    // "3.5L water + Diet" — measurable goal is 3.5 L water.
    // Hitting the water goal completes the habit (Mel / Meals bar).
    // Diet soft-flag still used when habit is ticked first (fills water to goal).
    return waterMl(day) >= WATER_HABIT_ML;
  }
  if (kind === "wake") {
    const sleep = loadSleepDay(day);
    const mins = parseWakeMins(sleep.wake);
    if (mins == null) return false;
    return mins <= WAKE_HABIT_MINS;
  }
  return false;
}

/**
 * Apply fitness → habit check rules for one day.
 * Returns whether any cell changed (so callers can refresh UI).
 */
export function syncHabitsFromFitness(day: string = todayKey()): {
  changed: boolean;
  details: string[];
} {
  const habits = loadHabits().filter((h) => !h.archivedAt);
  let map: CheckMap = loadChecks();
  const details: string[] = [];
  let changed = false;

  for (const h of habits) {
    const kind = habitAutoKind(h);
    if (!kind) continue;
    // For sleep: if no times logged yet, leave the cell alone (don't force X mid-day)
    if (kind === "sleep" || kind === "wake") {
      const sleep = loadSleepDay(day);
      if (!sleep.bedtime && !sleep.wake) continue;
    }
    // Water/diet: only flip on once data supports it; if data drops, uncheck
    const want = shouldBeChecked(kind, day);
    const have = isChecked(map, day, h.id);
    if (want === have) continue;
    map = setCheck(map, day, h.id, want);
    changed = true;
    details.push(
      want
        ? `✓ ${h.name}`
        : `✗ ${h.name}`
    );
  }

  if (changed) saveChecks(map);
  return { changed, details };
}

/** Hook Mel / Fitness saves into habit grid. Safe no-op if nothing changes. */
export function notifyHabitAutoSync(day?: string): {
  changed: boolean;
  details: string[];
} {
  try {
    return syncHabitsFromFitness(day || todayKey());
  } catch {
    return { changed: false, details: [] };
  }
}

/**
 * Habit grid → Fitness. Checking a water habit fills the Meals water bar to 3.5 L.
 * Unchecking does not wipe water (you may still have logged partial liters).
 */
export function applyHabitToggleToFitness(
  day: string,
  habitId: string,
  checked: boolean
): void {
  const habit = loadHabits().find((h) => h.id === habitId);
  if (!habit || habit.archivedAt) return;
  const kind = habitAutoKind(habit);
  if (!kind) return;

  if (kind === "water" || kind === "water_diet") {
    if (checked) {
      setWaterMl(day, WATER_HABIT_ML);
      if (kind === "water_diet") setDietOk(day, true);
    } else if (kind === "water_diet") {
      setDietOk(day, false);
    }
  }
  if (kind === "diet") {
    setDietOk(day, checked);
  }
}

/**
 * Habit tracker tests — streaks, momentum, aggregations.
 * Run: npm run test:habits
 */

const values = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, String(value)),
    removeItem: (key: string) => values.delete(key),
  },
});

const {
  loadHabits,
  toggleCheck,
  currentStreak,
  bestStreak,
  last30Hits,
  dayCompletion,
  momentum,
  weeklyProgress,
  monthlyProgress,
  trendPoints,
  topHabits,
  activeStreaks,
  addHabit,
  removeHabit,
  updateHabit,
  addDays,
  monthDays,
  ymd,
} = await import("../src/melani/habitStore.ts");

let passed = 0;
let failed = 0;
function assert(name: string, cond: unknown) {
  if (cond) { passed += 1; console.log(`  ✓ ${name}`); }
  else { failed += 1; console.log(`  ✗ ${name}`); }
}

// Seed set
const habits = loadHabits();
assert("seeds 10 habits", habits.length === 10);
assert("seed has ids", habits.every((h) => h.id && h.name && h.color));

// Build a 30-day check map ending on a fixed date
const anchor = "2026-07-24";
let checks: Record<string, string[]> = {};
for (let i = 0; i < 10; i++) {
  const day = addDays(anchor, -i);
  // Hit hb-1 every day; hb-2 every other day
  checks = toggleCheck(checks, day, "hb-1");
  if (i % 2 === 0) checks = toggleCheck(checks, day, "hb-2");
}

const streak1 = currentStreak(checks, "hb-1", anchor);
assert("current streak hb-1 = 10", streak1 === 10);

const streak2 = currentStreak(checks, "hb-2", anchor);
assert("current streak hb-2 = 1 (yesterday off)", streak2 === 1);

const best2 = bestStreak(checks, "hb-2");
assert("best streak hb-2 = 1", best2 === 1);

const hits1 = last30Hits(checks, "hb-1", anchor);
assert("last-30 hits hb-1 = 10", hits1 === 10);

const day = dayCompletion(habits, checks, anchor);
assert("day completion has 2 hits / 10", day.done === 2 && day.total === 10);

const mom = momentum(habits, checks, anchor);
assert("momentum in (0, 1)", mom > 0 && mom < 1);

const weekly = weeklyProgress(habits, checks, 1, anchor);
assert("weekly progress in (0, 1)", weekly > 0 && weekly < 1);

const monthly = monthlyProgress(habits, checks, anchor);
assert("monthly progress in (0, 1)", monthly > 0 && monthly < 1);

const pts = trendPoints(habits, checks, 30, anchor);
assert("trend 30 points", pts.length === 30);
assert("trend last point matches today", pts[29].x === anchor);

const top = topHabits(habits, checks, 3);
assert("top-3 habit is hb-1", top[0].habit.id === "hb-1");

const streaks = activeStreaks(habits, checks);
assert("active streaks includes hb-1", streaks.some((s) => s.habit.id === "hb-1"));

// Month days
const july = monthDays(2026, 6);
assert("July has 31 days", july.length === 31);
assert("July starts on 2026-07-01", july[0] === "2026-07-01");
assert("ymd formatting", ymd(new Date(2026, 0, 5)) === "2026-01-05");

// CRUD
const added = addHabit(habits, { name: "New thing" });
assert("addHabit appends", added.length === habits.length + 1);
const patched = updateHabit(added, added[added.length - 1].id, { name: "Renamed" });
assert("updateHabit renames", patched[patched.length - 1].name === "Renamed");
const removed = removeHabit(patched, patched[patched.length - 1].id);
assert("removeHabit drops", removed.length === habits.length);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);

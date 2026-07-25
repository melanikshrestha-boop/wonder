/**
 * Nutrition tracker tests — food db, natural-language parsing, store CRUD,
 * legacy sync, and the coaching math.
 * Run: npm run test:nutrition
 */

const values = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, String(value)),
    removeItem: (key: string) => values.delete(key),
  },
});

const { FOODS, searchFoods, macrosFor, foodById, addMacros, emptyMacros } =
  await import("../src/melani/nutrition/foodDb.ts");
const { parseFoodText } = await import("../src/melani/nutrition/parseFood.ts");
const {
  addEntry,
  addEntries,
  loadDay,
  dayTotals,
  removeEntry,
  setEntryGrams,
  moveEntry,
  entriesBySlot,
  loadTargets,
  loadProfile,
  saveProfile,
  shiftDay,
  ymd,
} = await import("../src/melani/nutrition/nutritionStore.ts");
const {
  energyModel,
  remaining,
  suggestClosers,
  buildInsights,
  dayProgress,
  remainingSlots,
} = await import("../src/melani/nutrition/nutritionInsights.ts");

let passed = 0;
let failed = 0;
function assert(name: string, cond: unknown) {
  if (cond) { passed += 1; console.log(`  ✓ ${name}`); }
  else { failed += 1; console.log(`  ✗ ${name}`); }
}

const DAY = "2026-07-20";

console.log("\nFood database");
assert("ships a substantial database", FOODS.length >= 150);
assert("every food has a default portion", FOODS.every((f) => f.portions.length > 0));
assert("every food has non-negative macros", FOODS.every((f) =>
  f.per100g.calories >= 0 && f.per100g.protein_g >= 0 && f.per100g.fat_g >= 0));
assert("ids are unique", new Set(FOODS.map((f) => f.id)).size === FOODS.length);
assert("search finds chicken breast", searchFoods("chicken")[0].id.includes("chicken"));
assert("search matches aliases (fage → greek yogurt)",
  searchFoods("fage")[0].name.toLowerCase().includes("greek yogurt"));
assert("search finds makhana", searchFoods("makhana")[0].name.includes("Makhana"));
assert("empty query returns nothing", searchFoods("").length === 0);

const egg = foodById("egg-whole")!;
assert("egg exists with a large portion", egg.portions.some((p) => p.label === "large"));
const twoEggs = macrosFor(egg, 100);
assert("100 g egg ≈ 143 cal", twoEggs.calories === 143);
assert("macros scale linearly", macrosFor(egg, 50).calories === 72);
assert("addMacros sums", addMacros(emptyMacros(), { calories: 10, protein_g: 1, carbs_g: 2, fat_g: 3, fiber_g: 4 }).calories === 10);

console.log("\nNatural-language parsing");
const p1 = parseFoodText("2 eggs and a cup of white rice");
assert("splits into two items", p1.items.length === 2);
assert("2 eggs → 100 g", p1.items[0].grams === 100);
assert("cup of rice → 158 g", p1.items[1].grams === 158);
assert("totals are summed", p1.totals.calories === p1.items[0].macros.calories + p1.items[1].macros.calories);

const p2 = parseFoodText("6oz grilled chicken");
assert("6 oz resolves to 170 g", p2.items[0].grams === 170);
assert("prep words don't block the match", p2.items[0].name.toLowerCase().includes("chicken"));

const p3 = parseFoodText("150g greek yogurt");
assert("explicit grams win", p3.items[0].grams === 150);
assert("greek yogurt matched", p3.items[0].food?.id === "greek-yogurt-0-fat");
assert("explicit weight is high confidence", p3.items[0].confidence === "high");

const p4 = parseFoodText("half an avocado");
assert("fraction words parse", p4.items[0].grams === 75);

const p5 = parseFoodText("3 slices of bacon");
assert("slice portions resolve", p5.items[0].grams === 24);

const p6 = parseFoodText("1 tbsp chia seeds, 2 tbsp peanut butter");
assert("tbsp differs per food", p6.items[0].grams === 12 && p6.items[1].grams === 32);

const p7 = parseFoodText("a banana");
assert('"a banana" → one medium', p7.items[0].grams === 118);

const p8 = parseFoodText("chiken breast");
assert("typos still resolve", p8.items[0].food?.id.includes("chicken"));

const p9 = parseFoodText("2 unicorn steaks");
assert("unknown foods are surfaced, not dropped",
  p9.items.length === 0 ? p9.unmatched.length > 0 : true);

const p10 = parseFoodText("½ cup blueberries");
assert("unicode fractions parse", p10.items[0].grams === 74);

console.log("\nStore CRUD");
addEntry({ slot: "breakfast", name: "Egg, whole", grams: 100, macros: macrosFor(egg, 100), foodId: egg.id, source: "search" }, DAY);
let day = loadDay(DAY);
assert("entry persists", day.length === 1);
assert("totals derive from entries", dayTotals(day).calories === 143);

const rice = foodById("white-rice-cooked")!;
addEntries([
  { slot: "lunch", name: rice.name, grams: 158, macros: macrosFor(rice, 158), foodId: rice.id },
  { slot: "lunch", name: "Chicken breast, cooked", grams: 170, macros: macrosFor(foodById("chicken-breast-cooked")!, 170) },
], DAY);
day = loadDay(DAY);
assert("bulk add works", day.length === 3);

const slots = entriesBySlot(day);
assert("grouped by slot", slots.breakfast.length === 1 && slots.lunch.length === 2);

const riceId = day.find((e) => e.name.includes("rice"))!.id;
setEntryGrams(riceId, 316, DAY);
day = loadDay(DAY);
assert("re-weighing recomputes from the source food",
  day.find((e) => e.id === riceId)!.macros.calories === macrosFor(rice, 316).calories);

// Photo/manual entries have no source food — those scale proportionally.
const chickenId = day.find((e) => e.name.includes("Chicken"))!.id;
const chickenCal = day.find((e) => e.id === chickenId)!.macros.calories;
setEntryGrams(chickenId, 340, DAY);
assert("entries with no source food scale proportionally",
  loadDay(DAY).find((e) => e.id === chickenId)!.macros.calories === chickenCal * 2);

moveEntry(riceId, "dinner", DAY);
assert("entries move between meals", loadDay(DAY).find((e) => e.id === riceId)!.slot === "dinner");

const before = loadDay(DAY).length;
removeEntry(riceId, DAY);
assert("delete removes exactly one", loadDay(DAY).length === before - 1);

console.log("\nLegacy compatibility");
const legacyRaw = values.get(`dr-melani-meals-usuals:${DAY}`);
assert("legacy key is written for other Wonder surfaces", Boolean(legacyRaw));
const legacy = JSON.parse(legacyRaw || "{}");
assert("legacy totals match derived totals",
  legacy.totals.calories === Math.round(dayTotals(loadDay(DAY)).calories));
assert("legacy loggedIds stay populated", Array.isArray(legacy.loggedIds) && legacy.loggedIds.length > 0);

const OLD = "2026-07-02";
values.set(`dr-melani-meals-usuals:${OLD}`, JSON.stringify({
  loggedIds: ["breakfast_usual"],
  totals: { calories: 480, protein_g: 38, carbs_g: 42, fat_g: 16, fiber_g: 9 },
}));
const migrated = loadDay(OLD);
assert("pre-existing lump-sum days are migrated, not lost", migrated.length === 1);
assert("migrated totals are preserved", migrated[0].macros.calories === 480);
assert("migration is idempotent", loadDay(OLD).length === 1);

console.log("\nCoaching math");
const profile = loadProfile();
saveProfile({ ...profile, weight_lb: 120, height_in: 60, age: 18, sex: "female", activity: "moderate", goal: "maintain", weightConfirmed: true });
const energy = energyModel(loadProfile(), 1500);
assert("BMR is in a sane range for the profile", energy.bmr > 1100 && energy.bmr < 1400);
assert("TDEE exceeds BMR", energy.tdee > energy.bmr);
assert("deficit is negative when under burn", energy.balance < 0);
assert("weekly projection follows the 3500 rule",
  Math.abs(energy.weeklyLb - Math.round((energy.balance * 7) / 3500 * 10) / 10) < 0.001);

const targets = loadTargets();
const left = remaining(targets, { calories: 800, protein_g: 40, carbs_g: 90, fat_g: 25, fiber_g: 8 });
assert("remaining subtracts correctly", left.calories === targets.calories - 800);
assert("remaining protein correct", left.protein_g === targets.protein_g - 40);

const closers = suggestClosers(left, 3);
assert("suggests foods that close the gap", closers.length > 0);
assert("every suggestion fits the calorie budget", closers.every((c) => c.macros.calories <= left.calories));
assert("every suggestion carries real protein", closers.every((c) => c.macros.protein_g >= 8));
assert("suggestions are varied across food groups",
  new Set(closers.map((c) => c.food.group)).size === closers.length);
assert("no suggestions when the gap is already closed",
  suggestClosers({ calories: 40, protein_g: 2, carbs_g: 5, fat_g: 1, fiber_g: 1 }).length === 0);

assert("day progress is clamped to 0..1",
  dayProgress(new Date("2026-07-20T03:00:00")) === 0 &&
  dayProgress(new Date("2026-07-20T23:00:00")) === 1);

const openSlots = remainingSlots([], new Date("2026-07-20T09:00:00"));
assert("morning leaves every window open", openSlots.length === 4);
assert("late evening closes breakfast and lunch",
  remainingSlots([], new Date("2026-07-20T20:00:00")).every((s) => s === "dinner" || s === "snack"));

const emptyInsights = buildInsights({
  day: DAY, entries: [], totals: emptyMacros(), targets,
  profile: loadProfile(), isToday: true,
});
assert("empty day gets a single prompt, not a lecture", emptyInsights.length === 1);

const fullInsights = buildInsights({
  day: DAY,
  entries: loadDay(DAY),
  totals: dayTotals(loadDay(DAY)),
  targets,
  profile: loadProfile(),
  isToday: true,
  now: new Date("2026-07-20T14:00:00"),
});
assert("a logged day produces coaching", fullInsights.length > 0);
assert("insights stay readable (max 6)", fullInsights.length <= 6);
assert("every insight has a title and detail",
  fullInsights.every((i) => i.title.length > 0 && i.detail.length > 0));

console.log("\nDate helpers");
assert("shiftDay walks backwards", shiftDay("2026-07-01", -1) === "2026-06-30");
assert("shiftDay walks forwards", shiftDay("2026-12-31", 1) === "2027-01-01");
assert("ymd pads correctly", ymd(new Date(2026, 0, 5)) === "2026-01-05");

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);

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
assert("never suggests condiments as a protein source",
  suggestClosers({ calories: 1800, protein_g: 120, carbs_g: 200, fat_g: 60, fiber_g: 25 }, 12)
    .every((c) => c.food.group !== "condiment"));
assert("never suggests an absurd quantity of anything",
  suggestClosers({ calories: 1800, protein_g: 120, carbs_g: 200, fat_g: 60, fiber_g: 25 }, 12)
    .every((c) => c.grams <= Math.min(c.food.portions[0].grams * 4, 400)));

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

console.log("\nOpen Food Facts mapping");
const { mapOffProduct, offToFood, normaliseBarcode, isPlausibleBarcode } =
  await import("../src/melani/nutrition/openFoodFacts.ts");

const offKcal = mapOffProduct({
  code: "3017624010701",
  product_name: "Nutella",
  brands: "Ferrero, Nutella",
  serving_size: "15 g",
  nutriments: { "energy-kcal_100g": 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9, fiber_100g: 0 },
})!;
assert("maps a normal product", offKcal.name === "Nutella" && offKcal.per100g.calories === 539);
assert("takes the first brand only", offKcal.brand === "Ferrero");
assert("parses serving size", offKcal.servingGrams === 15);

const offKj = mapOffProduct({
  code: "111", product_name: "KJ only",
  nutriments: { energy_100g: 2000, energy_unit: "kJ", proteins_100g: 10 },
})!;
assert("converts kilojoules to calories", offKj.per100g.calories === Math.round(2000 / 4.184));

const offKjExplicit = mapOffProduct({
  code: "112", product_name: "KJ key",
  nutriments: { "energy-kj_100g": 418.4, proteins_100g: 1 },
})!;
assert("handles the energy-kj_100g key", offKjExplicit.per100g.calories === 100);

assert("rejects products with no energy at all",
  mapOffProduct({ code: "113", product_name: "Mystery", nutriments: { proteins_100g: 5 } }) === null);

const offMissing = mapOffProduct({
  code: "114", product_name: "Sparse", nutriments: { "energy-kcal_100g": 200 },
})!;
assert("missing macros default to zero, not NaN",
  offMissing.per100g.protein_g === 0 && offMissing.per100g.fiber_g === 0);

const offComma = mapOffProduct({
  code: "115", product_name: "Comma decimals",
  nutriments: { "energy-kcal_100g": "250,5", proteins_100g: "3,2" },
})!;
assert("parses European comma decimals", offComma.per100g.calories === 251 && offComma.per100g.protein_g === 3.2);

const offServingParen = mapOffProduct({
  code: "116", product_name: "Biscuits", serving_size: "2 biscuits (25 g)",
  nutriments: { "energy-kcal_100g": 480 },
})!;
assert("prefers grams inside parentheses", offServingParen.servingGrams === 25);

const asFood = offToFood(offKcal);
assert("OFF product converts to a Food", asFood.id === "off-3017624010701");
assert("brand appears in the food name", asFood.name.includes("Ferrero"));
assert("serving is the default portion when declared", asFood.portions[0].grams === 15);
assert("food with no serving still has portions",
  offToFood(offKj).portions.length >= 2);
assert("macros scale from an OFF food",
  macrosFor(asFood, 15).calories === Math.round(539 * 0.15));

assert("normalises barcodes", normaliseBarcode(" 301-762 401 0701 ") === "3017624010701");
assert("accepts EAN-13", isPlausibleBarcode("3017624010701"));
assert("accepts UPC-A", isPlausibleBarcode("012345678905"));
assert("rejects nonsense", !isPlausibleBarcode("123"));

console.log("\nRecipes");
const {
  createRecipe, recipeTotals, perServing, recipeToEntries,
  recipeFromEntries, addRecipe, removeRecipe, updateRecipe,
  markRecipeUsed, sortedRecipes,
} = await import("../src/melani/nutrition/recipes.ts");

const oats = foodById("oats-dry")!;
const whey = foodById("whey-protein-powder")!;
const recipe = createRecipe({
  name: "Protein oats",
  servings: 2,
  defaultSlot: "breakfast",
  ingredients: [
    { name: oats.name, grams: 80, qtyLabel: "1 cup", macros: macrosFor(oats, 80), foodId: oats.id },
    { name: whey.name, grams: 30, qtyLabel: "1 scoop", macros: macrosFor(whey, 30), foodId: whey.id },
  ],
});
const totals = recipeTotals(recipe);
assert("totals sum the ingredients",
  totals.calories === macrosFor(oats, 80).calories + macrosFor(whey, 30).calories);
assert("per-serving halves a 2-serving recipe",
  perServing(recipe).calories === Math.round(totals.calories / 2));

const oneServing = recipeToEntries(recipe, 1);
assert("one serving expands to every ingredient", oneServing.length === 2);
assert("one serving is half the batch",
  oneServing[0].grams === 40 && oneServing[1].grams === 15);
assert("logged ingredients keep their source food", oneServing[0].foodId === oats.id);
assert("recipe name is carried into the label", oneServing[0].qtyLabel.includes("Protein oats"));

const wholeBatch = recipeToEntries(recipe, 2);
assert("eating the whole batch logs full weights", wholeBatch[0].grams === 80);
assert("zero servings logs nothing", recipeToEntries(recipe, 0).length === 0);
assert("recipes default to their own slot", oneServing[0].slot === "breakfast");
assert("an explicit slot overrides the default",
  recipeToEntries(recipe, 1, "snack")[0].slot === "snack");

const fromDay = recipeFromEntries("Yesterday's dinner", loadDay(DAY), 1);
assert("a recipe can be built from a logged day",
  fromDay.ingredients.length === loadDay(DAY).length);

let list = addRecipe([], recipe);
assert("add stores the recipe", list.length === 1);
list = updateRecipe(list, recipe.id, { servings: 4 });
assert("servings update", list[0].servings === 4);
list = updateRecipe(list, recipe.id, { servings: 0 });
assert("servings can never drop below 1", list[0].servings === 1);
list = markRecipeUsed(list, recipe.id);
assert("use count increments", list[0].useCount === 1);
const second = createRecipe({ name: "B", ingredients: [] });
assert("most-used sorts first", sortedRecipes([second, ...list])[0].id === recipe.id);
list = removeRecipe(list, recipe.id);
assert("remove deletes it", list.length === 0);

console.log("\nDate helpers");
assert("shiftDay walks backwards", shiftDay("2026-07-01", -1) === "2026-06-30");
assert("shiftDay walks forwards", shiftDay("2026-12-31", 1) === "2027-01-01");
assert("ymd pads correctly", ymd(new Date(2026, 0, 5)) === "2026-01-05");

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);

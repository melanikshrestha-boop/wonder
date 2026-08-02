/**
 * Blueprint-style day + Trader Joe’s shopping with exact grams.
 * Run-out = remaining_g ÷ use_per_day_g (not vibes).
 *
 * TJ product names: common stocked items (region varies; search terms included).
 *
 * Cut-out law: every ingredient name + TJ product string must stay clean of
 * PLATE_TRASH. Wonder must never plan or shop banned foods.
 */
import { assertCutoutClean } from "./foodGuide";

export type BlueprintMealId = "breakfast" | "lunch" | "dinner" | "optional";

export type TjAisle =
  | "Produce"
  | "Refrigerated"
  | "Eggs & dairy"
  | "Seafood"
  | "Frozen"
  | "Nuts & seeds"
  | "Pantry / oils";

export const TJ_AISLE_ORDER: TjAisle[] = [
  "Produce",
  "Refrigerated",
  "Eggs & dairy",
  "Seafood",
  "Frozen",
  "Nuts & seeds",
  "Pantry / oils",
];

/** Exact pantry unit — everything converts to grams or discrete counts. */
export type StockUnit = "g" | "ml" | "each";

export type BlueprintIngredient = {
  id: string;
  name: string;
  /** Exact amount used per full day of the plan (when that meal is on). */
  usePerDay: number;
  unit: StockUnit;
  /** What you actually grab at Trader Joe’s */
  tjProduct: string;
  aisle: TjAisle;
  search: string;
  mealIds: BlueprintMealId[];
  /**
   * Typical package size at TJ (same unit) — for “buy N packs” math.
   * null = buy as needed / bulk by weight.
   */
  packSize: number | null;
  pantryDefault?: boolean;
};

export type BlueprintMeal = {
  id: BlueprintMealId;
  title: string;
  short: string;
  steps: string[];
  ingredientIds: string[];
};

/**
 * Exact daily uses (grams / ml / each).
 * Breakfast matches Melani’s measured bowl; Super Veggie / dinner are Blueprint-scaled.
 */
export const BLUEPRINT_INGREDIENTS: BlueprintIngredient[] = [
  // Breakfast
  {
    id: "greek-yogurt-0",
    name: "0% Greek yogurt",
    usePerDay: 150,
    unit: "g",
    // Official TJ name: Nonfat Plain Greek Yogurt — NOT low-fat, NOT flavored
    tjProduct: "Trader Joe's Nonfat Plain Greek Yogurt (tub — plain only)",
    aisle: "Eggs & dairy",
    search: "nonfat plain greek yogurt",
    mealIds: ["breakfast"],
    packSize: 907, // 32 oz ≈ 907 g when that size is stocked
  },
  {
    id: "kefir-0",
    name: "Plain low-fat kefir (unsweetened)",
    usePerDay: 100,
    unit: "ml",
    // Mango/strawberry TJ kefirs have cane sugar — plain unsweetened only
    tjProduct: "Trader Joe's Low Fat Kefir · Plain Unsweetened (bottle)",
    aisle: "Eggs & dairy",
    search: "plain unsweetened kefir",
    mealIds: ["breakfast"],
    packSize: 946,
  },
  {
    id: "blueberries",
    name: "Blueberries",
    usePerDay: 75, // ~½ cup
    unit: "g",
    tjProduct: "Fresh blueberries OR Frozen Wild Blueberries (no sugar added)",
    aisle: "Produce",
    search: "blueberries",
    mealIds: ["breakfast", "optional"],
    packSize: 170,
  },
  {
    id: "strawberries",
    name: "Strawberries",
    usePerDay: 45, // ~3 medium
    unit: "g",
    tjProduct: "Fresh strawberries (1 lb)",
    aisle: "Produce",
    search: "strawberries",
    mealIds: ["breakfast"],
    packSize: 454,
  },
  {
    id: "chia",
    name: "Chia seeds",
    usePerDay: 5, // ~1 tsp
    unit: "g",
    tjProduct: "Trader Joe's Organic Chia Seeds (~12 oz bag)",
    aisle: "Nuts & seeds",
    search: "organic chia seeds",
    mealIds: ["breakfast", "optional"],
    packSize: 340,
    pantryDefault: true,
  },
  {
    id: "flax",
    name: "Ground flaxseed",
    usePerDay: 5,
    unit: "g",
    tjProduct: "Trader Joe's Ground Flaxseed (plain bag — not granola)",
    aisle: "Nuts & seeds",
    search: "ground flaxseed",
    mealIds: ["breakfast", "optional"],
    packSize: 453,
    pantryDefault: true,
  },
  {
    id: "pumpkin-seeds",
    name: "Pumpkin seeds",
    usePerDay: 8, // ~1 flat tbsp
    unit: "g",
    tjProduct: "Dry roasted pumpkin seeds — plain (no honey coating)",
    aisle: "Nuts & seeds",
    search: "pumpkin seeds dry roasted",
    mealIds: ["breakfast"],
    packSize: 227,
    pantryDefault: true,
  },
  {
    id: "eggs",
    name: "Eggs",
    usePerDay: 2,
    unit: "each",
    tjProduct: "Cage Free Large Grade A Eggs (dozen)",
    aisle: "Eggs & dairy",
    search: "eggs dozen cage free",
    mealIds: ["breakfast"],
    packSize: 12,
  },

  // Super Veggie lunch
  {
    id: "black-lentils",
    name: "Lentils (steamed or dry)",
    usePerDay: 150, // ~1 cup cooked weight (steamed pack) OR scale dry ~45g dry→~150 cooked
    unit: "g",
    tjProduct: "Steamed Lentils (refrigerated pouch) — or dry lentils if stocked",
    aisle: "Refrigerated",
    search: "steamed lentils",
    mealIds: ["lunch"],
    packSize: 250, // typical pouch
  },
  {
    id: "broccoli",
    name: "Broccoli",
    usePerDay: 250,
    unit: "g",
    tjProduct: "Broccoli florets (fresh bag) or Frozen Broccoli Florets",
    aisle: "Produce",
    search: "broccoli florets",
    mealIds: ["lunch"],
    packSize: 340,
  },
  {
    id: "cauliflower",
    name: "Cauliflower",
    usePerDay: 150,
    unit: "g",
    tjProduct: "Cauliflower florets or Riced Cauliflower (fresh/frozen)",
    aisle: "Produce",
    search: "cauliflower",
    mealIds: ["lunch"],
    packSize: 340,
  },
  {
    id: "mushrooms",
    name: "Mushrooms",
    usePerDay: 50,
    unit: "g",
    tjProduct: "Sliced Baby Bella Mushrooms (8 oz pack)",
    aisle: "Produce",
    search: "baby bella mushrooms",
    mealIds: ["lunch"],
    packSize: 227,
  },
  {
    id: "garlic",
    name: "Garlic",
    usePerDay: 6, // ~1–2 cloves
    unit: "g",
    tjProduct: "Fresh garlic bulb",
    aisle: "Produce",
    search: "garlic",
    mealIds: ["lunch", "dinner"],
    packSize: 50,
    pantryDefault: true,
  },
  {
    id: "ginger",
    name: "Ginger",
    usePerDay: 5, // ~1 tsp grated
    unit: "g",
    tjProduct: "Fresh ginger root",
    aisle: "Produce",
    search: "ginger root",
    mealIds: ["lunch"],
    packSize: 100,
    pantryDefault: true,
  },
  {
    id: "lime",
    name: "Lime",
    usePerDay: 0.5,
    unit: "each",
    tjProduct: "Limes (bag)",
    aisle: "Produce",
    search: "limes",
    mealIds: ["lunch"],
    packSize: 6,
  },
  {
    id: "hemp-seeds",
    name: "Hemp seeds",
    usePerDay: 10, // 1 tbsp
    unit: "g",
    tjProduct: "Hemp Seed Hearts",
    aisle: "Nuts & seeds",
    search: "hemp seed hearts",
    mealIds: ["lunch", "optional"],
    packSize: 227,
    pantryDefault: true,
  },
  {
    id: "evoo",
    name: "Extra virgin olive oil",
    usePerDay: 28, // 2 tbsp across lunch+dinner (~14g each)
    unit: "ml",
    tjProduct: "California Estate Extra Virgin Olive Oil (or Greek/Spanish EVOO)",
    aisle: "Pantry / oils",
    search: "extra virgin olive oil",
    mealIds: ["lunch", "dinner"],
    packSize: 500,
    pantryDefault: true,
  },

  // Dinner
  {
    id: "salmon",
    name: "Salmon fillet",
    usePerDay: 150, // ~5.3 oz edible
    unit: "g",
    tjProduct: "Atlantic Salmon Fillet (fresh counter or frozen)",
    aisle: "Seafood",
    search: "salmon fillet",
    mealIds: ["dinner"],
    packSize: 340,
  },
  {
    id: "leafy-greens",
    name: "Leafy greens",
    usePerDay: 80,
    unit: "g",
    tjProduct: "Organic Baby Spinach or Power Greens (clamshell)",
    aisle: "Produce",
    search: "baby spinach",
    mealIds: ["dinner"],
    packSize: 142,
  },
  {
    id: "cherry-tomatoes",
    name: "Cherry tomatoes",
    usePerDay: 80,
    unit: "g",
    tjProduct: "Cherry Tomatoes (pint)",
    aisle: "Produce",
    search: "cherry tomatoes",
    mealIds: ["dinner"],
    packSize: 280,
  },
  {
    id: "avocado",
    name: "Avocado",
    usePerDay: 0.4, // ~⅓–½ fruit
    unit: "each",
    tjProduct: "Hass Avocados",
    aisle: "Produce",
    search: "avocado",
    mealIds: ["dinner"],
    packSize: 4,
  },

  // Optional pudding
  {
    id: "almond-milk",
    name: "Unsweetened almond milk",
    usePerDay: 180,
    unit: "ml",
    tjProduct: "Unsweetened Almond Beverage (carton)",
    aisle: "Refrigerated",
    search: "unsweetened almond milk",
    mealIds: ["optional"],
    packSize: 946,
  },
  {
    id: "walnuts",
    name: "Walnuts",
    usePerDay: 15,
    unit: "g",
    tjProduct: "Raw Walnut Halves & Pieces",
    aisle: "Nuts & seeds",
    search: "walnuts raw",
    mealIds: ["optional"],
    packSize: 454,
    pantryDefault: true,
  },
  {
    id: "cacao",
    name: "Unsweetened cocoa",
    usePerDay: 5,
    unit: "g",
    tjProduct: "Cocoa Powder (unsweetened)",
    aisle: "Pantry / oils",
    search: "unsweetened cocoa powder",
    mealIds: ["optional"],
    packSize: 226,
    pantryDefault: true,
  },
  {
    id: "cinnamon",
    name: "Cinnamon",
    usePerDay: 1,
    unit: "g",
    tjProduct: "Ground Cinnamon",
    aisle: "Pantry / oils",
    search: "cinnamon",
    mealIds: ["optional"],
    packSize: 50,
    pantryDefault: true,
  },
  {
    id: "frozen-berries",
    name: "Frozen berries",
    usePerDay: 70,
    unit: "g",
    tjProduct: "Frozen Wild Blueberries (no sugar)",
    aisle: "Frozen",
    search: "frozen wild blueberries",
    mealIds: ["optional"],
    packSize: 454,
  },
];

export const BLUEPRINT_MEALS: BlueprintMeal[] = [
  {
    id: "breakfast",
    title: "Breakfast",
    short: "Yogurt bowl · 0% dairy · seeds · berries",
    steps: [
      "150 g yogurt + 100 ml kefir.",
      "5 g chia · 5 g flax · 8 g pumpkin seeds.",
      "75 g blueberries · 45 g strawberries.",
      "Optional: 2 eggs (whole + white).",
    ],
    ingredientIds: [
      "greek-yogurt-0",
      "kefir-0",
      "blueberries",
      "strawberries",
      "chia",
      "flax",
      "pumpkin-seeds",
      "eggs",
    ],
  },
  {
    id: "lunch",
    title: "Lunch · Super Veggie",
    short: "Lentils · broccoli · cauli · mushrooms · EVOO · hemp",
    steps: [
      "150 g steamed lentils (or cook ~45 g dry → same cooked weight).",
      "250 g broccoli + 150 g cauliflower + 50 g mushrooms.",
      "6 g garlic · 5 g ginger · ½ lime · 10 g hemp · ~14 ml EVOO on this meal.",
    ],
    ingredientIds: [
      "black-lentils",
      "broccoli",
      "cauliflower",
      "mushrooms",
      "garlic",
      "ginger",
      "lime",
      "hemp-seeds",
      "evoo",
    ],
  },
  {
    id: "dinner",
    title: "Dinner · salmon",
    short: "150 g salmon · greens · tomato · avocado · EVOO",
    steps: [
      "150 g salmon, cooked in EVOO only.",
      "80 g greens · 80 g cherry tomatoes · 0.4 avocado.",
    ],
    ingredientIds: [
      "salmon",
      "leafy-greens",
      "cherry-tomatoes",
      "avocado",
      "evoo",
      "garlic",
    ],
  },
  {
    id: "optional",
    title: "Optional · pudding",
    short: "Chia-flax-cacao · unsweetened milk · berries",
    steps: [
      "180 ml unsweetened almond milk + 5 g chia + 5 g flax + 5 g cocoa + 1 g cinnamon.",
      "Rest 15 min. Top 15 g walnuts + 70 g berries.",
    ],
    ingredientIds: [
      "almond-milk",
      "chia",
      "flax",
      "cacao",
      "cinnamon",
      "walnuts",
      "frozen-berries",
      "blueberries",
    ],
  },
];

export function ingredientById(id: string): BlueprintIngredient | undefined {
  return BLUEPRINT_INGREDIENTS.find((x) => x.id === id);
}

// Fail loud in console if a planned food violates the trash bin
for (const ing of BLUEPRINT_INGREDIENTS) {
  assertCutoutClean(ing.id, ing.name, ing.tjProduct, ing.search);
}

/** Flat unique ingredients for meal set */
export function ingredientsForMeals(
  mealIds: BlueprintMealId[]
): BlueprintIngredient[] {
  const set = new Set(mealIds);
  const map = new Map<string, BlueprintIngredient>();
  for (const ing of BLUEPRINT_INGREDIENTS) {
    if (ing.mealIds.some((m) => set.has(m))) map.set(ing.id, ing);
  }
  return [...map.values()];
}

// ── Stock / run-out (exact) ──────────────────────────────────────

export type StockMap = Record<string, number>; // id → remaining in unit

const STOCK_KEY = "wonder-tj-stock-v1";
const SHOP_KEY = "wonder-tj-shop-v1";
export const TJ_SHOP_EVENT = "wonder-tj-shop-update";

function emit() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(TJ_SHOP_EVENT));
  }
}

export function loadStock(): StockMap {
  try {
    const raw = localStorage.getItem(STOCK_KEY);
    if (raw) {
      const p = JSON.parse(raw) as StockMap;
      if (p && typeof p === "object") return p;
    }
  } catch {
    /* empty */
  }
  return {};
}

export function saveStock(map: StockMap) {
  localStorage.setItem(STOCK_KEY, JSON.stringify(map));
  emit();
}

export function setStockAmount(id: string, amount: number) {
  const map = loadStock();
  const n = Math.max(0, Number(amount) || 0);
  if (n <= 0) delete map[id];
  else map[id] = Math.round(n * 100) / 100;
  saveStock(map);
  return map;
}

/** Whole packs bought → add packSize × packs to stock */
export function addPacks(id: string, packs: number) {
  const ing = ingredientById(id);
  if (!ing?.packSize || packs <= 0) return loadStock();
  const map = loadStock();
  const cur = map[id] || 0;
  map[id] = Math.round((cur + ing.packSize * packs) * 100) / 100;
  saveStock(map);
  return map;
}

export type RunOutRow = {
  id: string;
  name: string;
  unit: StockUnit;
  usePerDay: number;
  remaining: number;
  /** floor(remaining / usePerDay); null if no stock logged */
  daysLeft: number | null;
  /** packs to buy for targetDays of plan */
  packsToBuy: number;
  tjProduct: string;
  aisle: TjAisle;
  search: string;
  packSize: number | null;
  /** Meals that use this ingredient (active plan only) */
  mealIds: BlueprintMealId[];
  /**
   * Primary meal bucket for shop grouping (breakfast → lunch → dinner → optional).
   * Shared items (e.g. EVOO) land under the earliest meal that uses them.
   */
  primaryMeal: BlueprintMealId;
};

const MEAL_ORDER: BlueprintMealId[] = [
  "breakfast",
  "lunch",
  "dinner",
  "optional",
];

export function mealTitle(id: BlueprintMealId): string {
  return BLUEPRINT_MEALS.find((m) => m.id === id)?.title || id;
}

export function mealShort(id: BlueprintMealId): string {
  return BLUEPRINT_MEALS.find((m) => m.id === id)?.short || "";
}

function primaryMealOf(
  mealIds: BlueprintMealId[],
  active: Set<BlueprintMealId>
): BlueprintMealId {
  for (const m of MEAL_ORDER) {
    if (active.has(m) && mealIds.includes(m)) return m;
  }
  return mealIds[0] || "breakfast";
}

export function computeRunOut(
  mealIds: BlueprintMealId[],
  targetDays: number,
  stock: StockMap = loadStock()
): RunOutRow[] {
  const days = Math.min(21, Math.max(1, Math.round(targetDays) || 7));
  const active = new Set(mealIds);
  const ings = ingredientsForMeals(mealIds);
  return ings
    .map((ing) => {
      const hasStock = Object.prototype.hasOwnProperty.call(stock, ing.id);
      const remaining = hasStock ? Number(stock[ing.id]) || 0 : 0;
      const use = ing.usePerDay;
      const daysLeft =
        !hasStock || use <= 0
          ? null
          : Math.floor(remaining / use);
      const need = use * days;
      const deficit = Math.max(0, need - remaining);
      let packsToBuy = 0;
      if (deficit > 0) {
        if (ing.packSize && ing.packSize > 0) {
          packsToBuy = Math.ceil(deficit / ing.packSize);
        } else {
          packsToBuy = 1;
        }
      }
      const usedIn = ing.mealIds.filter((m) => active.has(m));
      return {
        id: ing.id,
        name: ing.name,
        unit: ing.unit,
        usePerDay: use,
        remaining,
        daysLeft,
        packsToBuy,
        tjProduct: ing.tjProduct,
        aisle: ing.aisle,
        search: ing.search,
        packSize: ing.packSize,
        mealIds: usedIn,
        primaryMeal: primaryMealOf(usedIn, active),
      };
    })
    .sort((a, b) => {
      const mi = MEAL_ORDER.indexOf(a.primaryMeal);
      const mj = MEAL_ORDER.indexOf(b.primaryMeal);
      if (mi !== mj) return mi - mj;
      const ad = a.daysLeft ?? -1;
      const bd = b.daysLeft ?? -1;
      return ad - bd;
    });
}

/** Group shop/stock rows by meal (not produce aisle). */
export function groupRowsByMeal(
  rows: RunOutRow[],
  activeMeals: BlueprintMealId[]
): Array<{
  mealId: BlueprintMealId;
  title: string;
  short: string;
  items: RunOutRow[];
}> {
  const order = MEAL_ORDER.filter((m) => activeMeals.includes(m));
  return order
    .map((mealId) => ({
      mealId,
      title: mealTitle(mealId),
      short: mealShort(mealId),
      items: rows.filter((r) => r.primaryMeal === mealId),
    }))
    .filter((g) => g.items.length > 0);
}

/**
 * Shop list row state:
 * - unset: need to get it
 * - bought: tap while at the store (in cart/bag); tap again undoes
 * - own: legacy / stock-enough skip (still cleared by same tap-toggle)
 */
export type ShopItemState = "unset" | "bought" | "own";
export type ShopCheckMap = Record<string, ShopItemState>;

export function loadShopChecks(): ShopCheckMap {
  try {
    const raw = localStorage.getItem(SHOP_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: ShopCheckMap = {};
    for (const [k, v] of Object.entries(parsed || {})) {
      // migrate old boolean true → bought
      if (v === true || v === "bought") out[k] = "bought";
      else if (v === "own") out[k] = "own";
      else if (v === false || v === "unset") continue;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveShopChecks(map: ShopCheckMap) {
  localStorage.setItem(SHOP_KEY, JSON.stringify(map));
  emit();
}

/**
 * Tap toggles bought ↔ unset (undo).
 * First tap = bought (adds packs once). Second tap = clear mark only
 * (stock stays — safer than subtracting if you already put it away).
 */
export function markShopBought(id: string, packs: number) {
  const map = loadShopChecks();
  if (map[id] === "bought" || map[id] === "own") {
    // Undo: clear mark only (keep stock — safer than subtracting packs)
    delete map[id];
    saveShopChecks(map);
    return map;
  }
  map[id] = "bought";
  saveShopChecks(map);
  if (packs > 0) addPacks(id, packs);
  else {
    const ing = ingredientById(id);
    if (ing) {
      const stock = loadStock();
      const cur = stock[id] || 0;
      stock[id] = cur + ing.usePerDay * 7;
      saveStock(stock);
    }
  }
  return map;
}

/**
 * Mark already-own (stock enough for plan window). Optional path for Stock UI;
 * Buy list uses tap-toggle only so second tap is always undo, never a race.
 */
export function markShopOwn(id: string, targetDays: number) {
  const map = loadShopChecks();
  if (map[id] === "own") {
    delete map[id];
    saveShopChecks(map);
    return map;
  }
  map[id] = "own";
  saveShopChecks(map);
  const ing = ingredientById(id);
  if (ing) {
    const need = ing.usePerDay * Math.max(1, targetDays);
    const stock = loadStock();
    const cur = stock[id] || 0;
    if (cur < need) {
      stock[id] = need;
      saveStock(stock);
    }
  }
  return map;
}

/** @deprecated use markShopBought / markShopOwn */
export function toggleShopCheck(id: string) {
  return markShopBought(id, 1);
}

export function formatAmount(n: number, unit: StockUnit): string {
  if (unit === "each") {
    const r = Math.round(n * 10) / 10;
    return Number.isInteger(r) ? `${r}` : `${r}`;
  }
  if (n >= 100) return `${Math.round(n)} ${unit}`;
  return `${Math.round(n * 10) / 10} ${unit}`;
}

/** Plain ingredient list for one day (all core meals). */
export function plainDayIngredientList(
  includeOptional = false
): Array<{ amount: string; name: string; meal: string }> {
  const mealIds: BlueprintMealId[] = includeOptional
    ? ["breakfast", "lunch", "dinner", "optional"]
    : ["breakfast", "lunch", "dinner"];
  const rows: Array<{ amount: string; name: string; meal: string }> = [];
  for (const meal of BLUEPRINT_MEALS) {
    if (!mealIds.includes(meal.id)) continue;
    for (const id of meal.ingredientIds) {
      const ing = ingredientById(id);
      if (!ing) continue;
      rows.push({
        amount: formatAmount(ing.usePerDay, ing.unit),
        name: ing.name,
        meal: meal.title,
      });
    }
  }
  return rows;
}

export function groupRowsByAisle(rows: RunOutRow[]): Array<{
  aisle: TjAisle;
  items: RunOutRow[];
}> {
  const map = new Map<TjAisle, RunOutRow[]>();
  for (const a of TJ_AISLE_ORDER) map.set(a, []);
  for (const r of rows) {
    if (r.packsToBuy <= 0) continue; // only shopping list: what you need to buy
    (map.get(r.aisle) || []).push(r);
  }
  return TJ_AISLE_ORDER.filter((a) => (map.get(a) || []).length > 0).map(
    (aisle) => ({ aisle, items: map.get(aisle) || [] })
  );
}

/** Full list for shopping including zero-buy for stock view */
export function allRowsGrouped(rows: RunOutRow[]): Array<{
  aisle: TjAisle;
  items: RunOutRow[];
}> {
  const map = new Map<TjAisle, RunOutRow[]>();
  for (const a of TJ_AISLE_ORDER) map.set(a, []);
  for (const r of rows) (map.get(r.aisle) || []).push(r);
  return TJ_AISLE_ORDER.filter((a) => (map.get(a) || []).length > 0).map(
    (aisle) => ({ aisle, items: map.get(aisle) || [] })
  );
}

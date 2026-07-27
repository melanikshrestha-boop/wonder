/**
 * Groceri.es-style grocery engine for Wonder.
 *
 * Inspired by https://github.com/juriansluiman/groceri.es:
 *   recipes (fixed day menu) → plan days → auto grocery list
 *   pantry items stay out of the cart
 *   list is aisle-ordered so the store run is a path, not a panic
 *
 * Fun layer: progress bar, aisle missions, run XP — so the chore feels winnable.
 */
import { MEAL_PRESETS } from "./data";

export type GroceryAisle =
  | "Produce"
  | "Dairy & eggs"
  | "Seafood"
  | "Meat"
  | "Bakery / grains"
  | "Frozen"
  | "Pantry staples"
  | "Other";

/** Canonical buyable line (not a recipe bullet with fluff). */
export type GroceryLine = {
  id: string;
  name: string;
  /** Amount for 1 day of the fixed menu */
  perDay: number;
  unit: string;
  aisle: GroceryAisle;
  /** If true, assume stocked unless marked buy */
  pantryDefault?: boolean;
  /** Costco / Walmart search query */
  search: string;
};

export type GroceryRunItem = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  aisle: GroceryAisle;
  search: string;
  done: boolean;
  fromPantry: boolean;
};

export type GroceryRun = {
  id: string;
  days: number;
  createdAt: string;
  items: GroceryRunItem[];
  /** completed runs count for fun streak */
  xpAwarded?: number;
};

const AISLE_ORDER: GroceryAisle[] = [
  "Produce",
  "Dairy & eggs",
  "Seafood",
  "Meat",
  "Bakery / grains",
  "Frozen",
  "Pantry staples",
  "Other",
];

/**
 * Breakfast-only shopping map (lunch/dinner/snack not in app yet).
 * Quantities are per day of the yogurt bowl breakfast.
 */
export const FIXED_MENU_GROCERIES: GroceryLine[] = [
  {
    id: "fage-yogurt",
    name: "Fage 0% Greek yogurt",
    perDay: 0.15,
    unit: "kg",
    aisle: "Dairy & eggs",
    search: "Fage 0% Greek yogurt",
  },
  {
    id: "kefir",
    name: "Fage 0% kefir",
    perDay: 0.1,
    unit: "L",
    aisle: "Dairy & eggs",
    search: "plain kefir",
  },
  {
    id: "eggs",
    name: "Eggs",
    perDay: 1,
    unit: "eggs",
    aisle: "Dairy & eggs",
    search: "eggs dozen",
  },
  {
    id: "blueberries",
    name: "Blueberries",
    perDay: 0.5,
    unit: "cups",
    aisle: "Produce",
    search: "blueberries",
  },
  {
    id: "strawberries",
    name: "Strawberries",
    perDay: 3,
    unit: "berries",
    aisle: "Produce",
    search: "strawberries",
  },
  {
    id: "chia",
    name: "Chia seeds",
    perDay: 0.02,
    unit: "cups",
    aisle: "Pantry staples",
    pantryDefault: true,
    search: "chia seeds",
  },
  {
    id: "flax",
    name: "Flaxseeds",
    perDay: 0.02,
    unit: "cups",
    aisle: "Pantry staples",
    pantryDefault: true,
    search: "flaxseed",
  },
  {
    id: "pumpkin-seeds",
    name: "Pumpkin seeds",
    perDay: 0.03,
    unit: "cups",
    aisle: "Pantry staples",
    pantryDefault: true,
    search: "pumpkin seeds",
  },
  {
    id: "makhana",
    name: "Makhana (fox nuts)",
    perDay: 12,
    unit: "pieces",
    aisle: "Pantry staples",
    pantryDefault: true,
    search: "makhana fox nuts",
  },
  {
    id: "honey",
    name: "Raw honey",
    perDay: 0.01,
    unit: "tsp",
    aisle: "Pantry staples",
    pantryDefault: true,
    search: "raw honey",
  },
];

const RUN_KEY = "wonder-grocery-run-v1";
const PANTRY_KEY = "wonder-grocery-pantry-v1";
const XP_KEY = "wonder-grocery-xp-v1";
export const GROCERY_EVENT = "wonder-grocery-update";

function emit() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(GROCERY_EVENT));
  }
}

export function loadPantryIds(): Set<string> {
  try {
    const raw = localStorage.getItem(PANTRY_KEY);
    if (raw) {
      const arr = JSON.parse(raw) as string[];
      if (Array.isArray(arr)) return new Set(arr);
    }
  } catch {
    /* seed defaults */
  }
  return new Set(
    FIXED_MENU_GROCERIES.filter((g) => g.pantryDefault).map((g) => g.id)
  );
}

export function savePantryIds(ids: Set<string>) {
  localStorage.setItem(PANTRY_KEY, JSON.stringify([...ids]));
  emit();
}

export function loadGroceryXp(): number {
  try {
    return Math.max(0, Number(localStorage.getItem(XP_KEY)) || 0);
  } catch {
    return 0;
  }
}

export function addGroceryXp(n: number) {
  const next = loadGroceryXp() + n;
  localStorage.setItem(XP_KEY, String(next));
  emit();
  return next;
}

function roundQty(n: number, unit: string): number {
  if (unit === "eggs" || unit === "berries" || unit === "pieces" || unit === "lemons") {
    return Math.max(1, Math.ceil(n));
  }
  if (unit === "use") return 1;
  // round to 1 decimal for kg/L/lb
  return Math.max(0.1, Math.round(n * 10) / 10);
}

/**
 * Build a grocery run for N days of the fixed menu.
 * Pantry items are excluded unless forceBuyPantry is true.
 */
export function buildGroceryRun(
  days: number,
  opts?: { forceBuyPantry?: boolean; pantryIds?: Set<string> }
): GroceryRun {
  const d = Math.min(21, Math.max(1, Math.round(days) || 7));
  const pantry = opts?.pantryIds || loadPantryIds();
  const items: GroceryRunItem[] = [];

  for (const line of FIXED_MENU_GROCERIES) {
    const inPantry = pantry.has(line.id);
    if (inPantry && !opts?.forceBuyPantry) continue;
    const qty = roundQty(line.perDay * d, line.unit);
    items.push({
      id: line.id,
      name: line.name,
      quantity: qty,
      unit: line.unit,
      aisle: line.aisle,
      search: line.search,
      done: false,
      fromPantry: false,
    });
  }

  // Stable aisle order
  items.sort(
    (a, b) => AISLE_ORDER.indexOf(a.aisle) - AISLE_ORDER.indexOf(b.aisle)
  );

  return {
    id: `run-${Date.now()}`,
    days: d,
    createdAt: new Date().toISOString(),
    items,
  };
}

export function loadGroceryRun(): GroceryRun | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(RUN_KEY) || "null") as GroceryRun | null;
    if (!parsed?.items?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveGroceryRun(run: GroceryRun | null) {
  if (run) localStorage.setItem(RUN_KEY, JSON.stringify(run));
  else localStorage.removeItem(RUN_KEY);
  emit();
}

export function toggleRunItem(run: GroceryRun, id: string): GroceryRun {
  return {
    ...run,
    items: run.items.map((item) =>
      item.id === id ? { ...item, done: !item.done } : item
    ),
  };
}

export function runProgress(run: GroceryRun): {
  done: number;
  total: number;
  pct: number;
} {
  const total = run.items.length || 1;
  const done = run.items.filter((i) => i.done).length;
  return { done, total, pct: Math.round((done / total) * 100) };
}

export function groupByAisle(run: GroceryRun): Array<{
  aisle: GroceryAisle;
  items: GroceryRunItem[];
}> {
  const map = new Map<GroceryAisle, GroceryRunItem[]>();
  for (const aisle of AISLE_ORDER) map.set(aisle, []);
  for (const item of run.items) {
    const list = map.get(item.aisle) || [];
    list.push(item);
    map.set(item.aisle, list);
  }
  return AISLE_ORDER.map((aisle) => ({
    aisle,
    items: map.get(aisle) || [],
  })).filter((g) => g.items.length > 0);
}

/** Fun micro-copy for progress — makes the chore feel like a short game. */
export function runCheer(pct: number, done: number, total: number): string {
  if (total === 0) return "Nothing to buy. Go live.";
  if (pct === 0) return "Aisle 1. Headphones on. This is a speedrun.";
  if (pct < 25) return "You're moving. Don't invent snacks.";
  if (pct < 50) return "Halfway vibe. Stick to the list.";
  if (pct < 75) return "Almost out. No wandering the chip aisle.";
  if (pct < 100) return `${total - done} left. Finish and leave.`;
  return "Run complete. +XP. You never have to decide dinner again.";
}

/** One-liner for Mel about the fixed menu → list model. */
export function groceryEngineBlurb(): string {
  const meals = MEAL_PRESETS.map((m) => m.title).join(" · ");
  return `Fixed menu (${meals}) → grocery list auto-built like groceri.es. Pantry skipped. Aisle path. Check boxes, earn XP, leave.`;
}

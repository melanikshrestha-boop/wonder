/**
 * Food OS — fixed daily plate. No rotation. No "what meat today".
 * Decision fatigue kills consistency; the menu is already decided.
 */
import { loadGoals } from "./melContext";
import {
  FIXED_DAY_MEAL_IDS,
  MEAL_PRESETS,
  fixedDayMenuSummary,
  todayKey,
} from "./data";
import { wonderEmit } from "./core/eventBus";

export type FoodOsMeat = "beef" | "salmon";

export type FoodOsDay = {
  meat: FoodOsMeat;
  locked: boolean;
  eatenAt?: string;
};

export type FoodOsStore = {
  days: Record<string, FoodOsDay>;
};

export type FoodOsPlan = {
  day: string;
  meat: FoodOsMeat;
  locked: boolean;
  eaten: boolean;
  plate: string;
  proteinRemaining_g: number;
  caloriesRemaining: number;
  note: string;
  /** Fixed day menu lines for Mel / UI */
  menu: Array<{
    id: string;
    slot: string;
    title: string;
    protein_g: number;
    calories: number;
    logged: boolean;
  }>;
  loggedCount: number;
  totalMeals: number;
};

export const FOOD_OS_KEY = "dr-melani-food-os-v1";
export const FOOD_OS_EVENT = "dr-melani-food-os-update";

/** Dinner protein is always salmon — never re-pick. */
export const FIXED_DINNER_MEAT: FoodOsMeat = "salmon";

type MealDay = {
  loggedIds: string[];
  totals: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    fiber_g: number;
  };
};

function loadStore(): FoodOsStore {
  try {
    const parsed = JSON.parse(localStorage.getItem(FOOD_OS_KEY) || "null") as Partial<FoodOsStore> | null;
    if (parsed?.days && typeof parsed.days === "object") return { days: parsed.days };
  } catch {
    /* use empty store */
  }
  return { days: {} };
}

function saveStore(store: FoodOsStore): void {
  localStorage.setItem(FOOD_OS_KEY, JSON.stringify(store));
  window.dispatchEvent(new CustomEvent(FOOD_OS_EVENT));
  wonderEmit("data.changed", "foodOs", { key: FOOD_OS_KEY });
}

function loadMealDay(day: string): MealDay {
  try {
    const parsed = JSON.parse(localStorage.getItem(`dr-melani-meals-usuals:${day}`) || "null") as MealDay | null;
    if (parsed?.totals && Array.isArray(parsed.loggedIds)) return parsed;
  } catch {
    /* use empty day */
  }
  return {
    loggedIds: [],
    totals: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 },
  };
}

/** Always the same dinner meat. Override only if she explicitly locks beef. */
export function ensureTodayMeat(day: string = todayKey()): FoodOsDay {
  const store = loadStore();
  const current = store.days[day];
  if (current) return current;
  // Default: fixed salmon, already "locked" so nothing re-decides
  const next: FoodOsDay = { meat: FIXED_DINNER_MEAT, locked: true };
  saveStore({ ...store, days: { ...store.days, [day]: next } });
  wonderEmit("meat.locked", "foodOs", { day, meat: next.meat, auto: true });
  return next;
}

export function lockTodayMeat(meat: FoodOsMeat, day: string = todayKey()): FoodOsDay {
  const store = loadStore();
  const next: FoodOsDay = {
    ...(store.days[day] || { meat, locked: false }),
    meat,
    locked: true,
  };
  saveStore({ ...store, days: { ...store.days, [day]: next } });
  wonderEmit("meat.locked", "foodOs", { day, meat });
  return next;
}

export function markTodayMeatEaten(meat?: FoodOsMeat, day: string = todayKey()): FoodOsDay {
  const current = meat ? lockTodayMeat(meat, day) : ensureTodayMeat(day);
  const store = loadStore();
  const next: FoodOsDay = { ...current, eatenAt: new Date().toISOString() };
  saveStore({ ...store, days: { ...store.days, [day]: next } });
  wonderEmit("meat.eaten", "foodOs", { day, meat: next.meat });
  return next;
}

export function undoTodayMeatEaten(day: string = todayKey()): FoodOsDay {
  const current = ensureTodayMeat(day);
  const store = loadStore();
  const next = { ...current };
  delete next.eatenAt;
  saveStore({ ...store, days: { ...store.days, [day]: next } });
  return next;
}

export function buildFoodOsPlan(day: string = todayKey()): FoodOsPlan {
  const selection = ensureTodayMeat(day);
  const meals = loadMealDay(day);
  const goals = loadGoals();
  const proteinRemaining = Math.max(0, Math.round(goals.protein_g - meals.totals.protein_g));
  const caloriesRemaining = Math.max(0, Math.round(goals.calories - meals.totals.calories));

  const menu = MEAL_PRESETS.map((m) => ({
    id: m.id,
    slot: m.slot,
    title: m.title,
    protein_g: m.protein_g,
    calories: m.calories,
    logged: meals.loggedIds.includes(m.id),
  }));
  const loggedCount = menu.filter((m) => m.logged).length;

  const breakfastLogged = meals.loggedIds.includes("breakfast_usual");
  const plate =
    "Breakfast only for now (yogurt bowl). No lunch / dinner / snack in the app yet.";

  const note = breakfastLogged
    ? "Breakfast is logged."
    : "Log breakfast when you eat it. Same bowl every morning.";

  return {
    day,
    meat: selection.meat,
    locked: true,
    eaten: Boolean(selection.eatenAt) || breakfastLogged,
    plate,
    proteinRemaining_g: proteinRemaining,
    caloriesRemaining,
    note: `${note} ${fixedDayMenuSummary()}`,
    menu,
    loggedCount,
    totalMeals: FIXED_DAY_MEAL_IDS.length,
  };
}

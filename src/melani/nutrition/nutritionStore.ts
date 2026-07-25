/**
 * Nutrition store — per-item food records, not a flat macro bag.
 *
 * The old tracker stored one lump sum per day, so you could never see what you
 * ate, edit a portion, or delete a mistake. This keeps every item as its own
 * row and derives the totals.
 *
 * Compatibility matters more than purity here: Fitness, the nightly body brief,
 * Mel's context, and the digital twin all read
 * `dr-melani-meals-usuals:{day}`. Every mutation writes that key back, so those
 * surfaces stay live while this one gets the richer model. Existing lump-sum
 * days are migrated into a single entry rather than being thrown away.
 */
import { MACRO_GOALS, todayKey } from "../data";
import {
  addMacros,
  emptyMacros,
  foodById,
  macrosFor,
  type Macros,
} from "./foodDb";

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

export const SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];

export const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snacks",
};

export type EntrySource =
  | "search"
  | "text"
  | "photo"
  | "preset"
  | "manual"
  | "legacy";

export type NutriEntry = {
  id: string;
  day: string;
  slot: MealSlot;
  name: string;
  grams: number;
  qtyLabel: string;
  macros: Macros;
  foodId?: string;
  /** Set when logged from a MEAL_PRESET, so legacy checkmarks keep working. */
  presetId?: string;
  source: EntrySource;
  loggedAt: string;
};

export type NutriProfile = {
  weight_lb: number;
  height_in: number;
  age: number;
  sex: "female" | "male";
  activity: "sedentary" | "light" | "moderate" | "active" | "athlete";
  goal: "cut" | "maintain" | "gain";
  /** False until the weight is confirmed — TDEE is labelled an estimate. */
  weightConfirmed: boolean;
};

export type Targets = Macros;

const ENTRIES_KEY = "wonder-nutrition-entries-v1";
const TARGETS_KEY = "wonder-nutrition-targets-v1";
const PROFILE_KEY = "wonder-nutrition-profile-v1";
const MIGRATED_KEY = "wonder-nutrition-migrated-v1";
const LEGACY_KEY = "dr-melani-meals-usuals";
const WATER_KEY = "dr-melani-water-ml";
export const NUTRITION_EVENT = "wonder-nutrition-update";

type EntryMap = Record<string, NutriEntry[]>;

function emit() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(NUTRITION_EVENT));
}

export function onNutritionChange(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(NUTRITION_EVENT, cb);
  return () => window.removeEventListener(NUTRITION_EVENT, cb);
}

function readJson<T>(key: string, fallback: T): T {
  try {
    if (typeof localStorage === "undefined") return fallback;
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked — in-memory state still holds this session */
  }
}

// ─── Profile & targets ───────────────────────────────────────────────────────

export const DEFAULT_PROFILE: NutriProfile = {
  weight_lb: 120,
  height_in: 60, // 5 ft 0 in, per the Wonder health profile
  age: 18,
  sex: "female",
  activity: "moderate",
  goal: "maintain",
  weightConfirmed: false,
};

export function loadProfile(): NutriProfile {
  return { ...DEFAULT_PROFILE, ...readJson<Partial<NutriProfile>>(PROFILE_KEY, {}) };
}

export function saveProfile(profile: NutriProfile) {
  writeJson(PROFILE_KEY, profile);
  emit();
}

export const DEFAULT_TARGETS: Targets = {
  calories: MACRO_GOALS.calories,
  protein_g: MACRO_GOALS.protein_g,
  carbs_g: MACRO_GOALS.carbs_g,
  fat_g: MACRO_GOALS.fat_g,
  fiber_g: MACRO_GOALS.fiber_g,
};

export function loadTargets(): Targets {
  return { ...DEFAULT_TARGETS, ...readJson<Partial<Targets>>(TARGETS_KEY, {}) };
}

export function saveTargets(targets: Targets) {
  writeJson(TARGETS_KEY, targets);
  emit();
}

// ─── Entries ─────────────────────────────────────────────────────────────────

function loadMap(): EntryMap {
  return readJson<EntryMap>(ENTRIES_KEY, {});
}

function saveMap(map: EntryMap) {
  writeJson(ENTRIES_KEY, map);
}

/**
 * Pull a pre-existing lump-sum day into the entry model exactly once, so
 * nothing logged before this tracker existed disappears from the rings.
 */
function migrateLegacyDay(day: string, map: EntryMap): EntryMap {
  const migrated = readJson<Record<string, boolean>>(MIGRATED_KEY, {});
  if (migrated[day] || map[day]) return map;

  const legacy = readJson<{ loggedIds?: string[]; totals?: Partial<Macros> } | null>(
    `${LEGACY_KEY}:${day}`,
    null
  );
  const totals = legacy?.totals;
  const hasData = totals && (totals.calories || totals.protein_g || totals.carbs_g || totals.fat_g);
  if (!hasData) return map;

  const entry: NutriEntry = {
    id: `legacy-${day}`,
    day,
    slot: "breakfast",
    name: "Logged before item tracking",
    grams: 0,
    qtyLabel: "Imported day total",
    macros: {
      calories: Math.round(totals.calories || 0),
      protein_g: Math.round((totals.protein_g || 0) * 10) / 10,
      carbs_g: Math.round((totals.carbs_g || 0) * 10) / 10,
      fat_g: Math.round((totals.fat_g || 0) * 10) / 10,
      fiber_g: Math.round((totals.fiber_g || 0) * 10) / 10,
    },
    presetId: legacy?.loggedIds?.[0],
    source: "legacy",
    loggedAt: `${day}T12:00:00.000Z`,
  };
  writeJson(MIGRATED_KEY, { ...migrated, [day]: true });
  return { ...map, [day]: [entry] };
}

export function loadDay(day: string = todayKey()): NutriEntry[] {
  let map = loadMap();
  const migrated = migrateLegacyDay(day, map);
  if (migrated !== map) {
    map = migrated;
    saveMap(map);
  }
  return map[day] || [];
}

export function dayTotals(entries: NutriEntry[]): Macros {
  return entries.reduce((sum, e) => addMacros(sum, e.macros), emptyMacros());
}

export function totalsFor(day: string = todayKey()): Macros {
  return dayTotals(loadDay(day));
}

/** Mirror the day into the key every other Wonder surface already reads. */
function syncLegacy(day: string, entries: NutriEntry[]) {
  const totals = dayTotals(entries);
  writeJson(`${LEGACY_KEY}:${day}`, {
    loggedIds: entries.map((e) => e.presetId || e.id),
    totals: {
      calories: Math.round(totals.calories),
      protein_g: Math.round(totals.protein_g),
      carbs_g: Math.round(totals.carbs_g),
      fat_g: Math.round(totals.fat_g),
      fiber_g: Math.round(totals.fiber_g),
    },
  });
}

function commit(day: string, entries: NutriEntry[]): NutriEntry[] {
  const map = loadMap();
  saveMap({ ...map, [day]: entries });
  syncLegacy(day, entries);
  emit();
  return entries;
}

function newId(): string {
  return `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export type NewEntry = {
  slot: MealSlot;
  name: string;
  grams: number;
  qtyLabel?: string;
  macros: Macros;
  foodId?: string;
  presetId?: string;
  source?: EntrySource;
};

export function addEntry(input: NewEntry, day: string = todayKey()): NutriEntry[] {
  const entry: NutriEntry = {
    id: newId(),
    day,
    slot: input.slot,
    name: input.name,
    grams: Math.round(input.grams),
    qtyLabel: input.qtyLabel || `${Math.round(input.grams)} g`,
    macros: input.macros,
    foodId: input.foodId,
    presetId: input.presetId,
    source: input.source || "manual",
    loggedAt: new Date().toISOString(),
  };
  const next = [...loadDay(day), entry];
  rememberRecent(entry);
  return commit(day, next);
}

export function addEntries(inputs: NewEntry[], day: string = todayKey()): NutriEntry[] {
  const now = new Date().toISOString();
  const created = inputs.map((input, index) => ({
    id: `${newId()}-${index}`,
    day,
    slot: input.slot,
    name: input.name,
    grams: Math.round(input.grams),
    qtyLabel: input.qtyLabel || `${Math.round(input.grams)} g`,
    macros: input.macros,
    foodId: input.foodId,
    presetId: input.presetId,
    source: input.source || "manual",
    loggedAt: now,
  }));
  created.forEach(rememberRecent);
  return commit(day, [...loadDay(day), ...created]);
}

export function removeEntry(id: string, day: string = todayKey()): NutriEntry[] {
  return commit(day, loadDay(day).filter((e) => e.id !== id));
}

/** Re-weigh an entry; macros are recomputed from the source food. */
export function setEntryGrams(id: string, grams: number, day: string = todayKey()): NutriEntry[] {
  const safe = Math.max(0, Math.round(grams));
  return commit(
    day,
    loadDay(day).map((entry) => {
      if (entry.id !== id) return entry;
      const food = entry.foodId ? foodById(entry.foodId) : undefined;
      if (!food) {
        // No source food (photo or manual): scale what we have proportionally.
        const k = entry.grams > 0 ? safe / entry.grams : 0;
        return {
          ...entry,
          grams: safe,
          macros: {
            calories: Math.round(entry.macros.calories * k),
            protein_g: Math.round(entry.macros.protein_g * k * 10) / 10,
            carbs_g: Math.round(entry.macros.carbs_g * k * 10) / 10,
            fat_g: Math.round(entry.macros.fat_g * k * 10) / 10,
            fiber_g: Math.round(entry.macros.fiber_g * k * 10) / 10,
          },
        };
      }
      return {
        ...entry,
        grams: safe,
        macros: macrosFor(food, safe),
        qtyLabel: `${safe} g`,
      };
    })
  );
}

export function moveEntry(id: string, slot: MealSlot, day: string = todayKey()): NutriEntry[] {
  return commit(day, loadDay(day).map((e) => (e.id === id ? { ...e, slot } : e)));
}

export function entriesBySlot(entries: NutriEntry[]): Record<MealSlot, NutriEntry[]> {
  const out = { breakfast: [], lunch: [], dinner: [], snack: [] } as Record<MealSlot, NutriEntry[]>;
  for (const entry of entries) (out[entry.slot] || out.snack).push(entry);
  return out;
}

// ─── Recents & favorites ─────────────────────────────────────────────────────

const RECENTS_KEY = "wonder-nutrition-recents-v1";
const FAVORITES_KEY = "wonder-nutrition-favorites-v1";

export type QuickFood = {
  foodId?: string;
  name: string;
  grams: number;
  qtyLabel: string;
  macros: Macros;
  count: number;
};

function rememberRecent(entry: NutriEntry) {
  if (entry.source === "legacy") return;
  const list = readJson<QuickFood[]>(RECENTS_KEY, []);
  const key = entry.foodId || entry.name.toLowerCase();
  const existing = list.find((r) => (r.foodId || r.name.toLowerCase()) === key);
  const next = existing
    ? list.map((r) =>
        r === existing
          ? { ...r, count: r.count + 1, grams: entry.grams, qtyLabel: entry.qtyLabel, macros: entry.macros }
          : r
      )
    : [
        {
          foodId: entry.foodId,
          name: entry.name,
          grams: entry.grams,
          qtyLabel: entry.qtyLabel,
          macros: entry.macros,
          count: 1,
        },
        ...list,
      ];
  writeJson(RECENTS_KEY, next.sort((a, b) => b.count - a.count).slice(0, 24));
}

export function loadRecents(): QuickFood[] {
  return readJson<QuickFood[]>(RECENTS_KEY, []);
}

export function loadFavorites(): string[] {
  return readJson<string[]>(FAVORITES_KEY, []);
}

export function toggleFavorite(foodId: string): string[] {
  const list = loadFavorites();
  const next = list.includes(foodId) ? list.filter((id) => id !== foodId) : [...list, foodId];
  writeJson(FAVORITES_KEY, next);
  emit();
  return next;
}

// ─── Water (shares the key the rest of Wonder already uses) ──────────────────

export function loadWater(day: string = todayKey()): number {
  try {
    if (typeof localStorage === "undefined") return 0;
    return Number(localStorage.getItem(`${WATER_KEY}:${day}`) || 0) || 0;
  } catch {
    return 0;
  }
}

export function addWater(ml: number, day: string = todayKey()): number {
  const next = Math.max(0, loadWater(day) + ml);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(`${WATER_KEY}:${day}`, String(next));
    }
  } catch {
    /* ignore */
  }
  emit();
  return next;
}

// ─── Date helpers ────────────────────────────────────────────────────────────

export function ymd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + delta);
  return ymd(date);
}

/** Totals for the last N days, oldest → newest. */
export function history(days: number, until: string = todayKey()): { day: string; totals: Macros }[] {
  const out: { day: string; totals: Macros }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = shiftDay(until, -i);
    out.push({ day, totals: totalsFor(day) });
  }
  return out;
}

/**
 * Water ledger (ml) shared by Meals water bar + meal auto-log.
 * Keys match Fitness water UI + habit auto-sync.
 */
import { notifyHabitAutoSync, WATER_GOAL_ML } from "./habitAutoSync";
import type { MealMeasure, MealPreset } from "./data";

export const WATER_KEY = "dr-melani-water-ml";
export const WATER_HIST_KEY = "dr-melani-water-hist";

/** Default pour size on Blueprint slots */
export const MEAL_WATER_ML = 250;

const MEL_DATA_EVENT = "dr-melani-data-update";

export function loadWater(day: string): number {
  try {
    const raw = localStorage.getItem(`${WATER_KEY}:${day}`);
    if (raw) return Math.max(0, Number(raw) || 0);
  } catch {
    /* ignore */
  }
  return 0;
}

export function saveWater(day: string, ml: number) {
  try {
    localStorage.setItem(`${WATER_KEY}:${day}`, String(Math.max(0, Math.round(ml))));
  } catch {
    /* ignore */
  }
  notifyHabitAutoSync(day);
  try {
    window.dispatchEvent(
      new CustomEvent(MEL_DATA_EVENT, { detail: { domain: "water", day } })
    );
  } catch {
    /* ignore */
  }
}

export function loadWaterHist(day: string): number[] {
  try {
    const raw = localStorage.getItem(`${WATER_HIST_KEY}:${day}`);
    if (raw) return JSON.parse(raw) as number[];
  } catch {
    /* ignore */
  }
  return [];
}

export function saveWaterHist(day: string, hist: number[]) {
  try {
    localStorage.setItem(`${WATER_HIST_KEY}:${day}`, JSON.stringify(hist));
  } catch {
    /* ignore */
  }
}

/**
 * Parse water ml from a meal’s ingredient rows (e.g. amount "250 ml").
 * Sums every Water line so multi-water meals stay correct.
 */
export function waterMlFromMeasures(
  measures: MealMeasure[] | undefined
): number {
  if (!measures?.length) return 0;
  let total = 0;
  for (const m of measures) {
    if (!/^water\b/i.test(m.item.trim())) continue;
    const fromAmount = m.amount?.match(/(\d+(?:\.\d+)?)\s*ml/i);
    if (fromAmount) {
      total += Math.round(Number(fromAmount[1]));
      continue;
    }
    // Fallback: Blueprint default pour
    if (/250/i.test(m.amount || "") || /250/i.test(m.how || "")) {
      total += MEAL_WATER_ML;
    }
  }
  return total;
}

export function waterMlFromPreset(preset: MealPreset): number {
  return waterMlFromMeasures(preset.measures);
}

/** Add a drink; returns ml actually added (0 if already at goal). */
export function addWaterDrink(
  day: string,
  amount: number,
  goal = WATER_GOAL_ML
): number {
  const delta = Math.max(0, Math.round(Number(amount) || 0));
  if (delta <= 0) return 0;
  const prev = loadWater(day);
  const next = Math.min(goal, prev + delta);
  const added = next - prev;
  if (added <= 0) return 0;
  saveWater(day, next);
  saveWaterHist(day, [...loadWaterHist(day), added]);
  return added;
}

/**
 * Remove one drink of `amount` (prefer exact hist match, else subtract total).
 * Used when undoing a meal that auto-logged water.
 */
export function removeWaterDrink(day: string, amount: number): number {
  const target = Math.max(0, Math.round(Number(amount) || 0));
  if (target <= 0) return 0;

  const hist = loadWaterHist(day);
  // Prefer last hist entry that equals the meal pour (250)
  let idx = -1;
  for (let i = hist.length - 1; i >= 0; i--) {
    if (hist[i] === target) {
      idx = i;
      break;
    }
  }

  if (idx >= 0) {
    const removed = hist[idx];
    const nextHist = [...hist.slice(0, idx), ...hist.slice(idx + 1)];
    const prev = loadWater(day);
    const next = Math.max(0, prev - removed);
    saveWater(day, next);
    saveWaterHist(day, nextHist);
    return removed;
  }

  // No matching hist chip — still peel total if user hit goal cap earlier
  const prev = loadWater(day);
  if (prev <= 0) return 0;
  const removed = Math.min(prev, target);
  saveWater(day, prev - removed);
  return removed;
}

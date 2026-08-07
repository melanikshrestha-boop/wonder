/**
 * Cut-out scan helpers for trash can highlights.
 * MEAL FLAGS UI was removed by Melani — do not reintroduce that section.
 * Keep flagDayMeals / cutoutLabelsHitToday for FoodPlateGuide hits + log flash only.
 */
import { MEAL_PRESETS } from "./data";
import {
  reportMealCutouts,
  type CutoutHit,
  type MealCutoutReport,
} from "./foodGuide";
import {
  loadDay,
  type NutriEntry,
} from "./nutrition/nutritionStore";

export type FlaggedMeal = {
  id: string;
  title: string;
  slot?: string;
  report: MealCutoutReport;
};

function partsForEntry(e: NutriEntry): string[] {
  const parts = [e.name, e.qtyLabel];
  if (e.presetId) {
    const preset = MEAL_PRESETS.find((m) => m.id === e.presetId);
    if (preset) {
      parts.push(preset.title, preset.notes || "", ...preset.ingredients);
      for (const sec of preset.sections || []) {
        parts.push(...sec.items);
      }
    }
  }
  return parts;
}

/** Scan one nutrition entry (and its preset ingredients if any). */
export function flagEntry(e: NutriEntry): FlaggedMeal {
  const parts = partsForEntry(e);
  const report = reportMealCutouts(e.name, parts);
  return {
    id: e.id,
    title: e.name,
    slot: e.slot,
    report,
  };
}

/** All of today’s logged meals with cut-out reports. */
export function flagDayMeals(day: string): FlaggedMeal[] {
  return loadDay(day).map(flagEntry);
}

/** Unique cut-out labels hit today (for highlighting the bin). */
export function cutoutLabelsHitToday(day: string): CutoutHit["label"][] {
  const set = new Set<CutoutHit["label"]>();
  for (const m of flagDayMeals(day)) {
    for (const h of m.report.hits) set.add(h.label);
  }
  return [...set];
}

/** @deprecated MEAL FLAGS UI removed — do not re-export a section component. */

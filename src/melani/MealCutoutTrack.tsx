/**
 * Daily meal cut-out tracker — every logged item is scanned against PLATE_TRASH.
 * Flag immediately if anything in the can is present.
 */
import { useMemo } from "react";
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
import "./meal-cutout-track.css";

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

type Props = {
  day: string;
  /** Re-render when meals change (pass entries length or tick). */
  tick?: number;
};

export function MealCutoutTrack({ day, tick = 0 }: Props) {
  const meals = useMemo(() => flagDayMeals(day), [day, tick]);
  const flagged = meals.filter((m) => m.report.flagged);
  const clean = meals.filter((m) => !m.report.flagged);

  if (!meals.length) {
    return (
      <section className="fx-section fx-cutout-track" aria-label="Meal flags">
        <h2 className="fx-h2">MEAL FLAGS</h2>
        <p className="fx-cutout-empty">
          Log a meal — anything on the cut-out list is flagged here.
        </p>
      </section>
    );
  }

  return (
    <section className="fx-section fx-cutout-track" aria-label="Meal flags">
      <h2 className="fx-h2">MEAL FLAGS</h2>
      <p className="fx-cutout-summary">
        {flagged.length === 0 ? (
          <span className="fx-cutout-ok">
            {meals.length} meal{meals.length === 1 ? "" : "s"} · no cut-outs
          </span>
        ) : (
          <span className="fx-cutout-bad">
            {flagged.length} flagged · {clean.length} clean · {meals.length}{" "}
            total
          </span>
        )}
      </p>

      <ul className="fx-cutout-meals">
        {meals.map((m) => (
          <li
            key={m.id}
            className={`fx-cutout-meal${m.report.flagged ? " is-flagged" : ""}`}
          >
            <div className="fx-cutout-meal-top">
              <span className="fx-cutout-meal-name">{m.title}</span>
              {m.report.flagged ? (
                <span className="fx-cutout-pill">cut out</span>
              ) : (
                <span className="fx-cutout-pill is-ok">ok</span>
              )}
            </div>
            {m.report.flagged ? (
              <ul className="fx-cutout-hits">
                {m.report.hits.map((h) => (
                  <li key={h.label}>
                    <strong>{h.label}</strong>
                    <span>matched “{h.matched}”</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

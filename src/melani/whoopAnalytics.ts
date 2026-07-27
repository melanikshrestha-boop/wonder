/**
 * Whoop series from the metric registry + store days/workouts.
 */
import { WHOOP_METRICS, type WhoopMetricKey } from "./whoopMetrics";
import type { MetricSeries, WhoopDay, WhoopStore, WhoopWorkout } from "./whoopStore";
import { loadWhoopStore } from "./whoopStore";
import { buildDeepSleepForecast } from "./deepSleepForecast";
import { buildDeepSleepRl } from "./rlDeepSleep";

export type WhoopAnalytics = {
  dayCount: number;
  range: { from: string; to: string } | null;
  /** Ordered series (registry order). Only metrics with data. */
  series: MetricSeries[];
  /** Same series keyed for O(1) lookup */
  byKey: Partial<Record<WhoopMetricKey, MetricSeries>>;
};

function emptySeries(key: string, label: string, unit: string): MetricSeries {
  return {
    key,
    label,
    unit,
    points: [],
    avg: null,
    min: null,
    max: null,
    latest: null,
    latestDay: null,
    trend: "na",
  };
}

function fillSeries(
  series: MetricSeries,
  points: { day: string; value: number }[]
): MetricSeries {
  series.points = points
    .filter((p) => Number.isFinite(p.value))
    .sort((a, b) => a.day.localeCompare(b.day));
  const vals = series.points.map((p) => p.value);
  series.avg = vals.length
    ? Math.round((vals.reduce((s, n) => s + n, 0) / vals.length) * 100) / 100
    : null;
  series.min = vals.length ? Math.min(...vals) : null;
  series.max = vals.length ? Math.max(...vals) : null;
  series.latest = vals.length ? vals[vals.length - 1] : null;
  series.latestDay = vals.length ? series.points[series.points.length - 1].day : null;
  series.trend = "na";
  if (vals.length >= 4) {
    const mid = Math.floor(vals.length / 2);
    const a = vals.slice(0, mid).reduce((s, n) => s + n, 0) / mid;
    const b = vals.slice(mid).reduce((s, n) => s + n, 0) / (vals.length - mid);
    const delta = b - a;
    const scale = Math.abs(a) > 0.01 ? Math.abs(a) : 1;
    if (delta / scale > 0.03) series.trend = "up";
    else if (delta / scale < -0.03) series.trend = "down";
    else series.trend = "flat";
  }
  return series;
}

function seriesFromDays(
  key: string,
  label: string,
  unit: string,
  days: WhoopDay[],
  get: (d: WhoopDay) => number | null | undefined
): MetricSeries {
  const points = days
    .map((d) => {
      const v = get(d);
      return v != null && Number.isFinite(v) ? { day: d.day, value: v } : null;
    })
    .filter((p): p is { day: string; value: number } => p != null);
  return fillSeries(emptySeries(key, label, unit), points);
}

function workoutDayTotals(workouts: WhoopWorkout[]) {
  const byDay = new Map<string, { min: number; strain: number }>();
  for (const w of workouts) {
    const cur = byDay.get(w.day) || { min: 0, strain: 0 };
    cur.min += w.durationMin || 0;
    cur.strain += w.strain || 0;
    byDay.set(w.day, cur);
  }
  return byDay;
}

let analyticsMem: {
  stamp: string;
  value: WhoopAnalytics;
} | null = null;

function storeStamp(s: WhoopStore): string {
  return `${s.lastImportAt || ""}|${Object.keys(s.days).length}|${s.workouts.length}|${s.journal.length}`;
}

export function buildWhoopAnalytics(store?: WhoopStore): WhoopAnalytics {
  const s = store || loadWhoopStore();
  const stamp = storeStamp(s);
  if (analyticsMem && analyticsMem.stamp === stamp) return analyticsMem.value;

  const days = Object.values(s.days).sort((a, b) => a.day.localeCompare(b.day));
  const range =
    days.length > 0
      ? { from: days[0].day, to: days[days.length - 1].day }
      : null;

  const woTotals = workoutDayTotals(s.workouts);
  const series: MetricSeries[] = [];
  const byKey: Partial<Record<WhoopMetricKey, MetricSeries>> = {};

  for (const def of WHOOP_METRICS) {
    let built: MetricSeries;
    if (def.fromWorkouts === "minutes") {
      built = fillSeries(
        emptySeries(def.key, def.label, def.unit),
        [...woTotals.entries()].map(([day, v]) => ({ day, value: v.min }))
      );
    } else if (def.fromWorkouts === "strain") {
      built = fillSeries(
        emptySeries(def.key, def.label, def.unit),
        [...woTotals.entries()].map(([day, v]) => ({
          day,
          value: Math.round(v.strain * 10) / 10,
        }))
      );
    } else if (def.get) {
      built = seriesFromDays(def.key, def.label, def.unit, days, def.get);
    } else {
      continue;
    }
    if (built.points.length === 0 && built.latest == null) continue;

    // Deep sleep: attach best linear model + logistic adequacy readout
    if (def.key === "deep" && built.points.length >= 5) {
      const fc = buildDeepSleepForecast(s);
      if (fc) {
        const histDays = built.points.map((p) => p.day);
        const fit = fc.points
          .filter((p) => p.kind === "fit" && histDays.includes(p.day))
          .map((p) => ({ day: p.day, value: p.value }));
        const future = fc.points
          .filter((p) => p.kind === "forecast")
          .map((p) => ({ day: p.day, value: p.value }));
        const rl = buildDeepSleepRl(s);
        built.forecast = {
          model: fc.model,
          summary: fc.summary,
          formula: fc.formula,
          r2: fc.r2,
          fit,
          future,
          drivers: fc.drivers,
          logistic: fc.logistic,
          rl: rl
            ? {
                algorithm: rl.algorithm,
                actionLabel: rl.actionLabel,
                tip: rl.tip,
                nTransitions: rl.nTransitions,
                stateLabel: rl.stateLabel,
              }
            : null,
        };
      }
    }

    series.push(built);
    byKey[def.key] = built;
  }

  const value: WhoopAnalytics = {
    dayCount: days.length,
    range,
    series,
    byKey,
  };
  analyticsMem = { stamp, value };
  return value;
}

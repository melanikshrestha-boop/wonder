/**
 * Mel Stats Lab — run the model catalog on her real local series.
 *
 * Pulls WHOOP / sleep / fog / water / spend, aligns by day, runs
 * describe · correlate · regress · forecast · CI · outliers.
 */
import { todayKey } from "./data";
import { loadFinance } from "./financeStore";
import { isTransferLike } from "./financeTransfers";
import { loadFogMap, loadSleepDay } from "./sleepStore";
import { loadWhoopStore } from "./whoopStore";
import { buildDeepSleepForecast } from "./deepSleepForecast";
import { buildDeepSleepRl } from "./rlDeepSleep";
import { formatCatalog } from "./statsCatalog";
import {
  autocorrelation,
  bootstrapMeanCI,
  describe,
  forecastAuto,
  forecastHolt,
  forecastLinearTime,
  forecastSES,
  formatLinearFormula,
  logisticIRLS,
  ols,
  outliersIqr,
  pearson,
  predictLinear,
  predictLogisticProb,
  spearman,
  welchT,
  zScores,
  type ForecastResult,
} from "./statsCore";

export type SeriesPoint = { day: string; value: number };

export type NamedSeries = {
  key: string;
  label: string;
  unit: string;
  points: SeriesPoint[];
};

// ── Series registry from her stores ──────────────────────────────

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function seriesFromMap(
  key: string,
  label: string,
  unit: string,
  days: string[],
  get: (day: string) => number | null
): NamedSeries {
  const points: SeriesPoint[] = [];
  for (const day of days) {
    const v = get(day);
    if (v != null && Number.isFinite(v)) points.push({ day, value: v });
  }
  return { key, label, unit, points };
}

/** All series Mel can analyze right now */
export function loadStatsSeries(): NamedSeries[] {
  const whoop = loadWhoopStore();
  const whoopDays = Object.keys(whoop.days).sort();
  const end = todayKey();
  // last ~90 calendar days for sleep/water/fog even without WHOOP
  const calDays: string[] = [];
  for (let i = 89; i >= 0; i--) calDays.push(addDays(end, -i));

  const out: NamedSeries[] = [];

  const wGet = (day: string, fn: (d: (typeof whoop.days)[string]) => number | null | undefined) => {
    const d = whoop.days[day];
    if (!d) return null;
    const v = fn(d);
    return v != null && Number.isFinite(v) ? v : null;
  };

  if (whoopDays.length) {
    out.push(
      seriesFromMap("deep", "Deep sleep", "min", whoopDays, (day) =>
        wGet(day, (d) => d.sleep?.deepMin)
      ),
      seriesFromMap("rem", "REM sleep", "min", whoopDays, (day) =>
        wGet(day, (d) => d.sleep?.remMin)
      ),
      seriesFromMap("sleep_perf", "Sleep performance", "%", whoopDays, (day) =>
        wGet(day, (d) => d.sleepScore ?? d.sleep?.performancePct)
      ),
      seriesFromMap("recovery", "Recovery", "%", whoopDays, (day) =>
        wGet(day, (d) => d.recoveryPct)
      ),
      seriesFromMap("hrv", "HRV", "ms", whoopDays, (day) =>
        wGet(day, (d) => d.hrvMs)
      ),
      seriesFromMap("rhr", "Resting HR", "bpm", whoopDays, (day) =>
        wGet(day, (d) => d.rhrBpm)
      ),
      seriesFromMap("strain", "Day strain", "", whoopDays, (day) =>
        wGet(day, (d) => d.strain ?? d.cycle?.dayStrain)
      ),
      seriesFromMap("whoop_sleep_h", "WHOOP sleep hours", "h", whoopDays, (day) => {
        const d = whoop.days[day];
        if (!d) return null;
        if (d.sleepHours != null && Number.isFinite(d.sleepHours)) return d.sleepHours;
        if (d.sleep?.asleepMin != null) return d.sleep.asleepMin / 60;
        return null;
      })
    );
  }

  out.push(
    seriesFromMap("sleep_h", "Logged sleep hours", "h", calDays, (day) => {
      const s = loadSleepDay(day);
      const h = s.hours;
      return h != null && Number.isFinite(h) ? h : null;
    }),
    seriesFromMap("water_ml", "Water", "ml", calDays, (day) => {
      try {
        const v = Number(localStorage.getItem(`dr-melani-water-ml:${day}`));
        return Number.isFinite(v) && v > 0 ? v : null;
      } catch {
        return null;
      }
    })
  );

  // Fog as 0/1 for logistic / group compare
  const fog = loadFogMap();
  out.push(
    seriesFromMap("fog", "Brain fog (1=yes)", "", calDays, (day) => {
      if (!(day in fog)) return null;
      return fog[day] ? 1 : 0;
    })
  );

  // Daily spend abs (finance)
  try {
    const fin = loadFinance();
    const byDay = new Map<string, number>();
    for (const tx of fin.transactions || []) {
      if (!tx?.date || isTransferLike(tx)) continue;
      const amt = Number(tx.amount);
      if (!Number.isFinite(amt) || amt >= 0) continue; // outflows only
      byDay.set(tx.date, (byDay.get(tx.date) || 0) + Math.abs(amt));
    }
    const spendDays = [...byDay.keys()].sort();
    if (spendDays.length) {
      out.push({
        key: "spend",
        label: "Daily spend",
        unit: "$",
        points: spendDays.map((day) => ({ day, value: byDay.get(day)! })),
      });
    }
  } catch {
    /* finance optional */
  }

  return out.filter((s) => s.points.length >= 1);
}

function findSeries(series: NamedSeries[], q: string): NamedSeries | null {
  const t = q.toLowerCase().replace(/[_-]+/g, " ").trim();
  const aliases: Record<string, string[]> = {
    deep: ["deep", "deep sleep", "sws"],
    rem: ["rem"],
    sleep_perf: ["sleep performance", "performance", "sleep perf"],
    recovery: ["recovery", "recov"],
    hrv: ["hrv", "heart rate variability"],
    rhr: ["rhr", "resting hr", "resting heart", "heart rate"],
    strain: ["strain", "day strain"],
    whoop_sleep_h: ["whoop sleep", "asleep"],
    sleep_h: ["sleep hours", "sleep h", "hours slept", "sleep"],
    water_ml: ["water", "hydrate", "hydration"],
    fog: ["fog", "brain fog"],
    spend: ["spend", "spending", "outflow", "money"],
  };
  for (const s of series) {
    if (s.key === t || s.label.toLowerCase() === t) return s;
    const als = aliases[s.key] || [];
    if (als.some((a) => t === a || t.includes(a) || a.includes(t))) return s;
  }
  // fuzzy contains
  for (const s of series) {
    if (s.label.toLowerCase().includes(t) || t.includes(s.key)) return s;
  }
  return null;
}

function vals(s: NamedSeries): number[] {
  return s.points.map((p) => p.value);
}

function align(
  a: NamedSeries,
  b: NamedSeries
): { days: string[]; x: number[]; y: number[] } {
  const mb = new Map(b.points.map((p) => [p.day, p.value]));
  const days: string[] = [];
  const x: number[] = [];
  const y: number[] = [];
  for (const p of a.points) {
    const v = mb.get(p.day);
    if (v == null || !Number.isFinite(v)) continue;
    days.push(p.day);
    x.push(p.value);
    y.push(v);
  }
  return { days, x, y };
}

function r(n: number, d = 2): string {
  if (!Number.isFinite(n)) return "—";
  return (Math.round(n * 10 ** d) / 10 ** d).toString();
}

function fmtFuture(fc: ForecastResult, unit: string, lastDay: string): string {
  const lines = fc.future.slice(0, 7).map((v, i) => {
    const day = addDays(lastDay, i + 1);
    return `  ${day}: ${r(v, 2)}${unit ? ` ${unit}` : ""}`;
  });
  return lines.join("\n");
}

// ── Public runners ───────────────────────────────────────────────

export function listAvailableSeries(): string {
  const series = loadStatsSeries();
  if (!series.length) {
    return "No numeric series yet. Import WHOOP, log sleep/water, or load finance.";
  }
  const lines = ["Available series for Mel stats lab:", ""];
  for (const s of series) {
    const d = describe(vals(s));
    lines.push(
      `• ${s.key} — ${s.label} (${s.unit || "units"}) · n=${d.n} · mean=${r(d.mean)} · latest=${r(s.points[s.points.length - 1]!.value)}`
    );
  }
  lines.push("");
  lines.push("Try: forecast recovery · correlate sleep recovery · describe deep · stats models");
  return lines.join("\n");
}

function describeSeries(s: NamedSeries): string {
  const d = describe(vals(s));
  const ci = bootstrapMeanCI(vals(s));
  const ac1 = autocorrelation(vals(s), 1);
  const outs = outliersIqr(vals(s));
  const lines = [
    `Describe · ${s.label} (${s.key})`,
    `n=${d.n}  mean=${r(d.mean)}  median=${r(d.median)}  std=${r(d.std)}`,
    `min=${r(d.min)}  q25=${r(d.q25)}  q75=${r(d.q75)}  max=${r(d.max)}  IQR=${r(d.iqr)}`,
    `CV=${r(d.cv, 3)}  lag-1 autocorr=${r(ac1, 3)}`,
  ];
  if (ci) {
    lines.push(`Bootstrap 95% CI for mean: [${r(ci.lo)}, ${r(ci.hi)}]`);
  }
  if (outs.length) {
    lines.push(
      `IQR outliers (${outs.length}): ${outs
        .slice(0, 5)
        .map((o) => r(o.value))
        .join(", ")}${outs.length > 5 ? "…" : ""}`
    );
  }
  const latest = s.points[s.points.length - 1];
  if (latest) {
    const zs = zScores(vals(s));
    lines.push(
      `Latest ${latest.day}: ${r(latest.value)}${s.unit ? ` ${s.unit}` : ""} · z=${r(zs[zs.length - 1]!, 2)}`
    );
  }
  return lines.join("\n");
}

function forecastSeries(s: NamedSeries, horizon = 7, model?: string): string {
  const y = vals(s);
  if (y.length < 3) return `Need ≥3 points for forecast on ${s.label} (have ${y.length}).`;
  let fc: ForecastResult | null = null;
  const m = (model || "auto").toLowerCase();
  if (m === "ses") fc = forecastSES(y, horizon);
  else if (m === "holt") fc = forecastHolt(y, horizon);
  else if (m === "linear" || m === "linear-time") fc = forecastLinearTime(y, horizon);
  else fc = forecastAuto(y, horizon);
  if (!fc) return `Could not fit a forecast on ${s.label}.`;
  const last = s.points[s.points.length - 1]!.day;
  const unit = s.unit === "$" ? "" : s.unit;
  const lines = [
    `Forecast · ${s.label} · model=${fc.model}`,
    fc.formula,
    fc.r2 != null ? `In-sample R²=${r(fc.r2, 3)}` : null,
    fc.holdoutRmse != null ? `One-step RMSE≈${r(fc.holdoutRmse, 3)}` : null,
    `Next ${Math.min(horizon, fc.future.length)} days:`,
    fmtFuture(fc, unit ? ` ${unit}` : s.unit === "$" ? "" : "", last),
  ];
  if (s.unit === "$") {
    // rewrite future lines with $
    const moneyLines = fc.future.slice(0, 7).map((v, i) => {
      const day = addDays(last, i + 1);
      return `  ${day}: $${r(v, 2)}`;
    });
    return [
      `Forecast · ${s.label} · model=${fc.model}`,
      fc.formula,
      `Next days:`,
      ...moneyLines,
      "",
      "Projection from your ledger pattern — not advice.",
    ].join("\n");
  }
  lines.push("");
  lines.push("Trend projection from your history — not a promise.");
  return lines.filter(Boolean).join("\n");
}

function correlatePair(a: NamedSeries, b: NamedSeries): string {
  const { x, y, days } = align(a, b);
  if (x.length < 3) {
    return `Need ≥3 overlapping days for ${a.key} × ${b.key} (have ${x.length}).`;
  }
  const rp = pearson(x, y);
  const rs = spearman(x, y);
  // simple OLS y ~ a + b x  (b is second series? keep a as x, b as y)
  const model = ols([x], y, { names: [a.key] });
  const lines = [
    `Association · ${a.label} × ${b.label}`,
    `Overlapping nights: n=${days.length} (${days[0]} → ${days[days.length - 1]})`,
    `Pearson r = ${r(rp, 3)}`,
    `Spearman ρ = ${r(rs, 3)}`,
  ];
  if (model) {
    lines.push(formatLinearFormula(model));
    lines.push(`RMSE=${r(model.rmse, 3)}  σ̂=${r(model.sigma, 3)}`);
  }
  const strength =
    Math.abs(rp) >= 0.7
      ? "strong"
      : Math.abs(rp) >= 0.4
        ? "moderate"
        : Math.abs(rp) >= 0.2
          ? "weak"
          : "little linear";
  lines.push(`Read: ${strength} linear link (sign ${rp >= 0 ? "+" : "−"}).`);
  return lines.join("\n");
}

function multiDeep(): string {
  const series = loadStatsSeries();
  const deep = findSeries(series, "deep");
  if (!deep || deep.points.length < 8) {
    return "Multi-factor deep sleep needs ≥8 WHOOP nights with deep minutes.";
  }
  const keys = ["whoop_sleep_h", "sleep_h", "recovery", "hrv", "rhr", "strain", "rem"];
  const candidates = keys
    .map((k) => findSeries(series, k))
    .filter((s): s is NamedSeries => !!s && s.points.length >= 5);

  if (candidates.length < 1) {
    return "Not enough predictor series aligned with deep sleep.";
  }

  // Use pairwise complete for each subset - pick top predictors by |r|
  const scored = candidates
    .map((s) => {
      const al = align(deep, s);
      return { s, r: Math.abs(pearson(al.x, al.y)), n: al.x.length };
    })
    .filter((x) => x.n >= 6)
    .sort((a, b) => b.r - a.r)
    .slice(0, 4);

  if (!scored.length) return "Could not align predictors with deep sleep.";

  // Intersect days where deep + all top predictors exist
  let daySet = new Set(deep.points.map((p) => p.day));
  for (const { s } of scored) {
    const ds = new Set(s.points.map((p) => p.day));
    daySet = new Set([...daySet].filter((d) => ds.has(d)));
  }
  const useDays = [...daySet].sort();
  if (useDays.length < 8) {
    return `Only ${useDays.length} complete nights for multi-factor (need 8).`;
  }

  const yv = useDays.map((d) => deep.points.find((p) => p.day === d)!.value);
  const cols = scored.map(({ s }) =>
    useDays.map((d) => s.points.find((p) => p.day === d)!.value)
  );
  const names = scored.map(({ s }) => s.key);
  const model = ols(cols, yv, { names });
  if (!model) return "OLS failed (singular matrix).";

  // logistic: deep >= median
  const med = [...yv].sort((a, b) => a - b)[Math.floor(yv.length / 2)]!;
  const y01 = yv.map((v) => (v >= med ? 1 : 0));
  const logit = logisticIRLS(cols, y01, { names });

  const lastX = scored.map(({ s }) => s.points[s.points.length - 1]!.value);
  const next = predictLinear(model, lastX);

  const lines = [
    `Multiple regression · deep sleep (min)`,
    `n=${model.n} complete nights · predictors: ${names.join(", ")}`,
    formatLinearFormula(model),
    `Adj R²=${r(model.adjR2, 3)}  RMSE=${r(model.rmse, 2)} min`,
    `If latest predictors repeat → deep ≈ ${r(next, 1)} min`,
  ];
  if (logit) {
    const p = predictLogisticProb(logit, lastX);
    lines.push(
      `Logistic P(deep ≥ median ${r(med, 0)} min) ≈ ${r(p * 100, 1)}% · train acc ${r(logit.accuracy * 100, 1)}%`
    );
  }
  lines.push("");
  lines.push("Coefficients show direction only — not causal proof.");
  return lines.join("\n");
}

function compareFogSleep(): string {
  const series = loadStatsSeries();
  const sleep =
    findSeries(series, "whoop_sleep_h") || findSeries(series, "sleep_h");
  const fog = findSeries(series, "fog");
  if (!sleep || !fog) return "Need sleep hours + brain fog logs.";
  const al = align(sleep, fog);
  if (al.x.length < 4) return `Need more overlapping fog+sleep days (have ${al.x.length}).`;
  const yes: number[] = [];
  const no: number[] = [];
  for (let i = 0; i < al.x.length; i++) {
    if (al.y[i] === 1) yes.push(al.x[i]!);
    else no.push(al.x[i]!);
  }
  if (yes.length < 2 || no.length < 2) {
    return `Need fog yes and no groups (yes n=${yes.length}, no n=${no.length}).`;
  }
  const t = welchT(yes, no);
  if (!t) return "Welch t-test failed.";
  return [
    `Welch t-test · sleep hours: fog-yes vs fog-no`,
    `Fog yes: n=${yes.length} mean=${r(t.meanA, 2)} h`,
    `Fog no:  n=${no.length} mean=${r(t.meanB, 2)} h`,
    `Difference (yes−no)=${r(t.diff, 2)} h · t=${r(t.t, 2)} · df≈${r(t.df, 1)}`,
    `|t|≳2 is a rough “noticeable” separation — still not a diagnosis.`,
  ].join("\n");
}

function deepPack(): string {
  const fc = buildDeepSleepForecast();
  const rl = buildDeepSleepRl();
  if (!fc) return "Deep sleep pack needs more WHOOP nights with deep minutes.";
  const lines = [
    "Deep-sleep model pack",
    fc.summary,
    fc.formula,
    `R²=${r(fc.r2, 3)} · n=${fc.n}`,
  ];
  if (fc.drivers) {
    lines.push(`Drivers R²=${r(fc.drivers.r2, 3)}: ${fc.drivers.formula}`);
    lines.push(`If same conditions: ~${r(fc.drivers.nextIfSameConditions, 1)} min deep`);
  }
  if (fc.logistic) {
    lines.push(
      `Logistic P(adequate deep)≈${r(fc.logistic.nextProb * 100, 1)}% · acc ${r(fc.logistic.accuracy * 100, 1)}%`
    );
  }
  if (rl) {
    lines.push(`RL: ${rl.actionLabel} — ${rl.tip}`);
  }
  return lines.join("\n");
}

/**
 * Natural-language entry for Mel.
 * Returns analysis text or null if not a stats request.
 */
export function runMelStatsQuery(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;

  // Catalog / help
  if (
    /^(stats?\s+models?|list\s+models?|statistical\s+models?|what\s+models|model\s+catalog)$/i.test(
      t
    ) ||
    /^(stats?\s+lab|stats?\s+help)$/i.test(t)
  ) {
    return formatCatalog();
  }

  if (
    /^(stats?\s+series|available\s+series|what\s+data\s+for\s+stats|list\s+series)$/i.test(
      t
    )
  ) {
    return listAvailableSeries();
  }

  // Deep pack
  if (
    /deep\s*sleep\s*(forecast|predict|model|pack)|forecast\s+deep|predict\s+deep/i.test(
      t
    )
  ) {
    return deepPack();
  }

  // Multi regress deep
  if (
    /multi(\s|-)?(factor|var|regress)|regress\s+deep|deep\s+on\s+|drivers?\s+of\s+deep/i.test(
      t
    )
  ) {
    return multiDeep();
  }

  // Fog compare
  if (/compare.*fog|fog\s+vs|welch|t-?test.*sleep|sleep.*fog/i.test(t)) {
    return compareFogSleep();
  }

  // Correlate A and B
  const corr = t.match(
    /(?:correlate|correlation|pearson|spearman|assoc(?:iat(?:e|ion))?)\s+(.+?)\s+(?:and|vs\.?|versus|with|x)\s+(.+)$/i
  );
  if (corr) {
    const series = loadStatsSeries();
    const a = findSeries(series, corr[1]!.trim());
    const b = findSeries(series, corr[2]!.trim());
    if (!a || !b) {
      return `Could not find series. Got “${corr[1]}” / “${corr[2]}”.\n\n${listAvailableSeries()}`;
    }
    return correlatePair(a, b);
  }

  // Describe X
  const desc = t.match(
    /^(?:describe|summary|summarize|stats?(?:\s+for|\s+on)?)\s+(.+)$/i
  );
  if (desc) {
    const series = loadStatsSeries();
    const s = findSeries(series, desc[1]!.trim());
    if (!s) return `No series matched “${desc[1]}”.\n\n${listAvailableSeries()}`;
    return describeSeries(s);
  }

  // Forecast / predict X
  const fc = t.match(
    /^(?:forecast|predict|projection|project|ses|holt)\s+(.+?)(?:\s+(\d+)\s*d(?:ays?)?)?$/i
  );
  if (fc || /^(?:forecast|predict)\b/i.test(t)) {
    const series = loadStatsSeries();
    let modelHint: string | undefined;
    let rest = t;
    if (/^ses\b/i.test(t)) {
      modelHint = "ses";
      rest = t.replace(/^ses\s+/i, "forecast ");
    } else if (/^holt\b/i.test(t)) {
      modelHint = "holt";
      rest = t.replace(/^holt\s+/i, "forecast ");
    }
    const m =
      rest.match(
        /^(?:forecast|predict|projection|project)\s+(.+?)(?:\s+(\d+)\s*d(?:ays?)?)?$/i
      ) || fc;
    if (m) {
      let name = m[1]!.trim();
      // strip trailing "forecast" noise
      name = name.replace(/\s+(forecast|predict|model)$/i, "").trim();
      const horizon = m[2] ? Math.min(30, Math.max(1, Number(m[2]))) : 7;
      const s = findSeries(series, name);
      if (!s) return `No series matched “${name}”.\n\n${listAvailableSeries()}`;
      return forecastSeries(s, horizon, modelHint);
    }
  }

  // CI X
  const ci = t.match(/^(?:ci|confidence|bootstrap)\s+(.+)$/i);
  if (ci) {
    const series = loadStatsSeries();
    const s = findSeries(series, ci[1]!.trim());
    if (!s) return `No series matched “${ci[1]}”.\n\n${listAvailableSeries()}`;
    const b = bootstrapMeanCI(vals(s));
    if (!b) return "Need ≥3 points for bootstrap CI.";
    return `Bootstrap 95% CI · ${s.label}\nmean=${r(b.mean)}  [${r(b.lo)}, ${r(b.hi)}]  n=${s.points.length}`;
  }

  // Outliers
  const out = t.match(/^(?:outliers?|anomaly|anomalies)\s+(.+)$/i);
  if (out) {
    const series = loadStatsSeries();
    const s = findSeries(series, out[1]!.trim());
    if (!s) return `No series matched “${out[1]}”.\n\n${listAvailableSeries()}`;
    const o = outliersIqr(vals(s));
    if (!o.length) return `${s.label}: no IQR outliers (n=${s.points.length}).`;
    return [
      `IQR outliers · ${s.label} (${o.length})`,
      ...o.slice(0, 12).map((x) => {
        const p = s.points[x.index];
        return `  ${p?.day ?? "?"}: ${r(x.value)}`;
      }),
    ].join("\n");
  }

  // Generic "stats" / "analyze" / "run models on X"
  if (
    /^(analyze|analyse|run\s+stats?|stats?\s+on)\s+(.+)$/i.test(t) ||
    /^stats?\s+.+/i.test(t)
  ) {
    const m = t.match(/^(?:analyze|analyse|run\s+stats?|stats?(?:\s+on)?)\s+(.+)$/i);
    const name = m?.[1]?.trim();
    if (name && !/models?|lab|help|series/i.test(name)) {
      const series = loadStatsSeries();
      const s = findSeries(series, name);
      if (s) {
        return [describeSeries(s), "", forecastSeries(s, 7)].join("\n");
      }
    }
  }

  // Broad genius trigger — full lab snapshot
  if (
    /^(be\s+a\s+)?stat(s|istical)?\s*(genius|god|machine)?$/i.test(t) ||
    /^run\s+all\s+models$/i.test(t) ||
    /^full\s+stats?\s*(lab|report)?$/i.test(t)
  ) {
    return fullLabReport();
  }

  return null;
}

function fullLabReport(): string {
  const series = loadStatsSeries().filter((s) => s.points.length >= 5);
  if (!series.length) {
    return "Stats lab empty. Import WHOOP or log sleep/water first.";
  }
  const lines = [
    "Mel stats lab — full pass",
    `Series with n≥5: ${series.length}`,
    "",
  ];
  // Describe top series
  const priority = ["deep", "recovery", "hrv", "strain", "sleep_h", "whoop_sleep_h", "spend"];
  const ordered = [
    ...priority.map((k) => series.find((s) => s.key === k)).filter(Boolean),
    ...series.filter((s) => !priority.includes(s.key)),
  ] as NamedSeries[];

  for (const s of ordered.slice(0, 6)) {
    const d = describe(vals(s));
    lines.push(`${s.label}: n=${d.n} μ=${r(d.mean)} σ=${r(d.std)} [${r(d.min)}–${r(d.max)}]`);
  }

  // Best auto forecasts
  lines.push("", "Auto forecasts (7d):");
  for (const key of ["deep", "recovery", "hrv", "sleep_h"]) {
    const s = series.find((x) => x.key === key);
    if (!s || s.points.length < 5) continue;
    const fc = forecastAuto(vals(s), 7);
    if (!fc) continue;
    const next = fc.future[0];
    lines.push(
      `  ${s.label}: model=${fc.model} → next≈${r(next!, 2)}${s.unit ? s.unit : ""}${fc.r2 != null ? ` (R²=${r(fc.r2, 2)})` : ""}`
    );
  }

  // Top correlations among whoop-ish
  const keys = ["deep", "recovery", "hrv", "strain", "whoop_sleep_h", "sleep_h", "rem"];
  const pairs: { a: string; b: string; r: number; n: number }[] = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = series.find((s) => s.key === keys[i]);
      const b = series.find((s) => s.key === keys[j]);
      if (!a || !b) continue;
      const al = align(a, b);
      if (al.x.length < 6) continue;
      pairs.push({
        a: a.key,
        b: b.key,
        r: pearson(al.x, al.y),
        n: al.x.length,
      });
    }
  }
  pairs.sort((x, y) => Math.abs(y.r) - Math.abs(x.r));
  if (pairs.length) {
    lines.push("", "Strongest linear links:");
    for (const p of pairs.slice(0, 5)) {
      lines.push(`  ${p.a} × ${p.b}: r=${r(p.r, 3)} (n=${p.n})`);
    }
  }

  const pack = buildDeepSleepForecast();
  if (pack) {
    lines.push("", "Deep-sleep pack:", pack.summary, pack.formula);
  }

  lines.push(
    "",
    "Catalog: say “stats models”. Single series: “forecast recovery”, “describe hrv”, “correlate sleep and recovery”."
  );
  return lines.join("\n");
}

/** Tool wrapper: always returns a string for Mel */
export function melStatsTool(query: string): string {
  const q = query.trim();
  if (!q || /^(help|models?|catalog)$/i.test(q)) return formatCatalog();
  if (/^series$/i.test(q)) return listAvailableSeries();
  const hit = runMelStatsQuery(q) || runMelStatsQuery(`stats ${q}`);
  return hit || `Stats lab didn’t parse “${q}”.\n\n${formatCatalog()}`;
}

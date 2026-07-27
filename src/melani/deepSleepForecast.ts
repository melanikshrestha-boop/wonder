/**
 * Deep sleep forecast — honest models, no fake flatline.
 *
 * Graph line (fit + 7-day dashed): always **linear in time**
 *   deep_min ≈ a + b · day_index
 * That is the only continuous forecast that can move without inventing
 * future HRV/strain. Freezing last night’s factors made a horizontal
 * “prediction” that looked broken — that path is gone.
 *
 * Multi-factor linear (sleepH, rem, recovery, hrv, rhr, strain):
 *   used only to explain *drivers* and R², and a single “if last night’s
 *   conditions again” next-night estimate in the caption — not 7 identical dots.
 *
 * Logistic: P(deep ≥ personal threshold) for next night, same last-night factors.
 */
import type { WhoopStore } from "./whoopStore";
import { loadWhoopStore } from "./whoopStore";

export type ForecastPoint = {
  day: string;
  value: number;
  kind: "fit" | "forecast";
};

export type DeepSleepForecast = {
  model: "linear-time";
  summary: string;
  formula: string;
  r2: number;
  n: number;
  points: ForecastPoint[];
  /** Optional: multi-factor in-sample R² + one-night scenario */
  drivers: {
    r2: number;
    formula: string;
    nextIfSameConditions: number;
    factors: string[];
  } | null;
  logistic: {
    accuracy: number;
    thresholdMin: number;
    nextProb: number;
    formula: string;
    n: number;
  } | null;
};

type Row = {
  day: string;
  t: number;
  deep: number;
  sleepH: number | null;
  rem: number | null;
  recovery: number | null;
  hrv: number | null;
  rhr: number | null;
  strain: number | null;
};

const DEEP_LO = 20;
const DEEP_HI = 160;

function clampDeep(v: number): number {
  if (!Number.isFinite(v)) return DEEP_LO;
  return Math.max(DEEP_LO, Math.min(DEEP_HI, v));
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
}

function ols(X: number[][], y: number[]): { beta: number[]; r2: number } | null {
  const n = y.length;
  if (n < 3 || X.length !== n) return null;
  const p = X[0]?.length ?? 0;
  if (p < 1 || p > n - 1) return null;

  const XtX: number[][] = Array.from({ length: p }, () => Array(p).fill(0));
  const Xty: number[] = Array(p).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < p; a++) {
      Xty[a] += X[i][a] * y[i];
      for (let b = 0; b < p; b++) XtX[a][b] += X[i][a] * X[i][b];
    }
  }
  const beta = solve(XtX, Xty);
  if (!beta) return null;

  const yBar = mean(y);
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    let yHat = 0;
    for (let a = 0; a < p; a++) yHat += beta[a] * X[i][a];
    ssTot += (y[i] - yBar) ** 2;
    ssRes += (y[i] - yHat) ** 2;
  }
  const r2 = ssTot > 1e-9 ? Math.max(0, Math.min(1, 1 - ssRes / ssTot)) : 0;
  return { beta, r2 };
}

function solve(A0: number[][], b0: number[]): number[] | null {
  const n = b0.length;
  const A = A0.map((row, i) => [...row, b0[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    }
    if (Math.abs(A[piv][col]) < 1e-12) return null;
    if (piv !== col) [A[col], A[piv]] = [A[piv], A[col]];
    const div = A[col][col];
    for (let c = col; c <= n; c++) A[col][c] /= div;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = A[r][col];
      for (let c = col; c <= n; c++) A[r][c] -= f * A[col][c];
    }
  }
  return A.map((row) => row[n]);
}

function predict(beta: number[], x: number[]): number {
  let s = 0;
  for (let i = 0; i < beta.length; i++) s += beta[i] * (x[i] ?? 0);
  return s;
}

function logisticIRLS(
  X: number[][],
  y: number[]
): { beta: number[]; accuracy: number } | null {
  const n = y.length;
  const p = X[0]?.length ?? 0;
  if (n < 6 || p < 1) return null;
  let beta = Array(p).fill(0);
  for (let iter = 0; iter < 25; iter++) {
    const W: number[] = [];
    const z: number[] = [];
    for (let i = 0; i < n; i++) {
      let eta = 0;
      for (let j = 0; j < p; j++) eta += beta[j] * X[i][j];
      eta = Math.max(-20, Math.min(20, eta));
      const mu = 1 / (1 + Math.exp(-eta));
      const w = Math.max(mu * (1 - mu), 1e-6);
      W.push(w);
      z.push(eta + (y[i] - mu) / w);
    }
    const XtWX: number[][] = Array.from({ length: p }, () => Array(p).fill(0));
    const XtWz: number[] = Array(p).fill(0);
    for (let i = 0; i < n; i++) {
      for (let a = 0; a < p; a++) {
        XtWz[a] += X[i][a] * W[i] * z[i];
        for (let b = 0; b < p; b++) XtWX[a][b] += X[i][a] * W[i] * X[i][b];
      }
    }
    const next = solve(XtWX, XtWz);
    if (!next) return null;
    let maxD = 0;
    for (let j = 0; j < p; j++) {
      maxD = Math.max(maxD, Math.abs(next[j] - beta[j]));
      beta[j] = next[j];
    }
    if (maxD < 1e-6) break;
  }
  let correct = 0;
  for (let i = 0; i < n; i++) {
    let eta = 0;
    for (let j = 0; j < p; j++) eta += beta[j] * X[i][j];
    const pred = 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, eta)))) >= 0.5 ? 1 : 0;
    if (pred === y[i]) correct++;
  }
  return { beta, accuracy: correct / n };
}

function has(v: number | null | undefined): v is number {
  return v != null && Number.isFinite(v);
}

function collectRows(store: WhoopStore): Row[] {
  const days = Object.values(store.days).sort((a, b) => a.day.localeCompare(b.day));
  const rows: Row[] = [];
  let t = 0;
  for (const d of days) {
    const deep = d.sleep?.deepMin;
    if (deep == null || !Number.isFinite(deep)) continue;
    rows.push({
      day: d.day,
      t: t++,
      deep,
      sleepH:
        d.sleepHours ??
        (d.sleep?.asleepMin != null ? d.sleep.asleepMin / 60 : null),
      rem: d.sleep?.remMin ?? null,
      recovery: d.recoveryPct ?? d.cycle?.recoveryPct ?? null,
      hrv: d.hrvMs ?? d.cycle?.hrvMs ?? null,
      rhr: d.rhrBpm ?? d.cycle?.rhrBpm ?? null,
      strain: d.strain ?? d.cycle?.dayStrain ?? null,
    });
  }
  return rows;
}

export function buildDeepSleepForecast(store?: WhoopStore): DeepSleepForecast | null {
  const s = store || loadWhoopStore();
  const rows = collectRows(s);
  if (rows.length < 5) return null;

  const y = rows.map((r) => r.deep);
  const n = rows.length;
  const last = rows[n - 1];

  // ── Time linear: this is what draws on the graph ─────────────────
  const Xtime = rows.map((r) => [1, r.t]);
  const timeFit = ols(Xtime, y);
  if (!timeFit) return null;
  const [a, b] = timeFit.beta;

  const points: ForecastPoint[] = [];
  for (const r of rows) {
    points.push({
      day: r.day,
      value: clampDeep(a + b * r.t),
      kind: "fit",
    });
  }
  // 7-day forward along the same slope (not frozen multi-factor)
  for (let k = 1; k <= 7; k++) {
    const t = last.t + k;
    points.push({
      day: addDays(last.day, k),
      value: clampDeep(Math.round((a + b * t) * 10) / 10),
      kind: "forecast",
    });
  }

  const sign = b >= 0 ? "+" : "−";
  const formula = `deep_min ≈ ${a.toFixed(1)} ${sign} ${Math.abs(b).toFixed(2)}·day`;
  let summary =
    Math.abs(b) < 0.15
      ? `Time trend is almost flat (~${Math.abs(b).toFixed(2)} min/day). R² ${(timeFit.r2 * 100).toFixed(0)}% — deep is noisy; dashed line is weak trend only.`
      : b >= 0
        ? `Time trend: deep rising ~${Math.abs(b).toFixed(1)} min per day (R² ${(timeFit.r2 * 100).toFixed(0)}%). Dashed = next 7 nights if that pace holds.`
        : `Time trend: deep falling ~${Math.abs(b).toFixed(1)} min per day (R² ${(timeFit.r2 * 100).toFixed(0)}%). Dashed = next 7 nights if that pace holds.`;

  // ── Multi-factor: drivers only (not the 7-day line) ─────────────
  const factorKeys = ["sleepH", "rem", "recovery", "hrv", "rhr", "strain"] as const;
  type FK = (typeof factorKeys)[number];
  const usable: FK[] = factorKeys.filter(
    (k) => rows.filter((r) => has(r[k])).length >= Math.max(5, Math.floor(n * 0.6))
  );

  let drivers: DeepSleepForecast["drivers"] = null;
  let Xmulti: number[][] | null = null;

  if (usable.length >= 2) {
    const means: Partial<Record<FK, number>> = {};
    for (const k of usable) {
      means[k] = mean(rows.map((r) => r[k]).filter(has) as number[]);
    }
    Xmulti = rows.map((r) => {
      const row = [1];
      for (const k of usable) {
        row.push(has(r[k]) ? (r[k] as number) : (means[k] as number));
      }
      return row;
    });
    const multiFit = ols(Xmulti, y);
    if (multiFit && multiFit.r2 >= 0.08) {
      const lastX = Xmulti[Xmulti.length - 1];
      const nextIfSame = clampDeep(Math.round(predict(multiFit.beta, lastX)));
      const parts = multiFit.beta.map((coef, i) => {
        if (i === 0) return coef.toFixed(1);
        const name = usable[i - 1];
        return `${coef >= 0 ? "+" : "−"}${Math.abs(coef).toFixed(2)}·${name}`;
      });
      drivers = {
        r2: multiFit.r2,
        formula: `deep_min ≈ ${parts.join(" ")}`,
        nextIfSameConditions: nextIfSame,
        factors: [...usable],
      };
      summary += ` Drivers (R² ${(multiFit.r2 * 100).toFixed(0)}%): if last night’s sleep/HRV/strain repeated → ~${nextIfSame} min deep (not plotted as 7 flat days).`;
    }
  }

  // ── Logistic: one-night adequacy ────────────────────────────────
  const sorted = [...y].sort((a, b) => a - b);
  const p40 = sorted[Math.floor(sorted.length * 0.4)] ?? 70;
  const thresholdMin = Math.max(55, Math.min(110, Math.round(p40)));
  const yBin = y.map((v) => (v >= thresholdMin ? 1 : 0));
  const pos = yBin.filter((v) => v === 1).length;
  const neg = yBin.length - pos;
  let logistic: DeepSleepForecast["logistic"] = null;

  if (pos >= 3 && neg >= 3 && Xmulti) {
    const logFit = logisticIRLS(Xmulti, yBin);
    if (logFit) {
      const lastX = Xmulti[Xmulti.length - 1];
      let eta = 0;
      for (let j = 0; j < logFit.beta.length; j++) eta += logFit.beta[j] * lastX[j];
      const nextProb = 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, eta))));
      logistic = {
        accuracy: logFit.accuracy,
        thresholdMin,
        nextProb,
        formula: `P(deep≥${thresholdMin} | last night’s factors)`,
        n,
      };
      summary += ` Logistic: ~${Math.round(nextProb * 100)}% chance next deep ≥ ${thresholdMin} min (train acc ${(logFit.accuracy * 100).toFixed(0)}%).`;
    }
  }

  return {
    model: "linear-time",
    summary,
    formula,
    r2: timeFit.r2,
    n,
    points,
    drivers,
    logistic,
  };
}

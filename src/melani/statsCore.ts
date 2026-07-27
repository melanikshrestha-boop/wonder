/**
 * Stats core — pure classical statistical models (no network, no deps).
 *
 * Mel uses this for real analysis on your local series: describe → correlate →
 * regress → forecast → classify. Same math textbooks use (OLS, logistic IRLS,
 * exponential smoothing, Pearson, bootstrap CIs).
 *
 * Not medical or financial advice — arithmetic on numbers you already own.
 */

// ── Descriptive ──────────────────────────────────────────────────

export function mean(xs: number[]): number {
  if (!xs.length) return NaN;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function variance(xs: number[], sample = true): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const ss = xs.reduce((a, x) => a + (x - m) ** 2, 0);
  return ss / (sample ? xs.length - 1 : xs.length);
}

export function std(xs: number[], sample = true): number {
  return Math.sqrt(variance(xs, sample));
}

export function quantile(xs: number[], q: number): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * Math.max(0, Math.min(1, q));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return s[lo]!;
  return s[lo]! * (hi - pos) + s[hi]! * (pos - lo);
}

export function describe(xs: number[]): {
  n: number;
  mean: number;
  median: number;
  std: number;
  min: number;
  max: number;
  q25: number;
  q75: number;
  iqr: number;
  cv: number;
} {
  const clean = xs.filter((x) => Number.isFinite(x));
  const n = clean.length;
  if (!n) {
    return {
      n: 0,
      mean: NaN,
      median: NaN,
      std: NaN,
      min: NaN,
      max: NaN,
      q25: NaN,
      q75: NaN,
      iqr: NaN,
      cv: NaN,
    };
  }
  const m = mean(clean);
  const s = std(clean);
  const q25 = quantile(clean, 0.25);
  const q75 = quantile(clean, 0.75);
  return {
    n,
    mean: m,
    median: median(clean),
    std: s,
    min: Math.min(...clean),
    max: Math.max(...clean),
    q25,
    q75,
    iqr: q75 - q25,
    cv: Math.abs(m) > 1e-12 ? s / Math.abs(m) : NaN,
  };
}

export function zScores(xs: number[]): number[] {
  const m = mean(xs);
  const s = std(xs);
  if (s < 1e-12) return xs.map(() => 0);
  return xs.map((x) => (x - m) / s);
}

export function outliersIqr(xs: number[]): { value: number; index: number }[] {
  const q1 = quantile(xs, 0.25);
  const q3 = quantile(xs, 0.75);
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  const out: { value: number; index: number }[] = [];
  xs.forEach((v, i) => {
    if (v < lo || v > hi) out.push({ value: v, index: i });
  });
  return out;
}

// ── Correlation ──────────────────────────────────────────────────

export function pearson(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return NaN;
  const mx = mean(x.slice(0, n));
  const my = mean(y.slice(0, n));
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = x[i]! - mx;
    const b = y[i]! - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den < 1e-12 ? 0 : num / den;
}

/** Rank-based Spearman ρ */
export function spearman(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return NaN;
  const rx = ranks(x.slice(0, n));
  const ry = ranks(y.slice(0, n));
  return pearson(rx, ry);
}

function ranks(xs: number[]): number[] {
  const idx = xs.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const r = Array(xs.length).fill(0);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1]!.v === idx[i]!.v) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k]!.i] = avg;
    i = j + 1;
  }
  return r;
}

export function autocorrelation(xs: number[], lag = 1): number {
  if (xs.length <= lag + 2) return NaN;
  const a = xs.slice(0, xs.length - lag);
  const b = xs.slice(lag);
  return pearson(a, b);
}

// ── Linear algebra helpers ───────────────────────────────────────

export function solveLinear(A0: number[][], b0: number[]): number[] | null {
  const n = b0.length;
  const A = A0.map((row, i) => [...row, b0[i]!]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(A[r]![col]!) > Math.abs(A[piv]![col]!)) piv = r;
    }
    if (Math.abs(A[piv]![col]!) < 1e-12) return null;
    if (piv !== col) [A[col], A[piv]] = [A[piv]!, A[col]!];
    const div = A[col]![col]!;
    for (let c = col; c <= n; c++) A[col]![c]! /= div;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = A[r]![col]!;
      for (let c = col; c <= n; c++) A[r]![c]! -= f * A[col]![c]!;
    }
  }
  return A.map((row) => row[n]!);
}

// ── OLS regression ───────────────────────────────────────────────

export type LinearModel = {
  /** Coefficients: beta[0] intercept if withIntercept */
  beta: number[];
  r2: number;
  adjR2: number;
  n: number;
  p: number;
  rmse: number;
  /** residual standard error */
  sigma: number;
  withIntercept: boolean;
  /** names parallel to beta */
  names: string[];
};

/**
 * OLS: y ≈ X β. Pass columns of X *without* intercept column if withIntercept=true
 * (we prepend a 1s column).
 */
export function ols(
  Xcols: number[][],
  y: number[],
  opts?: { withIntercept?: boolean; names?: string[] }
): LinearModel | null {
  const withIntercept = opts?.withIntercept !== false;
  const n = y.length;
  if (n < 3) return null;
  const k = Xcols.length;
  if (k < 1) return null;
  for (const col of Xcols) if (col.length !== n) return null;

  const p = withIntercept ? k + 1 : k;
  if (p >= n) return null;

  const X: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = withIntercept ? [1] : [];
    for (let j = 0; j < k; j++) row.push(Xcols[j]![i]!);
    X.push(row);
  }

  const XtX: number[][] = Array.from({ length: p }, () => Array(p).fill(0));
  const Xty: number[] = Array(p).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < p; a++) {
      Xty[a]! += X[i]![a]! * y[i]!;
      for (let b = 0; b < p; b++) XtX[a]![b]! += X[i]![a]! * X[i]![b]!;
    }
  }
  const beta = solveLinear(XtX, Xty);
  if (!beta) return null;

  const yBar = mean(y);
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    let yHat = 0;
    for (let a = 0; a < p; a++) yHat += beta[a]! * X[i]![a]!;
    ssTot += (y[i]! - yBar) ** 2;
    ssRes += (y[i]! - yHat) ** 2;
  }
  const r2 = ssTot > 1e-9 ? Math.max(0, Math.min(1, 1 - ssRes / ssTot)) : 0;
  const adjR2 =
    n > p + 1 ? 1 - ((1 - r2) * (n - 1)) / (n - p - 1) : r2;
  const sigma = Math.sqrt(ssRes / Math.max(1, n - p));
  const rmse = Math.sqrt(ssRes / n);

  const names = opts?.names
    ? withIntercept
      ? ["intercept", ...opts.names]
      : opts.names
    : withIntercept
      ? ["intercept", ...Array.from({ length: k }, (_, i) => `x${i + 1}`)]
      : Array.from({ length: k }, (_, i) => `x${i + 1}`);

  return {
    beta,
    r2,
    adjR2: Math.max(-1, Math.min(1, adjR2)),
    n,
    p,
    rmse,
    sigma,
    withIntercept,
    names: names.slice(0, p),
  };
}

export function predictLinear(model: LinearModel, x: number[]): number {
  // x is features without intercept
  let s = 0;
  let j = 0;
  if (model.withIntercept) {
    s += model.beta[0] ?? 0;
    j = 1;
  }
  for (let i = 0; i < x.length; i++) {
    s += (model.beta[j + i] ?? 0) * x[i]!;
  }
  return s;
}

/** Simple y ~ a + b·t  for t = 0..n-1 */
export function linearTrend(y: number[]): LinearModel | null {
  const n = y.length;
  const t = Array.from({ length: n }, (_, i) => i);
  return ols([t], y, { names: ["t"] });
}

// ── Logistic regression (IRLS) ───────────────────────────────────

export type LogisticModel = {
  beta: number[];
  accuracy: number;
  n: number;
  names: string[];
  withIntercept: boolean;
};

export function logisticIRLS(
  Xcols: number[][],
  y01: number[],
  opts?: { withIntercept?: boolean; names?: string[]; maxIter?: number }
): LogisticModel | null {
  const withIntercept = opts?.withIntercept !== false;
  const n = y01.length;
  const k = Xcols.length;
  if (n < 6 || k < 1) return null;
  for (const col of Xcols) if (col.length !== n) return null;

  const p = withIntercept ? k + 1 : k;
  const X: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = withIntercept ? [1] : [];
    for (let j = 0; j < k; j++) row.push(Xcols[j]![i]!);
    X.push(row);
  }

  let beta = Array(p).fill(0) as number[];
  const maxIter = opts?.maxIter ?? 30;
  for (let iter = 0; iter < maxIter; iter++) {
    const W: number[] = [];
    const z: number[] = [];
    for (let i = 0; i < n; i++) {
      let eta = 0;
      for (let j = 0; j < p; j++) eta += beta[j]! * X[i]![j]!;
      eta = Math.max(-20, Math.min(20, eta));
      const mu = 1 / (1 + Math.exp(-eta));
      const w = Math.max(mu * (1 - mu), 1e-6);
      W.push(w);
      z.push(eta + (y01[i]! - mu) / w);
    }
    const XtWX: number[][] = Array.from({ length: p }, () => Array(p).fill(0));
    const XtWz: number[] = Array(p).fill(0);
    for (let i = 0; i < n; i++) {
      for (let a = 0; a < p; a++) {
        XtWz[a]! += X[i]![a]! * W[i]! * z[i]!;
        for (let b = 0; b < p; b++) XtWX[a]![b]! += X[i]![a]! * W[i]! * X[i]![b]!;
      }
    }
    const next = solveLinear(XtWX, XtWz);
    if (!next) return null;
    let maxD = 0;
    for (let j = 0; j < p; j++) {
      maxD = Math.max(maxD, Math.abs(next[j]! - beta[j]!));
      beta[j] = next[j]!;
    }
    if (maxD < 1e-6) break;
  }

  let correct = 0;
  for (let i = 0; i < n; i++) {
    let eta = 0;
    for (let j = 0; j < p; j++) eta += beta[j]! * X[i]![j]!;
    const pred =
      1 / (1 + Math.exp(-Math.max(-20, Math.min(20, eta)))) >= 0.5 ? 1 : 0;
    if (pred === y01[i]) correct++;
  }

  const names = opts?.names
    ? withIntercept
      ? ["intercept", ...opts.names]
      : opts.names
    : withIntercept
      ? ["intercept", ...Array.from({ length: k }, (_, i) => `x${i + 1}`)]
      : Array.from({ length: k }, (_, i) => `x${i + 1}`);

  return {
    beta,
    accuracy: correct / n,
    n,
    names: names.slice(0, p),
    withIntercept,
  };
}

export function predictLogisticProb(model: LogisticModel, x: number[]): number {
  let eta = 0;
  let j = 0;
  if (model.withIntercept) {
    eta += model.beta[0] ?? 0;
    j = 1;
  }
  for (let i = 0; i < x.length; i++) eta += (model.beta[j + i] ?? 0) * x[i]!;
  eta = Math.max(-20, Math.min(20, eta));
  return 1 / (1 + Math.exp(-eta));
}

// ── Time-series forecasting ──────────────────────────────────────

export type ForecastResult = {
  model: string;
  historyFit: number[];
  future: number[];
  /** one-step RMSE on last 20% holdout when possible */
  holdoutRmse: number | null;
  formula: string;
  r2: number | null;
};

/** Linear time trend extrapolated horizon steps */
export function forecastLinearTime(
  y: number[],
  horizon = 7
): ForecastResult | null {
  const model = linearTrend(y);
  if (!model) return null;
  const historyFit = y.map((_, i) => predictLinear(model, [i]));
  const future: number[] = [];
  for (let h = 0; h < horizon; h++) {
    future.push(predictLinear(model, [y.length + h]));
  }
  const hold = holdoutLinear(y);
  return {
    model: "linear-time",
    historyFit,
    future,
    holdoutRmse: hold,
    formula: formatLinearFormula(model),
    r2: model.r2,
  };
}

/** Simple exponential smoothing: ŝ_t = α y_t + (1-α) ŝ_{t-1} */
export function forecastSES(
  y: number[],
  horizon = 7,
  alpha = 0.3
): ForecastResult | null {
  if (y.length < 3) return null;
  const a = Math.max(0.01, Math.min(0.99, alpha));
  const fit: number[] = [];
  let s = y[0]!;
  fit.push(s);
  for (let i = 1; i < y.length; i++) {
    s = a * y[i]! + (1 - a) * s;
    fit.push(s);
  }
  const future = Array.from({ length: horizon }, () => s);
  let sse = 0;
  let m = 0;
  for (let i = 1; i < y.length; i++) {
    sse += (y[i]! - fit[i - 1]!) ** 2;
    m++;
  }
  return {
    model: "ses",
    historyFit: fit,
    future,
    holdoutRmse: m ? Math.sqrt(sse / m) : null,
    formula: `ŝ_t = ${a.toFixed(2)} y_t + ${(1 - a).toFixed(2)} ŝ_{t-1}`,
    r2: null,
  };
}

/**
 * Holt linear exponential smoothing (level + trend).
 * Good when series has slope (sleep hours, spend, recovery).
 */
export function forecastHolt(
  y: number[],
  horizon = 7,
  alpha = 0.35,
  beta = 0.15
): ForecastResult | null {
  if (y.length < 4) return null;
  const a = Math.max(0.01, Math.min(0.99, alpha));
  const b = Math.max(0.01, Math.min(0.99, beta));
  let level = y[0]!;
  let trend = y[1]! - y[0]!;
  const fit: number[] = [level];
  for (let i = 1; i < y.length; i++) {
    const prevL = level;
    level = a * y[i]! + (1 - a) * (level + trend);
    trend = b * (level - prevL) + (1 - b) * trend;
    fit.push(level);
  }
  const future: number[] = [];
  for (let h = 1; h <= horizon; h++) {
    future.push(level + h * trend);
  }
  return {
    model: "holt",
    historyFit: fit,
    future,
    holdoutRmse: null,
    formula: `Holt α=${a.toFixed(2)} β=${b.toFixed(2)} · level+trend`,
    r2: null,
  };
}

/**
 * Pick best among linear-time / SES / Holt by one-step in-sample RMSE.
 */
export function forecastAuto(y: number[], horizon = 7): ForecastResult | null {
  if (y.length < 5) return forecastLinearTime(y, horizon);
  const candidates = [
    forecastLinearTime(y, horizon),
    forecastSES(y, horizon, 0.25),
    forecastSES(y, horizon, 0.45),
    forecastHolt(y, horizon),
  ].filter((c): c is ForecastResult => c != null);

  if (!candidates.length) return null;

  // Score: lower last-quarter one-step error
  let best = candidates[0]!;
  let bestScore = Infinity;
  for (const c of candidates) {
    const score = oneStepRmse(y, c.historyFit);
    if (score < bestScore) {
      bestScore = score;
      best = { ...c, holdoutRmse: score };
    }
  }
  return best;
}

function oneStepRmse(y: number[], fit: number[]): number {
  const n = Math.min(y.length, fit.length);
  if (n < 3) return Infinity;
  let sse = 0;
  let m = 0;
  const start = Math.floor(n * 0.5);
  for (let i = start; i < n; i++) {
    sse += (y[i]! - fit[i]!) ** 2;
    m++;
  }
  return m ? Math.sqrt(sse / m) : Infinity;
}

function holdoutLinear(y: number[]): number | null {
  if (y.length < 10) return null;
  const cut = Math.floor(y.length * 0.8);
  const train = y.slice(0, cut);
  const model = linearTrend(train);
  if (!model) return null;
  let sse = 0;
  for (let i = cut; i < y.length; i++) {
    const pred = predictLinear(model, [i]);
    sse += (y[i]! - pred) ** 2;
  }
  return Math.sqrt(sse / (y.length - cut));
}

export function formatLinearFormula(model: LinearModel): string {
  const parts: string[] = [];
  for (let i = 0; i < model.beta.length; i++) {
    const c = model.beta[i]!;
    const name = model.names[i] ?? `b${i}`;
    if (i === 0 && model.withIntercept) {
      parts.push(c.toFixed(3));
    } else {
      const sign = c >= 0 ? "+" : "−";
      parts.push(`${sign} ${Math.abs(c).toFixed(3)}·${name}`);
    }
  }
  return `y ≈ ${parts.join(" ")}  (R²=${model.r2.toFixed(3)}, n=${model.n})`;
}

// ── Two-sample comparison ────────────────────────────────────────

export function welchT(
  a: number[],
  b: number[]
): { t: number; df: number; meanA: number; meanB: number; diff: number } | null {
  if (a.length < 2 || b.length < 2) return null;
  const ma = mean(a);
  const mb = mean(b);
  const va = variance(a);
  const vb = variance(b);
  const na = a.length;
  const nb = b.length;
  const se = Math.sqrt(va / na + vb / nb);
  if (se < 1e-12) return { t: 0, df: na + nb - 2, meanA: ma, meanB: mb, diff: ma - mb };
  const t = (ma - mb) / se;
  const num = (va / na + vb / nb) ** 2;
  const den =
    (va / na) ** 2 / (na - 1) + (vb / nb) ** 2 / (nb - 1);
  const df = den > 0 ? num / den : na + nb - 2;
  return { t, df, meanA: ma, meanB: mb, diff: ma - mb };
}

// ── Bootstrap mean CI ────────────────────────────────────────────

export function bootstrapMeanCI(
  xs: number[],
  level = 0.95,
  B = 400
): { lo: number; hi: number; mean: number } | null {
  if (xs.length < 3) return null;
  const means: number[] = [];
  for (let b = 0; b < B; b++) {
    let s = 0;
    for (let i = 0; i < xs.length; i++) {
      s += xs[Math.floor(Math.random() * xs.length)]!;
    }
    means.push(s / xs.length);
  }
  means.sort((a, b) => a - b);
  const alpha = (1 - level) / 2;
  const lo = means[Math.floor(alpha * B)]!;
  const hi = means[Math.min(B - 1, Math.floor((1 - alpha) * B))]!;
  return { lo, hi, mean: mean(xs) };
}

// ── Moving average ───────────────────────────────────────────────

export function movingAverage(xs: number[], window: number): number[] {
  const w = Math.max(1, Math.floor(window));
  const out: number[] = [];
  for (let i = 0; i < xs.length; i++) {
    const a = Math.max(0, i - w + 1);
    const slice = xs.slice(a, i + 1);
    out.push(mean(slice));
  }
  return out;
}

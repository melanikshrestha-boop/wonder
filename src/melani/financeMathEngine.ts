/**
 * Finance Math Engine — high-rigor quantitative path for the Finance Copilot.
 *
 * Design bar:
 *   - Every number is computed by a named formula (reproducible by hand).
 *   - Intermediate steps are shown, not hidden.
 *   - Ledger numbers are preferred as defaults when the user omits inputs.
 *   - Never invents rates/balances that are not in the question or context.
 *   - Not personalized financial advice: models and scenarios only.
 *
 * This is the "desk calculator that can also teach" — not a vibe chatbot.
 */
import { money } from "./financeStore";
import { renderFormula } from "./mathml";
import type { CopilotAnswer, CopilotContext } from "./financeCopilotEngine";
import {
  amortize,
  aprToApy,
  debtStrategy,
  futureValue,
  futureValueSeries,
  growthSchedule,
  irr,
  loanPayment,
  npv,
  opportunityCost,
  payoffWithPayment,
  presentValue,
  realReturn,
  rule72,
  yearsToIndependence,
  type Debt,
} from "./financeModels";
import { isTransferLike } from "./financeTransfers";

// ─── Parsing helpers ─────────────────────────────────────────────────────────

function parseAmounts(q: string): number[] {
  const out: number[] = [];
  const re =
    /\$\s*(\d[\d,]*(?:\.\d+)?)|\b(\d+(?:\.\d+)?)\s*k\b|\b(\d[\d,]{2,}(?:\.\d+)?)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(q)) !== null) {
    if (m[1]) out.push(Number(m[1].replace(/,/g, "")));
    else if (m[2]) out.push(Number(m[2]) * 1000);
    else if (m[3]) out.push(Number(m[3].replace(/,/g, "")));
  }
  return out;
}

function parseRate(q: string): number | null {
  const r = q.match(/(\d+(?:\.\d+)?)\s*%/);
  return r ? Number(r[1]) : null;
}

function parseYears(q: string): number | null {
  const y = q.match(/(\d+(?:\.\d+)?)\s*(?:years?|yrs?)\b/i);
  if (y) return Number(y[1]);
  const m = q.match(/(\d+(?:\.\d+)?)\s*(?:months?|mos?)\b/i);
  if (m) return Number(m[1]) / 12;
  return null;
}

function parseMonths(q: string): number | null {
  const m = q.match(/(\d+(?:\.\d+)?)\s*(?:months?|mos?)\b/i);
  if (m) return Math.round(Number(m[1]));
  const y = parseYears(q);
  return y != null ? Math.round(y * 12) : null;
}

function isMonthly(q: string): boolean {
  return /\b(a|per|each|every)\s*(month|mo)\b|\bmonthly\b|\/\s*mo\b/i.test(q);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Ledger-derived stats (real data, not vibes) ─────────────────────────────

function monthlySeries(
  ctx: CopilotContext,
  kind: "expense" | "income" | "net"
): { ym: string; value: number }[] {
  const map = new Map<string, number>();
  for (const t of ctx.state.txs) {
    if (isTransferLike(t)) continue;
    const ym = t.date.slice(0, 7);
    let v = map.get(ym) || 0;
    if (kind === "expense" && t.kind === "expense") v += t.amount;
    else if (kind === "income" && t.kind === "income") v += t.amount;
    else if (kind === "net") {
      if (t.kind === "income") v += t.amount;
      else if (t.kind === "expense") v -= t.amount;
    }
    map.set(ym, v);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([ym, value]) => ({ ym, value: round2(value) }));
}

function mean(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function sampleStd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const a = xs.slice(0, n);
  const b = ys.slice(0, n);
  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma;
    const yb = b[i] - mb;
    num += xa * yb;
    da += xa * xa;
    db += yb * yb;
  }
  if (da === 0 || db === 0) return null;
  return num / Math.sqrt(da * db);
}

// ─── Advanced pure math ──────────────────────────────────────────────────────

/** CAGR: (end/start)^(1/years) − 1 */
export function cagr(start: number, end: number, years: number): number | null {
  if (start <= 0 || end <= 0 || years <= 0) return null;
  return (Math.pow(end / start, 1 / years) - 1) * 100;
}

/** Continuous compounding: FV = PV · e^(rt) */
export function futureValueContinuous(pv: number, rate: number, years: number): number {
  return pv * Math.exp(rate * years);
}

/** Payment required to hit a target future value (annuity solve for PMT). */
export function paymentForTarget(
  target: number,
  ratePerPeriod: number,
  periods: number,
  initial = 0
): number {
  if (periods <= 0) return 0;
  const fvInitial = initial * Math.pow(1 + ratePerPeriod, periods);
  const need = target - fvInitial;
  if (need <= 0) return 0;
  if (ratePerPeriod === 0) return need / periods;
  return (need * ratePerPeriod) / (Math.pow(1 + ratePerPeriod, periods) - 1);
}

/** Growing annuity FV: PMT first period, grows at g each period. */
export function futureValueGrowingAnnuity(
  pmt: number,
  r: number,
  g: number,
  n: number
): number {
  if (n <= 0) return 0;
  if (Math.abs(r - g) < 1e-12) return pmt * n * Math.pow(1 + r, n - 1);
  return pmt * ((Math.pow(1 + r, n) - Math.pow(1 + g, n)) / (r - g));
}

/** Perpetuity PV = C / r */
export function perpetuityPV(cashPerPeriod: number, rate: number): number | null {
  if (rate <= 0) return null;
  return cashPerPeriod / rate;
}

/** Gordon growth: PV = C1 / (r − g) */
export function gordonGrowth(nextCash: number, r: number, g: number): number | null {
  if (r <= g) return null;
  return nextCash / (r - g);
}

/**
 * Black–Scholes call (European) — for educational options desk, not advice.
 * d1 = [ln(S/K) + (r + σ²/2)T] / (σ√T)
 * d2 = d1 − σ√T
 */
function normCdf(x: number): number {
  // Abramowitz & Stegun approximation
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p =
    d *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

export function blackScholesCall(params: {
  S: number;
  K: number;
  T: number;
  r: number;
  sigma: number;
}): { call: number; d1: number; d2: number; delta: number } | null {
  const { S, K, T, r, sigma } = params;
  if (S <= 0 || K <= 0 || T <= 0 || sigma <= 0) return null;
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const call = S * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2);
  return { call, d1, d2, delta: normCdf(d1) };
}

/** Monte Carlo geometric Brownian paths — mean terminal value (educational). */
export function monteCarloGBM(params: {
  start: number;
  mu: number;
  sigma: number;
  years: number;
  paths?: number;
  stepsPerYear?: number;
}): { mean: number; p10: number; p50: number; p90: number; paths: number } {
  const {
    start,
    mu,
    sigma,
    years,
    paths = 2000,
    stepsPerYear = 12,
  } = params;
  const steps = Math.max(1, Math.round(years * stepsPerYear));
  const dt = years / steps;
  const terminals: number[] = [];
  // Deterministic LCG so results are reproducible in-session
  let seed = 42;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const randn = () => {
    // Box-Muller
    const u1 = Math.max(1e-12, rand());
    const u2 = rand();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };

  for (let p = 0; p < paths; p++) {
    let s = start;
    for (let i = 0; i < steps; i++) {
      s =
        s *
        Math.exp((mu - 0.5 * sigma * sigma) * dt + sigma * Math.sqrt(dt) * randn());
    }
    terminals.push(s);
  }
  terminals.sort((a, b) => a - b);
  const idx = (q: number) =>
    terminals[Math.min(terminals.length - 1, Math.floor(q * terminals.length))];
  return {
    mean: mean(terminals),
    p10: idx(0.1),
    p50: idx(0.5),
    p90: idx(0.9),
    paths,
  };
}

// ─── Intent router ───────────────────────────────────────────────────────────

/**
 * High-IQ math path. Returns null only when the question is clearly not math.
 * Prefer this before soft advisory prose.
 */
export function answerMathEngine(
  question: string,
  ctx: CopilotContext
): CopilotAnswer | null {
  const q = question.toLowerCase().trim();
  if (!q) return null;

  // Explicit "math mode" or quantitative language
  const wantsMath =
    /\b(math|calculate|compute|formula|model|npv|irr|cagr|amorti[sz]|black.?scholes|monte carlo|perpetuity|gordon|duration|std(dev)?|standard deviation|correlation|regression|sensitivity|solve for|what payment|how much (do i|to) (need|save|pay)|break.?even|wacc|discount rate|present value|future value|annuity|compound)\b/i.test(
      q
    ) ||
    /\b(fv|pv|pmt|nper)\b/i.test(q) ||
    (/\b(at|@)\s*\d+(\.\d+)?\s*%/.test(q) &&
      /\b(save|invest|debt|loan|pay|grow|worth|double)\b/.test(q));

  return (
    mathBs(q) ??
    mathMonteCarlo(q, ctx) ??
    mathNpvIrr(q) ??
    mathCagr(q, ctx) ??
    mathTargetPayment(q, ctx) ??
    mathGrowingAnnuity(q, ctx) ??
    mathPerpetuity(q) ??
    mathAmortTable(q, ctx) ??
    mathDebtCompare(q, ctx) ??
    mathFI(q, ctx) ??
    mathLedgerStats(q, ctx) ??
    mathSensitivity(q, ctx) ??
    mathTvmExplicit(q, ctx) ??
    (wantsMath ? mathCatchAll(q, ctx) : null)
  );
}

// ─── Scenario implementations ────────────────────────────────────────────────

function mathBs(q: string): CopilotAnswer | null {
  if (!/\b(black.?scholes|option price|call price|bs call)\b/i.test(q)) return null;
  const amounts = parseAmounts(q);
  // S K often both prices; rates and vol as %
  const rates = [...q.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((m) => Number(m[1]));
  const S = amounts[0] ?? 100;
  const K = amounts[1] ?? S;
  const T = parseYears(q) ?? 1;
  // Parse r and σ as percent numbers; defaults r=5, σ=20
  let rfPct = 5;
  let volPct = 20;
  if (rates.length >= 2) {
    rfPct = rates[0];
    volPct = rates[1];
  } else if (rates.length === 1) {
    if (/\bvol|sigma|σ\b/i.test(q)) volPct = rates[0];
    else if (/\brate|risk.?free\b/i.test(q)) rfPct = rates[0];
    else volPct = rates[0];
  }
  const res = blackScholesCall({
    S,
    K,
    T,
    r: rfPct / 100,
    sigma: volPct / 100,
  });
  if (!res) {
    return {
      text: "Black-Scholes needs S>0, K>0, T>0, σ>0. Example: call S=100 K=100 T=1y r=5% vol=20%.",
      sources: ["Black-Scholes"],
    };
  }
  const sigShow = volPct;
  const rf = rfPct / 100;
  return {
    text: [
      `European call (Black-Scholes).`,
      `S=${money(S)}, K=${money(K)}, T=${T}y, r=${(rf * 100).toFixed(2)}%, σ=${sigShow.toFixed(2)}%.`,
      `d₁=${res.d1.toFixed(4)}, d₂=${res.d2.toFixed(4)}.`,
      `Call price ≈ ${money(res.call)}. Delta (N(d₁)) ≈ ${res.delta.toFixed(4)}.`,
      `Assumptions: no dividends, constant r and σ, lognormal S, European exercise. Model price ≠ market quote.`,
    ].join("\n"),
    sources: ["Black-Scholes European call", "Abramowitz-Stegun N(·)"],
    formula: renderFormula("C = S N(d_1) − K e^(−rT) N(d_2)"),
    formulaNote: `d₁=[ln(S/K)+(r+σ²/2)T]/(σ√T), d₂=d₁−σ√T · S=${S} K=${K} T=${T}`,
    data: [
      { label: "Call", value: money(res.call) },
      { label: "d1", value: res.d1.toFixed(4) },
      { label: "d2", value: res.d2.toFixed(4) },
      { label: "Delta", value: res.delta.toFixed(4) },
    ],
  };
}

function mathMonteCarlo(q: string, ctx: CopilotContext): CopilotAnswer | null {
  if (!/\bmonte carlo|simulate|gbm|geometric brownian\b/i.test(q)) return null;
  const amounts = parseAmounts(q);
  const rates = [...q.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((m) => Number(m[1]));
  const start = amounts[0] ?? Math.max(1000, ctx.cash || ctx.worth || 10000);
  const years = parseYears(q) ?? 10;
  const mu = (rates[0] ?? 7) / 100;
  const sigma = (rates[1] ?? 15) / 100;
  const mc = monteCarloGBM({ start, mu, sigma, years, paths: 3000 });
  return {
    text: [
      `Monte Carlo GBM on ${money(start)} for ${years}y.`,
      `μ=${(mu * 100).toFixed(1)}% drift, σ=${(sigma * 100).toFixed(1)}% vol, ${mc.paths} paths, monthly steps.`,
      `Terminal distribution: p10=${money(mc.p10)}, median=${money(mc.p50)}, mean=${money(mc.mean)}, p90=${money(mc.p90)}.`,
      `This is a stochastic model, not a forecast. Fat tails and regime shifts are not in plain GBM.`,
    ].join("\n"),
    sources: ["Geometric Brownian motion MC", `${mc.paths} paths`],
    formula: renderFormula("dS = μ S dt + σ S dW"),
    formulaNote: "Euler discretisation of GBM · educational only",
    data: [
      { label: "Start", value: money(start) },
      { label: "p10", value: money(mc.p10) },
      { label: "Median", value: money(mc.p50) },
      { label: "Mean", value: money(mc.mean) },
      { label: "p90", value: money(mc.p90) },
    ],
    chart: {
      kind: "line",
      title: `GBM quantiles (start ${money(start)})`,
      xLabel: "Percentile",
      yLabel: "Terminal",
      points: [
        { x: "p10", y: round2(mc.p10), label: money(mc.p10) },
        { x: "p50", y: round2(mc.p50), label: money(mc.p50) },
        { x: "mean", y: round2(mc.mean), label: money(mc.mean) },
        { x: "p90", y: round2(mc.p90), label: money(mc.p90) },
      ],
    },
  };
}

function mathNpvIrr(q: string): CopilotAnswer | null {
  if (!/\b(npv|net present value|irr|internal rate)\b/i.test(q)) return null;
  // Cash flows: -1000, 300, 400, 500 or listed amounts (first negative if "invest")
  let flows = parseAmounts(q);
  if (flows.length < 2) {
    return {
      text: "NPV/IRR need a cash-flow list. Example: NPV at 10% of -1000, 400, 400, 400. Or IRR of -5000, 2000, 2000, 2500.",
      sources: ["NPV/IRR"],
      formula: renderFormula("NPV = Σ CF_t / (1+r)^t"),
    };
  }
  // If user said invest/cost and first flow positive, negate first
  if (/\b(invest|cost|outlay|buy)\b/i.test(q) && flows[0] > 0) {
    flows = [-flows[0], ...flows.slice(1)];
  }
  const rate = parseRate(q) ?? 10;
  const value = npv(rate, flows);
  const rateOfReturn = irr(flows);
  return {
    text: [
      `Cash flows: [${flows.map((f) => money(f)).join(", ")}].`,
      `NPV at ${rate}% = ${money(value)}. ${value >= 0 ? "Non-negative NPV at this hurdle." : "Negative NPV at this hurdle."}`,
      rateOfReturn != null
        ? `IRR ≈ ${rateOfReturn.toFixed(2)}% (discount rate where NPV=0).`
        : `IRR: no root in range (cash flows may not change sign properly).`,
      `Decision rule (textbook): accept if NPV>0 at your opportunity cost of capital. IRR can mislead with non-conventional flows.`,
    ].join("\n"),
    sources: [`NPV @ ${rate}%`, rateOfReturn != null ? "IRR bisection" : "IRR undefined"],
    formula: renderFormula("NPV = Σ_t CF_t / (1+r)^t"),
    formulaNote: `r=${rate}% · t starts at 0 · CF₀ often negative`,
    data: [
      { label: "NPV", value: money(value) },
      {
        label: "IRR",
        value: rateOfReturn != null ? `${rateOfReturn.toFixed(2)}%` : "n/a",
      },
      { label: "Hurdle", value: `${rate}%` },
      { label: "Periods", value: String(flows.length) },
    ],
  };
}

function mathCagr(q: string, ctx: CopilotContext): CopilotAnswer | null {
  if (!/\bcagr|compound annual|annuali[sz]ed return\b/i.test(q)) return null;
  const amounts = parseAmounts(q);
  const years = parseYears(q) ?? 5;
  let start = amounts[0];
  let end = amounts[1];
  if (start == null && ctx.worth > 0) start = ctx.worth * 0.5;
  if (end == null && ctx.worth > 0) end = ctx.worth;
  if (start == null || end == null || start <= 0 || end <= 0) {
    return {
      text: "CAGR needs start value, end value, and years. Example: CAGR from 10000 to 18000 in 5 years.",
      sources: ["CAGR"],
    };
  }
  const r = cagr(start, end, years);
  if (r == null) return null;
  return {
    text: [
      `CAGR from ${money(start)} → ${money(end)} over ${years} years = ${r.toFixed(2)}% per year.`,
      `Check: ${money(start)} × (1 + ${r.toFixed(2)}%)^${years} = ${money(futureValue(start, r / 100, years))}.`,
      `CAGR is the constant rate that compounds start to end. It hides path volatility.`,
    ].join("\n"),
    sources: ["CAGR identity"],
    formula: renderFormula("CAGR = (V_end / V_start)^(1/n) − 1"),
    formulaNote: `V_start=${start} · V_end=${end} · n=${years}`,
    data: [
      { label: "Start", value: money(start) },
      { label: "End", value: money(end) },
      { label: "Years", value: String(years) },
      { label: "CAGR", value: `${r.toFixed(2)}%` },
    ],
  };
}

function mathTargetPayment(q: string, ctx: CopilotContext): CopilotAnswer | null {
  if (
    !/\b(how much (do i |to )?(need to )?(save|pay|invest)|payment to reach|pmt for|contribute to hit|what payment)\b/i.test(
      q
    ) &&
    !/\b(target|goal)\b.*\b(save|reach|hit)\b/i.test(q)
  ) {
    return null;
  }
  const amounts = parseAmounts(q);
  const target = amounts.find((a) => a >= 1000) ?? amounts[0] ?? 100000;
  const years = parseYears(q) ?? 10;
  const rate = parseRate(q) ?? 7;
  const initial = amounts.length > 1 ? amounts[1] : Math.max(0, ctx.cash * 0.2);
  // Prefer larger as target
  const tgt = Math.max(target, initial + 1);
  const init = Math.min(initial, tgt * 0.5);
  const months = Math.round(years * 12);
  const r = rate / 100 / 12;
  const pmt = paymentForTarget(tgt, r, months, init);
  const check = growthSchedule({
    initial: init,
    contribution: pmt,
    rate: r,
    periods: months,
  }).slice(-1)[0];
  return {
    text: [
      `To reach ${money(tgt)} in ${years} years at ${rate}% with ${money(init)} already invested:`,
      `Required monthly contribution ≈ ${money(pmt)}.`,
      `Verification: after ${months} months the schedule lands at ${money(check?.balance ?? 0)} (of which growth ${money(check?.growth ?? 0)}).`,
      `Solved from FV of annuity + compounded principal. Missed months or lower returns break the path.`,
    ].join("\n"),
    sources: ["annuity PMT solve", `${rate}% nominal`],
    formula: renderFormula("PMT = (Target − PV(1+r)^n) × r / ((1+r)^n − 1)"),
    formulaNote: `Target=${tgt} · PV₀=${init} · r=${(rate / 12).toFixed(4)}%/mo · n=${months}`,
    data: [
      { label: "Target", value: money(tgt) },
      { label: "Starting", value: money(init) },
      { label: "Monthly PMT", value: money(pmt) },
      { label: "Years", value: String(years) },
      { label: "Rate", value: `${rate}%` },
    ],
    chart: {
      kind: "line",
      title: `Path to ${money(tgt)} @ ${rate}%`,
      xLabel: "Year",
      yLabel: "Balance",
      points: growthSchedule({
        initial: init,
        contribution: pmt,
        rate: r,
        periods: months,
      })
        .filter((p) => p.period % 12 === 0 || p.period === months)
        .map((p) => ({
          x: `Y${Math.round(p.period / 12)}`,
          y: Math.round(p.balance),
          label: money(p.balance),
        })),
    },
  };
}

function mathGrowingAnnuity(q: string, ctx: CopilotContext): CopilotAnswer | null {
  if (!/\bgrowing (annuity|contribution|deposit)|contributions? grow|raise.*save|save.*raise\b/i.test(q)) {
    return null;
  }
  const amounts = parseAmounts(q);
  const rates = [...q.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((m) => Number(m[1]));
  const pmt = amounts[0] ?? Math.max(100, ctx.cashFlow > 0 ? ctx.cashFlow * 0.3 : 500);
  const years = parseYears(q) ?? 20;
  const r = (rates[0] ?? 7) / 100;
  const g = (rates[1] ?? 3) / 100;
  // Monthly version
  const rm = r / 12;
  const gm = g / 12;
  const n = Math.round(years * 12);
  const fv = futureValueGrowingAnnuity(pmt, rm, gm, n);
  const flat = futureValueSeries(pmt, rm, n);
  return {
    text: [
      `Growing annuity: start ${money(pmt)}/mo, contribution growth g=${(g * 100).toFixed(1)}%/yr, return r=${(r * 100).toFixed(1)}%/yr, ${years} years.`,
      `FV ≈ ${money(fv)}. Flat (no raise) FV ≈ ${money(flat)}. Extra from growth of deposits: ${money(fv - flat)}.`,
      `Closed form uses (1+r)^n vs (1+g)^n. If r=g the formula switches to n·PMT·(1+r)^(n−1).`,
    ].join("\n"),
    sources: ["growing annuity FV"],
    formula: renderFormula("FV = PMT ((1+r)^n − (1+g)^n) / (r − g)"),
    formulaNote: `PMT first period · r≠g · monthly rates used internally`,
    data: [
      { label: "FV growing", value: money(fv) },
      { label: "FV flat", value: money(flat) },
      { label: "Delta", value: money(fv - flat) },
    ],
  };
}

function mathPerpetuity(q: string): CopilotAnswer | null {
  if (!/\b(perpetuity|gordon|terminal value|infinite cash)\b/i.test(q)) return null;
  const amounts = parseAmounts(q);
  const rates = [...q.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((m) => Number(m[1]));
  const cash = amounts[0] ?? 1000;
  const r = (rates[0] ?? 8) / 100;
  const g = rates[1] != null ? rates[1] / 100 : 0;
  if (g > 0) {
    const pv = gordonGrowth(cash, r, g);
    if (pv == null) {
      return {
        text: `Gordon growth undefined when r≤g (r=${(r * 100).toFixed(1)}%, g=${(g * 100).toFixed(1)}%). Growth cannot exceed the discount rate forever.`,
        sources: ["Gordon growth"],
      };
    }
    return {
      text: [
        `Gordon growth: next cash ${money(cash)}, r=${(r * 100).toFixed(1)}%, g=${(g * 100).toFixed(1)}%.`,
        `PV = C₁/(r−g) = ${money(pv)}.`,
        `This is a terminal-value formula. It is extremely sensitive to r−g.`,
      ].join("\n"),
      sources: ["Gordon growth model"],
      formula: renderFormula("PV = C_1 / (r − g)"),
      formulaNote: `C₁=${cash} · r=${r} · g=${g}`,
      data: [
        { label: "PV", value: money(pv) },
        { label: "r − g", value: `${((r - g) * 100).toFixed(2)}%` },
      ],
    };
  }
  const pv = perpetuityPV(cash, r);
  if (pv == null) {
    return { text: "Perpetuity needs r>0.", sources: ["perpetuity"] };
  }
  return {
    text: [
      `Level perpetuity: ${money(cash)} per period forever at r=${(r * 100).toFixed(1)}%.`,
      `PV = C/r = ${money(pv)}.`,
    ].join("\n"),
    sources: ["level perpetuity"],
    formula: renderFormula("PV = C / r"),
    formulaNote: `C=${cash} · r=${r}`,
    data: [{ label: "PV", value: money(pv) }],
  };
}

function mathAmortTable(q: string, ctx: CopilotContext): CopilotAnswer | null {
  if (!/\b(amorti[sz]|loan schedule|interest vs principal|loan payment)\b/i.test(q)) {
    return null;
  }
  const amounts = parseAmounts(q);
  const principal = amounts[0] ?? (ctx.debt > 0 ? ctx.debt : 20000);
  const rate = parseRate(q) ?? 6.5;
  const months = parseMonths(q) ?? 60;
  const { rows, totalInterest, payment } = amortize(principal, rate, months);
  const first = rows[0];
  const mid = rows[Math.floor(rows.length / 2)];
  const last = rows[rows.length - 1];
  return {
    text: [
      `Amortising loan: principal ${money(principal)}, ${rate}% APR, ${months} months.`,
      `Level payment PMT = ${money(payment)}/mo.`,
      `Total interest = ${money(totalInterest)}; total paid = ${money(principal + totalInterest)}.`,
      first
        ? `Month 1: interest ${money(first.interest)}, principal ${money(first.principal)}, bal ${money(first.balance)}.`
        : "",
      mid
        ? `Month ${mid.month}: interest ${money(mid.interest)}, principal ${money(mid.principal)}.`
        : "",
      last
        ? `Final month ${last.month}: interest ${money(last.interest)}, principal ${money(last.principal)}.`
        : "",
      `Early months are interest-heavy; that is the amortisation identity, not a bank trick.`,
    ]
      .filter(Boolean)
      .join("\n"),
    sources: ["amortisation schedule", `PMT formula`],
    formula: renderFormula("PMT = P r / (1 − (1+r)^(−n))"),
    formulaNote: `P=${principal} · r=${(rate / 12 / 100).toFixed(6)} monthly · n=${months}`,
    data: [
      { label: "Payment", value: money(payment) },
      { label: "Total interest", value: money(totalInterest) },
      { label: "Total paid", value: money(principal + totalInterest) },
      { label: "Months", value: String(months) },
    ],
    chart: {
      kind: "line",
      title: "Balance remaining",
      xLabel: "Month",
      yLabel: "Balance",
      points: rows
        .filter((r) => r.month % Math.max(1, Math.floor(months / 12)) === 0 || r.month === months)
        .map((r) => ({
          x: `M${r.month}`,
          y: round2(r.balance),
          label: money(r.balance),
        })),
    },
  };
}

function mathDebtCompare(q: string, ctx: CopilotContext): CopilotAnswer | null {
  if (!/\b(avalanche|snowball|debt strategy|pay debts? off|highest apr first)\b/i.test(q)) {
    return null;
  }
  // Synthetic two-debt model from context or amounts
  const amounts = parseAmounts(q);
  const rate = parseRate(q) ?? 22;
  const d1: Debt = {
    name: "High-APR",
    balance: amounts[0] ?? Math.max(500, ctx.debt * 0.6 || 3000),
    apr: rate,
    minimum: 50,
  };
  const d2: Debt = {
    name: "Low-APR",
    balance: amounts[1] ?? Math.max(500, ctx.debt * 0.4 || 2000),
    apr: Math.max(5, rate - 10),
    minimum: 40,
  };
  const budget = amounts[2] ?? d1.minimum + d2.minimum + 200;
  const av = debtStrategy([d1, d2], budget, "avalanche");
  const sn = debtStrategy([d1, d2], budget, "snowball");
  return {
    text: [
      `Two-debt model with ${money(budget)}/mo budget.`,
      `${d1.name}: ${money(d1.balance)} @ ${d1.apr}%. ${d2.name}: ${money(d2.balance)} @ ${d2.apr}%.`,
      `Avalanche (highest APR first): ${av.months} months, interest ${money(av.totalInterest)}. Order: ${av.order.join(" → ")}.`,
      `Snowball (smallest balance first): ${sn.months} months, interest ${money(sn.totalInterest)}. Order: ${sn.order.join(" → ")}.`,
      `Interest gap (snowball − avalanche) = ${money(sn.totalInterest - av.totalInterest)}. Avalanche is arithmetically cheaper; snowball may win on behaviour.`,
    ].join("\n"),
    sources: ["debt simulation", "avalanche vs snowball"],
    formula: renderFormula("interest_t = balance_t × APR/12"),
    formulaNote: "Monthly loop: accrue interest, pay minimums, dump surplus at target debt",
    data: [
      { label: "Avalanche months", value: String(av.months) },
      { label: "Avalanche interest", value: money(av.totalInterest) },
      { label: "Snowball months", value: String(sn.months) },
      { label: "Snowball interest", value: money(sn.totalInterest) },
      { label: "Interest gap", value: money(sn.totalInterest - av.totalInterest) },
    ],
  };
}

function mathFI(q: string, ctx: CopilotContext): CopilotAnswer | null {
  if (!/\b(financial independence|fi |fire|coast fi|years to (retire|fi|independence))\b/i.test(q)) {
    return null;
  }
  const annualIncome = Math.max(1, (ctx.income > 0 ? ctx.income : 5000) * 12);
  const annualSpend = Math.max(1, (ctx.expense > 0 ? ctx.expense : 4000) * 12);
  const rate = parseRate(q) ?? 7;
  const withdraw = 4;
  const fi = yearsToIndependence({
    annualIncome,
    annualSpending: annualSpend,
    returnPercent: rate,
    withdrawalPercent: withdraw,
    currentSavings: Math.max(0, ctx.worth),
  });
  return {
    text: [
      `FI model from your ledger rates (annualised income ${money(annualIncome)}, spend ${money(annualSpend)}).`,
      `Savings rate = ${(fi.savingsRate * 100).toFixed(1)}%. Target pot @ ${withdraw}% withdraw = ${money(fi.target)}.`,
      fi.reachable
        ? `Years to FI @ ${rate}% return ≈ ${fi.years === 0 ? "0 (already at target)" : fi.years.toFixed(1)}.`
        : `Not reachable while savings ≤ 0 (spend ≥ income in this snapshot).`,
      `This depends on the savings *rate*, not the raw income. Raise income or cut spend both move the same lever: s = 1 − spend/income.`,
    ].join("\n"),
    sources: ["FI closed-form", `ledger income/expense × 12`, `${rate}% return`, `${withdraw}% rule`],
    formula: renderFormula("n = ln((target r + saved) / (PV r + saved)) / ln(1+r)"),
    formulaNote: "target = spend / withdraw · saved = income − spend",
    data: [
      { label: "Savings rate", value: `${(fi.savingsRate * 100).toFixed(1)}%` },
      { label: "Target pot", value: money(fi.target) },
      {
        label: "Years",
        value: fi.reachable ? (fi.years === Infinity ? "∞" : fi.years.toFixed(1)) : "unreachable",
      },
      { label: "Current savings (proxy)", value: money(ctx.worth) },
    ],
  };
}

function mathLedgerStats(q: string, ctx: CopilotContext): CopilotAnswer | null {
  if (
    !/\b(std(dev)?|standard deviation|volatility|variance|correlation|mean spend|average monthly|distribution of spend)\b/i.test(
      q
    )
  ) {
    return null;
  }
  const exp = monthlySeries(ctx, "expense");
  const inc = monthlySeries(ctx, "income");
  const expV = exp.map((x) => x.value);
  const incV = inc.map((x) => x.value);
  if (expV.length < 2) {
    return {
      text: "Need at least 2 months of ledger data for sample statistics.",
      sources: ["ledger stats"],
    };
  }
  const m = mean(expV);
  const sd = sampleStd(expV);
  const cv = m > 0 ? sd / m : 0;
  const corr = pearson(incV, expV);
  return {
    text: [
      `Average monthly spend = ${money(m)} across ${expV.length} months.`,
      `Sample σ = ${money(sd)}; CV = σ/μ = ${cv.toFixed(3)}.`,
      corr != null
        ? `Pearson correlation(income, expense) = ${corr.toFixed(3)} (n=${Math.min(incV.length, expV.length)}).`
        : `Correlation: need aligned income months.`,
      `σ is sample standard deviation (n−1). High CV means spend is unstable month to month — bad for runway planning that assumes a flat burn.`,
    ].join("\n"),
    sources: ["ledger monthly rollup", "sample statistics"],
    formula: renderFormula("σ = sqrt( Σ(x_i − μ)^2 / (n − 1) )"),
    formulaNote: "μ = sample mean · n = months with data",
    data: [
      { label: "Months", value: String(expV.length) },
      { label: "Mean spend", value: money(m) },
      { label: "Std dev", value: money(sd) },
      { label: "CV", value: cv.toFixed(3) },
      {
        label: "Corr(inc,exp)",
        value: corr != null ? corr.toFixed(3) : "n/a",
      },
    ],
    chart: {
      kind: "line",
      title: "Monthly expenses",
      xLabel: "Month",
      yLabel: "Spend",
      points: exp.map((e) => ({
        x: e.ym.slice(2),
        y: e.value,
        label: `${e.ym}: ${money(e.value)}`,
      })),
    },
  };
}

function mathSensitivity(q: string, ctx: CopilotContext): CopilotAnswer | null {
  if (!/\b(sensitivity|what if rate|stress test|scenario table|tornado)\b/i.test(q)) {
    return null;
  }
  const amounts = parseAmounts(q);
  const pmt = amounts[0] ?? Math.max(200, ctx.cashFlow > 0 ? ctx.cashFlow : 500);
  const years = parseYears(q) ?? 10;
  const months = Math.round(years * 12);
  const rates = [3, 5, 7, 9, 11];
  const rows = rates.map((rate) => {
    const end = growthSchedule({
      initial: 0,
      contribution: isMonthly(q) || true ? pmt : pmt,
      rate: rate / 100 / 12,
      periods: months,
    }).slice(-1)[0];
    return { rate, bal: end?.balance ?? 0, growth: end?.growth ?? 0 };
  });
  return {
    text: [
      `Sensitivity: ${money(pmt)}/mo for ${years} years across return rates.`,
      ...rows.map(
        (r) =>
          `${r.rate}% → ${money(r.bal)} (growth ${money(r.growth)})`
      ),
      `Same behaviour, different r: the gap between 5% and 9% is ${money((rows[3]?.bal ?? 0) - (rows[1]?.bal ?? 0))}. Rate assumption dominates decades-long plans.`,
    ].join("\n"),
    sources: ["sensitivity table", "annuity FV"],
    formula: renderFormula("FV(r) = PMT ((1+r)^n − 1)/r"),
    formulaNote: `PMT=${pmt} · n=${months} months · r varies`,
    data: rows.map((r) => ({
      label: `${r.rate}%`,
      value: money(r.bal),
    })),
    chart: {
      kind: "line",
      title: `FV sensitivity (${money(pmt)}/mo, ${years}y)`,
      xLabel: "Return %",
      yLabel: "FV",
      points: rows.map((r) => ({
        x: `${r.rate}%`,
        y: Math.round(r.bal),
        label: money(r.bal),
      })),
    },
  };
}

function mathTvmExplicit(q: string, ctx: CopilotContext): CopilotAnswer | null {
  // Generic TVM: "FV of 10000 at 7% for 10 years" / "PV of 50000 in 8 years at 5%"
  const amounts = parseAmounts(q);
  if (!amounts.length) return null;
  const rate = parseRate(q);
  const years = parseYears(q);
  if (rate == null || years == null) return null;

  if (/\b(present value|pv of|discount)\b/i.test(q)) {
    const fv = amounts[0];
    const pv = presentValue(fv, rate / 100, years);
    return {
      text: [
        `PV of ${money(fv)} in ${years}y at ${rate}% = ${money(pv)}.`,
        `You would be indifferent between ${money(pv)} today and ${money(fv)} in ${years} years at that discount rate.`,
      ].join("\n"),
      sources: ["PV identity"],
      formula: renderFormula("PV = FV / (1+r)^n"),
      formulaNote: `FV=${fv} · r=${rate}% · n=${years}`,
      data: [
        { label: "FV", value: money(fv) },
        { label: "PV", value: money(pv) },
        { label: "Discount", value: money(fv - pv) },
      ],
    };
  }

  if (/\b(future value|fv of|grow|compound|worth in)\b/i.test(q) || /\bat\s+\d/.test(q)) {
    const pv = amounts[0];
    const monthly = isMonthly(q);
    if (monthly || /\b(a month|per month|monthly)\b/i.test(q)) {
      const months = Math.round(years * 12);
      const fv = futureValueSeries(pv, rate / 100 / 12, months);
      return {
        text: [
          `Annuity FV: ${money(pv)}/mo for ${years}y @ ${rate}% → ${money(fv)}.`,
          `Contributions ${money(pv * months)}; implied growth ${money(fv - pv * months)}.`,
        ].join("\n"),
        sources: ["ordinary annuity FV"],
        formula: renderFormula("FV = PMT ((1+r)^n − 1)/r"),
        data: [
          { label: "FV", value: money(fv) },
          { label: "In", value: money(pv * months) },
          { label: "Growth", value: money(fv - pv * months) },
        ],
      };
    }
    const fv = futureValue(pv, rate / 100, years);
    const cont = futureValueContinuous(pv, rate / 100, years);
    const apy = aprToApy(rate, 12);
    const real = realReturn(rate, 3);
    const dbl = rule72(rate);
    const opp = opportunityCost(pv, years, rate);
    return {
      text: [
        `Lump sum: ${money(pv)} @ ${rate}% for ${years} years.`,
        `Discrete annual FV = ${money(fv)}. Continuous e^(rt) FV = ${money(cont)} (upper bound if compounding is continuous).`,
        `Monthly-compounded APY from ${rate}% APR ≈ ${apy.toFixed(3)}%.`,
        `Rule of 72 doubling ≈ ${dbl.approx.toFixed(2)}y (exact ${dbl.exact.toFixed(2)}y).`,
        `Real return if inflation 3%: ${real.real.toFixed(2)}% (Fisher), not ${real.naive.toFixed(2)}% naive subtract.`,
        `Opportunity cost framing: ${money(pv)} spent today forgoes ≈ ${money(opp.future)} in ${years}y at this rate.`,
      ].join("\n"),
      sources: ["TVM", "Fisher equation", "Rule of 72", "APR→APY"],
      formula: renderFormula("FV = PV(1+r)^n"),
      formulaNote: `PV=${pv} · r=${rate}% · n=${years} · continuous: PV e^{rt}`,
      data: [
        { label: "FV annual", value: money(fv) },
        { label: "FV continuous", value: money(cont) },
        { label: "APY (monthly)", value: `${apy.toFixed(3)}%` },
        { label: "Real @3% infl", value: `${real.real.toFixed(2)}%` },
        { label: "Doubling (exact)", value: `${dbl.exact.toFixed(2)}y` },
      ],
    };
  }

  // Payoff with explicit payment
  if (/\b(pay|debt|loan|card)\b/i.test(q) && amounts.length >= 1) {
    const bal = amounts[0] ?? ctx.debt;
    const pay = amounts[1] ?? loanPayment(bal, rate, 36);
    const res = payoffWithPayment(bal, rate, pay);
    if (res.neverPaysOff) {
      const monthlyInt = (bal * rate) / 100 / 12;
      return {
        text: `${money(pay)}/mo cannot service ${money(bal)} @ ${rate}% (interest alone ${money(monthlyInt)}/mo).`,
        sources: ["payoff identity"],
        data: [
          { label: "Monthly interest", value: money(monthlyInt) },
          { label: "Your payment", value: money(pay) },
        ],
      };
    }
    return {
      text: [
        `Payoff: ${money(bal)} @ ${rate}% paying ${money(pay)}/mo → ${res.months} months (${(res.months / 12).toFixed(1)}y).`,
        `Interest ${money(res.totalInterest)}; total paid ${money(res.totalPaid)}.`,
      ].join("\n"),
      sources: ["amortising payoff loop"],
      formula: renderFormula("bal_{t+1} = bal_t(1+r) − PMT"),
      data: [
        { label: "Months", value: String(res.months) },
        { label: "Interest", value: money(res.totalInterest) },
        { label: "Total paid", value: money(res.totalPaid) },
      ],
    };
  }

  return null;
}

function mathCatchAll(q: string, ctx: CopilotContext): CopilotAnswer | null {
  // Last resort for explicit math intent: use ledger + default TVM tutorial
  const rate = parseRate(q) ?? 7;
  const years = parseYears(q) ?? 10;
  const base = Math.max(1000, ctx.cash || 5000);
  const fv = futureValue(base, rate / 100, years);
  const pmt = Math.max(100, ctx.cashFlow > 0 ? ctx.cashFlow : 300);
  const ann = futureValueSeries(pmt, rate / 100 / 12, years * 12);
  return {
    text: [
      `Quant desk default (your snapshot as inputs where possible).`,
      `Lump sum: ${money(base)} @ ${rate}% × ${years}y → FV ${money(fv)}.`,
      `Annuity: ${money(pmt)}/mo @ ${rate}% × ${years}y → FV ${money(ann)}.`,
      `Ask precisely for higher power: NPV/IRR cashflows, amortisation, avalanche vs snowball, CAGR, Black-Scholes, Monte Carlo, sensitivity table, FI years, ledger σ/correlation.`,
      `Examples: "NPV at 10% of -5000, 2000, 2000, 2500" · "amortize 20000 at 6.5% for 60 months" · "monte carlo 10000 at 7% 15% vol 10 years".`,
    ].join("\n"),
    sources: ["math engine fallback", "ledger defaults"],
    formula: renderFormula("FV = PV(1+r)^n"),
    data: [
      { label: "Lump FV", value: money(fv) },
      { label: "Annuity FV", value: money(ann) },
      { label: "Cash (ctx)", value: money(ctx.cash) },
      { label: "Flow (ctx)", value: money(ctx.cashFlow) },
    ],
  };
}

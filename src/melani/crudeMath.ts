/**
 * Crude mathematical models — learn by running discrete algorithms.
 *
 * “Crude” means: simple updates you can do by hand, not fancy closed forms.
 * Continuous ideas (derivatives, exponentials) show up as small steps:
 *
 *   x_{n+1} = x_n + Δt · f(x_n)     ← Euler (crude calculus)
 *   x_{n+1} = x_n · (1 + r)         ← geometric growth
 *   θ ← θ − α · ∇L(θ)               ← gradient descent
 *
 * Every model returns a trajectory so you see the path, not only the answer.
 */

export type Trajectory = {
  /** step index 0..N */
  n: number;
  /** main state */
  x: number;
  /** optional second state / loss / etc. */
  y?: number;
  note?: string;
};

export type CrudeRun = {
  modelId: string;
  title: string;
  /** One-line math idea */
  idea: string;
  /** Continuous / textbook form */
  continuous: string;
  /** Discrete update rule (the algorithm) */
  discrete: string;
  /** What the symbols mean */
  symbols: string[];
  /** Computed path */
  path: Trajectory[];
  /** Final readout */
  summary: string;
  /** Practice question */
  practice: string;
};

function r(n: number, d = 4): string {
  if (!Number.isFinite(n)) return "—";
  const f = 10 ** d;
  return String(Math.round(n * f) / f);
}

// ── 1. Linear growth (arithmetic sequence) ───────────────────────

export function runLinearGrowth(opts?: {
  x0?: number;
  rate?: number;
  steps?: number;
}): CrudeRun {
  const x0 = opts?.x0 ?? 10;
  const a = opts?.rate ?? 3; // add this each step
  const steps = opts?.steps ?? 8;
  const path: Trajectory[] = [{ n: 0, x: x0, note: "start" }];
  let x = x0;
  for (let n = 1; n <= steps; n++) {
    x = x + a; // crude: just add
    path.push({ n, x, note: `+ ${a}` });
  }
  return {
    modelId: "linear",
    title: "Linear growth (arithmetic sequence)",
    idea: "Same amount added every step. Slope is constant.",
    continuous: "x(t) = x₀ + a·t",
    discrete: "xₙ₊₁ = xₙ + a",
    symbols: [
      `x₀ = ${x0} (start)`,
      `a = ${a} (constant add per step)`,
      `n = step count (like time)`,
    ],
    path,
    summary: `After ${steps} steps: x = ${r(x)}  (closed form: ${x0} + ${a}·${steps} = ${r(x0 + a * steps)})`,
    practice: "If a = 5 and x₀ = 2, what is x after 4 steps? (hand: 2+5+5+5+5)",
  };
}

// ── 2. Exponential / geometric growth ────────────────────────────

export function runGeometricGrowth(opts?: {
  x0?: number;
  rate?: number;
  steps?: number;
}): CrudeRun {
  const x0 = opts?.x0 ?? 100;
  const rRate = opts?.rate ?? 0.1; // 10% per step
  const steps = opts?.steps ?? 8;
  const path: Trajectory[] = [{ n: 0, x: x0, note: "start" }];
  let x = x0;
  for (let n = 1; n <= steps; n++) {
    x = x * (1 + rRate); // crude compound
    path.push({ n, x, note: `× (1+${rRate})` });
  }
  return {
    modelId: "geometric",
    title: "Geometric growth (compound / exponential crude)",
    idea: "Multiply by the same factor each step. Doubling time is roughly constant.",
    continuous: "x(t) = x₀ · e^{kt}   (k ≈ ln(1+r) for small steps)",
    discrete: "xₙ₊₁ = xₙ · (1 + r)",
    symbols: [
      `x₀ = ${x0}`,
      `r = ${rRate} (growth rate per step, 0.1 = +10%)`,
      `factor each step = ${1 + rRate}`,
    ],
    path,
    summary: `After ${steps} steps: x ≈ ${r(x, 2)}  (closed: ${x0}·(1+${rRate})^${steps} = ${r(x0 * (1 + rRate) ** steps, 2)})`,
    practice: "Start 50, r=0.2, 3 steps. Compute by hand: 50 → 60 → 72 → 86.4",
  };
}

// ── 3. Logistic growth (crude population / S-curve) ──────────────

export function runLogistic(opts?: {
  x0?: number;
  r?: number;
  K?: number;
  steps?: number;
}): CrudeRun {
  const x0 = opts?.x0 ?? 5;
  const rRate = opts?.r ?? 0.4;
  const K = opts?.K ?? 100; // carrying capacity
  const steps = opts?.steps ?? 20;
  const path: Trajectory[] = [{ n: 0, x: x0, note: "start" }];
  let x = x0;
  for (let n = 1; n <= steps; n++) {
    // discrete logistic: growth slows as x → K
    x = x + rRate * x * (1 - x / K);
    if (x < 0) x = 0;
    path.push({
      n,
      x,
      note: n % 5 === 0 ? `near K=${K}?` : undefined,
    });
  }
  return {
    modelId: "logistic",
    title: "Logistic growth (S-curve)",
    idea: "Grows fast when small; slows near a ceiling K (carrying capacity).",
    continuous: "dx/dt = r·x·(1 − x/K)",
    discrete: "xₙ₊₁ = xₙ + r·xₙ·(1 − xₙ/K)",
    symbols: [
      `x₀ = ${x0}`,
      `r = ${rRate} (intrinsic growth)`,
      `K = ${K} (max “room” — population, users, deep-sleep budget, etc.)`,
    ],
    path,
    summary: `After ${steps} steps: x ≈ ${r(x, 2)} (should approach K=${K})`,
    practice: "Why does growth almost stop when x is close to K? (look at the (1−x/K) factor)",
  };
}

// ── 4. Euler method (crude derivative / ODE) ─────────────────────

/**
 * Solve dy/dt = −k·y  (exponential decay) with Euler steps.
 * This is how you turn a differential equation into a loop.
 */
export function runEulerDecay(opts?: {
  y0?: number;
  k?: number;
  dt?: number;
  steps?: number;
}): CrudeRun {
  const y0 = opts?.y0 ?? 100;
  const k = opts?.k ?? 0.3;
  const dt = opts?.dt ?? 0.25;
  const steps = opts?.steps ?? 16;
  const path: Trajectory[] = [{ n: 0, x: 0, y: y0, note: "t=0" }];
  let y = y0;
  let t = 0;
  for (let n = 1; n <= steps; n++) {
    const dydt = -k * y; // the derivative at this point
    y = y + dt * dydt; // Euler: y ← y + Δt · slope
    t = t + dt;
    path.push({ n, x: t, y, note: `slope=${r(dydt, 2)}` });
  }
  const exact = y0 * Math.exp(-k * t);
  return {
    modelId: "euler",
    title: "Euler method (crude calculus / ODEs)",
    idea: "A derivative is a slope. Walk forward using slope × small time step.",
    continuous: "dy/dt = −k·y   →   y(t) = y₀·e^{−kt}",
    discrete: "yₙ₊₁ = yₙ + Δt · f(yₙ)   with f(y)=−k·y",
    symbols: [
      `y₀ = ${y0}`,
      `k = ${k} (decay speed)`,
      `Δt = ${dt} (step size — smaller = closer to true e^{−kt})`,
    ],
    path: path.map((p) => ({ n: p.n, x: p.y ?? 0, y: p.x, note: p.note })),
    summary: `Euler y(${r(t, 2)}) ≈ ${r(y, 2)}; true e^{−kt} ≈ ${r(exact, 2)}; error ≈ ${r(Math.abs(y - exact), 2)}`,
    practice: "Halve Δt and double steps — error should shrink (crude convergence).",
  };
}

// ── 5. Gradient descent on f(θ)=θ² ────────────────────────────────

export function runGradientDescent(opts?: {
  theta0?: number;
  alpha?: number;
  steps?: number;
}): CrudeRun {
  const theta0 = opts?.theta0 ?? 4;
  const alpha = opts?.alpha ?? 0.15; // learning rate
  const steps = opts?.steps ?? 12;
  // f(θ) = θ²  →  f'(θ) = 2θ
  const path: Trajectory[] = [];
  let theta = theta0;
  for (let n = 0; n <= steps; n++) {
    const loss = theta * theta;
    const grad = 2 * theta;
    path.push({
      n,
      x: theta,
      y: loss,
      note: n === 0 ? "start" : `grad=${r(grad, 3)}`,
    });
    if (n === steps) break;
    theta = theta - alpha * grad; // descent step
  }
  return {
    modelId: "grad",
    title: "Gradient descent (crude optimization / ML core)",
    idea: "To minimize a loss, step opposite the derivative (slope).",
    continuous: "dθ/dt = −α · ∇f(θ)",
    discrete: "θ ← θ − α · f'(θ)   here f(θ)=θ² so f'=2θ",
    symbols: [
      `θ₀ = ${theta0}`,
      `α = ${alpha} (learning rate — too big overshoots, too small crawls)`,
      `loss L = θ² (height of the bowl)`,
    ],
    path,
    summary: `θ → ${r(theta, 4)}, loss → ${r(theta * theta, 6)} (minimum is θ=0, L=0)`,
    practice: "Try α=1.2 from θ=4 — watch it diverge. That’s learning-rate math.",
  };
}

// ── 6. Moving average (crude filter / expectation) ───────────────

export function runMovingAverage(opts?: {
  data?: number[];
  window?: number;
}): CrudeRun {
  const data = opts?.data ?? [2, 5, 3, 8, 4, 9, 6, 7, 10, 5];
  const w = opts?.window ?? 3;
  const path: Trajectory[] = [];
  for (let n = 0; n < data.length; n++) {
    const a = Math.max(0, n - w + 1);
    const slice = data.slice(a, n + 1);
    const avg = slice.reduce((s, v) => s + v, 0) / slice.length;
    path.push({
      n,
      x: data[n]!,
      y: avg,
      note: `raw=${data[n]} ma=${r(avg, 2)}`,
    });
  }
  return {
    modelId: "ma",
    title: "Moving average (crude smoother / local mean)",
    idea: "Replace noise with the average of the last w points.",
    continuous: "local mean of a signal (related to convolution)",
    discrete: "mₙ = (xₙ + xₙ₋₁ + … + xₙ₋w₊₁) / w′  (w′ ≤ w at start)",
    symbols: [`window w = ${w}`, `series length = ${data.length}`],
    path,
    summary: `Last MA = ${r(path[path.length - 1]?.y ?? 0, 2)} (raw last = ${data[data.length - 1]})`,
    practice: "Bigger w → smoother, slower to react. Tradeoff is math, not vibes.",
  };
}

// ── 7. Newton’s method (crude root finding) ──────────────────────

export function runNewton(opts?: {
  x0?: number;
  steps?: number;
}): CrudeRun {
  // Find root of f(x) = x² − 2  (√2)
  const x0 = opts?.x0 ?? 2;
  const steps = opts?.steps ?? 6;
  const path: Trajectory[] = [];
  let x = x0;
  for (let n = 0; n <= steps; n++) {
    const f = x * x - 2;
    const fp = 2 * x;
    path.push({ n, x, y: f, note: `f=${r(f, 5)}` });
    if (n === steps || Math.abs(fp) < 1e-12) break;
    x = x - f / fp; // Newton: x − f/f′
  }
  return {
    modelId: "newton",
    title: "Newton’s method (crude root finding)",
    idea: "Follow the tangent line to zero — super-fast near the root.",
    continuous: "related to linear approximation f(x)≈f(x₀)+f'(x₀)(x−x₀)",
    discrete: "xₙ₊₁ = xₙ − f(xₙ)/f'(xₙ)   with f(x)=x²−2 → √2",
    symbols: [`x₀ = ${x0}`, `target root = √2 ≈ 1.41421356`],
    path,
    summary: `x ≈ ${r(x, 8)}  vs √2 ≈ ${r(Math.SQRT2, 8)}`,
    practice: "One hand step from x=1: f=−1, f'=2 → x←1−(−1)/2=1.5",
  };
}

// ── 8. Bayes crude update (probability) ──────────────────────────

export function runBayesCrude(opts?: {
  prior?: number;
  hits?: boolean[];
  likelihoodHit?: number;
  likelihoodMiss?: number;
}): CrudeRun {
  // P(H) prior; each observation updates odds crudely with likelihoods
  let p = opts?.prior ?? 0.3; // prior belief
  const hits = opts?.hits ?? [true, true, false, true];
  const L1 = opts?.likelihoodHit ?? 0.8; // P(data|H)
  const L0 = opts?.likelihoodMiss ?? 0.3; // P(data|¬H) approx for hit-shaped data
  const path: Trajectory[] = [{ n: 0, x: p, note: "prior" }];
  hits.forEach((hit, i) => {
    // crude Bayes for binary: p ← p·L / (p·L + (1−p)·L_alt)
    const like = hit ? L1 : 1 - L1;
    const likeAlt = hit ? L0 : 1 - L0;
    p = (p * like) / (p * like + (1 - p) * likeAlt);
    path.push({
      n: i + 1,
      x: p,
      note: hit ? "evidence +" : "evidence −",
    });
  });
  return {
    modelId: "bayes",
    title: "Crude Bayes update (probability)",
    idea: "New evidence multiplies belief; normalize so probabilities stay in [0,1].",
    continuous: "P(H|D) = P(D|H)P(H) / P(D)",
    discrete: "p ← p·L / (p·L + (1−p)·L_alt)  each observation",
    symbols: [
      `prior P(H) = ${opts?.prior ?? 0.3}`,
      `L(hit|H) = ${L1}, L(hit|¬H) = ${L0}`,
      `sequence = ${hits.map((h) => (h ? "+" : "−")).join("")}`,
    ],
    path,
    summary: `Posterior P(H|data) ≈ ${r(p, 4)}`,
    practice: "Strong evidence should pull p toward 0 or 1; weak evidence barely moves it.",
  };
}

// ── Registry ─────────────────────────────────────────────────────

export type CrudeModelId =
  | "linear"
  | "geometric"
  | "logistic"
  | "euler"
  | "grad"
  | "ma"
  | "newton"
  | "bayes";

export const CRUDE_MODELS: {
  id: CrudeModelId;
  title: string;
  track: string;
  run: () => CrudeRun;
}[] = [
  { id: "linear", title: "Linear growth", track: "sequences · slope", run: () => runLinearGrowth() },
  { id: "geometric", title: "Geometric / compound", track: "exponentials · rates", run: () => runGeometricGrowth() },
  { id: "logistic", title: "Logistic S-curve", track: "nonlinear · capacity", run: () => runLogistic() },
  { id: "euler", title: "Euler ODE step", track: "calculus · derivatives", run: () => runEulerDecay() },
  { id: "grad", title: "Gradient descent", track: "optimization · ML", run: () => runGradientDescent() },
  { id: "ma", title: "Moving average", track: "stats · filtering", run: () => runMovingAverage() },
  { id: "newton", title: "Newton root find", track: "approximation · √2", run: () => runNewton() },
  { id: "bayes", title: "Bayes update", track: "probability · belief", run: () => runBayesCrude() },
];

export function runCrudeModel(id: string): CrudeRun | null {
  const m = CRUDE_MODELS.find((x) => x.id === id.toLowerCase());
  return m ? m.run() : null;
}

export function formatCrudeRun(run: CrudeRun, maxRows = 10): string {
  const rows = run.path.slice(0, maxRows);
  const more =
    run.path.length > maxRows
      ? `\n  … ${run.path.length - maxRows} more steps`
      : "";
  const table = rows
    .map((p) => {
      const y = p.y != null ? `  y=${r(p.y, 4)}` : "";
      const note = p.note ? `  (${p.note})` : "";
      return `  n=${p.n}  x=${r(p.x, 4)}${y}${note}`;
    })
    .join("\n");
  return [
    `━━ ${run.title} ━━`,
    `Idea: ${run.idea}`,
    "",
    `Continuous:  ${run.continuous}`,
    `Algorithm:   ${run.discrete}`,
    "",
    "Symbols:",
    ...run.symbols.map((s) => `  · ${s}`),
    "",
    "Trajectory (crude steps):",
    table + more,
    "",
    run.summary,
    "",
    `Practice: ${run.practice}`,
  ].join("\n");
}

export function listCrudeModels(): string {
  return [
    "Crude math lab — learn by running discrete models",
    "",
    "Curriculum (in order):",
    ...CRUDE_MODELS.map(
      (m, i) => `  ${i + 1}. ${m.id.padEnd(10)} ${m.title}  [${m.track}]`
    ),
    "",
    "Commands:",
    "  math                  — this list",
    "  math linear           — run one model",
    "  math grad             — gradient descent bowl",
    "  math next             — next lesson in sequence",
    "  math path linear      — show full trajectory emphasis",
    "",
    "Rule: if you only memorize formulas, you skip the algorithm.",
    "Here the algorithm is the teacher.",
  ].join("\n");
}

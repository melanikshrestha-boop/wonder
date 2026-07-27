/**
 * THINK BIG math empire — crude models across full tracks.
 * Same rule as crudeMath: discrete loops you can run by hand.
 */
import type { CrudeRun, Trajectory } from "./crudeMath";
import {
  runBayesCrude,
  runEulerDecay,
  runGeometricGrowth,
  runGradientDescent,
  runLinearGrowth,
  runLogistic,
  runMovingAverage,
  runNewton,
  CRUDE_MODELS as BASE,
} from "./crudeMath";

function r(n: number, d = 4): string {
  if (!Number.isFinite(n)) return "—";
  const f = 10 ** d;
  return String(Math.round(n * f) / f);
}

// ── Linear algebra crude ─────────────────────────────────────────

/** 2D vector ops + matrix-vector multiply as nested loops */
export function runVec2(): CrudeRun {
  const a = { x: 3, y: 4 };
  const b = { x: 1, y: 2 };
  const dot = a.x * b.x + a.y * b.y;
  const normA = Math.sqrt(a.x * a.x + a.y * a.y);
  const path: Trajectory[] = [
    { n: 0, x: a.x, y: a.y, note: "a = (3,4)" },
    { n: 1, x: b.x, y: b.y, note: "b = (1,2)" },
    { n: 2, x: a.x + b.x, y: a.y + b.y, note: "a+b" },
    { n: 3, x: 2 * a.x, y: 2 * a.y, note: "2a" },
    { n: 4, x: dot, y: normA, note: "dot · ‖a‖" },
  ];
  return {
    modelId: "vec2",
    title: "Vectors in 2D (crude linear algebra)",
    idea: "A vector is an ordered list of numbers. Add componentwise; dot product sums products.",
    continuous: "a·b = |a||b|cosθ   (geometry of the same algebra)",
    discrete: "dot = aₓbₓ + aᵧbᵧ;  ‖a‖ = √(aₓ²+aᵧ²)",
    symbols: ["a = (3,4)", "b = (1,2)", "‖a‖ should be 5 (3-4-5 triangle)"],
    path,
    summary: `a·b = ${dot}, ‖a‖ = ${r(normA)} (expect 5)`,
    practice: "Hand: (2,1)·(3,5) = 6+5 = 11",
  };
}

/** 2×2 matrix times vector — nested for-loops */
export function runMatVec(): CrudeRun {
  const M = [
    [2, 1],
    [0, 3],
  ];
  const v = [4, 5];
  const out = [0, 0];
  const path: Trajectory[] = [{ n: 0, x: v[0]!, y: v[1]!, note: "v in" }];
  for (let i = 0; i < 2; i++) {
    let s = 0;
    for (let j = 0; j < 2; j++) s += M[i]![j]! * v[j]!;
    out[i] = s;
    path.push({ n: i + 1, x: s, y: i, note: `row ${i} · v` });
  }
  return {
    modelId: "matvec",
    title: "Matrix × vector (crude)",
    idea: "Each output entry is a dot product of one matrix row with the vector.",
    continuous: "Mv for linear maps ℝ²→ℝ²",
    discrete: "for i:  yᵢ = Σⱼ Mᵢⱼ vⱼ",
    symbols: ["M = [[2,1],[0,3]]", "v = [4,5]", "y should be [13, 15]"],
    path,
    summary: `Mv = [${out[0]}, ${out[1]}]`,
    practice: "Compute [[1,2],[3,4]] · [1,0] by hand → [1,3]",
  };
}

// ── Probability / combinatorics crude ────────────────────────────

export function runExpectedValue(): CrudeRun {
  // Die: outcomes 1..6 equal prob
  const path: Trajectory[] = [];
  let acc = 0;
  for (let k = 1; k <= 6; k++) {
    const p = 1 / 6;
    acc += k * p;
    path.push({ n: k, x: acc, y: k * p, note: `+ ${k}·(1/6)` });
  }
  return {
    modelId: "expect",
    title: "Expected value (crude average of futures)",
    idea: "E[X] = sum of (value × probability). Fair die → 3.5",
    continuous: "E[X] = ∫ x f(x) dx  (continuous cousin)",
    discrete: "E[X] = Σₖ xₖ · P(X=xₖ)",
    symbols: ["fair six-sided die", "P(k)=1/6 for k=1..6"],
    path,
    summary: `E[die] = ${r(acc, 4)} (exact 3.5)`,
    practice: "Coin: +1 win, −1 lose, fair → E=0. Biased p(win)=0.6 → E=0.2",
  };
}

export function runBinomialPath(): CrudeRun {
  // Crude: n independent coin flips, track #heads distribution via recurrence
  const n = 8;
  const p = 0.5;
  // dp[k] = P(exactly k heads) after t flips
  let dp = [1]; // t=0
  const path: Trajectory[] = [{ n: 0, x: 0, y: 1, note: "P(0 heads)=1" }];
  for (let t = 1; t <= n; t++) {
    const next = Array(t + 1).fill(0);
    for (let k = 0; k < dp.length; k++) {
      next[k] += dp[k]! * (1 - p); // tails
      next[k + 1] = (next[k + 1] || 0) + dp[k]! * p; // heads
    }
    dp = next;
    const mean = dp.reduce((s, pk, k) => s + k * pk, 0);
    path.push({ n: t, x: mean, y: dp[Math.floor(t / 2)]!, note: `E[#H]=${r(mean, 2)}` });
  }
  return {
    modelId: "binomial",
    title: "Binomial path (crude counting + probability)",
    idea: "Each flip branches: heads or tails. DP multiplies probabilities.",
    continuous: "related to normal limit (CLT) for large n",
    discrete: "Pₜ₊₁(k) = Pₜ(k)·(1−p) + Pₜ(k−1)·p",
    symbols: [`n = ${n} flips`, `p = ${p}`, "track expected heads"],
    path,
    summary: `After ${n} fair flips, E[#heads] = ${r(dp.reduce((s, pk, k) => s + k * pk, 0))} (should be n/2=${n / 2})`,
    practice: "n=3 fair: P(2 heads)=3/8. List HHT, HTH, THH.",
  };
}

// ── Calculus / series ────────────────────────────────────────────

export function runTaylorE(): CrudeRun {
  // e ≈ Σ x^k / k!  at x=1
  const path: Trajectory[] = [];
  let sum = 0;
  let term = 1;
  let fact = 1;
  for (let k = 0; k <= 12; k++) {
    if (k > 0) {
      fact *= k;
      term = 1 / fact;
    }
    sum += term;
    path.push({ n: k, x: sum, y: term, note: `+ 1/${k || 1}!` });
  }
  return {
    modelId: "taylor",
    title: "Taylor / series for e (crude infinite sum)",
    idea: "Some numbers are limits of partial sums. Add terms until they get tiny.",
    continuous: "e^x = Σ xᵏ/k!",
    discrete: "sₙ = Σₖ₌₀ⁿ 1/k!  → e",
    symbols: ["x = 1", `true e ≈ ${Math.E}`],
    path,
    summary: `s₁₂ ≈ ${r(sum, 8)} vs e ≈ ${r(Math.E, 8)}`,
    practice: "s₃ = 1+1+1/2+1/6 = 2.666…",
  };
}

export function runRiemann(): CrudeRun {
  // ∫₀¹ x² dx = 1/3 via right rectangles
  const N = 20;
  const a = 0;
  const b = 1;
  const dx = (b - a) / N;
  let area = 0;
  const path: Trajectory[] = [];
  for (let i = 1; i <= N; i++) {
    const x = a + i * dx;
    const h = x * x;
    area += h * dx;
    if (i % 2 === 0 || i === N) {
      path.push({ n: i, x: area, y: h, note: `rect @ x=${r(x, 2)}` });
    }
  }
  return {
    modelId: "riemann",
    title: "Riemann sum (crude integral)",
    idea: "Area under a curve ≈ many thin rectangles. That’s the integral.",
    continuous: "∫₀¹ x² dx = 1/3",
    discrete: "Σ f(xᵢ)·Δx   right endpoints",
    symbols: [`N = ${N} slices`, `Δx = ${dx}`, "f(x)=x²"],
    path,
    summary: `Approx area = ${r(area, 5)}; exact 1/3 ≈ ${r(1 / 3, 5)}; error ${r(Math.abs(area - 1 / 3), 5)}`,
    practice: "More slices → smaller error (definition of the integral).",
  };
}

// ── Discrete math / algorithms ───────────────────────────────────

export function runFibonacci(): CrudeRun {
  const steps = 12;
  const path: Trajectory[] = [
    { n: 0, x: 0, note: "F₀" },
    { n: 1, x: 1, note: "F₁" },
  ];
  let a = 0;
  let b = 1;
  for (let n = 2; n <= steps; n++) {
    const c = a + b;
    path.push({ n, x: c, note: `${a}+${b}` });
    a = b;
    b = c;
  }
  return {
    modelId: "fib",
    title: "Fibonacci (recurrence · dynamic programming seed)",
    idea: "Next term from previous two. Recurrence relations are loops with memory.",
    continuous: "Binet: Fₙ ≈ φⁿ/√5  (closed form later)",
    discrete: "Fₙ₊₁ = Fₙ + Fₙ₋₁",
    symbols: ["F₀=0, F₁=1", `steps = ${steps}`],
    path,
    summary: `F_${steps} = ${b}`,
    practice: "F₁₀ = 55. Build the list once — no exponential recursion.",
  };
}

export function runGcdEuclid(): CrudeRun {
  let a = 252;
  let b = 105;
  const path: Trajectory[] = [{ n: 0, x: a, y: b, note: "start" }];
  let n = 0;
  while (b !== 0 && n < 20) {
    const rmd = a % b;
    path.push({ n: ++n, x: b, y: rmd, note: `${a} = q·${b} + ${rmd}` });
    a = b;
    b = rmd;
  }
  return {
    modelId: "euclid",
    title: "Euclidean GCD (number theory algorithm)",
    idea: "gcd(a,b)=gcd(b, a mod b). Remainder shrinks → finishes.",
    continuous: "—",
    discrete: "while b≠0: (a,b) ← (b, a mod b); return a",
    symbols: ["a₀=252", "b₀=105", "gcd should be 21"],
    path,
    summary: `gcd = ${a}`,
    practice: "gcd(48,18): 48=2·18+12 → 18=1·12+6 → 12=2·6+0 → 6",
  };
}

// ── Systems / empire-grade crude ─────────────────────────────────

export function runSIR(): CrudeRun {
  // Classic epidemic crude: S,I,R compartments
  let S = 990;
  let I = 10;
  let R = 0;
  const N = S + I + R;
  const beta = 0.3;
  const gamma = 0.1;
  const dt = 0.5;
  const path: Trajectory[] = [{ n: 0, x: I, y: S, note: "I,S" }];
  for (let n = 1; n <= 40; n++) {
    const dS = (-beta * S * I) / N;
    const dI = (beta * S * I) / N - gamma * I;
    const dR = gamma * I;
    S += dt * dS;
    I += dt * dI;
    R += dt * dR;
    if (n % 4 === 0) path.push({ n, x: I, y: S, note: `R=${r(R, 0)}` });
  }
  return {
    modelId: "sir",
    title: "SIR epidemic (crude systems ODE)",
    idea: "Coupled tanks: Susceptible → Infectious → Recovered. Rates couple the equations.",
    continuous: "dS/dt=−βSI/N, dI/dt=βSI/N−γI, dR/dt=γI",
    discrete: "Euler on each compartment each step",
    symbols: [`β=${beta}`, `γ=${gamma}`, `N=${N}`, "track I (infected)"],
    path,
    summary: `Final-ish I≈${r(I, 1)}, S≈${r(S, 1)}, R≈${r(R, 1)}`,
    practice: "If γ increases (faster recovery), peak I usually drops — parameter intuition.",
  };
}

export function runPIDCrude(): CrudeRun {
  // Hold a setpoint with crude PID (control theory)
  const setpoint = 10;
  let x = 0;
  let integral = 0;
  let prevErr = setpoint - x;
  const Kp = 0.4;
  const Ki = 0.05;
  const Kd = 0.1;
  const path: Trajectory[] = [];
  for (let n = 0; n <= 25; n++) {
    const err = setpoint - x;
    integral += err;
    const deriv = err - prevErr;
    const u = Kp * err + Ki * integral + Kd * deriv;
    path.push({ n, x, y: u, note: `err=${r(err, 2)}` });
    x = x + 0.3 * u; // plant: crude response
    prevErr = err;
  }
  return {
    modelId: "pid",
    title: "PID control (crude feedback loop)",
    idea: "Error drives correction: Present (P) + memory (I) + change (D).",
    continuous: "u = Kp e + Ki ∫e + Kd ė",
    discrete: "u = Kp e + Ki Σe + Kd (e−e_prev);  x ← x + α u",
    symbols: [`setpoint = ${setpoint}`, `Kp=${Kp} Ki=${Ki} Kd=${Kd}`],
    path,
    summary: `x ends ≈ ${r(x, 3)} (want near ${setpoint})`,
    practice: "This is the same loop idea as agent graphs: measure → act → repeat.",
  };
}

export function runMarkov(): CrudeRun {
  // 2-state weather Markov chain
  // P = [[0.8 sun→sun, 0.2 sun→rain],[0.4 rain→sun, 0.6 rain→rain]]
  let pSun = 1;
  let pRain = 0;
  const path: Trajectory[] = [{ n: 0, x: pSun, y: pRain, note: "start sun" }];
  for (let n = 1; n <= 12; n++) {
    const ns = 0.8 * pSun + 0.4 * pRain;
    const nr = 0.2 * pSun + 0.6 * pRain;
    pSun = ns;
    pRain = nr;
    path.push({ n, x: pSun, y: pRain, note: "after transition" });
  }
  return {
    modelId: "markov",
    title: "Markov chain (crude stochastic process)",
    idea: "Next state depends only on now — multiply by transition matrix each step.",
    continuous: "continuous-time CTMC later",
    discrete: "πₙ₊₁ = πₙ P",
    symbols: ["states: sun, rain", "stationary should satisfy π=πP"],
    path,
    summary: `π ≈ (sun ${r(pSun, 3)}, rain ${r(pRain, 3)})`,
    practice: "Stationary: solve π_s=0.8π_s+0.4π_r, π_s+π_r=1 → π_s=2/3",
  };
}

// ── Tracks ───────────────────────────────────────────────────────

export type MathTrackId =
  | "foundations"
  | "calculus"
  | "linalg"
  | "probability"
  | "algorithms"
  | "systems"
  | "mlcore";

export type EmpireLesson = {
  id: string;
  track: MathTrackId;
  title: string;
  order: number;
  run: () => CrudeRun;
};

export const MATH_TRACKS: {
  id: MathTrackId;
  name: string;
  blurb: string;
}[] = [
  { id: "foundations", name: "Foundations", blurb: "Sequences, growth, recurrences" },
  { id: "calculus", name: "Calculus crude", blurb: "Slopes, areas, series, ODEs" },
  { id: "linalg", name: "Linear algebra", blurb: "Vectors, matrices as loops" },
  { id: "probability", name: "Probability", blurb: "Expectation, Bayes, Markov" },
  { id: "algorithms", name: "Algorithms", blurb: "GCD, Fibonacci, Newton" },
  { id: "systems", name: "Systems", blurb: "SIR, PID, logistic world models" },
  { id: "mlcore", name: "ML core", blurb: "Gradient descent, filters, loss" },
];

export const EMPIRE_LESSONS: EmpireLesson[] = [
  // foundations
  { id: "linear", track: "foundations", title: "Linear growth", order: 1, run: () => runLinearGrowth() },
  { id: "geometric", track: "foundations", title: "Geometric growth", order: 2, run: () => runGeometricGrowth() },
  { id: "fib", track: "foundations", title: "Fibonacci recurrence", order: 3, run: () => runFibonacci() },
  { id: "logistic", track: "foundations", title: "Logistic S-curve", order: 4, run: () => runLogistic() },
  // calculus
  { id: "euler", track: "calculus", title: "Euler ODE", order: 1, run: () => runEulerDecay() },
  { id: "riemann", track: "calculus", title: "Riemann sum", order: 2, run: () => runRiemann() },
  { id: "taylor", track: "calculus", title: "Series for e", order: 3, run: () => runTaylorE() },
  // linalg
  { id: "vec2", track: "linalg", title: "Vectors 2D", order: 1, run: () => runVec2() },
  { id: "matvec", track: "linalg", title: "Matrix × vector", order: 2, run: () => runMatVec() },
  // probability
  { id: "expect", track: "probability", title: "Expected value", order: 1, run: () => runExpectedValue() },
  { id: "bayes", track: "probability", title: "Bayes update", order: 2, run: () => runBayesCrude() },
  { id: "binomial", track: "probability", title: "Binomial path", order: 3, run: () => runBinomialPath() },
  { id: "markov", track: "probability", title: "Markov chain", order: 4, run: () => runMarkov() },
  // algorithms
  { id: "euclid", track: "algorithms", title: "Euclidean GCD", order: 1, run: () => runGcdEuclid() },
  { id: "newton", track: "algorithms", title: "Newton √2", order: 2, run: () => runNewton() },
  // systems
  { id: "sir", track: "systems", title: "SIR epidemic", order: 1, run: () => runSIR() },
  { id: "pid", track: "systems", title: "PID control", order: 2, run: () => runPIDCrude() },
  // ml
  { id: "grad", track: "mlcore", title: "Gradient descent", order: 1, run: () => runGradientDescent() },
  { id: "ma", track: "mlcore", title: "Moving average", order: 2, run: () => runMovingAverage() },
];

export function lessonsForTrack(track: MathTrackId): EmpireLesson[] {
  return EMPIRE_LESSONS.filter((l) => l.track === track).sort(
    (a, b) => a.order - b.order
  );
}

export function findEmpireLesson(id: string): EmpireLesson | null {
  const k = id.toLowerCase();
  return EMPIRE_LESSONS.find((l) => l.id === k) || null;
}

export function runEmpireLesson(id: string): CrudeRun | null {
  const L = findEmpireLesson(id);
  if (L) return L.run();
  // fallback base
  const b = BASE.find((m) => m.id === id);
  return b ? b.run() : null;
}

export function empireCatalog(): string {
  const lines = [
    "━━ THINK BIG · Crude Math Empire ━━",
    `${EMPIRE_LESSONS.length} runnable models · ${MATH_TRACKS.length} tracks`,
    "Every lesson = discrete algorithm + trajectory + practice",
    "",
  ];
  for (const t of MATH_TRACKS) {
    lines.push(`▸ ${t.name.toUpperCase()} — ${t.blurb}`);
    for (const L of lessonsForTrack(t.id)) {
      lines.push(`    ${L.id.padEnd(10)} ${L.title}`);
    }
    lines.push("");
  }
  lines.push("Mel: math · math next · math grad · math track probability · think big");
  return lines.join("\n");
}

/**
 * Success math — apply crude discrete models to YOUR metrics
 * so the lab accelerates outcomes, not textbook theater.
 */
import {
  runEulerDecay,
  runGeometricGrowth,
  runGradientDescent,
  runLinearGrowth,
  runLogistic,
  runMovingAverage,
  type CrudeRun,
} from "./crudeMath";
import { getMathProgress } from "./melMath";
import { getMetric, listMetrics, type MelMetric } from "./melMetrics";
import { formatCrudeRun } from "./crudeMath";

export type SuccessDomain =
  | "body"
  | "focus"
  | "money"
  | "skill"
  | "company"
  | "systems";

export type SuccessEngine = {
  id: string;
  name: string;
  domain: SuccessDomain;
  /** What empire outcome this accelerates */
  accelerates: string;
  /** Underlying crude model id (for curriculum link) */
  modelId: string;
  metricHints: string[];
  run: () => SuccessRun;
};

export type SuccessRun = {
  engineId: string;
  title: string;
  accelerates: string;
  /** Plain English: what we did with YOUR numbers */
  applied: string;
  /** The discrete rule in one line */
  rule: string;
  /** Trajectory text (same family as crude lab) */
  trajectory: string;
  /** What to do this week */
  protocol: string[];
  /** Optional metric ids used */
  metricsUsed: string[];
  /** Closed-form / summary number */
  summary: string;
};

function r(n: number, d = 2): string {
  if (!Number.isFinite(n)) return "—";
  const f = 10 ** d;
  return String(Math.round(n * f) / f);
}

function lastPoints(m: MelMetric | null | undefined, n = 7): number[] {
  if (!m?.series?.length) return [];
  return m.series.slice(-n).map((p) => p.v).filter((v) => Number.isFinite(v));
}

function mean(xs: number[]): number | null {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function crudeToTrajectory(run: CrudeRun): string {
  return formatCrudeRun(run);
}

function sleepMetric(): MelMetric | null {
  return getMetric("sleep.hours");
}

function focusMetric(): MelMetric | null {
  return getMetric("screen.minutes") || getMetric("custom.deep_focus");
}

function mathMetric(): MelMetric | null {
  return getMetric("math.lessons_completed");
}

/** Sleep debt recovery — Euler decay of "debt" toward target hours */
function runSleepRecovery(): SuccessRun {
  const m = sleepMetric();
  const pts = lastPoints(m, 7);
  const avg = mean(pts) ?? 7;
  const target = 8;
  const debt0 = Math.max(0, (target - avg) * 7); // hours short over a week-ish
  // decay debt by fixing +0.5h/night effective recovery rate
  const k = 0.15;
  const dt = 1; // day
  const steps = 10;
  // Reuse Euler path on debt with f(y) = -k*y + effort
  const effort = 0.5; // hours recovered toward target per day when you execute
  const path: { n: number; x: number; note?: string }[] = [
    { n: 0, x: debt0, note: "sleep debt hours (start)" },
  ];
  let debt = debt0;
  for (let n = 1; n <= steps; n++) {
    debt = Math.max(0, debt + dt * (-k * debt - effort));
    path.push({ n, x: Number(debt.toFixed(3)), note: `day ${n} · −k·debt − effort` });
  }
  const crude = runEulerDecay();
  return {
    engineId: "sleep-recovery",
    title: "Sleep debt recovery (Euler on YOUR nights)",
    accelerates: "Deep recovery → clearer decisions → company velocity",
    applied: pts.length
      ? `Your last ${pts.length} sleep points average ${r(avg)} h (target ${target} h). Estimated week debt ≈ ${r(debt0)} h.`
      : `No dense sleep series yet — seeded debt from default ${r(avg)} h avg. Log nights so this uses real data.`,
    rule: "debt_{n+1} = max(0, debt_n − k·debt_n − effort)  ·  effort = +0.5h toward 8h",
    trajectory: [
      "— Sleep debt trajectory (days) —",
      ...path.map((p) => `n=${p.n} debt≈${r(p.x, 2)} h ${p.note ? `(${p.note})` : ""}`),
      `After ${steps} disciplined days debt ≈ ${r(path[path.length - 1]!.x, 2)} h`,
      "",
      "(Underlying calculus: same Euler family as ODE decay — applied to body, not textbook e^{-kt} toys.)",
      crude.summary,
    ].join("\n"),
    protocol: [
      "Protect 8h window 6 nights this week (calendar block, not hope).",
      "If avg < 7h: no late stream nights back-to-back.",
      "Log sleep every morning so Mel re-runs this on real series.",
      "Success check: 7-day avg sleep ≥ 7.5h.",
    ],
    metricsUsed: m ? [m.id] : [],
    summary: `Avg sleep ${r(avg)}h · debt≈${r(debt0)}h → projected ${r(path[path.length - 1]!.x)}h debt in ${steps}d if you hold effort`,
  };
}

/** Focus capital — geometric growth of deep work minutes if you protect compound days */
function runFocusCompound(): SuccessRun {
  const m = focusMetric();
  const pts = lastPoints(m, 5);
  // If screen minutes high, invert: focus capital = budget - screen or use deep_focus
  const isScreen = m?.id === "screen.minutes";
  const last = pts[pts.length - 1];
  const baseFocus = isScreen
    ? Math.max(30, 240 - (last ?? 120)) // crude: free minutes if day has 4h discretionary
    : last ?? 45;
  const dailyGrowth = 0.08; // 8% more protected deep work if habit sticks
  const crude = runGeometricGrowth({
    x0: baseFocus,
    rate: dailyGrowth,
    steps: 10,
  });
  return {
    engineId: "focus-compound",
    title: "Deep work compound (geometric growth)",
    accelerates: "Shipping speed · learning rate · founder leverage",
    applied: m
      ? isScreen
        ? `Screen metric last ≈ ${last != null ? r(last) : "—"} min. Crude free-focus start ≈ ${r(baseFocus)} min/day if you claw time back.`
        : `Deep focus last ≈ ${last != null ? r(last) : "—"} ${m.unit}. Compounding from there at +${r(dailyGrowth * 100, 0)}%/day when protected.`
      : `No focus metric yet. Seeded ${r(baseFocus)} min deep work. Add: add metric deep_focus unit min`,
    rule: "focus_{n+1} = focus_n · (1 + r)  when the block is actually protected",
    trajectory: crudeToTrajectory(crude),
    protocol: [
      "One 90-min deep block before noon (phone out of room).",
      "Log: log metric deep_focus <minutes> every day.",
      "Kill one recurring screen sink this week (name it in Mel).",
      "Success check: 5 days with deep_focus ≥ 90.",
    ],
    metricsUsed: m ? [m.id] : [],
    summary: crude.summary,
  };
}

/** Skill / empire S-curve — logistic: early grind, then leverage, then saturation → new S */
function runSkillSCurve(): SuccessRun {
  const m = mathMetric();
  const done = getMathProgress().completed.length;
  const crude = runLogistic({
    x0: Math.max(2, done * 4),
    r: 0.35,
    K: 100,
    steps: 12,
  });
  return {
    engineId: "skill-scurve",
    title: "Skill S-curve (logistic growth)",
    accelerates: "Career/company capability — know when to push vs switch S-curves",
    applied: `Math empire lessons completed: ${done}/19 (proxy for deliberate practice reps). Logistic = slow start → steep gains → plateau. Plateaus mean new engine, not more of the same.`,
    rule: "x_{n+1} = x_n + r·x_n·(1 − x_n/K)   K = capacity of current game",
    trajectory: crudeToTrajectory(crude),
    protocol: [
      "This week: one applied success engine daily (not random textbook hops).",
      "When a skill feels flat 7+ days: change the game (new project, harder customer, public ship).",
      "Track reps: every deep block logs a metric, not vibes.",
      "Success check: ship one visible artifact (PR, product, post) this week.",
    ],
    metricsUsed: m ? [m.id] : ["math.lessons_completed"],
    summary: `Practice reps (lessons) ${done} · S-curve mindset: push while steep, redesign at plateau`,
  };
}

/** Capital / runway linear + geometric hybrid narrative */
function runCapitalPath(): SuccessRun {
  // Prefer any money-like custom metric
  const cash = listMetrics().find(
    (m) =>
      m.domain === "money" ||
      /cash|runway|savings|revenue|burn/i.test(m.id + m.name)
  );
  const pts = lastPoints(cash, 6);
  const x0 = pts[pts.length - 1] ?? 1000;
  const weeklyAdd = 200; // default save/earn add if no data
  const linear = runLinearGrowth({ x0, rate: weeklyAdd, steps: 8 });
  const geo = runGeometricGrowth({ x0: Math.max(1, x0), rate: 0.02, steps: 8 });
  return {
    engineId: "capital-path",
    title: "Capital path (linear save + compound)",
    accelerates: "Runway · optionality · ability to say no",
    applied: cash
      ? `Using ${cash.name} last=${r(x0)} ${cash.unit}. Linear = grind adds; geometric = returns on capital.`
      : `No money metric yet. Demo from ${r(x0)}. Add: add metric runway_weeks unit weeks  OR  add metric cash unit $`,
    rule: "cash_{n+1} = cash_n + save    and/or    cash_{n+1} = cash_n·(1+r)",
    trajectory: [
      "— Linear save path —",
      crudeToTrajectory(linear),
      "",
      "— Compound path (same start) —",
      crudeToTrajectory(geo),
    ].join("\n"),
    protocol: [
      "Log one money metric weekly (cash, runway, or burn).",
      "Automate one save transfer (linear engine).",
      "Cut one subscription Mel already tracks if waste.",
      "Success check: 4 weekly logs + burn ≤ plan.",
    ],
    metricsUsed: cash ? [cash.id] : [],
    summary: linear.summary,
  };
}

/** Control loop — PID-style: error from target focus/sleep drives correction */
function runLifeControl(): SuccessRun {
  const sleep = sleepMetric();
  const pts = lastPoints(sleep, 5);
  const avg = mean(pts) ?? 7;
  const target = 8;
  const error = target - avg;
  // crude proportional correction: extra wind-down minutes
  const Kp = 40;
  const correctionMin = Math.round(Math.max(0, error) * Kp);
  return {
    engineId: "life-control",
    title: "Life control loop (error → correction)",
    accelerates: "Stable body/mind so you can execute under pressure",
    applied: `Target sleep ${target}h · your avg ${r(avg)}h · error = ${r(error)}h. Proportional fix: +${correctionMin} min wind-down before bed when error > 0.`,
    rule: "u = Kp · (target − measured)   then act u (minutes, dollars, reps)",
    trajectory: [
      "— Feedback loop —",
      `measure → error=${r(error)} → control u=+${correctionMin} min earlier wind-down`,
      "repeat daily; shrink |error|",
      "",
      "Same family as PID on systems track — applied to you as the plant.",
    ].join("\n"),
    protocol: [
      `Tonight: start wind-down ${correctionMin} min earlier than last night.`,
      "Morning: log sleep hours.",
      "If error flips negative (oversleep crash): cap wake consistency, not more bed.",
      "Success check: |avg − 8| ≤ 0.5h over 7 days.",
    ],
    metricsUsed: sleep ? [sleep.id] : [],
    summary: `error ${r(error)}h · correction ${correctionMin} min earlier · remeasure tomorrow`,
  };
}

/** Moving average of a metric — filter noise, see real trend */
function runTrendFilter(): SuccessRun {
  const all = listMetrics().filter((m) => m.series.length >= 3);
  const m =
    all.find((x) => x.id === "sleep.hours") ||
    all.find((x) => x.domain === "body") ||
    all[0] ||
    null;
  const pts = lastPoints(m, 9);
  const window = 3;
  const mas: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const slice = pts.slice(Math.max(0, i - window + 1), i + 1);
    mas.push(mean(slice)!);
  }
  const crude = runMovingAverage();
  const lines = pts.map(
    (v, i) => `t${i + 1}: raw=${r(v)}  MA${window}=${r(mas[i]!)}`
  );
  return {
    engineId: "trend-filter",
    title: "Trend filter (moving average on YOUR series)",
    accelerates: "Stop reacting to noise — act on slope",
    applied: m
      ? `Filtering ${m.name} (${m.id}), last ${pts.length} points.`
      : "Need ≥3 points on any metric. Log 3 days then re-run.",
    rule: "MA_n = mean(x_{n-w+1} … x_n)  — decide on MA slope, not one spike",
    trajectory: [
      "— Raw vs smoothed —",
      ...(lines.length ? lines : ["(no series)"]),
      "",
      crude.summary,
    ].join("\n"),
    protocol: [
      "Pick one north-star metric for 14 days.",
      "Only change protocol if 3-day MA moves the wrong way 3 times.",
      "Ignore single bad days unless safety/health.",
      "Success check: you can state MA direction without opening raw panic.",
    ],
    metricsUsed: m ? [m.id] : [],
    summary: pts.length
      ? `Last raw ${r(pts[pts.length - 1]!)} · MA ${r(mas[mas.length - 1]!)} on ${m?.name}`
      : "Log metrics first",
  };
}

/** Gradient step on a simple loss: (sleep_err)^2 + (focus_gap)^2 */
function runOptimizeWeek(): SuccessRun {
  const sleep = sleepMetric();
  const focus = focusMetric();
  const sAvg = mean(lastPoints(sleep, 7)) ?? 7;
  const fLast = lastPoints(focus, 3);
  const fAvg = mean(fLast) ?? 60;
  const sleepErr = 8 - sAvg;
  const focusTarget = 120;
  const focusErr = focusTarget - (focus?.id === "screen.minutes" ? Math.max(0, 240 - fAvg) : fAvg);
  // one gradient step on θ = [sleep_priority, focus_priority] toy
  const lr = 0.25;
  const gSleep = -2 * sleepErr;
  const gFocus = -2 * focusErr;
  const stepSleep = -lr * gSleep;
  const stepFocus = -lr * gFocus;
  const crude = runGradientDescent();
  return {
    engineId: "optimize-week",
    title: "Optimize this week (one gradient step)",
    accelerates: "Allocate scarce hours to highest loss reduction",
    applied: `Loss pieces: sleep error ${r(sleepErr)}h from 8h; focus gap ${r(focusErr)} min from 120 deep. One step: shift priorities, don’t rewrite your life.`,
    rule: "θ ← θ − α ∇L    L ≈ (8−sleep)² + (120−focus)²",
    trajectory: [
      "— Gradient (crude) —",
      `∂L/∂sleep_term ≈ ${r(gSleep)} → step ${r(stepSleep)} on sleep priority`,
      `∂L/∂focus_term ≈ ${r(gFocus)} → step ${r(stepFocus)} on focus priority`,
      "",
      crude.summary,
    ].join("\n"),
    protocol: [
      sleepErr > 0.3
        ? "This week sleep is the steepest ascent — protect nights first."
        : "Sleep OK — put spare willpower into deep work blocks.",
      focusErr > 20
        ? "Schedule two 90-min deep blocks on calendar (non-negotiable)."
        : "Maintain focus; raise difficulty of work, not hours.",
      "Re-run optimize-week Sunday night.",
      "Success check: both errors shrink vs today.",
    ],
    metricsUsed: [sleep?.id, focus?.id].filter(Boolean) as string[],
    summary: `sleep_err ${r(sleepErr)} · focus_gap ${r(focusErr)} · act on the larger |error| first`,
  };
}

export const SUCCESS_ENGINES: SuccessEngine[] = [
  {
    id: "sleep-recovery",
    name: "Sleep recovery",
    domain: "body",
    accelerates: "Recovery → cognition → output",
    modelId: "euler",
    metricHints: ["sleep.hours"],
    run: runSleepRecovery,
  },
  {
    id: "focus-compound",
    name: "Deep work compound",
    domain: "focus",
    accelerates: "Shipping leverage",
    modelId: "geometric",
    metricHints: ["screen.minutes", "custom.deep_focus"],
    run: runFocusCompound,
  },
  {
    id: "life-control",
    name: "Life control loop",
    domain: "systems",
    accelerates: "Stability under load",
    modelId: "pid",
    metricHints: ["sleep.hours"],
    run: runLifeControl,
  },
  {
    id: "optimize-week",
    name: "Optimize this week",
    domain: "systems",
    accelerates: "Scarce time allocation",
    modelId: "grad",
    metricHints: ["sleep.hours", "screen.minutes"],
    run: runOptimizeWeek,
  },
  {
    id: "trend-filter",
    name: "Trend filter",
    domain: "systems",
    accelerates: "Decisions without noise",
    modelId: "ma",
    metricHints: ["sleep.hours"],
    run: runTrendFilter,
  },
  {
    id: "skill-scurve",
    name: "Skill S-curve",
    domain: "skill",
    accelerates: "Know when to push vs reinvent",
    modelId: "logistic",
    metricHints: ["math.lessons_completed"],
    run: runSkillSCurve,
  },
  {
    id: "capital-path",
    name: "Capital path",
    domain: "money",
    accelerates: "Runway and optionality",
    modelId: "linear",
    metricHints: ["cash", "runway"],
    run: runCapitalPath,
  },
];

export function findSuccessEngine(id: string): SuccessEngine | null {
  const q = id.trim().toLowerCase();
  return (
    SUCCESS_ENGINES.find((e) => e.id === q) ||
    SUCCESS_ENGINES.find((e) => e.id.includes(q)) ||
    SUCCESS_ENGINES.find((e) => e.name.toLowerCase().includes(q)) ||
    null
  );
}

/** Full dump (debug only — not shown as Mel UI). */
export function formatSuccessRun(run: SuccessRun): string {
  return [
    `— ${run.title} —`,
    `Accelerates: ${run.accelerates}`,
    "",
    run.applied,
    "",
    `Rule: ${run.rule}`,
    "",
    run.trajectory,
    "",
    "Protocol (do this):",
    ...run.protocol.map((p, i) => `${i + 1}. ${p}`),
    "",
    `Summary: ${run.summary}`,
    run.metricsUsed.length
      ? `Metrics: ${run.metricsUsed.join(", ")}`
      : "Metrics: (seed defaults — log real series to sharpen)",
  ].join("\n");
}

/**
 * What Mel says out loud: decisions + protocol.
 * Math stays in the backend — you should not see ODE tourism.
 */
export function formatSuccessBrief(run: SuccessRun): string {
  return [
    run.title.replace(/\s*\([^)]*\)\s*/g, " ").trim(),
    run.applied,
    "",
    "Do this:",
    ...run.protocol.map((p, i) => `${i + 1}. ${p}`),
    "",
    run.summary,
  ].join("\n");
}

export function runSuccessEngine(idOrNext: string, opts?: { verbose?: boolean }): string {
  const key = idOrNext.trim().toLowerCase();
  const fmt = (run: SuccessRun) =>
    opts?.verbose ? formatSuccessRun(run) : formatSuccessBrief(run);

  if (!key || key === "list" || key === "help" || key === "engines") {
    return [
      "Priority engines (run quietly on your data):",
      ...SUCCESS_ENGINES.map(
        (e) => `• ${e.name} — ${e.accelerates}`
      ),
      "",
      "accelerate · optimize week · sleep recovery · focus · runway",
      "(Math is backend. You get the plan, not the textbook.)",
    ].join("\n");
  }

  if (key === "next" || key === "accelerate" || key === "go") {
    const sleep = sleepMetric();
    const avg = mean(lastPoints(sleep, 7));
    if (avg != null && avg < 7.4) {
      return fmt(runSleepRecovery());
    }
    return fmt(runOptimizeWeek());
  }

  const eng = findSuccessEngine(key);
  if (eng) return fmt(eng.run());

  if (/sleep|recover|debt/.test(key)) return fmt(runSleepRecovery());
  if (/focus|deep|compound|screen/.test(key)) return fmt(runFocusCompound());
  if (/money|capital|cash|runway/.test(key)) return fmt(runCapitalPath());
  if (/control|pid|loop/.test(key)) return fmt(runLifeControl());
  if (/trend|filter|ma\b|moving/.test(key)) return fmt(runTrendFilter());
  if (/skill|scurve|s-curve|logistic/.test(key)) return fmt(runSkillSCurve());
  if (/optim|week|grad/.test(key)) return fmt(runOptimizeWeek());

  return `Unknown “${key}”.\n\n${runSuccessEngine("list")}`;
}

export function trySuccessMathCommand(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;

  if (/^(?:accelerate|success\s+math|apply\s+math|engines?)$/i.test(t)) {
    return runSuccessEngine("list");
  }
  if (/^(?:apply\s+next|accelerate\s+now|what\s+should\s+i\s+optimize)$/i.test(t)) {
    return runSuccessEngine("next");
  }
  const m = t.match(/^apply\s+([a-z0-9][a-z0-9_-]*)$/i);
  if (m) return runSuccessEngine(m[1]!);

  if (/^apply\s+/i.test(t)) {
    return runSuccessEngine(t.replace(/^apply\s+/i, ""));
  }

  // "how do I use math to ..." soft intent
  if (
    /\b(?:use|apply)\b.*\bmath\b.*\b(?:success|sleep|focus|money|grow|accelerate)/i.test(
      t
    ) ||
    /\baccelerate\b.*\b(?:success|me|my)\b/i.test(t)
  ) {
    return runSuccessEngine("next");
  }

  return null;
}

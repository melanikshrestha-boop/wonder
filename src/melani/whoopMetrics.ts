/**
 * Single source of truth for Whoop lab metrics.
 * Popup (click name): What it is · How measured · Why · Big picture · Normal range (18–20).
 */
import type { WhoopDay } from "./whoopStore";

export type MetricGroup = "sleep" | "ready" | "body" | "train";

export type WhoopMetricKey =
  | "sleepScore"
  | "sleepHours"
  | "deep"
  | "rem"
  | "eff"
  | "cons"
  | "debt"
  | "recovery"
  | "hrv"
  | "rhr"
  | "strain"
  | "skin"
  | "spo2"
  | "resp"
  | "cal"
  | "woMin"
  | "woStrain";

export type MetricDef = {
  key: WhoopMetricKey;
  label: string;
  unit: string;
  group: MetricGroup;
  /**
   * On-page section title (e.g. “Body signals”). Metrics with the same
   * sectionTitle render under one header, in sectionOrder then registry order.
   */
  sectionTitle: string;
  sectionOrder: number;
  higherIsBetter: boolean | null;
  yRange?: { lo: number; hi: number };
  what: string;
  how: string;
  /**
   * Compact math for MathML typesetting (real fraction bars + subscripts).
   * Use `_` for subscripts, `/` for stacked fractions, `;` for a second line.
   * Do not put prose here — put that in formulaNote.
   */
  formula: string;
  /** Plain-language note under the typeset equation (symbols, proprietary caveats). */
  formulaNote?: string;
  why: string;
  bigPicture: string;
  normalRange: string;
  get?: (d: WhoopDay) => number | null | undefined;
  fromWorkouts?: "minutes" | "strain";
};

export const GROUP_META: Record<MetricGroup, { label: string; order: number }> = {
  sleep: { label: "Sleep", order: 0 },
  ready: { label: "Ready · load", order: 1 },
  body: { label: "Body signals", order: 2 },
  train: { label: "Training", order: 3 },
};

/** Bucket a flat metric list into titled sections (Body signals style). */
export function groupMetricsBySection<T extends { key: string }>(
  metrics: T[]
): { title: string; metrics: T[] }[] {
  const buckets = new Map<
    string,
    { title: string; order: number; metrics: T[] }
  >();
  for (const m of metrics) {
    const def = metricDef(m.key);
    const title = def?.sectionTitle ?? "Other";
    const order = def?.sectionOrder ?? 99;
    const cur = buckets.get(title) ?? { title, order, metrics: [] as T[] };
    cur.metrics.push(m);
    buckets.set(title, cur);
  }
  return [...buckets.values()]
    .sort((a, b) => a.order - b.order)
    .map(({ title, metrics: ms }) => ({ title, metrics: ms }));
}

export const WHOOP_METRICS: readonly MetricDef[] = [
  {
    key: "sleepScore",
    label: "Sleep performance",
    unit: "%",
    group: "sleep",
    sectionTitle: "Sleep",
    sectionOrder: 0,
    higherIsBetter: true,
    yRange: { lo: 0, hi: 100 },
    what: "How close last night got to the sleep you needed (0–100%). 100% means you roughly met need.",
    how: "WHOOP compares your sleep (hours + quality signals) against calculated sleep need, which rises with recent strain and prior debt.",
    // Two lines: clean sufficiency ratio, then the 0–100 score WHOOP shows
    formula:
      "sufficiency = sleep_hours / sleep_need; performance% = min(100, sufficiency × 100)",
    formulaNote:
      "Sleep sufficiency = hours of sleep ÷ sleep need · sleep_need rises with recent strain + prior debt (WHOOP weights proprietary)",
    why: "One nightly grade for whether you paid the recovery bill — easier than reading every stage alone.",
    bigPicture:
      "Chronic low scores with rising debt show up as fog, weaker training, worse mood, and slower recovery. Higher is better.",
    normalRange:
      "Aim repeatedly high (many nights near 85–100%). Occasional dips are normal; a week of low 70s is a problem.",
    get: (d) => d.sleepScore,
  },
  {
    key: "sleepHours",
    label: "Sleep hours",
    unit: "h",
    group: "sleep",
    sectionTitle: "Sleep",
    sectionOrder: 0,
    higherIsBetter: true,
    what: "Hours you were actually asleep — not time lying in bed awake.",
    how: "From sleep onset to wake, minus awake time, as scored by WHOOP’s overnight staging model.",
    formula:
      "sleep_hours = asleep_duration_min / 60; asleep = (wake_onset − sleep_onset) − awake_time",
    why: "Total sleep volume is still the main fuel tank for physical and cognitive recovery.",
    bigPicture:
      "Short nights after hard days usually show up as weaker next-morning recovery. You cannot out-train chronic under-sleep. Higher is better (up to your need — not endless).",
    normalRange:
      "Most 18–20 year olds need about 7–9 hours asleep. Your WHOOP need line matters more than a fixed internet average.",
    get: (d) => d.sleepHours,
  },
  {
    key: "deep",
    label: "Deep sleep",
    unit: "min",
    group: "sleep",
    sectionTitle: "Sleep",
    sectionOrder: 0,
    higherIsBetter: true,
    what: "The deepest stage of sleep. Body is repairing tissue, building muscle, strengthening immunity, and clearing waste from the brain.",
    how: "Estimated from heart rate, movement, and breathing patterns during sleep (same method as REM).",
    formula: "deep_min = Σ minutes_N3",
    formulaNote:
      "Stage labels from HR + motion + respiration model (not EEG) — not lab polysomnography",
    why: "It’s the main physical recovery stage of sleep. Low deep sleep = weaker recovery even if total sleep looks fine.",
    bigPicture:
      "Critical for physical restoration and feeling refreshed. Young people need more of it than older adults. Higher is better.",
    normalRange:
      "13–23% of total sleep. Roughly 70–120 minutes on a 7–8 hour night (18–20 years old).",
    get: (d) => d.sleep?.deepMin,
  },
  {
    key: "rem",
    label: "REM",
    unit: "min",
    group: "sleep",
    sectionTitle: "Sleep",
    sectionOrder: 0,
    higherIsBetter: true,
    what: "Sleep stage with rapid eye movements, highly active brain, locked-down body, and most vivid dreams.",
    how: "WHOOP estimates it from heart rate patterns, movement, and breathing changes during sleep (not direct brain waves).",
    formula: "rem_min = Σ minutes_REM",
    formulaNote:
      "Stage labels from HR + motion + respiration model (not EEG) — not lab polysomnography",
    why: "Shows how well your brain is consolidating memories, processing emotions, and recovering mentally overnight.",
    bigPicture:
      "Low or disrupted REM over time hits learning, mood stability, and long-term brain health. Higher is better.",
    normalRange:
      "20–25% of total sleep time (~90–120 minutes if you sleep 7–8 hours) for ages 18–20.",
    get: (d) => d.sleep?.remMin,
  },
  {
    key: "eff",
    label: "Sleep efficiency",
    unit: "%",
    group: "sleep",
    sectionTitle: "Sleep",
    sectionOrder: 0,
    higherIsBetter: true,
    yRange: { lo: 0, hi: 100 },
    what: "Asleep time ÷ time in bed. High means you weren’t awake a lot; low means long wake-ups or slow sleep onset.",
    how: "WHOOP uses asleep duration vs in-bed duration for the night.",
    formula:
      "efficiency% = asleep_min / time_in_bed_min × 100; time_in_bed = wake_onset − sleep_onset",
    why: "Separates “enough hours in bed” from “actually slept cleanly.”",
    bigPicture:
      "Low efficiency points to wind-down, stress, caffeine, light, or timing problems — not just “try harder to sleep.” Higher is better.",
    normalRange:
      "High 80s–90s% is common for solid sleepers. Perfect 100% every night is not required.",
    get: (d) => d.sleep?.efficiencyPct,
  },
  {
    key: "cons",
    label: "Sleep consistency",
    unit: "%",
    group: "sleep",
    sectionTitle: "Sleep",
    sectionOrder: 0,
    higherIsBetter: true,
    yRange: { lo: 0, hi: 100 },
    what: "How regular your bedtime and wake time stay day to day.",
    how: "WHOOP scores how similar recent sleep schedules are to each other.",
    formula: "consistency% = f(bedtime_i, wake_i)",
    formulaNote:
      "Higher when bedtime and wake stay near your recent schedule (WHOOP similarity function proprietary)",
    why: "A stable schedule anchors circadian rhythm and next-day energy.",
    bigPicture:
      "Same schedule beats chaotic 9h / 5h swings. Late weekends can tank Monday recovery even after a long Saturday sleep. Higher is better.",
    normalRange:
      "Higher is better. Aim for a stable bedtime/wake window most days of the week.",
    get: (d) => d.sleep?.consistencyPct,
  },
  {
    key: "debt",
    label: "Sleep debt",
    unit: "min",
    group: "sleep",
    sectionTitle: "Sleep",
    sectionOrder: 0,
    higherIsBetter: false,
    what: "Minutes of sleep you still “owe” from nights short of need.",
    how: "Carried from prior nights vs WHOOP’s running sleep-need model.",
    formula: "debt_min ≈ max(0, prior_debt + sleep_need − asleep)",
    formulaNote: "Repaid when asleep exceeds need on following nights",
    why: "Shows whether you’re running a rolling deficit, not only judging one night.",
    bigPicture:
      "Occasional debt is normal if you repay it. Chronic stacking is the slow leak under fog and weak training. Closer to zero is better.",
    normalRange:
      "Near zero most weeks. Pay it down with longer/cleaner nights rather than one heroic sleep-in.",
    get: (d) => d.sleep?.debtMin,
  },
  {
    key: "recovery",
    label: "Recovery",
    unit: "%",
    group: "train",
    sectionTitle: "Ready · load",
    sectionOrder: 0, // Gym — readiness vs load
    higherIsBetter: true,
    yRange: { lo: 0, hi: 100 },
    what: "Daily score (0–100%) showing how ready your body is to take on stress.",
    how: "Calculated mainly from overnight HRV, resting heart rate, respiratory rate, and sleep performance.",
    formula: "recovery% = f(HRV_z, RHR_z, sleep_performance, RR_z)",
    formulaNote: "0–100 composite; exact weights proprietary to WHOOP",
    why: "Tells you whether you should push hard, go moderate, or rest that day.",
    bigPicture:
      "The single most useful daily decision tool. High recovery = good day to train hard. Low recovery = protect yourself from overtraining. Higher is better.",
    normalRange:
      "Green: 67–100% (primed). Yellow: 34–66% (moderate). Red: 0–33% (needs rest). Average sits around 55–60%.",
    get: (d) => d.recoveryPct,
  },
  {
    key: "hrv",
    label: "HRV",
    unit: "ms",
    group: "sleep",
    sectionTitle: "Overnight",
    sectionOrder: 1, // overnight recovery signal — lives with Sleep
    higherIsBetter: true,
    what: "The variation in time between consecutive heartbeats (most commonly reported as RMSSD in milliseconds).",
    how: "Optical heart rate sensor tracks exact time gaps between heartbeats while you sleep, then calculates the variation.",
    formula: "RMSSD = √(1/(N−1) · Σ_(i=1)^(N−1) (RR_(i+1) − RR_i)^2)",
    formulaNote: "Milliseconds · RR_i = successive inter-beat intervals overnight",
    why: "Directly reflects the balance of your autonomic nervous system — how recovered vs stressed your body currently is.",
    bigPicture:
      "Higher HRV = more resilient, better recovered, lower chronic stress load. Trends over days matter far more than any single number. Higher is better.",
    normalRange:
      "Typical healthy range: ~45–100+ ms. Median/average sits around 50–75 ms for ages 18–20. (Higher is generally better.)",
    get: (d) => d.hrvMs,
  },
  {
    key: "rhr",
    label: "Resting HR",
    unit: "bpm",
    group: "sleep",
    sectionTitle: "Overnight",
    sectionOrder: 1, // lowest overnight rate — lives with Sleep
    higherIsBetter: false,
    what: "Your heart rate when fully at rest (usually the lowest sustained rate during sleep).",
    how: "Optical sensor continuously tracks heart rate overnight and pulls the lowest stable value.",
    formula: "RHR = min(HR_overnight)",
    formulaNote: "bpm · typically the lowest sustained rate in the sleep window",
    why: "Lower resting heart rate generally means a stronger, more efficient heart and better fitness/recovery status.",
    bigPicture:
      "A rising RHR over days is often an early warning of illness, overtraining, or high stress — frequently before you feel it. Lower is better.",
    normalRange:
      "Average healthy: 60–75 bpm. Fit / athletic: 45–60 bpm. (Lower is better.)",
    get: (d) => d.rhrBpm,
  },
  {
    key: "strain",
    label: "Day strain",
    unit: "",
    group: "train",
    sectionTitle: "Ready · load",
    sectionOrder: 0, // Gym — daily load next to workouts
    higherIsBetter: null,
    yRange: { lo: 0, hi: 21 },
    what: "Score (0–21) of total cardiovascular load your body took that day from all activity + daily life.",
    how: "Tracks how long and how high your heart rate stays elevated relative to your personal max throughout the day.",
    formula: "day_strain ≈ g(cardiovascular_load)",
    formulaNote:
      "Scale 0–21 · load rises with HR elevation vs personal max and duration; logarithmic map (Borg-inspired), coefficients proprietary",
    why: "Shows how much stress you actually put on your system so you can balance it against recovery.",
    bigPicture:
      "Matching strain to recovery is how you make long-term progress without crashing. Not simply higher or lower — match the number to recovery (high strain only when recovery can absorb it).",
    normalRange:
      "Light: 0–9. Moderate: 10–13. High: 14–17. All-out: 18–21.",
    get: (d) => d.strain,
  },
  {
    key: "skin",
    label: "Skin temp",
    unit: "°C",
    group: "body",
    sectionTitle: "Body signals",
    sectionOrder: 2, // Body signals block on Sleep tab
    higherIsBetter: null,
    what: "Temperature of your skin at the wrist while you sleep.",
    how: "A temperature sensor on the WHOOP band sits against your skin and records it overnight. WHOOP compares it to your personal baseline from the previous ~90 nights.",
    formula: "ΔT = T_skin − T_baseline",
    formulaNote:
      "T_baseline ≈ mean skin temp over prior ~90 nights · absolute T_skin from band thermistor (°C)",
    why: "A rise above your normal baseline is often one of the earliest signs of illness, inflammation, or recovery stress — sometimes before you feel sick.",
    bigPicture:
      "It’s a sensitive early-warning signal. Sustained elevation above your baseline is more important than the absolute number itself. Closer to your personal baseline is better (not higher or lower for its own sake).",
    normalRange:
      "Absolute wrist skin temp usually sits around 32–35°C. What matters most is staying close to your personal average. +0.3°C or more above baseline for multiple nights is worth paying attention to.",
    get: (d) => d.cycle?.skinTempC,
  },
  {
    key: "spo2",
    label: "Blood oxygen",
    unit: "%",
    group: "body",
    sectionTitle: "Body signals",
    sectionOrder: 2,
    higherIsBetter: true,
    yRange: { lo: 0, hi: 100 },
    what: "Percentage of oxygen your red blood cells are carrying.",
    how: "WHOOP shines red and infrared light into your wrist and measures how much light is absorbed (same principle as a finger pulse oximeter).",
    formula: "SpO2% ≈ h(A_red / A_IR)",
    formulaNote:
      "A = pulsatile light absorption at red vs infrared wavelengths (pulse-oximetry ratio method)",
    why: "Shows how well your body is getting oxygen while you sleep. Drops can signal breathing issues, illness, altitude effects, or recovery problems.",
    bigPicture:
      "Healthy people stay high and stable. Consistent readings under 95% (especially if dropping) are a red flag worth monitoring. Higher is better.",
    normalRange:
      "95–100% is ideal. 94% or lower for multiple nights is considered low and should be watched.",
    get: (d) => d.cycle?.spo2Pct,
  },
  {
    key: "resp",
    label: "Respiratory rate",
    unit: "rpm",
    group: "body",
    sectionTitle: "Body signals",
    sectionOrder: 2,
    higherIsBetter: false,
    what: "Breaths per minute while you sleep.",
    how: "Derived from subtle patterns in your heart rate and movement data overnight.",
    formula: "respiratory_rate ≈ breath_cycles / minutes",
    formulaNote:
      "Breaths per minute · cycles inferred from HR / motion oscillations during sleep",
    why: "Extremely stable in healthy people. Even a small consistent rise is a strong early signal of illness, inflammation, or poor recovery.",
    bigPicture:
      "One of the most reliable “something is off” metrics. A jump of 1–2 breaths above your personal baseline often appears before symptoms. Closer to your stable personal baseline is better; rising above it is the warning (not “lower is always better” on its own).",
    normalRange:
      "12–20 breaths per minute. Most healthy people sit around 13–16 while sleeping. Stability relative to your average matters more than the exact number.",
    get: (d) => d.respiratoryRate,
  },
  {
    key: "cal",
    label: "Energy burned",
    unit: "cal",
    group: "train",
    sectionTitle: "Training",
    sectionOrder: 1,
    higherIsBetter: null,
    what: "Total calories your body used over the period (basal metabolism + activity).",
    how: "WHOOP first calculates your Basal Metabolic Rate from age, sex, height, and weight. It then adds active calories using continuous heart rate data with a proprietary heart-rate-to-calorie model.",
    formula: "total_cal ≈ BMR + active_cal",
    formulaNote:
      "BMR ≈ Mifflin–St Jeor from age, sex, height, weight · active_cal from continuous HR model (coefficients proprietary)",
    why: "Shows relative fuel demand day to day — whether hard days need more food, not exact meal math to the calorie.",
    bigPicture:
      "A very low day is often almost pure resting burn. Don’t under-eat high-strain days based on a single estimate. Neither higher nor lower is “best” — it’s a load/fuel signal to match with food and recovery.",
    normalRange:
      "Highly individual. Daily total for moderately active people usually lands 1800–2800+ cal. A day near pure resting burn is far below a normal active total.",
    get: (d) => d.cycle?.energyCal,
  },
  {
    key: "woMin",
    label: "Workout minutes",
    unit: "min",
    group: "train",
    sectionTitle: "Training",
    sectionOrder: 1,
    higherIsBetter: null,
    what: "Total time spent in detected or logged workouts.",
    how: "Simply the sum of the duration of every workout WHOOP recorded (automatic detection + any manual entries).",
    formula: "workout_minutes = Σ_sessions duration_min",
    why: "Tracks training volume — how long you actually moved in sessions.",
    bigPicture:
      "No fixed “should.” Read with workout strain: long easy minutes ≠ hard intensity. Consistency beats random hero days that trash the next morning. Neither higher nor lower is always better — volume only counts relative to recovery and goals.",
    normalRange:
      "No fixed “normal.” Depends entirely on your training volume. A solid single session is often ~45–75 min; multi-day totals only mean something against your own plan.",
    fromWorkouts: "minutes",
  },
  {
    key: "woStrain",
    label: "Workout strain",
    unit: "",
    group: "train",
    sectionTitle: "Training",
    sectionOrder: 1,
    higherIsBetter: null,
    // No fixed 0–21 axis: this series is Σ session strain per day, so days
    // with multiple workouts routinely exceed 21 (session max is 0–21 each).
    what: "The strain score accumulated only during workouts (subset of total Day Strain). Scale is still 0–21 per session, but the number shown here is the sum across multiple workouts.",
    how: "Same method as regular Strain: how high and how long your heart rate stays elevated relative to your personal max heart rate, but only counted during the workout windows.",
    formula: "workout_strain = Σ_sessions strain_session",
    formulaNote:
      "Each session uses the same cardiovascular-load model as day strain, only inside workout windows",
    why: "Separates “I was busy” from “I actually stressed the system in sessions.”",
    bigPicture:
      "High workout strain on already-low recovery usually shows up as a rough next morning. Stacking several all-out sessions is how you dig a hole. Not simply higher or lower — hard sessions when recovery allows; easy when it doesn’t.",
    normalRange:
      "Per workout: Light 0–9 · Moderate 10–13 · High 14–17 · All-out 18–21. A single session near 20 is all-out; a large period total means you stacked several hard sessions.",
    fromWorkouts: "strain",
  },
] as const;

export const METRIC_BY_KEY: Record<WhoopMetricKey, MetricDef> = Object.fromEntries(
  WHOOP_METRICS.map((m) => [m.key, m])
) as Record<WhoopMetricKey, MetricDef>;

export function metricDef(key: string): MetricDef | undefined {
  return METRIC_BY_KEY[key as WhoopMetricKey];
}

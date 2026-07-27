/**
 * Operating Brain — Level 4 compound intelligence.
 *
 * Not vibes. Multi-day matrix of sleep · fog · water · protein · Whoop recovery/HRV
 * · spend, plus ranked moves with evidence and confidence.
 * Fed into Mel’s live context every message so she is actually smart.
 *
 * No diagnosis. No financial advice. Empire-grade judgment from her logs only.
 */
import { MACRO_GOALS, PROFILE, todayKey } from "./data";
import { loadFinance, money as fmtMoney } from "./financeStore";
import { isTransferLike } from "./financeTransfers";
import { loadFogMap, loadSleepDay } from "./sleepStore";
import { loadWhoopStore } from "./whoopStore";
import { buildIntelligenceDigest } from "./intelligenceL3";
import { gatherTwinInputs } from "./twin/gather";
import { writeTwin } from "./twin/index";

/** Local goals read (avoid importing melContext → circular with live snapshot). */
type BrainGoals = {
  protein_g: number;
  water_ml: number;
  sleep_hours: number;
};

function loadBrainGoals(): BrainGoals {
  try {
    const raw = localStorage.getItem("dr-melani-goals-v1");
    const g = raw ? (JSON.parse(raw) as Partial<BrainGoals>) : {};
    return {
      protein_g: Number(g.protein_g) || MACRO_GOALS.protein_g,
      water_ml: Number(g.water_ml) || PROFILE.waterGoalMl,
      sleep_hours: Number(g.sleep_hours) || 8,
    };
  } catch {
    return {
      protein_g: MACRO_GOALS.protein_g,
      water_ml: PROFILE.waterGoalMl,
      sleep_hours: 8,
    };
  }
}

export type BrainDay = {
  day: string;
  sleepH: number | null;
  fog: boolean | null; // null = not logged
  waterMl: number;
  proteinG: number;
  recoveryPct: number | null;
  hrvMs: number | null;
  rhrBpm: number | null;
  strain: number | null;
  spend: number; // abs outflow that day
};

export type BrainInsight = {
  id: string;
  severity: "info" | "watch" | "act";
  confidence: "low" | "med" | "high";
  title: string;
  evidence: string;
  move: string;
};

export type OperatingBrain = {
  builtAt: string;
  day: string;
  windowDays: number;
  daysLogged: number;
  matrix: BrainDay[];
  insights: BrainInsight[];
  /** Single highest-ROI move right now */
  topMove: string;
  /** Compact pack for Mel system context */
  packText: string;
  /** Founder readiness one-liner */
  buildReadiness: string;
};

function addDays(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function lastNDays(n: number, end: string = todayKey()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDays(end, -i));
  return out;
}

function waterMl(day: string): number {
  try {
    return Math.max(0, Number(localStorage.getItem(`dr-melani-water-ml:${day}`)) || 0);
  } catch {
    return 0;
  }
}

function mealProtein(day: string): number {
  try {
    const raw = localStorage.getItem(`dr-melani-meals-usuals:${day}`);
    if (!raw) return 0;
    const j = JSON.parse(raw) as { totals?: { protein_g?: number } };
    return Math.max(0, Number(j.totals?.protein_g) || 0);
  } catch {
    return 0;
  }
}

/** One pass over the ledger — was O(days × txs) and made Mel/status slug-slow. */
function spendByDayMap(days: string[]): Map<string, number> {
  const want = new Set(days);
  const map = new Map<string, number>();
  for (const d of days) map.set(d, 0);
  try {
    const state = loadFinance();
    for (const t of state.txs || []) {
      if (t.kind !== "expense") continue;
      if (isTransferLike(t)) continue;
      const day = (t.date || "").slice(0, 10);
      if (!want.has(day)) continue;
      map.set(day, (map.get(day) || 0) + Math.abs(Number(t.amount) || 0));
    }
  } catch {
    /* ignore */
  }
  for (const [k, v] of map) map.set(k, Math.round(v * 100) / 100);
  return map;
}

function buildMatrix(n = 14, end: string = todayKey()): BrainDay[] {
  const fog = loadFogMap();
  const whoop = loadWhoopStore();
  const days = lastNDays(n, end);
  const spendMap = spendByDayMap(days);
  return days.map((day) => {
    const sleep = loadSleepDay(day);
    const w = whoop.days[day];
    const fogLogged = Object.prototype.hasOwnProperty.call(fog, day)
      ? fog[day] === true
        ? true
        : fog[day] === false
          ? false
          : Boolean(fog[day])
      : null;
    return {
      day,
      sleepH: sleep.hours,
      fog: fogLogged,
      waterMl: waterMl(day),
      proteinG: mealProtein(day),
      recoveryPct: w?.recoveryPct ?? null,
      hrvMs: w?.hrvMs ?? null,
      rhrBpm: w?.rhrBpm ?? null,
      strain: w?.strain ?? w?.cycle?.dayStrain ?? null,
      spend: spendMap.get(day) || 0,
    };
  });
}

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

function conf(n: number): "low" | "med" | "high" {
  if (n >= 8) return "high";
  if (n >= 4) return "med";
  return "low";
}

function buildInsights(matrix: BrainDay[], goals: BrainGoals): BrainInsight[] {
  const insights: BrainInsight[] = [];
  const withSleep = matrix.filter((d) => d.sleepH != null && d.sleepH > 0);
  const withFog = matrix.filter((d) => d.fog === true || d.fog === false);
  const today = matrix[matrix.length - 1];

  // ── Fog × short sleep ─────────────────────────────────────────────
  const fogDays = withFog.filter((d) => d.fog === true);
  const clearDays = withFog.filter((d) => d.fog === false);
  const short = (h: number | null) => h != null && h > 0 && h < 7;
  const fogOnShort = fogDays.filter((d) => short(d.sleepH)).length;
  const fogOnOk = fogDays.filter((d) => d.sleepH != null && d.sleepH >= 7).length;
  const shortNights = withSleep.filter((d) => short(d.sleepH)).length;

  if (withFog.length >= 3 && shortNights >= 2) {
    const rateShort =
      shortNights > 0
        ? fogDays.filter((d) => short(d.sleepH)).length /
          Math.max(1, withSleep.filter((d) => short(d.sleepH)).length)
        : 0;
    const okNights = withSleep.filter((d) => d.sleepH != null && d.sleepH >= 7);
    const rateOk =
      okNights.length > 0
        ? fogDays.filter((d) => d.sleepH != null && d.sleepH >= 7).length /
          okNights.length
        : 0;
    if (rateShort > rateOk + 0.15 || fogOnShort >= 2) {
      insights.push({
        id: "fog-sleep",
        severity: "act",
        confidence: conf(withFog.length),
        title: "Brain fog tracks short sleep",
        evidence: `Last ${matrix.length}d: fog on ${fogOnShort} short nights (<7h) vs ${fogOnOk} nights ≥7h. Short-night fog rate ~${Math.round(rateShort * 100)}% vs ~${Math.round(rateOk * 100)}% when sleep is OK.`,
        move: "Protect 7.5h+ tonight. Wind-down 45 min earlier. Log fog tomorrow morning so the pattern stays honest.",
      });
    }
  }

  // ── Water lag → next-day fog ───────────────────────────────────────
  let lagHits = 0;
  let lagBase = 0;
  for (let i = 1; i < matrix.length; i++) {
    const prev = matrix[i - 1];
    const cur = matrix[i];
    if (cur.fog == null) continue;
    if (prev.waterMl < goals.water_ml * 0.55) {
      lagBase += 1;
      if (cur.fog === true) lagHits += 1;
    }
  }
  if (lagBase >= 3 && lagHits / lagBase >= 0.5) {
    insights.push({
      id: "water-lag-fog",
      severity: "watch",
      confidence: conf(lagBase),
      title: "Low water days precede fog",
      evidence: `On ${lagHits}/${lagBase} days after weak hydration (<${Math.round(goals.water_ml * 0.55)} ml), fog was Yes next day.`,
      move: `Hit ${goals.water_ml} ml today before evening. Front-load 1L by noon.`,
    });
  }

  // ── Whoop recovery × fog ───────────────────────────────────────────
  const fogRec = fogDays
    .map((d) => d.recoveryPct)
    .filter((x): x is number => x != null && Number.isFinite(x));
  const clearRec = clearDays
    .map((d) => d.recoveryPct)
    .filter((x): x is number => x != null && Number.isFinite(x));
  const avgFogRec = avg(fogRec);
  const avgClearRec = avg(clearRec);
  if (avgFogRec != null && avgClearRec != null && fogRec.length >= 2 && clearRec.length >= 2) {
    if (avgFogRec < avgClearRec - 5) {
      insights.push({
        id: "recovery-fog",
        severity: "watch",
        confidence: conf(fogRec.length + clearRec.length),
        title: "Fog days = lower recovery",
        evidence: `Whoop recovery avg ${avgFogRec}% on fog days vs ${avgClearRec}% on clear days (n=${fogRec.length}+${clearRec.length}).`,
        move: "Treat fog Yes as a recovery signal: lighter training, earlier bed, no stacked strain.",
      });
    }
  }

  // ── HRV trend ──────────────────────────────────────────────────────
  const hrvSeries = matrix
    .map((d) => d.hrvMs)
    .filter((x): x is number => x != null && x > 0);
  if (hrvSeries.length >= 5) {
    const first = avg(hrvSeries.slice(0, Math.ceil(hrvSeries.length / 2)));
    const second = avg(hrvSeries.slice(Math.floor(hrvSeries.length / 2)));
    if (first != null && second != null && second < first * 0.9) {
      insights.push({
        id: "hrv-down",
        severity: "watch",
        confidence: conf(hrvSeries.length),
        title: "HRV trending down",
        evidence: `HRV first half ~${first} ms → second half ~${second} ms over ${hrvSeries.length} logged days.`,
        move: "Deload volume 1–2 sessions, prioritize sleep debt paydown, keep caffeine before noon.",
      });
    }
  }

  // ── Protein consistency ────────────────────────────────────────────
  const mealDays = matrix.filter((d) => d.proteinG > 0);
  const proteinAvg = avg(mealDays.map((d) => d.proteinG));
  if (mealDays.length >= 3 && proteinAvg != null && proteinAvg < goals.protein_g * 0.75) {
    insights.push({
      id: "protein-gap",
      severity: "act",
      confidence: conf(mealDays.length),
      title: "Protein below build goal",
      evidence: `Avg ${proteinAvg}g protein on ${mealDays.length} meal-log days vs goal ${goals.protein_g}g.`,
      move: "Lock breakfast usual first thing. Close the day with a measured high-protein dinner.",
    });
  }

  // ── Sleep debt ─────────────────────────────────────────────────────
  const sleepGoal = goals.sleep_hours || 8;
  let debt = 0;
  for (const d of withSleep) {
    if (d.sleepH != null) debt += Math.max(0, sleepGoal - d.sleepH);
  }
  debt = Math.round(debt * 10) / 10;
  if (debt >= 4) {
    insights.push({
      id: "sleep-debt",
      severity: "act",
      confidence: conf(withSleep.length),
      title: "Sleep debt stacked",
      evidence: `~${debt}h cumulative shortfall vs ${sleepGoal}h goal over ${withSleep.length} logged nights.`,
      move: "Tonight: bed 45 min earlier. No hero late work session. Protect recovery as product infrastructure.",
    });
  }

  // ── Tired spend ────────────────────────────────────────────────────
  const shortSpendDays = matrix.filter(
    (d) => short(d.sleepH) && d.spend >= 25
  );
  const okSpend = matrix.filter(
    (d) => d.sleepH != null && d.sleepH >= 7 && d.spend > 0
  );
  const avgShortSpend = avg(shortSpendDays.map((d) => d.spend));
  const avgOkSpend = avg(okSpend.map((d) => d.spend));
  if (
    shortSpendDays.length >= 2 &&
    avgShortSpend != null &&
    avgOkSpend != null &&
    avgShortSpend > avgOkSpend * 1.2
  ) {
    insights.push({
      id: "tired-spend",
      severity: "watch",
      confidence: conf(shortSpendDays.length + okSpend.length),
      title: "Spend rises after short sleep",
      evidence: `Avg spend on short-sleep days ${fmtMoney(avgShortSpend)} vs ${fmtMoney(avgOkSpend)} on ≥7h nights.`,
      move: "Cap delivery/impulse after late nights. Pre-commit dinner before 6pm when debt is high.",
    });
  }

  // ── Today open loops ───────────────────────────────────────────────
  if (today) {
    if (today.waterMl < goals.water_ml * 0.45) {
      insights.push({
        id: "today-water",
        severity: "act",
        confidence: "high",
        title: "Water critically behind today",
        evidence: `Today ${today.waterMl} ml / ${goals.water_ml} ml goal.`,
        move: `Drink ${Math.min(750, goals.water_ml - today.waterMl)} ml in the next hour.`,
      });
    }
    if (today.fog == null) {
      insights.push({
        id: "today-fog",
        severity: "info",
        confidence: "high",
        title: "Brain fog not logged today",
        evidence: "Sleep → BRAIN FOG Yes/No is empty for today.",
        move: "Tap Yes or No once. Lifetime pie only gets smart with honest daily labels.",
      });
    }
    if (today.sleepH == null) {
      insights.push({
        id: "today-sleep",
        severity: "info",
        confidence: "high",
        title: "Sleep hours missing today",
        evidence: "No bed/wake hours resolved for today (Whoop or manual).",
        move: "Import Whoop CSV or set bed/wake so debt math stays real.",
      });
    }
  }

  // Severity then confidence
  const rank = { act: 0, watch: 1, info: 2 };
  const cRank = { high: 0, med: 1, low: 2 };
  insights.sort(
    (a, b) =>
      rank[a.severity] - rank[b.severity] || cRank[a.confidence] - cRank[b.confidence]
  );
  return insights.slice(0, 8);
}

function buildReadinessLine(day: string): string {
  try {
    const twin = writeTwin(day);
    const s = twin.scores;
    const band =
      s.overall >= 75 ? "high" : s.overall >= 55 ? "medium" : "protected";
    return `Build readiness ${s.overall}/100 (${band}) · energy ${s.energy} · recovery ${s.recovery} · fuel ${s.fuel} · stress ${s.stress}. Lever: ${twin.lever.title}.`;
  } catch {
    return "Build readiness unavailable (twin inputs incomplete).";
  }
}

function renderPack(brain: Omit<OperatingBrain, "packText">): string {
  const lines: string[] = [
    "OPERATING BRAIN (computed from her logs — prefer over model guesses)",
    `Window: last ${brain.windowDays} days ending ${brain.day} · days with any signal: ${brain.daysLogged}`,
    `Build: ${brain.buildReadiness}`,
    `TOP MOVE: ${brain.topMove}`,
    "",
    "INSIGHTS (severity · confidence · evidence → move)",
  ];
  if (!brain.insights.length) {
    lines.push(
      "(sparse data — log sleep, fog Yes/No, water, and meals so correlations can fire)"
    );
  } else {
    for (const ins of brain.insights) {
      lines.push(
        `[${ins.severity}/${ins.confidence}] ${ins.title}`,
        `  evidence: ${ins.evidence}`,
        `  move: ${ins.move}`
      );
    }
  }

  // Compact recent matrix (last 7)
  const tail = brain.matrix.slice(-7);
  lines.push("");
  lines.push("7d MATRIX day | sleep | fog | water | pro | rec% | hrv | spend");
  for (const d of tail) {
    lines.push(
      [
        d.day.slice(5),
        d.sleepH == null ? "—" : `${d.sleepH}h`,
        d.fog == null ? "?" : d.fog ? "Y" : "N",
        `${d.waterMl}`,
        `${Math.round(d.proteinG)}g`,
        d.recoveryPct == null ? "—" : `${Math.round(d.recoveryPct)}`,
        d.hrvMs == null ? "—" : `${Math.round(d.hrvMs)}`,
        d.spend > 0 ? fmtMoney(d.spend) : "—",
      ].join(" | ")
    );
  }

  // L3 one-liner
  try {
    const l3 = buildIntelligenceDigest(brain.day);
    lines.push("");
    lines.push(`L3 WEEKLY PRIORITY: ${l3.priority}`);
    if (l3.crossLinks[0]) {
      lines.push(`L3 top link: ${l3.crossLinks[0].text}`);
    }
  } catch {
    /* ignore */
  }

  lines.push("");
  lines.push(
    "OPERATOR RULES FOR MEL:",
    `- You are Mel, ${PROFILE.name}'s private OS operator. Founder path: computer/software engineering + company building. NOT medical school. NOT a clinic cosplay.`,
    "- Lead with TOP MOVE when she asks what to do / status / how am I / what matters.",
    "- Cite OPERATING BRAIN evidence, not vibes. Never invent sleep, HRV, fog, or spend.",
    "- Soft health education only. Never diagnose. Never claim financial advice.",
    "- Be sharp, concrete, short. No em dashes. No command menus unless asked."
  );

  return lines.join("\n");
}

/** Full operating brain snapshot (local, free, deterministic). */
export function buildOperatingBrain(
  endDay: string = todayKey(),
  windowDays = 14
): OperatingBrain {
  const goals = loadBrainGoals();
  const matrix = buildMatrix(windowDays, endDay);
  const insights = buildInsights(matrix, goals);
  const daysLogged = matrix.filter(
    (d) =>
      d.sleepH != null ||
      d.fog != null ||
      d.waterMl > 0 ||
      d.proteinG > 0 ||
      d.recoveryPct != null
  ).length;

  let topMove =
    insights.find((i) => i.severity === "act")?.move ||
    insights[0]?.move ||
    "Keep logging sleep, fog, water, and protein so the brain has density.";

  // Twin lever can override if stronger today
  try {
    const twin = writeTwin(endDay);
    const inputs = gatherTwinInputs(endDay);
    if (
      twin.lever.title &&
      (inputs.consecutiveShortNights >= 2 ||
        inputs.sleepDebt7d >= 4 ||
        inputs.water_ml < twin.waterGoal * 0.5)
    ) {
      topMove = `${twin.lever.title} — ${twin.lever.detail}`;
    }
  } catch {
    /* ignore */
  }

  const partial = {
    builtAt: new Date().toISOString(),
    day: endDay,
    windowDays,
    daysLogged,
    matrix,
    insights,
    topMove,
    buildReadiness: buildReadinessLine(endDay),
  };

  return {
    ...partial,
    packText: renderPack(partial),
  };
}

/** Short UI / offline Mel reply when she asks status / what matters. */
export function operatingBrainStatusReply(endDay: string = todayKey()): string {
  const b = buildOperatingBrain(endDay);
  const lines = [
    `Operating brain · ${b.day}`,
    ``,
    b.buildReadiness,
    ``,
    `Top move`,
    b.topMove,
    ``,
  ];
  if (b.insights.length) {
    lines.push(`Why (from your logs)`);
    for (const ins of b.insights.slice(0, 3)) {
      lines.push(`· ${ins.title} [${ins.confidence}]`);
      lines.push(`  ${ins.evidence}`);
    }
  } else {
    lines.push(`Sparse signal — log sleep, fog Yes/No, water, meals.`);
  }
  return lines.join("\n");
}

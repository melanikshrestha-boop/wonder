/**
 * RL for deep sleep — learn which nightly “policy” raised deep sleep in *your* data.
 *
 * State  (from night t): deep bucket × sleep-hours bucket × day-strain bucket
 * Action (what you effectively did into night t+1):
 *   - sleep_more   : sleep hours ≥ personal median
 *   - sleep_less   : sleep hours < personal median
 *   - low_strain   : day strain before that sleep ≤ median
 *   - high_strain  : day strain > median
 *   (actions are *observed* labels from history — offline inverse RL-style tagging)
 *
 * Reward: next night’s deep minutes, z-scored against your mean (so 0 = typical)
 *
 * Algorithm: tabular Q-learning (see rlCore.ts), batch replay on your WHOOP nights.
 */
import type { WhoopStore } from "./whoopStore";
import { loadWhoopStore } from "./whoopStore";
import {
  argmaxAction,
  empiricalActionStats,
  qKey,
  trainQ,
  type Transition,
} from "./rlCore";

export type RlDeepSleepAdvice = {
  /** Best action under current state */
  action: string;
  actionLabel: string;
  /** Why, in plain English */
  tip: string;
  /** Q-value of recommended action */
  q: number;
  /** How many history transitions trained on */
  nTransitions: number;
  /** Current discretized state */
  state: string;
  stateLabel: string;
  /** Top actions ranked by Q */
  ranking: { action: string; label: string; q: number; meanReward: number; n: number }[];
  /** Algorithm tag for the UI */
  algorithm: "Q-learning";
};

const ACTIONS = ["sleep_more", "sleep_less", "low_strain", "high_strain"] as const;
type Action = (typeof ACTIONS)[number];

const ACTION_LABEL: Record<Action, string> = {
  sleep_more: "Sleep longer tonight",
  sleep_less: "Shorter sleep (history says this hurt)",
  low_strain: "Keep day strain low",
  high_strain: "High strain day (history)",
};

function bucket3(v: number, lo: number, hi: number): "L" | "M" | "H" {
  if (v < lo) return "L";
  if (v > hi) return "H";
  return "M";
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

type Night = {
  day: string;
  deep: number;
  sleepH: number;
  strain: number;
};

function nightsFromStore(store: WhoopStore): Night[] {
  const days = Object.values(store.days).sort((a, b) => a.day.localeCompare(b.day));
  const out: Night[] = [];
  for (const d of days) {
    const deep = d.sleep?.deepMin;
    if (deep == null || !Number.isFinite(deep)) continue;
    const sleepH =
      d.sleepHours ??
      (d.sleep?.asleepMin != null ? d.sleep.asleepMin / 60 : null);
    if (sleepH == null || !Number.isFinite(sleepH)) continue;
    const strain = d.strain ?? d.cycle?.dayStrain ?? 0;
    out.push({
      day: d.day,
      deep,
      sleepH,
      strain: Number.isFinite(strain) ? strain : 0,
    });
  }
  return out;
}

function makeState(
  n: Night,
  deepCuts: [number, number],
  sleepMed: number,
  strainMed: number
): string {
  const dB = bucket3(n.deep, deepCuts[0], deepCuts[1]);
  const sB = n.sleepH >= sleepMed ? "Sok" : "Sshort";
  const stB = n.strain <= strainMed ? "lowStr" : "hiStr";
  return `${dB}|${sB}|${stB}`;
}

function stateLabel(state: string): string {
  const [d, s, st] = state.split("|");
  const deep =
    d === "L" ? "low deep" : d === "H" ? "high deep" : "mid deep";
  const sleep = s === "Sok" ? "ok sleep length" : "short sleep";
  const strain = st === "lowStr" ? "low strain" : "high strain";
  return `${deep}, ${sleep}, ${strain}`;
}

/** Tag which action was “taken” going into night i (from night i’s own features). */
function actionForNight(
  n: Night,
  sleepMed: number,
  strainMed: number
): Action {
  // Prefer strain signal when extreme; else sleep length
  if (n.strain > strainMed * 1.15) return "high_strain";
  if (n.strain < strainMed * 0.85) return "low_strain";
  if (n.sleepH >= sleepMed) return "sleep_more";
  return "sleep_less";
}

/**
 * Train Q from WHOOP history and advise for the latest state.
 */
export function buildDeepSleepRl(store?: WhoopStore): RlDeepSleepAdvice | null {
  const s = store || loadWhoopStore();
  const nights = nightsFromStore(s);
  if (nights.length < 8) return null;

  const deeps = nights.map((n) => n.deep);
  const sleeps = nights.map((n) => n.sleepH);
  const strains = nights.map((n) => n.strain);
  const deepMed = median(deeps);
  const sleepMed = median(sleeps);
  const strainMed = median(strains);
  // Tercile-ish cuts for deep
  const sortedD = [...deeps].sort((a, b) => a - b);
  const deepCuts: [number, number] = [
    sortedD[Math.floor(sortedD.length / 3)] ?? deepMed * 0.85,
    sortedD[Math.floor((2 * sortedD.length) / 3)] ?? deepMed * 1.15,
  ];
  const deepMean = deeps.reduce((a, b) => a + b, 0) / deeps.length;
  const deepStd = Math.sqrt(
    deeps.reduce((a, b) => a + (b - deepMean) ** 2, 0) / deeps.length
  ) || 1;

  const transitions: Transition[] = [];
  for (let i = 0; i < nights.length - 1; i++) {
    const cur = nights[i];
    const nxt = nights[i + 1];
    const state = makeState(cur, deepCuts, sleepMed, strainMed);
    const nextState = makeState(nxt, deepCuts, sleepMed, strainMed);
    // Action = what characterized the *next* night’s setup (what you did that day)
    const action = actionForNight(nxt, sleepMed, strainMed);
    // Reward = next deep, standardized (0 = your average)
    const reward = (nxt.deep - deepMean) / deepStd;
    transitions.push({
      state,
      action,
      reward,
      nextState,
      done: i === nights.length - 2,
    });
  }

  if (transitions.length < 5) return null;

  const actions = [...ACTIONS];
  const Q = trainQ(transitions, actions, {
    alpha: 0.3,
    gamma: 0.8,
    episodes: 60,
  });
  const emp = empiricalActionStats(transitions);

  const latest = nights[nights.length - 1];
  const state = makeState(latest, deepCuts, sleepMed, strainMed);
  const { action, q } = argmaxAction(Q, state, actions);

  // Prefer actionable positive tips (not "sleep less" / "high strain" unless truly best)
  let chosen = action as Action;
  if (chosen === "sleep_less" || chosen === "high_strain") {
    const alt = argmaxAction(
      Q,
      state,
      actions.filter((a) => a === "sleep_more" || a === "low_strain")
    );
    // Only override if the "healthy" action isn't much worse
    if (alt.q >= q - 0.15) chosen = alt.action as Action;
  }

  const ranking = actions
    .map((a) => {
      const stats = emp.get(qKey(state, a));
      return {
        action: a,
        label: ACTION_LABEL[a],
        q: Q[qKey(state, a)] ?? 0,
        meanReward: stats?.meanReward ?? 0,
        n: stats?.n ?? 0,
      };
    })
    .sort((x, y) => y.q - x.q);

  const tip =
    chosen === "sleep_more"
      ? `RL (Q-learning, ${transitions.length} nights): from states like yours, longer sleep correlated with better deep. Aim above ~${sleepMed.toFixed(1)} h in bed.`
      : chosen === "low_strain"
        ? `RL (Q-learning, ${transitions.length} nights): low day strain before bed beat high strain for deep in your history. Keep strain under ~${strainMed.toFixed(1)} today.`
        : chosen === "sleep_less"
          ? `RL saw shorter sleep in similar states — usually a warning, not a goal. Still prioritize recovery sleep.`
          : `RL flagged high-strain days in this state — treat as risk for deep, not a target.`;

  return {
    action: chosen,
    actionLabel: ACTION_LABEL[chosen],
    tip,
    q: Q[qKey(state, chosen)] ?? q,
    nTransitions: transitions.length,
    state,
    stateLabel: stateLabel(state),
    ranking,
    algorithm: "Q-learning",
  };
}

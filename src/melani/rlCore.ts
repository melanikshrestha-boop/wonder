/**
 * Minimal tabular reinforcement learning — no deps.
 *
 * Q-learning: Q(s,a) ← Q(s,a) + α [ r + γ max_a' Q(s',a') − Q(s,a) ]
 * Used offline on your history (batch replay), then greedily pick best action.
 */

export type QTable = Record<string, number>; // key = `${state}||${action}`

export type Transition = {
  state: string;
  action: string;
  reward: number;
  nextState: string;
  done?: boolean;
};

export type QLearnConfig = {
  alpha?: number; // learning rate
  gamma?: number; // discount
  episodes?: number; // passes over the transition list
  epsilon?: number; // only for online; batch uses full replay
};

const DEFAULTS: Required<QLearnConfig> = {
  alpha: 0.25,
  gamma: 0.85,
  episodes: 40,
  epsilon: 0.1,
};

export function qKey(state: string, action: string): string {
  return `${state}||${action}`;
}

export function getQ(table: QTable, state: string, action: string): number {
  return table[qKey(state, action)] ?? 0;
}

export function setQ(
  table: QTable,
  state: string,
  action: string,
  value: number
): void {
  table[qKey(state, action)] = value;
}

export function maxQ(table: QTable, state: string, actions: string[]): number {
  let best = -Infinity;
  for (const a of actions) {
    const v = getQ(table, state, a);
    if (v > best) best = v;
  }
  return best === -Infinity ? 0 : best;
}

export function argmaxAction(
  table: QTable,
  state: string,
  actions: string[]
): { action: string; q: number } {
  let bestA = actions[0] ?? "noop";
  let bestQ = -Infinity;
  for (const a of actions) {
    const v = getQ(table, state, a);
    if (v > bestQ) {
      bestQ = v;
      bestA = a;
    }
  }
  return { action: bestA, q: bestQ === -Infinity ? 0 : bestQ };
}

/**
 * Offline Q-learning: replay transitions for `episodes` shuffled passes.
 */
export function trainQ(
  transitions: Transition[],
  actions: string[],
  config: QLearnConfig = {}
): QTable {
  const { alpha, gamma, episodes } = { ...DEFAULTS, ...config };
  const Q: QTable = {};
  if (!transitions.length) return Q;

  for (let ep = 0; ep < episodes; ep++) {
    // Shuffle copy each episode
    const order = transitions.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (const idx of order) {
      const tr = transitions[idx];
      const old = getQ(Q, tr.state, tr.action);
      const bootstrap = tr.done
        ? 0
        : maxQ(Q, tr.nextState, actions);
      const target = tr.reward + gamma * bootstrap;
      setQ(Q, tr.state, tr.action, old + alpha * (target - old));
    }
  }
  return Q;
}

/**
 * Softmax / epsilon-greedy exploration helper (for future online use).
 */
export function epsilonGreedy(
  table: QTable,
  state: string,
  actions: string[],
  epsilon = 0.1
): string {
  if (actions.length === 0) return "noop";
  if (Math.random() < epsilon) {
    return actions[Math.floor(Math.random() * actions.length)];
  }
  return argmaxAction(table, state, actions).action;
}

/** Average reward observed for (state, action) in history. */
export function empiricalActionStats(
  transitions: Transition[]
): Map<string, { n: number; meanReward: number }> {
  const m = new Map<string, { n: number; sum: number }>();
  for (const tr of transitions) {
    const k = qKey(tr.state, tr.action);
    const cur = m.get(k) ?? { n: 0, sum: 0 };
    cur.n += 1;
    cur.sum += tr.reward;
    m.set(k, cur);
  }
  const out = new Map<string, { n: number; meanReward: number }>();
  for (const [k, v] of m) {
    out.set(k, { n: v.n, meanReward: v.sum / v.n });
  }
  return out;
}

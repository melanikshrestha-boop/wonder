/**
 * Classic 1D path Q-learning — the textbook episode loop.
 *
 * States:  0 ──► 1 ──► 2 ──► 3 (Goal)
 * Actions: 0 = Left, 1 = Right
 *
 * Same structure as:
 *   for episode in range(epochs):
 *       state = 0
 *       while state < NUM_STATES - 1:
 *           # ε-greedy → step → Bellman update → state = next_state
 *
 * This is *online* episodic RL (agent walks the path many times).
 * Wonder’s agent brain (rlAgent) uses the same Bellman idea offline on your history.
 */

export type ClassicPathConfig = {
  /** Number of positions (last index is the Goal). Default 4 → states 0,1,2,3 */
  numStates?: number;
  /** Full training passes. Default 1000 */
  epochs?: number;
  /** Learning rate α */
  alpha?: number;
  /** Discount γ — how much future reward counts */
  gamma?: number;
  /** Explore probability ε */
  epsilon?: number;
  /**
   * Reward when you *enter* each state.
   * Classic demo: mild cost to walk, big prize at goal.
   * Length must equal numStates.
   */
  rewards?: number[];
};

export type ClassicPathResult = {
  /** qTable[state][action] — action 0=Left, 1=Right */
  qTable: number[][];
  numStates: number;
  epochs: number;
  alpha: number;
  gamma: number;
  epsilon: number;
  rewards: number[];
  /** Human-readable table for Mel / console */
  summary: string;
};

const DEFAULTS = {
  numStates: 4,
  epochs: 1000,
  alpha: 0.1,
  gamma: 0.9,
  epsilon: 0.1,
};

/**
 * Train the 1D path agent with your exact episode / Bellman loop.
 */
export function trainClassicPath(config: ClassicPathConfig = {}): ClassicPathResult {
  const numStates = config.numStates ?? DEFAULTS.numStates;
  const epochs = config.epochs ?? DEFAULTS.epochs;
  const alpha = config.alpha ?? DEFAULTS.alpha;
  const gamma = config.gamma ?? DEFAULTS.gamma;
  const epsilon = config.epsilon ?? DEFAULTS.epsilon;

  // Default rewards: small negative for non-goal (encourages short path), +1 at Goal
  const rewards =
    config.rewards && config.rewards.length === numStates
      ? config.rewards
      : Array.from({ length: numStates }, (_, i) =>
          i === numStates - 1 ? 1 : -0.01
        );

  // q_table[state] = [Q(Left), Q(Right)]
  const qTable: number[][] = Array.from({ length: numStates }, () => [0, 0]);

  for (let episode = 0; episode < epochs; episode++) {
    let state = 0; // Always start at position 0

    // Run until reaching the Goal (last state)
    while (state < numStates - 1) {
      // ── Epsilon-Greedy Action Selection ──
      let action: number;
      if (Math.random() < epsilon) {
        // Explore: pick random action (0 Left or 1 Right)
        action = Math.random() < 0.5 ? 0 : 1;
      } else {
        // Exploit: pick the best known action (break ties randomly)
        const leftQ = qTable[state]![0]!;
        const rightQ = qTable[state]![1]!;
        if (leftQ === rightQ) {
          action = Math.random() < 0.5 ? 0 : 1;
        } else {
          action = leftQ > rightQ ? 0 : 1;
        }
      }

      // ── Take action → next state ──
      let nextState: number;
      if (action === 1) {
        nextState = Math.min(state + 1, numStates - 1); // Move Right
      } else {
        nextState = Math.max(state - 1, 0); // Move Left
      }

      // Reward for *entering* next_state
      const reward = rewards[nextState]!;

      // Max Q-value for the next state's possible choices
      const maxFutureQ = Math.max(qTable[nextState]![0]!, qTable[nextState]![1]!);

      // ── Bellman update ──
      // Q(s,a) ← Q(s,a) + α [ r + γ max_a' Q(s',a') − Q(s,a) ]
      const oldQ = qTable[state]![action]!;
      qTable[state]![action] = oldQ + alpha * (reward + gamma * maxFutureQ - oldQ);

      // Move
      state = nextState;
    }
  }

  const summary = formatClassicPathTable(qTable, rewards);
  return {
    qTable,
    numStates,
    epochs,
    alpha,
    gamma,
    epsilon,
    rewards,
    summary,
  };
}

export function formatClassicPathTable(
  qTable: number[][],
  rewards?: number[]
): string {
  const lines: string[] = [
    "Classic path Q-learning (1D line → Goal)",
    "Actions: 0=Left, 1=Right · always start at State 0",
    "",
    "Learned Q-Table (State: [Left, Right]):",
  ];
  for (let i = 0; i < qTable.length; i++) {
    const row = qTable[i]!;
    const left = Math.round(row[0]! * 100) / 100;
    const right = Math.round(row[1]! * 100) / 100;
    const goal = i === qTable.length - 1 ? "  ← Goal" : "";
    const r =
      rewards && rewards[i] != null ? `  r=${rewards[i]}` : "";
    lines.push(`State ${i}: [${left}, ${right}]${goal}${r}`);
  }
  // Policy: greedy action per state
  lines.push("");
  lines.push("Greedy policy (what it learned to do):");
  for (let i = 0; i < qTable.length - 1; i++) {
    const left = qTable[i]![0]!;
    const right = qTable[i]![1]!;
    const move = right >= left ? "Right →" : "Left ←";
    lines.push(`  State ${i}: ${move}`);
  }
  lines.push(`  State ${qTable.length - 1}: stay (Goal)`);
  return lines.join("\n");
}

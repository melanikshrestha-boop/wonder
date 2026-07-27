/**
 * Wonder agent RL — trial-and-error learning for Mel + policies + tools.
 *
 * Loop:
 *   1. Agent acts (mode, tool, policy choice) → open episode
 *   2. Environment / you give reward or penalty
 *   3. Q(s,a) updates: Q ← Q + α (r − Q)  (bandit TD when episode ends)
 *   4. Next time, epsilon-greedy prefers high-Q actions in similar states
 *
 * Explicit feedback: thumbs, "good"/"bad", "reward +1", "penalty"
 * Implicit feedback: tool ok/fail, learn-corrections, productive follow-ups
 *
 * Deep-sleep Q-learning stays in rlDeepSleep.ts (richer multi-step history).
 * This module is the OS-wide brain for agent behavior.
 */
import {
  argmaxAction,
  epsilonGreedy,
  getQ,
  qKey,
  setQ,
  type QTable,
} from "./rlCore";
import { trainClassicPath } from "./rlClassicPath";

const BRAIN_KEY = "wonder-rl-agent-v1";
const MAX_EPISODES = 200;
const ALPHA = 0.25; // learning rate

export type RlDomain =
  | "mel_mode"
  | "tool"
  | "policy_meat"
  | "policy_dress"
  | "care"
  | "general";

export type RlEpisode = {
  id: string;
  domain: RlDomain;
  state: string;
  action: string;
  at: string;
  /** Assigned when closed */
  reward?: number;
  reason?: string;
  closed: boolean;
  /** Link to Mel chat message if any */
  messageId?: string;
};

export type RlBrain = {
  version: 1;
  /** Flattened Q: `${domain}::${state}||${action}` */
  Q: QTable;
  episodes: RlEpisode[];
  /** Last Mel turn waiting for your thumbs / next-message signal */
  pendingId: string | null;
  stats: {
    rewards: number;
    penalties: number;
    totalReward: number;
    actions: number;
  };
};

function emptyBrain(): RlBrain {
  return {
    version: 1,
    Q: {},
    episodes: [],
    pendingId: null,
    stats: { rewards: 0, penalties: 0, totalReward: 0, actions: 0 },
  };
}

export function loadRlBrain(): RlBrain {
  try {
    const raw = localStorage.getItem(BRAIN_KEY);
    if (!raw) return emptyBrain();
    const data = JSON.parse(raw) as Partial<RlBrain>;
    const base = emptyBrain();
    return {
      version: 1,
      Q: data.Q && typeof data.Q === "object" ? data.Q : {},
      episodes: Array.isArray(data.episodes) ? data.episodes.slice(0, MAX_EPISODES) : [],
      pendingId: data.pendingId ?? null,
      stats: {
        ...base.stats,
        ...(data.stats || {}),
      },
    };
  } catch {
    return emptyBrain();
  }
}

export function saveRlBrain(brain: RlBrain) {
  try {
    localStorage.setItem(
      BRAIN_KEY,
      JSON.stringify({
        ...brain,
        episodes: brain.episodes.slice(0, MAX_EPISODES),
      })
    );
  } catch {
    /* quota */
  }
}

function uid(): string {
  return `rl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function fullKey(domain: RlDomain, state: string, action: string): string {
  return `${domain}::${qKey(state, action)}`;
}

function domainQ(brain: RlBrain, domain: RlDomain): QTable {
  const out: QTable = {};
  const prefix = `${domain}::`;
  for (const [k, v] of Object.entries(brain.Q)) {
    if (k.startsWith(prefix)) out[k.slice(prefix.length)] = v;
  }
  return out;
}

/** Online bandit update: Q(s,a) ← Q(s,a) + α (r − Q(s,a)) */
function tdUpdate(
  brain: RlBrain,
  domain: RlDomain,
  state: string,
  action: string,
  reward: number
) {
  const k = fullKey(domain, state, action);
  const old = brain.Q[k] ?? 0;
  brain.Q[k] = old + ALPHA * (reward - old);
}

// ── Act ──────────────────────────────────────────────────────────

export type RecordActionOpts = {
  domain: RlDomain;
  state: string;
  action: string;
  messageId?: string;
  /** If true, becomes the pending Mel turn for thumbs */
  setPending?: boolean;
};

/** Open an episode: agent took an action, reward comes later (or immediately via rewardEpisode). */
export function recordAction(opts: RecordActionOpts): string {
  const brain = loadRlBrain();
  const id = uid();
  const ep: RlEpisode = {
    id,
    domain: opts.domain,
    state: opts.state,
    action: opts.action,
    at: new Date().toISOString(),
    closed: false,
    messageId: opts.messageId,
  };
  brain.episodes = [ep, ...brain.episodes].slice(0, MAX_EPISODES);
  brain.stats.actions += 1;
  if (opts.setPending !== false && opts.domain === "mel_mode") {
    brain.pendingId = id;
  }
  saveRlBrain(brain);
  emitRl("rl.action", { episodeId: id, ...opts });
  return id;
}

/** Close episode and update Q. Reward > 0 = good, < 0 = penalty. */
export function rewardEpisode(
  episodeId: string | "pending",
  reward: number,
  reason?: string
): { ok: boolean; tip: string; episode?: RlEpisode } {
  const brain = loadRlBrain();
  const id = episodeId === "pending" ? brain.pendingId : episodeId;
  if (!id) {
    return { ok: false, tip: "No pending action to score. Mel needs to answer first." };
  }
  const ep = brain.episodes.find((e) => e.id === id);
  if (!ep) {
    return { ok: false, tip: "That episode is gone." };
  }
  if (ep.closed && ep.reward != null) {
    // Allow re-score: undo previous stats contribution roughly
    if (ep.reward > 0) brain.stats.rewards = Math.max(0, brain.stats.rewards - 1);
    if (ep.reward < 0) brain.stats.penalties = Math.max(0, brain.stats.penalties - 1);
    brain.stats.totalReward -= ep.reward;
  }

  const r = clampReward(reward);
  ep.reward = r;
  ep.reason = reason;
  ep.closed = true;
  tdUpdate(brain, ep.domain, ep.state, ep.action, r);

  if (r > 0) brain.stats.rewards += 1;
  if (r < 0) brain.stats.penalties += 1;
  brain.stats.totalReward += r;
  if (brain.pendingId === id) brain.pendingId = null;

  saveRlBrain(brain);
  emitRl("rl.reward", { episodeId: id, reward: r, reason, domain: ep.domain, action: ep.action });

  const sign = r > 0 ? "reward" : r < 0 ? "penalty" : "neutral";
  return {
    ok: true,
    episode: ep,
    tip: `RL ${sign} ${r > 0 ? "+" : ""}${r.toFixed(2)} on ${ep.domain}/${ep.action}${reason ? ` (${reason})` : ""}. Q updated.`,
  };
}

export function rewardPending(reward: number, reason?: string) {
  return rewardEpisode("pending", reward, reason);
}

/** Immediate act+reward (tools, auto signals). */
export function recordAndReward(
  domain: RlDomain,
  state: string,
  action: string,
  reward: number,
  reason?: string
): string {
  const id = recordAction({ domain, state, action, setPending: false });
  rewardEpisode(id, reward, reason);
  return id;
}

function clampReward(r: number): number {
  if (!Number.isFinite(r)) return 0;
  return Math.max(-1, Math.min(1, r));
}

// ── Choose (trial & error policy) ────────────────────────────────

/**
 * Epsilon-greedy pick among actions for this domain/state.
 * High epsilon early → explore; falls as episodes accumulate.
 */
export function chooseAction(
  domain: RlDomain,
  state: string,
  actions: string[],
  epsilon?: number
): { action: string; q: number; exploring: boolean } {
  if (!actions.length) return { action: "noop", q: 0, exploring: false };
  const brain = loadRlBrain();
  const Q = domainQ(brain, domain);
  const n = brain.stats.actions;
  // Explore more when young, less when mature
  const eps =
    epsilon ??
    Math.max(0.05, Math.min(0.35, 0.35 - Math.min(n, 80) * 0.003));
  const exploring = Math.random() < eps;
  if (exploring) {
    const action = actions[Math.floor(Math.random() * actions.length)]!;
    return { action, q: getQ(Q, state, action), exploring: true };
  }
  const { action, q } = argmaxAction(Q, state, actions);
  return { action, q, exploring: false };
}

export function qFor(
  domain: RlDomain,
  state: string,
  action: string
): number {
  const brain = loadRlBrain();
  return brain.Q[fullKey(domain, state, action)] ?? 0;
}

// ── State helpers ────────────────────────────────────────────────

/** Coarse state from Mel context (page + intent bucket). */
export function melStateFromTurn(opts: {
  pageId?: string;
  text: string;
}): string {
  const page = (opts.pageId || "home").replace(/^pg-/, "").slice(0, 24);
  const t = opts.text.trim().toLowerCase();
  let intent = "chat";
  if (/^(hi|hey|yo|hello|sup|good\s)/i.test(t)) intent = "greet";
  else if (/\b(water|oz|hydrate)\b/i.test(t)) intent = "water";
  else if (/\b(sleep|bed|wake|deep)\b/i.test(t)) intent = "sleep";
  else if (/\b(meat|beef|salmon|food|meal|log)\b/i.test(t)) intent = "food";
  else if (/\b(open|go to|show|page)\b/i.test(t)) intent = "nav";
  else if (/\b(care|dentist|doctor|appoint)\b/i.test(t)) intent = "care";
  else if (/\b(habit|check)\b/i.test(t)) intent = "habit";
  else if (/\b(money|spend|budget|finance)\b/i.test(t)) intent = "finance";
  else if (/\b(wear|outfit|wardrobe)\b/i.test(t)) intent = "fashion";
  else if (/\b(research|look up|compare)\b/i.test(t)) intent = "research";
  else if (t.length < 12) intent = "short";
  else if (t.length > 120) intent = "long";
  return `${page}|${intent}`;
}

export function meatState(ctx: {
  phaseId?: string;
  lipidPressure?: boolean;
  yesterdayMeat?: string | null;
  gymToday?: string;
}): string {
  const phase = ctx.phaseId || "unknown";
  const lipid = ctx.lipidPressure ? "lipY" : "lipN";
  const y = ctx.yesterdayMeat || "none";
  const gym = ctx.gymToday && ctx.gymToday !== "-" ? "gymY" : "gymN";
  return `${phase}|${lipid}|y=${y}|${gym}`;
}

// ── Mel turn recording ───────────────────────────────────────────

export type MelTurnRecord = {
  pageId?: string;
  text: string;
  mode: string;
  toolResults?: { tool: string; ok: boolean }[];
  messageId?: string;
};

/** Call after every Mel reply. Tools get implicit reward immediately. */
export function recordMelTurn(turn: MelTurnRecord): string {
  const state = melStateFromTurn({ pageId: turn.pageId, text: turn.text });
  const tools = turn.toolResults || [];
  const primaryTool = tools[0]?.tool;
  const action = primaryTool ? `${turn.mode}:${primaryTool}` : turn.mode;

  const episodeId = recordAction({
    domain: "mel_mode",
    state,
    action,
    messageId: turn.messageId,
    setPending: true,
  });

  // Implicit: each tool success/fail is a separate short episode
  for (const t of tools) {
    recordAndReward(
      "tool",
      state,
      t.tool,
      t.ok ? 0.35 : -0.55,
      t.ok ? "tool_ok" : "tool_fail"
    );
  }

  return episodeId;
}

/**
 * Infer reward from the *next* user message (no thumbs needed).
 * Positive: thanks, continue productively. Negative: corrections, frustration.
 */
export function applyUserTextAsReward(text: string): string | null {
  const t = text.trim();
  if (!t) return null;

  // Strong positive
  if (
    /^(good|great|perfect|thanks|thank you|yes|yep|correct|nice|love that|that worked|works)\b/i.test(
      t
    ) ||
    /\b(good job|nailed it|exactly|right)\b/i.test(t)
  ) {
    const r = rewardPending(0.85, "user_praise");
    return r.ok ? r.tip : null;
  }

  // Strong negative / correction language
  if (
    /^(no|wrong|stop|bad|ugh|wtf|fix|don't|dont|never)\b/i.test(t) ||
    /\b(that('s| is) wrong|not what i|don'?t do that|makes no sense|too much|chill)\b/i.test(
      t
    )
  ) {
    const r = rewardPending(-0.85, "user_correction");
    return r.ok ? r.tip : null;
  }

  // Mild positive: short follow-up that isn't a correction (user stayed engaged)
  if (t.length < 40 && !/[?]/.test(t) && /^(ok|okay|k|cool|got it|fine)\b/i.test(t)) {
    const r = rewardPending(0.25, "user_ack");
    return r.ok ? r.tip : null;
  }

  return null;
}

// ── Chat commands ────────────────────────────────────────────────

/**
 * Explicit RL commands. Returns Mel reply or null if not an RL command.
 *   reward / good / +1 / thumbs up
 *   penalty / bad / -1 / thumbs down
 *   reward 0.5 | penalty 0.8
 *   rl | rl status | what did rl learn
 *   rl reset (clears brain — careful)
 */
export function applyRlCommand(raw: string): string | null {
  const t = raw.trim();

  if (/^(reward|good|👍|thumbs?\s*up|\+1)\s*$/i.test(t)) {
    const r = rewardPending(1, "cmd_reward");
    return r.tip;
  }
  if (/^(penalty|bad|👎|thumbs?\s*down|-1)\s*$/i.test(t)) {
    const r = rewardPending(-1, "cmd_penalty");
    return r.tip;
  }

  const rewN = t.match(/^reward\s+([+-]?\d*\.?\d+)\s*$/i);
  if (rewN?.[1]) {
    const r = rewardPending(Number(rewN[1]), "cmd_reward_n");
    return r.tip;
  }
  const penN = t.match(/^penalty\s+([+-]?\d*\.?\d+)\s*$/i);
  if (penN?.[1]) {
    const n = Math.abs(Number(penN[1]));
    const r = rewardPending(-n, "cmd_penalty_n");
    return r.tip;
  }

  if (/^rl\s+reset$/i.test(t)) {
    saveRlBrain(emptyBrain());
    return "RL brain cleared. Fresh trial-and-error from zero.";
  }

  // Textbook 1D path: for episode in range(epochs): state=0; while not goal; Bellman
  if (
    /^rl\s+(?:demo|path|classic|grid|line)(?:\s+(\d+))?$/i.test(t) ||
    /^run\s+(?:q-?learning|rl)\s+demo$/i.test(t)
  ) {
    const m = t.match(/(\d+)\s*$/);
    const epochs = m ? Math.min(20_000, Math.max(50, Number(m[1]))) : 1000;
    const result = trainClassicPath({ epochs });
    return result.summary;
  }

  if (
    /^rl(?:\s+status)?$/i.test(t) ||
    /^what did (?:you|rl|the agent) learn$/i.test(t) ||
    /^rl\s+learn(?:ings?)?$/i.test(t)
  ) {
    return formatRlStatus();
  }

  return null;
}

export function formatRlStatus(): string {
  const brain = loadRlBrain();
  const lines: string[] = [
    "RL · trial-and-error brain (local Q-learning)",
    `Actions logged: ${brain.stats.actions}`,
    `Rewards: ${brain.stats.rewards} · Penalties: ${brain.stats.penalties}`,
    `Sum of rewards: ${brain.stats.totalReward.toFixed(2)}`,
  ];

  // Top Q entries across domains
  const ranked = Object.entries(brain.Q)
    .map(([k, v]) => ({ k, v }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 6);
  if (ranked.length) {
    lines.push("Strongest habits (high Q):");
    for (const { k, v } of ranked) {
      lines.push(`  ${v >= 0 ? "+" : ""}${v.toFixed(2)}  ${k.replace(/::/, " / ")}`);
    }
  } else {
    lines.push("No Q-values yet. Act → thumbs or say good/bad.");
  }

  const recent = brain.episodes.filter((e) => e.closed).slice(0, 4);
  if (recent.length) {
    lines.push("Recent scored turns:");
    for (const e of recent) {
      const r = e.reward ?? 0;
      lines.push(
        `  ${r >= 0 ? "+" : ""}${r.toFixed(2)}  ${e.domain}/${e.action}${e.reason ? ` · ${e.reason}` : ""}`
      );
    }
  }

  if (brain.pendingId) {
    lines.push("Pending: last Mel reply is waiting for reward or penalty.");
  }

  lines.push(
    "Score a turn: 👍/👎 on the reply, or say good / bad / reward / penalty."
  );
  return lines.join("\n");
}

// ── Bridge: learn corrections → penalty ──────────────────────────

/** Call when melLearn captures a fix/never/stop. */
export function penaltyFromCorrection(note: string) {
  rewardPending(-0.75, `learn:${note.slice(0, 48)}`);
}

// ── Event emit (DOM so React can listen without circular imports) ─

function emitRl(type: "rl.action" | "rl.reward", payload: unknown) {
  try {
    window.dispatchEvent(new CustomEvent(type, { detail: payload }));
    // Also bridge into wonder bus if available (dynamic import avoided)
    window.dispatchEvent(
      new CustomEvent("wonder-event", {
        detail: {
          type,
          at: new Date().toISOString(),
          source: "rlAgent",
          payload,
        },
      })
    );
  } catch {
    /* SSR / tests */
  }
}

/** Prefer this for policy soft-bias when Q is informative. */
export function rlSoftPrefer(
  domain: RlDomain,
  state: string,
  candidates: string[],
  /** Minimum |Q| gap to override a rule-based default */
  minGap = 0.15
): { action: string; q: number; override: boolean } | null {
  if (candidates.length < 2) return null;
  const brain = loadRlBrain();
  const scored = candidates.map((a) => ({
    action: a,
    q: brain.Q[fullKey(domain, state, a)] ?? 0,
  }));
  scored.sort((a, b) => b.q - a.q);
  const best = scored[0]!;
  const second = scored[1]!;
  if (best.q - second.q < minGap) return null;
  if (best.q < 0.1) return null; // need real positive evidence
  return { action: best.action, q: best.q, override: true };
}

// re-export for callers that want exploration helpers
export { epsilonGreedy };

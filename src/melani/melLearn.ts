/**
 * Mel learns from Melani over time (local only).
 * fix: ...  | never say ...  | always ...  | style: ...
 * Also: thumbs 👎 → next message retrains exact preferred reply (persisted).
 * Corrections also feed the RL brain (penalty on last Mel action).
 */
import {
  loadRlBrain,
  melStateFromTurn,
  penaltyFromCorrection,
  recordAndReward,
} from "./rlAgent";

const LEARN_KEY = "dr-melani-mel-learn-v1";

/** Preferred reply Mel must use for a state / trigger after you retrain her */
export type MelPreferredReply = {
  at: string;
  /** RL-style state key e.g. home|greet */
  state: string;
  /** Exact words Mel should say */
  say: string;
  /** Optional user phrase that triggered the bad reply */
  trigger?: string;
};

export type MelAwaitingRetrain = {
  at: string;
  episodeId?: string;
  state: string;
  action: string;
  /** User text Mel was answering when she got 👎 */
  userText?: string;
};

export type MelLearn = {
  /** Things she said not to do / never say */
  never: string[];
  /** Always do this in replies */
  always: string[];
  /** Free style notes */
  style: string[];
  /** Explicit fixes from her */
  fixes: { at: string; text: string }[];
  /** smalltalk: pure | light_data | off */
  smalltalk: "pure" | "light_data";
  /**
   * After a penalty, Mel waits for your preferred line
   * ("instead say: …" or freeform).
   */
  awaiting?: MelAwaitingRetrain | null;
  /** Exact preferred replies — backend that actually changes behavior */
  preferred?: MelPreferredReply[];
  /** Default greeting override (yo / hi / hey) */
  preferredGreeting?: string | null;
};

function empty(): MelLearn {
  return {
    never: [
      "decorative",
      "half-assing",
      "ghosting",
      "bold strategy",
      "ask: status",
      "what to ask",
      "try:",
      "I didn't map that to an action",
      "Try plain:",
      "Not completed:",
      "Straight answer: I'm Mel",
    ],
    always: [
      "small talk stays small talk",
      "no command menus unless she asks help",
      "if unsure say I don't know what you're talking about",
    ],
    style: [],
    fixes: [],
    smalltalk: "pure",
    awaiting: null,
    preferred: [],
    preferredGreeting: null,
  };
}

/** Complaints / meta feedback — never treat as preferred Mel speech. */
function looksLikeComplaint(t: string): boolean {
  const s = t.trim();
  if (!s) return true;
  if (s.length > 200) return false; // long preferred scripts ok
  return (
    /^(the logic|this (logic|doesn't|does not)|that (doesn't|does not|was|is)|doesn't make|does not make|no sense|wtf|bullshit|stupid|dumb|hate|wrong|terrible|awful|bad reply|no mf|nmf|stfu|shut up)/i.test(
      s
    ) ||
    /\b(doesn't make sense|does not make sense|makes no sense|logic is wrong|retrain|penalty)\b/i.test(
      s
    ) ||
    // pure vent / short trash not usable as a greeting
    (/^(no|nah|nope|bruh|wtf|lmao|lol)\b/i.test(s) && s.length < 24)
  );
}

/** Safe to use as a canned Mel reply (greeting or short help line). */
function looksLikeUsableReply(t: string): boolean {
  const s = t.trim();
  if (s.length < 3 || s.length > 280) return false;
  if (looksLikeComplaint(s)) return false;
  // Must look like Mel talking to Melani, not Melani venting
  if (
    /^(hey|hi|hello|yo)\b/i.test(s) ||
    /\b(help you|what(?:'s| is) (?:up|next)|got you|on it|what do you need|how can i)\b/i.test(
      s
    ) ||
    /^[A-Z]/.test(s) // sentence-shaped
  ) {
    return true;
  }
  // Explicit instead-say lines are trusted if not complaints
  return s.length >= 8 && !looksLikeComplaint(s);
}

export function loadLearn(): MelLearn {
  try {
    const raw = localStorage.getItem(LEARN_KEY);
    if (!raw) return empty();
    const data = JSON.parse(raw) as Partial<MelLearn>;
    const base = empty();
    const preferred = (Array.isArray(data.preferred) ? data.preferred : [])
      .filter((p) => p?.say && looksLikeUsableReply(p.say))
      .slice(-40);
    let preferredGreeting = data.preferredGreeting ?? null;
    if (preferredGreeting && !looksLikeUsableReply(preferredGreeting)) {
      preferredGreeting = null;
    }
    // Heal corrupt storage so bad greets don't stick forever
    const healed: MelLearn = {
      never: [...new Set([...(base.never || []), ...(data.never || [])])].slice(
        -60
      ),
      always: [...new Set([...(base.always || []), ...(data.always || [])])].slice(
        -40
      ),
      style: data.style || [],
      fixes: data.fixes || [],
      smalltalk: data.smalltalk === "light_data" ? "light_data" : "pure",
      awaiting: data.awaiting ?? null,
      preferred,
      preferredGreeting,
    };
    if (
      preferredGreeting !== (data.preferredGreeting ?? null) ||
      preferred.length !== (data.preferred?.length ?? 0)
    ) {
      try {
        localStorage.setItem(LEARN_KEY, JSON.stringify(healed));
      } catch {
        /* ignore */
      }
    }
    return healed;
  } catch {
    return empty();
  }
}

export function saveLearn(L: MelLearn) {
  try {
    localStorage.setItem(LEARN_KEY, JSON.stringify(L));
  } catch {
    /* ignore */
  }
}

function pushUnique(list: string[], item: string, max: number): string[] {
  const t = item.trim();
  if (!t) return list;
  return [...list.filter((x) => x.toLowerCase() !== t.toLowerCase()), t].slice(
    -max
  );
}

/**
 * Call when user hits 👎 — next message becomes retrain target.
 * Pulls state from the scored RL episode so the preferred reply sticks to that context.
 */
export function markAwaitingRetrain(opts: {
  episodeId?: string;
  pageId?: string;
}): void {
  const L = loadLearn();
  const brain = loadRlBrain();
  const ep =
    (opts.episodeId && brain.episodes.find((e) => e.id === opts.episodeId)) ||
    brain.episodes.find((e) => e.closed && (e.reward ?? 0) < 0) ||
    brain.episodes[0];
  L.awaiting = {
    at: new Date().toISOString(),
    episodeId: opts.episodeId || ep?.id,
    state: ep?.state || melStateFromTurn({ pageId: opts.pageId, text: "hi" }),
    action: ep?.action || "offline-local",
    userText: undefined,
  };
  saveLearn(L);
}

export function isAwaitingRetrain(): boolean {
  return Boolean(loadLearn().awaiting);
}

/**
 * After 👎, teach Mel with an EXPLICIT preferred line only:
 *   instead say: Hey, what can I help you with?
 *
 * Freeform while awaiting (complaints, "ok", "the logic…") is feedback —
 * never becomes the next greeting. That was the bug.
 */
export function tryConsumeRetrain(raw: string, pageId?: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const L = loadLearn();

  const instead = t.match(
    /^(?:instead\s+say|say\s+instead|should\s+say|prefer(?:red)?(?:\s+say)?|retrain)\s*:?\s*([\s\S]+)$/i
  );

  // Awaiting retrain but no explicit "instead say:" → guide, don't learn trash
  if (L.awaiting && !instead) {
    L.fixes = [
      ...L.fixes,
      { at: new Date().toISOString(), text: `feedback: ${t.slice(0, 160)}` },
    ].slice(-80);
    // Keep awaiting open
    saveLearn(L);
    try {
      if (looksLikeComplaint(t)) penaltyFromCorrection(t.slice(0, 80));
    } catch {
      /* ignore */
    }
    // Don't swallow real commands / greets while "awaiting"
    if (
      /^(hi|hey|yo+|hello|sup)\b/i.test(t) ||
      /^(log|drank|ate|open|brief|status|run loop)\b/i.test(t)
    ) {
      return null; // let normal Mel handle
    }
    return [
      "Got the penalty. I only retrain on an exact line — not freeform venting.",
      "Type exactly:",
      "instead say: Hey, what can I help you with?",
    ].join("\n");
  }

  if (!instead) return null;

  const say = instead[1]!.trim().replace(/^["']|["']$/g, "");
  if (!say || say.length < 2) {
    return "Need the words after instead say:. Example: instead say: Hey, what can I help you with?";
  }
  if (looksLikeComplaint(say) || !looksLikeUsableReply(say)) {
    return [
      "That doesn't look like a Mel reply I should reuse.",
      "Give a clean line I can say to you, e.g.:",
      "instead say: Hey, what can I help you with?",
    ].join("\n");
  }

  const state =
    L.awaiting?.state ||
    melStateFromTurn({ pageId, text: L.awaiting?.userText || "hi" });

  const entry: MelPreferredReply = {
    at: new Date().toISOString(),
    state,
    say,
    trigger: L.awaiting?.userText,
  };
  const rest = (L.preferred || []).filter(
    (p) => p.state !== state && looksLikeUsableReply(p.say)
  );
  L.preferred = [entry, ...rest].slice(0, 40);
  L.fixes = [
    ...L.fixes,
    { at: entry.at, text: `prefer [${state}]: ${say.slice(0, 120)}` },
  ].slice(-80);

  // Only store as default greeting if it actually reads like one
  if (
    looksLikeUsableReply(say) &&
    (/greet/i.test(state) ||
      /^(hey|hi|hello)\b/i.test(say) ||
      /\bhelp you with\b/i.test(say) ||
      /\bwhat do you need\b/i.test(say))
  ) {
    L.preferredGreeting = say;
  }

  L.awaiting = null;
  L.never = pushUnique(L.never, "I didn't map that to an action", 60);
  L.never = pushUnique(L.never, "Try plain:", 60);
  L.never = pushUnique(L.never, "Not completed:", 60);
  L.always = pushUnique(
    L.always,
    "if unsure say I don't know what you're talking about",
    40
  );
  saveLearn(L);

  try {
    recordAndReward("mel_mode", state, "learned_reply", 1, "retrain_preferred");
    recordAndReward("mel_mode", state, "offline-local", -0.5, "retrain_avoid_old");
  } catch {
    /* ignore */
  }

  return [
    "Learned — only this explicit line is stored.",
    `Context: ${state}`,
    `Next time I'll say:`,
    say,
  ].join("\n");
}

/** Lookup preferred reply for this turn (exact state, then greeting override). */
export function preferredReplyFor(opts: {
  pageId?: string;
  userText: string;
}): string | null {
  const L = loadLearn();
  const t = opts.userText.trim();
  if (!t) return null;

  // Never inject preferred lines when user is mid-retrain / complaining
  if (L.awaiting && !/^(hi|hey|yo+|hello)\b/i.test(t)) return null;
  if (looksLikeComplaint(t)) return null;

  // Learned greeting for social openers only
  if (
    L.preferredGreeting &&
    looksLikeUsableReply(L.preferredGreeting) &&
    /^(hi|hey|yo+|hello|sup|what'?s up|howdy)([.!?\s].*)?$/i.test(t)
  ) {
    return L.preferredGreeting;
  }

  const state = melStateFromTurn({ pageId: opts.pageId, text: t });
  const list = (L.preferred || []).filter((p) => looksLikeUsableReply(p.say));
  const exact = list.find((p) => p.state === state);
  if (exact?.say) return exact.say;

  // Same intent bucket — only for greet / short chat, not every "short" bucket
  const intent = state.split("|")[1];
  if (intent === "greet" || intent === "chat") {
    const byIntent = list.find((p) => p.state.endsWith(`|${intent}`));
    if (byIntent?.say && looksLikeUsableReply(byIntent.say)) return byIntent.say;
  }
  return null;
}

/** Wipe poison preferred lines (call from "clear training" if needed). */
export function scrubBadPreferred(): void {
  const L = loadLearn();
  L.preferred = (L.preferred || []).filter((p) => looksLikeUsableReply(p.say));
  if (L.preferredGreeting && !looksLikeUsableReply(L.preferredGreeting)) {
    L.preferredGreeting = null;
  }
  L.awaiting = null;
  saveLearn(L);
}

/**
 * Handle explicit learning commands. Returns Mel's ack or null.
 */
export function applyLearnCommand(raw: string): string | null {
  const t = raw.trim();
  const L = loadLearn();

  // Retrain path first (instead say / awaiting after 👎)
  const retrained = tryConsumeRetrain(t);
  if (retrained) return retrained;

  // fix: don't dump water stats on hi
  const fix = t.match(/^fix\s*:?\s+(.+)$/i);
  if (fix?.[1]) {
    const text = fix[1].trim();
    L.fixes = [...L.fixes, { at: new Date().toISOString(), text }].slice(-80);
    // Heuristics from common fixes
    if (/small talk|hi|hey|yo|casual/i.test(text)) {
      L.smalltalk = "pure";
      L.always = pushUnique(
        L.always,
        "on hi/yo only small talk, no water protein flags",
        40
      );
    }
    if (/never say|don't say|dont say|stop saying/i.test(text)) {
      const m = text.match(
        /(?:never say|don't say|dont say|stop saying)\s+["']?(.+?)["']?\s*$/i
      );
      if (m?.[1]) L.never = pushUnique(L.never, m[1], 60);
    }
    if (/no menu|no command|don't list|dont list/i.test(text)) {
      L.always = pushUnique(L.always, "no command menus unless help", 40);
    }
    if (/clearer|plain|simple|not weird|no metaphor/i.test(text)) {
      L.always = pushUnique(L.always, "plain English, no weird metaphors", 40);
      L.never = pushUnique(L.never, "decorative", 60);
    }
    saveLearn(L);
    try {
      penaltyFromCorrection(text);
    } catch {
      /* ignore */
    }
    return "Got it. I'll adjust from that. (RL: penalty on last turn.)";
  }

  const never = t.match(/^never\s+say\s+(.+)$/i);
  if (never?.[1]) {
    L.never = pushUnique(L.never, never[1], 60);
    saveLearn(L);
    try {
      penaltyFromCorrection(`never say ${never[1]}`);
    } catch {
      /* ignore */
    }
    return `Won't say: ${never[1].trim()}`;
  }

  const always = t.match(/^always\s+(.+)$/i);
  if (always?.[1]) {
    L.always = pushUnique(L.always, always[1], 40);
    saveLearn(L);
    return `Always: ${always[1].trim()}`;
  }

  const style = t.match(/^style\s*:?\s+(.+)$/i);
  if (style?.[1]) {
    L.style = pushUnique(L.style, style[1], 30);
    saveLearn(L);
    return `Style noted: ${style[1].trim()}`;
  }

  if (/^clear\s+(?:bad\s+)?(?:training|preferred|retrain)$/i.test(t)) {
    scrubBadPreferred();
    return "Cleared bad preferred lines + retrain wait. Greetings are clean again.";
  }

  if (/^learn$/i.test(t) || /^what did you learn$/i.test(t)) {
    const prefs = (L.preferred || []).filter((p) => looksLikeUsableReply(p.say)).slice(0, 4);
    const lines = [
      L.smalltalk === "pure" ? "Small talk: pure (no stats)." : "Small talk: light data ok.",
      L.preferredGreeting && looksLikeUsableReply(L.preferredGreeting)
        ? `Greeting: ${L.preferredGreeting}`
        : "Greeting: default",
      prefs.length
        ? `Preferred replies:\n${prefs.map((p) => `  [${p.state}] ${p.say.slice(0, 80)}`).join("\n")}`
        : "Preferred replies: none (use instead say: … after 👎)",
      L.awaiting
        ? `Awaiting retrain (${L.awaiting.state}) — only: instead say: your line`
        : null,
      L.never.length ? `Never: ${L.never.slice(-8).join("; ")}` : null,
      L.always.length ? `Always: ${L.always.slice(-6).join("; ")}` : null,
      L.style.length ? `Style: ${L.style.slice(-4).join("; ")}` : null,
      L.fixes.length ? `Fixes saved: ${L.fixes.length}` : null,
      "Also try: rl status · clear training",
    ].filter(Boolean);
    return lines.join("\n") || "Nothing learned yet. Say: fix: ...";
  }

  // Natural corrections without prefix
  if (
    /^(wtf|what does that mean|that made no sense|makes no sense|confusing|weird|stop that|don't do that|dont do that|too much|chill|just talk|small talk|that was a terrible response|terrible response)/i.test(
      t
    )
  ) {
    L.smalltalk = "pure";
    L.always = pushUnique(
      L.always,
      "on hi/yo only small talk, no water protein flags",
      40
    );
    L.always = pushUnique(L.always, "plain English, no weird metaphors", 40);
    L.never = pushUnique(L.never, "decorative", 60);
    L.fixes = [
      ...L.fixes,
      { at: new Date().toISOString(), text: t.slice(0, 160) },
    ].slice(-80);
    L.awaiting = L.awaiting || {
      at: new Date().toISOString(),
      state: "home|greet",
      action: "offline-local",
    };
    saveLearn(L);
    try {
      penaltyFromCorrection(t.slice(0, 80));
    } catch {
      /* ignore */
    }
    return "Fair. That was a bad reply. Tell me exactly what I should say instead — e.g. instead say: Hey, what can I help you with?";
  }

  return null;
}

/** Strip banned phrases from a draft reply — keep line breaks (scanning needs chunks) */
export function polishReply(draft: string): string {
  const L = loadLearn();
  let out = draft;
  for (const n of L.never) {
    if (!n) continue;
    const re = new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    out = out.replace(re, "");
  }
  // Kill whole menu-dump blocks if they sneak through
  if (
    /I didn't map that to an action|Try plain:|Not completed:/i.test(out)
  ) {
    out = "I don't know what you're talking about.";
  }
  // Collapse only horizontal spaces/tabs on a line — NEVER squash newlines into one wall of text
  out = out
    .replace(/[^\S\n]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\.\s*\./g, ".")
    .replace(/^\s*[.,]\s*/gm, "")
    .trim();
  return out || "I don't know what you're talking about.";
}

export function wantsPureSmalltalk(): boolean {
  return loadLearn().smalltalk === "pure";
}

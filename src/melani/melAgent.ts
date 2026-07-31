import {
  applyLearnCommand,
  polishReply,
  preferredReplyFor,
  tryConsumeRetrain,
} from "./melLearn";
import { pushSessionMemory } from "./melContext";
import { runWardrobeCommand } from "./wardrobe/wardrobeAgent";
import { runWeatherCommand } from "./weather/weatherAgentTool";
import { makePlan, withBudget, runtimeStamp } from "./core/agentRuntime";
import { wonderEmit } from "./core/eventBus";
import { preferOfflinePath } from "./core/offlineStore";
import { ensureDefaultWeatherLocation } from "./weather/weatherCore";
import {
  applyRlCommand,
  applyUserTextAsReward,
  recordMelTurn,
} from "./rlAgent";
import {
  check_habits,
  clear_workspace_page,
  collapse_sidebar_sections,
  create_workspace_page,
  duplicate_workspace_page,
  favorite_workspace_page,
  get_food_plan,
  get_live_snapshot,
  get_sleep_today,
  find_book_source,
  life_log,
  list_habits_status,
  list_workspace_pages,
  list_pins,
  lock_meat,
  log_all_supplements,
  log_bowel_movement,
  get_bowel_today,
  log_brain_fog,
  log_meat_eaten,
  log_sleep_hours,
  log_usual_meal,
  log_food_nl,
  log_water,
  navigate_page,
  open_book,
  parseToolResult,
  pin_fact,
  rename_workspace_page,
  restore_workspace_page,
  search_logs,
  set_goal,
  set_habit_check,
  set_sidebar_section,
  make_section_root,
  move_workspace_page,
  run_shopping_command,
  run_care_command,
  run_task_command,
  trash_workspace_page,
  type MelToolResult,
  uncheck_habits,
  undo_meat_eaten,
  undo_usual_meal,
  undo_water,
  undo_workspace_action,
  unpin_fact,
  write_workspace_page,
  write_body_brief,
  fetch_stock_quarterly,
  trading_knowledge_brief,
  bookshelf_knowledge,
  econ_knowledge,
  search_highlights,
  evidence_pack,
  log_decision,
  list_decisions,
  list_due_decisions,
  weekly_intelligence_digest,
  last_intelligence_digest,
  operating_brain_brief,
  run_stats_lab,
  tryStatsLabCommand,
  run_agent_loop,
  tryAgentLoopCommand,
  run_math_lab,
  tryMathLabCommand,
  run_success_math,
  trySuccessMathLabCommand,
  run_content,
  tryContentLabCommand,
  run_finance_model,
  tryFinanceModelLabCommand,
  run_metrics,
  tryMetricsLabCommand,
  run_experiments,
  tryExperimentsLabCommand,
} from "./melTools";
import {
  formatLocalResearchReply,
  parseResearchSelectionCommand,
} from "./researchSelection";
import { runFinancePlan } from "./melFinanceTools";
import { looksLikeCareCommand } from "./care/parser";
import { offlineTradingBrief } from "./melTrading";
import {
  buildOperatingBrain,
  operatingBrainStatusReply,
} from "./operatingBrain";
import {
  contextFromToolResults,
  formatMelReceipts,
  isActionHistoryRequest,
  recordMelReceipt,
  splitMelInstructions,
  toolActionDomain,
  type MelExecutionContext,
} from "./melControl";
import {
  buildCorrectionPrompt,
  displayHumanReply,
  executeMelEnvelope,
  intentToMelEnvelope,
  looksLikeMelEnvelope,
  MEL_PROTOCOL_SYSTEM_RULE,
  parseMelEnvelope,
  rejectEnvelope,
  type MelEnvelope,
} from "./melProtocol";

export type MelAgentMode = "offline-local" | "local-model" | "action" | "grok-connected" | "research";

export type MelHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export type MelAgentRequest = {
  text: string;
  pageId?: string;
  pageTitle?: string;
  history?: MelHistoryMessage[];
  cloudAvailable?: boolean;
  localModelAvailable?: boolean;
  forceLocal?: boolean;
};

export type MelAgentResponse = {
  reply: string;
  mode: MelAgentMode;
  toolResults: MelToolResult[];
  /** RL episode id for thumbs up/down on this turn */
  rlEpisodeId?: string;
};

type Snapshot = {
  day: string;
  goals: { protein_g: number; calories: number; water_ml: number; sleep_hours: number };
  water: { ml: number; goalMl: number; remainingMl: number };
  meals: { logged: string[]; totals: { protein_g: number; calories: number } };
  sleep: { hours: number | null; bedtime: string; wake: string };
  brainFog: boolean | null;
  cycle: { phase: string; day: number; nextPeriodEstimate: string | null };
  food: {
    meat: "beef" | "salmon";
    locked: boolean;
    eaten: boolean;
    plate: string;
    proteinRemaining_g: number;
    caloriesRemaining: number;
    note: string;
  };
  liveContext: string;
};

const LAST_ACTION_DOMAIN_KEY = "wonder-mel-last-action-domain-v1";

function lastActionDomain(): string | null {
  try { return localStorage.getItem(LAST_ACTION_DOMAIN_KEY); }
  catch { return null; }
}

function rememberActionDomain(toolResults: MelToolResult[]): void {
  if (!toolResults.length) return;
  try {
    const domain = [...toolResults]
      .reverse()
      .filter((item) => item.ok)
      .map((item) => toolActionDomain(item.tool))
      .find(Boolean);
    if (domain) localStorage.setItem(LAST_ACTION_DOMAIN_KEY, domain);
  } catch {
    /* action routing still works from the current page without storage */
  }
}

function cleanReply(text: string): string {
  // Never paint raw JSON in the Mel panel — only chat_response
  const human = displayHumanReply(text);
  return polishReply(human)
    .replace(/\u2014/g, ",")
    .replace(/\u2013/g, "-")
    .replace(/—/g, ",")
    .replace(/–/g, "-")
    .trim();
}

function envelope(tool: string, summary: string, data?: unknown, ok = true): MelToolResult {
  return { ok, tool, summary, data };
}

function addTool(results: MelToolResult[], raw: string): void {
  const parsed = parseToolResult(raw);
  if (!results.some((item) => item.tool === parsed.tool && item.summary === parsed.summary)) results.push(parsed);
}

function parseAmountMl(text: string): number | null {
  const match = text.match(/(?:drank|drink|logged?|add(?:ed)?|had)\s+(\d+(?:\.\d+)?)\s*(l|liters?|litres?|ml|milliliters?)\b/i);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  return match[2].toLowerCase().startsWith("l") ? amount * 1000 : amount;
}

function cleanCommandValue(value: string | undefined): string | undefined {
  const clean = (value || "")
    .trim()
    .replace(/^["'`\u201c\u201d]+|["'`\u201c\u201d.,!?]+$/g, "")
    .trim();
  return clean || undefined;
}

/**
 * Full bowel parse: had + type + feel + color from one casual line.
 * "I shat today type 7 liquidy" · "pooped type 4 easy" · "no BM".
 */
function parseBowelIntent(text: string): {
  had: boolean;
  look?: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  feel?: "easy" | "mild" | "strain" | "urgent";
  color?: "brown" | "green" | "gray" | "dark" | "red";
} | null {
  const t = text
    .toLowerCase()
    .replace(/[.!?]+$/g, "")
    .trim();
  if (!t) return null;

  if (
    /\b(create|make|add|build|new)\b/.test(t)
    && /\b(tracker|page|habit|feature|app)\b/.test(t)
    && !/\b(had|have|did|poop|shit|shat|yes|no|log|mark)\b/.test(t)
  ) {
    return null;
  }

  const aboutBowel =
    /\b(bowel(?:\s*movement)?|bowel\s*point|bm\b|poo+p(?:ed|ing)?|shit(?:t(?:ed|ing))?|shat|dump|stool|bristol|liquidy|liquid)\b/i.test(
      t
    )
    || /\btype\s*[1-7]\b/.test(t)
    || /\b(pellets?|lumpy|smooth\s+snake|watery|mushy)\b/.test(t);
  if (!aboutBowel) return null;

  const lookMatch =
    t.match(/\b(?:type|bristol|look)\s*([1-7])\b/)
    || t.match(/\b([1-7])\s*(?:out of 7|\/7)?\b/);
  let look: 1 | 2 | 3 | 4 | 5 | 6 | 7 | undefined;
  if (lookMatch?.[1]) {
    look = Number(lookMatch[1]) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
  } else if (/\bpellets?\b/.test(t)) look = 1;
  else if (/\blumpy\b/.test(t)) look = 2;
  else if (/\bcracked\b/.test(t)) look = 3;
  else if (/\b(smooth|snake|ideal)\b/.test(t)) look = 4;
  else if (/\bsoft\s*blobs?\b/.test(t)) look = 5;
  else if (/\bmushy\b/.test(t)) look = 6;
  else if (/\b(watery|liquidy|liquid)\b/.test(t)) look = 7;

  let feel: "easy" | "mild" | "strain" | "urgent" | undefined;
  if (/\b(urgent|rushed?|had to (?:run|go)|loose rush)\b/.test(t)) feel = "urgent";
  else if (/\b(strain|strained|hard push|incomplete)\b/.test(t)) feel = "strain";
  else if (/\b(mild|some effort|a little work)\b/.test(t)) feel = "mild";
  else if (/\b(easy|no push|effortless)\b/.test(t)) feel = "easy";
  else if (/\b(liquidy|liquid|watery|mushy)\b/.test(t)) feel = "urgent";

  let color: "brown" | "green" | "gray" | "dark" | "red" | undefined;
  if (/\b(pale|clay|grey|gray)\b/.test(t)) color = "gray";
  else if (/\b(black|tarry|tar)\b/.test(t)) color = "dark";
  else if (/\b(red|maroon|bloody|blood)\b/.test(t)) color = "red";
  else if (/\bgreen\b/.test(t)) color = "green";
  else if (/\bbrown\b/.test(t)) color = "brown";

  if (
    /\b(no\s+(?:bowel|bm|poop|shit)|bowel\s+(?:is\s+)?no|didn'?t\s+(?:have\s+(?:a\s+)?)?(?:bowel|bm|poop|shit)|did\s+not\s+(?:poop|shit)|haven'?t\s+(?:poop(?:ed)?|shit(?:ted)?)|without\s+(?:a\s+)?(?:bowel|bm)|skip(?:ped)?\s+(?:bowel|bm|poop))\b/i.test(
      t
    )
    || /\b(?:log|mark|set|check)\s+(?:my\s+)?(?:bowel|bm|poop).{0,16}\bno\b/i.test(t)
  ) {
    return { had: false };
  }

  if (
    look != null
    || feel != null
    || color != null
    || /\b(yes|yep|yeah|yup)\b/.test(t)
    || /\b(?:i\s+)?(?:just\s+)?(?:fucking\s+|fr\s+)?(?:shit(?:ted)?|poop(?:ed)?|shat)\b/i.test(t)
    || /\b(?:had|have|did|went)\b.{0,28}\b(bowel|bm|poop|shit|dump)\b/i.test(t)
    || /\b(?:log|mark|check|track|record|set|tap)\b.{0,28}\b(bowel|bm|poop|shit)\b/i.test(t)
    || /\b(bowel|bm|poop).{0,20}\b(yes|done|today|point|movement)\b/i.test(t)
    || /^(?:bowel|bm|poop(?:ed)?|shit(?:ted)?)(?:\s+today)?$/i.test(t)
    || /\b(mark|log|check|track)\b/i.test(t)
  ) {
    return {
      had: true,
      ...(look != null ? { look } : {}),
      ...(feel ? { feel } : {}),
      ...(color ? { color } : {}),
    };
  }

  return null;
}

/**
 * Strip chat fluff so "hey move the bookshelf under learn" still hits the move tool.
 * (Without this, Mel falls through to a slow model call and sits on "…".)
 */
function stripCommandFiller(text: string): string {
  let q = text.trim().replace(/[.!?]+$/g, "").trim();
  // Leading greetings / names
  q = q.replace(/^(?:hey|hi|hello|yo|sup|ok|okay|alright|please|pls|mel|wonder)\b[\s,!.:-]*/i, "");
  // "can you / could you / would you please …"
  q = q.replace(/^(?:(?:can|could|would|will)\s+you\s+)?(?:please\s+)?/i, "");
  // "i want you to / just / go ahead and"
  q = q.replace(/^(?:i\s+(?:want|need|need\s+you\s+to|want\s+you\s+to)\s+|go\s+ahead\s+and\s+|just\s+)/i, "");
  return q.trim();
}

type CreatePageCommand = {
  title?: string;
  parent?: string;
  asAgent: boolean;
};

function parseCreatePageCommand(text: string): CreatePageCommand | null {
  const q = text.trim().replace(/[.!]+$/, "");
  const placedAndNamed = q.match(
    /^(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?(?:create|make|add|open)\s+(?:me\s+)?(?:a\s+)?new\s+(page|sub[ -]?page|agent)\s+(?:under|inside|into|in)\s+(?:the\s+)?(?:page\s+)?(.+?)\s+(?:and\s+)?(?:call|name|title)\s+it\s+(.+)$/i
  );
  if (placedAndNamed?.[1] && placedAndNamed[2] && placedAndNamed[3]) {
    return {
      title: cleanCommandValue(placedAndNamed[3]),
      parent: cleanCommandValue(placedAndNamed[2]),
      asAgent: placedAndNamed[1].toLowerCase() === "agent",
    };
  }

  const match = q.match(
    /^(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?(?:create|make|add)\s+(?:me\s+)?(?:a\s+)?(?:new\s+)?(page|sub[ -]?page|agent)(?:\s+(.+))?$/i
  ) || q.match(/^(?:please\s+)?open\s+(?:me\s+)?(?:a\s+)?new\s+(page|sub[ -]?page|agent)(?:\s+(.+))?$/i)
    || q.match(/^(?:please\s+)?new\s+(page|sub[ -]?page|agent)(?:\s+(.+))?$/i);
  if (!match) return null;

  const kind = match[1].toLowerCase();
  let tail = (match[2] || "").trim();
  let parent: string | undefined;
  const location = tail.match(/\s+(?:under|inside|into|in)\s+(?:the\s+)?(?:page\s+)?(.+)$/i);
  if (location?.[1]) {
    parent = cleanCommandValue(location[1]);
    tail = tail.slice(0, location.index).trim();
  }
  if (/^(?:here|inside this page|under this page)$/i.test(tail)) {
    parent = "this page";
    tail = "";
  }
  if (kind.startsWith("sub") && !parent) parent = "this page";
  tail = tail.replace(/^(?:called|named|titled|for)\s+/i, "");
  return {
    title: cleanCommandValue(tail),
    parent,
    asAgent: kind === "agent",
  };
}

function parseRenamePageCommand(text: string): { target?: string; title: string } | null {
  const q = text.trim().replace(/[.!]+$/, "");
  let match = q.match(/^rename\s+(?:this|current)(?:\s+page)?\s+to\s+(.+)$/i);
  if (match?.[1]) return { title: cleanCommandValue(match[1]) || "" };
  match = q.match(/^rename\s+(?:the\s+)?page\s+(.+?)\s+to\s+(.+)$/i);
  if (match?.[1] && match[2]) {
    return { target: cleanCommandValue(match[1]), title: cleanCommandValue(match[2]) || "" };
  }
  match = q.match(/^rename\s+(.+?)\s+to\s+(.+)$/i);
  if (match?.[1] && match[2]) {
    return { target: cleanCommandValue(match[1]), title: cleanCommandValue(match[2]) || "" };
  }
  return null;
}

function currentOrNamedPage(value: string | undefined): string | undefined {
  // "the bookshelf page" → "bookshelf" (drop leading the/page and trailing "page")
  const clean = cleanCommandValue(
    value
      ?.replace(/^(?:the\s+)?page\s+/i, "")
      .replace(/^(?:the\s+)/i, "")
      .replace(/\s+page$/i, "")
      .replace(/\s+(?:section|folder|toggle)$/i, "")
  );
  return clean && !/^(?:(?:this|that|current|last|new)(?:\s+page)?|it)$/i.test(clean)
    ? clean
    : undefined;
}

function parseWritePageCommand(text: string): {
  target?: string;
  content: string;
  mode: "append" | "replace";
} | null {
  const q = text.trim().replace(/[.!]+$/, "");
  let match = q.match(/^replace\s+(?:(?:the\s+)?(?:content|text)\s+)?(?:on|in)\s+(.+?)\s+with\s+(.+)$/i);
  if (match?.[1] && match[2]) {
    return {
      target: currentOrNamedPage(match[1]),
      content: cleanCommandValue(match[2]) || "",
      mode: "replace",
    };
  }
  match = q.match(/^write\s+(?:on|to|in)\s+(.+?)\s*:\s*(.+)$/i);
  if (match?.[1] && match[2]) {
    return {
      target: currentOrNamedPage(match[1]),
      content: cleanCommandValue(match[2]) || "",
      mode: "append",
    };
  }
  match = q.match(/^(?:add|append|write|put)\s+["\u201c](.+?)["\u201d]\s+(?:to|on|in)\s+(.+)$/i);
  if (match?.[1] && match[2]) {
    return {
      target: currentOrNamedPage(match[2]),
      content: match[1].trim(),
      mode: "append",
    };
  }
  match = q.match(/^(?:add|append|write|put)\s+(.+?)\s+(?:to|on|in)\s+((?:this|current)\s+page|(?:the\s+)?page\s+.+)$/i);
  if (match?.[1] && match[2]) {
    return {
      target: currentOrNamedPage(match[2]),
      content: cleanCommandValue(match[1]) || "",
      mode: "append",
    };
  }
  return null;
}

function explainPageFromFirstPrinciples(pageTitle: string | undefined, topic: string): string {
  const page = (pageTitle || "this page").toLowerCase();
  if (/bookshelf|library|book/.test(page)) {
    return [
      "Bookshelf, from first principles",
      "This page is a memory system, not a list of files. A book enters a folder, your bookmark preserves location, highlights capture exact evidence, and your interpretation turns someone else's sentence into your own model.",
      "The useful loop is: read, mark only what changes your thinking, explain why it matters in your own words, then return later. Progress measures location, not understanding. Quotes preserve the source; interpretations preserve what your mind did with it.",
      "Concrete example: highlight a claim in Moonwalk, add what it reveals about performance or identity, and save it. The next open resumes at that evidence instead of making you rebuild context.",
    ].join("\n\n");
  }
  if (/care concierge|appointment/.test(page)) {
    return [
      "Care Concierge, from first principles",
      "The system separates intent, consent, execution, and proof. Saying you want an appointment creates a draft. Approval authorizes only the exact office, visit, date window, and information shown. A sent request means an office was contacted. A confirmed appointment exists only after a date and time are recorded.",
      "The voice layer is administrative. It can ask for openings, repeat your availability, collect preparation instructions, and record the office response. It cannot diagnose symptoms, invent clinical details, accept an out-of-window slot, share extra private information, or authorize payment without you.",
      "Every transition leaves a receipt. If a provider is not connected, Mel says that plainly and keeps the request local. For urgent symptoms, this desk stops scheduling and directs you to immediate clinical help instead of delaying care.",
    ].join("\n\n");
  }
  if (/fitness|sleep|meal|gym|data|hygiene|health/.test(page)) {
    return [
      `${pageTitle || "Health"}, from first principles`,
      "This page turns a feeling into a feedback loop: measure one behavior, compare it with your own baseline, watch the trend, then make one decision. A single day is noisy. Repeated measurements reveal direction.",
      "Targets are reference lines, not grades. The important questions are: what changed, was it measurement noise or a real pattern, and what action is small enough to repeat tomorrow? Mel should explain every score by naming its inputs and never pretend an estimate is a diagnosis.",
    ].join("\n\n");
  }
  if (/wardrobe|fashion/.test(page)) {
    return [
      "Wardrobe, from first principles",
      "The system reduces clothing decisions by connecting four things: what you own, the real context, your constraints, and the look you want. Weather and occasion filter the inventory; fit, color, wear history, and care state rank what remains.",
      "A useful recommendation should always explain why it won: comfortable for the temperature, appropriate for the event, visually coherent, clean, and not over-worn. That makes the suggestion inspectable instead of magical theater.",
    ].join("\n\n");
  }
  if (/shopping/.test(page)) {
    return [
      "Shopping, from first principles",
      "The flow is inventory, need, candidate, approval, purchase. Mel can infer a missing item from your saved household state, compare options, and prepare a cart. You remain the approval point before money moves.",
      "Every recommendation should expose quantity, unit price, substitution, delivery constraint, and why it was selected. Convenience is useful only when the decision remains visible.",
    ].join("\n\n");
  }
  return [
    `${pageTitle || "This page"}, from first principles`,
    "Start with the job this page performs, identify the inputs it can actually observe, then follow how those inputs become a decision or action. A trustworthy system separates measured facts, calculated estimates, and recommendations.",
    "Ask me about any number or label on the page. I will explain what it measures, where it comes from, what can move it, what it cannot prove, and one concrete example.",
  ].join("\n\n");
}

function isPageExplanationRequest(q: string, pageTitle?: string): boolean {
  if (!/\b(explain|teach|understand|first principles|what am i looking at|how does this work)\b/i.test(q)) {
    return false;
  }
  return (
    /\b(this|current)\s+(page|screen|view|desk)\b/i.test(q) ||
    /\bvix\b|revenue|yoy|qoq|margin|price chart|volume/i.test(q)
  );
}

function planAndExecute(text: string, pageId?: string, pageTitle?: string): MelToolResult[] {
  // Strip "hey / can you / please" first so action lines still match
  const q = stripCommandFiller(text);
  const low = q.toLowerCase();
  const results: MelToolResult[] = [];

  // ── Finance hands (ledger mutate + true books) — before generic open/tasks ──
  const financeHits = runFinancePlan(q);
  if (financeHits.length) {
    results.push(...financeHits);
    // After log / recategorize / transfer — open Books capital or ledger when useful
    const tools = financeHits.map((r) => r.tool);
    if (tools.some((t) => /log_expense|recategorize|apply_transfer|apply_all/.test(t || ""))) {
      addTool(results, navigate_page("finances"));
    }
    return results;
  }

  if (isActionHistoryRequest(q)) {
    const history = formatMelReceipts(/history|receipts|actions/i.test(q) ? 8 : 1);
    return [envelope("action_history", history.summary, history.receipts)];
  }

  if (isPageExplanationRequest(q, pageTitle)) {
    return [
      envelope(
        "explain_page",
        explainPageFromFirstPrinciples(pageTitle, q),
        { pageId, pageTitle }
      ),
    ];
  }

  // ── Bowel movement (Fitness Yes/No + look) — BEFORE tasks steal "mark …" ──
  const bowelIntent = parseBowelIntent(q);
  if (bowelIntent !== null) {
    addTool(
      results,
      log_bowel_movement(
        bowelIntent.had,
        undefined,
        bowelIntent.look,
        bowelIntent.feel,
        bowelIntent.color
      )
    );
    return results;
  }
  if (
    /^(?:bowel|bm|bowel movement|did i (?:poop|shit|go)|bowel status)\??$/i.test(q)
  ) {
    addTool(results, get_bowel_today());
    return results;
  }
  // Tracker already lives on Fitness — don't spawn a task or fake page
  if (
    /\b(create|make|add|build|new)\b/.test(low)
    && /\b(bowel|poop|bm)\b/.test(low)
    && /\b(tracker|habit|page|log|feature)\b/.test(low)
  ) {
    results.push(
      envelope(
        "log_bowel_movement",
        "Bowel movement tracker already exists on Fitness (Yes/No under sleep). Next time just say “I pooped” or “no BM today” and I’ll mark it — no task name needed.",
        { exists: true, pageId: "pg-fitness" },
        true
      )
    );
    addTool(results, navigate_page("fitness"));
    return results;
  }

  const learned = applyLearnCommand(q);
  if (learned) return [envelope("learn", learned)];

  const wantsHelp = /^(help|commands|what can you do|how do i use mel)\??$/i.test(q);
  if (wantsHelp) {
    return [envelope("help", "Help requested.")];
  }

  if (
    looksLikeCareCommand(q)
    || /^(?:open|show|go to)\s+(?:my\s+)?(?:care|care concierge)$/i.test(q)
    || /^(?:my\s+)?(?:dentist|doctor|provider|clinic|office)\s+(?:is|:)/i.test(q)
  ) {
    addTool(results, run_care_command(q));
    return results;
  }

  if (/^undo(?:\s+(?:that|the\s+last\s+(?:workspace\s+)?(?:change|action)))?[.!]?$/i.test(q)) {
    addTool(results, undo_workspace_action());
    return results;
  }

  if (/^(?:close|collapse|shut)\s+(?:all\s+)?(?:the\s+)?(?:sidebar\s+)?(?:toggles?|folders?|sections?|subpages?|trees?|totals?)(?:\s+(?:in|on)\s+(?:the\s+)?(?:main\s+)?page)?[.!]?$/i.test(q)
    || /^(?:close|collapse)\s+(?:the\s+)?(?:whole\s+)?sidebar[.!]?$/i.test(q)) {
    addTool(results, collapse_sidebar_sections());
    return results;
  }

  const sidebarSection = q.match(
    /^(open|expand|close|collapse)\s+(?:the\s+)?(.+?)\s+(?:toggle|folder|section)(?:\s+(?:in|on)\s+(?:the\s+)?sidebar)?[.!]?$/i
  ) || q.match(
    /^(open|expand|close|collapse)\s+(?:the\s+)?(.+?)\s+(?:in|on)\s+(?:the\s+)?sidebar[.!]?$/i
  );
  if (sidebarSection?.[1] && sidebarSection[2]) {
    addTool(
      results,
      set_sidebar_section(
        cleanCommandValue(sidebarSection[2]) || "",
        /open|expand/i.test(sidebarSection[1])
      )
    );
    return results;
  }

  const createPage = parseCreatePageCommand(q);
  if (createPage) {
    addTool(
      results,
      create_workspace_page(
        createPage.title,
        createPage.parent,
        pageId,
        createPage.asAgent
      )
    );
    return results;
  }

  const renamePage = parseRenamePageCommand(q);
  if (renamePage) {
    addTool(results, rename_workspace_page(renamePage.target, renamePage.title, pageId));
    return results;
  }

  const trashPage = q.match(/^(?:delete|trash|remove)\s+(?:(?:this|current)\s+page|(?:the\s+)?page(?:\s+(?:called|named))?\s+(.+))$/i)
    || q.match(/^(?:delete|trash|remove)\s+(.+?)\s+page$/i);
  if (trashPage) {
    addTool(results, trash_workspace_page(currentOrNamedPage(trashPage[1]), pageId));
    return results;
  }

  const restorePage = q.match(/^restore\s+(?:the\s+)?(?:page\s+)?(.+)$/i);
  if (restorePage?.[1]) {
    addTool(results, restore_workspace_page(cleanCommandValue(restorePage[1]) || ""));
    return results;
  }

  const duplicatePage = q.match(/^duplicate\s+(?:(?:this|current)\s+page|(?:the\s+)?(?:page\s+)?(.+))$/i);
  if (duplicatePage) {
    addTool(results, duplicate_workspace_page(currentOrNamedPage(duplicatePage[1]), pageId));
    return results;
  }

  /**
   * Move / nest / un-nest pages from chat. Smart about sections:
   * - "move Bookshelf under Learn" → put Bookshelf at TOP of Learn (parent cleared)
   * - "move Work under Learn" → nest Work inside Bookshelf (and open Learn)
   * - nest pages under Learn / Health
   */
  const movePage =
    q.match(
      /^(?:move|put|place|nest|shuffle)\s+(?:the\s+)?(.+?)\s+(under|inside|into|above|before|below|after|to|into)\s+(?:the\s+)?(?:page\s+|section\s+|folder\s+)?(.+)$/i
    ) ||
    text.match(
      /(?:move|put|place|nest|shuffle)\s+(?:the\s+)?(.+?)\s+(under|inside|into|above|before|below|after)\s+(?:the\s+)?(?:page\s+|section\s+|folder\s+)?(.+?)(?:[.!?]|$)/i
    );
  if (movePage?.[1] && movePage[2] && movePage[3]) {
    const relation = movePage[2].toLowerCase();
    const position = /under|inside|into|to/.test(relation)
      ? "inside"
      : /above|before/.test(relation)
        ? "before"
        : "after";
    const targetName = currentOrNamedPage(movePage[1]);
    const destRaw = cleanCommandValue(
      movePage[3]
        .replace(/^(?:the\s+)?(?:page\s+|section\s+|folder\s+)?/i, "")
        .replace(/\s+(?:section|folder|toggle|page)$/i, "")
    ) || "";

    // Section labels: Health / Learn only (Work section is gone)
    const destSection: "health" | "learn" | null = /^(learn|learning)$/i.test(destRaw)
      ? "learn"
      : /^(health)$/i.test(destRaw)
        ? "health"
        : null;

    const isLearnRoot =
      !!targetName &&
      /^(bookshelf|library|books|learn|learning|finances?|money)$/i.test(targetName);
    const isHealthRoot =
      !!targetName && /^(fitness|hygiene|my data|data|health)$/i.test(targetName);

    if (destSection === "learn") {
      addTool(results, set_sidebar_section("learn", true));
      if (isLearnRoot) {
        // Put Bookshelf / Finances at the TOP of Learn
        const rootName = /financ|money/i.test(targetName || "")
          ? "finances"
          : "bookshelf";
        addTool(results, make_section_root(rootName, "learn", pageId));
        return results;
      }
      // Nest other pages under Bookshelf inside Learn
      addTool(results, make_section_root("bookshelf", "learn", pageId));
      addTool(results, move_workspace_page(targetName, "bookshelf", "inside", pageId));
      return results;
    }

    if (destSection === "health") {
      addTool(results, set_sidebar_section("health", true));
      if (isHealthRoot) {
        addTool(results, make_section_root(targetName || "fitness", "health", pageId));
        return results;
      }
      addTool(results, make_section_root("fitness", "health", pageId));
      addTool(results, move_workspace_page(targetName, "fitness", "inside", pageId));
      return results;
    }

    // "under work" → Learn (Work + World Monitor deleted)
    if (/^(work)$/i.test(destRaw)) {
      addTool(results, set_sidebar_section("learn", true));
      addTool(results, make_section_root("bookshelf", "learn", pageId));
      if (targetName && !/^(work|world monitor)$/i.test(targetName)) {
        addTool(results, move_workspace_page(targetName, "bookshelf", "inside", pageId));
      } else {
        addTool(results, navigate_page("bookshelf"));
      }
      return results;
    }

    // Plain page-to-page move
    addTool(
      results,
      move_workspace_page(targetName, destRaw, position, pageId)
    );
    return results;
  }

  // One-shot fix: put Bookshelf + Finances back under Learn
  if (
    /^(?:fix|repair|reset)\s+(?:the\s+)?(?:sidebar|learn|bookshelf|layout)(?:\s+please)?$/i.test(q) ||
    /^(?:put|move)\s+(?:the\s+)?bookshelf\s+back(?:\s+(?:under|to)\s+learn)?$/i.test(q) ||
    /^fix learn$/i.test(q)
  ) {
    addTool(results, make_section_root("bookshelf", "learn", pageId));
    addTool(results, make_section_root("finances", "learn", pageId));
    addTool(results, set_sidebar_section("learn", true));
    addTool(results, navigate_page("bookshelf"));
    return results;
  }

  const writePage = parseWritePageCommand(q);
  if (writePage) {
    addTool(
      results,
      write_workspace_page(writePage.target, writePage.content, writePage.mode, pageId)
    );
    return results;
  }

  const clearPage = q.match(/^clear\s+(?:(?:this|current)\s+page|(?:the\s+)?(?:page\s+)?(.+))$/i);
  if (clearPage) {
    addTool(results, clear_workspace_page(currentOrNamedPage(clearPage[1]), pageId));
    return results;
  }

  const favoritePage = q.match(/^(favorite|unfavorite)\s+(?:(?:this|current)\s+page|(?:the\s+)?(?:page\s+)?(.+))$/i);
  if (favoritePage) {
    addTool(
      results,
      favorite_workspace_page(
        currentOrNamedPage(favoritePage[2]),
        favoritePage[1].toLowerCase() === "favorite",
        pageId
      )
    );
    return results;
  }

  if (/^(?:list|show)(?:\s+me)?\s+(?:all\s+)?(?:my\s+)?pages$|^what pages do i have\??$/i.test(q)) {
    addTool(results, list_workspace_pages());
    return results;
  }

  if (/\b(?:write|show|give me|open|refresh)?\s*(?:my\s+)?(?:nightly\s+|body\s+)?brief\b/i.test(low) || low === "tonight") {
    addTool(results, write_body_brief());
  }

  if (/^(?:status|today|snapshot|check in|check-in)$/i.test(q) || /\b(?:what(?:'s| is) left|how am i doing|show (?:me )?(?:my )?(?:status|numbers)|today'?s status)\b/i.test(low)) {
    addTool(results, get_live_snapshot(pageId, pageTitle));
  }

  // Markets / options education offline (always available)
  if (
    /^(?:trading|markets?|options?)\s*(?:101|basics|desk|help)?$/i.test(q) ||
    /\b(?:teach me|explain)\b.*\b(?:options?|trading|iv crush|greeks|position siz)/i.test(low)
  ) {
    addTool(results, trading_knowledge_brief(q));
  }

  // YouTube / content backbone (views, retention seconds, findings)
  const contentHit = tryContentLabCommand(q);
  if (contentHit) {
    addTool(results, run_content(q));
    return results;
  }

  // Quiet finance runway model
  const finModelHit = tryFinanceModelLabCommand(q);
  if (finModelHit) {
    addTool(results, run_finance_model(q));
    return results;
  }

  // Backend priority engines — short protocols only (no math UI)
  const successHit = trySuccessMathLabCommand(q);
  if (successHit) {
    addTool(results, run_success_math(
      q.replace(/^(?:apply|accelerate|success\s+math)\s*/i, "").trim() || "list"
    ));
    return results;
  }
  if (
    /\b(?:accelerate|success\s+math|apply\s+(?:sleep|focus|optimize|capital|trend|skill|life))\b/i.test(
      low
    )
  ) {
    addTool(results, run_success_math(q.replace(/^(?:apply|accelerate)\s*/i, "").trim() || "next"));
    return results;
  }

  // Metrics registry (chat-only, no board)
  const metricsHit = tryMetricsLabCommand(q);
  if (metricsHit) {
    addTool(results, run_metrics(q));
    return results;
  }

  // Experiment notebook (chat-only)
  const expHit = tryExperimentsLabCommand(q);
  if (expHit) {
    addTool(results, run_experiments(q));
    return results;
  }
  if (/^(?:science|scientist|lab\s+mode)$/i.test(q)) {
    addTool(results, run_content("videos"));
    addTool(results, run_finance_model("runway"));
    addTool(results, run_success_math("list"));
    return results;
  }

  // Library math (textbook models) — only explicit lesson ids / math next
  if (
    /^(?:math|learn\s+math|crude\s+math|math\s+lab)\b/i.test(q) ||
    /\b(?:mathematical\s+models?|crude\s+models?)\b/i.test(low)
  ) {
    if (/^(?:math|math\s+lab|learn\s+math)$/i.test(q.trim())) {
      addTool(results, run_success_math("list"));
      return results;
    }
    const arg = q.replace(/^(?:math|learn\s+math|crude\s+math|math\s+lab)\s*/i, "").trim() || "list";
    if (arg === "list" || arg === "help" || arg === "empire") {
      addTool(results, run_success_math("list"));
      return results;
    }
    addTool(results, run_math_lab(arg));
    return results;
  }
  const mathHit = tryMathLabCommand(q);
  if (mathHit) {
    // success path already returned above; this is library hits like bare "linear"
    if (trySuccessMathLabCommand(q)) {
      addTool(results, run_success_math(q));
    } else {
      addTool(results, run_math_lab(q.replace(/^math\s+/i, "").trim() || q));
    }
    return results;
  }

  // Stats lab — classical models, forecasts, correlations (local pure math)
  const statsHit = tryStatsLabCommand(q);
  if (statsHit) {
    addTool(results, run_stats_lab(q));
    return results;
  }
  if (
    /^(?:stats?(?:\s+lab)?|statistical\s+(?:genius|models?)|run\s+(?:all\s+)?models?|be a statistical genius|stats genius)\b/i.test(
      q
    )
  ) {
    addTool(results, run_stats_lab(q));
    return results;
  }

  // Level 4: Operating Brain (correlations + ranked moves)
  if (
    /^(?:operating\s+brain|brain\s+brief|top\s+move|what matters)\b/i.test(q) ||
    /\b(?:operating brain|be (?:extremely )?smart|what should i (?:do|focus|prioritize)|what(?:'s| is) (?:my )?priority)\b/i.test(
      low
    )
  ) {
    addTool(results, operating_brain_brief());
    return results;
  }

  // Level 3: compound weekly digest
  if (
    /^(?:weekly\s+)?(?:intelligence\s+)?digest\b/i.test(q) ||
    /^(?:level\s*3|l3)\b/i.test(q) ||
    /\b(?:compound brief|week(?:ly)? (?:intel|intelligence|brief|report)|os digest)\b/i.test(
      low
    )
  ) {
    addTool(results, weekly_intelligence_digest());
    return results;
  }
  if (
    /^(?:last|previous)\s+(?:weekly\s+)?digest\b/i.test(q) ||
    /^last l3\b/i.test(q)
  ) {
    addTool(results, last_intelligence_digest());
    return results;
  }
  if (
    /^(?:due decisions?|decisions? due|revisit(?:s)? due)\b/i.test(q) ||
    /\bwhat (?:decisions? )?(?:are )?due\b/i.test(low)
  ) {
    addTool(results, list_due_decisions());
    return results;
  }

  // Phase B: decisions log
  if (
    /^(?:list|show)\s+(?:my\s+)?decisions?\b/i.test(q) ||
    /^decisions?\??$/i.test(q) ||
    /\bwhat did i decide\b/i.test(low)
  ) {
    const dom = /\bmoney\b/.test(low)
      ? "money"
      : /\bbody\b/.test(low)
        ? "body"
        : /\bbuild\b/.test(low)
          ? "build"
          : /\bmarkets?\b/.test(low)
            ? "markets"
            : undefined;
    addTool(results, list_decisions(dom as "money" | "body" | "build" | "life" | "markets" | undefined));
    return results;
  }
  const decideMatch = q.match(
    /^(?:decide|decision|log decision)\s+(?:(money|body|build|life|markets)\s*:\s*)?(.+?)\s*(?:→|->|=>|:)\s*(.+?)(?:\s*\|\s*revisit\s+(\d+))?\s*$/i
  ) || q.match(
    /^(?:decide|decision)\s+(?:(money|body|build|life|markets)\s+)?(.+)$/i
  );
  if (decideMatch) {
    const domain = (decideMatch[1]?.toLowerCase() || "money") as
      | "money"
      | "body"
      | "build"
      | "life"
      | "markets";
    if (decideMatch[3]) {
      const revisit = decideMatch[4] ? Number(decideMatch[4]) : undefined;
      addTool(
        results,
        log_decision(decideMatch[2].trim(), decideMatch[3].trim(), domain, revisit)
      );
    } else {
      // "decide money keep grok" → treat whole as choice with generic question
      addTool(
        results,
        log_decision("open decision", decideMatch[2].trim(), domain)
      );
    }
    return results;
  }

  // V2: highlights index (before generic bookshelf)
  if (
    /^(?:my\s+)?highlights?\b/i.test(q) ||
    /\b(?:what did i highlight|show (?:me )?(?:my )?highlights?|list (?:my )?highlights?)\b/i.test(
      low
    ) ||
    /\bhighlights?\s+(?:about|on|for|of)\s+/i.test(low) ||
    /\b(?:search|find)\s+(?:my\s+)?highlights?\b/i.test(low)
  ) {
    const hq = q
      .replace(
        /^(?:search|find|show|list|what did i highlight|my)\s+(?:my\s+)?highlights?(?:\s+(?:about|on|for|of))?\s*/i,
        ""
      )
      .replace(/\?+$/, "")
      .trim();
    addTool(results, search_highlights(hq));
    return results;
  }

  // Bookshelf brain — her real titles, notes, highlights
  if (
    /^(?:my\s+)?(?:bookshelf|shelf|library|books?)\b/i.test(q) ||
    /^(?:what(?:'s| is| am i)|show|list)\s+(?:on\s+)?(?:my\s+)?(?:bookshelf|shelf|reading|books?)/i.test(
      q
    ) ||
    /\b(?:what am i reading|books? i(?:'m| am) reading|my economics books?|econ(?:omics)? books?)\b/i.test(
      low
    ) ||
    /\b(?:search|find)\s+(?:my\s+)?(?:shelf|bookshelf|library|books?)\b/i.test(low) ||
    /\b(?:notes?)\s+(?:from|in|on)\s+(?:my\s+)?(?:shelf|bookshelf|books?)\b/i.test(low)
  ) {
    const shelfQ =
      q
        .replace(
          /^(?:search|find|show|list|what(?:'s| is)?|my)\s+(?:my\s+)?(?:bookshelf|shelf|library|books?|reading|notes?)(?:\s+(?:for|about|on))?\s*/i,
          ""
        )
        .trim() || q;
    addTool(results, bookshelf_knowledge(shelfQ));
    return results;
  }

  // Economics canon — opportunity cost, incentives, price signals, etc.
  if (
    /^(?:econ(?:omics)?)\s*(?:101|basics|desk|help|canon)?$/i.test(q) ||
    /\b(?:explain|teach|what is|what's|define)\b.{0,40}\b(?:opportunity cost|incentives?|scarcity|elasticity|externality|comparative advantage|price signals?|moral hazard|adverse selection|sunk cost|expected value|capital allocation|real vs nominal|supply and demand|marginal thinking)\b/i.test(
      low
    ) ||
    /\b(?:economics? framework|econ lesson|econ concept)\b/i.test(low)
  ) {
    addTool(results, econ_knowledge(q));
    // Also attach ranked evidence for money/teach questions
    addTool(results, evidence_pack(q, pageId, pageTitle));
    return results;
  }

  // "NVDA quarterly" / "quarterly reports" / "earnings for AAPL"
  const quarterlyAsk =
    q.match(
      /^(?:quarterly|earnings|fundamentals?)\s+(?:for\s+|on\s+|of\s+)?([A-Za-z.]{1,6}(?:\s*,\s*[A-Za-z.]{1,6})*)$/i
    ) ||
    q.match(
      /^([A-Za-z]{1,5})\s+(?:quarterly|earnings|fundamentals?|report|reports)$/i
    ) ||
    (/\b(quarterly reports?|earnings packs?|show (?:me )?quarters)\b/i.test(low)
      ? (["", "AAPL,MSFT,NVDA,GOOGL,META,AMZN,TSLA,AMD"] as RegExpMatchArray)
      : null);
  if (quarterlyAsk) {
    // Async tool is resolved in runMelAgent (see stock path below)
    results.push(
      envelope(
        "stock_quarterly_pending",
        String(quarterlyAsk[1] || "AAPL,MSFT,NVDA,GOOGL,META,AMZN,TSLA,AMD")
          .replace(/\s+/g, "")
          .toUpperCase()
      )
    );
  }

  if (/^pins$/i.test(q)) addTool(results, list_pins());
  const pin = q.match(/^pin\s+(.+)$/i);
  if (pin?.[1]) addTool(results, pin_fact(pin[1].trim()));
  const unpin = q.match(/^unpin\s+(.+)$/i);
  if (unpin?.[1]) addTool(results, unpin_fact(unpin[1].trim()));

  const goal = q.match(/^goal\s+([a-z_]+)\s+(.+)$/i)
    || q.match(/^(?:set|change|make)\s+(?:my\s+)?(protein|calories?|cals?|carbs?|fat|fiber|water|sleep)\s+(?:goal\s+)?(?:to\s+)?(.+)$/i)
    || q.match(/^(protein|calories?|cals?|carbs?|fat|fiber|water|sleep)\s+goal\s+(?:is\s+|to\s+)?(.+)$/i);
  if (goal?.[1] && goal[2]) addTool(results, set_goal(goal[1], goal[2].trim()));

  const search = q.match(/^(?:find|search)\s+(?:my\s+)?logs?\s+(?:for\s+)?(.+)$/i)
    || q.match(/^logs\s+(.+)$/i);
  if (search?.[1]) addTool(results, search_logs(search[1].trim()));

  // Habits: Mel can check every box so you don't click them one by one
  if (
    /^(?:check|tick|mark|complete|fill)\s+(?:all\s+)?(?:the\s+)?(?:every\s+)?(?:single\s+)?(?:habit\s+)?(?:boxes?|habits?|checks?|cells?)(?:\s+(?:for\s+)?today)?[.!]?$/i.test(q)
    || /^(?:check|tick|mark)\s+every\s+(?:single\s+)?(?:box|habit|one)(?:\s+(?:for\s+)?today)?[.!]?$/i.test(q)
    || /^(?:check|tick)\s+(?:them\s+)?all(?:\s+(?:for\s+)?today)?[.!]?$/i.test(q)
    || /\bcheck\s+every\s+single\s+box\b/i.test(low)
    || /\bcheck\s+all\s+(?:the\s+)?(?:habit\s+)?boxes?\b/i.test(low)
    || /\bmark\s+all\s+habits?\s+(?:done|complete|checked)\b/i.test(low)
  ) {
    addTool(results, check_habits("all"));
    return results;
  }

  if (
    /^(?:uncheck|untick|clear)\s+(?:all\s+)?(?:the\s+)?(?:habit\s+)?(?:boxes?|habits?|checks?)(?:\s+(?:for\s+)?today)?[.!]?$/i.test(q)
    || /\buncheck\s+all\b/i.test(low)
  ) {
    addTool(results, uncheck_habits("all"));
    return results;
  }

  const checkOne =
    q.match(/^(?:check|tick)\s+(?:the\s+)?(?:habit\s+)?(.+?)(?:\s+(?:for\s+)?today)?[.!]?$/i)
    || q.match(/^(?:mark)\s+(.+?)\s+(?:done|complete|checked)[.!]?$/i);
  if (checkOne?.[1] && !/\bevery\b|\ball\b/i.test(checkOne[1])) {
    const name = cleanCommandValue(checkOne[1]) || "";
    // Avoid "check in", "check status", water amounts, etc.
    if (
      name
      && !/^(box|boxes|habit|habits|in|out|status|meals?|sleep|water|today)$/i.test(name)
      && !/^\d/.test(name)
    ) {
      addTool(results, set_habit_check(name, true));
      return results;
    }
  }

  const uncheckOne = q.match(/^(?:uncheck|untick)\s+(?:the\s+)?(?:habit\s+)?(.+?)(?:\s+(?:for\s+)?today)?[.!]?$/i);
  if (uncheckOne?.[1] && !/\bevery\b|\ball\b/i.test(uncheckOne[1])) {
    addTool(results, set_habit_check(cleanCommandValue(uncheckOne[1]) || "", false));
    return results;
  }

  if (
    /^(?:habit|habits)(?:\s+status)?[.!]?$/i.test(q)
    || /^(?:how are my habits|habit status|show habits)[.!]?$/i.test(q)
  ) {
    addTool(results, list_habits_status());
    return results;
  }

  if (/\bundo\s+(?:the\s+)?(?:last\s+)?water\b/i.test(low)) addTool(results, undo_water());
  const amountMl = parseAmountMl(q);
  if (amountMl != null && !/\bundo\b/i.test(low)) addTool(results, log_water(amountMl));

  if (/\bundo\s+(?:my\s+)?(?:usual\s+)?breakfast\b/i.test(low)) {
    addTool(results, undo_usual_meal("breakfast_usual"));
  } else if (/\b(?:log|ate|had)\s+(?:my\s+)?(?:usual\s+)?breakfast(?:\s+today)?\b/i.test(low)) {
    addTool(results, log_usual_meal("breakfast_usual"));
  } else {
    // Free-form food — Melani-style messy sentences
    // "I had two boiled eggs today and three boxes of Pockys … and I had chicken"
    const foodMatch =
      q.match(
        /^(?:please\s+)?(?:i\s+)?(?:just|jus|jst)?\s*(?:also\s+)?(?:ate|eat|had|eaten|eating|log(?:ged)?)\s+(.+)$/i
      ) ||
      q.match(
        /^(?:please\s+)?(?:i\s+)?(?:just|jus|jst)?\s*(?:also\s+)?(?:for\s+)?(?:breakfast|lunch|dinner|snack)[:\s,]+(.+)$/i
      ) ||
      // Food-first lines without ate/had: "2 boiled eggs and chicken"
      q.match(
        /^((?:(?:\d+|one|two|three|four|five|a|an)\s+)?(?:boiled\s+)?eggs?\b.*)$/i
      ) ||
      q.match(
        /^(.+\b(?:eggs?|chicken|pockys?|yogurt|rice|salmon|beef|oatmeal|banana|apple)\b.*)$/i
      );
    if (foodMatch?.[1] && !/\bwater\b|\bml\b|\bliters?\b|\bL\b/i.test(foodMatch[1])) {
      const foodBit = foodMatch[1].trim();
      if (
        foodBit &&
        !/^(?:my\s+)?(?:page|habit|sleep|gym|bookshelf)/i.test(foodBit) &&
        !/\b(open|create|move|page|habit|skincare|shower|failures?|math)\b/i.test(foodBit) &&
        foodBit.length < 400
      ) {
        addTool(results, log_food_nl(foodBit));
      }
    }
  }

  const fog = low.match(/(?:log\s+)?brain fog\s*(?:is|was|:)?\s*(yes|no|on|off|true|false)\b/i)
    || low.match(/\b(no|without|have|had|with)\s+brain fog\b/i);
  if (fog) addTool(results, log_brain_fog(!/no|without|off|false/.test(fog[1])));

  const slept = low.match(/(?:i\s+)?(?:slept|log sleep)\s+(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i);
  if (slept) addTool(results, log_sleep_hours(Number(slept[1])));
  if (/^(?:sleep|sleep today|how much did i sleep|what was my sleep)\??$/i.test(q)) addTool(results, get_sleep_today());

  if (/\b(?:took|done with|finished|log)(?:\s+all|\s+my)?\s+supplements?\b/i.test(low)) {
    addTool(results, log_all_supplements());
  }

  if (/\bundo\s+(?:today'?s\s+)?(?:meat|beef|salmon)\b/i.test(low)) {
    addTool(results, undo_meat_eaten());
  } else {
    const ateMeat = low.match(/\b(?:ate|had|finished|log(?:ged)?)\s+(?:the\s+)?(beef|salmon)\b/i);
    if (ateMeat?.[1]) addTool(results, log_meat_eaten(ateMeat[1] as "beef" | "salmon"));
    const lockMeat = low.match(/^(?:lock|choose|pick|make it|do)\s+(beef|salmon)(?:\s+today)?[.!]?$/i);
    if (lockMeat?.[1]) addTool(results, lock_meat(lockMeat[1] as "beef" | "salmon"));
    if (/^(beef|salmon)[.!]?$/i.test(q)) addTool(results, lock_meat(low.replace(/[.!]/g, "") as "beef" | "salmon"));
  }

  const asksFood = /^(food|food plan|what meat|what am i eating|what should i eat|what do i eat|today'?s plate|today'?s meat)\??$/i.test(q)
    || /\b(?:what meat|food plan|what should i eat today|what am i eating today)\b/i.test(low);
  if (asksFood && !results.some((item) => item.tool === "lock_meat" || item.tool === "log_meat_eaten")) {
    addTool(results, get_food_plan());
  }

  const logNote = q.match(/^log\s*:\s*(.+)$/i);
  if (logNote?.[1] && results.length === 0) addTool(results, life_log(logNote[1].trim()));

  if (/\bcostco\b/i.test(q)) {
    const costco = parseToolResult(run_shopping_command(q));
    if (costco.ok) {
      results.push(costco);
      return results;
    }
  }

  const sourceCommand =
    q.match(/^(?:please\s+)?(?:can you\s+)?(?:get|download)(?:\s+me)?(?:\s+a)?(?:\s+legal|\s+free)?(?:\s+copy\s+of)?(?:\s+the)?(?:\s+book)?\s+(.+)$/i) ||
    q.match(/^(?:please\s+)?(?:find|search for)\s+(?:me\s+)?(?:a\s+)?(?:legal\s+|free\s+)?(?:copy\s+of\s+|book\s+)(.+)$/i);
  if (sourceCommand?.[1]) {
    const title = sourceCommand[1].replace(/\s+for\s+me[.!]?$/i, "").trim();
    addTool(results, find_book_source(title));
  }

  const bookCommand = q.match(/^(?:open|read|resume|continue)(?:\s+reading)?\s+(.+)$/i);
  if (bookCommand?.[1]) {
    const bookQuery = bookCommand[1]
      .replace(/^(?:my\s+)?(?:book\s+)?/i, "")
      .replace(/\s+(?:from\s+)?where\s+i\s+left\s+(?:off|it)$/i, "")
      .replace(/\s+(?:from|at)\s+(?:my\s+)?(?:saved\s+)?(?:place|bookmark)$/i, "")
      .trim();
    const bookResult = parseToolResult(open_book(bookQuery));
    if (bookResult.ok) results.push(bookResult);
  }

  // Transport: "open my AM skincare", "go to meals", "take me to hygiene", "show pm skincare"
  const navigation = q.match(
    /^(?:please\s+)?(?:go|open|show|take me|navigate|bring me|pull up|launch)(?:\s+me)?(?:\s+to|\s+up)?\s+(.+)$/i
  );
  if (
    navigation?.[1] &&
    !/\bbrief\b/i.test(low) &&
    !results.some((item) => item.tool === "open_book")
  ) {
    addTool(results, navigate_page(navigation[1]));
  }
  // Bare destinations without "open/go": "am skincare", "my meals"
  if (
    results.length === 0 &&
    /^(?:my\s+)?(?:am|pm|morning|night|evening)\s*skincare$/i.test(q.trim())
  ) {
    addTool(results, navigate_page(q.trim()));
  }

  if (results.length === 0 && (
    /^(?:hey\s+)?(?:i(?:'m| am) going to|i gotta|task:?|remind me to|focus on)\s+.+/i.test(q)
    || /^(?:add|create|make)\s+(?:me\s+)?(?:a\s+)?(?:new\s+)?task\b/i.test(q)
    || /^(?:list|show)(?:\s+me)?\s+(?:my\s+)?(?:open\s+)?tasks$/i.test(q)
    || /^(?:finish|complete|reopen|uncomplete|mark)\s+.+/i.test(q)
    || /^(?:delete|remove|drop)\s+(?:the\s+)?task\s+.+/i.test(q)
    || /^(?:start|give me|run)\s+(?:a\s+)?(?:\d+\s*(?:minute|min)\s+)?(?:focus|pomodoro)\b/i.test(q)
  )) {
    addTool(results, run_task_command(q));
  }

  if (results.length === 0) {
    const shopping = parseToolResult(run_shopping_command(q));
    if (shopping.ok) results.push(shopping);
  }

  return results;
}

type DeterministicExecution = {
  toolResults: MelToolResult[];
  unresolved: string[];
  context: MelExecutionContext;
};

async function resolveQuarterly(results: MelToolResult[]): Promise<MelToolResult[]> {
  const pending = results.find((item) => item.tool === "stock_quarterly_pending");
  if (!pending) return results;
  const symbols = pending.summary || "AAPL,MSFT,NVDA,GOOGL,META,AMZN,TSLA,AMD";
  const packed = parseToolResult(await fetch_stock_quarterly(symbols));
  return results.filter((item) => item.tool !== "stock_quarterly_pending").concat(packed);
}

/**
 * Run a human request as an ordered set of bounded commands. Context is updated
 * after every step, so "create X, add this to it, favorite it" targets X all
 * the way through. Async domains are tried only when local tools do not match.
 */
async function executeDeterministicInstructions(
  request: Pick<MelAgentRequest, "text" | "pageId" | "pageTitle">
): Promise<DeterministicExecution> {
  const instructions = splitMelInstructions(request.text);
  const queue = instructions.length ? instructions : [request.text];
  let context: MelExecutionContext = {
    pageId: request.pageId,
    pageTitle: request.pageTitle,
  };
  const toolResults: MelToolResult[] = [];
  const unresolved: string[] = [];

  for (const instruction of queue) {
    let stepResults = await resolveQuarterly(
      planAndExecute(instruction, context.pageId, context.pageTitle)
    );
    if (!stepResults.length) {
      const weatherResult = await runWeatherCommand(instruction, context.pageId);
      if (weatherResult) stepResults = [weatherResult];
    }
    if (!stepResults.length) {
      const wardrobeResult = await runWardrobeCommand(instruction, context.pageId);
      if (wardrobeResult) stepResults = [wardrobeResult];
    }
    if (!stepResults.length) {
      unresolved.push(instruction);
      continue;
    }
    toolResults.push(...stepResults);
    context = contextFromToolResults(context, stepResults);
  }

  return { toolResults, unresolved, context };
}

function asSnapshot(toolResults: MelToolResult[], pageId?: string, pageTitle?: string): Snapshot {
  const existing = toolResults.find((item) => item.tool === "get_live_snapshot")?.data as Snapshot | undefined;
  if (existing) return existing;
  return parseToolResult(get_live_snapshot(pageId, pageTitle)).data as Snapshot;
}

function nextAction(snapshot: Snapshot): string {
  try {
    const move = buildOperatingBrain(snapshot.day).topMove;
    if (move) return `Next: ${move}`;
  } catch {
    /* fall through */
  }
  if (snapshot.meals.logged.length === 0) {
    return "Next: log breakfast (yogurt bowl) when you eat it.";
  }
  if (snapshot.water.remainingMl >= 1000) return "Next: drink 500 ml of water.";
  if (snapshot.sleep.hours == null) return "Next: log sleep.";
  return "Next: keep water and sleep on track.";
}

function statusReply(snapshot: Snapshot): string {
  const sleep = snapshot.sleep.hours == null ? "not logged" : `${snapshot.sleep.hours}h`;
  const fog =
    snapshot.brainFog == null ? "not logged" : snapshot.brainFog ? "yes" : "no";
  try {
    const brain = operatingBrainStatusReply(snapshot.day);
    return [
      brain,
      ``,
      `— Today fuel —`,
      `Protein ${snapshot.meals.totals.protein_g} / ${snapshot.goals.protein_g}g · cal ${snapshot.meals.totals.calories} / ${snapshot.goals.calories}`,
      `Water ${snapshot.water.ml} / ${snapshot.water.goalMl} ml · sleep ${sleep} · fog ${fog}`,
      `Cycle ${snapshot.cycle.phase}${snapshot.cycle.day ? `, day ${snapshot.cycle.day}` : ""}`,
    ].join("\n");
  } catch {
    return [
      `Today`,
      snapshot.day,
      ``,
      `— Fuel —`,
      `Protein ${snapshot.meals.totals.protein_g} / ${snapshot.goals.protein_g}g`,
      `Calories ${snapshot.meals.totals.calories} / ${snapshot.goals.calories}`,
      `Water ${snapshot.water.ml} / ${snapshot.water.goalMl} ml`,
      ``,
      `— Rest —`,
      `Sleep ${sleep}`,
      `Brain fog ${fog}`,
      ``,
      `— Next —`,
      nextAction(snapshot).replace(/^Next:\s*/i, ""),
    ].join("\n");
  }
}

function foodReply(data: Snapshot["food"] & {
  menu?: Array<{ title: string; protein_g: number; calories: number; logged: boolean }>;
  loggedCount?: number;
  totalMeals?: number;
}): string {
  const menuLines = (data.menu || []).map(
    (m) => `${m.logged ? "✓" : "○"} ${m.title} · ${m.protein_g}g protein · ${m.calories} cal`
  );
  return [
    `Meals (breakfast only for now)`,
    ``,
    data.plate,
    ``,
    ...(menuLines.length ? menuLines : []),
    ``,
    `— Left after logs —`,
    `${data.proteinRemaining_g}g protein`,
    `${data.caloriesRemaining} calories`,
    ``,
    data.note,
  ].join("\n");
}

function composeFromTools(toolResults: MelToolResult[], pageId?: string, pageTitle?: string): string {
  const brief = toolResults.find((item) => item.tool === "write_body_brief");
  if (brief?.data && typeof brief.data === "object" && "fullText" in brief.data) {
    return String((brief.data as { fullText: string }).fullText);
  }

  const status = toolResults.find((item) => item.tool === "get_live_snapshot");
  if (status?.data) return statusReply(status.data as Snapshot);

  const food = toolResults.find((item) => item.tool === "get_food_plan");
  if (food?.data) return foodReply(food.data as Snapshot["food"]);

  const logs = toolResults.find((item) => item.tool === "search_logs");
  if (logs) {
    const rows = Array.isArray(logs.data) ? logs.data as Array<{ day: string; text: string }> : [];
    return rows.length ? rows.map((row) => `${row.day}: ${row.text}`).join("\n") : logs.summary;
  }

  const pins = toolResults.find((item) => item.tool === "list_pins");
  if (pins) {
    const rows = Array.isArray(pins.data) ? pins.data as string[] : [];
    return rows.length ? rows.map((row, index) => `${index + 1}. ${row}`).join("\n") : pins.summary;
  }

  const pages = toolResults.find((item) => item.tool === "list_workspace_pages");
  if (pages) {
    const rows = Array.isArray(pages.data)
      ? pages.data as Array<{ title: string; parent: string | null }>
      : [];
    return rows.length
      ? rows.map((row) => row.parent ? `${row.parent} / ${row.title}` : row.title).join("\n")
      : pages.summary;
  }

  if (toolResults.some((item) => item.tool === "help")) {
    return [
      "Tell me the outcome in one line. Examples:",
      '"drank 1L and ate breakfast"',
      '"what meat" or "beef"',
      '"brief" or "status"',
      '"goal protein 130"',
      '"pin I stream Tuesday nights"',
      '"open wardrobe"',
      '"NVDA quarterly" or "quarterly reports"',
      '"options 101" or "trading desk"',
      '"my bookshelf" or "what am I reading"',
      '"explain opportunity cost" or "economics 101"',
      '"weekly digest" or "level 3" (compound body × money brief)',
      '"decide money: keep X | revisit 30"',
      '"create a page called Neurotech Ideas under Learn"',
      '"book a dental cleaning next week in the morning"',
      '"move Bookshelf under Learn"',
      '"undo that"',
    ].join("\n");
  }

  const foodNl = toolResults.find((item) => item.tool === "log_food_nl");
  if (foodNl?.summary) return foodNl.summary;

  // Prefer full quarterly / trading / shelf / econ text first
  const stockQ = toolResults.find((item) => item.tool === "stock_quarterly");
  if (stockQ?.summary) {
    return [
      stockQ.summary,
      "",
      "Framework: thesis, catalyst, invalidation, size. Not advice.",
    ].join("\n");
  }
  const trading = toolResults.find((item) => item.tool === "trading_knowledge");
  if (trading?.summary) return trading.summary;
  const l3 = toolResults.find(
    (item) =>
      item.tool === "weekly_intelligence_digest" ||
      item.tool === "last_intelligence_digest" ||
      item.tool === "list_due_decisions"
  );
  if (l3?.summary) return l3.summary;
  const decisions = toolResults.find(
    (item) => item.tool === "log_decision" || item.tool === "list_decisions"
  );
  if (decisions?.summary) return decisions.summary;
  const highlights = toolResults.find((item) => item.tool === "search_highlights");
  if (highlights?.summary) return highlights.summary;
  const shelf = toolResults.find((item) => item.tool === "bookshelf_knowledge");
  if (shelf?.summary) return shelf.summary;
  const econ = toolResults.find((item) => item.tool === "econ_knowledge");
  if (econ?.summary) {
    const pack = toolResults.find((item) => item.tool === "evidence_pack");
    if (pack?.summary && pack.summary !== econ.summary) {
      // Keep teach card primary; pack is already partly inside econ via highlights
      return econ.summary;
    }
    return econ.summary;
  }

  if (toolResults.length > 1) {
    const completed = toolResults.filter((item) => item.ok).length;
    return [
      `${completed} of ${toolResults.length} actions completed`,
      ...toolResults.map((item, index) => `${index + 1}. ${item.ok ? "Done" : "Failed"}: ${item.summary}`),
    ].join("\n");
  }
  if (toolResults.length) return toolResults[0].summary;
  return statusReply(asSnapshot(toolResults, pageId, pageTitle));
}

/**
 * Instant path = tiny social lines only (hi / thanks / mood).
 * Never trap real questions, brainstorms, or "what's your name" in the dumb default.
 */
function isInstantChat(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 120) return false;

  // Anything that needs a real brain stays off this path
  if (
    /\b(idea|ideas|brainstorm|think of|help me|how (do|can|should)|why |what should|who are|what(?:'s| is|s) (?:your|ur) name|your name|who r u|who are you|explain|plan|build|startup|neuro|clinic|content|stream|invest|stock|trade|quarterly|options?|code|debug|fix|write|draft|econom(?:y|ics)|opportunity cost|bookshelf)\b/i.test(
      t
    )
  ) {
    return false;
  }
  if (
    /\b(log|logged|drink|drank|water|breakfast|lunch|dinner|snack|ate|eaten|eating|egg|eggs|chicken|rice|protein|gym|sleep|beef|salmon|meat|goal|pin|unpin|create|rename|delete|trash|move|open|wear|outfit|wardrobe|weather|research|look up|find out|status|macros?|quarterly|bowel|poop|shit|bm|bookshelf|shelf|highlights?|highlight|reading|digest|level 3|decide|brief)\b/i.test(
      t
    )
  ) {
    return false;
  }

  // Pure greetings
  if (/^(hi|hey|yo+|hello|sup|what'?s up|whatsup|wassup|howdy)([.!?\s].*)?$/i.test(t)) {
    return true;
  }
  // Pure ack
  if (/^(thanks|thank you|ty|thx|perfect|cool|okay|ok|k|nice|lol|lmao|haha+|bet|facts|true)[.!]*$/i.test(t)) {
    return true;
  }
  // Short mood lines only
  if (
    t.split(/\s+/).length <= 10 &&
    /\b(feel|feeling|felt|mood|goofy|goffy|silly|tired|exhausted|happy|sad|anxious|stressed|bored|meh|weird|off)\b/i.test(t) &&
    !/\?$/.test(t)
  ) {
    return true;
  }
  return false;
}

function instantChatReply(text: string, pageId?: string): string {
  const low = text.trim().toLowerCase().replace(/[’']/g, "'");

  // Learned preferred reply (after 👎 retrain) beats every canned line
  const learned = preferredReplyFor({ pageId, userText: text });
  if (learned) return learned;

  if (/^(hi|hey|yo+|hello|sup|what'?s up|whatsup|wassup|howdy)([.!?\s].*)?$/i.test(low)) {
    if (/\b(feel|feeling|goofy|goffy|silly|tired|weird|off|good|bad)\b/i.test(low)) {
      return "Goofy day accepted. Lean into it.";
    }
    return "Hey. What can I help you with?";
  }
  if (/^(thanks|thank you|ty|thx|perfect|cool|okay|ok|k|nice|bet|facts)[.!]*$/i.test(low)) {
    return "Got you.";
  }
  if (/\b(goofy|goffy|silly)\b/i.test(low)) {
    return "Goofy mode on. Still sharp if you need dinner, a page move, or a stock read.";
  }
  if (/\b(tired|exhausted|drained|sleepy)\b/i.test(low)) {
    return "Protect sleep. One easy win if you want: water, breakfast usual, or early bed.";
  }
  if (/\b(anxious|stressed|overwhelmed|panic)\b/i.test(low)) {
    return "Slow breath. One small thing only. Water, food, or a 10-minute task.";
  }
  if (/\b(happy|good|great|amazing|pumped)\b/i.test(low)) {
    return "Good. Point that energy at one ship, one stream moment, or one clinic/neurotech move.";
  }
  if (/\b(sad|down|meh|bad|off|weird)\b/i.test(low)) {
    return "With you. Want chatter, food, or one tiny reset?";
  }
  if (/\b(feel|feeling|mood)\b/i.test(low)) {
    return "Got it. I'm Mel. Food, outfit, brief, markets, or keep talking.";
  }
  if (/^(lol|lmao|haha+)/i.test(low)) return "Haha. What's next?";
  return "Mel here. What are we doing?";
}

/** Offline brainstorm packs for Melani's actual lanes */
function brainstormIdeas(text: string): string {
  const low = text.toLowerCase();
  if (/\b(neuro|brain|eeg|device|wearable)\b/i.test(low)) {
    return [
      "Neurotech angles (pick one to pressure-test this week):",
      "1. Early fatigue signal from HRV + sleep + simple cognitive tap test, doctor-readable weekly score.",
      "2. Clinic intake that maps symptoms to a 1-page twin brief before the visit (you already have Twin bones).",
      "3. Stream-safe demo: 60s live chart of a wearable proxy + plain-English explanation, no medical claims.",
      "4. Patent-style wedge: continuous peripheral signal for early neuropathy screening (research path, not diagnosis).",
      "5. Content loop: one case pattern → one protocol card → one Imprint quiz for med students.",
      "",
      "Next: say which number, or \"draft page Neurotech Ideas under Learn\".",
    ].join("\n");
  }
  if (/\b(clinic|doctor|sf|nyc|la|practice)\b/i.test(low)) {
    return [
      "Clinic build ideas:",
      "1. Concierge neuro-adjacent intake: 15 min async twin pack before every new patient.",
      "2. SF flagship = R&D + content studio; NYC = high-volume second opinion; LA = performance/sports nervous system.",
      "3. Productized follow-up: nightly body brief style check-ins patients actually open.",
      "4. Referral moat: one killer PDF doctors forward (early-warning dashboard sample).",
      "",
      "Next: pick a city or say create a page called Clinic OS under Learn.",
    ].join("\n");
  }
  if (/\b(content|stream|youtube|tiktok|post|influencer)\b/i.test(low)) {
    return [
      "Content / stream ideas:",
      "1. Build-in-public: 10 min Melani ships one Wonder feature live (Bookshelf, Imprint, Mel).",
      "2. \"Doctor who codes\" series: one neuro paper → one product rule → one patient-safe takeaway.",
      "3. Markets desk stream: walk AAPL quarterly bars + how-to playbook, no fake tips.",
      "4. Bookshelf haul: Want tab legal finds + Imprint quiz on camera.",
      "5. Day-in-the-life OS: food OS beef/salmon + gym + brief, all inside Wonder.",
      "",
      "Next: pick a format and I'll outline the first episode.",
    ].join("\n");
  }
  if (/\b(stock|market|trade|option|invest)\b/i.test(low)) {
    return [
      "Markets desk ideas (process, not advice):",
      "1. One-ticker deep dive: thesis, catalyst, invalidation, size — ask Mel for a quarterly pack.",
      "2. Earnings checklist card Mel can spit on demand (rev YoY, margins, guide, multiple).",
      "3. Options sandbox: defined-risk structures only, IV crush note after prints.",
      "4. Watchlist ritual: 8 names, 5 minutes, log one observation to a page.",
      "",
      "Say \"NVDA quarterly\" for a live pack.",
    ].join("\n");
  }
  if (/\b(app|product|feature|wonder|startup|saas)\b/i.test(low)) {
    return [
      "Wonder product ideas:",
      "1. Mel \"morning stack\": water + meat + top 3 tasks + one market flag in one message.",
      "2. Imprint → Mel quiz loop after every finished chapter.",
      "3. Digital twin doctor pack export as one PDF button.",
      "4. Fashion OS + weather: stream outfit locked from wardrobe + NYC default weather.",
      "5. Decision-fatigue kill: tonight's food + tomorrow's gym pre-chosen at 8pm.",
      "",
      "Next: pick a number and I'll spec the UI in plain English.",
    ].join("\n");
  }
  // Default: Melani-shaped idea spray
  return [
    "Ideas for you right now (Melani lanes):",
    "1. Neurotech: early-warning score from sleep + HRV + simple reaction test, doctor-readable.",
    "2. Clinics: SF/NYC/LA playbook page with intake twin pack as the product wedge.",
    "3. Wonder: Mel morning stack (food + tasks + one market note) in one tap.",
    "4. Content: build-in-public Finances / capital plan read, 8 minutes, serif UI on camera.",
    "5. Books: Want → legal find → Imprint quiz pipeline as a weekly series.",
    "6. Markets: one-name process card (thesis / catalyst / kill switch) stored under Learn.",
    "",
    "Say a number for a deeper plan, or name a domain: neuro, clinic, content, markets, product.",
  ].join("\n");
}

function localChat(text: string, pageId?: string, pageTitle?: string): string {
  const raw = text.trim();
  const low = raw.toLowerCase().replace(/[’']/g, "'");

  if (isInstantChat(raw)) return instantChatReply(raw, pageId);

  // Identity
  if (
    /\b(what(?:'s| is|s) (?:your|ur) name|who are you|who r u|your name|ur name|what are you)\b/i.test(low)
  ) {
    return "I'm Mel, your operator inside Wonder. Not a chatbot menu. I run food, markets, books, pages, and ideas with you. What do you want done?";
  }
  if (/\b(who am i|what(?:'s| is) my name)\b/i.test(low)) {
    return "You're Melani: technology founder, computer/software engineer building your own company. Systems, quantum, empire-grade product. Wonder is the OS. What are we shipping?";
  }

  // Brainstorm / ideas
  if (
    /\b(idea|ideas|brainstorm|think of|help me think|inspire|what should i (build|make|do|post|ship))\b/i.test(low)
  ) {
    return brainstormIdeas(raw);
  }

  // Markets education offline
  if (/\b(options? 101|trading desk|how (do|to) (trade|read) (charts?|earnings|quarterly))\b/i.test(low)) {
    return offlineTradingBrief(raw);
  }

  // Status / priorities / what matters → full Operating Brain
  if (
    /^(status|how am i doing|macros?|protein|water|sleep|phase|cycle)\b/i.test(low) ||
    /\b(show|give me|what(?:'s| is) my)\s+(status|macros?|protein|water|sleep)\b/i.test(low) ||
    /\b(what (matters|should i (do|focus|prioritize))|what(?:'s| is) (my )?(priority|top move)|how(?:'s| is) (my )?(body|recovery|readiness)|operating brain|be smart|what next)\b/i.test(
      low
    )
  ) {
    return statusReply(asSnapshot([], pageId, pageTitle));
  }

  // Page-aware nudge
  if (pageTitle) {
    if (/financ|market/i.test(pageTitle)) {
      return `You're on ${pageTitle}. I can pull quarterly packs ("NVDA quarterly"), explain a chart, or brainstorm a trade process. What do you want?`;
    }
    if (/bookshelf|library|book/i.test(pageTitle)) {
      return `You're on ${pageTitle}. Want list find, open a book, or Imprint a chapter. What title or task?`;
    }
  }

  // Learned preferred reply for this state (post-penalty retrain)
  const learned = preferredReplyFor({ pageId, userText: raw });
  if (learned) return learned;

  // Honest: no map → no menu hallucination
  if (/\?$/.test(raw) || /^(what|why|how|when|where|who|which|can|could|should|do you|are you)\b/i.test(low)) {
    return "I don't know what you're talking about.";
  }

  return "I don't know what you're talking about.";
}

function localComposer(text: string, toolResults: MelToolResult[], pageId?: string, pageTitle?: string): string {
  return toolResults.length ? composeFromTools(toolResults, pageId, pageTitle) : localChat(text, pageId, pageTitle);
}

async function fetchJson(url: string, init: RequestInit, timeoutMs = 4_000): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

const LOCAL_MODEL = "llama3:latest";

type LocalWorkspacePlan = {
  intent?: string;
  action?: string;
  title?: string;
  target?: string;
  parent?: string;
  destination?: string;
  position?: "inside" | "before" | "after";
  content?: string;
  mode?: "append" | "replace";
  open?: boolean;
  favorite?: boolean;
  asAgent?: boolean;
};

async function callLocalModel(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  jsonOnly = false
): Promise<string> {
  const response = await fetchJson(
    "/api/ollama/api/chat",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LOCAL_MODEL,
        messages,
        stream: false,
        keep_alive: "20m",
        ...(jsonOnly ? { format: "json" } : {}),
        options: { temperature: jsonOnly ? 0 : 0.35 },
      }),
    },
    // Chat must stay snappy. Workspace planner uses a separate longer call below.
    8_000
  );
  const payload = await response.json() as {
    message?: { content?: string };
    error?: string;
  };
  const content = payload.message?.content?.trim();
  if (!response.ok || !content) throw new Error(payload.error || "Local model unavailable");
  return content;
}

async function callLocalModelSlow(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  jsonOnly = false
): Promise<string> {
  const response = await fetchJson(
    "/api/ollama/api/chat",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LOCAL_MODEL,
        messages,
        stream: false,
        keep_alive: "20m",
        ...(jsonOnly ? { format: "json" } : {}),
        options: { temperature: jsonOnly ? 0 : 0.35 },
      }),
    },
    20_000
  );
  const payload = await response.json() as {
    message?: { content?: string };
    error?: string;
  };
  const content = payload.message?.content?.trim();
  if (!response.ok || !content) throw new Error(payload.error || "Local model unavailable");
  return content;
}

function parseLocalPlan(text: string): LocalWorkspacePlan | null {
  const clean = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    const value = JSON.parse(clean) as LocalWorkspacePlan;
    if (!value || typeof value !== "object") return null;
    if (!value.intent && value.action) value.intent = value.action;
    return value;
  } catch {
    return null;
  }
}

function mayNeedWorkspacePlanner(text: string): boolean {
  return /\b(page|workspace|sidebar|folder|section|document)\b/i.test(text)
    && /\b(create|make|add|rename|delete|trash|remove|restore|duplicate|copy|move|reorder|write|append|replace|clear|open|show|close|collapse|expand|favorite|unfavorite)\b/i.test(text);
}

async function planWorkspaceWithLocalModel(request: MelAgentRequest): Promise<LocalWorkspacePlan | null> {
  const pagesResult = parseToolResult(list_workspace_pages());
  const pages = Array.isArray(pagesResult.data)
    ? (pagesResult.data as Array<{ title: string; parent: string | null }>).slice(0, 80)
    : [];
  const content = await callLocalModelSlow([
    {
      role: "system",
      content: [
        "You route one request into one safe Wonder workspace action.",
        "Return only JSON. Never answer conversationally.",
        "Allowed intent values: create_page, open_page, list_pages, rename_page, trash_page, restore_page, duplicate_page, move_page, write_page, clear_page, favorite_page, collapse_sidebar, set_sidebar_section, undo_workspace, none.",
        "Use target='this page' when the user means the open page.",
        "For create_page use title, optional parent, and optional asAgent.",
        "For move_page use target, destination, and position: inside, before, or after.",
        "For write_page use target, content, and mode: append or replace.",
        "For set_sidebar_section use target and open: true or false.",
        "Do not invent a title, target, destination, or content the user did not request.",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Open page: ${request.pageTitle || "Untitled"} (${request.pageId || "unknown"})`,
        `Known pages: ${JSON.stringify(pages)}`,
        `Request: ${request.text}`,
      ].join("\n"),
    },
  ], true);
  return parseLocalPlan(content);
}

function executeLocalWorkspacePlan(
  plan: LocalWorkspacePlan | null,
  pageId?: string
): MelToolResult[] {
  if (!plan?.intent || plan.intent === "none") return [];
  const results: MelToolResult[] = [];
  const add = (raw: string) => addTool(results, raw);
  switch (plan.intent) {
    case "create_page":
      add(create_workspace_page(plan.title, plan.parent, pageId, Boolean(plan.asAgent)));
      break;
    case "open_page":
      if (plan.target) add(navigate_page(plan.target));
      break;
    case "list_pages":
      add(list_workspace_pages());
      break;
    case "rename_page":
      if (plan.title) add(rename_workspace_page(plan.target, plan.title, pageId));
      break;
    case "trash_page":
      add(trash_workspace_page(plan.target, pageId));
      break;
    case "restore_page":
      if (plan.target) add(restore_workspace_page(plan.target));
      break;
    case "duplicate_page":
      add(duplicate_workspace_page(plan.target, pageId));
      break;
    case "move_page":
      if (plan.destination) {
        add(move_workspace_page(plan.target, plan.destination, plan.position || "inside", pageId));
      }
      break;
    case "write_page":
      if (plan.content) {
        add(write_workspace_page(plan.target, plan.content, plan.mode || "append", pageId));
      }
      break;
    case "clear_page":
      add(clear_workspace_page(plan.target, pageId));
      break;
    case "favorite_page":
      add(favorite_workspace_page(plan.target, plan.favorite !== false, pageId));
      break;
    case "collapse_sidebar":
      add(collapse_sidebar_sections());
      break;
    case "set_sidebar_section":
      if (plan.target) add(set_sidebar_section(plan.target, plan.open !== false));
      break;
    case "undo_workspace":
      add(undo_workspace_action());
      break;
  }
  return results;
}

async function localModelReply(request: MelAgentRequest): Promise<string> {
  const snapshot = asSnapshot([], request.pageId, request.pageTitle);
  const history = (request.history || []).slice(-12).map((message) => ({
    role: message.role,
    content: message.content,
  }));
  return callLocalModel([
    {
      role: "system",
      content: [
        "You are Mel, Melani's private operating assistant inside Wonder.",
        "She is a technology founder and software/computer engineer building her own company. Not premed. Not becoming a doctor.",
        "Be extremely sharp. Lead with OPERATING BRAIN top move and evidence when she asks status, priorities, or what to do.",
        "Use only the supplied snapshot for personal numbers. Never invent an app action or claim you changed something.",
        "You are fluent in her WHOOP/body-band data: sleep, overnight HRV/RHR, body signals, recovery, day strain, workouts, weight. Prefer snapshot + OPERATING BRAIN correlations over guesses.",
        "Give soft health education, never a diagnosis. For urgent symptoms recommend appropriate professional care.",
        "Do not explain your architecture. Do not dump a command menu unless asked. Never use em or en dashes.",
        `Current page: ${request.pageTitle || "unknown"} (${request.pageId || "unknown"}).`,
        snapshot.liveContext.slice(0, 28_000),
      ].join("\n\n"),
    },
    ...history,
    { role: "user", content: request.text },
  ]);
}

async function cloudReply(request: MelAgentRequest, toolResults: MelToolResult[]): Promise<{ reply: string; research: boolean }> {
  const snapshot = asSnapshot(toolResults, request.pageId, request.pageTitle);
  const isResearch = /^(research|look up|find out|compare|investigate)\b/i.test(request.text.trim());
  if (isResearch) {
    const response = await fetchJson("/api/melani-ai/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: request.text, live_context: snapshot.liveContext }),
    }, 90_000);
    const payload = await response.json() as { answer?: string; detail?: string };
    if (!response.ok || !payload.answer) throw new Error(payload.detail || "Research unavailable");
    return { reply: payload.answer, research: true };
  }

  const history = [...(request.history || []), { role: "user" as const, content: request.text }].slice(-12);
  // Money / books / fitness-band pages get a larger window so Whoop CSVs + shelf fit
  const fatContext =
    request.pageId === "pg-finance" ||
    request.pageId === "pg-library" ||
    request.pageId === "pg-fitness" ||
    request.pageId === "pg-sleep" ||
    request.pageId === "pg-gym" ||
    request.pageId === "pg-meals" ||
    /financ|money|market|stock|book|econ|shelf|sleep|gym|fitness|whoop|hrv|recovery|strain/i.test(
      request.pageTitle || ""
    ) ||
    /econ|bookshelf|opportunity cost|incentives?|invest|market|capital|whoop|hrv|recovery|sleep score|strain|rhr|spo2/i.test(
      request.text
    );
  // Whoop pack alone can be ~25k; always give Mel enough headroom when band data is in play
  const wantsBody =
    fatContext ||
    /sleep|hrv|recovery|strain|whoop|weight|resting|spo2|respiratory|workout/i.test(
      request.text
    );
  const contextCap = wantsBody ? 28_000 : fatContext ? 12_000 : 5200;
  // JSON envelope protocol + tool facts (or empty) for cloud Mel
  const toolCtx = toolResults.length
    ? `These tools already ran. Treat them as final facts. Reply with JSON only. Prefer mode CHAT action RESPOND. Do NOT re-LOG or re-OPEN the same event.\nTOOL RESULTS:\n${JSON.stringify(toolResults).slice(0, 3500)}`
    : "No app tool ran yet. Emit LIFE LOG / BUILD OPEN_PAGE / etc. when she asked for an action so the client can execute fields. Never invent macros or water totals.";
  const system_context = `${MEL_PROTOCOL_SYSTEM_RULE}\n\n${toolCtx}\n\nIf OPERATING BRAIN / BOOKSHELF / WHOOP pack is in the snapshot, use those numbers. She is a founder/engineer, not a medical student.`;
  // Hard cap: never make casual chat wait on a hung bridge
  const response = await fetchJson("/api/melani-ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: history,
      page_id: request.pageId,
      page_title: request.pageTitle,
      live_context: snapshot.liveContext.slice(0, contextCap),
      system_context,
    }),
  }, wantsBody ? 18_000 : fatContext ? 12_000 : 3_500);
  const payload = await response.json() as { reply?: string; detail?: string };
  if (!response.ok || !payload.reply) throw new Error(payload.detail || "Grok unavailable");

  let reply = payload.reply;
  // Mel v2 Step 4: one correction pass if the model broke the JSON schema
  const firstParse = parseMelEnvelope(reply);
  if (!firstParse.ok) {
    try {
      const correction = buildCorrectionPrompt(firstParse, reply);
      const retryHistory = [
        ...history,
        { role: "assistant" as const, content: reply },
        { role: "user" as const, content: correction },
      ].slice(-14);
      const retry = await fetchJson("/api/melani-ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: retryHistory,
          page_id: request.pageId,
          page_title: request.pageTitle,
          live_context: snapshot.liveContext.slice(0, Math.min(contextCap, 4000)),
          system_context,
        }),
      }, 4_000);
      const retryPayload = await retry.json() as { reply?: string };
      if (retry.ok && retryPayload.reply) {
        const second = parseMelEnvelope(retryPayload.reply);
        if (second.ok) reply = retryPayload.reply;
      }
    } catch {
      /* keep first reply; applyCloudOrUserEnvelope will re-ask */
    }
  }
  return { reply, research: false };
}

/**
 * Apply a Mel JSON envelope from the cloud (or user paste).
 * If tools already ran locally, only take chat_response (no double LOG).
 * If nothing ran yet, execute fields (water/food/page).
 */
function applyCloudOrUserEnvelope(
  rawReply: string,
  opts: {
    pageId?: string;
    toolsAlreadyRan: boolean;
    strict: boolean;
  }
): { reply: string; toolResults: MelToolResult[]; usedEnvelope: boolean } | null {
  const parsed = parseMelEnvelope(rawReply);
  if (!parsed.ok) {
    if (opts.strict || looksLikeMelEnvelope(rawReply)) {
      const rejected = rejectEnvelope(parsed);
      return { reply: rejected.chat_response, toolResults: [], usedEnvelope: true };
    }
    return null;
  }

  const env: MelEnvelope = parsed.envelope;
  if (opts.toolsAlreadyRan) {
    // Tools already facts — never re-execute LOG/OPEN (double water/food)
    const reply =
      (env.chat_response && env.chat_response.trim()) ||
      "Done.";
    return { reply, toolResults: [], usedEnvelope: true };
  }

  const exec = executeMelEnvelope(env, { pageId: opts.pageId });
  return {
    reply: exec.chat_response,
    toolResults: exec.toolResults,
    usedEnvelope: true,
  };
}

export function runLocalMelAgent(text: string, pageId?: string, pageTitle?: string): MelAgentResponse {
  const trimmed = text.trim();

  // User (or test) pasted a Mel envelope → parse + execute or re-ask
  if (looksLikeMelEnvelope(trimmed)) {
    const applied = applyCloudOrUserEnvelope(trimmed, {
      pageId,
      toolsAlreadyRan: false,
      strict: true,
    });
    if (applied) {
      const reply = cleanReply(applied.reply);
      const context: MelExecutionContext = { pageId, pageTitle };
      rememberActionDomain(applied.toolResults);
      recordMelReceipt(text, applied.toolResults, context);
      pushSessionMemory(text, reply);
      return {
        reply,
        mode: applied.toolResults.length ? "action" : "offline-local",
        toolResults: applied.toolResults,
      };
    }
  }

  // High-confidence NL → envelope (open page / food / greet) before regex maze
  const intent = intentToMelEnvelope(trimmed);
  if (intent) {
    const exec = executeMelEnvelope(intent, { pageId });
    const reply = cleanReply(exec.chat_response);
    const context: MelExecutionContext = { pageId, pageTitle };
    rememberActionDomain(exec.toolResults);
    recordMelReceipt(text, exec.toolResults, context);
    pushSessionMemory(text, reply);
    return {
      reply,
      mode: exec.toolResults.length ? "action" : "offline-local",
      toolResults: exec.toolResults,
    };
  }

  let context: MelExecutionContext = { pageId, pageTitle };
  const toolResults: MelToolResult[] = [];
  for (const instruction of splitMelInstructions(text)) {
    const stepResults = planAndExecute(instruction, context.pageId, context.pageTitle);
    toolResults.push(...stepResults);
    context = contextFromToolResults(context, stepResults);
  }
  const reply = cleanReply(localComposer(text, toolResults, context.pageId, context.pageTitle));
  rememberActionDomain(toolResults);
  recordMelReceipt(text, toolResults, context);
  pushSessionMemory(text, reply);
  return { reply, mode: toolResults.length ? "action" : "offline-local", toolResults };
}

/** Attach trial-and-error bookkeeping to every Mel response. */
function withRl(
  request: MelAgentRequest,
  response: MelAgentResponse
): MelAgentResponse {
  try {
    const rlEpisodeId = recordMelTurn({
      pageId: request.pageId,
      text: request.text,
      mode: response.mode,
      toolResults: (response.toolResults || []).map((t) => ({
        tool: t.tool,
        ok: t.ok !== false,
      })),
    });
    return { ...response, rlEpisodeId };
  } catch {
    return response;
  }
}

export async function runMelAgent(request: MelAgentRequest): Promise<MelAgentResponse> {
  const started = Date.now();
  const trimmed = request.text.trim();
  // Mel owns weather — seed NYC once so retrieval never needs a page
  try {
    ensureDefaultWeatherLocation();
  } catch {
    /* ignore */
  }

  // Explicit RL commands (reward / penalty / rl status) — no need to hit tools
  const rlCmd = applyRlCommand(trimmed);
  if (rlCmd) {
    return { reply: cleanReply(rlCmd), mode: "offline-local", toolResults: [] };
  }
  // After 👎: next message can retrain exact preferred reply (persisted backend)
  const retrain = tryConsumeRetrain(trimmed, request.pageId);
  if (retrain) {
    return withRl(request, {
      reply: cleanReply(retrain),
      mode: "offline-local",
      toolResults: [],
    });
  }

  // Agent loops / graphs — step output decides next hop; you keep last yes
  if (
    tryAgentLoopCommand(trimmed) ||
    /^(?:approve|reject)\s+loop\b/i.test(trimmed) ||
    /^loop\s+/i.test(trimmed)
  ) {
    let q = trimmed;
    if (/^approve\s+loop\b/i.test(q) || /^loop\s+approve\b/i.test(q)) q = "approve";
    else if (/^reject\s+loop\b/i.test(q) || /^loop\s+reject\b/i.test(q)) q = "reject";
    else if (/^loop\s+status\b/i.test(q)) q = "status";
    else if (/^loop\s+resume\b/i.test(q)) q = "resume";
    else if (/^(?:loops?|graphs?|list\s+loops?)$/i.test(q)) q = "list";
    else {
      q = q
        .replace(/^(?:run\s+)?(?:loop|graph)\s+/i, "")
        .trim();
    }
    const raw = await run_agent_loop(q);
    const packed = parseToolResult(raw);
    const reply = cleanReply(packed.summary || raw);
    pushSessionMemory(trimmed, reply);
    wonderEmit("mel.plan", "melAgent", {
      intent: "agent-loop",
      ...runtimeStamp(started),
    });
    return withRl(request, {
      reply,
      mode: "action",
      toolResults: [packed],
    });
  }
  // Highlight → Research on Mel (local lab knowledge, no Safari / random sites)
  const researchSel = parseResearchSelectionCommand(trimmed);
  if (researchSel) {
    const local = formatLocalResearchReply(researchSel);
    if (local) {
      return withRl(request, {
        reply: cleanReply(local),
        mode: "offline-local",
        toolResults: [],
      });
    }
  }
  // Next-message signal: praise/correction scores the *previous* pending turn
  try {
    applyUserTextAsReward(trimmed);
  } catch {
    /* ignore */
  }

  // 0) User pasted structured Mel JSON → parse + execute trackers / navigate
  if (looksLikeMelEnvelope(trimmed)) {
    const applied = applyCloudOrUserEnvelope(trimmed, {
      pageId: request.pageId,
      toolsAlreadyRan: false,
      strict: true,
    });
    if (applied) {
      const reply = cleanReply(applied.reply);
      const executionContext: MelExecutionContext = {
        pageId: request.pageId,
        pageTitle: request.pageTitle,
      };
      rememberActionDomain(applied.toolResults);
      recordMelReceipt(request.text, applied.toolResults, executionContext);
      pushSessionMemory(trimmed, reply);
      wonderEmit("mel.plan", "melAgent", {
        intent: "mel-protocol",
        ...runtimeStamp(started),
      });
      return withRl(request, {
        reply,
        mode: applied.toolResults.length ? "action" : "offline-local",
        toolResults: applied.toolResults,
      });
    }
  }

  // 1) Instant path: greetings / mood / vibes — never wait on Grok or Ollama
  if (isInstantChat(trimmed)) {
    const reply = cleanReply(instantChatReply(trimmed, request.pageId));
    pushSessionMemory(trimmed, reply);
    wonderEmit("mel.plan", "melAgent", {
      intent: "instant-chat",
      ...runtimeStamp(started),
    });
    return withRl(request, { reply, mode: "offline-local", toolResults: [] });
  }

  // Preferred reply for non-instant turns (retrained after penalty)
  {
    const pref = preferredReplyFor({ pageId: request.pageId, userText: trimmed });
    if (pref && !/^(log|drank|ate|open|create|move|brief|status)\b/i.test(trimmed)) {
      // Only short social / vague lines — never hijack real tool commands
      if (trimmed.length < 80 && !/\d/.test(trimmed)) {
        const reply = cleanReply(pref);
        pushSessionMemory(trimmed, reply);
        return withRl(request, { reply, mode: "offline-local", toolResults: [] });
      }
    }
  }

  // 1b) High-confidence Mel v2 router: LIFE LOG / BUILD open|create / IDEAS (no cloud needed)
  const intentEnv = intentToMelEnvelope(trimmed);
  if (
    intentEnv &&
    (intentEnv.action === "LOG" ||
      intentEnv.action === "OPEN_PAGE" ||
      intentEnv.action === "CREATE_PAGE" ||
      intentEnv.action === "BRAINSTORM")
  ) {
    const exec = executeMelEnvelope(intentEnv, { pageId: request.pageId });
    // LOG/OPEN/CREATE need tools; BRAINSTORM is still a real turn
    if (exec.toolResults.length > 0 || intentEnv.action === "BRAINSTORM") {
      const reply = cleanReply(exec.chat_response);
      const executionContext: MelExecutionContext = {
        pageId: request.pageId,
        pageTitle: request.pageTitle,
      };
      rememberActionDomain(exec.toolResults);
      recordMelReceipt(request.text, exec.toolResults, executionContext);
      pushSessionMemory(trimmed, reply);
      wonderEmit("mel.plan", "melAgent", {
        intent: "mel-protocol-nl",
        ...runtimeStamp(started),
      });
      return withRl(request, {
        reply,
        mode: exec.toolResults.length ? "action" : "offline-local",
        toolResults: exec.toolResults,
      });
    }
  }

  let toolResults: MelToolResult[] = [];
  let unresolved: string[] = [];
  let executionContext: MelExecutionContext = {
    pageId: request.pageId,
    pageTitle: request.pageTitle,
  };
  const plan = makePlan("mel-turn", [], preferOfflinePath() ? 0 : 3500);

  const genericUndo = /^(?:undo|undo that)[.!]?$/i.test(trimmed);
  const previousDomain = lastActionDomain();
  const wardrobeUndoFirst = genericUndo
    && (request.pageId === "pg-fashion-os" || lastActionDomain() === "wardrobe");
  if (wardrobeUndoFirst || /^undo (?:the last )?wardrobe(?: action)?[.!]?$/i.test(trimmed)) {
    const wardrobeResult = await runWardrobeCommand(request.text, wardrobeUndoFirst ? "pg-fashion-os" : request.pageId);
    if (wardrobeResult) toolResults = [wardrobeResult];
  }
  if (toolResults.length === 0 && genericUndo && previousDomain === "water") {
    toolResults = [parseToolResult(undo_water())];
  } else if (toolResults.length === 0 && genericUndo && previousDomain === "breakfast") {
    toolResults = [parseToolResult(undo_usual_meal("breakfast_usual"))];
  } else if (toolResults.length === 0 && genericUndo && previousDomain === "meat") {
    toolResults = [parseToolResult(undo_meat_eaten())];
  }
  if (toolResults.length === 0) {
    const execution = await executeDeterministicInstructions(request);
    toolResults = execution.toolResults;
    unresolved = execution.unresolved;
    executionContext = execution.context;
  }
  const deterministicAction = toolResults.some(
    (item) =>
      item.tool.startsWith("wardrobe_") ||
      item.tool.startsWith("weather_") ||
      item.tool === "stock_quarterly" ||
      item.tool === "trading_knowledge"
  );
  // Tools already answered (log water, meat, brief, weather, stocks, etc.) — return now
  if (toolResults.length > 0 && unresolved.length === 0) {
    const reply = cleanReply(localComposer(request.text, toolResults, executionContext.pageId, executionContext.pageTitle));
    rememberActionDomain(toolResults);
    recordMelReceipt(request.text, toolResults, executionContext);
    pushSessionMemory(request.text, reply);
    wonderEmit("mel.plan", "melAgent", {
      intent: deterministicAction ? "async-tool" : "sync-tool",
      planId: plan.id,
      ...runtimeStamp(started),
    });
    return withRl(request, { reply, mode: "action", toolResults });
  }

  // Only ask Ollama when the line is clearly a workspace action we didn't parse.
  // Keep the budget short so Mel never sits on "…" for 12s.
  if (
    toolResults.length === 0
    && request.localModelAvailable
    && mayNeedWorkspacePlanner(unresolved[0] || request.text)
  ) {
    try {
      const plannerRequest = {
        ...request,
        text: unresolved[0] || request.text,
        pageId: executionContext.pageId,
        pageTitle: executionContext.pageTitle,
      };
      const budgeted = await withBudget(4_500, () => planWorkspaceWithLocalModel(plannerRequest));
      if (budgeted.ok) {
        toolResults = executeLocalWorkspacePlan(budgeted.value, executionContext.pageId);
        if (toolResults.length) {
          executionContext = contextFromToolResults(executionContext, toolResults);
          const reply = cleanReply(localComposer(request.text, toolResults, executionContext.pageId, executionContext.pageTitle));
          rememberActionDomain(toolResults);
          recordMelReceipt(request.text, toolResults, executionContext);
          pushSessionMemory(request.text, reply);
          return withRl(request, { reply, mode: "action", toolResults });
        }
      }
    } catch {
      /* fall through */
    }
    // Deterministic fallback so move/create-style asks never hang forever
    if (/\b(move|put|place|nest)\b/i.test(request.text)) {
      const reply = cleanReply(
        "I couldn't run that move. Try: put Bookshelf under Learn — or: put Finances under Learn."
      );
      pushSessionMemory(request.text, reply);
      return withRl(request, { reply, mode: "offline-local", toolResults: [] });
    }
  }

  let reply = localComposer(
    request.text,
    toolResults,
    executionContext.pageId,
    executionContext.pageTitle
  );
  let mode: MelAgentMode = toolResults.length ? "action" : "offline-local";

  const researchRequested = /^(research|look up|find out|compare|investigate)\b/i.test(trimmed);
  if (researchRequested && !request.cloudAvailable) {
    reply = "Live research needs the optional Grok bridge. App actions and your saved data still work locally.";
  } else if (researchRequested && request.cloudAvailable && !request.forceLocal) {
    const budgeted = await withBudget(45_000, () => cloudReply(request, toolResults));
    if (budgeted.ok) {
      // Research stays freeform (long citations) — not forced through LOG envelope
      reply = budgeted.value.reply;
      mode = "research";
    } else {
      reply = "Research timed out. Try again, or ask an app action instead.";
      mode = "offline-local";
    }
  } else if (
    request.cloudAvailable
    && !request.forceLocal
    && !preferOfflinePath()
    && trimmed.length >= 12
    && !isInstantChat(trimmed)
  ) {
    // Hard latency budget for optional Grok polish → Mel JSON envelope
    const budgeted = await withBudget(plan.cloudBudgetMs, () => cloudReply(request, toolResults));
    if (budgeted.ok) {
      const applied = applyCloudOrUserEnvelope(budgeted.value.reply, {
        pageId: executionContext.pageId,
        toolsAlreadyRan: toolResults.length > 0,
        strict: false,
      });
      if (applied) {
        if (applied.toolResults.length) {
          toolResults = [...toolResults, ...applied.toolResults];
          executionContext = contextFromToolResults(executionContext, applied.toolResults);
        }
        reply = applied.reply;
        mode = applied.toolResults.length || toolResults.length ? "action" : "grok-connected";
      } else {
        // Freeform leak: never show raw model dump — re-ask in plain English
        reply =
          "Say it plain so I can route it: food, water, open a page, markets, or ideas.";
        mode = "offline-local";
      }
    } else {
      mode = "offline-local";
    }
  } else if (
    unresolved.length > 0
    && request.localModelAvailable
    && !request.forceLocal
  ) {
    const unresolvedRequest: MelAgentRequest = {
      ...request,
      text: unresolved.join("\n"),
      pageId: executionContext.pageId,
      pageTitle: executionContext.pageTitle,
    };
    const budgeted = await withBudget(8_000, () => localModelReply(unresolvedRequest));
    if (budgeted.ok) {
      const completed = toolResults.length
        ? localComposer(request.text, toolResults, executionContext.pageId, executionContext.pageTitle)
        : "";
      reply = [completed, budgeted.value].filter(Boolean).join("\n\n");
      mode = "local-model";
    }
  } else if (
    toolResults.length === 0
    && request.localModelAvailable
    && !request.forceLocal
    && /\b(think hard|go deep|detailed|explain fully)\b/i.test(trimmed)
  ) {
    const budgeted = await withBudget(8_000, () => localModelReply(request));
    if (budgeted.ok) {
      reply = budgeted.value;
      mode = "local-model";
    }
  }

  if (unresolved.length > 0 && mode !== "grok-connected" && mode !== "research" && mode !== "local-model") {
    // Real tool partial success: note only unresolved tool bits — never training phrases
    const real = unresolved.filter(
      (u) =>
        !/instead\s+say|terrible response|what can I help/i.test(u) &&
        u.trim().length > 0
    );
    if (toolResults.length && real.length) {
      const completed = localComposer(
        request.text,
        toolResults,
        executionContext.pageId,
        executionContext.pageTitle
      );
      reply = `${completed}\n\nI don't know what you're talking about for: ${real.join("; ")}.`;
    } else if (!toolResults.length) {
      reply = "I don't know what you're talking about.";
    }
  }

  reply = cleanReply(reply);
  rememberActionDomain(toolResults);
  recordMelReceipt(request.text, toolResults, executionContext);
  pushSessionMemory(request.text, reply);
  wonderEmit("mel.plan", "melAgent", {
    intent: mode,
    planId: plan.id,
    ...runtimeStamp(started),
  });
  return withRl(request, { reply, mode, toolResults });
}

export async function checkMelCloud(): Promise<boolean> {
  try {
    const response = await fetchJson("/api/melani-ai/health", { method: "GET" }, 2500);
    if (!response.ok) return false;
    const payload = await response.json() as { has_key?: boolean };
    return Boolean(payload.has_key);
  } catch {
    return false;
  }
}

export async function checkMelLocalModel(): Promise<boolean> {
  try {
    const response = await fetchJson("/api/ollama/api/tags", { method: "GET" }, 2500);
    if (!response.ok) return false;
    const payload = await response.json() as { models?: Array<{ name?: string }> };
    return Boolean(payload.models?.some((model) => model.name === LOCAL_MODEL));
  } catch {
    return false;
  }
}

import { writeTonightBrief } from "./bodyBrief";
import {
  bookshelfBriefReply,
  bookshelfStats,
  buildBookshelfKnowledgePack,
  searchBookshelfKnowledge,
} from "./bookKnowledge";
import { loadBooks, requestBookOpen, type Book } from "./booksStore";
import { requestBookDiscovery } from "./bookDiscovery";
import { deriveCycle, loadCycle } from "./cycleEngine";
import { DAILY_SUPPLEMENTS, MEAL_PRESETS, todayKey } from "./data";
import {
  buildEconCanonPack,
  explainEconFramework,
  findEconFramework,
} from "./econCanon";
import {
  dueDecisions,
  formatDecisions,
  listDecisions,
  logDecision,
  type Decision,
} from "./decisionsStore";
import { buildEvidencePack } from "./evidencePack";
import {
  formatHighlightHits,
  highlightStats,
  searchHighlights,
} from "./highlightIndex";
import {
  buildIntelligenceDigest,
  loadLastDigestText,
} from "./intelligenceL3";
import { buildOperatingBrain } from "./operatingBrain";
import { melStatsTool, runMelStatsQuery } from "./melStats";
import { formatCatalog } from "./statsCatalog";
import {
  approveMelGraph,
  listMelGraphs,
  melGraphStatus,
  rejectMelGraph,
  resumeMelGraph,
  startMelGraph,
} from "./melGraphs";
import { runMathLesson, tryMathCommand } from "./melMath";
import { tryMetricsCommand } from "./melMetrics";
import { tryExperimentCommand } from "./melExperiments";
import {
  runSuccessEngine,
  trySuccessMathCommand,
} from "./melSuccessMath";
import { tryContentCommand } from "./melContent";
import { tryFinanceModelCommand } from "./melFinanceModel";
import {
  appendLifeLog,
  applyGoalCommand,
  applyPinCommand,
  buildLiveContext,
  loadGoals,
  loadLifeLog,
  loadPins,
  searchLifeLog,
} from "./melContext";
import {
  buildFoodOsPlan,
  ensureTodayMeat,
  lockTodayMeat,
  markTodayMeatEaten,
  type FoodOsMeat,
  undoTodayMeatEaten,
} from "./foodOs";
import {
  MEL_NAVIGATE_EVENT,
  requestMelSidebarAction,
  requestMelWorkspaceAction,
  type MelPageReference,
  type MelSidebarAction,
  type MelWorkspaceAction,
} from "./melActions";
import { applyShoppingCommand } from "./shoppingStore";
import {
  bowelQuality,
  bowelQualityLabel,
  bowelStats,
  isFogDayWritable,
  loadBowelDetailMap,
  loadFogMap,
  loadSleepDay,
  saveSleepDay,
  setFogDay,
  upsertBowelDay,
  type BowelColor,
  type BowelFeel,
  type BowelLook,
} from "./sleepStore";
import { applyTaskCommand } from "./taskStore";
import { runCareCommandLocal } from "./care/agent";
import { careSnapshot } from "./care/store";
import {
  formatQuarterlyForMel,
  MEL_TRADING_KNOWLEDGE,
  offlineTradingBrief,
} from "./melTrading";
import {
  loadChecks,
  loadHabits,
  saveChecks,
  setAllChecks,
  setCheck,
  isChecked,
} from "./habitStore";
import { notifyHabitAutoSync } from "./habitAutoSync";
import { parseFoodText } from "./nutrition/parseFood";
import {
  addEntries,
  addEntry,
  loadDay as loadNutriDay,
  removeEntry,
  totalsFor as nutriTotalsFor,
  type MealSlot,
} from "./nutrition/nutritionStore";
import { expandFoodHabits } from "./melFoodHabits";

export const MEL_DATA_EVENT = "dr-melani-data-update";

export type MelToolResult<T = unknown> = {
  ok: boolean;
  tool: string;
  summary: string;
  data?: T;
};

type MacroBag = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
};

type MealDay = {
  loggedIds: string[];
  totals: MacroBag;
};

const EMPTY_MACROS: MacroBag = {
  calories: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  fiber_g: 0,
};

const PAGE_ALIASES: Array<{ pattern: RegExp; pageId: string; title: string }> = [
  { pattern: /^(?:my\s+)?(?:bookshelf|library|books?)$/i, pageId: "pg-library", title: "Bookshelf" },
  {
    pattern: /^(?:my\s+)?(?:math(?:\s+lab)?|crude\s+math|math\s+empire)$/i,
    pageId: "pg-math",
    title: "Math Lab",
  },
  // Failures desk permanently removed
  // Weather is Mel-only (no page) — do not navigate to a Weather page
  { pattern: /^(?:my\s+)?(?:wardrobe|closet|clothes)$/i, pageId: "pg-fashion-os", title: "Wardrobe" },
  { pattern: /^(?:style\s+shopper|shop\s+clothes|fashion\s+shop)$/i, pageId: "pg-fashion-os", title: "Style Shopper" },
  { pattern: /^(?:my\s+)?(?:shopping|grocer(?:y|ies)|inventory|restock)$/i, pageId: "pg-agent-shopping", title: "Shopping" },
  { pattern: /^(?:my\s+)?(?:gmail|email|inbox)$/i, pageId: "pg-agent-gmail", title: "Gmail" },
  { pattern: /^(?:my\s+)?(?:care|care concierge|appointments?|dentist|doctor appointments?)$/i, pageId: "pg-agent-care", title: "Care Concierge" },
  // Nutrition tab retired — route macros/food log to Fitness → Meals
  // Paper trading desk permanently removed — no Mel alias to it
  { pattern: /^(?:my\s+)?(?:meals?|food|nutrition|macros?|calories|cals|food log|what i ate)$/i, pageId: "pg-meals", title: "Meals" },
  { pattern: /^(?:my\s+)?(?:sleep|brain fog)$/i, pageId: "pg-sleep", title: "Sleep" },
  { pattern: /^(?:my\s+)?(?:gym|workout|training)$/i, pageId: "pg-gym", title: "Gym" },
  // Focus / Screen Time permanently removed — open Sleep instead
  {
    pattern: /^(?:my\s+)?(?:focus|screen\s*time|screentime)$/i,
    pageId: "pg-sleep",
    title: "Sleep",
  },
  {
    pattern: /^(?:my\s+)?(?:fitness|bowel|bowel movement|bm tracker|poop tracker)$/i,
    pageId: "pg-fitness",
    title: "Fitness",
  },
  { pattern: /^(?:my\s+)?(?:habits?|habit tracker|streaks?|routines?)$/i, pageId: "pg-habits", title: "Habits" },
  { pattern: /^(?:my\s+)?(?:data|labs?|period|cycle|health data)$/i, pageId: "pg-data", title: "My Data" },
  { pattern: /^(?:my\s+)?daily shower$/i, pageId: "pg-shower-daily", title: "Daily shower" },
  { pattern: /^(?:my\s+)?everything shower$/i, pageId: "pg-shower-everything", title: "Everything shower" },
  { pattern: /^(?:my\s+)?hair(?: care)?$/i, pageId: "pg-hair", title: "Hair care" },
  // AM / PM skincare — broad so Mel can transport you for real
  {
    pattern:
      /^(?:my\s+)?(?:am|a\.?m\.?|morning)(?:\s+|-)?(?:skin(?:care)?|skincare|skin care)$/i,
    pageId: "pg-am-skin",
    title: "AM skincare",
  },
  {
    pattern:
      /^(?:my\s+)?(?:pm|p\.?m\.?|night|evening|retinol)(?:\s+|-)?(?:skin(?:care)?|skincare|skin care|night)?$/i,
    pageId: "pg-pm-skin",
    title: "PM skincare",
  },
  {
    pattern: /^(?:my\s+)?(?:skin care|skincare)(?:\s+(?:am|a\.?m\.?|morning))$/i,
    pageId: "pg-am-skin",
    title: "AM skincare",
  },
  {
    pattern: /^(?:my\s+)?(?:skin care|skincare)(?:\s+(?:pm|p\.?m\.?|night|evening))$/i,
    pageId: "pg-pm-skin",
    title: "PM skincare",
  },
  { pattern: /^(?:my\s+)?(?:hygiene|shower|skincare|skin care)$/i, pageId: "pg-hygiene", title: "Hygiene" },
  // World Monitor deleted — markets/stocks language routes to Finances
  {
    pattern:
      /^(?:my\s+)?(?:world\s*monitor|tech\s*news|markets?|stocks?|options?|trades?|trading|startups?|silicon\s*valley|finance\s*radar|work)$/i,
    pageId: "pg-finance",
    title: "Finances",
  },
  { pattern: /^(?:my\s+)?learn$/i, pageId: "pg-library", title: "Bookshelf" },
  { pattern: /^(?:my\s+)?health$/i, pageId: "pg-fitness", title: "Fitness" },
];

function result<T>(tool: string, summary: string, data?: T): string {
  return JSON.stringify({ ok: true, tool, summary, data } satisfies MelToolResult<T>);
}

function failure(tool: string, summary: string): string {
  return JSON.stringify({ ok: false, tool, summary } satisfies MelToolResult);
}

/**
 * Turn what Melani said ("bookshelf", "learn", "work") into a real page ref.
 * Uses aliases so "learn" and "bookshelf" hit the right page ids, not a vague title search.
 */
function pageReference(target?: string, currentPageId?: string): MelPageReference {
  let cleaned = (target || "")
    .trim()
    .replace(/^(?:the\s+)?page\s+/i, "")
    .replace(/\s+page$/i, "") // "bookshelf page" → "bookshelf"
    .replace(/^(?:the\s+)?(?:section|folder|toggle)\s+/i, "")
    .replace(/\s+(?:section|folder|toggle)$/i, "")
    .replace(/^["'`]+|["'`.,!?]+$/g, "")
    .trim();
  if (!cleaned || /^(?:this|current|here|it)(?:\s+page)?$/i.test(cleaned)) {
    return currentPageId ? { id: currentPageId } : { current: true };
  }
  // Prefer known aliases (bookshelf, learn, work, hygiene…) so moves never hang on fuzzy titles
  const alias = PAGE_ALIASES.find((entry) => entry.pattern.test(cleaned));
  if (alias) {
    return { id: alias.pageId, title: alias.title };
  }
  return { title: cleaned };
}

function workspaceTool(tool: string, action: MelWorkspaceAction): string {
  const outcome = requestMelWorkspaceAction(action);
  return outcome.ok
    ? result(tool, outcome.summary, outcome.data ?? outcome)
    : failure(tool, outcome.summary);
}

function sidebarTool(tool: string, action: MelSidebarAction): string {
  const outcome = requestMelSidebarAction(action);
  return outcome.ok
    ? result(tool, outcome.summary, outcome.data ?? outcome)
    : failure(tool, outcome.summary);
}

function notify(detail: Record<string, unknown>): void {
  window.dispatchEvent(new CustomEvent(MEL_DATA_EVENT, { detail }));
}

function loadMealDay(day: string): MealDay {
  try {
    const parsed = JSON.parse(localStorage.getItem(`dr-melani-meals-usuals:${day}`) || "null") as MealDay | null;
    if (parsed?.totals && Array.isArray(parsed.loggedIds)) {
      return { loggedIds: parsed.loggedIds, totals: { ...EMPTY_MACROS, ...parsed.totals } };
    }
  } catch {
    /* use empty day */
  }
  return { loggedIds: [], totals: { ...EMPTY_MACROS } };
}

function saveMealDay(day: string, value: MealDay): void {
  localStorage.setItem(`dr-melani-meals-usuals:${day}`, JSON.stringify(value));
  notify({ domain: "meals", day });
}

function formatClock(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function normalizeBookText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}

function bookMatchScore(book: Book, query: string): number {
  const q = normalizeBookText(query);
  const title = normalizeBookText(book.title);
  const author = normalizeBookText(book.author);
  if (!q) return 0;
  if (title === q) return 100;
  if (title.startsWith(q) || q.startsWith(title)) return 92;
  if (title.includes(q) || q.includes(title)) return 88;
  const words = book.title.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 5);
  if (words.some((word) => q.includes(normalizeBookText(word)))) return 78;
  if (`${title}${author}`.includes(q)) return 72;
  return 0;
}

export function parseToolResult(raw: string): MelToolResult {
  try {
    return JSON.parse(raw) as MelToolResult;
  } catch {
    return { ok: false, tool: "unknown", summary: raw };
  }
}

export function get_live_snapshot(pageId?: string, pageTitle?: string): string {
  const day = todayKey();
  const goals = loadGoals();
  const meals = loadMealDay(day);
  const sleep = loadSleepDay(day);
  const fogMap = loadFogMap();
  const derived = deriveCycle(loadCycle());
  const food = buildFoodOsPlan(day);
  const waterMl = Math.max(0, Number(localStorage.getItem(`dr-melani-water-ml:${day}`)) || 0);
  const loggedMeals = meals.loggedIds.map((id) => MEAL_PRESETS.find((meal) => meal.id === id)?.title || id);
  // Always inject advanced stock/trading knowledge so Mel acts like a serious desk
  const marketsBoost =
    pageId === "pg-finance" || /financ|stock|market/i.test(pageTitle || "")
      ? `\n\n${MEL_TRADING_KNOWLEDGE}`
      : `\n\n${MEL_TRADING_KNOWLEDGE.slice(0, 2400)}`;
  // Whoop pack is already inside buildLiveContext (literacy + day table + full CSVs)
  const data = {
    day,
    page: { id: pageId || "", title: pageTitle || "" },
    goals,
    water: { ml: waterMl, goalMl: goals.water_ml, remainingMl: Math.max(0, goals.water_ml - waterMl) },
    meals: { logged: loggedMeals, totals: meals.totals },
    sleep,
    brainFog: Object.hasOwn(fogMap, day) ? fogMap[day] : null,
    cycle: { phase: derived.phaseLabel, day: derived.currentDay, nextPeriodEstimate: derived.nextPeriodEst },
    food,
    care: careSnapshot(),
    pins: loadPins(),
    recentLogs: loadLifeLog().slice(-8),
    liveContext: buildLiveContext(pageId, pageTitle) + marketsBoost,
  };
  return result("get_live_snapshot", "Read the live Wonder snapshot.", data);
}

const DEFAULT_WATCH = "AAPL,MSFT,NVDA,GOOGL,META,AMZN,TSLA,AMD";

/** Live quarterly packs for Mel (free Yahoo data) */
export async function fetch_stock_quarterly(symbolsCsv?: string): Promise<string> {
  const symbols = (symbolsCsv || DEFAULT_WATCH).trim() || DEFAULT_WATCH;
  try {
    const res = await fetch(
      `/api/intel/quarterly?symbols=${encodeURIComponent(symbols)}`
    );
    if (!res.ok) throw new Error(`quarterly ${res.status}`);
    const data = (await res.json()) as {
      reports?: Array<Record<string, unknown>>;
    };
    const reports = Array.isArray(data.reports) ? data.reports : [];
    const text = reports
      .map((r) => formatQuarterlyForMel(r as Parameters<typeof formatQuarterlyForMel>[0]))
      .join("\n\n");
    return result(
      "stock_quarterly",
      text || "No quarterly packs returned.",
      { reports, symbols }
    );
  } catch (e) {
    return failure(
      "stock_quarterly",
      e instanceof Error ? e.message : "Could not load quarterly reports."
    );
  }
}

/** Offline trading framework (no network) */
export function trading_knowledge_brief(topic?: string): string {
  return result("trading_knowledge", offlineTradingBrief(topic), {
    topic: topic || "general",
  });
}

/**
 * Bookshelf intelligence — what she owns, is reading, and highlighted.
 * Mel: "what am I reading", "my economics books", "search shelf for inflation".
 */
export function bookshelf_knowledge(query?: string): string {
  const q = (query || "").trim();
  const stats = bookshelfStats();
  if (q && !/^(what|show|list|my|books?|bookshelf|shelf|reading|all|econ.*books?)$/i.test(q)) {
    const hits = searchBookshelfKnowledge(q, 8);
    if (!hits.length) {
      return result(
        "bookshelf_knowledge",
        `No shelf match for “${q}”. Shelf has ${stats.total} books (${stats.econ} econ/money). Try a title fragment or author.`,
        { stats, hits: [] }
      );
    }
    const lines = hits.map((h) => {
      const bits = [
        `${h.title} — ${h.author}`,
        h.status,
        h.isEcon ? "econ" : null,
        h.progress > 0 ? `${Math.round(h.progress * 100)}%` : null,
      ].filter(Boolean);
      let block = `• ${bits.join(" · ")}`;
      if (h.noteSnippet) block += `\n  note: ${h.noteSnippet}`;
      for (const quote of h.quotes.slice(0, 2)) {
        block += `\n  highlight: “${quote.text.slice(0, 180)}”`;
        if (quote.interpretation) block += ` → ${quote.interpretation.slice(0, 120)}`;
      }
      return block;
    });
    return result(
      "bookshelf_knowledge",
      [`Bookshelf hits for “${q}” (${hits.length}):`, "", ...lines].join("\n"),
      { stats, hits }
    );
  }
  const pack = buildBookshelfKnowledgePack({ maxChars: 3500, deep: true });
  return result("bookshelf_knowledge", bookshelfBriefReply(q) + "\n\n" + pack, {
    stats,
  });
}

/**
 * Economics canon — original frameworks Mel can teach offline.
 * Mel: "explain opportunity cost", "what are incentives", "economics 101".
 */
export function econ_knowledge(topic?: string): string {
  const q = (topic || "").trim();
  if (q && !/^(econ|economics|macro|micro)\s*(101|basics|help|desk)?$/i.test(q)) {
    const fw = findEconFramework(q);
    if (fw) {
      // Attach matching highlights as proof (V2)
      const hits = searchHighlights(q || fw.name, 3);
      let summary = explainEconFramework(fw);
      if (hits.length) {
        summary +=
          "\n\nFrom your highlights:\n" + formatHighlightHits(hits, { maxEach: 160 });
      }
      return result("econ_knowledge", summary, {
        id: fw.id,
        name: fw.name,
        reading: fw.reading,
        highlightIds: hits.map((h) => h.quoteId),
      });
    }
  }
  return result(
    "econ_knowledge",
    buildEconCanonPack(3200) +
      "\n\nAsk “explain opportunity cost” or any framework name for the full teaching card.",
    { frameworks: "canon" }
  );
}

/**
 * Search user-saved highlights across the whole shelf (V2).
 * Mel: "my highlights", "what did I highlight about risk".
 */
export function search_highlights(query?: string): string {
  const q = (query || "").trim();
  const stats = highlightStats();
  const hits = searchHighlights(q, 10);
  if (!stats.total) {
    return result(
      "search_highlights",
      "You have no saved highlights yet. Open a book in Wonder, select a sentence, and save it. I index every quote you mark.",
      { stats, hits: [] }
    );
  }
  if (!hits.length) {
    return result(
      "search_highlights",
      `No highlight matched “${q}”. You have ${stats.total} highlights across ${stats.booksWithHighlights} books. Try another word.`,
      { stats, hits: [] }
    );
  }
  const head = q
    ? `Highlights for “${q}” (${hits.length} hits · ${stats.total} total on shelf):`
    : `Recent highlights (${hits.length} of ${stats.total}):`;
  return result(
    "search_highlights",
    head + "\n\n" + formatHighlightHits(hits),
    {
      stats,
      hits: hits.map((h) => ({
        quoteId: h.quoteId,
        bookId: h.bookId,
        title: h.title,
        author: h.author,
        text: h.text.slice(0, 280),
        score: h.score,
        concepts: h.concepts,
      })),
    }
  );
}

/** Ranked evidence pack for a free-text question (V2 retrieve path). */
export function evidence_pack(query?: string, pageId?: string, pageTitle?: string): string {
  const pack = buildEvidencePack(query || "", { pageId, pageTitle, maxChars: 4500 });
  return result("evidence_pack", pack.text, {
    sources: pack.sources,
    stats: pack.stats,
    highlightIds: pack.highlights.map((h) => h.quoteId),
  });
}

/** Log a decision Melani can reopen later (Phase B compound memory). */
export function log_decision(
  question: string,
  choice: string,
  domain: Decision["domain"] = "money",
  revisitDays?: number,
  assumptions?: string
): string {
  if (!question.trim() || !choice.trim()) {
    return failure(
      "log_decision",
      "Need both a question and a choice. Example: decide money: keep Grok $30 for 90 days | revisit 90"
    );
  }
  const row = logDecision({
    domain,
    question,
    choice,
    revisitDays,
    assumptions,
  });
  return result(
    "log_decision",
    `Logged [${row.domain}] decision on ${row.at.slice(0, 10)}: ${row.choice}` +
      (row.revisitAt ? ` · revisit ${row.revisitAt}` : ""),
    row
  );
}

export function list_decisions(domain?: Decision["domain"]): string {
  const list = listDecisions(15, domain);
  return result("list_decisions", formatDecisions(list), { count: list.length, list });
}

/** Level 3: decisions past revisit date. */
export function list_due_decisions(): string {
  const list = dueDecisions();
  if (!list.length) {
    return result(
      "list_due_decisions",
      "No decision revisits due. Log one with: decide money: … | revisit 30",
      { count: 0, list: [] }
    );
  }
  return result(
    "list_due_decisions",
    `Due revisits (${list.length}):\n\n${formatDecisions(list)}`,
    { count: list.length, list }
  );
}

/**
 * Level 3 compound weekly intelligence digest.
 * Body × money × decisions × shelf → one priority.
 */
/**
 * Operating Brain — multi-day correlations + ranked moves (L4).
 * Mel: "what matters", "operating brain", "be smart", "top move".
 */
export function operating_brain_brief(): string {
  const brain = buildOperatingBrain();
  return result("operating_brain_brief", brain.packText, {
    topMove: brain.topMove,
    readiness: brain.buildReadiness,
    insightCount: brain.insights.length,
  });
}

/**
 * Mel Stats Lab — classical models on her WHOOP / sleep / money series.
 * Mel: "stats models", "forecast recovery", "correlate sleep and recovery".
 */
export function run_stats_lab(query = ""): string {
  const q = (query || "").trim();
  if (!q || /^(help|models?|catalog)$/i.test(q)) {
    const text = formatCatalog();
    return result("run_stats_lab", text, { mode: "catalog" });
  }
  const text = melStatsTool(q);
  return result("run_stats_lab", text, { query: q });
}

/** Returns stats reply text if the utterance is a stats lab command; else null. */
export function tryStatsLabCommand(raw: string): string | null {
  return runMelStatsQuery(raw.trim());
}

/**
 * Agent loop / graph commands — carry work between steps; you keep last yes.
 */
export async function run_agent_loop(query = ""): Promise<string> {
  const q = query.trim();
  if (!q || /^(help|list|loops?|graphs?)$/i.test(q)) {
    return result("run_agent_loop", listMelGraphs(), { mode: "list" });
  }
  if (/^(status|state)$/i.test(q)) {
    return result("run_agent_loop", melGraphStatus(), { mode: "status" });
  }
  if (/^(approve|yes|continue|go)$/i.test(q)) {
    const text = await approveMelGraph();
    return result("run_agent_loop", text, { mode: "approve" });
  }
  if (/^(reject|no|stop|cancel)$/i.test(q)) {
    const text = await rejectMelGraph();
    return result("run_agent_loop", text, { mode: "reject" });
  }
  if (/^(resume)$/i.test(q)) {
    const text = await resumeMelGraph();
    return result("run_agent_loop", text, { mode: "resume" });
  }
  // start: body_night | focus_sync | weekly_os
  const id = q
    .replace(/^(?:run\s+)?(?:loop|graph)\s+/i, "")
    .replace(/\s+/g, "_")
    .toLowerCase();
  const text = await startMelGraph(id);
  return result("run_agent_loop", text, { mode: "start", graphId: id });
}

export function tryAgentLoopCommand(raw: string): string | null {
  const t = raw.trim();
  if (
    /^(?:loops?|graphs?|agent\s+loops?|list\s+loops?)$/i.test(t) ||
    /^(?:run\s+)?(?:loop|graph)\b/i.test(t) ||
    /^(?:approve|reject)\s+loop\b/i.test(t) ||
    /^loop\s+(?:status|approve|reject|resume)\b/i.test(t) ||
    /^(?:approve|reject)\s+loop$/i.test(t)
  ) {
    return t; // signal caller to await run_agent_loop
  }
  return null;
}

/** Crude math curriculum — backend only; prefer success engines for humans. */
export function run_math_lab(query = ""): string {
  const q = (query || "list").trim() || "list";
  const text = runMathLesson(q);
  return result("run_math_lab", text, { query: q });
}

export function tryMathLabCommand(raw: string): string | null {
  // Success / apply engines beat pure curriculum when both could match
  const success = trySuccessMathCommand(raw.trim());
  if (success) return success;
  return tryMathCommand(raw.trim());
}

/** Applied success math — engines on live metrics (brief output, no UI). */
export function run_success_math(query = ""): string {
  const q = (query || "list").trim() || "list";
  const text = runSuccessEngine(q, { verbose: false });
  return result("run_success_math", text, { query: q });
}

export function trySuccessMathLabCommand(raw: string): string | null {
  return trySuccessMathCommand(raw.trim());
}

/** YouTube / content performance backbone */
export function run_content(query = ""): string {
  const text = tryContentCommand(query.trim() || "videos");
  return result("run_content", text || formatContentFallback(), { query });
}

function formatContentFallback(): string {
  return tryContentCommand("videos") || "videos";
}

export function tryContentLabCommand(raw: string): string | null {
  return tryContentCommand(raw.trim());
}

/** Quiet finance runway model */
export function run_finance_model(query = ""): string {
  const text = tryFinanceModelCommand(query.trim() || "runway");
  return result("run_finance_model", text || "runway", { query });
}

export function tryFinanceModelLabCommand(raw: string): string | null {
  return tryFinanceModelCommand(raw.trim());
}

/** Metric registry — list / add / log */
export function run_metrics(query = ""): string {
  const text = tryMetricsCommand(query.trim() || "list metrics");
  return result("run_metrics", text || formatMetricsFallback(), { query });
}

function formatMetricsFallback(): string {
  return tryMetricsCommand("list metrics") || "list metrics";
}

export function tryMetricsLabCommand(raw: string): string | null {
  return tryMetricsCommand(raw.trim());
}

/** Experiment notebook */
export function run_experiments(query = ""): string {
  const text = tryExperimentCommand(query.trim() || "notebook");
  return result("run_experiments", text || "notebook", { query });
}

export function tryExperimentsLabCommand(raw: string): string | null {
  return tryExperimentCommand(raw.trim());
}

export function weekly_intelligence_digest(): string {
  const digest = buildIntelligenceDigest();
  return result("weekly_intelligence_digest", digest.fullText, {
    weekStart: digest.weekStart,
    weekEnd: digest.weekEnd,
    priority: digest.priority,
    due: digest.decisionsDue.length,
    crossLinks: digest.crossLinks.length,
    body: digest.body,
    money: digest.money,
  });
}

/** Last saved L3 digest text (if any). */
export function last_intelligence_digest(): string {
  const text = loadLastDigestText();
  if (!text) {
    return result(
      "last_intelligence_digest",
      "No Level 3 digest stored yet. Say “weekly digest” to build one.",
      { empty: true }
    );
  }
  return result("last_intelligence_digest", text, { empty: false });
}

export function write_body_brief(): string {
  const brief = writeTonightBrief();
  notify({ domain: "brief", day: brief.day });
  return result("write_body_brief", `Wrote the body brief for ${brief.day}.`, brief);
}

export function get_food_plan(): string {
  const plan = buildFoodOsPlan();
  return result(
    "get_food_plan",
    `Fixed menu every day (no choices). ${plan.loggedCount}/${plan.totalMeals} logged. Dinner is always salmon.`,
    plan
  );
}

export function lock_meat(meat: FoodOsMeat): string {
  const value = lockTodayMeat(meat);
  notify({ domain: "food", meat });
  return result("lock_meat", `Locked ${meat} for today.`, value);
}

export function log_meat_eaten(meat?: FoodOsMeat): string {
  const value = markTodayMeatEaten(meat);
  appendLifeLog(`Food OS: ate ${value.meat}.`);
  notify({ domain: "food", meat: value.meat });
  return result("log_meat_eaten", `Logged ${value.meat} as eaten today.`, value);
}

export function undo_meat_eaten(): string {
  const value = undoTodayMeatEaten();
  notify({ domain: "food", meat: value.meat });
  return result("undo_meat_eaten", `Removed today's eaten mark for ${value.meat}.`, value);
}

/** Guess meal slot from time of day (local) */
function defaultMealSlot(): MealSlot {
  const h = new Date().getHours();
  if (h < 11) return "breakfast";
  if (h < 15) return "lunch";
  if (h < 21) return "dinner";
  return "snack";
}

function slotFromText(text: string): MealSlot {
  const t = text.toLowerCase();
  if (/\bbreakfast\b/.test(t)) return "breakfast";
  if (/\blunch\b/.test(t)) return "lunch";
  if (/\bdinner\b/.test(t)) return "dinner";
  if (/\bsnack\b/.test(t)) return "snack";
  return defaultMealSlot();
}

/** Day totals from the single nutrition ledger (item rows → legacy mirror). */
function dayFromNutri(day: string): MealDay {
  const entries = loadNutriDay(day);
  const t = nutriTotalsFor(day);
  const loggedIds = [
    ...new Set(
      entries
        .map((e) => e.presetId || e.id)
        .filter(Boolean)
    ),
  ];
  return {
    loggedIds,
    totals: {
      calories: Math.round(t.calories),
      protein_g: Math.round(t.protein_g * 10) / 10,
      carbs_g: Math.round(t.carbs_g * 10) / 10,
      fat_g: Math.round(t.fat_g * 10) / 10,
      fiber_g: Math.round(t.fiber_g * 10) / 10,
    },
  };
}

export function log_usual_meal(presetId: string): string {
  const preset = MEAL_PRESETS.find((meal) => meal.id === presetId);
  if (!preset) return failure("log_usual_meal", `No usual meal matches ${presetId}.`);
  const day = todayKey();
  // Already logged this preset today (single truth = nutrition entries)
  if (loadNutriDay(day).some((e) => e.presetId === preset.id)) {
    return result(
      "log_usual_meal",
      `${preset.title} is already logged today.`,
      dayFromNutri(day)
    );
  }

  const slot: MealSlot =
    /breakfast/i.test(preset.id) || /breakfast/i.test(preset.title)
      ? "breakfast"
      : /lunch/i.test(preset.id) || /lunch/i.test(preset.title)
        ? "lunch"
        : /dinner/i.test(preset.id) || /dinner/i.test(preset.title)
          ? "dinner"
          : "snack";

  addEntry(
    {
      slot,
      name: preset.title,
      grams: 0,
      qtyLabel: "Usual meal",
      macros: {
        calories: preset.calories,
        protein_g: preset.protein_g,
        carbs_g: preset.carbs_g,
        fat_g: preset.fat_g,
        fiber_g: preset.fiber_g,
      },
      presetId: preset.id,
      source: "preset",
    },
    day
  );

  const consumeKey = `dr-melani-meals-consume:${day}`;
  try {
    const consume = JSON.parse(localStorage.getItem(consumeKey) || "{}") as Record<
      string,
      { done: boolean; time: string }
    >;
    consume[`meal-${preset.id}`] = { done: true, time: formatClock(new Date()) };
    localStorage.setItem(consumeKey, JSON.stringify(consume));
  } catch {
    /* nutrition row is already saved */
  }
  notifyHabitAutoSync(day);
  notify({ domain: "meals", day });
  const next = dayFromNutri(day);
  return result(
    "log_usual_meal",
    `Logged ${preset.title.toLowerCase()}: ${preset.calories} calories and ${preset.protein_g}g protein.`,
    next
  );
}

/**
 * Natural-language food log — single ledger: nutritionStore item rows
 * (+ legacy mirror for Fitness rings / twin / brief).
 *
 * Melani habits first (2 boiled eggs, pocky boxes, chicken), then free parse.
 */
export function log_food_nl(raw: string): string {
  let cleaned = (raw || "")
    .trim()
    .replace(/^(?:please\s+)?(?:i\s+)?(?:just\s+)?(?:also\s+)?/i, "")
    .replace(
      /^(?:ate|had|eaten|eating|logged?|log|for\s+(?:breakfast|lunch|dinner|snack))\s+/i,
      ""
    )
    .replace(/^(?:i\s+)?(?:ate|had)\s+/i, "")
    .trim();
  if (!cleaned) {
    return failure(
      "log_food_nl",
      "Tell me what you ate (e.g. 2 boiled eggs, rice and chicken)."
    );
  }

  // Personal usuals → exact log phrases Melani already uses
  const habits = expandFoodHabits(cleaned);
  const habitNotes = habits.notes;
  let usualBreakfast = false;
  const habitPhrases = habits.phrases.filter((p) => {
    if (p === "__usual_breakfast__") {
      usualBreakfast = true;
      return false;
    }
    return true;
  });

  // Parse habit phrases + any leftover free text as one meal string
  const parseBlob = [...habitPhrases, habits.remainder]
    .filter(Boolean)
    .join(", ");
  const parsed = parseFoodText(parseBlob || cleaned);

  if (usualBreakfast) {
    // Side-effect: log breakfast usual in addition to free-form items
    try {
      log_usual_meal("breakfast_usual");
    } catch {
      /* ignore */
    }
  }

  if (!parsed.items.length || !parsed.items.some((i) => i.food)) {
    if (usualBreakfast) {
      return result(
        "log_food_nl",
        "Logged your usual breakfast.",
        dayFromNutri(todayKey())
      );
    }
    return failure(
      "log_food_nl",
      `I couldn't map “${cleaned}” to a food yet. Try: 2 boiled eggs, chicken, 1 box pocky.`
    );
  }

  const day = todayKey();
  const slot = slotFromText(raw);
  const inputs = parsed.items
    .filter((i) => i.food)
    .map((i) => ({
      slot,
      name: i.name,
      grams: i.grams || 0,
      qtyLabel: i.qtyLabel || "",
      macros: {
        calories: Math.round(i.macros.calories),
        protein_g: Math.round(i.macros.protein_g * 10) / 10,
        carbs_g: Math.round(i.macros.carbs_g * 10) / 10,
        fat_g: Math.round(i.macros.fat_g * 10) / 10,
        fiber_g: Math.round(i.macros.fiber_g * 10) / 10,
      },
      foodId: i.food?.id,
      source: "text" as const,
    }));

  addEntries(inputs, day);
  notifyHabitAutoSync(day);
  notify({ domain: "meals", day });

  const dayTotals = dayFromNutri(day).totals;
  const lines = parsed.items
    .filter((i) => i.food)
    .map(
      (i) =>
        `${i.qtyLabel} ${i.name}`.trim() +
        ` · ${Math.round(i.macros.calories)} cal · ${Math.round(i.macros.protein_g * 10) / 10}g protein`
    );
  const unmatched =
    parsed.unmatched.length > 0
      ? ` Unmatched: ${parsed.unmatched.join(", ")}.`
      : "";
  const habitLine =
    habitNotes.length > 0 ? ` (${habitNotes.join("; ")})` : "";

  return result(
    "log_food_nl",
    `Logged: ${lines.join("; ")}.${habitLine} Today ${Math.round(dayTotals.calories)} cal · ${Math.round(dayTotals.protein_g * 10) / 10}g protein.${unmatched}`,
    {
      items: parsed.items,
      totals: parsed.totals,
      dayTotals,
      unmatched: parsed.unmatched,
      slot,
      habits: habitPhrases,
    }
  );
}

export function undo_usual_meal(presetId: string): string {
  const preset = MEAL_PRESETS.find((meal) => meal.id === presetId);
  if (!preset) return failure("undo_usual_meal", `No usual meal matches ${presetId}.`);
  const day = todayKey();
  const hit = loadNutriDay(day).find((e) => e.presetId === preset.id);
  if (!hit) {
    return result(
      "undo_usual_meal",
      `${preset.title} was not logged today.`,
      dayFromNutri(day)
    );
  }
  removeEntry(hit.id, day);
  try {
    const consumeKey = `dr-melani-meals-consume:${day}`;
    const consume = JSON.parse(localStorage.getItem(consumeKey) || "{}") as Record<
      string,
      { done: boolean; time: string }
    >;
    if (consume[`meal-${preset.id}`]) {
      consume[`meal-${preset.id}`] = { done: false, time: "" };
      localStorage.setItem(consumeKey, JSON.stringify(consume));
    }
  } catch {
    /* ignore */
  }
  notifyHabitAutoSync(day);
  notify({ domain: "meals", day });
  return result("undo_usual_meal", `Undid ${preset.title.toLowerCase()}.`, dayFromNutri(day));
}

export function log_water(amountMl: number): string {
  if (!Number.isFinite(amountMl) || amountMl <= 0) return failure("log_water", "Water amount must be above zero.");
  const day = todayKey();
  const key = `dr-melani-water-ml:${day}`;
  const historyKey = `dr-melani-water-hist:${day}`;
  const before = Math.max(0, Number(localStorage.getItem(key)) || 0);
  const next = before + Math.round(amountMl);
  localStorage.setItem(key, String(next));
  let history: number[] = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(historyKey) || "[]") as number[];
    if (Array.isArray(parsed)) history = parsed;
  } catch {
    /* use empty history */
  }
  localStorage.setItem(historyKey, JSON.stringify([...history, Math.round(amountMl)]));
  notify({ domain: "water", day });
  const habitSync = notifyHabitAutoSync(day);
  const lit = (next / 1000).toFixed(next % 1000 ? 1 : 0);
  const goalHit = next >= 3500;
  const habitNote =
    habitSync.changed && habitSync.details.length
      ? ` Habit: ${habitSync.details.join(", ")}.`
      : goalHit
        ? " 3.5 L goal hit — water habit should show complete."
        : "";
  return result(
    "log_water",
    `Logged ${(amountMl / 1000).toFixed(amountMl % 1000 ? 2 : 1)} L. Water is now ${lit} L today.${habitNote}`,
    {
      amountMl,
      totalMl: next,
      goalHit,
      habitUpdates: habitSync.details,
    }
  );
}

/**
 * Set today's water total absolutely (liters). Used by Mel JSON protocol
 * field water_liters_today so LIFE LOG can pin the day total, not only add.
 */
export function set_water_liters(liters: number): string {
  if (!Number.isFinite(liters) || liters < 0) {
    return failure("set_water_liters", "Water liters must be zero or higher.");
  }
  if (liters > 20) {
    return failure("set_water_liters", "Water over 20 L looks like a bad number. Re-say the total.");
  }
  const day = todayKey();
  const key = `dr-melani-water-ml:${day}`;
  const historyKey = `dr-melani-water-hist:${day}`;
  const before = Math.max(0, Number(localStorage.getItem(key)) || 0);
  const next = Math.round(liters * 1000);
  const delta = next - before;
  localStorage.setItem(key, String(next));
  if (delta !== 0) {
    let history: number[] = [];
    try {
      const parsed = JSON.parse(localStorage.getItem(historyKey) || "[]") as number[];
      if (Array.isArray(parsed)) history = parsed;
    } catch {
      /* empty */
    }
    // Record absolute set as a single history step so undo still works
    localStorage.setItem(historyKey, JSON.stringify([...history, delta]));
  }
  notify({ domain: "water", day });
  const habitSync = notifyHabitAutoSync(day);
  const lit = (next / 1000).toFixed(next % 1000 ? 1 : 0);
  const goalHit = next >= 3500;
  const habitNote =
    habitSync.changed && habitSync.details.length
      ? ` Habit: ${habitSync.details.join(", ")}.`
      : goalHit
        ? " 3.5 L goal hit — water habit should show complete."
        : "";
  return result(
    "set_water_liters",
    `Water set to ${lit} L today.${habitNote}`,
    {
      liters,
      totalMl: next,
      beforeMl: before,
      goalHit,
      habitUpdates: habitSync.details,
    }
  );
}

export function undo_water(): string {
  const day = todayKey();
  const key = `dr-melani-water-ml:${day}`;
  const historyKey = `dr-melani-water-hist:${day}`;
  let history: number[] = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(historyKey) || "[]") as number[];
    if (Array.isArray(parsed)) history = parsed;
  } catch {
    /* use empty history */
  }
  const amount = history.pop();
  if (!amount) return result("undo_water", "There is no water entry to undo today.");
  const next = Math.max(0, (Number(localStorage.getItem(key)) || 0) - amount);
  localStorage.setItem(key, String(next));
  localStorage.setItem(historyKey, JSON.stringify(history));
  notify({ domain: "water", day });
  notifyHabitAutoSync(day);
  return result("undo_water", `Undid ${(amount / 1000).toFixed(amount % 1000 ? 2 : 1)} L. Water is now ${(next / 1000).toFixed(1)} L today.`, { amountMl: amount, totalMl: next });
}

export function log_sleep_hours(hours: number): string {
  if (!Number.isFinite(hours) || hours < 1 || hours > 16) return failure("log_sleep_hours", "Sleep must be between 1 and 16 hours.");
  const wake = new Date();
  const bed = new Date(wake.getTime() - hours * 60 * 60 * 1000);
  const value = saveSleepDay(todayKey(), formatClock(bed), formatClock(wake));
  notify({ domain: "sleep", day: todayKey() });
  notifyHabitAutoSync(todayKey());
  return result("log_sleep_hours", `Logged ${value.hours} hours of sleep ending at ${value.wake}.`, value);
}

export function get_sleep_today(): string {
  const value = loadSleepDay(todayKey());
  const summary = value.hours == null ? "Sleep is not logged today." : `Sleep is ${value.hours} hours today.`;
  return result("get_sleep_today", summary, value);
}

export function log_brain_fog(value: boolean): string {
  const day = todayKey();
  if (!isFogDayWritable(day)) {
    const current = loadFogMap()[day];
    const label =
      current === true ? "yes" : current === false ? "no" : "not logged";
    return failure(
      "log_brain_fog",
      `Brain fog is locked for today (after 11:59 PM). Final answer: ${label}.`
    );
  }
  setFogDay(day, value);
  notify({ domain: "brainFog", day });
  return result(
    "log_brain_fog",
    `Brain fog is logged as ${value ? "yes" : "no"} for today. You can change it until 11:59 PM.`,
    { value, locked: false }
  );
}

/**
 * Full bowel write — day snapshot + event history.
 * Mel: "I pooped type 7 liquid", "shat today type 4 easy".
 */
export function log_bowel_movement(
  had: boolean,
  day?: string,
  look?: BowelLook,
  feel?: BowelFeel,
  color?: BowelColor
): string {
  // Strict: only calendar today — past is immutable history, future invalid
  const today = todayKey();
  const requested =
    day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : today;
  if (requested !== today) {
    return result(
      "log_bowel_movement",
      requested < today
        ? `Can't change bowel for ${requested} — past days are locked data. Only today (${today}) can be logged.`
        : `Can't log bowel for ${requested} — only today (${today}) is writable.`,
      { day: requested, blocked: true, today }
    );
  }
  const iso = today;
  const log = upsertBowelDay(
    iso,
    {
      had,
      ...(had && look != null ? { look } : {}),
      ...(had && feel ? { feel } : {}),
      ...(had && color ? { color } : {}),
    },
    "mel"
  );
  notify({ domain: "bowel", day: iso });
  if (!had) {
    return result("log_bowel_movement", `Logged bowel No for today.`, {
      day: iso,
      had: false,
      stats: bowelStats(30),
    });
  }
  const q = bowelQualityLabel(bowelQuality(log));
  const bits = [
    log.look != null ? `Type ${log.look}` : null,
    log.feel || null,
    log.color && log.color !== "brown" ? log.color : null,
  ].filter(Boolean);
  return result(
    "log_bowel_movement",
    `Logged bowel Yes for today${bits.length ? ` · ${bits.join(" · ")}` : ""} · ${q}. Saved to your bowel history.`,
    { day: iso, ...log, quality: bowelQuality(log), stats: bowelStats(30) }
  );
}

export function get_bowel_today(day?: string): string {
  const iso = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : todayKey();
  const log = loadBowelDetailMap()[iso];
  const stats = bowelStats(30);
  const when = iso === todayKey() ? "today" : iso;
  if (!log || (log.had !== true && log.had !== false)) {
    return result(
      "get_bowel_today",
      `Bowel not logged for ${when}. Last 30d: went ${stats.went} days` +
        (stats.avgType != null ? `, avg Type ${stats.avgType}` : "") +
        `. Say “I pooped type 4” or “no BM today”.`,
      { day: iso, had: null, stats }
    );
  }
  if (log.had === false) {
    return result("get_bowel_today", `Bowel is No for ${when}.`, {
      day: iso,
      had: false,
      stats,
    });
  }
  const q = bowelQualityLabel(bowelQuality(log));
  const bits = [
    log.look != null ? `Type ${log.look}` : null,
    log.feel || null,
    log.color && log.color !== "brown" ? log.color : null,
  ].filter(Boolean);
  return result(
    "get_bowel_today",
    `Bowel Yes for ${when}${bits.length ? ` · ${bits.join(" · ")}` : ""} · ${q}. 30d: ${stats.went} days` +
      (stats.avgType != null ? `, avg Type ${stats.avgType}` : "") +
      ".",
    { day: iso, ...log, quality: bowelQuality(log), stats }
  );
}

export function log_all_supplements(): string {
  const done = Object.fromEntries(DAILY_SUPPLEMENTS.map((item) => [item.id, true]));
  localStorage.setItem(`dr-melani-supplements-done:${todayKey()}`, JSON.stringify(done));
  notify({ domain: "supplements", day: todayKey() });
  return result("log_all_supplements", "Logged all supplements for today.", done);
}

export function set_goal(key: string, value: string | number): string {
  const goals = applyGoalCommand(`goal ${key} ${value}`);
  if (!goals) return failure("set_goal", `I could not set the ${key} goal.`);
  notify({ domain: "goals" });
  return result("set_goal", `Saved the ${key} goal as ${value}.`, goals);
}

export function pin_fact(fact: string): string {
  const summary = applyPinCommand(`pin ${fact}`);
  return summary ? result("pin", summary, loadPins()) : failure("pin", "Nothing was pinned.");
}

export function unpin_fact(fact: string): string {
  const summary = applyPinCommand(`unpin ${fact}`);
  return summary ? result("unpin", summary, loadPins()) : failure("unpin", "Nothing was unpinned.");
}

export function list_pins(): string {
  const pins = loadPins();
  return result("list_pins", pins.length ? `You have ${pins.length} pinned facts.` : "No pins saved.", pins);
}

export function life_log(text: string): string {
  const entry = appendLifeLog(text);
  notify({ domain: "lifeLog", day: entry.day });
  return result("life_log", "Logged to your life record.", entry);
}

export function search_logs(query: string): string {
  const hits = searchLifeLog(query, 12);
  return result("search_logs", hits.length ? `Found ${hits.length} matching logs.` : `No logs match ${query}.`, hits);
}

export function create_workspace_page(
  title?: string,
  parent?: string,
  currentPageId?: string,
  asAgent = false,
  content?: string
): string {
  let parentRef: MelPageReference | null = null;
  if (parent && !/^(?:root|top(?: level)?|private)$/i.test(parent.trim())) {
    parentRef = pageReference(parent, currentPageId);
  }
  return workspaceTool("create_workspace_page", {
    kind: "create-page",
    title: title?.trim() || undefined,
    parent: parentRef,
    asAgent,
    content,
  });
}

export function open_workspace_page(target: string, currentPageId?: string): string {
  return workspaceTool("open_workspace_page", {
    kind: "open-page",
    target: pageReference(target, currentPageId),
  });
}

export function list_workspace_pages(): string {
  return workspaceTool("list_workspace_pages", { kind: "list-pages" });
}

export function rename_workspace_page(
  target: string | undefined,
  title: string,
  currentPageId?: string
): string {
  return workspaceTool("rename_workspace_page", {
    kind: "rename-page",
    target: pageReference(target, currentPageId),
    title,
  });
}

export function trash_workspace_page(target?: string, currentPageId?: string): string {
  return workspaceTool("trash_workspace_page", {
    kind: "trash-page",
    target: pageReference(target, currentPageId),
  });
}

export function restore_workspace_page(target: string): string {
  return workspaceTool("restore_workspace_page", {
    kind: "restore-page",
    target: pageReference(target),
  });
}

export function duplicate_workspace_page(target?: string, currentPageId?: string): string {
  return workspaceTool("duplicate_workspace_page", {
    kind: "duplicate-page",
    target: pageReference(target, currentPageId),
  });
}

export function move_workspace_page(
  target: string | undefined,
  destination: string,
  position: "inside" | "before" | "after",
  currentPageId?: string
): string {
  return workspaceTool("move_workspace_page", {
    kind: "move-page",
    target: pageReference(target, currentPageId),
    destination: pageReference(destination),
    position,
  });
}

/**
 * Put a page at the TOP of a sidebar section (parent cleared).
 * This is how Mel un-nests Bookshelf from under Work back into Learn.
 */
export function make_section_root(
  target: string | undefined,
  section: "health" | "learn" | "work",
  currentPageId?: string
): string {
  return workspaceTool("make_section_root", {
    kind: "make-section-root",
    target: pageReference(target, currentPageId),
    section,
  });
}

export function write_workspace_page(
  target: string | undefined,
  content: string,
  mode: "append" | "replace",
  currentPageId?: string,
  blockType?: "paragraph" | "heading1" | "heading2" | "heading3" | "bullet" | "numbered" | "todo" | "quote" | "callout"
): string {
  return workspaceTool("write_workspace_page", {
    kind: "write-page",
    target: pageReference(target, currentPageId),
    content,
    mode,
    blockType,
  });
}

export function clear_workspace_page(target?: string, currentPageId?: string): string {
  return workspaceTool("clear_workspace_page", {
    kind: "clear-page",
    target: pageReference(target, currentPageId),
  });
}

export function favorite_workspace_page(
  target: string | undefined,
  favorite: boolean,
  currentPageId?: string
): string {
  return workspaceTool("favorite_workspace_page", {
    kind: "favorite-page",
    target: pageReference(target, currentPageId),
    favorite,
  });
}

export function undo_workspace_action(): string {
  return workspaceTool("undo_workspace_action", { kind: "undo-workspace" });
}

export function collapse_sidebar_sections(): string {
  return sidebarTool("collapse_sidebar_sections", { kind: "collapse-all" });
}

export function set_sidebar_section(target: string, open: boolean): string {
  return sidebarTool("set_sidebar_section", {
    kind: "set-section",
    target,
    collapsed: !open,
  });
}

export function open_page_hint(page: string): string {
  const found = PAGE_ALIASES.find((entry) => entry.pattern.test(page)) || PAGE_ALIASES.find((entry) => entry.pageId === page);
  if (!found) return failure("open_page_hint", `I could not find a page matching ${page}.`);
  return result("open_page_hint", `${found.title} is at ?page=${found.pageId}.`, { ...found, pattern: undefined, href: `?page=${found.pageId}` });
}

export function find_books(query: string): string {
  const matches = loadBooks()
    .map((book) => ({ book, score: bookMatchScore(book, query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.book.title.localeCompare(b.book.title))
    .slice(0, 5)
    .map(({ book }) => ({
      id: book.id,
      title: book.title,
      author: book.author,
      progress: Math.max(book.readerProgress || 0, book.localReaderProgress || 0, book.appleProgress || 0),
      canReadHere: Boolean(book.readerUrl),
    }));
  return result("find_books", matches.length ? `Found ${matches.length} matching books.` : `No book matches ${query}.`, matches);
}

export function open_book(query: string): string {
  const matches = parseToolResult(find_books(query));
  const rows = Array.isArray(matches.data) ? matches.data as Array<{ id: string }> : [];
  const matchId = rows[0]?.id;
  const book = loadBooks().find((entry) => entry.id === matchId);
  if (!book) return failure("open_book", `I could not find ${query} in your Bookshelf.`);

  const request = requestBookOpen(book);
  window.dispatchEvent(new CustomEvent(MEL_NAVIGATE_EVENT, { detail: { pageId: "pg-library" } }));
  const progress = Math.max(book.readerProgress || 0, book.localReaderProgress || 0, book.appleProgress || 0);
  const percent = Math.round(progress * 100);
  const place = request.startCfi ? (percent > 0 ? ` at ${percent}%` : " at your saved place") : " from the beginning";
  const summary = book.readerUrl
    ? `Opening ${book.title}${place}.`
    : `Opened ${book.title} in Bookshelf. Its readable file is not available inside Wonder yet.`;
  return result("open_book", summary, {
    id: book.id,
    title: book.title,
    author: book.author,
    progress,
    resumed: Boolean(request.startCfi),
    destination: book.readerUrl ? "reader" : "book details",
  });
}

export function find_book_source(query: string): string {
  const cleaned = query.trim();
  if (!cleaned) return failure("find_book_source", "Tell me which book to find.");
  requestBookDiscovery(cleaned);
  window.dispatchEvent(new CustomEvent(MEL_NAVIGATE_EVENT, { detail: { pageId: "pg-library" } }));
  return result(
    "find_book_source",
    `Searching legal book catalogs for ${cleaned}. I opened the results in Bookshelf.`,
    { query: cleaned, destination: "pg-library" }
  );
}

/** Compact letters only — for typo-tolerant page match (skncare ≈ skincare). */
function compactAlpha(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function editDistanceShort(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 4) return 99;
  const prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  const cur = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

/**
 * Always transport Melani to a real Wonder page.
 * Uses aliases first (AM skincare → pg-am-skin), then fuzzy title match for typos,
 * then workspace open. App seeds missing system pages so setActivePage never no-ops.
 */
export function navigate_page(page: string): string {
  const cleaned = (page || "")
    .trim()
    .replace(/^(?:the\s+)?page\s+/i, "")
    .replace(/\s+page$/i, "")
    .replace(/^["'`]+|["'`.,!?]+$/g, "")
    .trim();

  // 1) Known product surfaces (hygiene, fitness, etc.) — do not depend on fuzzy workspace titles
  const alias =
    PAGE_ALIASES.find((entry) => entry.pattern.test(cleaned)) ||
    PAGE_ALIASES.find((entry) => entry.pageId === cleaned);
  if (alias) {
    window.dispatchEvent(
      new CustomEvent(MEL_NAVIGATE_EVENT, { detail: { pageId: alias.pageId } })
    );
    return result("navigate_page", `Opened ${alias.title}.`, {
      pageId: alias.pageId,
      title: alias.title,
      href: `?page=${alias.pageId}`,
    });
  }

  // 1b) Typo rescue: "opn am skncare" / "meels" / "gymn" → closest alias title
  const needle = compactAlpha(cleaned);
  if (needle.length >= 3) {
    let best: { pageId: string; title: string; score: number } | null = null;
    for (const entry of PAGE_ALIASES) {
      const titleC = compactAlpha(entry.title);
      const idC = compactAlpha(entry.pageId);
      let score = 99;
      if (titleC.includes(needle) || needle.includes(titleC)) score = 0;
      else if (idC.includes(needle) || needle.includes(idC)) score = 1;
      else score = Math.min(editDistanceShort(needle, titleC), editDistanceShort(needle, idC));
      // "amskncare" vs "amskincare" distance ~2
      if (score <= 3 && (!best || score < best.score)) {
        best = { pageId: entry.pageId, title: entry.title, score };
      }
    }
    // Prefer AM/PM skin when "skin" mess is present without am/pm
    if (best && /skin|skn|care/i.test(cleaned) && !/pm|night|even/i.test(cleaned)) {
      const am = PAGE_ALIASES.find((e) => e.pageId === "pg-am-skin");
      if (am && (best.pageId === "pg-hygiene" || best.pageId === "pg-pm-skin" || /skin/i.test(best.title))) {
        // if they said am/morning-ish or bare skin typo, prefer AM
        if (/am|a\.?m|morn|skn|skin/i.test(cleaned) && !/pm|p\.?m|night/i.test(cleaned)) {
          best = { pageId: "pg-am-skin", title: "AM skincare", score: 0 };
        }
      }
    }
    if (best) {
      window.dispatchEvent(
        new CustomEvent(MEL_NAVIGATE_EVENT, { detail: { pageId: best.pageId } })
      );
      return result("navigate_page", `Opened ${best.title}.`, {
        pageId: best.pageId,
        title: best.title,
        href: `?page=${best.pageId}`,
        fuzzy: true,
      });
    }
  }

  // 2) Workspace page by title
  const workspace = parseToolResult(open_workspace_page(cleaned));
  if (workspace.ok) return JSON.stringify(workspace);

  // 3) Fail clearly — never claim "Opened" without navigating
  return failure(
    "navigate_page",
    `I could not open “${cleaned}”. Try: AM skincare, PM skincare, Hygiene, Meals, Sleep, Gym, Habits, Bookshelf.`
  );
}

export function run_task_command(text: string): string {
  const summary = applyTaskCommand(text);
  return summary ? result("task", summary) : failure("task", "I could not turn that into a task safely.");
}

export function run_shopping_command(text: string): string {
  const summary = applyShoppingCommand(text);
  return summary ? result("shopping", summary) : failure("shopping", "I could not apply that shopping update safely.");
}

export function run_care_command(text: string): string {
  const outcome = runCareCommandLocal(text);
  return outcome
    ? JSON.stringify(outcome)
    : failure("care_no_match", "That was not an appointment administration request.");
}

/** Match habit by name (fuzzy) for Mel check commands. */
function findHabitsByQuery(query: string) {
  const q = (query || "").trim().toLowerCase();
  const habits = loadHabits().filter((h) => !h.archivedAt);
  if (!q || /^(all|every|everything|boxes?)$/i.test(q)) return habits;
  return habits.filter((h) => {
    const n = h.name.toLowerCase();
    return n.includes(q) || q.includes(n) || n.split(/\s+/).some((w) => w.length > 2 && q.includes(w));
  });
}

/** Check every habit box today (or a named habit). Mel: "check every box". */
export function check_habits(query = "all", day?: string): string {
  const iso = day || todayKey();
  const targets = findHabitsByQuery(query);
  if (!targets.length) {
    return failure("check_habits", `No habit matches "${query}".`);
  }
  let map = loadChecks();
  const ids = targets.map((h) => h.id);
  map = setAllChecks(map, iso, ids, true);
  saveChecks(map);
  notify({ domain: "habits", day: iso });
  const names = targets.map((h) => h.name).join(", ");
  return result(
    "check_habits",
    targets.length === 1
      ? `Checked ${names} for ${iso}.`
      : `Checked all ${targets.length} habit boxes for ${iso}: ${names}.`,
    { day: iso, count: targets.length, names: targets.map((h) => h.name) }
  );
}

/** Uncheck habit boxes (all or by name). */
export function uncheck_habits(query = "all", day?: string): string {
  const iso = day || todayKey();
  const targets = findHabitsByQuery(query);
  if (!targets.length) {
    return failure("uncheck_habits", `No habit matches "${query}".`);
  }
  let map = loadChecks();
  const ids = targets.map((h) => h.id);
  map = setAllChecks(map, iso, ids, false);
  saveChecks(map);
  notify({ domain: "habits", day: iso });
  return result(
    "uncheck_habits",
    targets.length === 1
      ? `Unchecked ${targets[0].name} for ${iso}.`
      : `Unchecked ${targets.length} habit boxes for ${iso}.`,
    { day: iso, count: targets.length }
  );
}

/** Toggle one habit on/off for today. */
export function set_habit_check(name: string, checked: boolean, day?: string): string {
  const iso = day || todayKey();
  const hits = findHabitsByQuery(name);
  if (!hits.length) return failure("set_habit_check", `No habit matches "${name}".`);
  let map = loadChecks();
  for (const h of hits) {
    map = setCheck(map, iso, h.id, checked);
  }
  saveChecks(map);
  notify({ domain: "habits", day: iso });
  return result(
    "set_habit_check",
    `${checked ? "Checked" : "Unchecked"} ${hits.map((h) => h.name).join(", ")} for ${iso}.`,
    { day: iso, checked, names: hits.map((h) => h.name) }
  );
}

export function list_habits_status(day?: string): string {
  const iso = day || todayKey();
  const habits = loadHabits().filter((h) => !h.archivedAt);
  const map = loadChecks();
  const rows = habits.map((h) => ({
    name: h.name,
    checked: isChecked(map, iso, h.id),
  }));
  const done = rows.filter((r) => r.checked).length;
  const lines = rows.map((r) => `${r.checked ? "✓" : "○"} ${r.name}`).join("\n");
  return result(
    "list_habits_status",
    `Habits ${iso}: ${done}/${rows.length} done.\n${lines}`,
    { day: iso, done, total: rows.length, rows }
  );
}

export function current_meat(): FoodOsMeat {
  return ensureTodayMeat().meat;
}

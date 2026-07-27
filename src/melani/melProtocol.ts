/**
 * Mel v2 structured envelope protocol.
 *
 * Design (from ops manual):
 * - LLM is a sequence predictor under constraints, not "common sense."
 * - Smarter Mel = tighter roles + strict JSON router + few-shots + client validation.
 * - App owns tools + CSS. LLM never emits HTML/CSS, only JSON or chat_response text.
 *
 * Envelope:
 *   { mode, action, fields, chat_response? }
 *
 * Client: parse → validate → execute trackers/workspace → show chat_response only.
 * Invalid / unknown keys → reject and re-ask (optional one correction pass for cloud).
 */

import {
  create_workspace_page,
  log_bowel_movement,
  log_food_nl,
  log_water,
  move_workspace_page,
  navigate_page,
  parseToolResult,
  set_water_liters,
  type MelToolResult,
} from "./melTools";
import { offlineTradingBrief } from "./melTrading";

// ── Schema ──────────────────────────────────────────────────────────────────

export const MEL_MODES = ["LIFE", "BUILD", "MARKETS", "IDEAS", "CHAT"] as const;
export type MelMode = (typeof MEL_MODES)[number];

export const MEL_ACTIONS = [
  "LOG",
  "CREATE_PAGE",
  "MOVE_PAGE",
  "OPEN_PAGE",
  "QUERY_MARKET",
  "BRAINSTORM",
  "RESPOND",
] as const;
export type MelAction = (typeof MEL_ACTIONS)[number];

/**
 * Flat fields only — reject anything outside this set.
 * Extend here + add 1–2 few-shots when you need new life signals (sleep, HRV, …).
 */
export const MEL_KNOWN_FIELD_KEYS = [
  "water_liters_today", // absolute day total in liters
  "water_add_liters", // delta drink in liters (I drank 1L)
  "food_event",
  "bowel_movement",
  "page_name",
  "page_title",
  "parent_page",
  "target_page",
  "market_query",
  "idea_topic",
  "note",
] as const;
export type MelFieldKey = (typeof MEL_KNOWN_FIELD_KEYS)[number];

export type MelFields = {
  water_liters_today?: number | null;
  water_add_liters?: number | null;
  food_event?: string | null;
  /** true / false / Bristol 1–7 / null */
  bowel_movement?: boolean | number | string | null;
  page_name?: string | null;
  page_title?: string | null;
  parent_page?: string | null;
  target_page?: string | null;
  market_query?: string | null;
  idea_topic?: string | null;
  note?: string | null;
};

export type MelEnvelope = {
  mode: MelMode;
  action: MelAction;
  fields: MelFields;
  chat_response?: string;
};

export type MelParseOk = { ok: true; envelope: MelEnvelope };
export type MelParseErr = { ok: false; error: string; reask: string };
export type MelParseResult = MelParseOk | MelParseErr;

export type MelExecuteResult = {
  toolResults: MelToolResult[];
  chat_response: string;
  envelope: MelEnvelope;
  rejected: boolean;
};

// ── Action ↔ mode matrix ────────────────────────────────────────────────────

const ACTIONS_BY_MODE: Record<MelMode, readonly MelAction[]> = {
  LIFE: ["LOG", "RESPOND"],
  BUILD: ["OPEN_PAGE", "CREATE_PAGE", "MOVE_PAGE", "RESPOND"],
  MARKETS: ["QUERY_MARKET", "RESPOND"],
  IDEAS: ["BRAINSTORM", "RESPOND"],
  CHAT: ["RESPOND"],
};

const KNOWN_KEY_SET = new Set<string>(MEL_KNOWN_FIELD_KEYS);
const MODE_SET = new Set<string>(MEL_MODES);
const ACTION_SET = new Set<string>(MEL_ACTIONS);

// ── Parse ───────────────────────────────────────────────────────────────────

function reaskMessage(detail: string): string {
  return `Could not run that (${detail}). Say it plain: food, water, open page, markets, or ideas.`;
}

/** Pull a single top-level JSON object from model text (fences ok). */
export function extractJsonObject(raw: string): string | null {
  const text = (raw || "").trim();
  if (!text) return null;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const inner = fenced[1].trim();
    if (inner.startsWith("{") && inner.endsWith("}")) return inner;
  }

  if (text.startsWith("{") && text.endsWith("}")) return text;

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const slice = text.slice(start, end + 1);
    try {
      JSON.parse(slice);
      return slice;
    } catch {
      return null;
    }
  }
  return null;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function readOptionalNumber(
  raw: Record<string, unknown>,
  key: string
): MelParseResult | number | null | undefined {
  if (!(key in raw)) return undefined;
  const v = raw[key];
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return {
    ok: false,
    error: `bad_${key}`,
    reask: reaskMessage(`${key} must be a number or null`),
  };
}

function readOptionalString(
  raw: Record<string, unknown>,
  key: string
): MelParseResult | string | null | undefined {
  if (!(key in raw)) return undefined;
  const v = raw[key];
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  return {
    ok: false,
    error: `bad_${key}`,
    reask: reaskMessage(`${key} must be a string or null`),
  };
}

function normalizeFields(raw: unknown): MelParseResult | MelFields {
  if (raw == null) return {};
  if (!isPlainObject(raw)) {
    return {
      ok: false,
      error: "fields_not_object",
      reask: reaskMessage("fields must be a flat object"),
    };
  }

  const unknown = Object.keys(raw).filter((k) => !KNOWN_KEY_SET.has(k));
  if (unknown.length) {
    return {
      ok: false,
      error: `unknown_fields:${unknown.join(",")}`,
      reask: reaskMessage(`unknown field "${unknown[0]}"`),
    };
  }

  const fields: MelFields = {};

  const waterToday = readOptionalNumber(raw, "water_liters_today");
  if (waterToday && typeof waterToday === "object" && "ok" in waterToday) return waterToday;
  if (waterToday !== undefined) fields.water_liters_today = waterToday as number | null;

  const waterAdd = readOptionalNumber(raw, "water_add_liters");
  if (waterAdd && typeof waterAdd === "object" && "ok" in waterAdd) return waterAdd;
  if (waterAdd !== undefined) fields.water_add_liters = waterAdd as number | null;

  const food = readOptionalString(raw, "food_event");
  if (food && typeof food === "object" && "ok" in food) return food;
  if (food !== undefined) fields.food_event = food as string | null;

  if ("bowel_movement" in raw) {
    const v = raw.bowel_movement;
    if (v === null || v === undefined) fields.bowel_movement = null;
    else if (typeof v === "boolean" || typeof v === "number" || typeof v === "string") {
      fields.bowel_movement = v;
    } else {
      return {
        ok: false,
        error: "bad_bowel_movement",
        reask: reaskMessage("bowel_movement must be bool, 1–7, or null"),
      };
    }
  }

  for (const key of [
    "page_name",
    "page_title",
    "parent_page",
    "target_page",
    "market_query",
    "idea_topic",
    "note",
  ] as const) {
    const s = readOptionalString(raw, key);
    if (s && typeof s === "object" && "ok" in s) return s;
    if (s !== undefined) fields[key] = s as string | null;
  }

  return fields;
}

/**
 * Parse model/user text into a Mel envelope. Fail closed on unknown keys.
 */
export function parseMelEnvelope(raw: string): MelParseResult {
  const jsonText = extractJsonObject(raw);
  if (!jsonText) {
    return {
      ok: false,
      error: "not_json",
      reask: reaskMessage("expected a single JSON object"),
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return {
      ok: false,
      error: "json_parse",
      reask: reaskMessage("JSON parse failed"),
    };
  }

  if (!isPlainObject(parsed)) {
    return {
      ok: false,
      error: "not_object",
      reask: reaskMessage("envelope must be an object"),
    };
  }

  const rootAllowed = new Set(["mode", "action", "fields", "chat_response"]);
  const badRoot = Object.keys(parsed).filter((k) => !rootAllowed.has(k));
  if (badRoot.length) {
    return {
      ok: false,
      error: `unknown_root:${badRoot.join(",")}`,
      reask: reaskMessage(`unknown keys: ${badRoot.join(", ")}`),
    };
  }

  const mode = String(parsed.mode || "").toUpperCase();
  const action = String(parsed.action || "").toUpperCase();

  if (!MODE_SET.has(mode)) {
    return {
      ok: false,
      error: "bad_mode",
      reask: reaskMessage(`mode must be one of ${MEL_MODES.join(", ")}`),
    };
  }
  if (!ACTION_SET.has(action)) {
    return {
      ok: false,
      error: "bad_action",
      reask: reaskMessage(`action must be one of ${MEL_ACTIONS.join(", ")}`),
    };
  }

  const modeT = mode as MelMode;
  const actionT = action as MelAction;
  if (!ACTIONS_BY_MODE[modeT].includes(actionT)) {
    return {
      ok: false,
      error: "action_mode_mismatch",
      reask: reaskMessage(`${actionT} is not valid under ${modeT}`),
    };
  }

  const fieldsResult = normalizeFields(parsed.fields ?? {});
  if ("ok" in fieldsResult && fieldsResult.ok === false) {
    return fieldsResult;
  }
  const fields = fieldsResult as MelFields;

  let chat_response: string | undefined;
  if ("chat_response" in parsed) {
    if (parsed.chat_response == null) chat_response = undefined;
    else if (typeof parsed.chat_response === "string") chat_response = parsed.chat_response;
    else {
      return {
        ok: false,
        error: "bad_chat_response",
        reask: reaskMessage("chat_response must be a string"),
      };
    }
  }

  return {
    ok: true,
    envelope: {
      mode: modeT,
      action: actionT,
      fields,
      ...(chat_response !== undefined ? { chat_response } : {}),
    },
  };
}

/** True when text looks like a Mel envelope (even if invalid). */
export function looksLikeMelEnvelope(raw: string): boolean {
  const t = (raw || "").trim();
  if (!t) return false;
  if (t.startsWith("{") && /"mode"\s*:/.test(t)) return true;
  if (/```(?:json)?/i.test(t) && /"mode"\s*:/.test(t)) return true;
  return false;
}

/**
 * UI safety: never show raw JSON to Melani.
 * If the string is an envelope, return chat_response only.
 */
export function displayHumanReply(raw: string): string {
  const t = (raw || "").trim();
  if (!t) return t;
  if (looksLikeMelEnvelope(t) || extractJsonObject(t)) {
    const parsed = parseMelEnvelope(t);
    if (parsed.ok) {
      return (
        (parsed.envelope.chat_response && parsed.envelope.chat_response.trim()) ||
        "Done."
      );
    }
    return parsed.reask;
  }
  return t;
}

/**
 * Correction user message for one cloud re-try (Step 4 of Mel v2).
 */
export function buildCorrectionPrompt(parse: MelParseErr, priorOutput: string): string {
  return [
    "Your previous output was invalid.",
    `Rules you broke: ${parse.error}.`,
    "Re-emit a single JSON object that follows the schema exactly, no extra text, no markdown fences.",
    "Root keys only: mode, action, fields, chat_response.",
    "fields may only use known keys: water_liters_today, water_add_liters, food_event, bowel_movement, page_name, page_title, parent_page, target_page, market_query, idea_topic, note.",
    "Prior invalid output (do not repeat the same mistake):",
    priorOutput.slice(0, 1200),
  ].join("\n");
}

// ── Execute ─────────────────────────────────────────────────────────────────

function pushTool(results: MelToolResult[], raw: string): void {
  results.push(parseToolResult(raw));
}

function applyBowel(fields: MelFields, results: MelToolResult[]): void {
  const bm = fields.bowel_movement;
  if (bm === null || bm === undefined) return;

  if (typeof bm === "boolean") {
    pushTool(results, log_bowel_movement(bm));
    return;
  }
  if (typeof bm === "number" && bm >= 1 && bm <= 7 && Number.isInteger(bm)) {
    pushTool(
      results,
      log_bowel_movement(true, undefined, bm as 1 | 2 | 3 | 4 | 5 | 6 | 7)
    );
    return;
  }
  if (typeof bm === "string") {
    const low = bm.trim().toLowerCase();
    if (/^(no|false|0|none|skip)$/.test(low)) {
      pushTool(results, log_bowel_movement(false));
      return;
    }
    if (/^(yes|true|y|1)$/.test(low)) {
      pushTool(results, log_bowel_movement(true));
      return;
    }
    const n = Number(low);
    if (Number.isInteger(n) && n >= 1 && n <= 7) {
      pushTool(
        results,
        log_bowel_movement(true, undefined, n as 1 | 2 | 3 | 4 | 5 | 6 | 7)
      );
      return;
    }
  }
  results.push({
    ok: false,
    tool: "log_bowel_movement",
    summary: "bowel_movement must be true, false, Bristol 1–7, or null.",
  });
}

/**
 * Run a validated envelope against local tools.
 * LIFE LOG → water / food / BM. BUILD OPEN_PAGE → navigate. etc.
 * App owns side effects; model only chose the envelope.
 */
export function executeMelEnvelope(
  envelope: MelEnvelope,
  opts?: { pageId?: string }
): MelExecuteResult {
  const results: MelToolResult[] = [];
  const { mode, action, fields } = envelope;
  const pageId = opts?.pageId;

  if (mode === "LIFE" && action === "LOG") {
    // Absolute total wins over add if both present
    if (
      fields.water_liters_today != null &&
      Number.isFinite(fields.water_liters_today)
    ) {
      pushTool(results, set_water_liters(fields.water_liters_today));
    } else if (
      fields.water_add_liters != null &&
      Number.isFinite(fields.water_add_liters) &&
      fields.water_add_liters > 0
    ) {
      pushTool(results, log_water(Math.round(fields.water_add_liters * 1000)));
    }
    if (fields.food_event && fields.food_event.trim()) {
      pushTool(results, log_food_nl(fields.food_event.trim()));
    }
    applyBowel(fields, results);
    if (
      fields.note &&
      fields.note.trim() &&
      !fields.food_event &&
      fields.water_liters_today == null &&
      fields.water_add_liters == null &&
      (fields.bowel_movement === null || fields.bowel_movement === undefined)
    ) {
      results.push({
        ok: true,
        tool: "life_log_note",
        summary: `Noted: ${fields.note.trim()}`,
        data: { note: fields.note.trim() },
      });
    }
  } else if (mode === "BUILD" && action === "OPEN_PAGE") {
    const name = (fields.page_name || fields.page_title || "").trim();
    if (!name) {
      results.push({
        ok: false,
        tool: "navigate_page",
        summary: "OPEN_PAGE needs fields.page_name.",
      });
    } else {
      pushTool(results, navigate_page(name));
    }
  } else if (mode === "BUILD" && action === "CREATE_PAGE") {
    const title = (fields.page_title || fields.page_name || "").trim();
    if (!title) {
      results.push({
        ok: false,
        tool: "create_workspace_page",
        summary: "CREATE_PAGE needs fields.page_title.",
      });
    } else {
      pushTool(
        results,
        create_workspace_page(
          title,
          fields.parent_page || undefined,
          pageId,
          true
        )
      );
    }
  } else if (mode === "BUILD" && action === "MOVE_PAGE") {
    const name = (fields.page_name || fields.page_title || "").trim();
    const parent = (fields.parent_page || fields.target_page || "").trim();
    if (!name || !parent) {
      results.push({
        ok: false,
        tool: "move_workspace_page",
        summary: "MOVE_PAGE needs page_name and parent_page.",
      });
    } else {
      pushTool(results, move_workspace_page(name, parent, "inside", pageId));
    }
  } else if (mode === "MARKETS" && action === "QUERY_MARKET") {
    const q = (fields.market_query || fields.note || "").trim() || "markets desk";
    const brief = offlineTradingBrief(q);
    results.push({
      ok: true,
      tool: "trading_knowledge",
      summary: brief,
      data: { query: q },
    });
  } else if (mode === "IDEAS" && action === "BRAINSTORM") {
    const topic = (fields.idea_topic || fields.note || "next move").trim();
    results.push({
      ok: true,
      tool: "brainstorm",
      summary: [
        `Idea lane: ${topic}.`,
        "Force: one wedge user, one painful job, one shippable slice this week.",
        "Skip vibe lists. Pick the sharpest angle and say what to build first.",
      ].join(" "),
      data: { topic },
    });
  } else if (action === "RESPOND") {
    // Pure chat — no tools
  }

  const fromTools =
    results.length === 0
      ? ""
      : results.length === 1
        ? results[0].summary
        : results.map((r) => r.summary).filter(Boolean).join(" ");

  const chat_response =
    (envelope.chat_response && envelope.chat_response.trim()) ||
    fromTools ||
    (action === "RESPOND"
      ? "Hey. Mel here. Food, markets, books, pages, or ideas, say it plain."
      : "Done.");

  return {
    toolResults: results,
    chat_response,
    envelope,
    rejected: false,
  };
}

/** Reject envelope used when parse fails. */
export function rejectEnvelope(parse: MelParseErr): MelExecuteResult {
  return {
    toolResults: [],
    chat_response: parse.reask,
    envelope: {
      mode: "CHAT",
      action: "RESPOND",
      fields: {},
      chat_response: parse.reask,
    },
    rejected: true,
  };
}

// ── NL → envelope (deterministic router; no LLM) ────────────────────────────
// Input-chaotic, output-strict: soft-normalize typos, still emit clean fields.

/**
 * Light typo fixes so offline routing matches ChatGPT-style mess.
 * Does NOT reject or require perfect English — only expands known typos.
 */
function softNormalizeMessy(text: string): string {
  let t = text.trim();
  // Common verb / page typos (word boundaries)
  const map: Array<[RegExp, string]> = [
    [/\bopn\b/gi, "open"],
    [/\bopne\b/gi, "open"],
    [/\bopem\b/gi, "open"],
    [/\bshwo\b/gi, "show"],
    [/\bgto\b/gi, "go to"],
    [/\bjus\b/gi, "just"],
    [/\bjst\b/gi, "just"],
    [/\beatn\b/gi, "eaten"],
    [/\beatin\b/gi, "eating"],
    [/\bdrnk\b/gi, "drank"],
    [/\bdrnks?\b/gi, "drank"],
    [/\bdrinkd\b/gi, "drank"],
    [/\bwatr\b/gi, "water"],
    [/\bwtr\b/gi, "water"],
    [/\blitres?\b/gi, "liters"],
    [/\bboild\b/gi, "boiled"],
    [/\bboild\b/gi, "boiled"],
    [/\begs\b/gi, "eggs"],
    [/\beggss\b/gi, "eggs"],
    [/\bchiken\b/gi, "chicken"],
    [/\brcie\b/gi, "rice"],
    [/\bskncare\b/gi, "skincare"],
    [/\bskincre\b/gi, "skincare"],
    [/\bskincrae\b/gi, "skincare"],
    [/\bskincaree\b/gi, "skincare"],
    [/\bmeels\b/gi, "meals"],
    [/\bmealz\b/gi, "meals"],
    [/\bgymn\b/gi, "gym"],
    [/\bhygene\b/gi, "hygiene"],
    [/\bhygine\b/gi, "hygiene"],
    [/\bbookself\b/gi, "bookshelf"],
    [/\bbokkshelf\b/gi, "bookshelf"],
  ];
  for (const [re, rep] of map) t = t.replace(re, rep);
  return t;
}

/** Clean food field for storage when user typed trash (display + macros search). */
function normalizeFoodField(raw: string): string {
  return softNormalizeMessy(raw)
    .replace(/\s+/g, " ")
    .trim();
}

function parseDrinkLiters(text: string): number | null {
  const m = text.match(
    /(?:drank|drink|drnk|logged?|add(?:ed)?)\s+(\d+(?:\.\d+)?)\s*(l|liters?|litres?|ml|milliliters?|millilitres?)\b/i
  );
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  return m[2].toLowerCase().startsWith("l") && !/^ml/i.test(m[2]) ? n : n / 1000;
}

function extractFoodChunk(text: string): string | null {
  // Lenient eat verbs + optional "just/jus" — multi-clause ok
  const m =
    text.match(
      /(?:^|[.!,;]\s*|\band\s+)(?:i\s+)?(?:just|jus|jst)?\s*(?:also\s+)?(?:ate|eat|eaten|eating|had|hav|log(?:ged)?)\s+(.+?)(?=\s+and\s+(?:i\s+)?(?:drank|drink|drnk|water|watr)|[.!]|$)/i
    ) ||
    text.match(
      /(?:for\s+)?(?:breakfast|lunch|dinner|snack)[:\s,]+(.+?)(?=[.!]|$)/i
    );
  if (!m?.[1]) return null;
  let food = m[1]
    .trim()
    .replace(/\s+and\s+(?:i\s+)?(?:drank|drink|drnk).*$/i, "")
    .replace(/\s+water.*$/i, "")
    .trim();
  if (!food) return null;
  if (/^(?:my\s+)?(?:breakfast|usual|page|habit|sleep|gym|bookshelf)$/i.test(food)) {
    return null;
  }
  if (/\b(open|opn|create|move|page|habit|skincare|skncare|shower)\b/i.test(food)) {
    return null;
  }
  food = normalizeFoodField(food.replace(/\s+today[.!]*$/i, "").trim());
  return food || null;
}

/** Map messy open targets to canonical page names when confident. */
function resolvePageNameHint(raw: string): string {
  const soft = softNormalizeMessy(raw).replace(/^my\s+/i, "").trim();
  const c = soft.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  if (/\b(am|a\s*m|morning)\b/.test(c) && /skin|care/.test(c)) return "AM skincare";
  if (/\b(pm|p\s*m|night|evening)\b/.test(c) && /skin|care/.test(c)) return "PM skincare";
  if (/^skin\s*care$|^skincare$/.test(c.trim())) return "AM skincare";
  if (/\bmeals?\b|\bfood\b|\bmacros?\b/.test(c)) return "Meals";
  if (/\bgym\b|\bworkout\b/.test(c)) return "Gym";
  if (/\bsleep\b/.test(c)) return "Sleep";
  if (/\bhabits?\b/.test(c)) return "Habits";
  if (/\bbookshelf\b|\blibrary\b|\bbooks?\b/.test(c)) return "Bookshelf";
  if (/\bhygiene\b|\bshower\b/.test(c)) return "Hygiene";
  if (/\bmarkets?\b|\bstocks?\b|\bworld\s*monitor\b/.test(c)) return "Finances";
  return soft;
}

/**
 * Map high-confidence natural language into envelopes without the LLM.
 * Tolerates typos/slang; fields are cleaned. Null → fall through to planAndExecute / cloud.
 */
export function intentToMelEnvelope(text: string): MelEnvelope | null {
  const raw = (text || "").trim();
  if (!raw) return null;
  if (looksLikeMelEnvelope(raw)) return null;

  const q = softNormalizeMessy(raw);

  // Greetings → CHAT (yo, hey, bro, sup)
  if (
    /^(hi|hey|yo+|hello|sup|what'?s up|whatsup|wassup|howdy|bro|bruh)([.!?\s].*)?$/i.test(q) &&
    !/\b(open|opn|ate|eat|water|page|create)\b/i.test(q)
  ) {
    return {
      mode: "CHAT",
      action: "RESPOND",
      fields: {},
      chat_response: "Hey. Mel here. Food, markets, books, pages, or ideas, say it plain.",
    };
  }

  // "bro open meals" — strip filler, still BUILD
  const stripped = q
    .replace(/^(?:please\s+)?(?:bro|bruh|hey|yo|ok|okay|can you|could you|pls|plz)\s+/i, "")
    .trim();

  // Explicit brainstorm
  if (
    /\b(brainstorm|help me think|give me ideas|idea for|ideas for)\b/i.test(q) ||
    /^(?:think of|come up with)\s+/i.test(q)
  ) {
    const topic =
      q
        .replace(/^(?:please\s+)?(?:can you\s+)?/i, "")
        .replace(/\b(help me think of|brainstorm|give me ideas about|ideas? for)\b/i, "")
        .trim() || "next ship";
    return {
      mode: "IDEAS",
      action: "BRAINSTORM",
      fields: { idea_topic: topic },
      chat_response: `Brainstorming: ${topic}. One wedge, one user, one ship this week.`,
    };
  }

  // Create page under parent
  const createPage = stripped.match(
    /^(?:create|make|add|new)\s+(?:a\s+)?(?:new\s+)?page\s+(?:called|named|titled)?\s*["']?(.+?)["']?(?:\s+under\s+(.+))?[.!]?$/i
  );
  if (createPage?.[1]) {
    const page_title = createPage[1].trim().replace(/^["']|["']$/g, "");
    const parent_page = createPage[2]?.trim() || null;
    return {
      mode: "BUILD",
      action: "CREATE_PAGE",
      fields: {
        page_title,
        parent_page,
      },
      chat_response: parent_page
        ? `Creating “${page_title}” under ${parent_page}.`
        : `Creating page “${page_title}”.`,
    };
  }

  // Open page — tolerate opn/open/go/show + skincare typos
  const bareSkin = stripped.match(
    /^(?:my\s+)?(?:am|pm|morning|night|evening)\s*(?:skin\s*care|skincare|skncare)?$/i
  );
  const open = stripped.match(
    /^(?:go|open|show|take me|navigate|bring me|pull up|launch)(?:\s+me)?(?:\s+to|\s+up)?\s+(.+)$/i
  );
  // Bare typo skin: "am skncare" after soft normalize becomes skincare
  const bareSkin2 = stripped.match(/^(?:my\s+)?(?:am|a\.?m\.?|morning)\s+skincare$/i);
  if (bareSkin || bareSkin2) {
    const page_name = resolvePageNameHint(bareSkin?.[0] || bareSkin2?.[0] || stripped);
    return {
      mode: "BUILD",
      action: "OPEN_PAGE",
      fields: { page_name },
      chat_response: `Opened ${page_name}.`,
    };
  }
  if (open?.[1]) {
    const page_name = resolvePageNameHint(open[1].trim());
    if (
      page_name &&
      !/\bbrief\b/i.test(page_name) &&
      !/\b(book|reading|chapter|epub)\b/i.test(page_name) &&
      !/\b(research|look up)\b/i.test(page_name)
    ) {
      return {
        mode: "BUILD",
        action: "OPEN_PAGE",
        fields: { page_name },
        chat_response: `Opened ${page_name}.`,
      };
    }
  }

  // LIFE: water + food (multi-clause or single) — use soft-normalized text
  const addL = parseDrinkLiters(q);
  const food_event = extractFoodChunk(q);
  const absWater = q.match(
    /^(?:set\s+)?(?:my\s+)?water(?:\s+(?:is|to|today|total))?\s*(?:to\s+)?(\d+(?:\.\d+)?)\s*(?:l|liters?|litres?)(?:\s+today)?[.!]?$/i
  );

  if (absWater?.[1] || addL != null || food_event) {
    const water_liters_today = absWater?.[1] ? Number(absWater[1]) : null;
    const water_add_liters =
      water_liters_today == null && addL != null ? addL : null;
    return {
      mode: "LIFE",
      action: "LOG",
      fields: {
        water_liters_today,
        water_add_liters,
        food_event: food_event,
        bowel_movement: null,
      },
      chat_response:
        food_event && (water_liters_today != null || water_add_liters != null)
          ? `Logged ${food_event} and updated water.`
          : food_event
            ? `Logged: ${food_event}.`
            : water_liters_today != null
              ? `Water set to ${water_liters_today} L today.`
              : `Logged ${water_add_liters} L water.`,
    };
  }

  return null;
}

/** Serialize envelope for model/system docs. */
export function formatMelEnvelope(env: MelEnvelope): string {
  return JSON.stringify(
    {
      mode: env.mode,
      action: env.action,
      fields: env.fields,
      ...(env.chat_response != null ? { chat_response: env.chat_response } : {}),
    },
    null,
    0
  );
}

/**
 * Compact Mel v2 operations manual for cloud + local model context.
 * Three jobs. Five modes. Strict JSON. No HTML/CSS. No tool invention.
 */
export const MEL_PROTOCOL_SYSTEM_RULE = `
You are Mel, Melani's daily operations agent inside Wonder.

YOUR JOB (only three things):
1) Log life data into structured fields (LIFE).
2) Call workspace actions via BUILD fields (open/create/move pages).
3) Brainstorm only when she explicitly asks (IDEAS). Also: MARKETS queries, and CHAT for social lines.

Never explain your internal logic unless she says "explain".
Never invent new tools or fields.
Never emit HTML, CSS, or markdown fences.
App tools may already have run in ACTION CONTEXT: treat those as final facts; do not re-LOG the same event.

INPUT IS MESSY (critical — like ChatGPT):
- Typos, slang, missing punctuation are normal. Infer intended meaning.
- If you can map to a mode/action with reasonable confidence, do it. Clean up fields in the JSON.
- Only unroutable if you truly cannot infer intent. Never reject for bad spelling.
- Output is strict JSON. Input is chaotic.

INPUT TYPES:
- LIFE: water, food, bowel (health/status logs).
- BUILD: open/create/move pages, workspace actions.
- MARKETS: finance / markets questions.
- IDEAS: brainstorming or thinking work (only when asked).
- CHAT: greetings, short social lines.

RESPONSE FORMAT (mandatory):
Always respond with a single JSON object and nothing else.
Keys (only these at root): mode, action, fields, chat_response.

mode ∈ {LIFE, BUILD, MARKETS, IDEAS, CHAT}
action depends on mode:
  LIFE → LOG | RESPOND
  BUILD → OPEN_PAGE | CREATE_PAGE | MOVE_PAGE | RESPOND
  MARKETS → QUERY_MARKET | RESPOND
  IDEAS → BRAINSTORM | RESPOND
  CHAT → RESPOND

fields is a flat object with ONLY known keys (unknown keys are rejected by the client):
  water_liters_today (number|null) — absolute liters for today
  water_add_liters (number|null) — amount she just drank (e.g. 1 for "drank 1L")
  food_event (string|null) — free-form meal text (normalize spelling here)
  bowel_movement (bool|1-7|null)
  page_name, page_title, parent_page, target_page, market_query, idea_topic, note

The Wonder client parses this JSON and executes trackers/navigation. Prefer null over guessing.
chat_response is short human text only (one or two sentences). No em dashes.

EXAMPLES (clean + messy still routes):

User: open my AM skincare
{"mode":"BUILD","action":"OPEN_PAGE","fields":{"page_name":"AM skincare"},"chat_response":"Opened AM skincare."}

User: opn am skncare
{"mode":"BUILD","action":"OPEN_PAGE","fields":{"page_name":"AM skincare"},"chat_response":"Opened AM skincare."}

User: i just ate 2 boiled eggs
{"mode":"LIFE","action":"LOG","fields":{"water_liters_today":null,"water_add_liters":null,"food_event":"2 boiled eggs","bowel_movement":null},"chat_response":"Logged your meal: 2 boiled eggs."}

User: i jus ate 2 boild eggs
{"mode":"LIFE","action":"LOG","fields":{"water_liters_today":null,"water_add_liters":null,"food_event":"2 boiled eggs","bowel_movement":null},"chat_response":"Logged: 2 boiled eggs."}

User: I drank 1L and ate beef
{"mode":"LIFE","action":"LOG","fields":{"water_liters_today":null,"water_add_liters":1,"food_event":"beef","bowel_movement":null},"chat_response":"Logged beef and 1 L water."}

User: drnk 500ml watr
{"mode":"LIFE","action":"LOG","fields":{"water_liters_today":null,"water_add_liters":0.5,"food_event":null,"bowel_movement":null},"chat_response":"Logged 0.5 L water."}

User: bro open meals
{"mode":"BUILD","action":"OPEN_PAGE","fields":{"page_name":"Meals"},"chat_response":"Opened Meals."}

User: yo
{"mode":"CHAT","action":"RESPOND","fields":{},"chat_response":"Hey. Mel here. Food, markets, books, pages, or ideas, say it plain."}
`.trim();

import type { MelToolResult } from "./melTools";

export type MelActionReceipt = {
  id: string;
  command: string;
  at: string;
  pageId?: string;
  pageTitle?: string;
  actions: Array<Pick<MelToolResult, "ok" | "tool" | "summary">>;
};

export type MelExecutionContext = {
  pageId?: string;
  pageTitle?: string;
};

const RECEIPTS_KEY = "wonder-mel-action-receipts-v1";
const MAX_RECEIPTS = 40;

const ACTION_START = [
  "create", "make", "open", "show", "list", "go", "navigate", "move", "put", "place", "nest",
  "rename", "delete", "trash", "remove", "restore", "duplicate", "copy", "write", "append",
  "replace", "clear", "favorite", "unfavorite", "close", "collapse", "expand", "log", "undo",
  "drink", "drank", "ate", "had", "slept", "took", "pin", "unpin", "set", "goal", "add",
  "start", "finish", "complete", "reopen", "mark", "check", "uncheck", "tick", "find", "search", "research", "wear", "lock", "choose",
  "brain fog", "bowel", "poop", "shit", "status", "brief", "food", "weather", "outfit", "read", "resume", "continue",
  "spent", "paid", "recategorize", "reclassify", "log", "deploy", "reinvest", "transfer",
].join("|");

const ACTION_LOOKAHEAD = `(?:please\\s+)?(?:i\\s+)?(?:${ACTION_START})\\b`;

/**
 * Split only at boundaries followed by another command verb. This preserves
 * normal prose and shopping lists such as "eggs, berries and avocados".
 */
export function splitMelInstructions(input: string): string[] {
  let value = input.trim();
  if (!value) return [];

  value = value
    .replace(new RegExp(`\\b(?:and\\s+then|then|after\\s+that|next)\\b(?=\\s+${ACTION_LOOKAHEAD})`, "gi"), "\n")
    .replace(new RegExp(`[,;]\\s*(?:and\\s+)?(?=${ACTION_LOOKAHEAD})`, "gi"), "\n")
    .replace(new RegExp(`\\s+and\\s+(?=${ACTION_LOOKAHEAD})`, "gi"), "\n");

  return value
    .split(/\n+/)
    .map((part) => part.trim().replace(/^(?:and|then)\s+/i, ""))
    .filter(Boolean)
    .slice(0, 10);
}

export function contextFromToolResults(
  current: MelExecutionContext,
  results: MelToolResult[]
): MelExecutionContext {
  let next = { ...current };
  for (const item of results) {
    if (!item.ok || !item.data || typeof item.data !== "object") continue;
    const data = item.data as { pageId?: unknown; pageTitle?: unknown };
    if (typeof data.pageId === "string" && data.pageId) next.pageId = data.pageId;
    if (typeof data.pageTitle === "string" && data.pageTitle) next.pageTitle = data.pageTitle;
  }
  return next;
}

export function loadMelReceipts(): MelActionReceipt[] {
  try {
    const value = JSON.parse(localStorage.getItem(RECEIPTS_KEY) || "[]") as MelActionReceipt[];
    return Array.isArray(value) ? value.filter((entry) => entry && Array.isArray(entry.actions)) : [];
  } catch {
    return [];
  }
}

export function recordMelReceipt(
  command: string,
  results: MelToolResult[],
  context: MelExecutionContext = {}
): MelActionReceipt | null {
  const actions = results
    .filter((item) => item.tool !== "help" && item.tool !== "action_history" && item.tool !== "unresolved")
    .map(({ ok, tool, summary }) => ({ ok, tool, summary }));
  if (!actions.length) return null;

  const receipt: MelActionReceipt = {
    id: `mel-receipt-${Date.now().toString(36)}`,
    command: command.trim(),
    at: new Date().toISOString(),
    pageId: context.pageId,
    pageTitle: context.pageTitle,
    actions,
  };
  try {
    localStorage.setItem(RECEIPTS_KEY, JSON.stringify([...loadMelReceipts(), receipt].slice(-MAX_RECEIPTS)));
  } catch {
    /* Actions still succeed when receipt storage is unavailable. */
  }
  return receipt;
}

export function formatMelReceipts(limit = 1): { summary: string; receipts: MelActionReceipt[] } {
  const receipts = loadMelReceipts().slice(-Math.max(1, limit)).reverse();
  if (!receipts.length) return { summary: "No Mel actions have been recorded yet.", receipts: [] };

  const lines = receipts.flatMap((receipt, index) => {
    const when = new Date(receipt.at).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    const header = limit > 1 ? `${index + 1}. ${when}, ${receipt.command}` : `Last action, ${when}`;
    return [header, ...receipt.actions.map((action) => `${action.ok ? "Done" : "Failed"}: ${action.summary}`)];
  });
  return { summary: lines.join("\n"), receipts };
}

export function toolActionDomain(tool: string): string | null {
  if (tool.startsWith("wardrobe_")) return "wardrobe";
  if (tool === "log_water" || tool === "undo_water" || tool === "set_water_liters") return "water";
  if (
    tool === "log_usual_meal" ||
    tool === "undo_usual_meal" ||
    tool === "log_food_nl"
  ) {
    return "breakfast";
  }
  if (tool === "log_meat_eaten" || tool === "undo_meat_eaten" || tool === "lock_meat") return "meat";
  if (
    tool === "check_habits"
    || tool === "uncheck_habits"
    || tool === "set_habit_check"
    || tool === "list_habits_status"
  ) return "habits";
  if (tool === "task") return "tasks";
  if (tool === "shopping") return "shopping";
  if (
    /^(?:create|open|rename|trash|restore|duplicate|move|make_section|write|clear|favorite|undo)_workspace_page$/.test(tool)
    || tool === "make_section_root"
    || tool === "undo_workspace_action"
    || tool === "collapse_sidebar_sections"
    || tool === "set_sidebar_section"
  ) return "workspace";
  if (tool === "log_bowel_movement" || tool === "get_bowel_today") return "bowel";
  if (
    tool === "bookshelf_knowledge" ||
    tool === "open_book" ||
    tool === "find_books" ||
    tool === "search_highlights" ||
    tool === "evidence_pack"
  ) {
    return "bookshelf";
  }
  if (tool === "econ_knowledge" || tool === "trading_knowledge") return "markets";
  if (
    tool === "weekly_intelligence_digest" ||
    tool === "last_intelligence_digest" ||
    tool === "operating_brain_brief" ||
    tool === "list_due_decisions" ||
    tool === "log_decision" ||
    tool === "list_decisions"
  ) {
    return "intelligence";
  }
  if (/^(?:log_|set_goal|pin|unpin|life_log)/.test(tool)) return "health";
  return null;
}

export function isActionHistoryRequest(text: string): boolean {
  return /^(?:what did you do|what changed|show (?:me )?(?:the )?(?:last )?actions?|last action|action history|receipts?)\??$/i.test(text.trim());
}

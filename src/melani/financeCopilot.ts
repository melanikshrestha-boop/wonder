/**
 * Finance copilot — a grounded query engine over your real ledger.
 * It reads the actual transaction rows (like a copilot that understands
 * your spreadsheet) and answers with numbers, citing what it looked at.
 * Falls back to the ranked advisory brain for judgement questions.
 * Not financial advice.
 */

import {
  money,
  moneyCents,
  monthKey,
  type FinanceState,
  type FinanceTx,
} from "./financeStore";
import { isTransferLike } from "./financeTransfers";
import type { SmartBrief } from "./financeIntelligence";
import { answerFromBrief } from "./financeIntelligence";
import type { CreditReport } from "./financeCredit";
import type { SubscriptionScan } from "./subscriptions";

export type CopilotContext = {
  state: FinanceState;
  brief: SmartBrief;
  subs: SubscriptionScan;
  worth: number;
  cash: number;
  debt: number;
  income: number;
  expense: number;
  cashFlow: number;
  rate: number | null;
  credit: CreditReport;
  ym: string;
};

export type CopilotAnswer = {
  text: string;
  /** What data the copilot read to answer — shown like Cursor's context. */
  sources: string[];
  /** Optional small table to render under the answer. */
  data?: { label: string; value: string }[];
};

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
const MONTH_ABBR = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS[m - 1][0].toUpperCase()}${MONTHS[m - 1].slice(1)} ${y}`;
}

/** Resolve a month reference in the question to an actual ym present in data. */
function resolveMonth(q: string, txs: FinanceTx[], nowYm: string): { ym: string; label: string } | null {
  const present = Array.from(new Set(txs.map((t) => t.date.slice(0, 7)))).sort();
  if (/\bthis month\b/.test(q)) return { ym: nowYm, label: monthLabel(nowYm) };
  if (/\blast month\b/.test(q)) {
    const [y, m] = nowYm.split("-").map(Number);
    const d = new Date(y, m - 2, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return { ym, label: monthLabel(ym) };
  }
  // Explicit YYYY-MM
  const iso = q.match(/\b(20\d{2})-(0[1-9]|1[0-2])\b/);
  if (iso) return { ym: `${iso[1]}-${iso[2]}`, label: monthLabel(`${iso[1]}-${iso[2]}`) };
  // Month name → latest matching ym in the data
  for (let i = 0; i < MONTHS.length; i++) {
    const re = new RegExp(`\\b(${MONTHS[i]}|${MONTH_ABBR[i]})\\b`);
    if (re.test(q)) {
      const mm = String(i + 1).padStart(2, "0");
      const matches = present.filter((ym) => ym.endsWith(`-${mm}`));
      const ym = matches[matches.length - 1] || `${nowYm.slice(0, 4)}-${mm}`;
      return { ym, label: monthLabel(ym) };
    }
  }
  return null;
}

/** Find a ledger category the question is talking about. */
function resolveCategory(q: string, txs: FinanceTx[]): string | null {
  const cats = Array.from(new Set(txs.map((t) => t.category).filter(Boolean)));
  // Direct substring match against real categories
  for (const c of cats) {
    const first = c.toLowerCase().split(/[\s/]+/)[0];
    if (first.length > 2 && q.includes(first)) return c;
  }
  // Common aliases → whatever category actually holds them
  const alias: Record<string, string[]> = {
    food: ["food", "grocery", "groceries", "eating", "restaurant", "dining"],
    transport: ["transport", "uber", "lyft", "gas", "transit", "car"],
    shopping: ["shopping", "amazon", "clothes"],
    rent: ["rent", "housing", "mortgage"],
    entertainment: ["entertainment", "fun", "streaming"],
    health: ["health", "medical", "pharmacy", "doctor"],
    utilities: ["utilities", "utility", "electric", "internet", "phone"],
  };
  for (const [, words] of Object.entries(alias)) {
    if (words.some((w) => q.includes(w))) {
      const hit = cats.find((c) => words.some((w) => c.toLowerCase().includes(w)));
      if (hit) return hit;
    }
  }
  return null;
}

/** Find a merchant the question names, matched against real ledger merchants. */
function resolveMerchant(q: string, txs: FinanceTx[]): string | null {
  // Build a set of distinct merchant "brands" (first token of each name)
  const brands = new Map<string, string>(); // lowercase token → display
  for (const t of txs) {
    const raw = (t.merchant || t.note || "").trim();
    if (!raw) continue;
    const token = raw.replace(/[^a-zA-Z0-9 ]/g, " ").trim().split(/\s+/)[0];
    if (token && token.length >= 3) {
      const key = token.toLowerCase();
      if (!brands.has(key)) brands.set(key, token);
    }
  }
  // Longest brand token that appears in the question wins (avoids "the"/"pay")
  let best: string | null = null;
  for (const [key, display] of brands) {
    if (new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(q)) {
      if (!best || key.length > best.length) best = display;
    }
  }
  return best;
}

function sumExpense(txs: FinanceTx[], opts: { ym?: string; category?: string }): { total: number; count: number } {
  let total = 0;
  let count = 0;
  for (const t of txs) {
    if (t.kind !== "expense") continue;
    if (isTransferLike(t)) continue;
    if (opts.ym && !t.date.startsWith(opts.ym)) continue;
    if (opts.category && t.category !== opts.category) continue;
    total += t.amount;
    count += 1;
  }
  return { total: Math.round(total * 100) / 100, count };
}

function categoryBreakdown(txs: FinanceTx[], ym?: string): { name: string; value: number }[] {
  const map = new Map<string, number>();
  for (const t of txs) {
    if (t.kind !== "expense" || isTransferLike(t)) continue;
    if (ym && !t.date.startsWith(ym)) continue;
    map.set(t.category || "Uncategorized", (map.get(t.category || "Uncategorized") || 0) + t.amount);
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
    .sort((a, b) => b.value - a.value);
}

function merchantBreakdown(txs: FinanceTx[], ym?: string): { name: string; value: number; count: number }[] {
  const map = new Map<string, { value: number; count: number }>();
  for (const t of txs) {
    if (t.kind !== "expense" || isTransferLike(t)) continue;
    if (ym && !t.date.startsWith(ym)) continue;
    const m = (t.merchant || t.note || "Unknown").trim() || "Unknown";
    const cur = map.get(m) || { value: 0, count: 0 };
    cur.value += t.amount;
    cur.count += 1;
    map.set(m, cur);
  }
  return [...map.entries()]
    .map(([name, v]) => ({ name, value: Math.round(v.value * 100) / 100, count: v.count }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Answer a question against the live ledger.
 * Direct data queries first (spend/income/merchants/subscriptions/counts),
 * then the advisory brain for judgement (afford/credit/runway/reinvest).
 */
export function answerCopilot(question: string, ctx: CopilotContext): CopilotAnswer {
  const q = question.toLowerCase().trim();
  const txs = ctx.state.txs;

  if (!q) {
    return { text: "Ask me anything about your ledger — spend by category, a month total, your subscriptions, top merchants, or whether you can afford something.", sources: [] };
  }
  if (!txs.length) {
    return {
      text: "Your ledger is empty. Import a bank CSV and I'll answer every question with real numbers from your rows.",
      sources: [],
    };
  }

  const month = resolveMonth(q, txs, ctx.ym);
  const category = resolveCategory(q, txs);
  const scope = month ? month.ym : undefined;
  const scopeLabel = month ? month.label : "all time";
  const merchant = resolveMerchant(q, txs);

  // ── A specific merchant ("how much at Amazon / on Uber") ─────────
  if (merchant && /\b(spend|spent|spending|cost|paid|much|at|on)\b/.test(q)) {
    let total = 0;
    let count = 0;
    let last = "";
    for (const t of txs) {
      if (t.kind !== "expense" || isTransferLike(t)) continue;
      if (scope && !t.date.startsWith(scope)) continue;
      if (((t.merchant || t.note || "").toLowerCase()).includes(merchant.toLowerCase())) {
        total += t.amount;
        count += 1;
        if (t.date > last) last = t.date;
      }
    }
    if (count > 0) {
      return {
        text: `You spent ${money(total)} at ${merchant} ${month ? `in ${scopeLabel}` : "across your ledger"} — ${count} charge${count === 1 ? "" : "s"}${last ? `, last on ${last}` : ""}.`,
        sources: [`${merchant}`, month ? scopeLabel : "all transactions", `${count} rows`],
      };
    }
  }

  // ── Month-over-month comparison ──────────────────────────────────
  if (/\b(compare|vs|versus|more than|less than|than last month|month over month)\b/.test(q)) {
    const thisM = ctx.ym;
    const [y, m] = thisM.split("-").map(Number);
    const prevD = new Date(y, m - 2, 1);
    const prevM = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, "0")}`;
    const a = sumExpense(txs, { ym: thisM });
    const b = sumExpense(txs, { ym: prevM });
    const diff = a.total - b.total;
    const dir = diff > 0 ? "more" : "less";
    return {
      text: `${monthLabel(thisM)}: ${money(a.total)} vs ${monthLabel(prevM)}: ${money(b.total)}. You spent ${money(Math.abs(diff))} ${dir} this month${b.total > 0 ? ` (${diff >= 0 ? "+" : "−"}${Math.abs((diff / b.total) * 100).toFixed(0)}%)` : ""}.`,
      sources: [monthLabel(thisM), monthLabel(prevM)],
      data: [
        { label: monthLabel(thisM), value: money(a.total) },
        { label: monthLabel(prevM), value: money(b.total) },
      ],
    };
  }

  // ── Average monthly spend ────────────────────────────────────────
  if (/\b(average|avg|typical|per month|a month|each month|monthly spend)\b/.test(q) && /\b(spend|spent|spending|cost)\b/.test(q)) {
    const months = new Map<string, number>();
    for (const t of txs) {
      if (t.kind !== "expense" || isTransferLike(t)) continue;
      const ym = t.date.slice(0, 7);
      months.set(ym, (months.get(ym) || 0) + t.amount);
    }
    const vals = [...months.values()];
    const avg = vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : 0;
    return {
      text: `Your average spend is ${money(avg)}/month across ${vals.length} month${vals.length === 1 ? "" : "s"} of data.`,
      sources: [`${vals.length} months`, "all transactions"],
    };
  }

  // ── Biggest single transaction ───────────────────────────────────
  if (/\b(biggest|largest|most expensive|highest)\b.*\b(purchase|transaction|charge|expense|buy|payment)\b/.test(q) ||
      /\bbiggest (purchase|transaction|charge|expense)\b/.test(q)) {
    let top: FinanceTx | null = null;
    for (const t of txs) {
      if (t.kind !== "expense" || isTransferLike(t)) continue;
      if (scope && !t.date.startsWith(scope)) continue;
      if (!top || t.amount > top.amount) top = t;
    }
    if (top) {
      return {
        text: `Your biggest single charge ${month ? `in ${scopeLabel}` : ""} was ${money(top.amount)} to ${top.merchant || top.note || "Unknown"} on ${top.date} (${top.category}).`,
        sources: [month ? scopeLabel : "all transactions", "single largest expense"],
      };
    }
  }

  // ── Subscriptions ────────────────────────────────────────────────
  if (/\b(subscription|subscriptions|recurring|paying for|memberships?)\b/.test(q)) {
    if (/\b(biggest|most expensive|largest|top)\b/.test(q) && ctx.subs.subs[0]) {
      const s = ctx.subs.subs[0];
      return {
        text: `Your biggest subscription is ${s.merchant} at ${money(s.monthlyCost)}/mo (${money(s.yearlyCost)}/yr), charged ${s.cadence}.`,
        sources: [`${ctx.subs.count} subscriptions detected`],
        data: ctx.subs.subs.slice(0, 5).map((x) => ({ label: x.merchant, value: `${money(x.monthlyCost)}/mo` })),
      };
    }
    return {
      text: `I found ${ctx.subs.count} recurring subscriptions costing ${money(ctx.subs.monthlyTotal)}/mo — that's ${money(ctx.subs.yearlyTotal)}/yr. Your biggest is ${ctx.subs.subs[0]?.merchant || "—"}.`,
      sources: [`${ctx.subs.count} subscriptions`, "recurring-charge detection"],
      data: ctx.subs.subs.slice(0, 6).map((x) => ({ label: x.merchant, value: `${money(x.monthlyCost)}/mo` })),
    };
  }

  // ── Spend on a category ──────────────────────────────────────────
  if (category && /\b(spend|spent|spending|cost|paid|much)\b/.test(q)) {
    const { total, count } = sumExpense(txs, { ym: scope, category });
    return {
      text: `You spent ${money(total)} on ${category} ${month ? `in ${scopeLabel}` : "across all data"} — ${count} charge${count === 1 ? "" : "s"}.`,
      sources: [`${category} category`, month ? scopeLabel : "all transactions", `${count} rows`],
    };
  }

  // ── Total spend / where money went ───────────────────────────────
  if (/\b(where did (my|the) money go|breakdown|by category|what did i spend)\b/.test(q) ||
      (/\b(spend|spent|spending)\b/.test(q) && !category && !/merchant|store|place/.test(q))) {
    const { total, count } = sumExpense(txs, { ym: scope });
    const cats = categoryBreakdown(txs, scope).slice(0, 6);
    return {
      text: `Total spend ${month ? `in ${scopeLabel}` : "across your ledger"}: ${money(total)} over ${count} charges. Top category: ${cats[0]?.name || "—"} at ${money(cats[0]?.value || 0)}.`,
      sources: [month ? scopeLabel : "all transactions", `${count} rows`, "category rollup"],
      data: cats.map((c) => ({ label: c.name, value: money(c.value) })),
    };
  }

  // ── Income / earnings ────────────────────────────────────────────
  if (/\b(income|make|made|earn|earned|paid in|deposits?)\b/.test(q)) {
    let total = 0;
    let count = 0;
    for (const t of txs) {
      if (t.kind !== "income" || isTransferLike(t)) continue;
      if (scope && !t.date.startsWith(scope)) continue;
      total += t.amount;
      count += 1;
    }
    return {
      text: `Income ${month ? `in ${scopeLabel}` : "across your ledger"}: ${money(total)} over ${count} deposit${count === 1 ? "" : "s"}.`,
      sources: [month ? scopeLabel : "all transactions", `${count} income rows`],
    };
  }

  // ── Top merchants ────────────────────────────────────────────────
  if (/\b(merchant|store|vendor|where.*spend|biggest|top|most)\b/.test(q) && !/subscription/.test(q)) {
    const merchants = merchantBreakdown(txs, scope).slice(0, 6);
    if (merchants.length) {
      return {
        text: `Top merchant ${month ? `in ${scopeLabel}` : "across your ledger"}: ${merchants[0].name} at ${money(merchants[0].value)} over ${merchants[0].count} charges.`,
        sources: [month ? scopeLabel : "all transactions", "merchant rollup"],
        data: merchants.map((m) => ({ label: m.name, value: `${money(m.value)} · ${m.count}×` })),
      };
    }
  }

  // ── Counts ───────────────────────────────────────────────────────
  if (/\bhow many\b.*\b(transactions?|rows|charges|entries)\b/.test(q) || /\b(transaction count|number of)\b/.test(q)) {
    const scoped = scope ? txs.filter((t) => t.date.startsWith(scope)) : txs;
    return {
      text: `${scoped.length} transactions ${month ? `in ${scopeLabel}` : "in your ledger"} (${scoped.filter((t) => t.kind === "expense").length} out, ${scoped.filter((t) => t.kind === "income").length} in).`,
      sources: [month ? scopeLabel : "all transactions"],
    };
  }

  // ── Net worth / cash / debt ──────────────────────────────────────
  if (/\bnet worth\b/.test(q)) {
    return { text: `Your net worth is ${money(ctx.worth)} — cash ${money(ctx.cash)} minus what you owe ${money(ctx.debt)}.`, sources: ["accounts"] };
  }
  if (/\b(how much (cash|money)|balance|in the bank)\b/.test(q)) {
    return { text: `Cash on hand: ${money(ctx.cash)}. You owe ${money(ctx.debt)} on credit. Net ${money(ctx.worth)}.`, sources: ["accounts"] };
  }
  if (/\b(debt|owe|owed|balance on card)\b/.test(q)) {
    return { text: `You owe ${money(ctx.debt)} across credit accounts. Utilization ${ctx.credit.utilization == null ? "unknown (add card limits)" : `${Math.round(ctx.credit.utilization * 100)}%`}.`, sources: ["accounts", "credit"] };
  }

  // ── Judgement questions → advisory brain, with a data source note ─
  const advisory = answerFromBrief(question, ctx.brief, {
    worth: ctx.worth,
    cash: ctx.cash,
    debt: ctx.debt,
    income: ctx.income,
    expense: ctx.expense,
    cashFlow: ctx.cashFlow,
    rate: ctx.rate,
    credit: ctx.credit,
    txCount: txs.length,
  });
  return {
    text: advisory,
    sources: [`${txs.length} transactions`, "budget + credit + reinvest model"],
  };
}

/** Suggested prompts, grounded in what the ledger actually contains. */
export function copilotSuggestions(ctx: CopilotContext): string[] {
  const out: string[] = [];
  const cats = categoryBreakdown(ctx.state.txs).slice(0, 1);
  if (cats[0]) out.push(`How much did I spend on ${cats[0].name.split(/[\s/]/)[0]}?`);
  if (ctx.subs.count) out.push("What subscriptions am I paying for?");
  out.push("Where did my money go this month?");
  out.push("Can I afford a $1,000 purchase?");
  out.push("How is my credit?");
  return out.slice(0, 5);
}

export const COPILOT_ONLINE = () =>
  typeof window !== "undefined" && /* backend AI optional */ false;

export { monthKey, moneyCents };

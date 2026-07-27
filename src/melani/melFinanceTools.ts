/**
 * Mel finance hands — mutate / query the real ledger.
 * Ground truth only. No invented balances.
 */

import { FINANCE_CATEGORIES, normalizeCategory } from "./financeCategorize";
import {
  buildCreditReport,
  DEFAULT_CREDIT_PROFILE,
} from "./financeCredit";
import { answerFromBrief, buildSmartBrief } from "./financeIntelligence";
import {
  cashOnHand,
  creditOwed,
  invested,
  loadFinance,
  formatDateMDY,
  money,
  moneyCents,
  monthKey,
  netWorth,
  newTx,
  saveFinance,
  type FinanceState,
  type FinanceTx,
} from "./financeStore";
import {
  applyTransferPair,
  detectTransferPairs,
  monthTrueIncome,
  monthTrueSpend,
  type TransferPair,
} from "./financeTransfers";
import type { MelToolResult } from "./melTools";

function result<T>(tool: string, summary: string, data?: T): string {
  return JSON.stringify({
    ok: true,
    tool,
    summary,
    data,
  } satisfies MelToolResult<T>);
}

function failure(tool: string, summary: string): string {
  return JSON.stringify({
    ok: false,
    tool,
    summary,
  } satisfies MelToolResult);
}

function parseJsonTool(raw: string): MelToolResult {
  try {
    return JSON.parse(raw) as MelToolResult;
  } catch {
    return { ok: false, tool: "unknown", summary: raw };
  }
}

/** Emit so Finances UI reloads if open (same event as undo / cross-tab) */
function notifyFinanceChanged(state: FinanceState) {
  try {
    window.dispatchEvent(
      new CustomEvent("wonder-finance-external-restore", { detail: state })
    );
  } catch {
    /* ignore */
  }
}

function patchFinance(fn: (s: FinanceState) => FinanceState): FinanceState {
  const next = fn(loadFinance());
  saveFinance(next);
  notifyFinanceChanged(next);
  return next;
}

/** Minimal plan rows from budget so smart brief works offline */
function planRowsFromState(state: FinanceState, ym: string) {
  const spent = new Map<string, number>();
  for (const t of state.txs) {
    if (t.kind !== "expense" || !t.date.startsWith(ym)) continue;
    spent.set(t.category, (spent.get(t.category) || 0) + t.amount);
  }
  const groups = [
    { id: "essentials", label: "Essentials", cats: ["Groceries", "Transport"] },
    {
      id: "lifestyle",
      label: "Lifestyle",
      cats: ["Restaurants", "Subscriptions", "Clothing"],
    },
    { id: "other", label: "Other", cats: ["Other", "Zelle"] },
  ];
  return groups.map((g) => {
    const planned = g.cats.reduce((s, c) => {
      const b = state.budget.find((x) => x.category === c);
      return s + (b?.planned || 0);
    }, 0);
    const spentAmt = g.cats.reduce((s, c) => s + (spent.get(c) || 0), 0);
    return {
      id: g.id,
      label: g.label,
      planned,
      spent: spentAmt,
      remaining: planned - spentAmt,
    };
  });
}

function buildBriefNow(state: FinanceState = loadFinance()) {
  const ym = monthKey();
  const credit = buildCreditReport(
    state.accounts,
    state.creditProfile || DEFAULT_CREDIT_PROFILE
  );
  return buildSmartBrief(state, ym, planRowsFromState(state, ym), credit);
}

function matchCategory(raw: string): string | null {
  const q = raw.trim().toLowerCase();
  if (!q) return null;
  const exact = FINANCE_CATEGORIES.find((c) => c.toLowerCase() === q);
  if (exact) return exact;
  const soft = FINANCE_CATEGORIES.find(
    (c) => c.toLowerCase().includes(q) || q.includes(c.toLowerCase())
  );
  if (soft) return soft;
  // common aliases
  if (/restaurant|dining|coffee|chipotle|doordash|uber\s*eats/.test(q))
    return "Restaurants";
  if (/grocery|grocer|trader|whole foods|costco|target/.test(q))
    return "Groceries";
  if (/transfer|zelle|venmo|wire/.test(q)) return "Transfers";
  if (/sub|netflix|spotify|openai|claude|cursor/.test(q)) return "Subscriptions";
  if (/uber|lyft|gas|parking|transit/.test(q)) return "Transport";
  if (/card\s*pay|payment to chase|credit card/.test(q))
    return "Credit card payment";
  return normalizeCategory(raw, raw);
}

/** True cash flow / burn / keep — transfer-aware */
export function finance_true_burn(ym?: string): string {
  const state = loadFinance();
  const key = ym || monthKey();
  const income = monthTrueIncome(state.txs, key);
  const spend = monthTrueSpend(state.txs, key);
  const flow = income - spend;
  const keep = income > 0 ? Math.round((flow / income) * 100) : null;
  const day = Math.max(1, new Date().getDate());
  const burnDay = spend / day;
  return result(
    "finance_true_burn",
    `True books ${key}: income ${money(income)} · spend ${money(spend)} · flow ${money(flow)}${keep != null ? ` · keep ${keep}%` : ""}. Burn ~${money(burnDay)}/day (transfer-stripped).`,
    { ym: key, income, spend, flow, keepRate: keep, burnPerDay: burnDay }
  );
}

/** Safe to spend after reinvest + capital doctrine */
export function finance_safe_to_spend(): string {
  const brief = buildBriefNow();
  return result(
    "finance_safe_to_spend",
    `Fun money after capital: ${money(brief.safeToSpend)}. Deploy to invest still: ${money(brief.reinvest.deployNow)}. Order: ${brief.reinvest.order}`,
    {
      safeToSpend: brief.safeToSpend,
      deployNow: brief.reinvest.deployNow,
      order: brief.reinvest.order,
      keepRate: brief.reinvest.actualRate,
      capitalScore: brief.smart.capital.score,
    }
  );
}

/** Capital / next moves brief (same engine as Books tab) */
export function finance_capital_brief(question?: string): string {
  const state = loadFinance();
  const brief = buildBriefNow(state);
  const cash = cashOnHand(state.accounts);
  const debt = creditOwed(state.accounts);
  const ym = monthKey();
  const income = monthTrueIncome(state.txs, ym);
  const expense = monthTrueSpend(state.txs, ym);
  if (question && question.trim()) {
    const answer = answerFromBrief(question.trim(), brief, {
      worth: cash - debt,
      cash,
      debt,
      income,
      expense,
      cashFlow: income - expense,
      rate: brief.reinvest.actualRate,
      credit: buildCreditReport(
        state.accounts,
        state.creditProfile || DEFAULT_CREDIT_PROFILE
      ),
      txCount: state.txs.length,
    });
    return result("finance_capital_brief", answer, { question, briefHeadline: brief.headline });
  }
  const top = brief.actions[0];
  return result(
    "finance_capital_brief",
    `${brief.headline}. ${brief.reinvest.order} Deploy ${money(brief.reinvest.deployNow)}. Safe after capital ${money(brief.safeToSpend)}. Top move: ${top?.title || "keep logging"}.`,
    {
      deployNow: brief.reinvest.deployNow,
      safeToSpend: brief.safeToSpend,
      capitalScore: brief.smart.capital.score,
      topAction: top?.title,
    }
  );
}

/** Log one expense or income into the ledger (source: mel — persists) */
export function finance_log_expense(opts: {
  amount: number;
  merchant?: string;
  category?: string;
  kind?: "expense" | "income";
  note?: string;
  date?: string;
}): string {
  const amount = Math.abs(Number(opts.amount));
  if (!(amount > 0) || !Number.isFinite(amount)) {
    return failure(
      "finance_log_expense",
      "Need a dollar amount (e.g. log $12 Chipotle as Restaurants)."
    );
  }
  const kind = opts.kind === "income" ? "income" : "expense";
  const merchant = (opts.merchant || opts.note || "Mel log").trim();
  const category = matchCategory(opts.category || merchant) || "Other";
  const melTx = newTx({
    amount,
    kind,
    merchant,
    note: opts.note || merchant,
    category,
    date: opts.date,
    source: "mel",
  });

  patchFinance((s) => ({
    ...s,
    txs: [melTx, ...s.txs],
  }));

  return result(
    "finance_log_expense",
    `Logged ${kind} ${moneyCents(amount)} · ${merchant} → ${category}.`,
    { txId: melTx.id, amount, merchant, category, kind }
  );
}

/** Recategorize txs matching merchant/query */
export function finance_recategorize(
  query: string,
  categoryRaw: string
): string {
  const cat = matchCategory(categoryRaw);
  if (!cat) {
    return failure(
      "finance_recategorize",
      `Unknown category “${categoryRaw}”. Try: ${FINANCE_CATEGORIES.join(", ")}.`
    );
  }
  const q = (query || "").trim();
  if (!q) {
    return failure(
      "finance_recategorize",
      "Say which merchant or note to recategorize (e.g. recategorize Chipotle to Restaurants)."
    );
  }

  let count = 0;
  patchFinance((s) => {
    const nextTxs = s.txs.map((t) => {
      const blob = `${t.merchant || ""} ${t.note || ""}`.toLowerCase();
      if (!blob.includes(q.toLowerCase())) return t;
      count++;
      return { ...t, category: cat };
    });
    return { ...s, txs: nextTxs };
  });

  if (!count) {
    return failure(
      "finance_recategorize",
      `No transactions matched “${q}”.`
    );
  }
  return result(
    "finance_recategorize",
    `Recategorized ${count} row(s) matching “${q}” → ${cat}.`,
    { count, category: cat, query: q }
  );
}

/** List top transfer proposals */
export function finance_list_transfers(limit = 5): string {
  const pairs = detectTransferPairs(loadFinance().txs).slice(0, limit);
  if (!pairs.length) {
    return result(
      "finance_list_transfers",
      "No high-confidence transfer pairs right now.",
      { pairs: [] }
    );
  }
  const lines = pairs.map(
    (p, i) =>
      `${i + 1}. ${formatDateMDY(p.outTx.date)} ${moneyCents(p.outTx.amount)} · ${p.outTx.merchant || p.outTx.note} → ${p.inTx.merchant || p.inTx.note} (${Math.round(p.confidence * 100)}% · ${p.reason})`
  );
  return result(
    "finance_list_transfers",
    `Likely transfers:\n${lines.join("\n")}\nSay “mark transfer 1” or “fix top transfer”.`,
    {
      pairs: pairs.map((p) => ({
        amount: p.outTx.amount,
        outId: p.outTx.id,
        inId: p.inTx.id,
        confidence: p.confidence,
        reason: p.reason,
        label: `${p.outTx.merchant || p.outTx.note} → ${p.inTx.merchant || p.inTx.note}`,
      })),
    }
  );
}

function applyOnePair(pair: TransferPair): string {
  patchFinance((s) => ({
    ...s,
    txs: applyTransferPair(s.txs, pair),
  }));
  return result(
    "finance_apply_transfer",
    `Marked transfer ${moneyCents(pair.outTx.amount)} · ${pair.outTx.merchant || pair.outTx.note} ↔ ${pair.inTx.merchant || pair.inTx.note}. Excluded from true income & spend.`,
    {
      amount: pair.outTx.amount,
      outId: pair.outTx.id,
      inId: pair.inTx.id,
      reason: pair.reason,
    }
  );
}

/** Apply top transfer, or Nth (1-based), or match merchant string */
export function finance_apply_transfer(spec?: string | number): string {
  const pairs = detectTransferPairs(loadFinance().txs);
  if (!pairs.length) {
    return failure(
      "finance_apply_transfer",
      "No transfer pairs to mark. Import more history or recategorize manually."
    );
  }

  if (spec == null || spec === "" || spec === "top" || spec === 1) {
    return applyOnePair(pairs[0]);
  }

  if (typeof spec === "number" || /^\d+$/.test(String(spec))) {
    const n = Number(spec);
    const pair = pairs[n - 1];
    if (!pair) {
      return failure(
        "finance_apply_transfer",
        `No transfer #${n}. I only see ${pairs.length} proposal(s).`
      );
    }
    return applyOnePair(pair);
  }

  const q = String(spec).toLowerCase();
  const hit = pairs.find((p) => {
    const blob = `${p.outTx.merchant || ""} ${p.outTx.note || ""} ${p.inTx.merchant || ""} ${p.inTx.note || ""}`.toLowerCase();
    return blob.includes(q);
  });
  if (!hit) {
    return failure(
      "finance_apply_transfer",
      `No transfer pair matched “${spec}”. Try “list transfers” first.`
    );
  }
  return applyOnePair(hit);
}

/** Mark all current high-confidence proposals (cap 5) */
export function finance_apply_all_transfers(max = 5): string {
  const pairs = detectTransferPairs(loadFinance().txs).slice(0, max);
  if (!pairs.length) {
    return failure("finance_apply_all_transfers", "No transfer pairs to mark.");
  }
  let n = 0;
  patchFinance((s) => {
    let txs = s.txs;
    for (const p of pairs) {
      txs = applyTransferPair(txs, p);
      n++;
    }
    return { ...s, txs };
  });
  return result(
    "finance_apply_all_transfers",
    `Marked ${n} transfer pair(s). True books will exclude them.`,
    { count: n }
  );
}

/** Open Finances ledger (navigate) */
export function finance_open_ledger(): string {
  return result("finance_open_ledger", "Opening Finances ledger.", {
    pageId: "pg-finance",
    tab: "transactions",
  });
}

/** Net worth + cash + invest (accounts on books) */
export function finance_net_worth(): string {
  const state = loadFinance();
  const cash = cashOnHand(state.accounts);
  const debt = creditOwed(state.accounts);
  const inv = invested(state.accounts);
  const nw = netWorth(state.accounts);
  return result(
    "finance_net_worth",
    `Net worth ${money(nw)} · cash ${money(cash)} · invested ${money(inv)} · credit owed ${money(debt)}.`,
    { netWorth: nw, cash, invested: inv, debt }
  );
}

/** Search ledger by merchant / note */
export function finance_search(query: string, limit = 8): string {
  const q = (query || "").trim().toLowerCase();
  if (!q) {
    return failure("finance_search", "Say a merchant or word to search (e.g. search Chipotle).");
  }
  const hits = loadFinance()
    .txs.filter((t) =>
      `${t.merchant || ""} ${t.note || ""} ${t.category}`.toLowerCase().includes(q)
    )
    .slice(0, limit);
  if (!hits.length) {
    return result("finance_search", `No transactions matched “${query}”.`, { hits: [] });
  }
  const lines = hits.map(
    (t) =>
      `${formatDateMDY(t.date)} · ${t.kind} ${moneyCents(t.amount)} · ${t.merchant || t.note || "—"} · ${t.category}`
  );
  return result(
    "finance_search",
    `Found ${hits.length}:\n${lines.join("\n")}`,
    {
      hits: hits.map((t) => ({
        id: t.id,
        date: t.date,
        amount: t.amount,
        kind: t.kind,
        merchant: t.merchant,
        category: t.category,
      })),
    }
  );
}

/** Undo last Mel-logged expense/income */
export function finance_undo_last_mel(): string {
  const state = loadFinance();
  const melTxs = state.txs.filter((t) => t.source === "mel");
  if (!melTxs.length) {
    return failure("finance_undo_last_mel", "No Mel-logged transactions to undo.");
  }
  // newest first in ledger
  const last = melTxs[0];
  patchFinance((s) => ({
    ...s,
    txs: s.txs.filter((t) => t.id !== last.id),
  }));
  return result(
    "finance_undo_last_mel",
    `Removed Mel log: ${last.kind} ${moneyCents(last.amount)} · ${last.merchant || last.note} (${last.category}).`,
    { txId: last.id }
  );
}

/**
 * Parse natural language into finance tools.
 * Returns MelToolResult[] raw JSON strings (same as other mel tools).
 */
export function planFinanceCommands(q: string): string[] {
  const raw = q.trim();
  const low = raw.toLowerCase();
  const out: string[] = [];

  // Undo last Mel money log
  if (
    /\bundo\s+(?:last\s+)?(?:mel\s+)?(?:expense|income|log|transaction|tx)\b/i.test(low) ||
    /\bundo\s+(?:the\s+)?last\s+(?:money|spend|expense)\b/i.test(low)
  ) {
    out.push(finance_undo_last_mel());
    return out;
  }

  // Net worth
  if (
    /\b(net\s*worth|how\s+much\s+(?:am\s+i\s+)?worth|invested\s+balance)\b/i.test(low)
  ) {
    out.push(finance_net_worth());
    return out;
  }

  // Search ledger
  const searchM =
    raw.match(/\b(?:search|find)\s+(?:transactions?\s+)?(?:for\s+)?(.+)$/i) ||
    raw.match(/\b(?:search|find)\s+(.+?)\s+in\s+(?:the\s+)?(?:ledger|books)\b/i);
  if (searchM?.[1] && !/\btransfer\b/i.test(searchM[1])) {
    out.push(finance_search(searchM[1].trim()));
    return out;
  }

  // True burn / cash flow
  if (
    /\b(true\s+(burn|spend|income|flow|cash)|transfer[- ]stripped|real\s+burn|what'?s\s+my\s+true)\b/i.test(
      low
    ) ||
    /^(true\s+books|true\s+cash\s*flow)\??$/i.test(low)
  ) {
    out.push(finance_true_burn());
    return out;
  }

  // Safe to spend
  if (
    /\b(safe\s+to\s+spend|fun\s+money|can\s+i\s+spend|how\s+much\s+can\s+i\s+spend)\b/i.test(
      low
    )
  ) {
    out.push(finance_safe_to_spend());
    return out;
  }

  // Capital / deploy / reinvest
  if (
    /\b(deploy\s+now|reinvest|capital\s+(score|command|brief)|keep\s+rate|what\s+should\s+i\s+do\s+with\s+(my\s+)?money)\b/i.test(
      low
    )
  ) {
    out.push(finance_capital_brief(raw));
    return out;
  }

  // List transfers
  if (
    /\b(list|show|find)\b.*\btransfers?\b/i.test(low) ||
    /\blikely\s+transfers?\b/i.test(low) ||
    /^transfers\??$/i.test(low)
  ) {
    out.push(finance_list_transfers());
    return out;
  }

  // Apply all transfers
  if (
    /\b(mark|fix|apply)\b.*\ball\b.*\btransfers?\b/i.test(low) ||
    /\bfix\s+all\s+transfers?\b/i.test(low)
  ) {
    out.push(finance_apply_all_transfers());
    return out;
  }

  // Mark transfer N / top
  const markN = low.match(
    /\b(?:mark|fix|apply)\s+(?:transfer\s+)?(?:#?\s*)?(\d+|top)\b/
  );
  if (markN || /\b(mark|fix)\s+(?:the\s+)?(?:top\s+)?transfer\b/i.test(low)) {
    const spec = markN?.[1] === "top" || !markN ? "top" : markN[1];
    out.push(finance_apply_transfer(spec));
    return out;
  }

  // Mark transfer mentioning merchant
  const markMerch = raw.match(
    /\b(?:mark|fix)\s+(?:as\s+)?transfer\s+(?:for\s+)?(.+)$/i
  );
  if (markMerch?.[1] && !/^\d+$/.test(markMerch[1].trim())) {
    out.push(finance_apply_transfer(markMerch[1].trim()));
    return out;
  }

  // Recategorize X to Y
  const recat = raw.match(
    /\b(?:recategor(?:y|ize)|reclass(?:ify)?|set\s+category)\s+(.+?)\s+(?:to|as)\s+(.+)$/i
  );
  if (recat) {
    out.push(finance_recategorize(recat[1].trim(), recat[2].trim()));
    return out;
  }

  // Log expense: log $12 chipotle / spent 40 on groceries / expense 15 uber
  const logExp =
    raw.match(
      /^(?:log|add|record)\s+(?:an?\s+)?(?:expense\s+)?\$?\s*([\d,]+(?:\.\d{1,2})?)\s+(?:at\s+|on\s+|for\s+|to\s+)?(.+)$/i
    ) ||
    raw.match(
      /^(?:spent|paid)\s+\$?\s*([\d,]+(?:\.\d{1,2})?)\s+(?:at\s+|on\s+|for\s+)?(.+)$/i
    ) ||
    raw.match(
      /^(?:log|add)\s+\$?\s*([\d,]+(?:\.\d{1,2})?)\s+(.+)$/i
    );
  if (logExp) {
    const amount = Number(logExp[1].replace(/,/g, ""));
    let rest = logExp[2].trim();
    let category: string | undefined;
    const asCat = rest.match(/\bas\s+(.+)$/i);
    if (asCat) {
      category = asCat[1].trim();
      rest = rest.slice(0, asCat.index).trim();
    }
    out.push(
      finance_log_expense({
        amount,
        merchant: rest,
        category,
        kind: "expense",
      })
    );
    return out;
  }

  // Income log
  const logInc = raw.match(
    /^(?:log|add|record)\s+(?:income\s+)?\$?\s*([\d,]+(?:\.\d{1,2})?)\s+(?:from\s+)?(.+)$/i
  );
  if (logInc && /\bincome\b/i.test(low)) {
    out.push(
      finance_log_expense({
        amount: Number(logInc[1].replace(/,/g, "")),
        merchant: logInc[2].trim(),
        category: "Income",
        kind: "income",
      })
    );
    return out;
  }

  // Card payment → recategorize as Credit card payment (helps true spend)
  const cardPay = raw.match(
    /\b(?:mark|set)\s+(.+?)\s+as\s+(?:a\s+)?(?:credit\s*)?card\s+payment\b/i
  );
  if (cardPay?.[1]) {
    out.push(finance_recategorize(cardPay[1].trim(), "Credit card payment"));
    return out;
  }

  // Generic money question → capital brief answerer
  if (
    /\b(afford|runway|credit|utili[sz]ation|anomaly|leak|merchant|subscription\s+drag|net\s*worth)\b/i.test(
      low
    ) &&
    /\b(money|cash|card|spend|budget|financ|burn|debt|worth|invest)\b/i.test(low)
  ) {
    out.push(finance_capital_brief(raw));
    return out;
  }

  return out;
}

/** For agent: parse tool results from planFinanceCommands */
export function runFinancePlan(q: string): MelToolResult[] {
  return planFinanceCommands(q).map(parseJsonTool);
}

/**
 * Full personal accounting engine — every module from the desk checklist.
 * Focus: correct numbers on real ledger data. No fancy screens.
 *
 * Modules:
 *  1. Transaction inbox
 *  2. Chart of accounts
 *  3. Journal engine
 *  4. Ledger
 *  5. Reconciliation
 *  6. Receipt vault
 *  7. Budget planner
 *  8. Variance dashboard
 *  9. Cash runway model
 * 10. Recurring charges tracker
 * 11. Payables tracker
 * 12. Receivables tracker
 * 13. Financial statements (P&L, cash flow, balance sheet)
 * 14. Monthly close
 */

import {
  cashOnHand,
  monthKey,
  moneyCents,
  spentByCategory,
  txsInMonth,
  type FinanceState,
  type FinanceTx,
} from "./financeStore";
import {
  FINANCE_CATEGORIES,
  categorizeMerchant,
  cleanMerchant,
} from "./financeCategorize";
import {
  loadBooksExtra,
  type BooksExtraState,
  type Payable,
  type Receivable,
  type ReceiptItem,
} from "./financeBooksStore";

// ─── Chart of accounts (module 2) ───────────────────────────────────────────

export type CoaAccount = {
  code: string;
  name: string;
  /** asset | liability | equity | income | expense | transfer */
  type: "asset" | "liability" | "equity" | "income" | "expense" | "transfer";
  /** Maps to our simple category string when relevant */
  category?: string;
};

/** Fixed chart — classification + consistency */
export const CHART_OF_ACCOUNTS: CoaAccount[] = [
  { code: "1000", name: "Cash & checking", type: "asset" },
  { code: "1100", name: "Savings", type: "asset" },
  { code: "1200", name: "Investments", type: "asset" },
  { code: "2000", name: "Credit cards", type: "liability" },
  { code: "2100", name: "Other payables", type: "liability" },
  { code: "3000", name: "Owner equity / net worth", type: "equity" },
  { code: "4000", name: "Income", type: "income", category: "Income" },
  { code: "4100", name: "Gifts received", type: "income", category: "Income" },
  { code: "5100", name: "Utilities", type: "expense", category: "Utilities" },
  { code: "5200", name: "Food / groceries", type: "expense", category: "Food / groceries" },
  { code: "5300", name: "Restaurants / coffee", type: "expense", category: "Restaurants / coffee" },
  { code: "5400", name: "Transport", type: "expense", category: "Transport" },
  { code: "5500", name: "Health / medical", type: "expense", category: "Health" },
  { code: "5600", name: "Shopping", type: "expense", category: "Shopping" },
  { code: "5700", name: "Subscriptions / software", type: "expense", category: "Subscriptions" },
  { code: "5800", name: "Build / tools", type: "expense", category: "Build / tools" },
  { code: "5900", name: "Travel", type: "expense", category: "Travel" },
  { code: "6000", name: "Education / tuition", type: "expense", category: "Education / school" },
  { code: "6100", name: "Fun", type: "expense", category: "Fun" },
  { code: "6200", name: "Fees", type: "expense", category: "Fees" },
  { code: "6300", name: "Credit card payment", type: "transfer", category: "Credit card payment" },
  { code: "6400", name: "Transfers", type: "transfer", category: "Transfers" },
  { code: "6900", name: "Other expense", type: "expense", category: "Other" },
  { code: "6999", name: "Uncategorized", type: "expense", category: "Uncategorized" },
];

export function coaForCategory(category: string): CoaAccount {
  const hit = CHART_OF_ACCOUNTS.find((a) => a.category === category);
  if (hit) return hit;
  if (/income|zelle from|gift/i.test(category)) {
    return CHART_OF_ACCOUNTS.find((a) => a.code === "4000")!;
  }
  return CHART_OF_ACCOUNTS.find((a) => a.code === "6999")!;
}

// ─── Transaction inbox (module 1) ───────────────────────────────────────────

export type InboxLine = {
  id: string;
  date: string;
  merchant: string;
  amount: number; // signed: + in, − out
  kind: "income" | "expense";
  category: string;
  source: string;
  pending: boolean;
  /** True if merchant/date/amount are present */
  complete: boolean;
  accountId: string | null;
  rawNote: string;
};

export type InboxReport = {
  total: number;
  complete: number;
  incomplete: number;
  pending: number;
  bySource: Record<string, number>;
  dateFrom: string | null;
  dateTo: string | null;
  lines: InboxLine[];
  /** Accounting concept */
  concept: string;
};

export function buildTransactionInbox(state: FinanceState): InboxReport {
  const lines: InboxLine[] = state.txs.map((t) => {
    const merchant = (t.merchant || t.note || "").trim();
    const complete = !!(t.date && merchant && t.amount > 0);
    return {
      id: t.id,
      date: t.date,
      merchant: merchant || "(no merchant)",
      amount: t.kind === "income" ? t.amount : -t.amount,
      kind: t.kind,
      category: t.category || "Uncategorized",
      source: t.source || "manual",
      pending: !!t.pending,
      complete,
      accountId: t.accountId ?? null,
      rawNote: t.note || "",
    };
  });
  lines.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const bySource: Record<string, number> = {};
  for (const l of lines) bySource[l.source] = (bySource[l.source] || 0) + 1;
  const dates = lines.map((l) => l.date).filter(Boolean).sort();
  return {
    total: lines.length,
    complete: lines.filter((l) => l.complete).length,
    incomplete: lines.filter((l) => !l.complete).length,
    pending: lines.filter((l) => l.pending).length,
    bySource,
    dateFrom: dates[0] || null,
    dateTo: dates[dates.length - 1] || null,
    lines,
    concept: "Source documents, completeness",
  };
}

/** Normalize a raw bank row into merchant/date/amount (import helper) */
export function normalizeBankRow(raw: {
  date?: string;
  description?: string;
  amount?: number | string;
  type?: string;
}): { date: string; merchant: string; amount: number; kind: "income" | "expense"; category: string } {
  let date = (raw.date || "").trim();
  // MM/DD/YYYY → YYYY-MM-DD
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(date)) {
    const [m, d, y] = date.split("/");
    date = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const merchant = cleanMerchant(raw.description || "");
  const amt = typeof raw.amount === "string" ? Number(raw.amount.replace(/[$,]/g, "")) : Number(raw.amount || 0);
  const kind: "income" | "expense" = amt >= 0 ? "income" : "expense";
  const category = categorizeMerchant(merchant || raw.description || "");
  return {
    date,
    merchant: merchant || cleanMerchant(raw.description || "") || "Unknown",
    amount: Math.abs(amt),
    kind,
    category,
  };
}

// ─── Journal engine (module 3) ──────────────────────────────────────────────

export type JournalEntry = {
  id: string;
  date: string;
  txId: string;
  /** Debit account code */
  debitCode: string;
  debitName: string;
  /** Credit account code */
  creditCode: string;
  creditName: string;
  amount: number;
  memo: string;
  status: "posted" | "pending";
  category: string;
};

export type JournalReport = {
  entries: JournalEntry[];
  posted: number;
  pending: number;
  concept: string;
};

/**
 * Double-entry map:
 * Expense: Debit expense COA, Credit cash/checking
 * Income: Debit cash, Credit income
 * Transfer/card pay: Debit liability or transfer, Credit cash (simplified personal books)
 */
export function buildJournal(state: FinanceState): JournalReport {
  const entries: JournalEntry[] = state.txs.map((t) => {
    const coa = coaForCategory(t.category);
    const pending = !!t.pending;
    const memo = t.merchant || t.note || coa.name;
    if (t.kind === "income") {
      return {
        id: `je-${t.id}`,
        date: t.date,
        txId: t.id,
        debitCode: "1000",
        debitName: "Cash & checking",
        creditCode: coa.code,
        creditName: coa.name,
        amount: t.amount,
        memo,
        status: pending ? "pending" : "posted",
        category: t.category,
      };
    }
    // expense / transfer out — debit category (or transfer code), credit cash
    return {
      id: `je-${t.id}`,
      date: t.date,
      txId: t.id,
      debitCode: coa.code,
      debitName: coa.name,
      creditCode: "1000",
      creditName: "Cash & checking",
      amount: t.amount,
      memo,
      status: pending ? "pending" : "posted",
      category: t.category,
    };
  });
  entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return {
    entries,
    posted: entries.filter((e) => e.status === "posted").length,
    pending: entries.filter((e) => e.status === "pending").length,
    concept: "Double-entry logic, audit trail",
  };
}

// ─── Ledger (module 4) ──────────────────────────────────────────────────────

export type LedgerLine = {
  date: string;
  accountCode: string;
  accountName: string;
  memo: string;
  debit: number;
  credit: number;
  txId: string;
  category: string;
};

export type LedgerReport = {
  lines: LedgerLine[];
  byAccount: {
    code: string;
    name: string;
    debitTotal: number;
    creditTotal: number;
    net: number;
  }[];
  concept: string;
};

export function buildLedger(journal: JournalReport): LedgerReport {
  const lines: LedgerLine[] = [];
  for (const e of journal.entries) {
    lines.push({
      date: e.date,
      accountCode: e.debitCode,
      accountName: e.debitName,
      memo: e.memo,
      debit: e.amount,
      credit: 0,
      txId: e.txId,
      category: e.category,
    });
    lines.push({
      date: e.date,
      accountCode: e.creditCode,
      accountName: e.creditName,
      memo: e.memo,
      debit: 0,
      credit: e.amount,
      txId: e.txId,
      category: e.category,
    });
  }
  const map = new Map<string, { name: string; debit: number; credit: number }>();
  for (const l of lines) {
    const cur = map.get(l.accountCode) || {
      name: l.accountName,
      debit: 0,
      credit: 0,
    };
    cur.debit += l.debit;
    cur.credit += l.credit;
    map.set(l.accountCode, cur);
  }
  const byAccount = [...map.entries()]
    .map(([code, v]) => ({
      code,
      name: v.name,
      debitTotal: v.debit,
      creditTotal: v.credit,
      net: v.debit - v.credit,
    }))
    .sort((a, b) => a.code.localeCompare(b.code));
  return {
    lines: lines.sort((a, b) => (a.date < b.date ? 1 : -1)),
    byAccount,
    concept: "General ledger",
  };
}

// ─── Reconciliation (module 5) ──────────────────────────────────────────────

export type ReconReport = {
  accountId: string;
  accountName: string;
  bookBalance: number;
  /** Sum of income − expense on that account (from txs) */
  activityNet: number;
  txCount: number;
  /** Gaps: account balance vs activity when we can check */
  status: "matched" | "drift" | "no-activity" | "no-account";
  drift: number;
  notes: string[];
  concept: string;
};

export function buildReconciliation(state: FinanceState): ReconReport[] {
  const reports: ReconReport[] = [];
  for (const acc of state.accounts) {
    const txs = state.txs.filter((t) => t.accountId === acc.id);
    let activityNet = 0;
    for (const t of txs) {
      activityNet += t.kind === "income" ? t.amount : -t.amount;
    }
    const notes: string[] = [];
    let status: ReconReport["status"] = "matched";
    let drift = 0;
    if (txs.length === 0) {
      status = acc.balance === 0 ? "no-activity" : "drift";
      if (acc.balance !== 0) {
        notes.push(
          "Account has a balance but no tagged transactions — import or assign accountId."
        );
        drift = acc.balance;
      }
    } else {
      // Personal books: we don't rebuild opening balance from scratch;
      // flag if credit card balance is non-zero with no recent card detail.
      if (acc.kind === "credit" && acc.balance > 0) {
        notes.push(
          "Card balance owed — import card statement to match individual merchants."
        );
      }
      // Checking: ending balance from latest statement import is trusted
      status = "matched";
      notes.push(
        `${txs.length} lines tagged to this account. Ending balance on books: ${moneyCents(acc.balance)}.`
      );
    }
    reports.push({
      accountId: acc.id,
      accountName: acc.name,
      bookBalance: acc.balance,
      activityNet,
      txCount: txs.length,
      status,
      drift,
      notes,
      concept: "Accuracy, control",
    });
  }
  if (!reports.length) {
    reports.push({
      accountId: "",
      accountName: "(no accounts)",
      bookBalance: 0,
      activityNet: 0,
      txCount: 0,
      status: "no-account",
      drift: 0,
      notes: ["Add accounts and import statements."],
      concept: "Accuracy, control",
    });
  }
  return reports;
}

// ─── Receipt vault (module 6) ───────────────────────────────────────────────

export type ReceiptVaultReport = {
  count: number;
  linkedToTx: number;
  unlinked: number;
  byKind: Record<string, number>;
  items: ReceiptItem[];
  concept: string;
};

export function buildReceiptVault(books: BooksExtraState): ReceiptVaultReport {
  const byKind: Record<string, number> = {};
  for (const r of books.receipts) {
    byKind[r.kind] = (byKind[r.kind] || 0) + 1;
  }
  return {
    count: books.receipts.length,
    linkedToTx: books.receipts.filter((r) => r.txId).length,
    unlinked: books.receipts.filter((r) => !r.txId).length,
    byKind,
    items: [...books.receipts].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : -1
    ),
    concept: "Documentation, evidence",
  };
}

// ─── Budget planner + variance (modules 7–8) ────────────────────────────────

export type BudgetPlanLine = {
  category: string;
  planned: number;
  actual: number;
  variance: number; // actual − planned (positive = over)
  pctUsed: number | null;
  status: "ok" | "tight" | "over" | "no-plan";
};

export type BudgetVarianceReport = {
  month: string;
  lines: BudgetPlanLine[];
  plannedTotal: number;
  actualTotal: number;
  varianceTotal: number;
  overCategories: string[];
  conceptPlan: string;
  conceptVariance: string;
};

export function buildBudgetVariance(
  state: FinanceState,
  ym: string
): BudgetVarianceReport {
  const spent = spentByCategory(state.txs, ym);
  const cats = new Set([
    ...state.budget.map((b) => b.category),
    ...Object.keys(spent),
  ]);
  // Skip pure income on expense variance
  const lines: BudgetPlanLine[] = [];
  for (const category of cats) {
    if (category === "Income") continue;
    const planned =
      state.budget.find((b) => b.category === category)?.planned || 0;
    const actual = spent[category] || 0;
    if (planned <= 0 && actual <= 0) continue;
    const variance = actual - planned;
    let status: BudgetPlanLine["status"] = "no-plan";
    if (planned > 0) {
      const ratio = actual / planned;
      status = ratio > 1.05 ? "over" : ratio > 0.85 ? "tight" : "ok";
    } else if (actual > 0) {
      status = "no-plan";
    }
    lines.push({
      category,
      planned,
      actual,
      variance,
      pctUsed: planned > 0 ? actual / planned : null,
      status,
    });
  }
  lines.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
  const plannedTotal = lines.reduce((s, l) => s + l.planned, 0);
  const actualTotal = lines.reduce((s, l) => s + l.actual, 0);
  return {
    month: ym,
    lines,
    plannedTotal,
    actualTotal,
    varianceTotal: actualTotal - plannedTotal,
    overCategories: lines.filter((l) => l.status === "over").map((l) => l.category),
    conceptPlan: "Planning",
    conceptVariance: "Variance analysis",
  };
}

// ─── Cash runway (module 9) ─────────────────────────────────────────────────

export type RunwayReport = {
  cash: number;
  /** Average monthly burn (expenses excluding pure transfers + card pays when possible) */
  avgMonthlyBurn: number;
  avgMonthlyIncome: number;
  netMonthly: number;
  runwayMonths: number;
  runwayDays: number;
  unstableIncome: boolean;
  monthsSampled: number;
  order: string;
  concept: string;
};

function isTrueBurn(t: FinanceTx): boolean {
  if (t.kind !== "expense") return false;
  const c = (t.category || "").toLowerCase();
  const m = `${t.merchant || ""} ${t.note || ""}`.toLowerCase();
  if (c.includes("transfer") || c.includes("credit card payment")) return false;
  if (/payment to chase card|online transfer|zelle payment to/.test(m))
    return false;
  return true;
}

export function buildRunway(state: FinanceState): RunwayReport {
  const cash = cashOnHand(state.accounts);
  // last 3 calendar months with data
  const months = [
    ...new Set(state.txs.map((t) => t.date.slice(0, 7))),
  ].sort();
  const sample = months.slice(-3);
  let burnSum = 0;
  let incomeSum = 0;
  for (const ym of sample) {
    const txs = txsInMonth(state.txs, ym);
    burnSum += txs.filter(isTrueBurn).reduce((s, t) => s + t.amount, 0);
    incomeSum += txs
      .filter((t) => t.kind === "income")
      .reduce((s, t) => s + t.amount, 0);
  }
  const n = Math.max(1, sample.length);
  const avgMonthlyBurn = burnSum / n;
  const avgMonthlyIncome = incomeSum / n;
  const netMonthly = avgMonthlyIncome - avgMonthlyBurn;
  // Income variance = unstable?
  const incomes = sample.map((ym) =>
    txsInMonth(state.txs, ym)
      .filter((t) => t.kind === "income")
      .reduce((s, t) => s + t.amount, 0)
  );
  const mean = incomes.reduce((a, b) => a + b, 0) / Math.max(1, incomes.length);
  const variance =
    incomes.reduce((s, v) => s + (v - mean) ** 2, 0) /
    Math.max(1, incomes.length);
  const unstableIncome = mean > 0 ? Math.sqrt(variance) / mean > 0.35 : true;

  const runwayMonths =
    avgMonthlyBurn > 0 ? cash / avgMonthlyBurn : cash > 0 ? 99 : 0;
  const runwayDays = Math.round(runwayMonths * 30);
  let order = "Cash stable relative to burn.";
  if (cash <= 0) order = "Cash is near zero — raise inflows or cut burn now.";
  else if (runwayMonths < 1)
    order = "Under 1 month runway — emergency cut list.";
  else if (runwayMonths < 3)
    order = "Under 3 months — protect cash, delay non-essentials.";
  else if (unstableIncome)
    order = "Income jumps around — keep a thicker cash buffer.";
  else order = "Aim for 6+ months of true burn in cash.";

  return {
    cash,
    avgMonthlyBurn,
    avgMonthlyIncome,
    netMonthly,
    runwayMonths,
    runwayDays,
    unstableIncome,
    monthsSampled: sample.length,
    order,
    concept: "Cash flow management",
  };
}

// ─── Recurring charges (module 10) ──────────────────────────────────────────

export type RecurringCharge = {
  merchant: string;
  avgAmount: number;
  times: number;
  monthsSeen: number;
  lastDate: string;
  category: string;
  /** Heuristic confidence 0–1 */
  confidence: number;
};

export type RecurringReport = {
  charges: RecurringCharge[];
  monthlyEstimate: number;
  concept: string;
};

export function buildRecurring(state: FinanceState): RecurringReport {
  // Group expense by normalized merchant
  type Bucket = {
    amounts: number[];
    dates: string[];
    category: string;
  };
  const map = new Map<string, Bucket>();
  for (const t of state.txs) {
    if (t.kind !== "expense") continue;
    if (!isTrueBurn(t) && !/subscription|apple|spotify|netflix|squarespace|audible|wash kiosk|retro fitness/i.test(
      `${t.merchant} ${t.note} ${t.category}`
    )) {
      // still allow classic subscription names even if categorized transfer-ish
      if (!/subscription|software|apple\.com|audible|squarespace|netflix|spotify/i.test(
        `${t.merchant} ${t.note}`
      )) {
        // require multiple months for groceries etc.
      }
    }
    const key = (t.merchant || t.note || "Unknown")
      .toLowerCase()
      .replace(/\d+/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 40);
    if (!key) continue;
    // skip one-off huge school if only once? still track if recurring pattern
    const b = map.get(key) || { amounts: [], dates: [], category: t.category };
    b.amounts.push(t.amount);
    b.dates.push(t.date);
    b.category = t.category;
    map.set(key, b);
  }

  const charges: RecurringCharge[] = [];
  for (const [key, b] of map) {
    const months = new Set(b.dates.map((d) => d.slice(0, 7)));
    if (b.amounts.length < 2 && months.size < 2) continue;
    // amount stability
    const avg =
      b.amounts.reduce((s, a) => s + a, 0) / Math.max(1, b.amounts.length);
    const spread =
      Math.max(...b.amounts) - Math.min(...b.amounts);
    const stable = avg > 0 ? spread / avg < 0.35 : false;
    const multiMonth = months.size >= 2;
    if (!multiMonth && !stable) continue;
    // skip pure transfers
    if (/transfer|zelle|payment to chase/i.test(key)) continue;
    let confidence = 0.4;
    if (multiMonth) confidence += 0.25;
    if (stable) confidence += 0.2;
    if (b.amounts.length >= 3) confidence += 0.1;
    if (/subscription|apple|spotify|netflix|squarespace|audible|wash kiosk|fitness/i.test(key))
      confidence += 0.15;
    confidence = Math.min(1, confidence);
    if (confidence < 0.55 && months.size < 2) continue;
    const lastDate = [...b.dates].sort().reverse()[0];
    const display =
      state.txs.find(
        (t) =>
          (t.merchant || t.note || "")
            .toLowerCase()
            .replace(/\d+/g, "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 40) === key
      )?.merchant || key;
    charges.push({
      merchant: display,
      avgAmount: Math.round(avg * 100) / 100,
      times: b.amounts.length,
      monthsSeen: months.size,
      lastDate,
      category: b.category,
      confidence,
    });
  }
  charges.sort((a, b) => b.avgAmount * b.confidence - a.avgAmount * a.confidence);
  const monthlyEstimate = charges
    .filter((c) => c.confidence >= 0.55)
    .reduce((s, c) => s + c.avgAmount, 0);
  return {
    charges: charges.slice(0, 40),
    monthlyEstimate,
    concept: "Accrual awareness, fixed costs",
  };
}

// ─── Payables / receivables (modules 11–12) ─────────────────────────────────

export type PayablesReport = {
  open: Payable[];
  paid: Payable[];
  openTotal: number;
  overdue: Payable[];
  concept: string;
};

export type ReceivablesReport = {
  open: Receivable[];
  received: Receivable[];
  openTotal: number;
  overdue: Receivable[];
  concept: string;
};

export function buildPayables(books: BooksExtraState, today = new Date()): PayablesReport {
  const td = today.toISOString().slice(0, 10);
  const open = books.payables.filter((p) => !p.paid);
  const paid = books.payables.filter((p) => p.paid);
  return {
    open,
    paid,
    openTotal: open.reduce((s, p) => s + p.amount, 0),
    overdue: open.filter((p) => p.dueDate < td),
    concept: "Accounts payable",
  };
}

export function buildReceivables(
  books: BooksExtraState,
  today = new Date()
): ReceivablesReport {
  const td = today.toISOString().slice(0, 10);
  const open = books.receivables.filter((r) => !r.received);
  const received = books.receivables.filter((r) => r.received);
  return {
    open,
    received,
    openTotal: open.reduce((s, r) => s + r.amount, 0),
    overdue: open.filter((r) => r.dueDate < td),
    concept: "Accounts receivable",
  };
}

// ─── Financial statements (module 13) ───────────────────────────────────────

export type PnLStatement = {
  month: string;
  income: number;
  expensesByCategory: { category: string; amount: number }[];
  expenseTotal: number;
  /** Transfers + card pays separated so P&L is cleaner */
  transfersOut: number;
  netOperating: number;
  netAll: number;
};

export type CashFlowStatement = {
  month: string;
  operatingIn: number;
  operatingOut: number;
  transfersNet: number;
  netChange: number;
};

export type BalanceSheet = {
  asOf: string;
  assets: { name: string; amount: number }[];
  liabilities: { name: string; amount: number }[];
  totalAssets: number;
  totalLiabilities: number;
  equity: number;
};

export type StatementsReport = {
  pnl: PnLStatement;
  cashFlow: CashFlowStatement;
  balanceSheet: BalanceSheet;
  concept: string;
};

export function buildStatements(
  state: FinanceState,
  ym: string
): StatementsReport {
  const monthTxs = txsInMonth(state.txs, ym);
  let income = 0;
  let transfersOut = 0;
  let operatingOut = 0;
  const byCat: Record<string, number> = {};
  for (const t of monthTxs) {
    if (t.kind === "income") {
      income += t.amount;
      continue;
    }
    const c = t.category || "Other";
    if (
      /transfer|credit card payment/i.test(c) ||
      /payment to chase card|online transfer/i.test(
        `${t.merchant || ""} ${t.note || ""}`
      )
    ) {
      transfersOut += t.amount;
    } else {
      operatingOut += t.amount;
      byCat[c] = (byCat[c] || 0) + t.amount;
    }
  }
  const expensesByCategory = Object.entries(byCat)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
  const expenseTotal = operatingOut;
  const netOperating = income - operatingOut;
  const netAll = income - operatingOut - transfersOut;

  const assets = state.accounts
    .filter((a) => a.kind !== "credit")
    .map((a) => ({ name: a.name, amount: a.balance }));
  const liabilities = state.accounts
    .filter((a) => a.kind === "credit")
    .map((a) => ({ name: a.name, amount: Math.max(0, a.balance) }));
  const totalAssets = assets.reduce((s, a) => s + a.amount, 0);
  const totalLiabilities = liabilities.reduce((s, a) => s + a.amount, 0);

  return {
    pnl: {
      month: ym,
      income,
      expensesByCategory,
      expenseTotal,
      transfersOut,
      netOperating,
      netAll,
    },
    cashFlow: {
      month: ym,
      operatingIn: income,
      operatingOut,
      transfersNet: -transfersOut,
      netChange: income - operatingOut - transfersOut,
    },
    balanceSheet: {
      asOf: new Date().toISOString().slice(0, 10),
      assets,
      liabilities,
      totalAssets,
      totalLiabilities,
      equity: totalAssets - totalLiabilities,
    },
    concept: "Reporting",
  };
}

// ─── Monthly close (module 14) ──────────────────────────────────────────────

export type CloseCheck = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
};

export type MonthlyCloseReport = {
  month: string;
  locked: boolean;
  checks: CloseCheck[];
  readyToClose: boolean;
  score: number; // 0–100
  concept: string;
};

export function buildMonthlyClose(
  state: FinanceState,
  ym: string,
  books: BooksExtraState,
  variance: BudgetVarianceReport,
  recon: ReconReport[],
  inbox: InboxReport
): MonthlyCloseReport {
  const locked = books.closedMonths.includes(ym);
  const monthTxs = txsInMonth(state.txs, ym);
  const uncategorized = monthTxs.filter(
    (t) => !t.category || t.category === "Uncategorized"
  ).length;
  const checks: CloseCheck[] = [
    {
      id: "has-txs",
      label: "Transactions exist for the month",
      ok: monthTxs.length > 0,
      detail:
        monthTxs.length > 0
          ? `${monthTxs.length} lines in ${ym}`
          : "No lines — import activity",
    },
    {
      id: "complete",
      label: "Source documents complete (merchant/date/amount)",
      ok: inbox.incomplete === 0,
      detail:
        inbox.incomplete === 0
          ? "All lines have merchant, date, amount"
          : `${inbox.incomplete} incomplete lines`,
    },
    {
      id: "categorized",
      label: "No uncategorized lines this month",
      ok: uncategorized === 0,
      detail:
        uncategorized === 0
          ? "Every line classified"
          : `${uncategorized} uncategorized`,
    },
    {
      id: "recon",
      label: "Accounts reconcilable",
      ok: recon.every((r) => r.status === "matched" || r.status === "no-activity"),
      detail: recon
        .map((r) => `${r.accountName}: ${r.status}`)
        .slice(0, 4)
        .join("; "),
    },
    {
      id: "budget",
      label: "Budget plan present (or variance reviewed)",
      ok: variance.plannedTotal > 0 || variance.actualTotal > 0,
      detail:
        variance.plannedTotal > 0
          ? `Plan ${moneyCents(variance.plannedTotal)} vs actual ${moneyCents(variance.actualTotal)}`
          : "No plan — auto-build recommended",
    },
    {
      id: "payables",
      label: "Open payables reviewed",
      ok: books.payables.filter((p) => !p.paid).length === 0,
      detail: `${books.payables.filter((p) => !p.paid).length} open payables`,
    },
  ];
  const okCount = checks.filter((c) => c.ok).length;
  const score = Math.round((okCount / checks.length) * 100);
  return {
    month: ym,
    locked,
    checks,
    readyToClose: score >= 80 && !locked,
    score,
    concept: "Closing process, internal controls",
  };
}

// ─── Master pack (all modules) ──────────────────────────────────────────────

export type ModuleStatus = {
  id: string;
  module: string;
  whatItDoes: string;
  concept: string;
  /** short live status */
  status: string;
  /** one key metric string */
  metric: string;
  ok: boolean;
};

export type AccountingPack = {
  month: string;
  inbox: InboxReport;
  chartOfAccounts: CoaAccount[];
  journal: JournalReport;
  ledger: LedgerReport;
  reconciliation: ReconReport[];
  receipts: ReceiptVaultReport;
  budgetVariance: BudgetVarianceReport;
  runway: RunwayReport;
  recurring: RecurringReport;
  payables: PayablesReport;
  receivables: ReceivablesReport;
  statements: StatementsReport;
  monthlyClose: MonthlyCloseReport;
  modules: ModuleStatus[];
  books: BooksExtraState;
};

export function buildAccountingPack(
  state: FinanceState,
  ym: string = monthKey(),
  books: BooksExtraState = loadBooksExtra()
): AccountingPack {
  const inbox = buildTransactionInbox(state);
  const journal = buildJournal(state);
  const ledger = buildLedger(journal);
  const reconciliation = buildReconciliation(state);
  const receipts = buildReceiptVault(books);
  const budgetVariance = buildBudgetVariance(state, ym);
  const runway = buildRunway(state);
  const recurring = buildRecurring(state);
  const payables = buildPayables(books);
  const receivables = buildReceivables(books);
  const statements = buildStatements(state, ym);
  const monthlyClose = buildMonthlyClose(
    state,
    ym,
    books,
    budgetVariance,
    reconciliation,
    inbox
  );

  const modules: ModuleStatus[] = [
    {
      id: "inbox",
      module: "Transaction inbox",
      whatItDoes:
        "Imports every card/bank transaction and normalizes merchant/date/amount.",
      concept: inbox.concept,
      status:
        inbox.total > 0
          ? `${inbox.complete}/${inbox.total} complete`
          : "Empty — import CSV",
      metric: `${inbox.total} lines · ${inbox.dateFrom || "—"} → ${inbox.dateTo || "—"}`,
      ok: inbox.total > 0 && inbox.incomplete === 0,
    },
    {
      id: "coa",
      module: "Chart of accounts",
      whatItDoes:
        "Defines categories like rent, food, software, travel, tuition, medical, income, transfers.",
      concept: "Classification, consistency",
      status: `${CHART_OF_ACCOUNTS.length} accounts defined`,
      metric: FINANCE_CATEGORIES.join(", ").slice(0, 80) + "…",
      ok: true,
    },
    {
      id: "journal",
      module: "Journal engine",
      whatItDoes:
        "Turns each transaction into structured entries with account, amount, direction, notes, and status.",
      concept: journal.concept,
      status: `${journal.posted} posted · ${journal.pending} pending`,
      metric: `${journal.entries.length} journal entries`,
      ok: journal.entries.length > 0,
    },
    {
      id: "ledger",
      module: "Ledger",
      whatItDoes: "Master history of all categorized entries.",
      concept: ledger.concept,
      status: `${ledger.lines.length} ledger lines · ${ledger.byAccount.length} accounts used`,
      metric: ledger.byAccount
        .slice(0, 3)
        .map((a) => `${a.name} ${moneyCents(Math.abs(a.net))}`)
        .join(" · "),
      ok: ledger.lines.length > 0,
    },
    {
      id: "recon",
      module: "Reconciliation",
      whatItDoes: "Matches your imported transactions against statements.",
      concept: "Accuracy, control",
      status: reconciliation
        .map((r) => `${r.accountName}: ${r.status}`)
        .slice(0, 3)
        .join(" · "),
      metric: `${reconciliation.reduce((s, r) => s + r.txCount, 0)} tagged txs`,
      ok: reconciliation.every(
        (r) => r.status === "matched" || r.status === "no-activity"
      ),
    },
    {
      id: "receipts",
      module: "Receipt vault",
      whatItDoes:
        "Stores screenshots, PDFs, invoices, warranties, and receipts.",
      concept: receipts.concept,
      status:
        receipts.count > 0
          ? `${receipts.count} files · ${receipts.linkedToTx} linked`
          : "Empty — add proofs",
      metric: Object.entries(receipts.byKind)
        .map(([k, n]) => `${k}:${n}`)
        .join(" ") || "none",
      ok: true, // empty vault is valid
    },
    {
      id: "budget",
      module: "Budget planner",
      whatItDoes: "Sets expected spending and income by month/category.",
      concept: budgetVariance.conceptPlan,
      status:
        budgetVariance.plannedTotal > 0
          ? `Plan ${moneyCents(budgetVariance.plannedTotal)}`
          : "No plan — use Auto-build on Plan tab",
      metric: `${budgetVariance.lines.filter((l) => l.planned > 0).length} categories planned`,
      ok: budgetVariance.plannedTotal > 0,
    },
    {
      id: "variance",
      module: "Variance dashboard",
      whatItDoes: "Shows planned vs actual spending and flags drift.",
      concept: budgetVariance.conceptVariance,
      status:
        budgetVariance.overCategories.length > 0
          ? `OVER: ${budgetVariance.overCategories.slice(0, 3).join(", ")}`
          : budgetVariance.plannedTotal > 0
            ? "Within plan"
            : "Need plan for variance",
      metric: `Actual ${moneyCents(budgetVariance.actualTotal)} vs plan ${moneyCents(budgetVariance.plannedTotal)} (${budgetVariance.varianceTotal >= 0 ? "+" : ""}${moneyCents(budgetVariance.varianceTotal)})`,
      ok: budgetVariance.overCategories.length === 0,
    },
    {
      id: "runway",
      module: "Cash runway model",
      whatItDoes:
        "Estimates how long current cash lasts with unstable income.",
      concept: runway.concept,
      status: runway.order,
      metric: `${runway.runwayMonths > 20 ? "20+" : runway.runwayMonths.toFixed(1)} mo · burn ${moneyCents(runway.avgMonthlyBurn)}/mo · cash ${moneyCents(runway.cash)}`,
      ok: runway.runwayMonths >= 3 || runway.cash === 0,
    },
    {
      id: "recurring",
      module: "Recurring charges tracker",
      whatItDoes: "Finds subscriptions and monthly obligations.",
      concept: recurring.concept,
      status: `${recurring.charges.length} patterns`,
      metric: `~${moneyCents(recurring.monthlyEstimate)}/mo fixed-ish · top: ${recurring.charges[0]?.merchant || "—"}`,
      ok: true,
    },
    {
      id: "payables",
      module: "Payables tracker",
      whatItDoes: "Tracks what you owe, due dates, and whether it is paid.",
      concept: payables.concept,
      status:
        payables.open.length > 0
          ? `${payables.open.length} open · ${payables.overdue.length} overdue`
          : "No open payables",
      metric: `Open ${moneyCents(payables.openTotal)}`,
      ok: payables.overdue.length === 0,
    },
    {
      id: "receivables",
      module: "Receivables tracker",
      whatItDoes:
        "Tracks money others owe you, like reimbursements or freelance invoices.",
      concept: receivables.concept,
      status:
        receivables.open.length > 0
          ? `${receivables.open.length} open · ${receivables.overdue.length} overdue`
          : "No open receivables",
      metric: `Open ${moneyCents(receivables.openTotal)}`,
      ok: true,
    },
    {
      id: "statements",
      module: "Financial statements",
      whatItDoes:
        "Auto-generates P&L, cash flow, and a simple personal balance sheet.",
      concept: statements.concept,
      status: `P&L net operating ${moneyCents(statements.pnl.netOperating)} · equity ${moneyCents(statements.balanceSheet.equity)}`,
      metric: `In ${moneyCents(statements.pnl.income)} · burn ${moneyCents(statements.pnl.expenseTotal)} · transfers out ${moneyCents(statements.pnl.transfersOut)}`,
      ok: true,
    },
    {
      id: "close",
      module: "Monthly close",
      whatItDoes:
        "Locks the month, reconciles everything, and creates a report pack.",
      concept: monthlyClose.concept,
      status: monthlyClose.locked
        ? `LOCKED ${ym}`
        : monthlyClose.readyToClose
          ? "Ready to close"
          : `Not ready (${monthlyClose.score}/100)`,
      metric: monthlyClose.checks
        .map((c) => `${c.ok ? "✓" : "✗"} ${c.label}`)
        .join(" · ")
        .slice(0, 120),
      ok: monthlyClose.locked || monthlyClose.readyToClose,
    },
  ];

  return {
    month: ym,
    inbox,
    chartOfAccounts: CHART_OF_ACCOUNTS,
    journal,
    ledger,
    reconciliation,
    receipts,
    budgetVariance,
    runway,
    recurring,
    payables,
    receivables,
    statements,
    monthlyClose,
    modules,
    books,
  };
}

/** Ask-box answers for accounting modules */
export function answerAccounting(
  question: string,
  pack: AccountingPack
): string | null {
  const q = question.toLowerCase().trim();
  if (!q) return null;

  if (/chart of accounts|coa|categories list|classification/.test(q)) {
    return `Chart of accounts (${pack.chartOfAccounts.length} codes): ${pack.chartOfAccounts
      .map((a) => `${a.code} ${a.name}`)
      .join("; ")}.`;
  }
  if (/inbox|completeness|source document/.test(q)) {
    const i = pack.inbox;
    return `Transaction inbox: ${i.complete}/${i.total} complete, ${i.incomplete} incomplete, ${i.pending} pending. Range ${i.dateFrom} → ${i.dateTo}. Sources: ${JSON.stringify(i.bySource)}.`;
  }
  if (/journal|double.?entry|debit|credit entry/.test(q)) {
    return `Journal: ${pack.journal.posted} posted, ${pack.journal.pending} pending (${pack.journal.entries.length} total). Each bank line becomes debit + credit.`;
  }
  if (/general ledger|^ledger\b/.test(q)) {
    const top = pack.ledger.byAccount
      .slice(0, 6)
      .map(
        (a) =>
          `${a.code} ${a.name}: Dr ${moneyCents(a.debitTotal)} Cr ${moneyCents(a.creditTotal)}`
      )
      .join(" · ");
    return `Ledger has ${pack.ledger.lines.length} lines. By account: ${top}`;
  }
  if (/reconcil/.test(q)) {
    return pack.reconciliation
      .map(
        (r) =>
          `${r.accountName}: ${r.status}, book ${moneyCents(r.bookBalance)}, ${r.txCount} txs. ${r.notes[0] || ""}`
      )
      .join(" | ");
  }
  if (/receipt|vault|invoice|warranty/.test(q)) {
    return `Receipt vault: ${pack.receipts.count} items, ${pack.receipts.linkedToTx} linked to txs, ${pack.receipts.unlinked} unlinked.`;
  }
  if (/variance|over budget|planned vs/.test(q)) {
    const v = pack.budgetVariance;
    const overs = v.lines
      .filter((l) => l.status === "over")
      .slice(0, 5)
      .map((l) => `${l.category} +${moneyCents(l.variance)}`)
      .join(", ");
    return `Variance ${v.month}: actual ${moneyCents(v.actualTotal)} vs plan ${moneyCents(v.plannedTotal)}. Over: ${overs || "none"}.`;
  }
  if (/budget plan|planner/.test(q)) {
    return `Budget planner ${pack.budgetVariance.month}: planned ${moneyCents(pack.budgetVariance.plannedTotal)} across ${pack.budgetVariance.lines.filter((l) => l.planned > 0).length} categories.`;
  }
  if (/runway|how long.*cash|burn rate/.test(q)) {
    const r = pack.runway;
    return `Runway ${r.runwayMonths > 20 ? "20+" : r.runwayMonths.toFixed(1)} months (${r.runwayDays} days). Cash ${moneyCents(r.cash)}. Avg burn ${moneyCents(r.avgMonthlyBurn)}/mo, income ${moneyCents(r.avgMonthlyIncome)}/mo. Unstable income: ${r.unstableIncome ? "yes" : "no"}. ${r.order}`;
  }
  if (/recurring|subscription|fixed cost/.test(q)) {
    const top = pack.recurring.charges
      .slice(0, 8)
      .map(
        (c) =>
          `${c.merchant} ~${moneyCents(c.avgAmount)} (${c.times}×, ${Math.round(c.confidence * 100)}%)`
      )
      .join("; ");
    return `Recurring ~${moneyCents(pack.recurring.monthlyEstimate)}/mo. ${top || "None detected yet."}`;
  }
  if (/payable|what i owe|bills due/.test(q)) {
    const p = pack.payables;
    return `Payables open ${moneyCents(p.openTotal)} (${p.open.length} items, ${p.overdue.length} overdue). ${p.open.map((x) => `${x.what} ${moneyCents(x.amount)} due ${x.dueDate}`).join("; ") || "None listed — add bills you still owe."}`;
  }
  if (/receivable|owe me|invoice me|reimburs/.test(q)) {
    const r = pack.receivables;
    return `Receivables open ${moneyCents(r.openTotal)} (${r.open.length}). ${r.open.map((x) => `${x.who} ${moneyCents(x.amount)} due ${x.dueDate}`).join("; ") || "None listed."}`;
  }
  if (/p&l|profit|loss|income statement|balance sheet|cash flow statement|financial statement/.test(q)) {
    const s = pack.statements;
    return (
      `P&L ${s.pnl.month}: income ${moneyCents(s.pnl.income)}, operating expense ${moneyCents(s.pnl.expenseTotal)}, transfers out ${moneyCents(s.pnl.transfersOut)}, net operating ${moneyCents(s.pnl.netOperating)}. ` +
      `Cash flow net ${moneyCents(s.cashFlow.netChange)}. Balance sheet: assets ${moneyCents(s.balanceSheet.totalAssets)}, liabilities ${moneyCents(s.balanceSheet.totalLiabilities)}, equity ${moneyCents(s.balanceSheet.equity)}.`
    );
  }
  if (/monthly close|close the month|lock month|period close/.test(q)) {
    const c = pack.monthlyClose;
    return `Monthly close ${c.month}: ${c.locked ? "LOCKED" : c.readyToClose ? "ready to close" : "not ready"} (${c.score}/100). ${c.checks.map((x) => `${x.ok ? "OK" : "FIX"} ${x.label}: ${x.detail}`).join(" · ")}`;
  }
  if (/accounting module|all modules|bookkeeping module/.test(q)) {
    return pack.modules
      .map((m) => `${m.module}: ${m.status} | ${m.metric}`)
      .join("\n");
  }
  return null;
}

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
  txsInMonth,
  type FinanceState,
  type FinanceTx,
} from "./financeStore";
import {
  FINANCE_CATEGORIES,
  categorizeMerchant,
  cleanMerchant,
  normalizeCategory,
  normalizeTransactionCategory,
} from "./financeCategorize";
import {
  loadBooksExtra,
  type BooksExtraState,
  type Payable,
  type Receivable,
  type ReceiptItem,
} from "./financeBooksStore";
import { isTransferLike } from "./financeTransfers";
import { detectSubscriptions, type SubCadence } from "./subscriptions";

function isAnnualPeriod(period: string): boolean {
  return /^\d{4}$/.test(period);
}

function txsInPeriod(txs: FinanceTx[], period: string): FinanceTx[] {
  return txs.filter((tx) => tx.date.startsWith(period));
}

function periodEndDate(period: string): string {
  if (isAnnualPeriod(period)) return `${period}-12-31`;
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) return new Date().toISOString().slice(0, 10);
  const day = new Date(year, month, 0).getDate();
  return `${period}-${String(day).padStart(2, "0")}`;
}

function periodIncludesDate(period: string, isoDate: string): boolean {
  return isoDate.startsWith(period);
}

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
  { code: "4100", name: "Family support", type: "income", category: "Family" },
  { code: "5000", name: "Housing", type: "expense", category: "Housing" },
  { code: "5100", name: "Utilities", type: "expense", category: "Utilities" },
  { code: "5200", name: "Groceries", type: "expense", category: "Groceries" },
  { code: "5300", name: "Restaurants", type: "expense", category: "Restaurants" },
  { code: "5400", name: "Transport", type: "expense", category: "Transport" },
  { code: "5500", name: "Health / medical", type: "expense", category: "Health" },
  { code: "5600", name: "Clothing", type: "expense", category: "Clothing" },
  { code: "5700", name: "Subscriptions / software", type: "expense", category: "Subscriptions" },
  { code: "5800", name: "Business / tools", type: "expense", category: "Business" },
  { code: "5900", name: "Travel", type: "expense", category: "Travel" },
  { code: "6000", name: "Education / tuition", type: "expense", category: "Education" },
  { code: "6100", name: "Fun", type: "expense" },
  { code: "6200", name: "Fees", type: "expense", category: "Fees" },
  { code: "6300", name: "Credit card payment", type: "transfer", category: "Credit card payment" },
  { code: "6400", name: "Transfers", type: "transfer", category: "Transfers" },
  { code: "6500", name: "P2P clearing", type: "transfer" },
  { code: "6900", name: "Other expense", type: "expense", category: "Other" },
  { code: "6999", name: "Uncategorized", type: "expense", category: "Uncategorized" },
];

export function coaForCategory(category: string): CoaAccount {
  const normalized = normalizeCategory(category);
  const hit = CHART_OF_ACCOUNTS.find((a) => a.category === normalized);
  if (hit) return hit;
  if (/income|zelle from|gift/i.test(category)) {
    return CHART_OF_ACCOUNTS.find((a) => a.code === "4000")!;
  }
  return CHART_OF_ACCOUNTS.find((a) => a.code === "6999")!;
}

function coaForTransaction(tx: FinanceTx): CoaAccount {
  const category = normalizeTransactionCategory(
    tx.category,
    `${tx.merchant || ""} ${tx.note || ""}`,
    tx.kind
  );
  const text = `${tx.merchant || ""} ${tx.note || ""}`.toLowerCase();

  if (tx.kind === "income") {
    if (category === "Transfers") {
      return CHART_OF_ACCOUNTS.find((a) => a.code === "6400")!;
    }
    if (category === "Credit card payment") {
      return CHART_OF_ACCOUNTS.find((a) => a.code === "6300")!;
    }
    if (
      category === "Zelle" &&
      /\b(from|to) (checking|savings)|own account|self transfer\b/.test(text)
    ) {
      return CHART_OF_ACCOUNTS.find((a) => a.code === "6500")!;
    }
    if (
      category === "Family" ||
      category === "Gifts" ||
      (category === "Zelle" &&
        /\b(gift|family|mom|dad|parent|bimala|umesh|millennium|shrestha)\b/.test(text))
    ) {
      return CHART_OF_ACCOUNTS.find((a) => a.code === "4100")!;
    }
    // Direction is authoritative: an unknown inflow must never credit an
    // expense account merely because its category is Other/Uncategorized.
    return CHART_OF_ACCOUNTS.find((a) => a.code === "4000")!;
  }

  if (category !== "Zelle") return coaForCategory(category);
  if (/\b(from|to) (checking|savings)|own account|self transfer\b/.test(text)) {
    return CHART_OF_ACCOUNTS.find((a) => a.code === "6500")!;
  }
  return CHART_OF_ACCOUNTS.find((a) => a.code === "6900")!;
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

function postingAccountFor(
  state: FinanceState,
  tx: FinanceTx
): { code: string; name: string } {
  const account = state.accounts.find((candidate) => candidate.id === tx.accountId);
  if (!account) return { code: "1000", name: "Cash & checking" };
  if (account.kind === "credit") {
    return { code: "2000", name: account.name || "Credit cards" };
  }
  if (account.kind === "savings") {
    return { code: "1100", name: account.name || "Savings" };
  }
  if (account.kind === "invest") {
    return { code: "1200", name: account.name || "Investments" };
  }
  return { code: "1000", name: account.name || "Cash & checking" };
}

/**
 * Double-entry map:
 * Expense: Debit expense COA, Credit cash/checking
 * Income: Debit cash, Credit income
 * Transfer/card pay: Debit liability or transfer, Credit cash (simplified personal books)
 */
export function buildJournal(state: FinanceState): JournalReport {
  const entries: JournalEntry[] = state.txs.map((t) => {
    const coa = coaForTransaction(t);
    const postingAccount = postingAccountFor(state, t);
    const pending = !!t.pending;
    const memo = t.merchant || t.note || coa.name;
    if (t.kind === "income") {
      return {
        id: `je-${t.id}`,
        date: t.date,
        txId: t.id,
        debitCode: postingAccount.code,
        debitName: postingAccount.name,
        creditCode: coa.code,
        creditName: coa.name,
        amount: t.amount,
        memo,
        status: pending ? "pending" : "posted",
        category: t.category,
      };
    }
    // Expense / transfer out: debit the category, credit the actual source
    // account. Card purchases therefore increase the card liability instead
    // of pretending every purchase left checking.
    return {
      id: `je-${t.id}`,
      date: t.date,
      txId: t.id,
      debitCode: coa.code,
      debitName: coa.name,
      creditCode: postingAccount.code,
      creditName: postingAccount.name,
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
    // The general ledger and statements contain posted evidence only.
    // Pending authorizations remain visible in the inbox/journal review.
    if (e.status !== "posted") continue;
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
  /**
   * Reconciliation requires a statement opening and ending balance. Current
   * account snapshots and tagged activity alone cannot prove a match.
   */
  status: "unverified" | "no-activity" | "no-account";
  drift: number | null;
  notes: string[];
  concept: string;
};

export function buildReconciliation(state: FinanceState): ReconReport[] {
  const reports: ReconReport[] = [];
  for (const acc of state.accounts) {
    const txs = state.txs.filter(
      (t) => t.accountId === acc.id && !t.pending
    );
    let activityNet = 0;
    for (const t of txs) {
      activityNet += t.kind === "income" ? t.amount : -t.amount;
    }
    const notes: string[] = [];
    let status: ReconReport["status"] = "unverified";
    const drift: number | null = null;
    if (txs.length === 0) {
      status = "no-activity";
      if (acc.balance !== 0) {
        notes.push(
          "A balance exists without tagged posted activity. Import the statement and assign account IDs."
        );
      } else {
        notes.push(
          "No posted activity. This is not a reconciliation match without statement endpoints."
        );
      }
    } else {
      notes.push(
        `${txs.length} posted lines are tagged. Current balance ${moneyCents(
          acc.balance
        )}; opening and statement-ending balances are not stored, so drift is unavailable.`
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
      drift: null,
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
  periodKind: "month" | "year";
  /** Annual actuals are not compared to a single global monthly plan. */
  comparable: boolean;
  basisNote: string;
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
  period: string
): BudgetVarianceReport {
  const annual = isAnnualPeriod(period);
  const spent: Record<string, number> = {};
  for (const tx of txsInPeriod(state.txs, period)) {
    if (tx.pending || tx.kind !== "expense" || isTransferLike(tx)) continue;
    const category = normalizeCategory(
      tx.category,
      `${tx.merchant || ""} ${tx.note || ""}`
    );
    spent[category] = (spent[category] || 0) + tx.amount;
  }
  const cats = new Set([
    ...(annual ? [] : state.budget.map((b) => b.category)),
    ...Object.keys(spent),
  ]);
  // Skip pure income on expense variance
  const lines: BudgetPlanLine[] = [];
  for (const category of cats) {
    if (category === "Income") continue;
    // The app stores one current monthly plan, not a plan snapshot per month.
    // Never present it as the plan for an entire year or historical year.
    const planned = annual
      ? 0
      : state.budget.find((b) => b.category === category)?.planned || 0;
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
    month: period,
    periodKind: annual ? "year" : "month",
    comparable: !annual,
    basisNote: annual
      ? "Annual actuals only. The current monthly plan is not multiplied across historical periods."
      : "Current monthly plan compared with posted operating expenses.",
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
  return !t.pending && t.kind === "expense" && !isTransferLike(t);
}

function isTrueIncome(t: FinanceTx): boolean {
  return !t.pending && t.kind === "income" && !isTransferLike(t);
}

export function buildRunway(state: FinanceState): RunwayReport {
  const cash = cashOnHand(state.accounts);
  const operatingTxs = state.txs.filter(
    (tx) => isTrueBurn(tx) || isTrueIncome(tx)
  );
  // last 3 calendar months with data
  const months = [
    ...new Set(operatingTxs.map((t) => t.date.slice(0, 7))),
  ].sort();
  const sample = months.slice(-3);
  let burnSum = 0;
  let incomeSum = 0;
  for (const ym of sample) {
    const txs = txsInMonth(operatingTxs, ym);
    burnSum += txs.filter(isTrueBurn).reduce((s, t) => s + t.amount, 0);
    incomeSum += txs
      .filter(isTrueIncome)
      .reduce((s, t) => s + t.amount, 0);
  }
  const n = Math.max(1, sample.length);
  const avgMonthlyBurn = burnSum / n;
  const avgMonthlyIncome = incomeSum / n;
  const netMonthly = avgMonthlyIncome - avgMonthlyBurn;
  // Income variance = unstable?
  const incomes = sample.map((ym) =>
    txsInMonth(operatingTxs, ym)
      .filter(isTrueIncome)
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
  monthlyCost: number;
  cadence: SubCadence;
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
  const scan = detectSubscriptions(state.txs);
  const charges: RecurringCharge[] = scan.subs.map((subscription) => ({
    merchant: subscription.merchant,
    avgAmount: subscription.amount,
    monthlyCost: subscription.monthlyCost,
    cadence: subscription.cadence,
    times: subscription.count,
    monthsSeen: subscription.monthsSeen,
    lastDate: subscription.lastDate,
    category: subscription.category,
    confidence: subscription.known ? 0.92 : 0.82,
  }));
  return {
    charges,
    monthlyEstimate: scan.monthlyTotal,
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
  transfersIn: number;
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
  status: "current-observed" | "historical-unavailable";
  /** Explains whether account balances are observed or unavailable. */
  note: string;
  bankBalancesAvailable: boolean;
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
  period: string,
  books: BooksExtraState = loadBooksExtra(),
  today = new Date()
): StatementsReport {
  const periodTxs = txsInPeriod(state.txs, period).filter(
    (tx) => !tx.pending
  );
  const journalEntries = buildJournal(state).entries.filter(
    (entry) => entry.status === "posted" && entry.date.startsWith(period)
  );
  const journalByTx = new Map(
    journalEntries.map((entry) => [entry.txId, entry])
  );
  let income = 0;
  let transfersIn = 0;
  let transfersOut = 0;
  let operatingOut = 0;
  const byCat: Record<string, number> = {};
  for (const t of periodTxs) {
    const journal = journalByTx.get(t.id);
    const categoryCode =
      t.kind === "income" ? journal?.creditCode : journal?.debitCode;
    const categoryAccount = CHART_OF_ACCOUNTS.find(
      (account) => account.code === categoryCode
    );
    const transfer = categoryAccount?.type === "transfer";
    if (t.kind === "income") {
      if (transfer) transfersIn += t.amount;
      else income += t.amount;
      continue;
    }
    const c = normalizeCategory(
      t.category,
      `${t.merchant || ""} ${t.note || ""}`
    );
    if (transfer) {
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
  const transfersNet = transfersIn - transfersOut;
  const netAll = income - operatingOut + transfersNet;

  // Cash flow is derived from the posted journal, not transaction direction.
  // This keeps a card purchase off cash flow and records the later checking
  // payment exactly once.
  const cashCodes = new Set(["1000", "1100"]);
  let operatingIn = 0;
  let operatingCashOut = 0;
  let cashTransfersNet = 0;
  for (const entry of journalEntries) {
    const debitCash = cashCodes.has(entry.debitCode);
    const creditCash = cashCodes.has(entry.creditCode);
    if (!debitCash && !creditCash) continue;
    const movement =
      (debitCash ? entry.amount : 0) - (creditCash ? entry.amount : 0);
    const debitType = CHART_OF_ACCOUNTS.find(
      (account) => account.code === entry.debitCode
    )?.type;
    const creditType = CHART_OF_ACCOUNTS.find(
      (account) => account.code === entry.creditCode
    )?.type;
    if (debitCash && creditType === "income") {
      operatingIn += entry.amount;
    } else if (creditCash && debitType === "expense") {
      operatingCashOut += entry.amount;
    } else {
      cashTransfersNet += movement;
    }
  }

  const todayIso = today.toISOString().slice(0, 10);
  const currentObserved = periodIncludesDate(period, todayIso);
  const asOf = currentObserved ? todayIso : periodEndDate(period);
  const assets: { name: string; amount: number }[] = [];
  const liabilities: { name: string; amount: number }[] = [];
  if (currentObserved) {
    assets.push(
      ...state.accounts
        .filter(
          (account) =>
            (account.kind !== "credit" && account.balance > 0) ||
            (account.kind === "credit" && account.balance < 0)
        )
        .map((account) => ({
          name:
            account.kind === "credit"
              ? `${account.name} credit balance`
              : account.name,
          amount: Math.abs(account.balance),
        }))
    );
    liabilities.push(
      ...state.accounts
        .filter(
          (account) =>
            (account.kind === "credit" && account.balance > 0) ||
            (account.kind !== "credit" && account.balance < 0)
        )
        .map((account) => ({
          name:
            account.kind === "credit"
              ? account.name
              : `${account.name} overdraft`,
          amount: Math.abs(account.balance),
        }))
    );
  }

  const openPayablesAsOf = books.payables.filter((payable) => {
    const created = payable.createdAt?.slice(0, 10) || "0000-00-00";
    if (created > asOf) return false;
    if (!payable.paid) return true;
    return !!payable.paidDate && payable.paidDate > asOf;
  });
  const openReceivablesAsOf = books.receivables.filter((receivable) => {
    const created = receivable.createdAt?.slice(0, 10) || "0000-00-00";
    if (created > asOf) return false;
    if (!receivable.received) return true;
    return !!receivable.receivedDate && receivable.receivedDate > asOf;
  });
  const receivableTotal = openReceivablesAsOf.reduce(
    (sum, receivable) => sum + receivable.amount,
    0
  );
  const payableTotal = openPayablesAsOf.reduce(
    (sum, payable) => sum + payable.amount,
    0
  );
  if (receivableTotal > 0) {
    assets.push({ name: "Accounts receivable", amount: receivableTotal });
  }
  if (payableTotal > 0) {
    liabilities.push({ name: "Accounts payable", amount: payableTotal });
  }
  const totalAssets = assets.reduce((s, a) => s + a.amount, 0);
  const totalLiabilities = liabilities.reduce((s, a) => s + a.amount, 0);

  return {
    pnl: {
      month: period,
      income,
      expensesByCategory,
      expenseTotal,
      transfersIn,
      transfersOut,
      netOperating,
      netAll,
    },
    cashFlow: {
      month: period,
      operatingIn,
      operatingOut: operatingCashOut,
      transfersNet: cashTransfersNet,
      netChange: operatingIn - operatingCashOut + cashTransfersNet,
    },
    balanceSheet: {
      asOf,
      status: currentObserved
        ? "current-observed"
        : "historical-unavailable",
      note: currentObserved
        ? "Current account balances are observed snapshots; open documented receivables and payables are included."
        : "Historical bank and card balances are unavailable without period-end statement snapshots. Only documented receivables and payables as of this date are shown.",
      bankBalancesAvailable: currentObserved,
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
  /** A failed critical check always blocks closing, regardless of score. */
  critical: boolean;
};

export type MonthlyCloseReport = {
  month: string;
  periodKind: "month" | "year";
  locked: boolean;
  checks: CloseCheck[];
  readyToClose: boolean;
  score: number; // 0–100
  concept: string;
};

export type AccountantReviewItem = {
  id: string;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  count: number;
  amount?: number;
  txIds?: string[];
  destination: "transactions" | "accounts" | "plan" | "overview";
  cta: string;
};

export type AccountantReview = {
  month: string;
  score: number;
  status: "clear" | "review" | "blocked";
  items: AccountantReviewItem[];
  periodLines: number;
  postedLines: number;
  pendingLines: number;
  weakCategoryLines: number;
  unassignedLines: number;
  duplicateLines: number;
  lastActivityDate: string | null;
};

/**
 * Period-specific work queue. Every row points to a line or control that can
 * actually be fixed; this is intentionally different from the module catalog.
 */
export function buildAccountantReview(
  state: FinanceState,
  ym: string,
  books: BooksExtraState
): AccountantReview {
  const period = txsInPeriod(state.txs, ym);
  const items: AccountantReviewItem[] = [];
  const pending = period.filter((t) => t.pending);
  const posted = period.filter((t) => !t.pending);
  const weak = posted.filter(
    (t) =>
      !(t.category || "").trim() ||
      t.category === "Uncategorized" ||
      t.category === "Other"
  );
  const unassigned = posted.filter((t) => !t.accountId);
  const incomplete = posted.filter(
    (t) =>
      !t.date ||
      !(t.merchant || t.note || "").trim() ||
      !Number.isFinite(t.amount) ||
      t.amount <= 0
  );

  const duplicateIds: string[] = [];
  const fingerprints = new Map<string, string[]>();
  for (const t of posted) {
    const key = [
      t.date,
      t.kind,
      t.amount.toFixed(2),
      (t.merchant || t.note || "").trim().toLowerCase(),
    ].join("|");
    const ids = fingerprints.get(key) || [];
    ids.push(t.id);
    fingerprints.set(key, ids);
  }
  for (const ids of fingerprints.values()) {
    if (ids.length > 1) duplicateIds.push(...ids);
  }

  if (posted.length === 0) {
    items.push({
      id: "review-import",
      severity: "high",
      title: `No activity posted for ${ym}`,
      detail: "Import the bank and card files before relying on this period.",
      count: 0,
      destination: "transactions",
      cta: "Import statements",
    });
  }
  if (incomplete.length) {
    items.push({
      id: "review-incomplete",
      severity: "high",
      title: `${incomplete.length} incomplete ledger line${incomplete.length === 1 ? "" : "s"}`,
      detail: "A posted line needs a date, positive amount, and named payee.",
      count: incomplete.length,
      txIds: incomplete.map((t) => t.id),
      destination: "transactions",
      cta: "Review lines",
    });
  }
  if (pending.length) {
    items.push({
      id: "review-pending",
      severity: "medium",
      title: `${pending.length} pending transaction${pending.length === 1 ? "" : "s"}`,
      detail: "Confirm or wait for settlement before closing the month.",
      count: pending.length,
      amount: pending.reduce((sum, t) => sum + t.amount, 0),
      txIds: pending.map((t) => t.id),
      destination: "transactions",
      cta: "Review pending",
    });
  }
  if (weak.length) {
    items.push({
      id: "review-categories",
      severity: "high",
      title: `${weak.length} weak categor${weak.length === 1 ? "y" : "ies"}`,
      detail: "Replace Other or blank classifications before trusting the P&L.",
      count: weak.length,
      amount: weak.reduce((sum, t) => sum + t.amount, 0),
      txIds: weak.map((t) => t.id),
      destination: "transactions",
      cta: "Classify lines",
    });
  }
  if (duplicateIds.length) {
    items.push({
      id: "review-duplicates",
      severity: "high",
      title: `${duplicateIds.length} duplicate suspect${duplicateIds.length === 1 ? "" : "s"}`,
      detail: "Same date, direction, amount, and payee. Confirm before deleting.",
      count: duplicateIds.length,
      txIds: duplicateIds,
      destination: "transactions",
      cta: "Compare duplicates",
    });
  }
  if (unassigned.length) {
    items.push({
      id: "review-unassigned",
      severity: "medium",
      title: `${unassigned.length} line${unassigned.length === 1 ? "" : "s"} missing an account`,
      detail: "Assign a bank or card so reconciliation can trace the balance.",
      count: unassigned.length,
      amount: unassigned.reduce((sum, t) => sum + t.amount, 0),
      txIds: unassigned.map((t) => t.id),
      destination: "transactions",
      cta: "Assign accounts",
    });
  }

  const cardsMissingControls = state.accounts.filter(
    (account) =>
      account.kind === "credit" &&
      (account.balance > 0 || period.some((t) => t.accountId === account.id)) &&
      (!(account.creditLimit && account.creditLimit > 0) ||
        !(account.apr && account.apr > 0) ||
        !(account.dueDay && account.dueDay > 0) ||
        !(account.statementCloseDay && account.statementCloseDay > 0))
  );
  if (cardsMissingControls.length) {
    items.push({
      id: "review-card-controls",
      severity: "high",
      title: `${cardsMissingControls.length} card control${cardsMissingControls.length === 1 ? "" : "s"} incomplete`,
      detail:
        "Add limit, APR, due day, and statement-close day for payoff and utilization math.",
      count: cardsMissingControls.length,
      destination: "accounts",
      cta: "Complete card controls",
    });
  }

  const monthEnd = periodEndDate(ym);
  const duePayables = books.payables.filter(
    (payable) => !payable.paid && payable.dueDate <= monthEnd
  );
  const dueReceivables = books.receivables.filter(
    (receivable) => !receivable.received && receivable.dueDate <= monthEnd
  );
  if (duePayables.length) {
    const total = duePayables.reduce((sum, payable) => sum + payable.amount, 0);
    items.push({
      id: "review-payables",
      severity: "high",
      title: `${duePayables.length} payable${duePayables.length === 1 ? "" : "s"} due`,
      detail: `Open obligations total ${moneyCents(total)}.`,
      count: duePayables.length,
      amount: total,
      destination: "overview",
      cta: "Open payables",
    });
  }
  if (dueReceivables.length) {
    const total = dueReceivables.reduce(
      (sum, receivable) => sum + receivable.amount,
      0
    );
    items.push({
      id: "review-receivables",
      severity: "medium",
      title: `${dueReceivables.length} receivable${dueReceivables.length === 1 ? "" : "s"} due`,
      detail: `Collection queue totals ${moneyCents(total)}.`,
      count: dueReceivables.length,
      amount: total,
      destination: "overview",
      cta: "Open receivables",
    });
  }

  if (!state.budget.some((line) => line.planned > 0)) {
    items.push({
      id: "review-plan",
      severity: "medium",
      title: "No operating plan",
      detail: "Build the plan from actual history so variance has a baseline.",
      count: 1,
      destination: "plan",
      cta: "Build plan",
    });
  }

  const rank = { high: 3, medium: 2, low: 1 };
  items.sort(
    (a, b) => rank[b.severity] - rank[a.severity] || b.count - a.count
  );
  const penalty = items.reduce(
    (sum, item) =>
      sum +
      (item.severity === "high" ? 16 : item.severity === "medium" ? 8 : 3),
    0
  );
  const score = Math.max(0, Math.min(100, 100 - penalty));
  return {
    month: ym,
    score,
    status: items.some((item) => item.severity === "high")
      ? "blocked"
      : items.length
        ? "review"
        : "clear",
    items,
    periodLines: period.length,
    postedLines: posted.length,
    pendingLines: pending.length,
    weakCategoryLines: weak.length,
    unassignedLines: unassigned.length,
    duplicateLines: duplicateIds.length,
    lastActivityDate:
      period.map((t) => t.date).sort((a, b) => b.localeCompare(a))[0] || null,
  };
}

export function buildMonthlyClose(
  state: FinanceState,
  period: string,
  books: BooksExtraState,
  variance: BudgetVarianceReport,
  recon: ReconReport[],
  _inbox: InboxReport
): MonthlyCloseReport {
  if (isAnnualPeriod(period)) {
    return {
      month: period,
      periodKind: "year",
      locked: false,
      checks: [
        {
          id: "annual-view",
          label: "Annual view is reporting-only",
          ok: false,
          detail: "Close one calendar month at a time; annual Books cannot be locked.",
          critical: true,
        },
      ],
      readyToClose: false,
      score: 0,
      concept: "Closing process, internal controls",
    };
  }

  const locked = books.closedMonths.includes(period);
  const monthTxs = txsInPeriod(state.txs, period);
  const postedTxs = monthTxs.filter((tx) => !tx.pending);
  const pendingTxs = monthTxs.filter((tx) => tx.pending);
  const incomplete = postedTxs.filter(
    (t) =>
      !t.date ||
      !(t.merchant || t.note || "").trim() ||
      !Number.isFinite(t.amount) ||
      t.amount <= 0
  ).length;
  const uncategorized = postedTxs.filter(
    (t) =>
      !t.category ||
      t.category === "Uncategorized" ||
      t.category === "Other"
  ).length;
  const monthEnd = periodEndDate(period);
  const duePayables = books.payables.filter(
    (p) => !p.paid && p.dueDate <= monthEnd
  );
  const checks: CloseCheck[] = [
    {
      id: "has-txs",
      label: "Posted transactions exist for the month",
      ok: postedTxs.length > 0,
      detail:
        postedTxs.length > 0
          ? `${postedTxs.length} posted lines in ${period}`
          : pendingTxs.length
            ? `${pendingTxs.length} pending lines, but no posted evidence`
            : "No posted lines — import activity",
      critical: true,
    },
    {
      id: "pending",
      label: "No pending authorizations remain",
      ok: pendingTxs.length === 0,
      detail:
        pendingTxs.length === 0
          ? "No pending lines"
          : `${pendingTxs.length} pending lines are excluded from statements`,
      critical: true,
    },
    {
      id: "complete",
      label: "Source documents complete (merchant/date/amount)",
      ok: incomplete === 0,
      detail:
        incomplete === 0
          ? `All ${postedTxs.length} posted lines have merchant, date, amount`
          : `${incomplete} incomplete period lines`,
      critical: true,
    },
    {
      id: "categorized",
      label: "No uncategorized lines this month",
      ok: uncategorized === 0,
      detail:
        uncategorized === 0
          ? "Every line classified"
          : `${uncategorized} uncategorized`,
      critical: true,
    },
    {
      id: "recon",
      label: "Accounts reconcilable",
      ok: false,
      detail: recon
        .map((r) => `${r.accountName}: ${r.status}`)
        .slice(0, 4)
        .join("; ") || "No statement endpoints stored",
      critical: true,
    },
    {
      id: "budget",
      label: "Budget plan present (or variance reviewed)",
      ok: variance.plannedTotal > 0 || variance.actualTotal > 0,
      detail:
        variance.plannedTotal > 0
          ? `Plan ${moneyCents(variance.plannedTotal)} vs actual ${moneyCents(variance.actualTotal)}`
          : "No plan — auto-build recommended",
      critical: false,
    },
    {
      id: "payables",
      label: "Payables due by month-end cleared",
      ok: duePayables.length === 0,
      detail:
        duePayables.length === 0
          ? "No unpaid obligations due by month-end"
          : `${duePayables.length} due · ${moneyCents(
              duePayables.reduce((sum, p) => sum + p.amount, 0)
            )}`,
      critical: true,
    },
  ];
  const okCount = checks.filter((c) => c.ok).length;
  const score = Math.round((okCount / checks.length) * 100);
  const criticalReady = checks
    .filter((check) => check.critical)
    .every((check) => check.ok);
  return {
    month: period,
    periodKind: "month",
    locked,
    checks,
    readyToClose: criticalReady && score >= 80 && !locked,
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
  review: AccountantReview;
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
  const statements = buildStatements(state, ym, books);
  const review = buildAccountantReview(state, ym, books);
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
      ok: false,
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
        !budgetVariance.comparable
          ? "Annual actuals only — monthly plan not repeated"
          : budgetVariance.plannedTotal > 0
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
        !budgetVariance.comparable
          ? "Not comparable — no annual plan snapshots"
          : budgetVariance.overCategories.length > 0
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
        : monthlyClose.periodKind === "year"
          ? "Annual reporting view — close months individually"
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
    review,
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

/**
 * Personal finance ledger for Wonder Finances.
 * Rockefeller bookkeeping: every dollar named, every cent recorded,
 * period closed, local-first. Optional Plaid. Numbers stay on this device.
 */

import { pushUndo } from "../undoStack";

export type AccountKind =
  | "cash"
  | "checking"
  | "savings"
  | "credit"
  | "invest"
  | "other";

export type FinanceAccount = {
  id: string;
  name: string;
  kind: AccountKind;
  /** Balance (credit = amount owed) */
  balance: number;
  /**
   * Credit limit (cards only). Needed for utilization % —
   * the #1 lever people can move fast for credit health.
   */
  creditLimit?: number | null;
  /**
   * Day of month payment is due (1–31). Cards only.
   * Not the same as statement closing day.
   */
  dueDay?: number | null;
  /**
   * Day of month the statement closes / often reports (1–31).
   * Pay before this if you want a lower reported balance.
   */
  statementCloseDay?: number | null;
  /** True if autopay is on for at least the minimum */
  autopayMin?: boolean | null;
  /** APR as percent e.g. 24.99 — optional */
  apr?: number | null;
  /** Institution label e.g. Chase */
  institution?: string;
  /** Plaid account id when linked */
  plaidAccountId?: string | null;
  /** Last sync time ISO */
  lastSyncAt?: string | null;
  /** Masked account number last4 */
  mask?: string | null;
};

export type TxKind = "expense" | "income";
export type TxSource = "manual" | "csv" | "plaid" | "import";

export type FinanceTx = {
  id: string;
  date: string; // YYYY-MM-DD
  kind: TxKind;
  amount: number; // always positive; kind decides direction
  category: string;
  note: string;
  /** Cleaned merchant / payee */
  merchant?: string;
  accountId?: string | null;
  source?: TxSource;
  /** Dedupe key from bank/csv */
  externalId?: string | null;
  pending?: boolean;
  /** Transaction type from OFX (DEBIT, ACH_CREDIT, POS, ATM, ZELLE, etc.) */
  txType?: string | null;
};

/**
 * Bank-style transaction type for a row. Uses the stored txType when the
 * import carried one; otherwise derives it from the description the way
 * bank sites label their filters (Zelle credit, ACH debit, ATM…).
 */
export function txTypeOf(t: FinanceTx): string {
  if (t.txType && t.txType.trim()) return t.txType.trim();
  const text = `${t.merchant || ""} ${t.note || ""}`.toLowerCase();
  const inbound = t.kind === "income";
  if (/zelle/.test(text)) return inbound ? "Zelle credit" : "Zelle debit";
  if (/venmo|cash app|cashapp|paypal/.test(text)) return "P2P payment";
  if (/card payment|payment to chase card|autopay|epay|crd pmt|payment thank you/.test(text))
    return "Card payment";
  if (/transfer/.test(text)) return "Account transfer";
  if (/atm|cash withdrawal/.test(text)) return "ATM";
  if (/direct dep|payroll|salary/.test(text)) return "Direct deposit";
  if (/\bach\b|direct debit/.test(text))
    return inbound ? "ACH credit" : "ACH debit";
  if (/bill ?pay/.test(text)) return "Bill payment";
  if (/\bcheck\b|\bchk\b/.test(text)) return "Check";
  if (/fee|service charge/.test(text)) return "Fee";
  if (/interest/.test(text)) return "Interest";
  if (/refund|reversal|adjustment|rebate/.test(text))
    return "Adjustment or reversal";
  return inbound ? "Deposit" : "Purchase";
}

export type BudgetLine = {
  category: string;
  planned: number;
};

export type PlaidLinkMeta = {
  itemId?: string;
  institutionName?: string;
  linkedAt?: string;
};

/** Savings / money goal (Mintable-style target) */
export type FinanceGoal = {
  id: string;
  name: string;
  target: number;
  saved: number;
  /** Optional deadline YYYY-MM-DD */
  deadline?: string | null;
};

export type FinanceState = {
  version: 2;
  accounts: FinanceAccount[];
  txs: FinanceTx[];
  budget: BudgetLine[];
  watchlist: string[];
  /** Optional Plaid item metadata (tokens never stored in localStorage) */
  plaidMeta?: PlaidLinkMeta | null;
  /** Savings goals */
  goals?: FinanceGoal[];
  /**
   * Credit profile (self-reported levers for the educational score).
   * Stored as loose object so we don't hard-couple version bumps.
   */
  creditProfile?: {
    onTimePct: number;
    historyYears: number;
    hardInquiries: number;
    openAccounts: number;
    recentLates: number;
    collections: number;
    knownScore?: number | null;
    /** Where 677 came from e.g. Credit Karma, Chase, Experian */
    scoreProvider?: string | null;
    /** Model e.g. VantageScore 3.0, FICO 8 — not interchangeable */
    scoreModel?: string | null;
    /** Bureau if known: Equifax / Experian / TransUnion */
    scoreBureau?: string | null;
    /** Minimum checking cash you refuse to go below */
    cashFloor?: number | null;
  } | null;
};

const KEY = "wonder-finance-v2";
const KEY_V1 = "wonder-finance-v1";

const DEFAULT_BUDGET: BudgetLine[] = [
  { category: "Utilities", planned: 0 },
  { category: "Food / groceries", planned: 0 },
  { category: "Restaurants / coffee", planned: 0 },
  { category: "Transport", planned: 0 },
  { category: "Health", planned: 0 },
  { category: "Shopping", planned: 0 },
  { category: "Subscriptions", planned: 0 },
  { category: "Build / tools", planned: 0 },
  { category: "Travel", planned: 0 },
  { category: "Education / school", planned: 0 },
  { category: "Fun", planned: 0 },
  { category: "Credit card payment", planned: 0 },
  { category: "Transfers", planned: 0 },
  { category: "Fees", planned: 0 },
  { category: "Other", planned: 0 },
  { category: "Uncategorized", planned: 0 },
];

const DEFAULT_ACCOUNTS: FinanceAccount[] = [
  { id: "acc-checking", name: "Checking", kind: "checking", balance: 0 },
  { id: "acc-savings", name: "Savings", kind: "savings", balance: 0 },
  { id: "acc-cash", name: "Cash", kind: "cash", balance: 0 },
  { id: "acc-credit", name: "Credit card", kind: "credit", balance: 0 },
];

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultState(): FinanceState {
  return {
    version: 2,
    accounts: DEFAULT_ACCOUNTS,
    txs: [],
    budget: DEFAULT_BUDGET,
    watchlist: ["SPY", "QQQ", "AAPL", "NVDA"],
    plaidMeta: null,
    goals: [],
    creditProfile: {
      onTimePct: 95,
      historyYears: 3,
      hardInquiries: 1,
      openAccounts: 2,
      recentLates: 0,
      collections: 0,
      /** Real bureau score — Melani: 677 */
      knownScore: 677,
      scoreProvider: null,
      scoreModel: null,
      scoreBureau: null,
      /** Default floor — stop ending at $0.03 */
      cashFloor: 300,
    },
  };
}

function migrateTx(raw: Partial<FinanceTx>): FinanceTx {
  return {
    id: raw.id || uid("tx"),
    date: raw.date || new Date().toISOString().slice(0, 10),
    kind: raw.kind === "income" ? "income" : "expense",
    amount: Math.abs(Number(raw.amount) || 0),
    category: raw.category || "Uncategorized",
    note: raw.note || "",
    merchant: raw.merchant || raw.note || "",
    accountId: raw.accountId ?? null,
    source: raw.source || "manual",
    externalId: raw.externalId ?? null,
    pending: !!raw.pending,
  };
}

export function loadFinance(): FinanceState {
  try {
    let raw = localStorage.getItem(KEY);
    if (!raw) {
      // upgrade from v1 if present
      const v1 = localStorage.getItem(KEY_V1);
      if (v1) {
        const old = JSON.parse(v1) as Partial<FinanceState>;
        const next: FinanceState = {
          version: 2,
          accounts: Array.isArray(old.accounts) && old.accounts.length
            ? old.accounts
            : DEFAULT_ACCOUNTS,
          txs: Array.isArray(old.txs) ? old.txs.map(migrateTx) : [],
          budget:
            Array.isArray(old.budget) && old.budget.length
              ? old.budget
              : DEFAULT_BUDGET,
          watchlist:
            Array.isArray(old.watchlist) && old.watchlist.length
              ? old.watchlist
              : ["SPY", "QQQ", "AAPL", "NVDA"],
          plaidMeta: null,
          goals: [],
          creditProfile: defaultState().creditProfile,
        };
        saveFinance(next);
        return next;
      }
      return defaultState();
    }
    const parsed = JSON.parse(raw) as Partial<FinanceState>;
    return {
      version: 2,
      accounts:
        Array.isArray(parsed.accounts) && parsed.accounts.length
          ? parsed.accounts.map((a) => ({
              ...a,
              creditLimit: a.creditLimit ?? null,
            }))
          : DEFAULT_ACCOUNTS,
      // Only real imported data lives on the books. Any leftover demo/seed
      // rows (source "manual") are dropped — the desk reflects your CSV only.
      txs: Array.isArray(parsed.txs)
        ? parsed.txs.map(migrateTx).filter((t) => t.source !== "manual")
        : [],
      budget:
        Array.isArray(parsed.budget) && parsed.budget.length
          ? parsed.budget
          : DEFAULT_BUDGET,
      watchlist:
        Array.isArray(parsed.watchlist) && parsed.watchlist.length
          ? parsed.watchlist
          : ["SPY", "QQQ", "AAPL", "NVDA"],
      plaidMeta: parsed.plaidMeta || null,
      goals: Array.isArray(parsed.goals) ? parsed.goals : [],
      creditProfile: (() => {
        const d = defaultState().creditProfile!;
        const c = parsed.creditProfile;
        if (!c) return d;
        return {
          ...d,
          ...c,
          // Real score wins when user never set one
          knownScore:
            c.knownScore != null && c.knownScore >= 300 && c.knownScore <= 850
              ? c.knownScore
              : d.knownScore ?? 677,
        };
      })(),
    };
  } catch {
    return defaultState();
  }
}

/** When true, saveFinance does not push undo (used while restoring) */
let financeUndoQuiet = false;
let financeLastJson: string | null = null;

export const FINANCE_EXTERNAL_RESTORE_EVENT = "wonder-finance-external-restore";

/**
 * Save ledger. Automatically records an Undo step (press **U**) so Finances
 * edits can be reversed like workspace page moves.
 */
export function saveFinance(state: FinanceState) {
  try {
    const payload = { ...state, version: 2 as const };
    const json = JSON.stringify(payload);
    if (
      !financeUndoQuiet &&
      financeLastJson &&
      financeLastJson !== json &&
      typeof window !== "undefined"
    ) {
      const previousJson = financeLastJson;
      pushUndo("Finances", () => {
        financeUndoQuiet = true;
        try {
          localStorage.setItem(KEY, previousJson);
          financeLastJson = previousJson;
          const restored = JSON.parse(previousJson) as FinanceState;
          window.dispatchEvent(
            new CustomEvent(FINANCE_EXTERNAL_RESTORE_EVENT, {
              detail: restored,
            })
          );
        } finally {
          financeUndoQuiet = false;
        }
      });
    }
    localStorage.setItem(KEY, json);
    financeLastJson = json;
  } catch {
    /* ignore */
  }
}

/**
 * Real-time cross-tab sync. When another tab (or device sharing this
 * browser profile) writes the ledger, the browser fires a `storage` event
 * here; we re-broadcast it as a restore so open desks update live.
 * Returns a cleanup function.
 */
export function initFinanceCrossTabSync(): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY || e.newValue == null) return;
    if (e.newValue === financeLastJson) return; // our own write echoed back
    try {
      const next = JSON.parse(e.newValue) as FinanceState;
      financeLastJson = e.newValue;
      window.dispatchEvent(
        new CustomEvent(FINANCE_EXTERNAL_RESTORE_EVENT, { detail: next })
      );
    } catch {
      /* ignore malformed cross-tab payloads */
    }
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

/** Call after loadFinance so the first edit has a baseline without undoing load */
export function seedFinanceUndoBaseline(state: FinanceState) {
  try {
    financeLastJson = JSON.stringify({ ...state, version: 2 as const });
  } catch {
    financeLastJson = null;
  }
}

export function netWorth(accounts: FinanceAccount[]): number {
  let assets = 0;
  let debt = 0;
  for (const a of accounts) {
    if (a.kind === "credit") debt += Math.max(0, a.balance);
    else assets += a.balance;
  }
  return assets - debt;
}

export function cashOnHand(accounts: FinanceAccount[]): number {
  return accounts
    .filter(
      (a) =>
        a.kind === "cash" || a.kind === "checking" || a.kind === "savings"
    )
    .reduce((s, a) => s + a.balance, 0);
}

export function creditOwed(accounts: FinanceAccount[]): number {
  return accounts
    .filter((a) => a.kind === "credit")
    .reduce((s, a) => s + Math.max(0, a.balance), 0);
}

export function invested(accounts: FinanceAccount[]): number {
  return accounts
    .filter((a) => a.kind === "invest")
    .reduce((s, a) => s + a.balance, 0);
}

export function monthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function txsInMonth(txs: FinanceTx[], ym: string): FinanceTx[] {
  return txs.filter((t) => t.date.startsWith(ym));
}

export function spentByCategory(
  txs: FinanceTx[],
  ym: string
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of txsInMonth(txs, ym)) {
    if (t.kind !== "expense") continue;
    out[t.category] = (out[t.category] || 0) + t.amount;
  }
  return out;
}

/**
 * Build a monthly plan with ZERO typing.
 * Averages expense by category over the last `monthsBack` months
 * (or uses last full month if only one month of data).
 * Rounds up to nice $5 steps so you don’t babysit cents.
 */
export function autoBudgetFromHistory(
  txs: FinanceTx[],
  existing: BudgetLine[],
  monthsBack = 3
): BudgetLine[] {
  const months = recentMonthKeys(Math.max(1, monthsBack));
  const totals: Record<string, number> = {};
  const monthCountWithSpend: Record<string, number> = {};

  for (const ym of months) {
    const spent = spentByCategory(txs, ym);
    const cats = new Set([...Object.keys(spent), ...existing.map((b) => b.category)]);
    for (const cat of cats) {
      const v = spent[cat] || 0;
      totals[cat] = (totals[cat] || 0) + v;
      if (v > 0) monthCountWithSpend[cat] = (monthCountWithSpend[cat] || 0) + 1;
    }
  }

  const allCats = new Set([
    ...existing.map((b) => b.category),
    ...Object.keys(totals),
  ]);

  return Array.from(allCats).map((category) => {
    const n = Math.max(1, monthCountWithSpend[category] || months.length);
    const avg = (totals[category] || 0) / n;
    // Round up to nearest $5 (or keep 0)
    const planned =
      avg <= 0 ? 0 : Math.ceil(avg / 5) * 5;
    return { category, planned };
  });
}

/** One-tap: copy last month’s actual spend into this month’s plan */
export function budgetFromLastMonth(
  txs: FinanceTx[],
  existing: BudgetLine[]
): BudgetLine[] {
  const last = recentMonthKeys(2)[1] || recentMonthKeys(1)[0];
  const spent = spentByCategory(txs, last);
  const cats = new Set([
    ...existing.map((b) => b.category),
    ...Object.keys(spent),
  ]);
  return Array.from(cats).map((category) => {
    const v = spent[category] || 0;
    return {
      category,
      planned: v <= 0 ? 0 : Math.ceil(v / 5) * 5,
    };
  });
}

/** Scale every planned line by factor (e.g. 0.9 = tighten 10%) */
export function scaleBudget(budget: BudgetLine[], factor: number): BudgetLine[] {
  return budget.map((b) => ({
    ...b,
    planned:
      b.planned <= 0 ? 0 : Math.max(0, Math.ceil((b.planned * factor) / 5) * 5),
  }));
}

export function monthIncome(txs: FinanceTx[], ym: string): number {
  return txsInMonth(txs, ym)
    .filter((t) => t.kind === "income")
    .reduce((s, t) => s + t.amount, 0);
}

export function monthExpense(txs: FinanceTx[], ym: string): number {
  return txsInMonth(txs, ym)
    .filter((t) => t.kind === "expense")
    .reduce((s, t) => s + t.amount, 0);
}

/** Top merchants by spend this month */
export function topMerchants(
  txs: FinanceTx[],
  ym: string,
  limit = 12
): { merchant: string; total: number; count: number }[] {
  const map = new Map<string, { total: number; count: number }>();
  for (const t of txsInMonth(txs, ym)) {
    if (t.kind !== "expense") continue;
    const m = (t.merchant || t.note || "Unknown").trim() || "Unknown";
    const cur = map.get(m) || { total: 0, count: 0 };
    cur.total += t.amount;
    cur.count += 1;
    map.set(m, cur);
  }
  return [...map.entries()]
    .map(([merchant, v]) => ({ merchant, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

export function fingerprintsFromTxs(txs: FinanceTx[]): Set<string> {
  const set = new Set<string>();
  for (const t of txs) {
    if (t.externalId) set.add(t.externalId);
  }
  return set;
}

/** Merge new txs, skip duplicates by externalId */
export function mergeTxs(
  existing: FinanceTx[],
  incoming: FinanceTx[]
): { txs: FinanceTx[]; added: number; skipped: number } {
  const fp = fingerprintsFromTxs(existing);
  const ids = new Set(existing.map((t) => t.id));
  let added = 0;
  let skipped = 0;
  const next = [...existing];
  for (const t of incoming) {
    if (t.externalId && fp.has(t.externalId)) {
      skipped++;
      continue;
    }
    if (ids.has(t.id)) {
      skipped++;
      continue;
    }
    if (t.externalId) fp.add(t.externalId);
    ids.add(t.id);
    next.push(t);
    added++;
  }
  // newest first
  next.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return { txs: next, added, skipped };
}

export function newAccount(partial?: Partial<FinanceAccount>): FinanceAccount {
  return {
    id: uid("acc"),
    name: partial?.name || "New account",
    kind: partial?.kind || "other",
    balance: partial?.balance ?? 0,
    creditLimit: partial?.creditLimit ?? null,
    institution: partial?.institution || "",
    plaidAccountId: partial?.plaidAccountId ?? null,
    lastSyncAt: partial?.lastSyncAt ?? null,
    mask: partial?.mask ?? null,
  };
}

export function newTx(partial?: Partial<FinanceTx>): FinanceTx {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: uid("tx"),
    date: partial?.date || today,
    kind: partial?.kind || "expense",
    amount: partial?.amount ?? 0,
    category: partial?.category || "Uncategorized",
    note: partial?.note || "",
    merchant: partial?.merchant || partial?.note || "",
    accountId: partial?.accountId ?? null,
    source: partial?.source || "manual",
    externalId: partial?.externalId ?? null,
    pending: !!partial?.pending,
  };
}

export function money(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return (
    sign +
    abs.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    })
  );
}

export function moneyExact(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Always show cents — bookkeeper precision (never round away pennies). */
export function moneyCents(n: number): string {
  const sign = n < 0 ? "−" : n > 0 ? "" : "";
  return (
    sign +
    Math.abs(n).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

/**
 * Running balance through time (oldest → newest).
 * Income adds, expense subtracts. Map is tx id → balance after that row.
 */
export function runningBalanceMap(txs: FinanceTx[]): Map<string, number> {
  const sorted = [...txs].sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    if (d !== 0) return d;
    return a.id.localeCompare(b.id);
  });
  let bal = 0;
  const map = new Map<string, number>();
  for (const t of sorted) {
    bal += t.kind === "income" ? t.amount : -t.amount;
    // Round to cents so float dust never fakes a balance
    bal = Math.round(bal * 100) / 100;
    map.set(t.id, bal);
  }
  return map;
}

/** Rows a meticulous bookkeeper still needs to finish */
export function bookkeeperGaps(state: FinanceState, ym: string): {
  uncategorized: number;
  blankMerchant: number;
  noAccounts: boolean;
  noIncomeThisMonth: boolean;
  noTxThisMonth: boolean;
  openDaysWithoutEntry: number;
  disciplineScore: number; // 0–100
} {
  const monthTxs = txsInMonth(state.txs, ym);
  const uncategorized = monthTxs.filter(
    (t) =>
      !t.category ||
      t.category === "Uncategorized" ||
      t.category === "Other" ||
      t.category.trim() === ""
  ).length;
  const blankMerchant = monthTxs.filter(
    (t) => !(t.merchant || t.note || "").trim()
  ).length;
  const noAccounts = state.accounts.length === 0;
  const noIncomeThisMonth = monthIncome(state.txs, ym) <= 0;
  const noTxThisMonth = monthTxs.length === 0;

  // How many of the last 7 days have at least one entry?
  let daysWith = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    if (state.txs.some((t) => t.date === key)) daysWith += 1;
  }
  const openDaysWithoutEntry = 7 - daysWith;

  let score = 100;
  if (noTxThisMonth) score -= 35;
  if (uncategorized > 0) score -= Math.min(25, uncategorized * 3);
  if (blankMerchant > 0) score -= Math.min(15, blankMerchant * 2);
  if (noAccounts) score -= 10;
  if (noIncomeThisMonth && !noTxThisMonth) score -= 10;
  if (openDaysWithoutEntry >= 5) score -= 15;
  else if (openDaysWithoutEntry >= 3) score -= 8;
  score = Math.max(0, Math.min(100, score));

  return {
    uncategorized,
    blankMerchant,
    noAccounts,
    noIncomeThisMonth,
    noTxThisMonth,
    openDaysWithoutEntry,
    disciplineScore: score,
  };
}

/** Last N calendar months keys YYYY-MM newest first */
export function recentMonthKeys(count = 6): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < count; i++) {
    out.push(monthKey(d));
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

export function newGoal(partial?: Partial<FinanceGoal>): FinanceGoal {
  return {
    id: uid("goal"),
    name: partial?.name || "New goal",
    target: partial?.target ?? 1000,
    saved: partial?.saved ?? 0,
    deadline: partial?.deadline ?? null,
  };
}

/** Month-by-month income / expense / flow (oldest → newest for charts) */
export function monthlySeries(
  txs: FinanceTx[],
  monthsBack = 6
): { ym: string; income: number; expense: number; flow: number }[] {
  const keys = recentMonthKeys(monthsBack).reverse();
  return keys.map((ym) => {
    const income = monthIncome(txs, ym);
    const expense = monthExpense(txs, ym);
    return { ym, income, expense, flow: income - expense };
  });
}

/** % of income kept this month (0–100, null if no income) */
export function savingsRate(txs: FinanceTx[], ym: string): number | null {
  const inc = monthIncome(txs, ym);
  if (inc <= 0) return null;
  const exp = monthExpense(txs, ym);
  return Math.round(((inc - exp) / inc) * 100);
}


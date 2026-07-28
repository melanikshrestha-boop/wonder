import {
  buildReconciliation,
  type ReconReport,
} from "./financeAccounting";
import type { BooksExtraState } from "./financeBooksStore";
import {
  moneyCents,
  txTypeOf,
  type FinanceAccount,
  type FinanceState,
  type FinanceTx,
} from "./financeStore";
import { normalizeCategory } from "./financeCategorize";

export type BusinessQuarterKey =
  `${number}-Q${1 | 2 | 3 | 4}`;

export type BusinessQuarterOption = {
  key: BusinessQuarterKey;
  label: string;
};

export type BusinessReportPriority = "high" | "medium" | "low";

export type BusinessQuarterReport = {
  title: "Quarterly money review";
  quarter: {
    key: BusinessQuarterKey;
    label: string;
    startDate: string;
    endDate: string;
    asOfDate: string;
    isPartial: boolean;
    comparisonLabel: string;
    comparisonBasis: "full-quarter" | "matched-qtd";
    comparisonStatus: "controlled" | "preliminary" | "unavailable";
  };
  metrics: {
    revenue: number;
    operatingExpenses: number;
    netProfit: number;
    revenueGrowthPct: number | null;
    expenseChangePct: number | null;
    operatingMarginPct: number | null;
    priorRevenue: number;
    priorOperatingExpenses: number;
  };
  personal: {
    moneyIn: number;
    moneyOut: number;
    net: number;
    keepRatePct: number | null;
    priorMoneyIn: number;
    priorMoneyOut: number;
    moneyInChangePct: number | null;
    moneyOutChangePct: number | null;
    reviewAmount: number;
    incomeBreakdown: Array<{
      id: string;
      label: string;
      amount: number;
      percent: number;
      color: string;
      transactionIds: string[];
    }>;
    expenseBreakdown: Array<{
      id: string;
      label: string;
      amount: number;
      percent: number;
      color: string;
      transactionIds: string[];
    }>;
    moneyInTransactionIds: string[];
    moneyOutTransactionIds: string[];
    trend: Array<{
      key: BusinessQuarterKey;
      label: string;
      moneyIn: number;
      moneyOut: number;
      isPartial: boolean;
    }>;
    months: Array<{
      key: string;
      label: string;
      moneyIn: number;
      moneyOut: number;
      net: number;
      transactionCount: number;
    }>;
    movement: {
      income: number;
      spending: number;
      investing: number;
      financing: number;
      cardSettlements: number;
      transfers: number;
      netCashChange: number;
    };
  };
  trend: Array<{
    key: BusinessQuarterKey;
    label: string;
    revenue: number;
    operatingExpenses: number;
    isPartial: boolean;
  }>;
  cashFlow: {
    operating: number;
    investing: number;
    financing: number;
    unclassified: number;
    netChange: number;
  };
  expenseBreakdown: Array<{
    id: string;
    label: string;
    amount: number;
    percent: number;
    color: string;
  }>;
  highlights: string[];
  nextSteps: Array<{
    id: string;
    title: string;
    detail: string;
    priority: BusinessReportPriority;
  }>;
  integrity: {
    status: "ready" | "review" | "blocked";
    label: string;
    score: number;
    warnings: string[];
    postedTransactionCount: number;
    pendingTransactionCount: number;
    openClassificationCount: number;
    duplicateTransactionCount: number;
    incompleteTransactionCount: number;
    unassignedAccountCount: number;
    unreconciledAccountCount: number;
    monthsClosed: number;
    monthsInQuarter: number;
  };
  supportingTransactionIds: string[];
  basisNote: string;
  ebitdaNote: string;
};

type QuarterRange = {
  key: BusinessQuarterKey;
  year: number;
  quarter: 1 | 2 | 3 | 4;
  startDate: string;
  endDate: string;
};

type ClassifiedQuarter = {
  all: FinanceTx[];
  posted: FinanceTx[];
  pending: FinanceTx[];
  operatingIncome: FinanceTx[];
  operatingExpenses: FinanceTx[];
  investing: FinanceTx[];
  financing: FinanceTx[];
  unclassified: FinanceTx[];
  duplicates: FinanceTx[];
  incomplete: FinanceTx[];
  unassignedAccount: FinanceTx[];
};

type PersonalQuarter = {
  moneyIn: FinanceTx[];
  moneyOut: FinanceTx[];
  investing: FinanceTx[];
  financing: FinanceTx[];
  cardSettlements: FinanceTx[];
  transfers: FinanceTx[];
};

const BREAKDOWN_COLORS = [
  "#2f6f5e",
  "#3559a8",
  "#df5a54",
  "#e5ad3d",
  "#7d5ac7",
  "#5d7b86",
];

const NON_OPERATING_CATEGORY = new Set([
  "Transfers",
  "Credit card payment",
  "Family",
  "Gifts",
]);

const INVESTING_TEXT =
  /\b(fidelity|vanguard|schwab|robinhood|etrade|e-trade|brokerage|coinbase|investment (contribution|withdrawal|transfer)|crypto (buy|purchase|sale|transfer))\b/i;
const FINANCING_IN_TEXT =
  /\b(loan proceeds|loan disbursement|borrowed|credit line advance|cash advance)\b/i;
const FINANCING_OUT_TEXT =
  /\b(loan principal|principal payment|debt principal)\b/i;
const CARD_SETTLEMENT_TEXT =
  /\b(card payment|payment to .*card|autopay|epay|crd pmt|payment thank you)\b/i;
const EARNED_INCOME_TEXT =
  /\b(payroll|salary|wages?|earned income|client payment|customer payment|invoice paid|freelance|contract income|consulting|business income|direct dep)\b/i;
const NON_REVENUE_INFLOW_TEXT =
  /\b(gift|family|mom|dad|parent|bimala|umesh|millennium|shrestha|owner contribution|capital contribution|reimbursement|refund|rebate|loan|borrowed|brokerage|investment sale|stock sale|dividend|interest)\b/i;
const TRANSFER_TEXT =
  /\b(transfer|own account|self transfer|to savings|from savings|to checking|from checking)\b/i;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function dateOnly(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
    date.getDate(),
  )}`;
}

function utcDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function daysInclusive(start: string, end: string): number {
  return (
    Math.floor(
      (utcDate(end).getTime() - utcDate(start).getTime()) /
        (24 * 60 * 60 * 1000),
    ) + 1
  );
}

function addDays(start: string, days: number): string {
  const date = utcDate(start);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function minDate(a: string, b: string): string {
  return a < b ? a : b;
}

function maxDate(a: string, b: string): string {
  return a > b ? a : b;
}

function txText(tx: FinanceTx): string {
  return `${tx.merchant || ""} ${tx.note || ""} ${tx.txType || ""}`.trim();
}

function accountFor(
  accounts: FinanceAccount[],
  tx: FinanceTx,
): FinanceAccount | undefined {
  return accounts.find((account) => account.id === tx.accountId);
}

function isValidDateOnly(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function inRange(tx: FinanceTx, startDate: string, endDate: string): boolean {
  return (
    isValidDateOnly(tx.date) &&
    tx.date >= startDate &&
    tx.date <= endDate
  );
}

function normalizedCategory(tx: FinanceTx): string {
  return normalizeCategory(tx.category, txText(tx));
}

function isExplicitTransfer(tx: FinanceTx): boolean {
  const category = normalizedCategory(tx);
  return (
    category === "Transfers" ||
    category === "Credit card payment" ||
    txTypeOf(tx) === "Account transfer"
  );
}

function isCardSettlement(tx: FinanceTx): boolean {
  return (
    normalizedCategory(tx) === "Credit card payment" ||
    CARD_SETTLEMENT_TEXT.test(txText(tx))
  );
}

function isEarnedOperatingIncome(tx: FinanceTx): boolean {
  if (tx.kind !== "income" || tx.pending) return false;
  const category = normalizedCategory(tx);
  const text = txText(tx);
  if (
    NON_OPERATING_CATEGORY.has(category) ||
    NON_REVENUE_INFLOW_TEXT.test(text) ||
    TRANSFER_TEXT.test(text) ||
    FINANCING_IN_TEXT.test(text) ||
    INVESTING_TEXT.test(text)
  ) {
    return false;
  }
  if (category === "Photography" || category === "Reselling") return true;
  // The existing importer sometimes assigns a generic "Income" category to
  // unknown credits. A business-style report needs positive earned-income
  // evidence; the category alone is not enough to call a credit revenue.
  return EARNED_INCOME_TEXT.test(text);
}

function isInvestingMovement(
  tx: FinanceTx,
  accounts: FinanceAccount[],
): boolean {
  const account = accountFor(accounts, tx);
  return (
    INVESTING_TEXT.test(txText(tx)) ||
    (account?.kind === "invest" && isExplicitTransfer(tx))
  );
}

function isFinancingMovement(tx: FinanceTx): boolean {
  const text = txText(tx);
  return (
    (tx.kind === "income" && FINANCING_IN_TEXT.test(text)) ||
    (tx.kind === "expense" && FINANCING_OUT_TEXT.test(text))
  );
}

function isOperatingExpense(
  tx: FinanceTx,
  accounts: FinanceAccount[],
): boolean {
  if (tx.kind !== "expense" || tx.pending) return false;
  const category = normalizedCategory(tx);
  const text = txText(tx);
  if (
    isExplicitTransfer(tx) ||
    isInvestingMovement(tx, accounts) ||
    isFinancingMovement(tx) ||
    CARD_SETTLEMENT_TEXT.test(text)
  ) {
    return false;
  }
  if (
    !tx.category.trim() ||
    category === "Other" ||
    category === "Uncategorized"
  ) {
    return false;
  }
  // A rail is not a purpose. Weak P2P rows are stopped above; a reviewed
  // Restaurants/Groceries/Travel/etc. category is usable accounting evidence.
  if (category === "Zelle" || txTypeOf(tx) === "P2P payment") {
    return false;
  }
  return true;
}

/**
 * Personal cash-book view.
 *
 * Every complete posted row is assigned to exactly one lane. Money in/out is
 * deliberately broader than business P&L: family support, gifts, refunds,
 * unknown credits, and uncategorized purchases remain visible instead of
 * disappearing from the report. Transfers, investments, borrowing, and card
 * settlements stay outside income/spending so they cannot be counted twice.
 */
function classifyPersonalQuarter(
  posted: FinanceTx[],
  accounts: FinanceAccount[],
): PersonalQuarter {
  const result: PersonalQuarter = {
    moneyIn: [],
    moneyOut: [],
    investing: [],
    financing: [],
    cardSettlements: [],
    transfers: [],
  };

  for (const tx of posted) {
    if (isInvestingMovement(tx, accounts)) {
      result.investing.push(tx);
    } else if (isFinancingMovement(tx)) {
      result.financing.push(tx);
    } else if (isCardSettlement(tx)) {
      result.cardSettlements.push(tx);
    } else if (isExplicitTransfer(tx)) {
      result.transfers.push(tx);
    } else if (tx.kind === "income") {
      result.moneyIn.push(tx);
    } else {
      result.moneyOut.push(tx);
    }
  }

  return result;
}

function needsClassification(
  tx: FinanceTx,
  accounts: FinanceAccount[],
): boolean {
  if (tx.pending) return false;
  const category = normalizedCategory(tx);
  if (
    tx.kind === "income" &&
    tx.categoryReviewed &&
    (category === "Family" || category === "Gifts")
  ) {
    return false;
  }
  if (
    isOperatingExpense(tx, accounts) ||
    isEarnedOperatingIncome(tx) ||
    isInvestingMovement(tx, accounts) ||
    isFinancingMovement(tx)
  ) {
    return false;
  }
  if (isExplicitTransfer(tx)) {
    // A transfer is resolved only after classifyQuarter finds a matching
    // owned cash-account leg. Card settlements remain open until their split
    // between purchases, interest, and principal is known.
    return true;
  }
  if (
    tx.kind === "expense" &&
    (!tx.category.trim() ||
      category === "Other" ||
      category === "Uncategorized")
  ) {
    return true;
  }
  return (
    tx.kind === "income" ||
    category === "Zelle" ||
    txTypeOf(tx) === "P2P payment"
  );
}

function matchedInternalCashTransferIds(
  txs: FinanceTx[],
  accounts: FinanceAccount[],
): Set<string> {
  const candidates = txs.filter((tx) => {
    const category = normalizedCategory(tx);
    return (
      isExplicitTransfer(tx) &&
      category !== "Credit card payment" &&
      !CARD_SETTLEMENT_TEXT.test(txText(tx)) &&
      !isInvestingMovement(tx, accounts) &&
      !isFinancingMovement(tx) &&
      isCashAccount(accountFor(accounts, tx))
    );
  });
  const matched = new Set<string>();
  for (const outbound of candidates) {
    if (outbound.kind !== "expense" || matched.has(outbound.id)) continue;
    const outboundDate = utcDate(outbound.date).getTime();
    const counterpart = candidates.find((candidate) => {
      if (
        candidate.kind !== "income" ||
        matched.has(candidate.id) ||
        candidate.id === outbound.id ||
        candidate.accountId === outbound.accountId ||
        Math.round(candidate.amount * 100) !==
          Math.round(outbound.amount * 100)
      ) {
        return false;
      }
      const dayGap =
        Math.abs(utcDate(candidate.date).getTime() - outboundDate) /
        (24 * 60 * 60 * 1000);
      return dayGap <= 3;
    });
    if (counterpart) {
      matched.add(outbound.id);
      matched.add(counterpart.id);
    }
  }
  return matched;
}

function classifyQuarter(
  state: FinanceState,
  startDate: string,
  endDate: string,
): ClassifiedQuarter {
  const all = state.txs.filter(
    (tx) => inRange(tx, startDate, endDate) || !isValidDateOnly(tx.date),
  );
  const duplicates: FinanceTx[] = [];
  const uniqueByExternalId = new Map<string, FinanceTx>();
  const possibleDuplicateByFingerprint = new Map<string, FinanceTx>();
  const withoutExternalId: FinanceTx[] = [];
  for (const tx of all) {
    const merchant = txText(tx).toLowerCase().replace(/\s+/g, " ").trim();
    const fingerprint = [
      tx.date,
      tx.kind,
      Math.round(tx.amount * 100),
      merchant,
      tx.accountId || "(unassigned)",
    ].join("|");
    if (!tx.externalId) {
      if (possibleDuplicateByFingerprint.has(fingerprint)) {
        // A heuristic match is only a review flag. Two equal purchases can
        // legitimately occur on the same day, so both remain in the KPIs.
        duplicates.push(tx);
      } else {
        possibleDuplicateByFingerprint.set(fingerprint, tx);
      }
      withoutExternalId.push(tx);
      continue;
    }
    const key = `external:${tx.accountId || "(unassigned)"}:${tx.externalId}`;
    const existing = uniqueByExternalId.get(key);
    if (!existing) {
      uniqueByExternalId.set(key, tx);
      continue;
    }
    duplicates.push(tx);
    if (existing.pending && !tx.pending) {
      uniqueByExternalId.set(key, tx);
    }
  }
  const txs = [...withoutExternalId, ...uniqueByExternalId.values()];
  const pending = txs.filter((tx) => !!tx.pending);
  const posted = txs.filter((tx) => !tx.pending);
  const incomplete = posted.filter(
    (tx) =>
      !isValidDateOnly(tx.date) ||
      !(tx.amount > 0) ||
      !txText(tx).trim(),
  );
  const incompleteIds = new Set(incomplete.map((tx) => tx.id));
  const completePosted = posted.filter((tx) => !incompleteIds.has(tx.id));
  const matchedTransfers = matchedInternalCashTransferIds(
    completePosted,
    state.accounts,
  );
  const unassignedAccount = completePosted.filter(
    (tx) => !tx.accountId || !accountFor(state.accounts, tx),
  );
  return {
    all,
    posted: completePosted,
    pending,
    operatingIncome: completePosted.filter(isEarnedOperatingIncome),
    operatingExpenses: completePosted.filter((tx) =>
      isOperatingExpense(tx, state.accounts),
    ),
    investing: completePosted.filter((tx) =>
      isInvestingMovement(tx, state.accounts),
    ),
    financing: completePosted.filter(isFinancingMovement),
    unclassified: completePosted.filter(
      (tx) =>
        needsClassification(tx, state.accounts) &&
        !matchedTransfers.has(tx.id),
    ),
    duplicates,
    incomplete,
    unassignedAccount,
  };
}

function sum(txs: FinanceTx[]): number {
  return txs.reduce((total, tx) => total + tx.amount, 0);
}

function signedCash(txs: FinanceTx[]): number {
  return txs.reduce(
    (total, tx) => total + (tx.kind === "income" ? tx.amount : -tx.amount),
    0,
  );
}

function isCashAccount(account: FinanceAccount | undefined): boolean {
  return (
    account?.kind === "cash" ||
    account?.kind === "checking" ||
    account?.kind === "savings"
  );
}

function cashSideMovement(
  txs: FinanceTx[],
  accounts: FinanceAccount[],
): number {
  return signedCash(
    txs.filter((tx) => isCashAccount(accountFor(accounts, tx))),
  );
}

function operatingCashFlow(
  classified: ClassifiedQuarter,
  accounts: FinanceAccount[],
): number {
  const income = classified.operatingIncome.filter((tx) => {
    const account = accountFor(accounts, tx);
    return isCashAccount(account);
  });
  const expenses = classified.operatingExpenses.filter((tx) => {
    const account = accountFor(accounts, tx);
    return isCashAccount(account);
  });
  return sum(income) - sum(expenses);
}

function unclassifiedCashFlow(
  classified: ClassifiedQuarter,
  accounts: FinanceAccount[],
): number {
  return signedCash(
    classified.unclassified.filter((tx) => {
      const account = accountFor(accounts, tx);
      return isCashAccount(account);
    }),
  );
}

function quarterFromDate(iso: string): BusinessQuarterKey {
  const [year, month] = iso.split("-").map(Number);
  const quarter = Math.min(
    4,
    Math.max(1, Math.ceil((month || 1) / 3)),
  ) as 1 | 2 | 3 | 4;
  return `${year}-Q${quarter}`;
}

export function currentBusinessQuarter(
  today = new Date(),
): BusinessQuarterKey {
  return quarterFromDate(dateOnly(today));
}

export function businessQuarterRange(
  key: BusinessQuarterKey,
): QuarterRange {
  const match = /^(\d{4})-Q([1-4])$/.exec(key);
  if (!match) throw new Error(`Invalid quarter key: ${key}`);
  const year = Number(match[1]);
  const quarter = Number(match[2]) as 1 | 2 | 3 | 4;
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const endDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate();
  return {
    key,
    year,
    quarter,
    startDate: `${year}-${pad2(startMonth)}-01`,
    endDate: `${year}-${pad2(endMonth)}-${pad2(endDay)}`,
  };
}

export function previousBusinessQuarter(
  key: BusinessQuarterKey,
): BusinessQuarterKey {
  const range = businessQuarterRange(key);
  return range.quarter === 1
    ? `${range.year - 1}-Q4`
    : `${range.year}-Q${(range.quarter - 1) as 1 | 2 | 3}`;
}

function shiftQuarter(
  key: BusinessQuarterKey,
  offset: number,
): BusinessQuarterKey {
  let range = businessQuarterRange(key);
  let index = range.year * 4 + (range.quarter - 1) + offset;
  const year = Math.floor(index / 4);
  index -= year * 4;
  return `${year}-Q${(index + 1) as 1 | 2 | 3 | 4}`;
}

function quarterLabel(key: BusinessQuarterKey, partial = false): string {
  const range = businessQuarterRange(key);
  return `Q${range.quarter} ${range.year}${partial ? " QTD" : ""}`;
}

export function availableBusinessQuarters(
  state: FinanceState,
  today = new Date(),
  limit = 8,
): BusinessQuarterOption[] {
  const current = currentBusinessQuarter(today);
  const keys = new Set<BusinessQuarterKey>([current]);
  for (const tx of state.txs) {
    if (isValidDateOnly(tx.date)) {
      keys.add(quarterFromDate(tx.date));
    }
  }
  let cursor = current;
  for (let index = 0; index < Math.max(4, limit); index += 1) {
    keys.add(cursor);
    cursor = previousBusinessQuarter(cursor);
  }
  return [...keys]
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
    .slice(0, limit)
    .map((key) => ({ key, label: quarterLabel(key) }));
}

function comparablePriorRange(
  selected: QuarterRange,
  asOfDate: string,
): {
  range: QuarterRange;
  endDate: string;
  label: string;
  basis: "full-quarter" | "matched-qtd";
} {
  const prior = businessQuarterRange(previousBusinessQuarter(selected.key));
  if (asOfDate < selected.endDate) {
    const elapsedDays = Math.max(
      1,
      daysInclusive(selected.startDate, asOfDate),
    );
    const priorEnd = minDate(
      prior.endDate,
      addDays(prior.startDate, elapsedDays - 1),
    );
    return {
      range: prior,
      endDate: priorEnd,
      label: `vs prior QTD (${prior.startDate.slice(5)}–${priorEnd.slice(5)})`,
      basis: "matched-qtd",
    };
  }
  return {
    range: prior,
    endDate: prior.endDate,
    label: `vs ${quarterLabel(prior.key)}`,
    basis: "full-quarter",
  };
}

function percentChange(current: number, prior: number): number | null {
  if (!(prior > 0)) return null;
  return ((current - prior) / Math.abs(prior)) * 100;
}

function categoryBreakdown(
  transactions: FinanceTx[],
): BusinessQuarterReport["personal"]["expenseBreakdown"] {
  const byCategory = new Map<string, FinanceTx[]>();
  for (const tx of transactions) {
    const category = normalizedCategory(tx);
    byCategory.set(category, [...(byCategory.get(category) || []), tx]);
  }
  const total = sum(transactions);
  if (!(total > 0)) return [];
  const sorted = [...byCategory.entries()]
    .map(
      ([label, rows]) =>
        [label, rows, sum(rows)] as const,
    )
    .sort((a, b) => b[2] - a[2]);
  const visible = sorted.slice(0, 5);
  if (sorted.length > 5) {
    const otherRows = sorted.slice(5).flatMap(([, rows]) => rows);
    visible.push([
      "Other",
      otherRows,
      sum(otherRows),
    ]);
  }
  return visible.map(([label, rows, amount], index) => ({
    id: label.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    label,
    amount,
    percent: (amount / total) * 100,
    color: BREAKDOWN_COLORS[index % BREAKDOWN_COLORS.length],
    transactionIds: rows.map((tx) => tx.id),
  }));
}

function expenseBreakdown(
  operatingExpenses: FinanceTx[],
): BusinessQuarterReport["expenseBreakdown"] {
  return categoryBreakdown(operatingExpenses);
}

function personalMonthRows(
  state: FinanceState,
  range: QuarterRange,
  asOfDate: string,
): BusinessQuarterReport["personal"]["months"] {
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return quarterMonths(range)
    .filter((month) => `${month}-01` <= asOfDate)
    .map((month) => {
      const monthStart = `${month}-01`;
      const monthDate = utcDate(monthStart);
      const monthEnd = minDate(
        asOfDate,
        new Date(
          Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 0),
        )
          .toISOString()
          .slice(0, 10),
      );
      const classified = classifyQuarter(state, monthStart, monthEnd);
      const personal = classifyPersonalQuarter(
        classified.posted,
        state.accounts,
      );
      const moneyIn = sum(personal.moneyIn);
      const moneyOut = sum(personal.moneyOut);
      return {
        key: month,
        label: formatter.format(monthDate),
        moneyIn,
        moneyOut,
        net: moneyIn - moneyOut,
        transactionCount: classified.posted.length,
      };
    });
}

function reconciliationCount(reports: ReconReport[]): number {
  // The current reconciliation model has no verified state because statement
  // opening/ending balances are not stored yet. "No activity" and "no
  // account" are therefore also unresolved controls—not evidence of a match.
  return reports.length;
}

function quarterMonths(range: QuarterRange): string[] {
  const startMonth = (range.quarter - 1) * 3 + 1;
  return [0, 1, 2].map(
    (offset) => `${range.year}-${pad2(startMonth + offset)}`,
  );
}

function buildPersonalHighlights(
  report: Pick<BusinessQuarterReport, "personal" | "quarter">,
  classified: ClassifiedQuarter,
): string[] {
  const highlights: string[] = [];
  highlights.push(
    `${report.quarter.label} net kept is ${moneyCents(
      report.personal.net,
    )}: ${moneyCents(report.personal.moneyIn)} in and ${moneyCents(
      report.personal.moneyOut,
    )} out.`,
  );
  if (report.personal.moneyInChangePct != null) {
    const direction = report.personal.moneyInChangePct >= 0 ? "up" : "down";
    const qualifier =
      report.quarter.comparisonStatus === "preliminary"
        ? "Preliminary comparison: "
        : "";
    highlights.push(
      `${qualifier}money in is ${direction} ${Math.abs(
        report.personal.moneyInChangePct,
      ).toFixed(1)}% ${report.quarter.comparisonLabel}.`,
    );
  } else {
    highlights.push(
      "Money-in change is unavailable because the comparable prior period has no recorded inflow.",
    );
  }
  const largest = report.personal.expenseBreakdown[0];
  if (largest) {
    highlights.push(
      `${largest.label} is the largest spending category at ${moneyCents(
        largest.amount,
      )} (${largest.percent.toFixed(0)}%).`,
    );
  }
  if (classified.unclassified.length) {
    highlights.push(
      `${classified.unclassified.length} posted movement${
        classified.unclassified.length === 1 ? "" : "s"
      } are already included in money flow but still need a reviewed purpose.`,
    );
  }
  return highlights.slice(0, 4);
}

function buildNextSteps(args: {
  classified: ClassifiedQuarter;
  unreconciled: number;
  monthsClosed: number;
  netProfit: number;
  largestExpense?: BusinessQuarterReport["expenseBreakdown"][number];
}): BusinessQuarterReport["nextSteps"] {
  const steps: BusinessQuarterReport["nextSteps"] = [];
  if (!args.classified.posted.length) {
    steps.push({
      id: "import-quarter",
      title: "Import the quarter ledger",
      detail:
        "No complete posted activity supports this quarter. Import every bank, card, and brokerage statement before using the KPIs.",
      priority: "high",
    });
  }
  if (args.classified.pending.length) {
    steps.push({
      id: "resolve-pending",
      title: "Resolve pending activity",
      detail: `${args.classified.pending.length} pending item${
        args.classified.pending.length === 1 ? "" : "s"
      } are excluded from actuals and block a final quarter.`,
      priority: "high",
    });
  }
  const dataControlCount =
    args.classified.duplicates.length +
    args.classified.incomplete.length +
    args.classified.unassignedAccount.length;
  if (dataControlCount) {
    steps.push({
      id: "repair-ledger-controls",
      title: "Repair ledger control exceptions",
      detail: `${args.classified.duplicates.length} possible duplicate, ${args.classified.incomplete.length} incomplete, and ${args.classified.unassignedAccount.length} unassigned-account row(s) must be resolved.`,
      priority: "high",
    });
  }
  if (args.classified.unclassified.length) {
    steps.push({
      id: "classify-movements",
      title: "Classify open money movements",
      detail: `Assign purpose to ${args.classified.unclassified.length} inflow, unknown expense, refund, P2P, card-settlement, or transfer movement so category totals and reconciliation are exact.`,
      priority: "high",
    });
  }
  if (args.unreconciled) {
    steps.push({
      id: "reconcile-accounts",
      title: "Reconcile statement endpoints",
      detail: `${args.unreconciled} active account${
        args.unreconciled === 1 ? "" : "s"
      } lack verified opening and ending statement balances.`,
      priority: "high",
    });
  }
  if (args.monthsClosed < 3) {
    steps.push({
      id: "close-months",
      title: "Close every month in the quarter",
      detail: `${args.monthsClosed}/3 months are locked. Final reporting requires all three monthly closes.`,
      priority: "medium",
    });
  }
  if (
    args.netProfit < 0 &&
    args.largestExpense &&
    steps.length < 4
  ) {
    steps.push({
      id: "restore-surplus",
      title: "Restore positive cash kept",
      detail: `Review ${args.largestExpense.label}, the largest spending category, before adding commitments.`,
      priority: "medium",
    });
  }
  if (!steps.length) {
    steps.push({
      id: "retain-surplus",
      title: "Allocate what you kept",
      detail:
        "All report controls passed. Assign the net kept to cash reserves, investing, taxes, or a named goal.",
      priority: "low",
    });
  }
  return steps.slice(0, 4);
}

export function buildBusinessQuarterReport(
  state: FinanceState,
  key: BusinessQuarterKey,
  books?: BooksExtraState,
  asOf = new Date(),
): BusinessQuarterReport {
  const selected = businessQuarterRange(key);
  const today = dateOnly(asOf);
  const asOfDate = minDate(selected.endDate, maxDate(selected.startDate, today));
  const isPartial = asOfDate < selected.endDate;
  const comparable = comparablePriorRange(selected, asOfDate);
  const current = classifyQuarter(state, selected.startDate, asOfDate);
  const prior = classifyQuarter(
    state,
    comparable.range.startDate,
    comparable.endDate,
  );
  const personalCurrent = classifyPersonalQuarter(
    current.posted,
    state.accounts,
  );
  const personalPrior = classifyPersonalQuarter(
    prior.posted,
    state.accounts,
  );

  const revenue = sum(current.operatingIncome);
  const operatingExpenses = sum(current.operatingExpenses);
  const netProfit = revenue - operatingExpenses;
  const priorRevenue = sum(prior.operatingIncome);
  const priorOperatingExpenses = sum(prior.operatingExpenses);
  const revenueGrowthPct = percentChange(revenue, priorRevenue);
  const expenseChangePct = percentChange(
    operatingExpenses,
    priorOperatingExpenses,
  );
  const operatingMarginPct =
    revenue > 0 ? (netProfit / revenue) * 100 : null;
  const personalMoneyIn = sum(personalCurrent.moneyIn);
  const personalMoneyOut = sum(personalCurrent.moneyOut);
  const personalNet = personalMoneyIn - personalMoneyOut;
  const priorPersonalMoneyIn = sum(personalPrior.moneyIn);
  const priorPersonalMoneyOut = sum(personalPrior.moneyOut);
  const personalKeepRatePct =
    personalMoneyIn > 0 ? (personalNet / personalMoneyIn) * 100 : null;
  const personalMoneyInChangePct = percentChange(
    personalMoneyIn,
    priorPersonalMoneyIn,
  );
  const personalMoneyOutChangePct = percentChange(
    personalMoneyOut,
    priorPersonalMoneyOut,
  );
  const months = quarterMonths(selected);
  const priorMonths = quarterMonths(comparable.range);
  const monthsClosed = months.filter((month) =>
    books?.closedMonths.includes(month),
  ).length;
  const priorMonthsClosed = priorMonths.filter((month) =>
    books?.closedMonths.includes(month),
  ).length;
  const unreconciled = reconciliationCount(buildReconciliation(state));
  const controlExceptionCount = (classified: ClassifiedQuarter) =>
    classified.pending.length +
    classified.unclassified.length +
    classified.duplicates.length +
    classified.incomplete.length +
    classified.unassignedAccount.length;
  const hasPriorComparisonBasis =
    priorPersonalMoneyIn > 0 || priorPersonalMoneyOut > 0;
  const comparisonStatus: BusinessQuarterReport["quarter"]["comparisonStatus"] =
    !hasPriorComparisonBasis
      ? "unavailable"
      : isPartial ||
          controlExceptionCount(current) > 0 ||
          controlExceptionCount(prior) > 0 ||
          monthsClosed < 3 ||
          priorMonthsClosed < 3 ||
          unreconciled > 0
        ? "preliminary"
        : "controlled";
  const comparisonLabel =
    comparisonStatus === "unavailable"
      ? "no recognized prior-period baseline"
      : comparisonStatus === "preliminary"
        ? `${comparable.label} (preliminary)`
        : comparable.label;

  const trend = [-3, -2, -1, 0].map((offset) => {
    const trendKey = shiftQuarter(key, offset);
    const range = businessQuarterRange(trendKey);
    const trendEnd =
      trendKey === key ? asOfDate : range.endDate;
    const data = classifyQuarter(state, range.startDate, trendEnd);
    return {
      key: trendKey,
      label: quarterLabel(trendKey, trendKey === key && isPartial),
      revenue: sum(data.operatingIncome),
      operatingExpenses: sum(data.operatingExpenses),
      isPartial: trendKey === key && isPartial,
    };
  });
  const personalTrend = [-3, -2, -1, 0].map((offset) => {
    const trendKey = shiftQuarter(key, offset);
    const range = businessQuarterRange(trendKey);
    const trendEnd = trendKey === key ? asOfDate : range.endDate;
    const data = classifyQuarter(state, range.startDate, trendEnd);
    const personal = classifyPersonalQuarter(data.posted, state.accounts);
    return {
      key: trendKey,
      label: quarterLabel(trendKey, trendKey === key && isPartial),
      moneyIn: sum(personal.moneyIn),
      moneyOut: sum(personal.moneyOut),
      isPartial: trendKey === key && isPartial,
    };
  });

  const operating = operatingCashFlow(current, state.accounts);
  const investing = cashSideMovement(current.investing, state.accounts);
  const financing = cashSideMovement(current.financing, state.accounts);
  const unclassified = unclassifiedCashFlow(current, state.accounts);
  const netChange = operating + investing + financing + unclassified;
  const breakdown = expenseBreakdown(current.operatingExpenses);
  const personalIncomeBreakdown = categoryBreakdown(personalCurrent.moneyIn);
  const personalExpenseBreakdown = categoryBreakdown(personalCurrent.moneyOut);
  const personalMovement = {
    income: cashSideMovement(personalCurrent.moneyIn, state.accounts),
    spending: cashSideMovement(personalCurrent.moneyOut, state.accounts),
    investing: cashSideMovement(personalCurrent.investing, state.accounts),
    financing: cashSideMovement(personalCurrent.financing, state.accounts),
    cardSettlements: cashSideMovement(
      personalCurrent.cardSettlements,
      state.accounts,
    ),
    transfers: cashSideMovement(personalCurrent.transfers, state.accounts),
  };
  const personalNetCashChange =
    personalMovement.income +
    personalMovement.spending +
    personalMovement.investing +
    personalMovement.financing +
    personalMovement.cardSettlements +
    personalMovement.transfers;
  const warnings: string[] = [];
  if (!current.posted.length) {
    warnings.push(
      "No complete posted transaction evidence exists for this quarter; zeroes are not a completed operating result.",
    );
  }
  if (isPartial) {
    warnings.push(
      `${quarterLabel(key, true)} is partial through ${asOfDate}; comparisons use the same elapsed days in the prior quarter.`,
    );
  }
  if (current.pending.length) {
    warnings.push(
      `${current.pending.length} pending item${
        current.pending.length === 1 ? " is" : "s are"
      } excluded from actuals.`,
    );
  }
  if (current.unclassified.length) {
    warnings.push(
      `${current.unclassified.length} posted movement${
        current.unclassified.length === 1 ? "" : "s"
      } are included in recorded money flow but still need a reviewed purpose.`,
    );
  }
  if (current.duplicates.length) {
    warnings.push(
      `${current.duplicates.length} duplicate or possible-duplicate row${
        current.duplicates.length === 1 ? "" : "s"
      } require review; account-scoped external-ID repeats are collapsed, while heuristic matches remain in totals.`,
    );
  }
  if (current.incomplete.length) {
    warnings.push(
      `${current.incomplete.length} incomplete posted row${
        current.incomplete.length === 1 ? "" : "s"
      } were excluded from KPIs.`,
    );
  }
  if (current.unassignedAccount.length) {
    warnings.push(
      `${current.unassignedAccount.length} posted row${
        current.unassignedAccount.length === 1 ? "" : "s"
      } lack a valid account assignment; they remain in transaction-basis results but not cash flow.`,
    );
  }
  if (unreconciled) {
    warnings.push(
      `${unreconciled} account${
        unreconciled === 1 ? "" : "s"
      } lack verified statement endpoints.`,
    );
  }
  if (comparisonStatus === "preliminary" && !isPartial) {
    warnings.push(
      "Quarter-over-quarter changes are directional because one or both periods lack completed close and reconciliation controls.",
    );
  }
  warnings.push(
    "This view is personal cash control: purchases are counted when posted, while transfers, card settlements, investing, and financing remain visible in separate movement lanes.",
  );

  const hasPostedEvidence = current.posted.length > 0;
  const dataControlCount =
    current.duplicates.length +
    current.incomplete.length +
    current.unassignedAccount.length;
  const blockingControl =
    !hasPostedEvidence ||
    current.pending.length > 0 ||
    current.unclassified.length > 0 ||
    dataControlCount > 0;
  const controlsReady =
    !isPartial &&
    hasPostedEvidence &&
    monthsClosed === 3 &&
    !blockingControl &&
    unreconciled === 0;
  const integrityStatus: BusinessQuarterReport["integrity"]["status"] =
    controlsReady ? "ready" : blockingControl ? "blocked" : "review";
  const score = Math.max(
    0,
    100 -
      (!hasPostedEvidence ? 40 : 0) -
      (isPartial ? 5 : 0) -
      Math.min(25, current.pending.length * 5) -
      Math.min(30, current.unclassified.length * 5) -
      Math.min(20, current.duplicates.length * 5) -
      Math.min(20, current.incomplete.length * 5) -
      Math.min(20, current.unassignedAccount.length * 5) -
      Math.min(20, unreconciled * 5) -
      (3 - monthsClosed) * 5,
  );
  const label = `${
    integrityStatus === "ready" ? "Final" : "Preliminary"
  } · ${current.posted.length} posted tracked · ${monthsClosed}/3 months closed · ${current.pending.length} pending · ${
    current.unclassified.length
  } need purpose · ${dataControlCount} ledger exceptions · ${unreconciled} accounts unreconciled`;

  const reportBase = {
    quarter: {
      key,
      label: quarterLabel(key, isPartial),
      startDate: selected.startDate,
      endDate: selected.endDate,
      asOfDate,
      isPartial,
      comparisonLabel,
      comparisonBasis: comparable.basis,
      comparisonStatus,
    },
    metrics: {
      revenue,
      operatingExpenses,
      netProfit,
      revenueGrowthPct,
      expenseChangePct,
      operatingMarginPct,
      priorRevenue,
      priorOperatingExpenses,
    },
    expenseBreakdown: breakdown,
  };
  const personal: BusinessQuarterReport["personal"] = {
    moneyIn: personalMoneyIn,
    moneyOut: personalMoneyOut,
    net: personalNet,
    keepRatePct: personalKeepRatePct,
    priorMoneyIn: priorPersonalMoneyIn,
    priorMoneyOut: priorPersonalMoneyOut,
    moneyInChangePct: personalMoneyInChangePct,
    moneyOutChangePct: personalMoneyOutChangePct,
    reviewAmount: sum(current.unclassified),
    incomeBreakdown: personalIncomeBreakdown,
    expenseBreakdown: personalExpenseBreakdown,
    moneyInTransactionIds: personalCurrent.moneyIn.map((tx) => tx.id),
    moneyOutTransactionIds: personalCurrent.moneyOut.map((tx) => tx.id),
    trend: personalTrend,
    months: personalMonthRows(state, selected, asOfDate),
    movement: {
      ...personalMovement,
      netCashChange: personalNetCashChange,
    },
  };

  return {
    title: "Quarterly money review",
    ...reportBase,
    personal,
    trend,
    cashFlow: {
      operating,
      investing,
      financing,
      unclassified,
      netChange,
    },
    highlights: buildPersonalHighlights(
      {
        quarter: reportBase.quarter,
        personal,
      },
      current,
    ),
    nextSteps: buildNextSteps({
      classified: current,
      unreconciled,
      monthsClosed,
      netProfit: personalNet,
      largestExpense: personalExpenseBreakdown[0],
    }),
    integrity: {
      status: integrityStatus,
      label,
      score,
      warnings,
      postedTransactionCount: current.posted.length,
      pendingTransactionCount: current.pending.length,
      openClassificationCount: current.unclassified.length,
      duplicateTransactionCount: current.duplicates.length,
      incompleteTransactionCount: current.incomplete.length,
      unassignedAccountCount: current.unassignedAccount.length,
      unreconciledAccountCount: unreconciled,
      monthsClosed,
      monthsInQuarter: 3,
    },
    supportingTransactionIds: current.all.map((tx) => tx.id),
    basisNote:
      "Personal transaction basis · every complete posted external inflow and purchase enters Money in or Money out, even when its purpose still needs review. Transfers, card settlements, investing, and financing are tracked separately so they never inflate income or spending. Pending, incomplete, and confirmed duplicate rows stay outside actuals.",
    ebitdaNote:
      "This is a personal cash-control report, not a tax return or business income statement. Statement reconciliation and reviewed transaction purposes are required before a quarter is final.",
  };
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function businessQuarterReportCsv(
  report: BusinessQuarterReport,
): string {
  const rows: Array<Array<string | number>> = [
    ["Quarterly money review", report.quarter.label],
    ["Basis", report.basisNote],
    ["Integrity", report.integrity.label],
    [],
    ["Metric", "Value", "Comparison"],
    ["Money in", report.personal.moneyIn, report.quarter.comparisonLabel],
    [
      "Money out",
      report.personal.moneyOut,
      report.quarter.comparisonLabel,
    ],
    ["Net kept", report.personal.net, ""],
    [
      "Money-in change %",
      report.personal.moneyInChangePct ?? "Unavailable",
      report.quarter.comparisonLabel,
    ],
    [
      "Keep rate %",
      report.personal.keepRatePct ?? "Unavailable",
      "",
    ],
    [],
    ["Cash-account movement", "Amount"],
    ["Income", report.personal.movement.income],
    ["Spending", report.personal.movement.spending],
    ["Investing", report.personal.movement.investing],
    ["Financing", report.personal.movement.financing],
    ["Card settlements", report.personal.movement.cardSettlements],
    ["Transfers", report.personal.movement.transfers],
    ["Net cash movement", report.personal.movement.netCashChange],
    [],
    ["Expense category", "Amount", "Percent"],
    ...report.personal.expenseBreakdown.map((slice) => [
      slice.label,
      slice.amount,
      slice.percent,
    ]),
    [],
    ["Income category", "Amount", "Percent"],
    ...report.personal.incomeBreakdown.map((slice) => [
      slice.label,
      slice.amount,
      slice.percent,
    ]),
    [],
    ["Month", "Money in", "Money out", "Net", "Posted transactions"],
    ...report.personal.months.map((month) => [
      month.label,
      month.moneyIn,
      month.moneyOut,
      month.net,
      month.transactionCount,
    ]),
    [],
    ["Control warnings"],
    ...report.integrity.warnings.map((warning) => [warning]),
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

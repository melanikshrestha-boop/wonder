/**
 * Wonder Money — ruthless reinvest bookkeeper engine.
 * Pay yourself first. Cut leaks. Deploy surplus into invest.
 * Ranks next moves from balances, burn, plan, credit, goals.
 */

import {
  cashOnHand,
  creditOwed,
  invested,
  monthExpense,
  monthIncome,
  monthKey,
  money,
  moneyCents,
  topMerchants,
  type FinanceState,
  type FinanceTx,
} from "./financeStore";
import type { CreditReport } from "./financeCredit";
import { buildTaxBrief, answerTax } from "./financeTax";
import { buildAuditBrief, answerAudit } from "./financeAudit";
import { buildForecastBrief, answerForecast } from "./financeForecast";
import { buildAdvisoryBrief, answerAdvisory } from "./financeAdvisory";
import {
  answerAccounting,
  buildAccountingPack,
  type AccountingPack,
} from "./financeAccounting";
import { loadBooksExtra } from "./financeBooksStore";
import {
  answerAdept,
  buildAdeptBrief,
  type AdeptBrief,
} from "./financeAdept";
import {
  answerSmartCore,
  buildSmartCore,
  type SmartCore,
} from "./financeSmartCore";
import {
  monthTrueIncome,
  monthTrueSpend,
} from "./financeTransfers";

/** Default: reinvest at least half of income. Ruthless mode aims higher. */
export const REINVEST_TARGET_RATE = 0.5;
export const REINVEST_RUTHLESS_RATE = 0.7;

export type SmartAction = {
  id: string;
  priority: number; // higher = do first
  severity: "critical" | "high" | "medium" | "low" | "good";
  title: string;
  detail: string;
  amount?: number;
  /** Where to go / what to press */
  cta: string;
  tab?:
    | "overview"
    | "transactions"
    | "plan"
    | "subscriptions"
    | "goals"
    | "insights"
    | "accounts";
};

export type MonthProjection = {
  dayOfMonth: number;
  daysInMonth: number;
  spentSoFar: number;
  incomeSoFar: number;
  /** Linear projection of month-end spend */
  projectedSpend: number;
  projectedIncome: number;
  projectedFlow: number;
  /** Burn rate $ / day */
  burnPerDay: number;
};

export type ReinvestPlan = {
  /** 0–1 target fraction of income to keep / reinvest */
  targetRate: number;
  /** Actual keep rate this month (income − expense) / income */
  actualRate: number | null;
  /** Dollars that should be reinvested this month */
  targetDollars: number;
  /** Already “kept” this month (max cash flow, 0 if negative) */
  keptSoFar: number;
  /** Still need to move to invest / savings */
  deployNow: number;
  /** Current invest account total */
  investedBalance: number;
  /** 0–100 how ruthless this month’s books look */
  ruthlessness: number;
  /** One-line command */
  order: string;
};

export type SmartBrief = {
  headline: string;
  sub: string;
  actions: SmartAction[];
  projection: MonthProjection;
  /** Fun money AFTER essentials + debt floor + reinvest target */
  safeToSpend: number;
  runwayMonths: number;
  topLeak: { merchant: string; total: number; count: number } | null;
  planHealth: "empty" | "ok" | "tight" | "blown";
  reinvest: ReinvestPlan;
  /** Accountant backends — no extra UI; drive actions + Ask */
  tax: ReturnType<typeof buildTaxBrief>;
  audit: ReturnType<typeof buildAuditBrief>;
  forecast: ReturnType<typeof buildForecastBrief>;
  advisory: ReturnType<typeof buildAdvisoryBrief>;
  /** Full 14-module accounting pack (inbox → monthly close) */
  accounting: AccountingPack;
  /** Financially adept OS — credit climb + cash discipline */
  adept: AdeptBrief;
  /** Transfer-aware intelligence (anomalies, true burn, capital score) */
  smart: SmartCore;
  dataQuality: {
    hasTxs: boolean;
    hasIncome: boolean;
    hasAccounts: boolean;
    hasLimits: boolean;
    hasPlan: boolean;
    score: number; // 0–100 how much the model can trust
  };
};

function daysInMonth(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export function projectMonth(txs: FinanceTx[], ym: string): MonthProjection {
  const dim = daysInMonth(ym);
  const today = new Date();
  const thisYm = monthKey(today);
  const dayOfMonth =
    ym === thisYm ? Math.max(1, today.getDate()) : dim;
  // True books (exclude transfers / card pays) so burn isn't inflated
  const spentSoFar = monthTrueSpend(txs, ym);
  const incomeSoFar = monthTrueIncome(txs, ym);
  // Fall back to raw if true is empty but raw has data
  const spent =
    spentSoFar > 0 ? spentSoFar : monthExpense(txs, ym);
  const income =
    incomeSoFar > 0 ? incomeSoFar : monthIncome(txs, ym);
  const burnPerDay = spent / dayOfMonth;
  const incomePerDay = income / dayOfMonth;
  const projectedSpend = burnPerDay * dim;
  const projectedIncome = incomePerDay * dim;
  return {
    dayOfMonth,
    daysInMonth: dim,
    spentSoFar: spent,
    incomeSoFar: income,
    projectedSpend,
    projectedIncome,
    projectedFlow: projectedIncome - projectedSpend,
    burnPerDay,
  };
}

/**
 * Fun money only after: essentials left + debt floor + reinvest target gap.
 * Ruthless bookkeeper: lifestyle is the residual, not the default.
 */
export function computeSafeToSpend(
  cash: number,
  debt: number,
  planRows: { id: string; planned: number; spent: number }[],
  projection: MonthProjection,
  reinvestDeployNow = 0
): number {
  const essentials = planRows.find((r) => r.id === "essentials");
  const essentialsLeft = essentials
    ? Math.max(0, essentials.planned - essentials.spent)
    : 0;
  // Keep a floor for debt service: ~3% of card balances or $50
  const debtFloor = debt > 0 ? Math.max(50, debt * 0.03) : 0;
  const daysLeft = Math.max(0, projection.daysInMonth - projection.dayOfMonth);
  const projectedBurnLeft = projection.burnPerDay * daysLeft;
  // Residual after reinvest obligation + buffers
  const raw =
    cash -
    essentialsLeft -
    debtFloor -
    reinvestDeployNow -
    projectedBurnLeft * 0.25;
  return Math.max(0, Math.round(raw));
}

export function buildReinvestPlan(
  income: number,
  expense: number,
  accounts: FinanceState["accounts"],
  targetRate = REINVEST_RUTHLESS_RATE
): ReinvestPlan {
  const investedBalance = invested(accounts);
  const keptSoFar = Math.max(0, income - expense);
  const actualRate = income > 0 ? keptSoFar / income : null;
  const targetDollars = income > 0 ? Math.round(income * targetRate) : 0;
  const deployNow = Math.max(0, Math.round(targetDollars - keptSoFar));

  // Ruthlessness: hit target rate, low lifestyle share, capital already invested
  let ruthlessness = 40;
  if (actualRate != null) {
    ruthlessness = Math.round(
      Math.min(100, (actualRate / targetRate) * 85 + (investedBalance > 0 ? 15 : 0))
    );
  } else if (income <= 0) {
    ruthlessness = 20;
  }
  if (expense > income && income > 0) ruthlessness = Math.min(ruthlessness, 25);

  let order = "Log income first — no reinvest math without inflows.";
  if (income > 0 && deployNow > 0) {
    order = `Move ${moneyCents(deployNow)} into Invest before any lifestyle upgrade.`;
  } else if (income > 0 && deployNow === 0 && (actualRate || 0) >= targetRate) {
    order = `Target hit (${Math.round((actualRate || 0) * 100)}% kept). Route surplus to Invest, not lifestyle.`;
  } else if (income > 0 && keptSoFar === 0) {
    order = "Cash flow is zero or red — cut leaks before you talk about compounding.";
  }

  return {
    targetRate,
    actualRate,
    targetDollars,
    keptSoFar,
    deployNow,
    investedBalance,
    ruthlessness,
    order,
  };
}

export function buildSmartBrief(
  state: FinanceState,
  ym: string,
  planRows: { id: string; label: string; planned: number; spent: number; remaining: number }[],
  credit: CreditReport,
  /** Optional books extras (payables/receipts/closes). Defaults to localStorage. */
  booksExtra = loadBooksExtra()
): SmartBrief {
  const txs = state.txs;
  const accounts = state.accounts;
  const goals = state.goals || [];
  const cash = cashOnHand(accounts);
  const debt = creditOwed(accounts);
  // Prefer transfer-aware true books for reinvest / flow decisions
  const trueIncome = monthTrueIncome(txs, ym);
  const trueExpense = monthTrueSpend(txs, ym);
  const income = trueIncome > 0 ? trueIncome : monthIncome(txs, ym);
  const expense = trueExpense > 0 ? trueExpense : monthExpense(txs, ym);
  const cashFlow = income - expense;
  const projection = projectMonth(txs, ym);
  const planPlanned = planRows.reduce((s, r) => s + r.planned, 0);
  const reinvest = buildReinvestPlan(
    income,
    expense,
    accounts,
    REINVEST_RUTHLESS_RATE
  );
  const safeToSpend = computeSafeToSpend(
    cash,
    debt,
    planRows,
    projection,
    reinvest.deployNow
  );
  // Extremely smart layer first — true burn, anomalies, capital score
  const smart = buildSmartCore(state, ym);
  const runwayMonths =
    smart.velocity.runwayMonthsTrue > 0 && smart.velocity.runwayMonthsTrue < 99
      ? smart.velocity.runwayMonthsTrue
      : projection.burnPerDay > 0
        ? cash / (projection.burnPerDay * 30)
        : cash > 0
          ? 99
          : 0;

  const merchants = topMerchants(txs, ym, 5).filter(
    (m) => !/payment|transfer|zelle|venmo/i.test(m.merchant)
  );
  const topLeak =
    smart.concentration.topMerchant || merchants[0] || null;
  const hasInvestAccount = accounts.some((a) => a.kind === "invest");

  // Accountant backends (no new screens — feed actions + Ask)
  const tax = buildTaxBrief(state, ym);
  const audit = buildAuditBrief(state);
  const forecast = buildForecastBrief(state, ym, planRows);
  const advisory = buildAdvisoryBrief(state, reinvest, audit, tax, forecast);
  // Full accounting desk: 14 modules on live ledger + books extras
  const accounting = buildAccountingPack(state, ym, booksExtra);
  // Adept OS — real score + her books
  const adept = buildAdeptBrief(state, credit, ym);

  const hasTxs = txs.length > 0;
  const hasIncome = income > 0 || txs.some((t) => t.kind === "income");
  const hasAccounts = accounts.some((a) => a.balance !== 0);
  const hasLimits = accounts.some(
    (a) => a.kind === "credit" && (a.creditLimit || 0) > 0
  );
  const hasPlan = planPlanned > 0;
  let quality = 0;
  if (hasTxs) quality += 35;
  if (hasIncome) quality += 15;
  if (hasAccounts) quality += 20;
  if (hasLimits) quality += 15;
  if (hasPlan) quality += 15;

  let planHealth: SmartBrief["planHealth"] = "empty";
  if (hasPlan) {
    const over = planRows.some((r) => r.planned > 0 && r.spent > r.planned * 1.05);
    const tight = planRows.some(
      (r) => r.planned > 0 && r.spent / r.planned > 0.85 && r.spent <= r.planned
    );
    planHealth = over ? "blown" : tight ? "tight" : "ok";
  }

  const actions: SmartAction[] = [];

  // ── Credit climb from real score (677) ──
  if (credit.scoreSource === "official" && credit.estimate < 700) {
    actions.push({
      id: "credit-climb-700",
      priority: 97,
      severity: "high",
      title: `Credit ${credit.estimate} → target 700`,
      detail: `${adept.order} Utilization ${
        credit.utilization == null
          ? "UNKNOWN — add card limit"
          : `${Math.round(credit.utilization * 100)}%`
      }. Next: ${adept.climb[0]?.moves[0] || "pay before statement close"}.`,
      cta: "Review → credit drills",
      tab: "insights",
    });
  }
  if (credit.utilization == null && accounts.some((a) => a.kind === "credit")) {
    actions.push({
      id: "need-limit",
      priority: 98,
      severity: "critical",
      title: "Card limit missing — utilization is blind",
      detail:
        "You cannot climb 677 without knowing % used. Open Accounts → set Limit on Chase card.",
      cta: "Add credit limit",
      tab: "accounts",
    });
  }
  if (adept.level === "survival") {
    actions.push({
      id: "survival-floor",
      priority: 99,
      severity: "critical",
      title: "Cash floor is broken",
      detail: adept.leaks[0] || adept.order,
      cta: "See adept drills",
      tab: "insights",
    });
  }

  // ── Data foundation (can't be smart on empty) ──
  if (!hasTxs && !hasAccounts) {
    actions.push({
      id: "import",
      priority: 100,
      severity: "critical",
      title: "Connect money data",
      detail:
        "Import a Chase/bank CSV. Without transactions, every number is a guess.",
      cta: "Import CSV",
      tab: "accounts",
    });
  } else if (!hasTxs) {
    actions.push({
      id: "import-tx",
      priority: 95,
      severity: "high",
      title: "No transactions yet",
      detail: "Balances alone can't project cash flow. Import CSV from your bank.",
      cta: "Import CSV",
      tab: "accounts",
    });
  }

  if (hasTxs && !hasPlan) {
    actions.push({
      id: "auto-plan",
      priority: 90,
      severity: "high",
      title: "Build a plan from real spend",
      detail:
        "One tap averages the last months by category. No typing. Then the reinvest residual gets real.",
      cta: "Auto-build plan",
      tab: "plan",
    });
  }

  // ── RUTHLESS REINVEST (default desk doctrine) ──
  if (hasIncome && reinvest.deployNow > 0) {
    actions.push({
      id: "reinvest-deploy",
      priority: 96,
      severity: reinvest.deployNow > income * 0.2 ? "critical" : "high",
      title: `Reinvest ${money(reinvest.deployNow)} before lifestyle`,
      detail: `Ruthless target ${Math.round(reinvest.targetRate * 100)}% of income (${money(reinvest.targetDollars)}). Kept so far ${money(reinvest.keptSoFar)}. ${reinvest.order}`,
      amount: reinvest.deployNow,
      cta: hasInvestAccount
        ? "Accounts → move to Invest"
        : "Accounts → add Invest account",
      tab: "accounts",
    });
  }

  if (hasIncome && !hasInvestAccount) {
    actions.push({
      id: "need-invest-acct",
      priority: 93,
      severity: "high",
      title: "Open an Invest account on the books",
      detail:
        "Ruthless bookkeeping needs a named Invest bucket. Checking is not compounding.",
      cta: "Add Invest account",
      tab: "accounts",
    });
  }

  if (
    hasIncome &&
    reinvest.actualRate != null &&
    reinvest.actualRate < REINVEST_TARGET_RATE
  ) {
    actions.push({
      id: "reinvest-rate-low",
      priority: 84,
      severity: "high",
      title: `Keep rate ${Math.round(reinvest.actualRate * 100)}% — below floor`,
      detail: `Floor is ${Math.round(REINVEST_TARGET_RATE * 100)}%. Ruthless aim is ${Math.round(REINVEST_RUTHLESS_RATE * 100)}%. Cut non-essentials until the ledger shows capital formation.`,
      cta: "Tighten plan 10%",
      tab: "plan",
    });
  }

  // ── Cash flow intelligence ──
  if (hasTxs && projection.projectedFlow < 0) {
    const hole = Math.abs(projection.projectedFlow);
    actions.push({
      id: "burn",
      priority: 88,
      severity: hole > income * 0.2 ? "critical" : "high",
      title: "On track to overspend this month",
      detail: `At today’s pace you’ll end ~${money(hole)} negative. Burn ${money(projection.burnPerDay)}/day. That kills reinvestment.`,
      amount: hole,
      cta: "Cut top merchant or tighten plan",
      tab: "transactions",
    });
  }

  if (cashFlow < 0 && hasTxs) {
    actions.push({
      id: "neg-flow",
      priority: 85,
      severity: "high",
      title: "Cash flow is negative so far",
      detail: `Out ${money(expense)} · In ${money(income)}. Gap ${money(Math.abs(cashFlow))}. No surplus to reinvest until this flips.`,
      amount: Math.abs(cashFlow),
      cta: "See transactions",
      tab: "transactions",
    });
  }

  // ── Credit ──
  if (debt > 0 && !hasLimits) {
    actions.push({
      id: "limits",
      priority: 80,
      severity: "high",
      title: "Add credit card limits",
      detail:
        "Utilization is ~30% of score math. Without limits the model is half-blind.",
      amount: debt,
      cta: "Accounts → set Limit",
      tab: "accounts",
    });
  } else if (credit.utilization != null && credit.utilization > 0.3) {
    actions.push({
      id: "util",
      priority: 92,
      severity: credit.utilization > 0.5 ? "critical" : "high",
      title: `Utilization ${Math.round(credit.utilization * 100)}% — too high`,
      detail:
        "Fastest score lever: pay before statement close until under 30% (ideally under 10%).",
      amount: debt,
      cta: "Credit tips",
      tab: "insights",
    });
  }

  // ── Plan breaches ──
  for (const r of planRows) {
    if (r.planned > 0 && r.spent > r.planned) {
      actions.push({
        id: `over-${r.id}`,
        priority: 70 + Math.min(15, (r.spent / r.planned) * 5),
        severity: r.spent > r.planned * 1.25 ? "high" : "medium",
        title: `${r.label} over plan`,
        detail: `${money(r.spent)} spent vs ${money(r.planned)} planned (${Math.round((r.spent / r.planned) * 100)}%).`,
        amount: r.spent - r.planned,
        cta: "Review plan",
        tab: "plan",
      });
    }
  }

  // ── Merchant concentration ──
  if (topLeak && expense > 0 && topLeak.total / expense > 0.25) {
    actions.push({
      id: "leak",
      priority: 65,
      severity: "medium",
      title: `Heavy concentration: ${topLeak.merchant}`,
      detail: `${money(topLeak.total)} · ${topLeak.count} charges · ${Math.round((topLeak.total / expense) * 100)}% of month out.`,
      amount: topLeak.total,
      cta: "Inspect merchant",
      tab: "transactions",
    });
  }

  // ── Runway ──
  if (hasTxs && runwayMonths < 2 && cash > 0) {
    actions.push({
      id: "runway",
      priority: 87,
      severity: "critical",
      title: `Runway under 2 months (${runwayMonths.toFixed(1)})`,
      detail: "At this burn, cash won’t last. Raise income buffer or cut fixed costs.",
      cta: "See runway drivers",
      tab: "overview",
    });
  } else if (hasTxs && runwayMonths < 4 && cash > 0) {
    actions.push({
      id: "runway-warn",
      priority: 60,
      severity: "medium",
      title: `Runway ${runwayMonths.toFixed(1)} months`,
      detail: "Thin cushion. Aim for 6+ months cash for stability.",
      cta: "Goals → emergency fund",
      tab: "goals",
    });
  }

  // ── Goals stuck ──
  for (const g of goals) {
    if (g.target > 0 && g.saved / g.target < 0.15 && cashFlow > 0) {
      actions.push({
        id: `goal-${g.id}`,
        priority: 40,
        severity: "low",
        title: `Underfunded: ${g.name}`,
        detail: `${Math.round((g.saved / g.target) * 100)}% funded. Positive cash flow could route here automatically next month.`,
        cta: "Open goals",
        tab: "goals",
      });
    }
  }

  // Lifestyle creep when fun money still high while reinvest lagging
  if (
    hasIncome &&
    reinvest.deployNow > 0 &&
    safeToSpend > reinvest.deployNow * 0.5 &&
    topLeak
  ) {
    actions.push({
      id: "lifestyle-creep",
      priority: 75,
      severity: "medium",
      title: `Lifestyle before capital: ${topLeak.merchant}`,
      detail: `${money(topLeak.total)} there this month while ${money(reinvest.deployNow)} still needs to hit Invest. Ruthless rule: capital first.`,
      amount: topLeak.total,
      cta: "Kill or cap that merchant",
      tab: "transactions",
    });
  }

  // ── Smart core signals → action queue (anomalies, true flow, subs, APR) ──
  for (const sig of smart.signals.slice(0, 6)) {
    if (sig.severity === "good" || sig.severity === "low") continue;
    // Skip if we already have a near-duplicate id prefix
    if (actions.some((a) => a.id === sig.id || a.title === sig.title)) continue;
    actions.push({
      id: sig.id,
      priority:
        sig.severity === "critical"
          ? 95
          : sig.severity === "high"
            ? 86
            : 62,
      severity: sig.severity,
      title: sig.title,
      detail: sig.detail,
      amount: sig.amount,
      cta:
        sig.id.startsWith("anom")
          ? "Inspect ledger"
          : sig.id.includes("sub")
            ? "Subscriptions"
            : sig.id.includes("runway") || sig.id.includes("true")
              ? "See true books"
              : "Act on signal",
      tab:
        sig.id.startsWith("anom") || sig.id.includes("conc")
          ? "transactions"
          : sig.id.includes("sub")
            ? "subscriptions"
            : "overview",
    });
  }

  // ── Tax / Audit / Forecast / Advisory → same action queue ──
  for (const f of tax.findings.slice(0, 3)) {
    if (f.severity === "info") continue;
    actions.push({
      id: f.id,
      priority:
        f.severity === "critical" ? 91 : f.severity === "high" ? 82 : 55,
      severity: f.severity,
      title: `Tax · ${f.title}`,
      detail: f.detail,
      amount: f.amount,
      cta: "Ask: tax plan",
      tab: "overview",
    });
  }
  for (const f of audit.findings.slice(0, 4)) {
    if (f.severity === "info") continue;
    actions.push({
      id: f.id,
      priority:
        f.severity === "critical" ? 94 : f.severity === "high" ? 83 : 58,
      severity: f.severity,
      title: `Audit · ${f.title}`,
      detail: f.detail,
      amount: f.amount,
      cta: "Open ledger",
      tab: "transactions",
    });
  }
  for (const f of forecast.findings.slice(0, 3)) {
    if (f.severity === "info") continue;
    actions.push({
      id: f.id,
      priority:
        f.severity === "critical" ? 89 : f.severity === "high" ? 78 : 52,
      severity: f.severity,
      title: `Forecast · ${f.title}`,
      detail: f.detail,
      amount: f.amount,
      cta: "Review plan",
      tab: "plan",
    });
  }
  for (const d of advisory.decisions.filter((x) => x.verdict === "no").slice(0, 2)) {
    actions.push({
      id: `adv-${d.id}`,
      priority: 72,
      severity: "medium",
      title: `Advisory · ${d.title}`,
      detail: d.detail,
      amount: d.maxSafeAmount,
      cta: "Ask Mel for the call",
      tab: "overview",
    });
  }

  // ── Good state ──
  if (!actions.length && hasTxs) {
    actions.push({
      id: "good",
      priority: 1,
      severity: "good",
      title: "Ruthless and on-target",
      detail: `Kept ${reinvest.actualRate != null ? `${Math.round(reinvest.actualRate * 100)}%` : "—"}. Fun money after reinvest ${money(safeToSpend)}. Invest book ${money(reinvest.investedBalance)}.`,
      cta: "Keep logging every dollar",
      tab: "overview",
    });
  }

  actions.sort((a, b) => b.priority - a.priority);

  // Headline — capital + true books doctrine
  let headline = "Money desk is cold";
  let sub = "Import bank data so the engine can force reinvestment.";
  if (actions[0]?.severity === "critical") {
    headline = "Critical · act first";
    sub = actions[0].title;
  } else if (
    quality >= 70 &&
    reinvest.actualRate != null &&
    reinvest.actualRate >= REINVEST_RUTHLESS_RATE &&
    cashFlow >= 0
  ) {
    headline = "Ruthless · capital first";
    sub = `True keep ${Math.round(reinvest.actualRate * 100)}%. Capital score ${smart.capital.score}/100. Fun after reinvest ~${money(safeToSpend)}.`;
  } else if (quality >= 50 && reinvest.deployNow > 0) {
    headline = "Deploy before you spend";
    sub = reinvest.order;
  } else if (quality >= 40) {
    headline = smart.order;
    sub = actions[0]
      ? actions[0].detail
      : `True flow ${money(smart.trueFlow.trueFlow)} · confidence ${smart.confidence}/100.`;
  } else if (hasTxs) {
    headline = "Signals forming";
    sub = "Add plan + card limits + Invest account to unlock full decisions.";
  }

  // Blend data quality with smart confidence
  quality = Math.round(quality * 0.6 + smart.confidence * 0.4);

  return {
    headline,
    sub,
    actions: actions.slice(0, 10),
    projection,
    safeToSpend,
    runwayMonths,
    topLeak,
    planHealth,
    reinvest,
    tax,
    audit,
    forecast,
    advisory,
    accounting,
    adept,
    smart,
    dataQuality: {
      hasTxs,
      hasIncome,
      hasAccounts,
      hasLimits,
      hasPlan,
      score: quality,
    },
  };
}

/** Context-aware answers from the live brief — not keyword theater */
export function answerFromBrief(
  question: string,
  brief: SmartBrief,
  extras: {
    worth: number;
    cash: number;
    debt: number;
    income: number;
    expense: number;
    cashFlow: number;
    rate: number | null;
    credit: CreditReport;
    txCount: number;
  }
): string {
  const q = question.toLowerCase().trim();
  if (!q) return "Ask a real money question — afford, runway, credit, tax, audit, hire, or what to cut.";

  if (!brief.dataQuality.hasTxs) {
    return "I don't have transactions yet. Import a bank CSV (Accounts) — then I can answer with numbers from your ledger.";
  }

  // Smart core (true books / anomalies / capital) before keyword routes
  const smartA = answerSmartCore(q, brief.smart);
  if (smartA) return smartA;
  // Adept OS + accountant backends
  const adeptA = answerAdept(q, brief.adept);
  if (adeptA) return adeptA;
  const booksA = answerAccounting(q, brief.accounting);
  if (booksA) return booksA;
  const taxA = answerTax(q, brief.tax);
  if (taxA) return taxA;
  const auditA = answerAudit(q, brief.audit);
  if (auditA) return auditA;
  const fcA = answerForecast(q, brief.forecast);
  if (fcA) return fcA;
  const advA = answerAdvisory(q, brief.advisory);
  if (advA) return advA;

  if (/reinvest|invest|compound|ruthless|save rate|keep rate/.test(q)) {
    const r = brief.reinvest;
    const rate =
      r.actualRate == null ? "unknown" : `${Math.round(r.actualRate * 100)}%`;
    return `Ruthless target ${Math.round(r.targetRate * 100)}% of income. Actual keep ${rate}. Still to deploy ${money(r.deployNow)}. Invest book ${money(r.investedBalance)}. Order: ${r.order} Fun money after reinvest: ${money(brief.safeToSpend)}.`;
  }

  if (/(afford|trip|buy|purchase|spend \$?\d)/.test(q)) {
    const m = q.match(/\$?\s*([\d,]+)/);
    const want = m ? Number(m[1].replace(/,/g, "")) : null;
    if (want != null && !Number.isNaN(want)) {
      if (brief.reinvest.deployNow > 0 && want > brief.safeToSpend) {
        return `No. Reinvest gap is still ${money(brief.reinvest.deployNow)}. Fun money after capital is only ${money(brief.safeToSpend)}. Capital first — then lifestyle.`;
      }
      if (want <= brief.safeToSpend) {
        return `Yes, within fun money after reinvest (${money(brief.safeToSpend)}). Runway ~${brief.runwayMonths > 20 ? "20+" : brief.runwayMonths.toFixed(1)} months. Don't put it on a card above 30% utilization.`;
      }
      if (want <= extras.cash) {
        return `Cash exists (${money(extras.cash)}) but it exceeds fun money after reinvest (${money(brief.safeToSpend)}). Doing it steals from compounding. Cut ${brief.topLeak ? brief.topLeak.merchant : "top merchant"} or delay.`;
      }
      return `Not safely. Need ~${money(want)} vs fun ${money(brief.safeToSpend)} and cash ${money(extras.cash)}. Projected month-end flow ${money(brief.projection.projectedFlow)}.`;
    }
    return `Fun money after reinvest: ${money(brief.safeToSpend)}. Still to deploy to Invest: ${money(brief.reinvest.deployNow)}. Name a dollar amount and I'll judge it hard.`;
  }

  if (/credit|score|fico|utilization/.test(q)) {
    const u =
      extras.credit.utilization == null
        ? "unknown (add card limits)"
        : `${Math.round(extras.credit.utilization * 100)}%`;
    const tip = extras.credit.tips[0];
    const src =
      extras.credit.scoreSource === "official"
        ? "official on the books"
        : "model estimate — enter Known score";
    return `Credit ${extras.credit.estimate} (${extras.credit.band}, ${src}). Utilization ${u}. 90-day target ${brief.adept.targets.score90d}. ${tip ? `Next: ${tip.title} — ${tip.how}` : ""} ${brief.adept.order}`;
  }

  if (/runway|broke|last|survive/.test(q)) {
    const v = brief.smart.velocity;
    return `True runway ~${brief.runwayMonths > 20 ? "20+" : brief.runwayMonths.toFixed(1)} months (${v.daysOfCash > 200 ? "200+" : v.daysOfCash} days of cash) at true burn ${money(v.trueBurnPerDay)}/day · ~${money(v.trueBurnPerMonth)}/mo. Cash ${money(extras.cash)}. ${brief.runwayMonths < 3 ? "Critical — cut fixed costs or raise income this week." : "Build toward 6+ months."}`;
  }

  if (/cut|save|reduce|leak|merchant/.test(q)) {
    if (brief.topLeak) {
      return `Biggest leak: ${brief.topLeak.merchant} (${money(brief.topLeak.total)}, ${brief.topLeak.count}×). That's the first place to cut. Plan health: ${brief.planHealth}.`;
    }
    return `No dominant merchant yet. Auto-build a plan and import more history so concentration shows up.`;
  }

  if (/project|end of month|forecast|will i/.test(q)) {
    const p = brief.projection;
    return `By month-end (day ${p.dayOfMonth}/${p.daysInMonth}): projected out ~${money(p.projectedSpend)}, in ~${money(p.projectedIncome)}, flow ~${money(p.projectedFlow)}. Based on linear pace from actuals — not magic.`;
  }

  // Default: ranked action + accountant posture
  const top = brief.actions[0];
  return (
    `${brief.headline}. ${brief.sub} Net ${money(extras.worth)} · Flow ${money(extras.cashFlow)} · ${extras.txCount} txs. ` +
    `Audit ${brief.audit.score}/100 · Tax: ${brief.tax.order} · Forecast: ${brief.forecast.order} ` +
    `Top action: ${top?.title ?? "Keep data fresh"}. ${top?.detail ?? ""}`
  );
}

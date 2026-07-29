/**
 * Rockefeller desk — deterministic owner controls built from posted ledger data.
 *
 * This module never calls a forecast "income" and never guesses a missing
 * purpose. Forecast allocations are explicitly labeled plans; actuals come
 * only from posted FinanceTx rows.
 */

import {
  moneyCents,
  type FinanceState,
  type FinanceTx,
} from "./financeStore";
import {
  isTransferLike,
  monthTrueIncome,
  monthTrueSpend,
} from "./financeTransfers";
import { normalizeTransactionCategory } from "./financeCategorize";

export const AUGUST_2026 = "2026-08";
export const AUGUST_REVENUE_TARGET = 10_000;

const EARNED_INCOME = new Set([
  "Online income",
  "Technology income",
  "Photography",
  "Reselling",
]);

const NON_OPERATING_EXPENSE = new Set([
  "Transfers",
  "Repayment",
  "Credit card payment",
]);

export type CapitalAllocation = {
  id: "tax" | "reinvest" | "invest" | "reserve" | "personal";
  label: string;
  percent: number;
  amount: number;
  rule: string;
};

export type AugustPlan = {
  targetIncome: number;
  personalCapRate: number;
  disciplineRate: number;
  allocations: CapitalAllocation[];
  personal: { label: string; amount: number; rule: string }[];
  reinvestment: { label: string; amount: number; hoursPerWeek: number }[];
};

function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

/** A capital-first plan. It is a forecast scenario, never booked revenue. */
export function buildAugustPlan(
  targetIncome = AUGUST_REVENUE_TARGET,
  personalCapRate = 0.05,
  disciplineRate = 0.01
): AugustPlan {
  const target = Math.max(0, cents(targetIncome));
  const personalRate = Math.max(0.01, Math.min(0.05, personalCapRate));
  const taxRate = 0.25;
  const investRate = 0.2;
  const reserveRate = 0.05;
  const reinvestRate = cents(1 - taxRate - investRate - reserveRate - personalRate);
  const personalAmount = cents(target * personalRate);
  const reinvestAmount = cents(target * reinvestRate);

  const allocations: CapitalAllocation[] = [
    {
      id: "tax",
      label: "Tax reserve",
      percent: taxRate,
      amount: cents(target * taxRate),
      rule: "Move on receipt; do not treat tax money as spendable cash.",
    },
    {
      id: "reinvest",
      label: "Online + technology reinvestment",
      percent: reinvestRate,
      amount: reinvestAmount,
      rule: "Release only against a named experiment, expected return, and review date.",
    },
    {
      id: "invest",
      label: "Long-term capital",
      percent: investRate,
      amount: cents(target * investRate),
      rule: "Keep separate from operating cash; deployment requires an explicit policy.",
    },
    {
      id: "reserve",
      label: "College transition reserve",
      percent: reserveRate,
      amount: cents(target * reserveRate),
      rule: "Hold for move-in, health, transport, or true surprises.",
    },
    {
      id: "personal",
      label: "Personal purchasing power",
      percent: personalRate,
      amount: personalAmount,
      rule: `Hard ceiling ${Math.round(personalRate * 100)}%; restaurant budget is $0.`,
    },
  ];

  const personal = [
    {
      label: "Healthy groceries",
      amount: cents(personalAmount * 0.6),
      rule: "Food bought for home; restaurant delivery does not qualify.",
    },
    {
      label: "Tailoring + presentation",
      amount: cents(personalAmount * 0.2),
      rule: "Alter what you own before buying replacements.",
    },
    {
      label: "Transport + laundry",
      amount: cents(personalAmount * 0.2),
      rule: "College logistics only.",
    },
    {
      label: "Restaurants",
      amount: 0,
      rule: "Banned for August.",
    },
    {
      label: "Clothing",
      amount: 0,
      rule: "Family-funded or deferred; no personal capital allocation.",
    },
  ];

  const reinvestment = [
    {
      label: "Online offers, distribution, and sales",
      amount: cents(reinvestAmount * 0.45),
      hoursPerWeek: 18,
    },
    {
      label: "Technology product building and delivery",
      amount: cents(reinvestAmount * 0.35),
      hoursPerWeek: 14,
    },
    {
      label: "Tools, hosting, data, and controlled experiments",
      amount: cents(reinvestAmount * 0.12),
      hoursPerWeek: 4,
    },
    {
      label: "Bookkeeping, collections, and owner review",
      amount: cents(reinvestAmount * 0.08),
      hoursPerWeek: 4,
    },
  ];

  return {
    targetIncome: target,
    personalCapRate: personalRate,
    disciplineRate: Math.max(0.01, Math.min(personalRate, disciplineRate)),
    allocations,
    personal,
    reinvestment,
  };
}

function categoryOf(tx: FinanceTx): string {
  return normalizeTransactionCategory(
    tx.category,
    `${tx.merchant || ""} ${tx.note || ""}`,
    tx.kind
  );
}

function postedMonth(txs: FinanceTx[], ym: string): FinanceTx[] {
  return txs.filter((tx) => !tx.pending && tx.date.startsWith(ym));
}

export type WasteFinding = {
  id: string;
  severity: "critical" | "high" | "medium";
  title: string;
  detail: string;
  amount: number;
  transactionIds: string[];
};

export type WasteReport = {
  avoidableTotal: number;
  restaurantViolations: number;
  findings: WasteFinding[];
};

/** Explainable waste controls; no inferred "usage" claims. */
export function buildWasteReport(txs: FinanceTx[], ym: string): WasteReport {
  const month = postedMonth(txs, ym);
  const findings: WasteFinding[] = [];
  const restaurants = month.filter(
    (tx) => tx.kind === "expense" && categoryOf(tx) === "Restaurants"
  );
  if (restaurants.length) {
    const amount = cents(restaurants.reduce((sum, tx) => sum + tx.amount, 0));
    findings.push({
      id: "restaurant-ban",
      severity: "critical",
      title: `Restaurant ban broken ${restaurants.length}×`,
      detail: `${moneyCents(amount)} left the capital base. Review every charge and replace the trigger with groceries prepared at home.`,
      amount,
      transactionIds: restaurants.map((tx) => tx.id),
    });
  }

  const fees = month.filter(
    (tx) => tx.kind === "expense" && categoryOf(tx) === "Fees"
  );
  if (fees.length) {
    const amount = cents(fees.reduce((sum, tx) => sum + tx.amount, 0));
    findings.push({
      id: "fees",
      severity: "high",
      title: `${fees.length} avoidable fee${fees.length === 1 ? "" : "s"}`,
      detail: `${moneyCents(amount)} produced no asset, inventory, education, or customer value.`,
      amount,
      transactionIds: fees.map((tx) => tx.id),
    });
  }

  const seen = new Map<string, FinanceTx[]>();
  for (const tx of month) {
    if (tx.kind !== "expense" || isTransferLike(tx)) continue;
    const merchant = (tx.merchant || tx.note || "").trim().toLowerCase();
    if (!merchant) continue;
    const key = `${tx.date}|${merchant}|${tx.amount.toFixed(2)}`;
    seen.set(key, [...(seen.get(key) || []), tx]);
  }
  const duplicates = [...seen.values()].filter((rows) => rows.length > 1);
  if (duplicates.length) {
    const extra = duplicates.flatMap((rows) => rows.slice(1));
    const amount = cents(extra.reduce((sum, tx) => sum + tx.amount, 0));
    findings.push({
      id: "duplicates",
      severity: "high",
      title: `${extra.length} possible duplicate charge${extra.length === 1 ? "" : "s"}`,
      detail: `${moneyCents(amount)} needs verification before the month can be trusted.`,
      amount,
      transactionIds: extra.map((tx) => tx.id),
    });
  }

  const subscriptions = month.filter(
    (tx) => tx.kind === "expense" && categoryOf(tx) === "Subscriptions"
  );
  const subscriptionTotal = cents(
    subscriptions.reduce((sum, tx) => sum + tx.amount, 0)
  );
  if (subscriptionTotal > 100) {
    findings.push({
      id: "subscription-stack",
      severity: "medium",
      title: "Subscription stack requires an owner decision",
      detail: `${moneyCents(subscriptionTotal)} this month. Keep a tool only if it has a named job and review date.`,
      amount: subscriptionTotal,
      transactionIds: subscriptions.map((tx) => tx.id),
    });
  }

  findings.sort((a, b) => {
    const rank = { critical: 3, high: 2, medium: 1 };
    return rank[b.severity] - rank[a.severity] || b.amount - a.amount;
  });
  return {
    avoidableTotal: cents(
      findings
        .filter((finding) => finding.id !== "subscription-stack")
        .reduce((sum, finding) => sum + finding.amount, 0)
    ),
    restaurantViolations: restaurants.length,
    findings,
  };
}

export type UnitEconomicsLane = {
  id: "online" | "technology" | "photography" | "reselling";
  label: string;
  revenue: number;
  directCosts: number;
  contributionProfit: number;
  margin: number | null;
  revenueTransactionIds: string[];
  costTransactionIds: string[];
};

const UNIT_LANES = [
  {
    id: "online",
    label: "Online",
    revenue: new Set(["Online income"]),
    costs: new Set(["Online business"]),
  },
  {
    id: "technology",
    label: "Technology",
    revenue: new Set(["Technology income"]),
    costs: new Set(["Technology"]),
  },
  {
    id: "photography",
    label: "Photography",
    revenue: new Set(["Photography"]),
    costs: new Set(["Photography costs"]),
  },
  {
    id: "reselling",
    label: "Reselling",
    revenue: new Set(["Reselling"]),
    costs: new Set(["Reselling costs"]),
  },
] as const;

/** Contribution economics use only explicitly tagged direct costs. */
export function buildUnitEconomics(
  txs: FinanceTx[],
  ym: string
): UnitEconomicsLane[] {
  const month = postedMonth(txs, ym);
  return UNIT_LANES.map((lane) => {
    const revenueRows = month.filter(
      (tx) => tx.kind === "income" && lane.revenue.has(categoryOf(tx) as never)
    );
    const costRows = month.filter(
      (tx) => tx.kind === "expense" && lane.costs.has(categoryOf(tx) as never)
    );
    const revenue = cents(revenueRows.reduce((sum, tx) => sum + tx.amount, 0));
    const directCosts = cents(costRows.reduce((sum, tx) => sum + tx.amount, 0));
    const contributionProfit = cents(revenue - directCosts);
    return {
      id: lane.id,
      label: lane.label,
      revenue,
      directCosts,
      contributionProfit,
      margin: revenue > 0 ? contributionProfit / revenue : null,
      revenueTransactionIds: revenueRows.map((tx) => tx.id),
      costTransactionIds: costRows.map((tx) => tx.id),
    };
  });
}

export type ProfitBridge = {
  rawMoneyIn: number;
  earnedRevenue: number;
  familyFunding: number;
  reimbursements: number;
  gifts: number;
  transfersIn: number;
  rawMoneyOut: number;
  operatingExpenses: number;
  transfersOut: number;
  debtRepayments: number;
  trueProfit: number;
};

export function buildProfitBridge(txs: FinanceTx[], ym: string): ProfitBridge {
  const month = postedMonth(txs, ym);
  let rawMoneyIn = 0;
  let earnedRevenue = 0;
  let familyFunding = 0;
  let reimbursements = 0;
  let gifts = 0;
  let transfersIn = 0;
  let rawMoneyOut = 0;
  let operatingExpenses = 0;
  let transfersOut = 0;
  let debtRepayments = 0;

  for (const tx of month) {
    const category = categoryOf(tx);
    if (tx.kind === "income") {
      rawMoneyIn += tx.amount;
      if (category === "Transfers" || isTransferLike(tx)) transfersIn += tx.amount;
      else if (EARNED_INCOME.has(category)) earnedRevenue += tx.amount;
      else if (category === "Family") familyFunding += tx.amount;
      else if (category === "Reimbursements") reimbursements += tx.amount;
      else if (category === "Gifts") gifts += tx.amount;
    } else {
      rawMoneyOut += tx.amount;
      if (category === "Transfers" || category === "Credit card payment")
        transfersOut += tx.amount;
      else if (category === "Repayment") debtRepayments += tx.amount;
      else if (category && !NON_OPERATING_EXPENSE.has(category))
        operatingExpenses += tx.amount;
    }
  }

  return {
    rawMoneyIn: cents(rawMoneyIn),
    earnedRevenue: cents(earnedRevenue),
    familyFunding: cents(familyFunding),
    reimbursements: cents(reimbursements),
    gifts: cents(gifts),
    transfersIn: cents(transfersIn),
    rawMoneyOut: cents(rawMoneyOut),
    operatingExpenses: cents(operatingExpenses),
    transfersOut: cents(transfersOut),
    debtRepayments: cents(debtRepayments),
    trueProfit: cents(earnedRevenue - operatingExpenses),
  };
}

export type ReimbursementMatch = {
  reimbursementId: string;
  expenseId: string;
  payee: string;
  amount: number;
  daysApart: number;
  confidence: "exact" | "partial";
};

export type ReimbursementDesk = {
  received: number;
  matched: number;
  unmatched: number;
  matches: ReimbursementMatch[];
  unmatchedIds: string[];
};

function dayDistance(left: string, right: string): number {
  const a = Date.parse(`${left}T12:00:00`);
  const b = Date.parse(`${right}T12:00:00`);
  return Math.round(Math.abs(a - b) / 86_400_000);
}

/**
 * Match reimbursement credits to prior external expenses. Exact amount wins;
 * partial matches are allowed only when the credit is no larger than the
 * expense and both rows are within 60 days.
 */
export function buildReimbursementDesk(
  txs: FinanceTx[],
  throughYm: string
): ReimbursementDesk {
  const through = `${throughYm}-31`;
  const expenses = txs
    .filter(
      (tx) =>
        !tx.pending &&
        tx.kind === "expense" &&
        tx.date <= through &&
        !isTransferLike(tx)
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  const credits = txs
    .filter(
      (tx) =>
        !tx.pending &&
        tx.kind === "income" &&
        tx.date <= through &&
        categoryOf(tx) === "Reimbursements"
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const used = new Set<string>();
  const matches: ReimbursementMatch[] = [];
  const unmatchedIds: string[] = [];

  for (const credit of credits) {
    const candidates = expenses
      .filter(
        (expense) =>
          !used.has(expense.id) &&
          expense.date <= credit.date &&
          dayDistance(expense.date, credit.date) <= 60 &&
          expense.amount + 0.005 >= credit.amount
      )
      .sort((a, b) => {
        const exactA = Math.abs(a.amount - credit.amount) < 0.005 ? 1 : 0;
        const exactB = Math.abs(b.amount - credit.amount) < 0.005 ? 1 : 0;
        return (
          exactB - exactA ||
          dayDistance(a.date, credit.date) - dayDistance(b.date, credit.date)
        );
      });
    const expense = candidates[0];
    if (!expense) {
      unmatchedIds.push(credit.id);
      continue;
    }
    used.add(expense.id);
    matches.push({
      reimbursementId: credit.id,
      expenseId: expense.id,
      payee: expense.merchant || expense.note || "Expense",
      amount: credit.amount,
      daysApart: dayDistance(expense.date, credit.date),
      confidence:
        Math.abs(expense.amount - credit.amount) < 0.005 ? "exact" : "partial",
    });
  }

  const received = cents(credits.reduce((sum, tx) => sum + tx.amount, 0));
  const matched = cents(matches.reduce((sum, match) => sum + match.amount, 0));
  return {
    received,
    matched,
    unmatched: cents(received - matched),
    matches,
    unmatchedIds,
  };
}

export type OwnerReport = {
  ym: string;
  trueIncome: number;
  trueSpend: number;
  trueFlow: number;
  earnedRevenue: number;
  trueProfit: number;
  restaurantViolations: number;
  reimbursementUnmatched: number;
  allocationVariance: number;
  actions: string[];
};

export function buildOwnerReport(
  state: FinanceState,
  ym: string,
  plan: AugustPlan
): OwnerReport {
  const waste = buildWasteReport(state.txs, ym);
  const bridge = buildProfitBridge(state.txs, ym);
  const reimbursements = buildReimbursementDesk(state.txs, ym);
  const trueIncome = monthTrueIncome(state.txs, ym);
  const trueSpend = monthTrueSpend(state.txs, ym);
  const personalCap =
    plan.allocations.find((line) => line.id === "personal")?.amount || 0;
  const actions: string[] = [];

  if (waste.restaurantViolations > 0)
    actions.push(
      `Restaurant rule failed ${waste.restaurantViolations}×. Review the charges and reset meal preparation today.`
    );
  else actions.push("Restaurant rule intact: $0 posted.");

  if (reimbursements.unmatched > 0)
    actions.push(
      `Match ${moneyCents(reimbursements.unmatched)} of reimbursement credits to their original expenses.`
    );

  const missingLane = buildUnitEconomics(state.txs, ym).find(
    (lane) => lane.revenue > 0 && lane.directCosts === 0
  );
  if (missingLane)
    actions.push(
      `${missingLane.label} has revenue but no tagged direct costs; verify whether its contribution margin is genuinely 100%.`
    );

  if (ym === AUGUST_2026 && bridge.operatingExpenses > personalCap)
    actions.push(
      `Personal/operating outflow is ${moneyCents(bridge.operatingExpenses - personalCap)} above the ${moneyCents(personalCap)} August purchasing-power ceiling.`
    );

  if (!actions.length)
    actions.push("Close the month: reconcile balances, attach evidence, and deploy surplus.");

  return {
    ym,
    trueIncome: cents(trueIncome),
    trueSpend: cents(trueSpend),
    trueFlow: cents(trueIncome - trueSpend),
    earnedRevenue: bridge.earnedRevenue,
    trueProfit: bridge.trueProfit,
    restaurantViolations: waste.restaurantViolations,
    reimbursementUnmatched: reimbursements.unmatched,
    allocationVariance: cents(plan.targetIncome - bridge.earnedRevenue),
    actions,
  };
}

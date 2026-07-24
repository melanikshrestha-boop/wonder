/**
 * Budgeting & forecasting — backend only.
 * Tracks spend vs plan, projects forward, flags growth/profitability risk.
 */

import {
  monthExpense,
  monthIncome,
  monthKey,
  money,
  monthlySeries,
  type FinanceState,
  type FinanceTx,
} from "./financeStore";

export type ForecastProjection = {
  dayOfMonth: number;
  daysInMonth: number;
  spentSoFar: number;
  incomeSoFar: number;
  projectedSpend: number;
  projectedIncome: number;
  projectedFlow: number;
  burnPerDay: number;
};

function projectMonthLocal(txs: FinanceTx[], ym: string): ForecastProjection {
  const [y, m] = ym.split("-").map(Number);
  const dim = new Date(y, m, 0).getDate();
  const today = new Date();
  const thisYm = monthKey(today);
  const dayOfMonth = ym === thisYm ? Math.max(1, today.getDate()) : dim;
  const spentSoFar = monthExpense(txs, ym);
  const incomeSoFar = monthIncome(txs, ym);
  const burnPerDay = spentSoFar / dayOfMonth;
  const incomePerDay = incomeSoFar / dayOfMonth;
  const projectedSpend = burnPerDay * dim;
  const projectedIncome = incomePerDay * dim;
  return {
    dayOfMonth,
    daysInMonth: dim,
    spentSoFar,
    incomeSoFar,
    projectedSpend,
    projectedIncome,
    projectedFlow: projectedIncome - projectedSpend,
    burnPerDay,
  };
}

export type ForecastFinding = {
  id: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  detail: string;
  amount?: number;
};

export type ForecastBrief = {
  projection: ForecastProjection;
  /** Last 6 months trend */
  series: { ym: string; income: number; expense: number; flow: number }[];
  avgIncome3: number;
  avgExpense3: number;
  avgFlow3: number;
  /** Next 3 months if pace holds */
  forward: { ym: string; income: number; expense: number; flow: number }[];
  variance: { category: string; planned: number; spent: number; delta: number }[];
  findings: ForecastFinding[];
  order: string;
};

function nextYm(ym: string, add: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + add, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function buildForecastBrief(
  state: FinanceState,
  ym: string,
  planRows: { id: string; label: string; planned: number; spent: number }[]
): ForecastBrief {
  const txs = state.txs;
  const projection = projectMonthLocal(txs, ym);
  const series = monthlySeries(txs, 6);
  const last3 = series.slice(-3);
  const avgIncome3 =
    last3.reduce((s, r) => s + r.income, 0) / Math.max(1, last3.length);
  const avgExpense3 =
    last3.reduce((s, r) => s + r.expense, 0) / Math.max(1, last3.length);
  const avgFlow3 = avgIncome3 - avgExpense3;

  const forward = [1, 2, 3].map((i) => {
    const key = nextYm(ym, i);
    return {
      ym: key,
      income: Math.round(avgIncome3 * 100) / 100,
      expense: Math.round(avgExpense3 * 100) / 100,
      flow: Math.round((avgIncome3 - avgExpense3) * 100) / 100,
    };
  });

  const variance = planRows
    .filter((r) => r.planned > 0 || r.spent > 0)
    .map((r) => ({
      category: r.label,
      planned: r.planned,
      spent: r.spent,
      delta: r.spent - r.planned,
    }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const findings: ForecastFinding[] = [];
  const income = monthIncome(txs, ym);
  const expense = monthExpense(txs, ym);

  if (projection.projectedFlow < 0) {
    findings.push({
      id: "fc-neg",
      severity: "critical",
      title: "Month projected red",
      detail: `Linear pace → month-end flow ${money(projection.projectedFlow)}. Cut ${money(Math.abs(projection.projectedFlow))} or raise inflows.`,
      amount: Math.abs(projection.projectedFlow),
    });
  }

  if (avgFlow3 < 0) {
    findings.push({
      id: "fc-trend",
      severity: "high",
      title: "3-month average cash flow is negative",
      detail: `Avg in ${money(avgIncome3)} · out ${money(avgExpense3)} · flow ${money(avgFlow3)}. Growth plan is blocked until this flips.`,
      amount: Math.abs(avgFlow3),
    });
  }

  // Spend accelerating vs prior month
  if (series.length >= 2) {
    const prev = series[series.length - 2];
    const cur = series[series.length - 1];
    if (prev.expense > 0 && cur.expense > prev.expense * 1.25) {
      findings.push({
        id: "fc-accel",
        severity: "high",
        title: "Spending accelerating >25% month-over-month",
        detail: `${money(prev.expense)} → ${money(cur.expense)}. Freeze non-essentials; reinvest requires surplus.`,
        amount: cur.expense - prev.expense,
      });
    }
  }

  for (const v of variance.slice(0, 4)) {
    if (v.planned > 0 && v.spent > v.planned * 1.1) {
      findings.push({
        id: `fc-var-${v.category}`,
        severity: v.spent > v.planned * 1.4 ? "high" : "medium",
        title: `${v.category} over budget`,
        detail: `Spent ${money(v.spent)} vs plan ${money(v.planned)} (Δ ${money(v.delta)}).`,
        amount: v.delta,
      });
    }
  }

  if (planRows.every((r) => r.planned === 0) && expense > 0) {
    findings.push({
      id: "fc-no-plan",
      severity: "medium",
      title: "No budget plan loaded",
      detail: "Auto-build plan from history so variance and forecasts have a baseline.",
    });
  }

  // Forward cumulative
  const forwardSum = forward.reduce((s, f) => s + f.flow, 0);
  if (forwardSum < 0) {
    findings.push({
      id: "fc-3m",
      severity: "high",
      title: "Next 90 days projected net negative",
      detail: `If last-3-month pace holds: ${money(forwardSum)} over 3 months. Restructure spend before any hire/equipment fantasy.`,
      amount: Math.abs(forwardSum),
    });
  }

  if (!findings.length) {
    findings.push({
      id: "fc-ok",
      severity: "info",
      title: "Forecast stable at current pace",
      detail: `This month in ${money(income)} out ${money(expense)}. 3-mo avg flow ${money(avgFlow3)}.`,
    });
  }

  const order =
    findings[0]?.severity === "info"
      ? "Hold the line — keep posting daily and protect surplus for Invest."
      : findings[0].title;

  return {
    projection,
    series,
    avgIncome3: Math.round(avgIncome3 * 100) / 100,
    avgExpense3: Math.round(avgExpense3 * 100) / 100,
    avgFlow3: Math.round(avgFlow3 * 100) / 100,
    forward,
    variance,
    findings: findings.slice(0, 10),
    order,
  };
}

export function answerForecast(
  question: string,
  fc: ForecastBrief
): string | null {
  const q = question.toLowerCase();
  if (!/(forecast|budget|project|next month|trend|will i|future|pace)/.test(q))
    return null;
  const f0 = fc.forward[0];
  return (
    `Forecast (pace-based). 3-mo avg in ${money(fc.avgIncome3)} out ${money(fc.avgExpense3)} flow ${money(fc.avgFlow3)}. ` +
    (f0
      ? `Next month if unchanged: in ~${money(f0.income)} out ~${money(f0.expense)} flow ~${money(f0.flow)}. `
      : "") +
    `This month projected flow ${money(fc.projection.projectedFlow)}. Order: ${fc.order}`
  );
}

/**
 * Excel-level smart budgeter with automated intelligence.
 * $500/month limit + behavioral forecasting + credit impact warnings.
 * Not financial advice. Use as guidance only.
 */

import type { FinanceTx } from "./financeStore";
import { isTransferLike } from "./financeTransfers";

export type BudgetAlert = {
  type: "warning" | "critical" | "info";
  message: string;
  impact?: "credit" | "runway" | "savings";
  actionable: boolean;
};

export type CategorySpend = {
  category: string;
  spent: number;
  budget: number;
  utilization: number; // 0-1, >1 = over budget
  trend: "up" | "down" | "flat"; // vs last month
  daysLeft: number;
};

export type BudgetForecast = {
  today: number;
  daysLeftInMonth: number;
  dailyBurn: number; // spent per day
  forecastedTotal: number; // if trend continues
  overBudget: boolean;
  overBy: number;
  daysUntilOverBudget: number; // if continuing current pace
  /** What you can spend today and still land under the limit */
  safeToSpendToday: number;
};

export type SmartBudgetState = {
  monthlyLimit: number; // e.g. 500
  essentialLimit: number; // percent of monthly (default 60%)
  savingsTarget: number; // percent of income (default 20%)
  autoAlerts: boolean; // send warnings at 70%, 90%, 100%
};

/** Month string YYYY-MM */
function currentMonth(today = new Date()): string {
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Smart budget score: how well you're tracking to the limit.
 * 100 = perfect, <0 = over budget, with grace zones.
 */
export function budgetScore(spent: number, limit: number): number {
  const utilization = spent / limit;
  if (utilization <= 0.7) return 100;
  if (utilization <= 0.9) return 90 - (utilization - 0.7) * 50; // 90 to 80
  if (utilization <= 1.0) return 80 - (utilization - 0.9) * 100; // 80 to -20
  const overPct = ((utilization - 1.0) * limit) / limit;
  return Math.max(-50, 0 - overPct * 150);
}

/**
 * Analyze spending by category for the current month.
 * Includes trend vs last month + intelligent budgeting per category.
 */
export function analyzeSpending(
  txs: FinanceTx[],
  monthlyLimit: number = 500,
  today = new Date()
): {
  currentMonth: CategorySpend[];
  totalSpent: number;
  percentOfBudget: number;
} {
  const ym = currentMonth(today);
  // Local-time month arithmetic (toISOString shifts across UTC midnight)
  const lm = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastYm = `${lm.getFullYear()}-${String(lm.getMonth() + 1).padStart(2, "0")}`;

  // Current month by category
  const byCategory = new Map<string, number>();
  const lastMonthByCategory = new Map<string, number>();

  for (const t of txs) {
    if (isTransferLike(t)) continue;
    if (t.kind !== "expense") continue;

    if (t.date.startsWith(ym)) {
      byCategory.set(t.category, (byCategory.get(t.category) || 0) + t.amount);
    } else if (t.date.startsWith(lastYm)) {
      lastMonthByCategory.set(t.category, (lastMonthByCategory.get(t.category) || 0) + t.amount);
    }
  }

  const totalSpent = Array.from(byCategory.values()).reduce((a, b) => a + b, 0);
  const analyzed: CategorySpend[] = Array.from(byCategory.entries()).map(
    ([cat, spent]) => {
      const lastSpent = lastMonthByCategory.get(cat) || spent * 0.8; // Assume 20% growth if new
      const trend: "up" | "down" | "flat" =
        spent > lastSpent * 1.1 ? "up" : spent < lastSpent * 0.9 ? "down" : "flat";

      // Allocate budget per category proportionally
      const categoryBudget = (spent / totalSpent) * monthlyLimit * 1.1; // 10% buffer

      return {
        category: cat,
        spent,
        budget: Math.round(categoryBudget * 100) / 100,
        utilization: Math.round((spent / categoryBudget) * 100) / 100,
        trend,
        daysLeft: daysInMonth(today.getFullYear(), today.getMonth()) - today.getDate(),
      };
    }
  );

  return {
    currentMonth: analyzed.sort((a, b) => b.spent - a.spent),
    totalSpent: Math.round(totalSpent * 100) / 100,
    percentOfBudget: Math.round((totalSpent / monthlyLimit) * 10000) / 100,
  };
}

/**
 * Forecast month-end spending based on current pace.
 * Critical for knowing if you'll overshoot before it happens.
 */
export function forecastSpending(
  txs: FinanceTx[],
  monthlyLimit: number = 500,
  today = new Date()
): BudgetForecast {
  const ym = currentMonth(today);
  const currentDay = today.getDate();
  const daysInCurrentMonth = daysInMonth(today.getFullYear(), today.getMonth());
  const daysLeftInMonth = daysInCurrentMonth - currentDay;

  let spent = 0;
  for (const t of txs) {
    if (t.date.startsWith(ym) && !isTransferLike(t) && t.kind === "expense") {
      spent += t.amount;
    }
  }

  const dailyBurn = spent / Math.max(currentDay, 1);
  const forecastedTotal = dailyBurn * daysInCurrentMonth;
  const overBudget = forecastedTotal > monthlyLimit;
  const overBy = Math.max(0, forecastedTotal - monthlyLimit);

  // Days until over budget at current pace
  let daysUntilOver = Infinity;
  if (dailyBurn > monthlyLimit / daysInCurrentMonth) {
    daysUntilOver = Math.ceil((monthlyLimit - spent) / dailyBurn);
  }

  // Spread what's left evenly across the remaining days (incl. today)
  const safeToSpendToday =
    Math.round(
      (Math.max(0, monthlyLimit - spent) / Math.max(1, daysLeftInMonth + 1)) *
        100
    ) / 100;

  return {
    today: Math.round(spent * 100) / 100,
    daysLeftInMonth,
    dailyBurn: Math.round(dailyBurn * 100) / 100,
    forecastedTotal: Math.round(forecastedTotal * 100) / 100,
    overBudget,
    overBy: Math.round(overBy * 100) / 100,
    daysUntilOverBudget: daysUntilOver === Infinity ? daysLeftInMonth : daysUntilOver,
    safeToSpendToday,
  };
}

/**
 * Generate intelligent alerts based on spending + credit impact.
 * Connects overspending to credit score degradation.
 */
export function generateBudgetAlerts(
  txs: FinanceTx[],
  monthlyLimit: number = 500,
  currentScore: number = 700,
  today = new Date()
): BudgetAlert[] {
  const alerts: BudgetAlert[] = [];
  const forecast = forecastSpending(txs, monthlyLimit, today);
  const analysis = analyzeSpending(txs, monthlyLimit, today);

  // Utilization alerts
  if (analysis.percentOfBudget >= 100) {
    alerts.push({
      type: "critical",
      message: `Over budget by $${(analysis.totalSpent - monthlyLimit).toFixed(2)}. Continuing at current pace will impact credit utilization and score.`,
      impact: "credit",
      actionable: true,
    });
  } else if (analysis.percentOfBudget >= 90) {
    alerts.push({
      type: "warning",
      message: `${analysis.percentOfBudget.toFixed(1)}% of budget used. ${forecast.daysLeftInMonth} days left at $${forecast.dailyBurn}/day.`,
      actionable: true,
    });
  } else if (analysis.percentOfBudget >= 70) {
    alerts.push({
      type: "info",
      message: `On track: ${analysis.percentOfBudget.toFixed(1)}% spent. Stay consistent to finish under limit.`,
      actionable: false,
    });
  }

  // Forecast alerts
  if (forecast.overBudget) {
    alerts.push({
      type: "critical",
      message: `Forecasted to overshoot by $${forecast.overBy.toFixed(2)} (${(
        (forecast.forecastedTotal / monthlyLimit) * 100
      ).toFixed(0)}% of budget). Will hit limit in ${forecast.daysUntilOverBudget} days.`,
      impact: "runway",
      actionable: true,
    });
  }

  // Category-level alerts
  for (const cat of analysis.currentMonth) {
    if (cat.utilization >= 1.0 && cat.trend === "up") {
      alerts.push({
        type: "warning",
        message: `${cat.category} is rising (${cat.trend}) and over budget. Trending up—cut soon.`,
        actionable: true,
      });
    }
  }

  // Credit score alerts (low scores = harder to manage debt)
  if (currentScore < 620) {
    alerts.push({
      type: "critical",
      message: `Credit score ${currentScore} is poor. Overspending now could cost thousands in higher rates later. Stay disciplined.`,
      impact: "credit",
      actionable: false,
    });
  }

  return alerts.sort((a, b) => {
    const typePriority: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    return typePriority[a.type] - typePriority[b.type];
  });
}

/**
 * Suggest where to cut spending to hit the limit.
 * Intelligent: preserves essentials, suggests discretionary cuts.
 */
export function suggestCuts(
  categories: CategorySpend[],
  target: number, // how much to cut
  essentials: Set<string> = new Set([
    "Rent / housing",
    "Utilities",
    "Food / groceries",
    "Transport",
    "Health",
  ])
): { category: string; cut: number; reasoning: string }[] {
  const suggestions: { category: string; cut: number; reasoning: string }[] = [];

  // Separate essentials from discretionary
  const discretionary = categories.filter((c) => !essentials.has(c.category));
  const essential = categories.filter((c) => essentials.has(c.category));

  let remaining = target;

  // First: cut over-budget discretionary categories
  for (const cat of discretionary.sort((a, b) => b.utilization - a.utilization)) {
    if (remaining <= 0) break;
    const cutAmount = Math.min(cat.spent * (cat.utilization - 1.0), remaining);
    if (cutAmount > 1) {
      suggestions.push({
        category: cat.category,
        cut: Math.round(cutAmount * 100) / 100,
        reasoning: `${cat.category} is ${(cat.utilization * 100).toFixed(0)}% over. Non-essential.`,
      });
      remaining -= cutAmount;
    }
  }

  // Second: trim discretionary by 10% (behavioral)
  if (remaining > 0) {
    for (const cat of discretionary.sort((a, b) => b.spent - a.spent)) {
      if (remaining <= 0) break;
      const cutAmount = Math.min(cat.spent * 0.1, remaining);
      if (cutAmount > 1) {
        suggestions.push({
          category: cat.category,
          cut: Math.round(cutAmount * 100) / 100,
          reasoning: `Trim 10% from ${cat.category} (trending up).`,
        });
        remaining -= cutAmount;
      }
    }
  }

  // Third: gentle reduce on essentials only if needed
  if (remaining > 0) {
    for (const cat of essential.sort((a, b) => b.spent - a.spent)) {
      if (remaining <= 0) break;
      const cutAmount = Math.min(cat.spent * 0.05, remaining);
      if (cutAmount > 1) {
        suggestions.push({
          category: cat.category,
          cut: Math.round(cutAmount * 100) / 100,
          reasoning: `Small trim to ${cat.category} (5%). Essential but may have flexibility.`,
        });
        remaining -= cutAmount;
      }
    }
  }

  return suggestions;
}

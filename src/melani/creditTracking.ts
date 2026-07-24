/**
 * Credit score tracking and payment reminders.
 * Daily snapshots with alerts for approaching payment due dates.
 * Prevents missed payments from damaging credit.
 */

import type { FinanceAccount } from "./financeStore";

export type CreditSnapshot = {
  date: string; // YYYY-MM-DD
  score: number; // 300-850
  factors: {
    paymentHistory: number; // 35% weight — payment timing
    utilization: number; // 30% weight — % of limit used
    ageOfAccounts: number; // 15% weight
    creditMix: number; // 10% weight
    hardInquiries: number; // 10% weight
  };
  trend: "up" | "down" | "flat"; // vs last snapshot
};

export type PaymentReminder = {
  accountId: string;
  accountName: string;
  dueDate: string; // YYYY-MM-DD
  daysUntilDue: number;
  urgency: "critical" | "warning" | "info"; // 0-2 days: critical, 3-7: warning
  lastPaymentDate?: string;
  minimumAmount?: number;
};

export type CreditTrackingState = {
  version: 1;
  snapshots: CreditSnapshot[]; // kept sorted oldest → newest
};

const KEY = "wonder-credit-tracking-v1";

export function loadCreditTracking(): CreditTrackingState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { version: 1, snapshots: [] };
    const parsed = JSON.parse(raw) as Partial<CreditTrackingState>;
    return {
      version: 1,
      snapshots: Array.isArray(parsed.snapshots)
        ? parsed.snapshots.sort((a, b) => a.date.localeCompare(b.date))
        : [],
    };
  } catch {
    return { version: 1, snapshots: [] };
  }
}

export function saveCreditTracking(state: CreditTrackingState) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...state, version: 1 }));
  } catch {
    /* ignore */
  }
}

/**
 * Add a daily credit score snapshot.
 * Returns updated state; duplicates on same day are ignored.
 */
export function recordCreditScore(
  state: CreditTrackingState,
  score: number,
  factors?: CreditSnapshot["factors"]
): CreditTrackingState {
  const today = new Date().toISOString().slice(0, 10);

  // Check if already recorded today
  if (state.snapshots.some((s) => s.date === today)) {
    return state;
  }

  // Determine trend vs previous
  const prev =
    state.snapshots.length > 0
      ? state.snapshots[state.snapshots.length - 1]
      : null;
  const trend: "up" | "down" | "flat" =
    !prev || score === prev.score
      ? "flat"
      : score > prev.score
        ? "up"
        : "down";

  const snapshot: CreditSnapshot = {
    date: today,
    score: Math.max(300, Math.min(850, Math.round(score))),
    factors: factors || {
      paymentHistory: 0,
      utilization: 0,
      ageOfAccounts: 0,
      creditMix: 0,
      hardInquiries: 0,
    },
    trend,
  };

  return {
    version: 1,
    snapshots: [...state.snapshots, snapshot].sort((a, b) =>
      a.date.localeCompare(b.date)
    ),
  };
}

/**
 * Latest recorded score (today or most recent).
 */
export function latestScore(
  state: CreditTrackingState
): CreditSnapshot | null {
  return state.snapshots.length > 0
    ? state.snapshots[state.snapshots.length - 1]
    : null;
}

/**
 * Upcoming payment reminders from account due dates.
 * Only includes credit cards with a dueDay set.
 */
export function paymentReminders(
  accounts: FinanceAccount[],
  today = new Date()
): PaymentReminder[] {
  const reminders: PaymentReminder[] = [];
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  for (const acct of accounts) {
    if (acct.kind !== "credit" || !acct.dueDay) continue;

    // Calculate next due date
    let dueDate = new Date(currentYear, currentMonth, acct.dueDay);
    if (dueDate.getTime() <= today.getTime()) {
      // Due day has passed this month, next due is next month
      dueDate = new Date(currentYear, currentMonth + 1, acct.dueDay);
    }

    const dueDateIso = dueDate.toISOString().slice(0, 10);
    const daysUntilDue = Math.floor(
      (dueDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)
    );

    // Only show reminders for upcoming payments (within ~2 weeks)
    if (daysUntilDue > 14) continue;

    const urgency: "critical" | "warning" | "info" =
      daysUntilDue <= 2 ? "critical" : daysUntilDue <= 7 ? "warning" : "info";

    reminders.push({
      accountId: acct.id,
      accountName: acct.name,
      dueDate: dueDateIso,
      daysUntilDue,
      urgency,
      minimumAmount: acct.creditLimit
        ? Math.round(acct.creditLimit * 0.02 * 100) / 100
        : undefined,
    });
  }

  return reminders.sort((a, b) => a.daysUntilDue - b.daysUntilDue);
}

/**
 * Score trend over last N days.
 * Useful for detecting decline patterns.
 */
export function scoreTrend(
  state: CreditTrackingState,
  days = 30
): {
  average: number;
  change: number; // vs first day in window
  lowPoint: number;
  highPoint: number;
} {
  if (state.snapshots.length === 0) {
    return { average: 0, change: 0, lowPoint: 0, highPoint: 0 };
  }

  const now = new Date();
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const relevant = state.snapshots.filter((s) => s.date >= cutoff);
  if (relevant.length === 0) {
    return { average: 0, change: 0, lowPoint: 0, highPoint: 0 };
  }

  const scores = relevant.map((s) => s.score);
  const average = Math.round(
    scores.reduce((a, b) => a + b, 0) / scores.length
  );
  const change = scores[scores.length - 1] - scores[0];
  const lowPoint = Math.min(...scores);
  const highPoint = Math.max(...scores);

  return { average, change, lowPoint, highPoint };
}

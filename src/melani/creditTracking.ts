/**
 * Credit score tracking and payment reminders.
 * Daily snapshots with alerts for approaching payment due dates.
 * Prevents missed payments from damaging credit.
 */

import type { FinanceAccount, FinanceTx } from "./financeStore";

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

const CARD_PAYMENT_RE =
  /card payment|payment to .{0,20}card|credit crd|autopay|epay|payment thank you/i;

export type InferredPayday = {
  /** Card name as it appears in payment descriptions */
  label: string;
  /** Most common day-of-month you pay this card */
  dayOfMonth: number;
  /** How many payments back the pattern */
  occurrences: number;
  lastPaymentDate: string;
  /** Next expected payment date based on the pattern */
  nextExpected: string;
  daysUntil: number;
  urgency: "critical" | "warning" | "info";
};

/**
 * The owner doesn't know their card due dates — so learn them from the
 * ledger. Groups card-payment rows by payee, finds the most common
 * day-of-month, and projects the next expected payment. Explainable:
 * "you've paid this card N times, usually around day D."
 */
export function inferCardPaydays(
  txs: FinanceTx[],
  today = new Date()
): InferredPayday[] {
  const byCard = new Map<string, { days: number[]; last: string }>();
  for (const t of txs) {
    if (t.kind !== "expense") continue;
    const text = `${t.merchant || ""} ${t.note || ""}`;
    if (!CARD_PAYMENT_RE.test(text)) continue;
    const label = (t.merchant || t.note || "Card").trim();
    const day = Number(t.date.slice(8, 10));
    if (!day) continue;
    const rec = byCard.get(label) || { days: [], last: "" };
    rec.days.push(day);
    if (t.date > rec.last) rec.last = t.date;
    byCard.set(label, rec);
  }

  const out: InferredPayday[] = [];
  const todayMs = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  ).getTime();
  for (const [label, rec] of byCard) {
    if (rec.days.length < 2) continue; // one payment is not a pattern
    // Mode of day-of-month (ties → earliest day, safer to remind early)
    const counts = new Map<number, number>();
    for (const d of rec.days) counts.set(d, (counts.get(d) || 0) + 1);
    const dayOfMonth = [...counts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0] - b[0]
    )[0][0];

    let next = new Date(today.getFullYear(), today.getMonth(), dayOfMonth);
    if (next.getTime() < todayMs) {
      next = new Date(today.getFullYear(), today.getMonth() + 1, dayOfMonth);
    }
    const y = next.getFullYear();
    const m = String(next.getMonth() + 1).padStart(2, "0");
    const d = String(next.getDate()).padStart(2, "0");
    const daysUntil = Math.round((next.getTime() - todayMs) / 86400000);

    out.push({
      label,
      dayOfMonth,
      occurrences: rec.days.length,
      lastPaymentDate: rec.last,
      nextExpected: `${y}-${m}-${d}`,
      daysUntil,
      urgency:
        daysUntil <= 2 ? "critical" : daysUntil <= 7 ? "warning" : "info",
    });
  }
  return out.sort((a, b) => a.daysUntil - b.daysUntil);
}

export type UtilizationLine = {
  accountName: string;
  balance: number;
  limit: number;
  /** 0–1 */
  utilization: number;
  /** Dollars to pay to get under 30% (0 if already under) */
  payToThirty: number;
};

/**
 * Credit utilization per card + overall. Utilization is ~30% of the
 * score — the fastest lever. payToThirty shows the exact paydown.
 */
export function creditUtilization(accounts: FinanceAccount[]): {
  lines: UtilizationLine[];
  overall: number | null;
} {
  const lines: UtilizationLine[] = [];
  let totalBal = 0;
  let totalLim = 0;
  for (const a of accounts) {
    if (a.kind !== "credit" || !a.creditLimit || a.creditLimit <= 0) continue;
    const utilization = a.balance / a.creditLimit;
    totalBal += a.balance;
    totalLim += a.creditLimit;
    lines.push({
      accountName: a.name,
      balance: a.balance,
      limit: a.creditLimit,
      utilization: Math.round(utilization * 1000) / 1000,
      payToThirty: Math.max(
        0,
        Math.round((a.balance - a.creditLimit * 0.3) * 100) / 100
      ),
    });
  }
  return {
    lines: lines.sort((a, b) => b.utilization - a.utilization),
    overall: totalLim > 0 ? Math.round((totalBal / totalLim) * 1000) / 1000 : null,
  };
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

/**
 * Credit health for Wonder Finances.
 *
 * When you know your real bureau score (e.g. 677), that number WINS.
 * We still score the levers (util, on-time, history) so tips stay sharp.
 *
 * Official FICO/Vantage still come from bureaus / Credit Karma / bank app.
 * This desk coaches the climb.
 */

import type { FinanceAccount } from "./financeStore";

export type CreditProfile = {
  /** 0–100: % of payments on time (you know your truth) */
  onTimePct: number;
  /** Years of credit history */
  historyYears: number;
  /** Hard inquiries in last 12 months */
  hardInquiries: number;
  /** Total credit cards / loans you have open */
  openAccounts: number;
  /** Ever 30+ days late in last 2 years? */
  recentLates: number;
  /** Collections / charge-offs open */
  collections: number;
  /**
   * Real bureau score you pulled (e.g. 677).
   * When set, the desk displays THIS as the score — not a blended guess.
   */
  knownScore?: number | null;
  scoreProvider?: string | null;
  scoreModel?: string | null;
  scoreBureau?: string | null;
  cashFloor?: number | null;
};

export type CreditFactor = {
  id: string;
  label: string;
  weight: number; // % of model
  score: number; // 0–100 for this factor
  detail: string;
  status: "good" | "ok" | "bad";
};

export type CreditTip = {
  priority: "now" | "this_month" | "this_year";
  title: string;
  why: string;
  how: string;
};

export type CreditReport = {
  /** Display score: official knownScore when set, else model */
  estimate: number;
  /** Model-only 300–850 (ignores known) — for "what levers say" */
  modelEstimate: number;
  band: "Poor" | "Fair" | "Good" | "Very good" | "Excellent";
  factors: CreditFactor[];
  tips: CreditTip[];
  utilization: number | null; // 0–1 or null if no limits
  /** official = knownScore set; estimate = pure model */
  scoreSource: "official" | "estimate";
  disclaimer: string;
};

/** Melani's real current score — source of truth until she updates it */
export const REAL_CREDIT_SCORE = 677;

export const DEFAULT_CREDIT_PROFILE: CreditProfile = {
  onTimePct: 95,
  historyYears: 3,
  hardInquiries: 1,
  openAccounts: 2,
  recentLates: 0,
  collections: 0,
  knownScore: REAL_CREDIT_SCORE,
  scoreProvider: null,
  scoreModel: null,
  scoreBureau: null,
  cashFloor: 300,
};

const DISCLAIMER_OFFICIAL =
  "This is YOUR reported score on the books (not a guess). Update it when Credit Karma / your bank / a bureau pull changes. Tips still use utilization + payment levers.";

const DISCLAIMER_ESTIMATE =
  "Educational model only — not official FICO. Enter your real score in Known score so the desk coaches the truth.";

function band(score: number): CreditReport["band"] {
  if (score >= 800) return "Excellent";
  if (score >= 740) return "Very good";
  if (score >= 670) return "Good";
  if (score >= 580) return "Fair";
  return "Poor";
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

/** Utilization from credit accounts that have a limit set */
export function creditUtilization(accounts: FinanceAccount[]): {
  used: number;
  limit: number;
  ratio: number | null;
} {
  let used = 0;
  let limit = 0;
  for (const a of accounts) {
    if (a.kind !== "credit") continue;
    used += Math.max(0, a.balance);
    const lim = a.creditLimit ?? 0;
    if (lim > 0) limit += lim;
  }
  if (limit <= 0) return { used, limit: 0, ratio: null };
  return { used, limit, ratio: used / limit };
}

function utilScore(ratio: number | null): {
  score: number;
  detail: string;
  status: CreditFactor["status"];
} {
  if (ratio == null) {
    return {
      score: 50,
      detail:
        "Add your card limit — utilization is the fastest lever from 677 toward 700.",
      status: "ok",
    };
  }
  const pct = Math.round(ratio * 100);
  if (ratio <= 0.09)
    return {
      score: 98,
      detail: `${pct}% used — under 10% is elite for a 677 climb.`,
      status: "good",
    };
  if (ratio <= 0.29)
    return {
      score: 88,
      detail: `${pct}% used — under 30% is the floor; push under 10%.`,
      status: "good",
    };
  if (ratio <= 0.49)
    return {
      score: 65,
      detail: `${pct}% used — get under 30% before statement close.`,
      status: "ok",
    };
  if (ratio <= 0.74)
    return {
      score: 40,
      detail: `${pct}% used — high. Pay down hard before statement date.`,
      status: "bad",
    };
  return {
    score: 15,
    detail: `${pct}% used — maxed stress. Pay ASAP.`,
    status: "bad",
  };
}

/**
 * Build credit report. knownScore (677) is displayed as-is when set.
 */
export function buildCreditReport(
  profile: CreditProfile,
  accounts: FinanceAccount[]
): CreditReport {
  const util = creditUtilization(accounts);
  const u = utilScore(util.ratio);

  // Payment history (~35%)
  const pay = clamp(profile.onTimePct, 0, 100);
  const payFactor: CreditFactor = {
    id: "payment",
    label: "Payment history",
    weight: 35,
    score: pay,
    detail:
      pay >= 99
        ? "Perfect on-time — protect this forever."
        : pay >= 95
          ? "Strong on-time streak. Autopay keeps it."
          : pay >= 80
            ? "Mostly on time — one miss still hurts for years."
            : "Missed payments are the #1 score killer. Autopay minimums now.",
    status: pay >= 95 ? "good" : pay >= 80 ? "ok" : "bad",
  };

  const utilFactor: CreditFactor = {
    id: "util",
    label: "Credit utilization",
    weight: 30,
    score: u.score,
    detail: u.detail,
    status: u.status,
  };

  const years = Math.max(0, profile.historyYears);
  const histScore =
    years >= 10
      ? 95
      : years >= 7
        ? 85
        : years >= 4
          ? 70
          : years >= 2
            ? 55
            : years >= 1
              ? 40
              : 25;
  const histFactor: CreditFactor = {
    id: "history",
    label: "Length of credit",
    weight: 15,
    score: histScore,
    detail:
      years < 2
        ? "Young file — keep oldest cards open, use lightly."
        : years < 7
          ? `${years} years — time is helping. Don’t close old cards.`
          : `${years} years — solid history depth.`,
    status: years >= 4 ? "good" : years >= 2 ? "ok" : "bad",
  };

  const inq = Math.max(0, profile.hardInquiries);
  const inqScore =
    inq === 0 ? 95 : inq === 1 ? 80 : inq === 2 ? 65 : inq === 3 ? 45 : 25;
  const inqFactor: CreditFactor = {
    id: "new",
    label: "New credit / inquiries",
    weight: 10,
    score: inqScore,
    detail:
      inq <= 1
        ? "Inquiries look calm — keep it that way until 740."
        : `${inq} hard pulls in 12 months — freeze new apps.`,
    status: inq <= 1 ? "good" : inq <= 2 ? "ok" : "bad",
  };

  const hasCredit = accounts.some((a) => a.kind === "credit");
  const openN = Math.max(
    profile.openAccounts,
    accounts.filter((a) => a.kind === "credit").length
  );
  let mixScore = openN >= 2 && hasCredit ? 80 : openN >= 1 ? 60 : 35;
  if (profile.recentLates > 0) mixScore = Math.min(mixScore, 40);
  if (profile.collections > 0) mixScore = Math.min(mixScore, 20);
  const mixFactor: CreditFactor = {
    id: "mix",
    label: "Mix & damage flags",
    weight: 10,
    score: mixScore,
    detail:
      profile.collections > 0
        ? "Open collections crush scores — settle / pay-for-delete plan."
        : profile.recentLates > 0
          ? "Recent lates — stay perfect for the next 12 months."
          : openN >= 2
            ? "Healthy mix of accounts."
            : "Thin file — one well-used card over time helps.",
    status:
      profile.collections > 0 || profile.recentLates > 2
        ? "bad"
        : mixScore >= 70
          ? "good"
          : "ok",
  };

  const factors = [payFactor, utilFactor, histFactor, inqFactor, mixFactor];
  const weighted =
    factors.reduce((s, f) => s + (f.score / 100) * f.weight, 0) / 100;
  // Pure model 300–850
  const modelEstimate = clamp(Math.round(300 + weighted * 550), 300, 850);

  // Official wins when user set knownScore (677)
  const known = profile.knownScore;
  const hasOfficial =
    typeof known === "number" && known >= 300 && known <= 850;
  const estimate = hasOfficial ? Math.round(known) : modelEstimate;

  const tips = buildTips(profile, util.ratio, factors, estimate);

  return {
    estimate,
    modelEstimate,
    band: band(estimate),
    factors,
    tips,
    utilization: util.ratio,
    scoreSource: hasOfficial ? "official" : "estimate",
    disclaimer: hasOfficial ? DISCLAIMER_OFFICIAL : DISCLAIMER_ESTIMATE,
  };
}

function buildTips(
  profile: CreditProfile,
  utilRatio: number | null,
  _factors: CreditFactor[],
  displayScore: number
): CreditTip[] {
  const tips: CreditTip[] = [];

  // Path-specific for ~677
  if (displayScore >= 650 && displayScore < 700) {
    tips.push({
      priority: "now",
      title: `You’re at ${displayScore} — next gate is 700`,
      why: "Good band already. 700 is where many better card offers start feeling real.",
      how: "2–3 statement cycles under 10% utilization + zero lates + zero new apps.",
    });
  } else if (displayScore >= 700 && displayScore < 740) {
    tips.push({
      priority: "this_month",
      title: `Hold ${displayScore} and march to 740 (Very Good)`,
      why: "Very Good unlocks cheaper money and stronger approval odds.",
      how: "Boring excellence: pay in full, util under 10%, no new accounts.",
    });
  }

  if (utilRatio == null) {
    tips.push({
      priority: "now",
      title: "Enter every card’s credit limit",
      why: "Utilization is ~30% of score math. Blind limit = blind 677 climb.",
      how: "Accounts → Chase card → fill Limit. Update balance owed.",
    });
  } else if (utilRatio > 0.3) {
    tips.push({
      priority: "now",
      title: "Get utilization under 30% before statement close",
      why: "This is the fastest lever that moves a mid-600s/low-700s score in weeks.",
      how: "Pay before statement closing date — not just due date. Mid-cycle payments count.",
    });
  } else if (utilRatio > 0.1) {
    tips.push({
      priority: "this_month",
      title: "Push utilization under 10%",
      why: "Under 10% is where files near 700–740 often sit.",
      how: "Leave a small charge, pay the rest 2–3 days before statement cuts.",
    });
  } else {
    tips.push({
      priority: "this_month",
      title: "Keep utilization under 10% every cycle",
      why: "You already have the elite util band — don’t give it back.",
      how: "Calendar reminder on statement close − 3 days.",
    });
  }

  if (profile.onTimePct < 100) {
    tips.push({
      priority: "now",
      title: "Autopay at least the minimum on every card",
      why: "One 30-day late can dunk a score 60–110 points and stick ~7 years.",
      how: "Chase app → Autopay → Full balance if possible. Alarm 2 days before due.",
    });
  }

  if (profile.hardInquiries >= 1) {
    tips.push({
      priority: "this_month",
      title: "No new credit apps until 740",
      why: "Hard pulls and new accounts slow a 677 → 740 climb.",
      how: "No store cards, no BNPL pile-on, no ‘save 10% open card’. Freeze bureaus if tempted.",
    });
  }

  if (profile.collections > 0) {
    tips.push({
      priority: "now",
      title: "Attack collections first",
      why: "Open collections signal serious risk to lenders.",
      how: "Debt in writing → negotiate pay-for-delete → get it written before you pay.",
    });
  }

  if (profile.historyYears < 4) {
    tips.push({
      priority: "this_year",
      title: "Keep your oldest card open forever",
      why: "Average age only grows if you don’t close old lines.",
      how: "Tiny purchase every few months so the issuer doesn’t shut it.",
    });
  }

  if (profile.recentLates > 0) {
    tips.push({
      priority: "now",
      title: "Build a perfect 12-month streak",
      why: "Recent history weighs more than ancient history.",
      how: "Zero lates for a year. Goodwill letter after 12 clean months sometimes works.",
    });
  }

  if (tips.length < 4) {
    tips.push({
      priority: "this_year",
      title: "Pull free official reports and dispute errors",
      why: "Wrong lates and zombie accounts are common.",
      how: "AnnualCreditReport.com — all 3 bureaus. Dispute online with proof.",
    });
    tips.push({
      priority: "this_month",
      title: "Use credit, don’t carry balances",
      why: "You need activity + low utilization — not interest debt.",
      how: "One recurring bill on the card, autopay full balance monthly.",
    });
  }

  const order = { now: 0, this_month: 1, this_year: 2 };
  tips.sort((a, b) => order[a.priority] - order[b.priority]);
  return tips.slice(0, 7);
}

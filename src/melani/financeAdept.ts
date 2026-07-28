/**
 * Financially adept engine — turns ledger + real credit (677) into
 * a ruthless personal money operating system.
 *
 * Not vibes. Not "budget aesthetics." Concrete rules, drills, and targets
 * so a founder / builder stops bleeding cash and climbs credit.
 */

import {
  cashOnHand,
  creditOwed,
  monthKey,
  moneyCents,
  spentByCategory,
  topMerchants,
  type FinanceState,
} from "./financeStore";
import type { CreditReport } from "./financeCredit";
import { buildRunway, buildRecurring, buildStatements } from "./financeAccounting";

export type AdeptLevel =
  | "survival" // cash ~0, opaque spend
  | "stabilizing" // on-time, plan exists
  | "building" // 3+ mo runway, util under 30%
  | "adept"; // 6+ mo runway, score 740+, reinvest habit

export type AdeptDrill = {
  id: string;
  when: "today" | "this_week" | "this_month" | "this_quarter";
  title: string;
  why: string;
  doExactly: string;
  doneWhen: string;
};

export type AdeptRule = {
  id: string;
  rule: string;
  why: string;
};

export type CreditClimbStep = {
  targetScore: number;
  label: string;
  monthsTypical: string;
  moves: string[];
};

export type AdeptBrief = {
  level: AdeptLevel;
  levelLabel: string;
  /** Real score when known */
  creditScore: number;
  creditBand: string;
  scoreIsOfficial: boolean;
  /** Next score milestones */
  climb: CreditClimbStep[];
  /** Non-negotiable rules */
  rules: AdeptRule[];
  /** Ranked drills */
  drills: AdeptDrill[];
  /** One-line command for the desk */
  order: string;
  /** Weak spots from HER books */
  leaks: string[];
  strengths: string[];
  /** Weekly operating cadence */
  weeklyCadence: string[];
  /** Monthly operating cadence */
  monthlyCadence: string[];
  /** Target numbers */
  targets: {
    score90d: number;
    score1y: number;
    utilMax: number; // percent
    runwayMonths: number;
    reinvestPct: number;
    checkingFloor: number;
  };
};

function levelFrom(opts: {
  cash: number;
  runway: number;
  score: number;
  hasPlan: boolean;
  util: number | null;
  cardPayShare: number;
}): AdeptLevel {
  const utilOk = opts.util == null || opts.util <= 0.3;
  if (opts.cash < 50 || opts.runway < 0.5) return "survival";
  if (opts.score >= 740 && opts.runway >= 6 && utilOk && opts.hasPlan)
    return "adept";
  if (opts.score >= 700 && opts.runway >= 3 && utilOk) return "building";
  if (opts.hasPlan || opts.cash >= 200) return "stabilizing";
  return "survival";
}

const LEVEL_LABEL: Record<AdeptLevel, string> = {
  survival: "Survival mode — stop the bleed",
  stabilizing: "Stabilizing — build the floor",
  building: "Building — capital + credit climb",
  adept: "Adept — capital first, score elite",
};

/**
 * Path from current score toward excellent.
 * 677 is Good floor — next fights are 700 then 740.
 */
export function creditClimbPlan(score: number): CreditClimbStep[] {
  const steps: CreditClimbStep[] = [];
  if (score < 670) {
    steps.push({
      targetScore: 670,
      label: "Cross into Good (670)",
      monthsTypical: "1–3 months if utilization was the drag",
      moves: [
        "Pay every card before statement close (not just due date)",
        "Utilization under 30% on every card",
        "Autopay minimums so you never miss",
      ],
    });
  }
  if (score < 700) {
    steps.push({
      targetScore: 700,
      label: "Solid Good (700)",
      monthsTypical: "2–6 months of perfect on-time + low util",
      moves: [
        "Hold utilization under 10% for 2–3 statement cycles",
        "Zero new hard pulls",
        "Keep oldest card open and lightly active",
        "Dispute any report errors at AnnualCreditReport.com",
      ],
    });
  }
  if (score < 740) {
    steps.push({
      targetScore: 740,
      label: "Very Good (740) — cheaper loans / cards",
      monthsTypical: "6–18 months of boring excellence",
      moves: [
        "Never miss a payment — ever",
        "Utilization usually under 10%",
        "No new accounts unless strategic",
        "Let average age of accounts grow",
      ],
    });
  }
  if (score < 800) {
    steps.push({
      targetScore: 800,
      label: "Excellent (800+)",
      monthsTypical: "Years of clean history",
      moves: [
        "Long clean file + diverse healthy mix",
        "Still use credit lightly, pay in full",
        "Protect identity — freeze bureaus when not applying",
      ],
    });
  }
  if (!steps.length) {
    steps.push({
      targetScore: score,
      label: "Maintain excellence",
      monthsTypical: "Ongoing",
      moves: ["Don't get bored and open junk cards", "Pay in full forever"],
    });
  }
  return steps;
}

const CORE_RULES: AdeptRule[] = [
  {
    id: "pay-full",
    rule: "Credit card is a charge card — pay in full every month.",
    why: "Interest is a tax on being unprepared. 677 climbs when balances report low.",
  },
  {
    id: "statement-date",
    rule: "Pay before the statement closes, not only the due date.",
    why: "Bureaus see the balance on statement date. That's utilization.",
  },
  {
    id: "floor",
    rule: "Never run checking to $0.03. Keep a cash floor.",
    why: "Zero cash = panic decisions + overdraft fees + card dependency.",
  },
  {
    id: "name-every-dollar",
    rule: "Every outflow has a name: merchant + category + why.",
    why: "Opaque 'card payment' lines hide the real lifestyle spend.",
  },
  {
    id: "reinvest-first",
    rule: "Move reinvest dollars before fun money.",
    why: "If it sits in checking, lifestyle eats it.",
  },
  {
    id: "no-new-credit",
    rule: "No new cards/loans while climbing from 677 → 740.",
    why: "Hard pulls + new accounts reset progress.",
  },
  {
    id: "one-review",
    rule: "15-minute money review every Sunday.",
    why: "Adept people don't 'feel' rich — they read the books weekly.",
  },
  {
    id: "parents-vs-earned",
    rule: "Label family funding separate from earned income.",
    why: "Your independence plan needs truth about what YOU earn.",
  },
];

export function buildAdeptBrief(
  state: FinanceState,
  credit: CreditReport,
  ym: string = monthKey()
): AdeptBrief {
  const cash = cashOnHand(state.accounts);
  const debt = creditOwed(state.accounts);
  const runway = buildRunway(state);
  const recurring = buildRecurring(state);
  const statements = buildStatements(state, ym);
  const planTotal = state.budget.reduce((s, b) => s + (b.planned || 0), 0);
  const hasPlan = planTotal > 0;
  const merchants = topMerchants(state.txs, ym, 5);
  const spent = spentByCategory(state.txs, ym);

  // Card pay share of expenses this month
  let cardPay = spent["Credit card payment"] || 0;
  let expTotal = 0;
  for (const t of state.txs) {
    if (!t.date.startsWith(ym) || t.kind !== "expense") continue;
    expTotal += t.amount;
  }
  const cardPayShare = expTotal > 0 ? cardPay / expTotal : 0;

  const score = credit.estimate;
  const scoreIsOfficial = credit.scoreSource === "official";

  const level = levelFrom({
    cash,
    runway: runway.runwayMonths,
    score,
    hasPlan,
    util: credit.utilization,
    cardPayShare,
  });

  const leaks: string[] = [];
  const strengths: string[] = [];

  if (cash < 100) {
    leaks.push(
      `Checking is basically empty (${moneyCents(cash)}). One surprise bill = card debt.`
    );
  }
  if (cardPayShare > 0.4) {
    leaks.push(
      `${Math.round(cardPayShare * 100)}% of outflows are "card payments" — you can't see Chipotle vs tuition on the card. Import the card statement.`
    );
  }
  if (!hasPlan) {
    leaks.push("No monthly plan — variance and close can't coach you.");
  }
  if (credit.utilization == null) {
    leaks.push(
      "Credit limit missing on the card — utilization (biggest fast score lever) is blind."
    );
  } else if (credit.utilization > 0.3) {
    leaks.push(
      `Utilization ${Math.round(credit.utilization * 100)}% — over 30% drags a 677 file.`
    );
  }
  if (runway.unstableIncome) {
    leaks.push(
      "Income jumps around (family funding/Zelle). Adept move: thicker cash buffer + write down true personal burn."
    );
  }
  if (runway.avgMonthlyBurn > 0 && runway.runwayMonths < 2) {
    leaks.push(
      `Runway ~${runway.runwayMonths.toFixed(1)} months at true burn ${moneyCents(runway.avgMonthlyBurn)}/mo.`
    );
  }
  if (merchants[0] && merchants[0].total > 50) {
    leaks.push(
      `Top leak this period: ${merchants[0].merchant} (${moneyCents(merchants[0].total)}, ${merchants[0].count}×).`
    );
  }
  if (recurring.monthlyEstimate > 50) {
    leaks.push(
      `Recurring-ish ~${moneyCents(recurring.monthlyEstimate)}/mo — cut one before adding lifestyle.`
    );
  }

  if (score >= 670) {
    strengths.push(
      `Credit ${score} is already Good band — you are not starting from Poor.`
    );
  }
  if (state.txs.length > 100) {
    strengths.push(
      `${state.txs.length} ledger lines imported — data is real enough to decide.`
    );
  }
  if (statements.pnl.income > 0) {
    strengths.push(
      `Inflows this month ${moneyCents(statements.pnl.income)} — capital can be routed, not only spent.`
    );
  }
  if (debt === 0) {
    strengths.push("No credit balance on the books right now (or card not tracked).");
  }

  const climb = creditClimbPlan(score);

  // Drills tailored to 677 + her books
  const drills: AdeptDrill[] = [];

  drills.push({
    id: "score-lock",
    when: "today",
    title: "Lock official score 677 as source of truth",
    why: "Stop guessing. Coach against the real number.",
    doExactly:
      "Review tab → Known score = 677. When the bureau updates, change it the same day.",
    doneWhen: "Books show Official 677 (or your latest pull).",
  });

  drills.push({
    id: "card-limit",
    when: "today",
    title: "Put your Chase card limit on the books",
    why: "Utilization is ~30% of score. Blind limit = blind climb.",
    doExactly:
      "Accounts → Chase Card · 5584 → set Limit (from app). Set balance owed if any.",
    doneWhen: "Utilization % shows a real number, not 'add limits'.",
  });

  drills.push({
    id: "autopay",
    when: "today",
    title: "Autopay full balance (or at least minimum) on every card",
    why: "One late payment can erase months of 677→700 work.",
    doExactly: "Chase app → Account services → Autopay → Full balance if cash allows, else minimum + calendar pay-down.",
    doneWhen: "Autopay confirmed on every open card.",
  });

  drills.push({
    id: "cash-floor",
    when: "this_week",
    title: "Install a checking floor ($300 minimum to start)",
    why: "Your books show $0.03 endings — that's not adept, that's fragile.",
    doExactly:
      "After next Zelle/inflow, leave $300 untouched in checking. Move the rest with a job: bills / reinvest / named spend.",
    doneWhen: "Checking stays ≥ $300 for 14 days straight.",
  });

  drills.push({
    id: "import-card",
    when: "this_week",
    title: "Import Chase credit card activity (not just payments)",
    why: "Checking only shows 'Payment to Chase card' — the real lifestyle is on ··5584.",
    doExactly:
      "Chase → Credit card → Download activity CSV → Finances → Import. Then categorize.",
    doneWhen: "Merchants like food/rides show as card lines, not only lump payments.",
  });

  drills.push({
    id: "util-cycle",
    when: "this_month",
    title: "One clean statement cycle under 10% utilization",
    why: "Fastest legal way 677 feels a bump toward 700.",
    doExactly:
      "Find statement closing date. 2–3 days before: pay so reported balance < 10% of limit. Small purchase ok; big balance is not.",
    doneWhen: "One statement posts under 10% util.",
  });

  drills.push({
    id: "plan-build",
    when: "this_week",
    title: "Auto-build a real monthly plan from spend",
    why: "Adept = planned vs actual, not vibes.",
    doExactly: "Plan tab → Auto-build from history → tighten restaurants/transport 10%.",
    doneWhen: "Variance table shows planned dollars > 0.",
  });

  drills.push({
    id: "sunday-review",
    when: "this_week",
    title: "15-minute Sunday money review (forever)",
    why: "Skill compounds. Unreviewed books go dark.",
    doExactly:
      "Phone timer 15 min: (1) inbox complete? (2) any overspend? (3) card paid before close? (4) floor intact? (5) one cut.",
    doneWhen: "Calendar recurring 'Money 15' every Sunday.",
  });

  drills.push({
    id: "earn-line",
    when: "this_month",
    title: "Separate family funding from earned money on the books",
    why: "Money from family is support, not a salary. Independence needs earned lines.",
    doExactly:
      "Tag incoming payments from Bimala, Umesh, or Millennium as Family. Track freelance/job pay as Income. Know the ratio.",
    doneWhen: "You can say 'I earned $X this month without family funding.'",
  });

  drills.push({
    id: "no-apps",
    when: "this_quarter",
    title: "Hard freeze: zero new credit apps until 740",
    why: "Inquiries and new accounts slow a 677 climb.",
    doExactly:
      "No store cards, no BNPL stacks, no 'save 10% open a card'. Freeze Equifax/Experian/TransUnion if tempted.",
    doneWhen: "Hard inquiries stay flat for 6+ months.",
  });

  // Order of the day by level
  let order =
    "Pay on time. Report low balances. Keep cash floor. Name every dollar.";
  if (level === "survival") {
    order =
      "SURVIVAL: Autopay on, install $300 cash floor, stop opaque card spend — import card CSV this week.";
  } else if (level === "stabilizing") {
    order = `STABILIZE: Hold score ${score}, one statement under 10% util, plan live, runway toward 3 months.`;
  } else if (level === "building") {
    order = `BUILD: March ${score} → 740. Reinvest before lifestyle. Protect oldest card.`;
  } else {
    order = "ADEPT: Maintain. Deploy surplus. Never get sloppy on utilization.";
  }

  const targets = {
    score90d: Math.min(850, score < 700 ? 700 : score + 15),
    score1y: Math.min(850, Math.max(740, score + 40)),
    utilMax: 10,
    runwayMonths: 3,
    reinvestPct: 50,
    checkingFloor: 300,
  };

  return {
    level,
    levelLabel: LEVEL_LABEL[level],
    creditScore: score,
    creditBand: credit.band,
    scoreIsOfficial,
    climb,
    rules: CORE_RULES,
    drills,
    order,
    leaks: leaks.slice(0, 8),
    strengths: strengths.slice(0, 5),
    weeklyCadence: [
      "Sunday 15 min: ledger, variance, card statement date, cash floor",
      "After every inflow: split → floor / bills / reinvest / named spend",
      "Before statement close: pay card so util ≤ 10%",
      "One cut per week if over plan (rides, delivery, impulse Target)",
    ],
    monthlyCadence: [
      "Import checking + card CSVs",
      "Auto-build or adjust plan",
      "Run variance — fix over categories",
      "Update official score if bureau moved",
      "Monthly close checklist when ready",
      "Review climb: still on path 677 → 700 → 740?",
    ],
    targets,
  };
}

/** Answers for Ask box */
export function answerAdept(question: string, brief: AdeptBrief): string | null {
  const q = question.toLowerCase().trim();
  if (!q) return null;

  if (
    /adept|financially|how do i get good|money skill|discipline|operating system|what should i do/.test(
      q
    )
  ) {
    return (
      `${brief.levelLabel}. Order: ${brief.order} ` +
      `Score ${brief.creditScore} (${brief.scoreIsOfficial ? "official" : "estimate"}) · ${brief.creditBand}. ` +
      `Targets: ${brief.targets.score90d} in ~90 days, ${brief.targets.score1y} in a year, util ≤${brief.targets.utilMax}%, cash floor $${brief.targets.checkingFloor}. ` +
      `Today: ${brief.drills.filter((d) => d.when === "today").map((d) => d.title).join("; ")}.`
    );
  }
  if (/677|my score|credit score|climb|fico|how to raise|improve credit/.test(q)) {
    const next = brief.climb[0];
    return (
      `Your score on the books: ${brief.creditScore} (${brief.creditBand}` +
      `${brief.scoreIsOfficial ? ", official" : ""}). ` +
      `Next gate: ${next?.label || "maintain"} (${next?.monthsTypical || ""}). ` +
      `Moves: ${(next?.moves || []).join(" · ")} ` +
      `90-day target ${brief.targets.score90d}, 1-year ${brief.targets.score1y}.`
    );
  }
  if (/drill|habit|sunday|cadence|routine/.test(q)) {
    return (
      `Weekly: ${brief.weeklyCadence.join(" | ")} ` +
      `Monthly: ${brief.monthlyCadence.join(" | ")} ` +
      `Top drills: ${brief.drills.slice(0, 4).map((d) => `[${d.when}] ${d.title}`).join("; ")}`
    );
  }
  if (/rule|principle|never|always/.test(q)) {
    return brief.rules.map((r) => `${r.rule} (${r.why})`).join(" · ");
  }
  if (/leak|weak|problem|fix me/.test(q)) {
    return (
      `Leaks: ${brief.leaks.join(" | ") || "None flagged."} ` +
      `Strengths: ${brief.strengths.join(" | ") || "Keep logging."}`
    );
  }
  return null;
}

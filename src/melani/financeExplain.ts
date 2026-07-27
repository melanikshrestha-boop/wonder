/**
 * Teaching and modelling layer for the finance copilot.
 *
 * Two jobs, both of which the query engine could not do:
 *
 *   explainConcept — "what is APR", "explain compound interest". Answers with
 *   the idea in plain language, the formula, the reader's own numbers run
 *   through it, and a citation.
 *
 *   runScenario — "what if I save $500 a month for 10 years", "how long to
 *   pay off $2,000 at 24%". Answers by actually running the model and
 *   charting it, showing the assumptions rather than hiding them.
 *
 * Both return null when the question isn't theirs, so the copilot can fall
 * through to the ledger query engine.
 *
 * Every projection states its assumptions inline. A number like "you'd have
 * $87,000" is meaningless without the rate that produced it, and a copilot
 * that hides its assumptions is just a confident guess.
 */
import {
  searchBookshelfKnowledge,
} from "./bookKnowledge";
import { money } from "./financeStore";
import { renderFormula } from "./mathml";
import type { CopilotAnswer } from "./financeCopilotEngine";
import {
  findConcept,
  relevantConcepts,
  type ConceptContext,
} from "./financeConcepts";
import {
  econSuggestions,
  explainEconFramework,
  findEconFramework,
} from "./econCanon";
import { searchHighlights } from "./highlightIndex";
import {
  aprToApy,
  debtStrategy,
  futureValue,
  growthSchedule,
  opportunityCost,
  payoffWithMinimums,
  payoffWithPayment,
  realReturn,
  rule72,
  type Debt,
} from "./financeModels";

/** Assumed long-run nominal return when the question doesn't give one. */
const DEFAULT_RETURN = 7;
/** Assumed inflation when the question doesn't give one. */
const DEFAULT_INFLATION = 3;

// ─── Parsing ─────────────────────────────────────────────────────────────────

/** First money amount in the text: $500, 500, 1,200, 2k, $1.5k. */
function parseAmount(q: string): number | null {
  const k = q.match(/\$?\s*(\d+(?:\.\d+)?)\s*k\b/);
  if (k) return Number(k[1]) * 1000;
  const plain = q.match(/\$\s*(\d[\d,]*(?:\.\d+)?)/) || q.match(/\b(\d[\d,]{2,}(?:\.\d+)?)\b/);
  if (plain) return Number(plain[1].replace(/,/g, ""));
  return null;
}

/** All money amounts, in order — for questions with a balance and a payment. */
function parseAmounts(q: string): number[] {
  const out: number[] = [];
  const re = /\$\s*(\d[\d,]*(?:\.\d+)?)|\b(\d+(?:\.\d+)?)\s*k\b|\b(\d[\d,]{2,}(?:\.\d+)?)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(q)) !== null) {
    if (m[1]) out.push(Number(m[1].replace(/,/g, "")));
    else if (m[2]) out.push(Number(m[2]) * 1000);
    else if (m[3]) out.push(Number(m[3].replace(/,/g, "")));
  }
  return out;
}

/** Duration in years. Understands months too. */
function parseYears(q: string): number | null {
  const y = q.match(/(\d+(?:\.\d+)?)\s*(?:years?|yrs?|y)\b/);
  if (y) return Number(y[1]);
  const m = q.match(/(\d+(?:\.\d+)?)\s*(?:months?|mos?)\b/);
  if (m) return Number(m[1]) / 12;
  return null;
}

/** A percentage rate, when the question names one. */
function parseRate(q: string): number | null {
  const r = q.match(/(\d+(?:\.\d+)?)\s*%/);
  return r ? Number(r[1]) : null;
}

function isMonthly(q: string): boolean {
  return /\b(a|per|each|every)\s*(month|mo)\b|\bmonthly\b|\/\s*mo\b/.test(q);
}

function isWeekly(q: string): boolean {
  return /\b(a|per|each|every)\s*week\b|\bweekly\b/.test(q);
}

// ─── Concepts ────────────────────────────────────────────────────────────────

const EXPLAIN_RE =
  /\b(explain|what(?:'s| is| are)|whats|how does|how do|define|definition of|meaning of|eli5|teach me|help me understand|tell me about|why does|what does)\b/;

/**
 * Answer a "what is X" question from the concept library.
 * Only fires when the question looks like a request to be taught — otherwise
 * "what is my net worth" would get a lecture instead of a number.
 */
export function explainConcept(question: string, ctx: ConceptContext): CopilotAnswer | null {
  const q = question.toLowerCase().trim();
  if (!EXPLAIN_RE.test(q)) return null;
  // "what is my …" is a data question about their ledger, not a concept.
  if (/\b(my|i|me)\b/.test(q) && !/\b(explain|eli5|teach|understand|how does|what does)\b/.test(q)) {
    return null;
  }

  // Finance personal concepts first (APR, compounding with her numbers)
  const concept = findConcept(q);
  if (concept) {
    const parts: string[] = [concept.oneLine, "", concept.plain];

    const worked = concept.worked?.(ctx) ?? null;
    if (worked) parts.push("", `Your numbers: ${worked.text}`);
    if (concept.gotcha) parts.push("", `Where this breaks: ${concept.gotcha}`);

    // If she owns a related book, point at her shelf (metadata only)
    const shelfHits = searchBookshelfKnowledge(
      `${concept.name} ${concept.reading || ""}`,
      3
    ).filter((h) => h.isEcon || h.score >= 30);
    if (shelfHits[0]) {
      parts.push(
        "",
        `On your shelf: ${shelfHits[0].title} — ${shelfHits[0].author}` +
          (shelfHits[0].noteSnippet
            ? `. Your note: ${shelfHits[0].noteSnippet}`
            : ".")
      );
    }

    const sources = [`concept: ${concept.name}`, concept.source];
    if (concept.reading) sources.push(`further reading: ${concept.reading}`);
    if (shelfHits[0]) sources.push(`shelf: ${shelfHits[0].title}`);

    return {
      text: parts.join("\n"),
      sources,
      data: worked?.data,
      formula: concept.formula ? renderFormula(concept.formula) : undefined,
      formulaNote: concept.formulaNote,
    };
  }

  // Economics canon (opportunity cost, incentives, elasticity, …)
  const econ = findEconFramework(q);
  if (!econ) return null;

  const parts: string[] = [explainEconFramework(econ)];
  const shelfHits = searchBookshelfKnowledge(
    `${econ.name} ${econ.aliases.join(" ")} ${econ.reading || ""}`,
    4
  );
  // V2: retrieve across ALL shelf highlights, not only nested on one book hit
  const hlHits = searchHighlights(`${econ.name} ${econ.aliases.join(" ")} ${q}`, 3);
  if (shelfHits[0]) {
    parts.push(
      "",
      `On your shelf: ${shelfHits
        .slice(0, 2)
        .map((h) => `${h.title} — ${h.author}`)
        .join(" · ")}`
    );
  }
  if (hlHits[0]) {
    parts.push("");
    parts.push("Your highlights:");
    for (const h of hlHits.slice(0, 2)) {
      parts.push(
        `• “${h.text.slice(0, 200)}” — ${h.title}` +
          (h.interpretation ? ` (${h.interpretation.slice(0, 80)})` : "")
      );
    }
  }

  const sources = [`econ: ${econ.name}`, econ.source];
  if (econ.reading) sources.push(`further reading: ${econ.reading}`);
  for (const h of shelfHits.slice(0, 2)) sources.push(`shelf: ${h.title}`);
  for (const h of hlHits.slice(0, 2)) sources.push(`highlight: ${h.title}`);

  return {
    text: parts.join("\n"),
    sources,
    formula: econ.formula ? renderFormula(econ.formula) : undefined,
    formulaNote: econ.formulaNote,
  };
}

// ─── Scenarios ───────────────────────────────────────────────────────────────

/**
 * Run a what-if model. Returns null when the question isn't a scenario, so
 * the copilot falls through to its ledger queries.
 */
export function runScenario(question: string, ctx: ConceptContext): CopilotAnswer | null {
  const q = question.toLowerCase().trim();

  return (
    savingScenario(q, ctx) ??
    payoffScenario(q, ctx) ??
    strategyScenario(q, ctx) ??
    lumpSumScenario(q) ??
    doublingScenario(q) ??
    inflationScenario(q) ??
    null
  );
}

/** "what if I save $500 a month for 10 years" */
function savingScenario(q: string, ctx: ConceptContext): CopilotAnswer | null {
  if (!/\b(save|saving|invest|investing|put away|set aside|contribute|stash)\b/.test(q)) return null;
  const amount = parseAmount(q);
  if (amount == null || amount <= 0) return null;

  const years = parseYears(q) ?? 10;
  const rate = parseRate(q) ?? DEFAULT_RETURN;
  const perMonth = isWeekly(q) ? (amount * 52) / 12 : isMonthly(q) ? amount : amount / 12;
  const monthlyRate = rate / 100 / 12;
  const months = Math.round(years * 12);

  const schedule = growthSchedule({
    initial: 0,
    contribution: perMonth,
    rate: monthlyRate,
    periods: months,
  });
  const end = schedule[schedule.length - 1];
  if (!end) return null;

  // One point per year keeps the chart readable over long horizons.
  const points = schedule
    .filter((p) => p.period % 12 === 0 || p.period === months)
    .map((p) => ({
      x: `Yr ${Math.round(p.period / 12)}`,
      y: Math.round(p.balance),
      label: `${money(p.balance)} (${money(p.contributed)} in, ${money(p.growth)} growth)`,
    }));

  const real = realReturn(rate, DEFAULT_INFLATION).real;
  const inTodaysMoney = growthSchedule({
    initial: 0,
    contribution: perMonth,
    rate: real / 100 / 12,
    periods: months,
  }).slice(-1)[0];

  return {
    text: [
      `Saving ${money(perMonth)} a month for ${years} years at ${rate}% gets you ${money(end.balance)}.`,
      `You put in ${money(end.contributed)}. The other ${money(end.growth)} is compounding — ${Math.round((end.growth / end.balance) * 100)}% of the total.`,
      `In today's purchasing power, after ${DEFAULT_INFLATION}% inflation, that's about ${money(inTodaysMoney?.balance ?? 0)}.`,
      ctx.cashFlow > 0 && perMonth > ctx.cashFlow
        ? `Worth noting: your ledger shows ${money(ctx.cashFlow)} a month left over, so ${money(perMonth)} isn't there yet.`
        : "",
      `Assumes a constant ${rate}% return and no missed months. Real markets deliver that as an average across very bad and very good years, never as a steady drip.`,
    ]
      .filter(Boolean)
      .join("\n"),
    sources: [`${years}-year compound model`, `${rate}% nominal, ${DEFAULT_INFLATION}% inflation`],
    formula: renderFormula("FV = PMT((1 + r)^n − 1)/r"),
    formulaNote: `PMT = ${money(perMonth)} monthly · r = ${(rate / 12).toFixed(4)}% per month · n = ${months} months`,
    data: [
      { label: "You contribute", value: money(end.contributed) },
      { label: "Growth", value: money(end.growth) },
      { label: "Total", value: money(end.balance) },
      { label: "In today's money", value: money(inTodaysMoney?.balance ?? 0) },
    ],
    chart: {
      kind: "line",
      title: `${money(perMonth)}/month at ${rate}% for ${years} years`,
      xLabel: "Year",
      yLabel: "Balance",
      points,
    },
  };
}

/** "how long to pay off $2,000 at 24% paying $150 a month" */
function payoffScenario(q: string, ctx: ConceptContext): CopilotAnswer | null {
  if (!/\b(pay ?off|payoff|clear|get rid of|how long.*(pay|debt)|debt free)\b/.test(q)) return null;

  const amounts = parseAmounts(q);
  const rate = parseRate(q) ?? ctx.apr ?? 24.99;
  const balance = amounts[0] ?? ctx.debt;
  if (!balance || balance <= 0) {
    return {
      text: "You have no debt recorded, so there's nothing to pay off. Give me a balance and a rate and I'll model it anyway.",
      sources: ["accounts"],
    };
  }

  // A second, smaller amount is the monthly payment.
  const payment = amounts.length > 1 ? amounts[1] : null;
  const mins = payoffWithMinimums(balance, rate);

  if (payment == null) {
    if (mins.neverPaysOff) {
      return {
        text: `${money(balance)} at ${rate}% on minimum payments never clears — the interest outruns the payment. Tell me what you can pay monthly and I'll find the real timeline.`,
        sources: ["minimum payment model"],
      };
    }
    const double = payoffWithPayment(balance, rate, Math.max(50, balance * 0.04));
    return {
      text: [
        `${money(balance)} at ${rate}%, paying only the minimum: ${Math.round(mins.months)} months — that's ${(mins.months / 12).toFixed(1)} years — and ${money(mins.totalInterest)} in interest.`,
        `Paying a flat ${money(Math.max(50, balance * 0.04))} instead: ${Math.round(double.months)} months and ${money(double.totalInterest)}.`,
        `Same debt, ${money(mins.totalInterest - double.totalInterest)} difference, purely from not letting the payment shrink with the balance.`,
      ].join("\n"),
      sources: [`${rate}% APR`, "minimum vs fixed payment model"],
      data: [
        { label: "Minimums", value: `${Math.round(mins.months)} mo · ${money(mins.totalInterest)}` },
        { label: "Fixed payment", value: `${Math.round(double.months)} mo · ${money(double.totalInterest)}` },
        { label: "Saved", value: money(mins.totalInterest - double.totalInterest) },
      ],
    };
  }

  const result = payoffWithPayment(balance, rate, payment);
  if (result.neverPaysOff) {
    const monthlyInterest = (balance * rate) / 100 / 12;
    return {
      text: `${money(payment)} a month never clears ${money(balance)} at ${rate}% — the interest alone is ${money(monthlyInterest)} a month. You need to beat that before a single dollar touches the balance.`,
      sources: [`${rate}% APR`, "payoff model"],
      data: [
        { label: "Monthly interest", value: money(monthlyInterest) },
        { label: "Your payment", value: money(payment) },
      ],
    };
  }

  return {
    text: [
      `${money(balance)} at ${rate}%, paying ${money(payment)} a month: ${result.months} months (${(result.months / 12).toFixed(1)} years).`,
      `Total interest ${money(result.totalInterest)} — you'd repay ${money(result.totalPaid)} on a ${money(balance)} debt.`,
      `At ${rate}% APR the true annual cost is ${aprToApy(rate).toFixed(1)}% once daily compounding is counted.`,
    ].join("\n"),
    sources: [`${rate}% APR`, "amortisation model"],
    formula: renderFormula("n = −ln(1 − (B × r)/PMT)/ln(1 + r)"),
    formulaNote: `B = ${money(balance)} balance · r = ${(rate / 12).toFixed(4)}% per month · PMT = ${money(payment)} monthly`,
    data: [
      { label: "Months", value: String(result.months) },
      { label: "Interest", value: money(result.totalInterest) },
      { label: "Total repaid", value: money(result.totalPaid) },
    ],
  };
}

/** "avalanche vs snowball" — modelled on real cards when there are any. */
function strategyScenario(q: string, ctx: ConceptContext): CopilotAnswer | null {
  if (!/\b(avalanche|snowball)\b/.test(q)) return null;

  // Without per-card data, demonstrate on a representative split of the balance.
  const total = ctx.debt > 0 ? ctx.debt : 5000;
  const debts: Debt[] = [
    { name: "High-rate card", balance: total * 0.4, apr: 26.99, minimum: Math.max(25, total * 0.4 * 0.02) },
    { name: "Mid-rate card", balance: total * 0.35, apr: 19.99, minimum: Math.max(25, total * 0.35 * 0.02) },
    { name: "Low-rate card", balance: total * 0.25, apr: 12.99, minimum: Math.max(25, total * 0.25 * 0.02) },
  ];

  // A budget that only covers the minimums makes both strategies look
  // identical and teaches nothing, because no dollar reaches any principal.
  // Default to comfortably above the minimums so the comparison is real.
  const minimums = debts.reduce((sum, d) => sum + d.minimum, 0);
  const budget = parseAmount(q) ?? Math.max(minimums * 1.6, total * 0.05);

  const av = debtStrategy(debts, budget, "avalanche");
  const sn = debtStrategy(debts, budget, "snowball");
  const saved = sn.totalInterest - av.totalInterest;
  const avFirst = av.clearedAt[0]?.month;
  const snFirst = sn.clearedAt[0]?.month;

  // Only claim snowball's earlier-win advantage when it actually happens.
  const winLine =
    snFirst != null && avFirst != null && snFirst < avFirst
      ? `Snowball clears its first card in month ${snFirst} against avalanche's month ${avFirst} — that earlier visible win is the entire argument for it.`
      : snFirst != null && avFirst != null && snFirst === avFirst
        ? `Both clear their first card in month ${snFirst}, so snowball's usual psychological edge doesn't appear at this payment level.`
        : "";

  return {
    text: [
      `On ${money(total)} split across three cards at ${money(budget)} a month:`,
      `Avalanche (highest rate first) — ${av.months} months, ${money(av.totalInterest)} interest.`,
      `Snowball (smallest balance first) — ${sn.months} months, ${money(sn.totalInterest)} interest.`,
      saved > 0.5
        ? `Avalanche wins by ${money(saved)}.`
        : `The interest difference is negligible here, so take whichever you'll actually finish.`,
      winLine,
      ctx.debt > 0
        ? "Modelled on a representative rate split — add per-card limits and APRs and I'll run it on your actual cards."
        : "You have no debt recorded, so this runs on an illustrative $5,000.",
    ]
      .filter(Boolean)
      .join("\n"),
    sources: ["debt strategy model", "avalanche vs snowball simulation"],
    data: [
      { label: "Avalanche", value: `${av.months} mo · ${money(av.totalInterest)}` },
      { label: "Snowball", value: `${sn.months} mo · ${money(sn.totalInterest)}` },
      { label: "Avalanche saves", value: money(Math.max(0, saved)) },
    ],
  };
}

/** "what's $5,000 worth in 20 years" / "is a $200 purchase worth it" */
function lumpSumScenario(q: string): CopilotAnswer | null {
  const isGrowth = /\b(worth|grow|become|turn into|end up with)\b/.test(q);
  const isCost = /\b(cost me|really cost|true cost|opportunity cost|instead of buying|if i didn'?t buy)\b/.test(q);
  if (!isGrowth && !isCost) return null;

  const amount = parseAmount(q);
  if (amount == null || amount <= 0) return null;
  const years = parseYears(q) ?? (isCost ? 10 : 20);
  const rate = parseRate(q) ?? DEFAULT_RETURN;

  const end = futureValue(amount, rate / 100, years);
  const oc = opportunityCost(amount, years, rate);
  const points = Array.from({ length: Math.min(30, Math.max(2, Math.round(years))) + 1 }, (_, i) => {
    const yr = (i / Math.min(30, Math.max(2, Math.round(years)))) * years;
    const v = futureValue(amount, rate / 100, yr);
    return { x: `Yr ${Math.round(yr)}`, y: Math.round(v), label: money(v) };
  });

  return {
    text: isCost
      ? `Spending ${money(amount)} today costs you ${money(oc.future)} in ${years} years at ${rate}% — the price plus ${money(oc.forgone)} you gave up. That's the honest number on the tag.`
      : `${money(amount)} at ${rate}% for ${years} years becomes ${money(end)}. ${money(end - amount)} of that is growth. In today's purchasing power after ${DEFAULT_INFLATION}% inflation it's about ${money(end / Math.pow(1 + DEFAULT_INFLATION / 100, years))}.`,
    sources: [`${rate}% compound model`, `${years}-year horizon`],
    formula: renderFormula("FV = PV(1 + r)^n"),
    formulaNote: `PV = ${money(amount)} · r = ${rate}% per year · n = ${years} years`,
    data: [
      { label: "Today", value: money(amount) },
      { label: `In ${years} years`, value: money(end) },
      { label: "Growth", value: money(end - amount) },
    ],
    chart: {
      kind: "line",
      title: `${money(amount)} at ${rate}% over ${years} years`,
      xLabel: "Year",
      yLabel: "Value",
      points,
    },
  };
}

/** "how long to double my money at 8%" */
function doublingScenario(q: string): CopilotAnswer | null {
  if (!/\bdouble|doubling\b/.test(q)) return null;
  const rate = parseRate(q) ?? DEFAULT_RETURN;
  const r = rule72(rate);
  return {
    text: `At ${rate}%, money doubles in about ${r.approx.toFixed(1)} years by the rule of 72 — the exact answer is ${r.exact.toFixed(1)} years. The rule is a mental shortcut; it drifts at high rates.`,
    sources: ["rule of 72", "exact logarithmic doubling time"],
    formula: renderFormula("n = ln(2)/ln(1 + r)"),
    formulaNote: `r = ${rate}% per period · approximation: n ≈ 72 ÷ ${rate}`,
    data: [
      { label: "Rule of 72", value: `${r.approx.toFixed(2)} yrs` },
      { label: "Exact", value: `${r.exact.toFixed(2)} yrs` },
    ],
  };
}

/** "what's 5% worth with 3% inflation" */
function inflationScenario(q: string): CopilotAnswer | null {
  if (!/\binflation|real return|purchasing power\b/.test(q)) return null;
  const rates = q.match(/(\d+(?:\.\d+)?)\s*%/g);
  if (!rates || rates.length < 1) return null;
  const nominal = Number(rates[0].replace("%", ""));
  const inflation = rates[1] ? Number(rates[1].replace("%", "")) : DEFAULT_INFLATION;
  const r = realReturn(nominal, inflation);
  return {
    text: `${nominal}% nominal against ${inflation}% inflation is ${r.real.toFixed(2)}% real — not the ${r.naive.toFixed(2)}% you get by subtracting. Real is the number that buys things.`,
    sources: ["Fisher equation", "real vs nominal return"],
    formula: renderFormula("real = (1 + nominal)/(1 + inflation) − 1"),
    formulaNote: `nominal = ${nominal}% · inflation = ${inflation}% · both as decimals in the expression`,
    data: [
      { label: "Nominal", value: `${nominal}%` },
      { label: "Real", value: `${r.real.toFixed(2)}%` },
      { label: "Naive subtraction", value: `${r.naive.toFixed(2)}%` },
    ],
  };
}

/** Teaching prompts tuned to the state of someone's finances. */
export function conceptSuggestions(ctx: ConceptContext): string[] {
  const personal = relevantConcepts(ctx, 2).map(
    (c) => `Explain ${c.name.toLowerCase()}`
  );
  // Mix personal finance + economics canon so the desk feels smarter
  return [...personal, ...econSuggestions().slice(0, 3)];
}

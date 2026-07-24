/**
 * Tax planning & preparation — backend only.
 * Analyzes ledger income/outflows for federal-style awareness (educational).
 * Not a tax filing product; not legal advice. Uses your real books only.
 */

import {
  money,
  type FinanceState,
  type FinanceTx,
} from "./financeStore";

export type TaxIncomeBucket = {
  id: string;
  label: string;
  total: number;
  count: number;
  /** Rough tax handling hint */
  treatment: string;
};

export type TaxFinding = {
  id: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  detail: string;
  amount?: number;
};

export type TaxBrief = {
  /** Calendar year of the brief (from ym) */
  taxYear: number;
  ytdGrossIn: number;
  ytdGrossOut: number;
  ytdNet: number;
  /** Money that looks like gifts/family support vs earned */
  buckets: TaxIncomeBucket[];
  /** Rough annualized gross if current pace continues */
  annualizedGross: number;
  /** Very rough federal-ish estimate on taxable-looking income (educational) */
  estimatedFederal: number;
  /** Suggested quarterly set-aside if self-employed pattern */
  quarterlySetAside: number;
  findings: TaxFinding[];
  /** One-line order for the desk */
  order: string;
};

function yearOf(ym: string): number {
  return Number(ym.slice(0, 4)) || new Date().getFullYear();
}

function txsInYear(txs: FinanceTx[], year: number): FinanceTx[] {
  const p = `${year}-`;
  return txs.filter((t) => t.date.startsWith(p));
}

function isFamilyGift(merchant: string): boolean {
  const m = merchant.toLowerCase();
  return (
    m.includes("bimala") ||
    m.includes("umesh") ||
    m.includes("shrestha") ||
    m.includes("parent") ||
    m.includes("mom") ||
    m.includes("dad")
  );
}

function isTransfer(t: FinanceTx): boolean {
  const m = `${t.merchant || ""} ${t.note || ""} ${t.category || ""}`.toLowerCase();
  return (
    t.category === "Transfers" ||
    m.includes("transfer") ||
    m.includes("from savings") ||
    m.includes("to savings") ||
    m.includes("chase card payment") ||
    m.includes("from checking") ||
    m.includes("to checking")
  );
}

function isPayrollLike(merchant: string): boolean {
  const m = merchant.toLowerCase();
  return (
    m.includes("payroll") ||
    m.includes("direct dep") ||
    m.includes("adp") ||
    m.includes("gusto") ||
    m.includes("salary") ||
    m.includes("employer")
  );
}

function isBrokerCash(merchant: string): boolean {
  const m = merchant.toLowerCase();
  return m.includes("goldman") || m.includes("marcus") || m.includes("brokerage");
}

/**
 * Build tax-oriented analysis for the year of `ym` from live books.
 */
export function buildTaxBrief(state: FinanceState, ym: string): TaxBrief {
  const taxYear = yearOf(ym);
  const ytxs = txsInYear(state.txs, taxYear);
  const findings: TaxFinding[] = [];

  let ytdGrossIn = 0;
  let ytdGrossOut = 0;
  let familyIn = 0;
  let familyInCount = 0;
  let earnedLike = 0;
  let earnedCount = 0;
  let brokerIn = 0;
  let brokerInCount = 0;
  let otherIn = 0;
  let otherInCount = 0;
  let cardPayments = 0;
  let cardPayCount = 0;
  let zelleOut = 0;
  let zelleOutCount = 0;

  for (const t of ytxs) {
    const merch = t.merchant || t.note || "";
    if (t.kind === "income") {
      ytdGrossIn += t.amount;
      if (isFamilyGift(merch)) {
        familyIn += t.amount;
        familyInCount += 1;
      } else if (isPayrollLike(merch)) {
        earnedLike += t.amount;
        earnedCount += 1;
      } else if (isBrokerCash(merch)) {
        brokerIn += t.amount;
        brokerInCount += 1;
      } else if (!isTransfer(t)) {
        otherIn += t.amount;
        otherInCount += 1;
      }
    } else {
      ytdGrossOut += t.amount;
      if (merch.toLowerCase().includes("chase card payment")) {
        cardPayments += t.amount;
        cardPayCount += 1;
      }
      if (merch.toLowerCase().includes("zelle to")) {
        zelleOut += t.amount;
        zelleOutCount += 1;
      }
    }
  }

  const ytdNet = ytdGrossIn - ytdGrossOut;
  // Months elapsed in tax year with any activity
  const monthsActive = new Set(ytxs.map((t) => t.date.slice(0, 7))).size || 1;
  const annualizedGross = (ytdGrossIn / monthsActive) * 12;

  // Taxable-looking: earned + other non-gift non-pure-transfer inflows
  // Family gifts are generally not taxable income to recipient (US federal — educational)
  const taxableLooking = earnedLike + otherIn + brokerIn * 0.5; // broker partial — could be gift/loan
  // Rough progressive sketch for educational set-aside (not real brackets engine)
  let estimatedFederal = 0;
  if (taxableLooking > 0) {
    const annualTaxable = (taxableLooking / monthsActive) * 12;
    // crude effective ~12–22% band for early-career estimates
    const eff = annualTaxable < 15000 ? 0.1 : annualTaxable < 45000 ? 0.14 : 0.18;
    estimatedFederal = Math.round(annualTaxable * eff);
  }
  const quarterlySetAside = Math.round(estimatedFederal / 4);

  const buckets: TaxIncomeBucket[] = [
    {
      id: "family",
      label: "Family / gift-like (Zelle in)",
      total: Math.round(familyIn * 100) / 100,
      count: familyInCount,
      treatment:
        "Usually not taxable income to you as a gift; keep records of large gifts. Not a W-2 substitute.",
    },
    {
      id: "earned",
      label: "Payroll / earned-like",
      total: Math.round(earnedLike * 100) / 100,
      count: earnedCount,
      treatment: "Taxable wages if real payroll — expect W-2/withholding.",
    },
    {
      id: "broker",
      label: "Broker / Goldman-style transfers",
      total: Math.round(brokerIn * 100) / 100,
      count: brokerInCount,
      treatment:
        "Could be contribution, gift, or transfer — confirm 1099s; do not assume tax-free.",
    },
    {
      id: "other-in",
      label: "Other inflows",
      total: Math.round(otherIn * 100) / 100,
      count: otherInCount,
      treatment: "Classify: freelance (Schedule C), refund, or transfer.",
    },
  ].filter((b) => b.total > 0 || b.count > 0);

  // Findings
  if (familyIn > ytdGrossIn * 0.6 && ytdGrossIn > 0) {
    findings.push({
      id: "tax-family-heavy",
      severity: "high",
      title: "Most inflows look like family support, not wages",
      detail: `${money(familyIn)} of ${money(ytdGrossIn)} YTD is gift-like Zelle. Tax plan: track gifts; do not treat as salary. Build real earned income for independence and retirement accounts.`,
      amount: familyIn,
    });
  }

  if (earnedLike < 1 && otherIn < 1 && familyIn > 0) {
    findings.push({
      id: "tax-no-w2-signal",
      severity: "medium",
      title: "No clear payroll signal in the books",
      detail:
        "Without W-2/1099-style income on the ledger, standard withholding math does not apply. If you freelance, set aside for quarterly estimates when earned income starts.",
    });
  }

  if (cardPayments > ytdGrossOut * 0.5) {
    findings.push({
      id: "tax-cc-opaque",
      severity: "high",
      title: "Spending is opaque — card pays, not category detail",
      detail: `${money(cardPayments)} went to Chase card payments (${cardPayCount}×). For tax deductions (education, medical, business), import card statements or categorize card spend. Checking only shows the payoff, not the shop.`,
      amount: cardPayments,
    });
  }

  if (quarterlySetAside > 0 && taxableLooking > 500) {
    findings.push({
      id: "tax-quarterly",
      severity: "medium",
      title: `Educational quarterly set-aside ~${money(quarterlySetAside)}`,
      detail: `Rough federal sketch on taxable-looking inflows (~${money(taxableLooking)} YTD). Not a real return. When freelancing, park this in Savings labeled tax.`,
      amount: quarterlySetAside,
    });
  }

  if (zelleOut > 200) {
    findings.push({
      id: "tax-zelle-out",
      severity: "low",
      title: "Outbound Zelle needs labels",
      detail: `${money(zelleOut)} sent via Zelle (${zelleOutCount}×). Tag reimbursements vs gifts vs rent shares so April is not a reconstruction project.`,
      amount: zelleOut,
    });
  }

  if (ytxs.length < 5) {
    findings.push({
      id: "tax-thin",
      severity: "info",
      title: "Thin year on the books",
      detail: "Import full-year statements before any filing estimate.",
    });
  }

  let order =
    "Classify every inflow (gift vs earned vs transfer) before any tax estimate.";
  if (familyIn > earnedLike + otherIn) {
    order =
      "Document family support as gifts; open a path to earned income so retirement + tax accounts become available.";
  } else if (cardPayments > 1000) {
    order =
      "Import Chase card detail — tax-relevant spend is hidden behind card payments.";
  } else if (quarterlySetAside > 0) {
    order = `Park ~${money(quarterlySetAside)}/quarter for tax if freelancing starts.`;
  }

  return {
    taxYear,
    ytdGrossIn: Math.round(ytdGrossIn * 100) / 100,
    ytdGrossOut: Math.round(ytdGrossOut * 100) / 100,
    ytdNet: Math.round(ytdNet * 100) / 100,
    buckets,
    annualizedGross: Math.round(annualizedGross * 100) / 100,
    estimatedFederal,
    quarterlySetAside,
    findings,
    order,
  };
}

/** Plain-language tax answer from brief + question */
export function answerTax(
  question: string,
  tax: TaxBrief
): string | null {
  const q = question.toLowerCase();
  if (!/(tax|irs|1099|w-?2|quarterly|deduct|filing|april)/.test(q)) return null;
  const top = tax.findings[0];
  return (
    `Tax year ${tax.taxYear} (educational, not a filing). ` +
    `YTD in ${money(tax.ytdGrossIn)} · out ${money(tax.ytdGrossOut)} · net ${money(tax.ytdNet)}. ` +
    `Annualized gross pace ~${money(tax.annualizedGross)}. ` +
    (tax.quarterlySetAside > 0
      ? `Rough quarterly set-aside ~${money(tax.quarterlySetAside)}. `
      : "") +
    `Order: ${tax.order}` +
    (top ? ` Top issue: ${top.title}. ${top.detail}` : "")
  );
}

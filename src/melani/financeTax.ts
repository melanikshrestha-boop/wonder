/**
 * Tax planning and preparation from the live ledger.
 *
 * This is an evidence-aware planning model, not a return preparer. It refuses
 * to call transfers taxable, separates gifts from earned income, and makes its
 * missing facts visible instead of inventing withholding, filing status, cost
 * basis, deductions, or a prior-year safe-harbor amount.
 */

import { money, type FinanceState, type FinanceTx } from "./financeStore";

export const TAX_RULES_YEAR = 2025;
export const STANDARD_DEDUCTION_SINGLE_2025 = 15_750;
export const SELF_EMPLOYMENT_SOCIAL_SECURITY_CAP_2025 = 176_100;

const SINGLE_BRACKETS_2025 = [
  { ceiling: 11_925, rate: 0.1 },
  { ceiling: 48_475, rate: 0.12 },
  { ceiling: 103_350, rate: 0.22 },
  { ceiling: 197_300, rate: 0.24 },
  { ceiling: 250_525, rate: 0.32 },
  { ceiling: 626_350, rate: 0.35 },
  { ceiling: Number.POSITIVE_INFINITY, rate: 0.37 },
] as const;

export type TaxIncomeBucket = {
  id: string;
  label: string;
  total: number;
  count: number;
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
  /** Calendar year represented by the ledger selection. */
  taxYear: number;
  /** Rules used for the planning scenario. Kept separate from taxYear. */
  rulesYear: number;
  /** Economic inflows/outflows, with account transfers and card payoffs removed. */
  ytdGrossIn: number;
  ytdGrossOut: number;
  ytdNet: number;
  buckets: TaxIncomeBucket[];
  /** Annualized observed payroll cash plus gross business receipts. Not taxable income. */
  annualizedGross: number;
  /** Annualized payroll deposits. These are never treated as W-2 box 1 or box 3 wages. */
  annualizedPayrollDeposits: number;
  /** Annualized gross receipts before Schedule C expenses. */
  annualizedSelfEmploymentGrossReceipts: number;
  /**
   * Upper-bound stress calculation using gross receipts and assuming no wages
   * consume the Social Security base. It is not an estimated tax liability.
   */
  grossReceiptsSelfEmploymentTaxStress: number | null;
  taxableIncomeEstimate: number | null;
  estimatedIncomeTax: number | null;
  estimatedSelfEmploymentTax: number | null;
  estimatedFederal: number | null;
  /**
   * Planning reserve per quarter. This is not a conclusion that an estimated
   * payment is legally required because withholding and prior-year tax are not
   * present in the ledger.
   */
  quarterlySetAside: number | null;
  expectedBalanceDue: number | null;
  safeHarborAnnualTarget: number | null;
  estimatedPaymentsStatus:
    | "not-indicated"
    | "planning-reserve"
    | "inputs-required"
    | "rules-unavailable";
  dataConfidence: "low" | "medium" | "high";
  assumptions: string[];
  missingFacts: string[];
  sourceNotes: string[];
  findings: TaxFinding[];
  order: string;
};

/**
 * Estimated-payment inputs must come from tax records or an explicit planning
 * worksheet. None of these values may be inferred from bank deposits.
 */
export type EstimatedPaymentInputs = {
  projectedTotalTax: number;
  federalIncomeTaxWithheld: number;
  refundableCredits: number;
  estimatedPaymentsMade: number;
  priorYearTotalTax: number;
  /** Caller must select 100% or the applicable 110% high-income safe harbor. */
  priorYearSafeHarborRate: 1 | 1.1;
};

export type TaxBriefInputs = {
  estimatedPayments?: EstimatedPaymentInputs | null;
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function yearOf(ym: string): number {
  return Number(ym.slice(0, 4)) || new Date().getFullYear();
}

function monthOf(ym: string): number {
  const value = Number(ym.slice(5, 7));
  return Number.isFinite(value) ? Math.min(12, Math.max(1, value)) : 12;
}

function txsInYear(txs: FinanceTx[], year: number): FinanceTx[] {
  const prefix = `${year}-`;
  return txs.filter((tx) => tx.date.startsWith(prefix));
}

function transactionText(tx: FinanceTx): string {
  return `${tx.merchant || ""} ${tx.note || ""} ${tx.category || ""}`.toLowerCase();
}

function isConfirmedGift(tx: FinanceTx): boolean {
  const text = transactionText(tx);
  const category = tx.category.trim().toLowerCase();
  return (
    category === "gift" ||
    category === "gifts" ||
    /\b(confirmed gift|nonrepayable gift|birthday gift|graduation gift|gift from)\b/.test(
      text
    )
  );
}

function isUnconfirmedFamilyLike(tx: FinanceTx): boolean {
  if (isConfirmedGift(tx)) return false;
  const text = transactionText(tx);
  const familySignal =
    /\b(bimala|umesh|millennium|shrestha|parent|mom|dad|family support|allowance)\b/.test(
      text
    );
  const cashRailSignal =
    /\b(zelle|venmo|cash app|cashapp|paypal|family support|allowance)\b/.test(
      text
    );
  return familySignal && cashRailSignal;
}

function isCardPayment(tx: FinanceTx): boolean {
  const text = transactionText(tx);
  const category = tx.category.trim().toLowerCase();
  return (
    category === "credit card payment" ||
    /\b(card payment|credit card payment|payment to chase card|chase credit card payment|crd pmt|payment thank you)\b/.test(
      text
    ) ||
    /\b(visa|mastercard|amex|american express|discover|chase card|credit card)\s+(autopay|epay|payment)\b/.test(
      text
    )
  );
}

function isTransfer(tx: FinanceTx): boolean {
  const text = transactionText(tx);
  return (
    tx.category.toLowerCase() === "transfers" ||
    isCardPayment(tx) ||
    /\btransfer\b|from savings|to savings|from checking|to checking/.test(text)
  );
}

function isPayrollLike(tx: FinanceTx): boolean {
  return /\b(payroll|direct dep|direct deposit|adp|gusto|salary|employer|w-?2)\b/.test(
    transactionText(tx)
  );
}

function isSelfEmploymentLike(tx: FinanceTx): boolean {
  return /\b(1099[- ]?nec|schedule c|self[- ]employ(?:ed|ment)?|freelanc(?:e|er|ing)?|contractor|consult(?:ant|ing|ancy)?|client payment|invoice|photography|photo shoot|stripe|youtube|sponsor(?:ship|ed)?|ad revenue|substack|creator revenue|business income)\b/.test(
    transactionText(tx)
  );
}

function isInvestmentIncomeLike(tx: FinanceTx): boolean {
  return /\b(1099[- ]?(div|int)|dividend|qualified dividend|bank interest|savings interest|interest (income|earned|payment|credit))\b/.test(
    transactionText(tx)
  );
}

function isBrokerCash(tx: FinanceTx): boolean {
  return /\b(goldman|marcus|brokerage|fidelity|schwab|vanguard|robinhood)\b/.test(
    transactionText(tx)
  );
}

function annualize(value: number, monthsElapsed: number): number {
  return monthsElapsed > 0 ? (value / monthsElapsed) * 12 : value;
}

function nonnegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function estimatedPaymentPlan(
  inputs: EstimatedPaymentInputs | null | undefined
): {
  quarterlySetAside: number | null;
  expectedBalanceDue: number | null;
  safeHarborAnnualTarget: number | null;
  status: TaxBrief["estimatedPaymentsStatus"];
} {
  if (!inputs) {
    return {
      quarterlySetAside: null,
      expectedBalanceDue: null,
      safeHarborAnnualTarget: null,
      status: "inputs-required",
    };
  }

  const projectedTotalTax = nonnegative(inputs.projectedTotalTax);
  const withholding = nonnegative(inputs.federalIncomeTaxWithheld);
  const refundableCredits = nonnegative(inputs.refundableCredits);
  const paymentsMade = nonnegative(inputs.estimatedPaymentsMade);
  const priorYearTotalTax = nonnegative(inputs.priorYearTotalTax);
  const coverage = withholding + refundableCredits + paymentsMade;
  const expectedBalanceDue = roundMoney(
    Math.max(0, projectedTotalTax - coverage)
  );
  const safeHarborAnnualTarget = roundMoney(
    Math.min(
      projectedTotalTax * 0.9,
      priorYearTotalTax * inputs.priorYearSafeHarborRate
    )
  );
  const reserveNeeded = Math.max(0, safeHarborAnnualTarget - coverage);

  if (expectedBalanceDue < 1_000 || reserveNeeded <= 0) {
    return {
      quarterlySetAside: 0,
      expectedBalanceDue,
      safeHarborAnnualTarget,
      status: "not-indicated",
    };
  }

  return {
    quarterlySetAside: Math.ceil(reserveNeeded / 4),
    expectedBalanceDue,
    safeHarborAnnualTarget,
    status: "planning-reserve",
  };
}

/**
 * Progressive 2025 single-filer bracket calculation. Actual returns below
 * $100,000 generally use the IRS tax tables and can differ slightly.
 */
export function estimate2025SingleIncomeTax(taxableIncome: number): number {
  let remaining = Math.max(0, taxableIncome);
  let lower = 0;
  let tax = 0;
  for (const bracket of SINGLE_BRACKETS_2025) {
    if (remaining <= 0) break;
    const width = bracket.ceiling - lower;
    const slice = Math.min(remaining, width);
    tax += slice * bracket.rate;
    remaining -= slice;
    lower = bracket.ceiling;
  }
  return roundMoney(tax);
}

/**
 * Schedule SE planning calculation. Net earnings are 92.35% of Schedule C
 * profit; Social Security and Medicare pieces are calculated separately.
 */
export function estimate2025SelfEmploymentTax(
  annualNetProfit: number,
  socialSecurityWages = 0
): number {
  const netEarnings = Math.max(0, annualNetProfit) * 0.9235;
  if (netEarnings < 400) return 0;
  const remainingSocialSecurityBase = Math.max(
    0,
    SELF_EMPLOYMENT_SOCIAL_SECURITY_CAP_2025 -
      Math.max(0, socialSecurityWages)
  );
  const socialSecurityTax =
    Math.min(netEarnings, remainingSocialSecurityBase) * 0.124;
  const medicareTax = netEarnings * 0.029;
  return roundMoney(socialSecurityTax + medicareTax);
}

/**
 * Build a conservative tax-oriented brief from the year represented by `ym`.
 * Unknown deposits remain unknown; they are never silently assigned a tax rate.
 */
export function buildTaxBrief(
  state: FinanceState,
  ym: string,
  inputs: TaxBriefInputs = {}
): TaxBrief {
  const taxYear = yearOf(ym);
  const yearTransactions = txsInYear(state.txs, taxYear);
  const findings: TaxFinding[] = [];

  let confirmedGiftIn = 0;
  let confirmedGiftInCount = 0;
  let unconfirmedFamilyIn = 0;
  let unconfirmedFamilyInCount = 0;
  let payrollDeposits = 0;
  let payrollDepositCount = 0;
  let selfEmploymentGrossReceipts = 0;
  let selfEmploymentGrossReceiptCount = 0;
  let investmentIncome = 0;
  let investmentIncomeCount = 0;
  let brokerIn = 0;
  let brokerInCount = 0;
  let otherUnclassifiedIn = 0;
  let otherUnclassifiedInCount = 0;
  let economicOut = 0;
  let cardPayments = 0;
  let cardPaymentCount = 0;
  let zelleOut = 0;
  let zelleOutCount = 0;

  for (const tx of yearTransactions) {
    if (tx.kind === "income") {
      if (isTransfer(tx)) {
        continue;
      } else if (isConfirmedGift(tx)) {
        confirmedGiftIn += tx.amount;
        confirmedGiftInCount += 1;
      } else if (isUnconfirmedFamilyLike(tx)) {
        unconfirmedFamilyIn += tx.amount;
        unconfirmedFamilyInCount += 1;
      } else if (isPayrollLike(tx)) {
        payrollDeposits += tx.amount;
        payrollDepositCount += 1;
      } else if (isSelfEmploymentLike(tx)) {
        selfEmploymentGrossReceipts += tx.amount;
        selfEmploymentGrossReceiptCount += 1;
      } else if (isInvestmentIncomeLike(tx)) {
        investmentIncome += tx.amount;
        investmentIncomeCount += 1;
      } else if (isBrokerCash(tx)) {
        brokerIn += tx.amount;
        brokerInCount += 1;
      } else {
        otherUnclassifiedIn += tx.amount;
        otherUnclassifiedInCount += 1;
      }
      continue;
    }

    if (isCardPayment(tx)) {
      cardPayments += tx.amount;
      cardPaymentCount += 1;
    } else if (isTransfer(tx)) {
      continue;
    } else {
      economicOut += tx.amount;
    }
    if (/\bzelle to\b/.test(transactionText(tx))) {
      zelleOut += tx.amount;
      zelleOutCount += 1;
    }
  }

  const unclassifiedIn = unconfirmedFamilyIn + otherUnclassifiedIn;
  const unclassifiedInCount =
    unconfirmedFamilyInCount + otherUnclassifiedInCount;
  const economicIn =
    confirmedGiftIn +
    unconfirmedFamilyIn +
    payrollDeposits +
    selfEmploymentGrossReceipts +
    investmentIncome +
    otherUnclassifiedIn;
  const ytdNet = economicIn - economicOut;
  const selectedMonths =
    taxYear < new Date().getFullYear() ? 12 : monthOf(ym);
  const lastLedgerMonth = yearTransactions.reduce((latest, tx) => {
    const month = Number(tx.date.slice(5, 7)) || 0;
    return Math.max(latest, month);
  }, 0);
  const monthsElapsed = Math.max(1, selectedMonths, lastLedgerMonth);

  const annualizedPayrollDeposits = annualize(
    payrollDeposits,
    monthsElapsed
  );
  const annualizedSelfEmploymentGrossReceipts = annualize(
    selfEmploymentGrossReceipts,
    monthsElapsed
  );
  const annualizedGross =
    annualizedPayrollDeposits + annualizedSelfEmploymentGrossReceipts;
  const rulesAvailable = taxYear === TAX_RULES_YEAR;
  const grossReceiptsSelfEmploymentTaxStress =
    rulesAvailable && annualizedSelfEmploymentGrossReceipts > 0
      ? estimate2025SelfEmploymentTax(
          annualizedSelfEmploymentGrossReceipts,
          0
        )
      : null;

  // A bank ledger has neither W-2 box 1/3/7 nor Schedule C net profit. Do not
  // manufacture precise liability numbers from net pay or gross receipts.
  const taxableIncomeEstimate = null;
  const estimatedIncomeTax = null;
  const estimatedSelfEmploymentTax = null;
  const estimatedFederal = null;
  const hasPotentiallyReportableIncome =
    payrollDeposits +
      selfEmploymentGrossReceipts +
      investmentIncome +
      brokerIn +
      unclassifiedIn >
    0;
  const paymentPlan = rulesAvailable
    ? (inputs.estimatedPayments || hasPotentiallyReportableIncome)
      ? estimatedPaymentPlan(inputs.estimatedPayments)
      : {
          quarterlySetAside: 0,
          expectedBalanceDue: 0,
          safeHarborAnnualTarget: 0,
          status: "not-indicated" as const,
        }
    : {
        quarterlySetAside: null,
        expectedBalanceDue: null,
        safeHarborAnnualTarget: null,
        status: "rules-unavailable" as const,
      };

  const buckets: TaxIncomeBucket[] = [
    {
      id: "family",
      label: "Confirmed gifts",
      total: roundMoney(confirmedGiftIn),
      count: confirmedGiftInCount,
      treatment:
        "Generally not income to the recipient. Keep the sender, date, amount, purpose, and the explicit gift classification.",
    },
    {
      id: "family-unconfirmed",
      label: "Unconfirmed family / P2P deposits",
      total: roundMoney(unconfirmedFamilyIn),
      count: unconfirmedFamilyInCount,
      treatment:
        "Unknown until confirmed. A family name or Zelle rail does not prove a gift; payment for services remains taxable.",
    },
    {
      id: "payroll-cash",
      label: "Payroll cash deposits",
      total: roundMoney(payrollDeposits),
      count: payrollDepositCount,
      treatment:
        "Cash-flow evidence only. Reconcile to W-2 box 1 for income tax and boxes 3 and 7 for the Social Security wage base.",
    },
    {
      id: "self-employed",
      label: "1099-NEC / business gross receipts",
      total: roundMoney(selfEmploymentGrossReceipts),
      count: selfEmploymentGrossReceiptCount,
      treatment:
        "Gross receipts are not Schedule C net profit. Reconcile income and substantiated expenses before calculating income or self-employment tax.",
    },
    {
      id: "investment-income",
      label: "Interest / dividend-like income",
      total: roundMoney(investmentIncome),
      count: investmentIncomeCount,
      treatment:
        "Reconcile to 1099-INT and 1099-DIV. Qualified dividends and capital gains may require preferential-rate worksheets.",
    },
    {
      id: "broker",
      label: "Broker / investment cash",
      total: roundMoney(brokerIn),
      count: brokerInCount,
      treatment:
        "Cash movement is not the taxable event by itself. Reconcile 1099-B/1099-DIV and cost basis before estimating gains.",
    },
    {
      id: "other-in",
      label: "Unclassified deposits",
      total: roundMoney(otherUnclassifiedIn),
      count: otherUnclassifiedInCount,
      treatment:
        "Unknown. Identify the exact 1099 subtype or classify as earned income, refund, reimbursement, gift, loan, or transfer.",
    },
  ].filter((bucket) => bucket.total > 0 || bucket.count > 0);

  if (unclassifiedIn > 0) {
    findings.push({
      id: "tax-unclassified-income",
      severity: "critical",
      title: "Tax estimate is blocked by unclassified deposits",
      detail: `${money(unclassifiedIn)} across ${unclassifiedInCount} deposit${
        unclassifiedInCount === 1 ? "" : "s"
      } has no defensible tax treatment. Classify each before treating the estimate as useful.`,
      amount: unclassifiedIn,
    });
  }

  if (brokerIn > 0) {
    findings.push({
      id: "tax-broker-ambiguous",
      severity: "high",
      title: "Broker cash is not a capital-gain calculation",
      detail: `${money(brokerIn)} moved through investment-labelled accounts. Import the broker tax forms and cost basis; deposits and withdrawals alone cannot establish taxable gains.`,
      amount: brokerIn,
    });
  }

  if (confirmedGiftIn > economicIn * 0.6 && economicIn > 0) {
    findings.push({
      id: "tax-family-heavy",
      severity: "high",
      title: "Most economic inflow is confirmed gift support",
      detail: `${money(confirmedGiftIn)} of ${money(economicIn)} is explicitly classified as gifts. Preserve the evidence and keep support separate from wages or business revenue.`,
      amount: confirmedGiftIn,
    });
  }

  if (cardPayments > economicOut * 0.5 || (cardPayments > 0 && economicOut === 0)) {
    findings.push({
      id: "tax-card-opaque",
      severity: "high",
      title: "Card payoffs hide the underlying deductions and spending",
      detail: `${money(cardPayments)} is recorded as ${cardPaymentCount} card payoff${
        cardPaymentCount === 1 ? "" : "s"
      }. Import card-level transactions; never deduct a payoff as though it were the purchase.`,
      amount: cardPayments,
    });
  }

  if (paymentPlan.quarterlySetAside != null && paymentPlan.quarterlySetAside > 0) {
    findings.push({
      id: "tax-quarterly-reserve",
      severity: "medium",
      title: `Baseline planning reserve: ${money(
        paymentPlan.quarterlySetAside
      )} per quarter`,
      detail:
        "This uses explicitly entered projected total tax, withholding, refundable credits, payments made, and prior-year safe-harbor inputs. Recalculate for due dates or uneven income.",
      amount: paymentPlan.quarterlySetAside,
    });
  }

  if (!rulesAvailable) {
    findings.unshift({
      id: "tax-rules-year-mismatch",
      severity: "critical",
      title: `${taxYear} tax rules are not loaded`,
      detail: `The available rule set is ${TAX_RULES_YEAR}. No ${taxYear} liability, self-employment stress calculation, or estimated-payment reserve was produced.`,
    });
  }

  if (selfEmploymentGrossReceipts > 0) {
    findings.push({
      id: "tax-schedule-c-net-profit-required",
      severity: "high",
      title: "Gross business receipts are not Schedule C profit",
      detail: `${money(
        selfEmploymentGrossReceipts
      )} is receipt-level cash. Enter documented business expenses and Schedule C net profit before calculating self-employment tax.`,
      amount: selfEmploymentGrossReceipts,
    });
  }

  if (payrollDeposits > 0) {
    findings.push({
      id: "tax-w2-boxes-required",
      severity: "high",
      title: "Payroll deposits cannot substitute for W-2 boxes",
      detail: `${money(
        payrollDeposits
      )} is net cash received. Import W-2 box 1 and Social Security wages and tips from boxes 3 and 7 before calculating tax.`,
      amount: payrollDeposits,
    });
  }

  if (zelleOut > 200) {
    findings.push({
      id: "tax-zelle-out",
      severity: "low",
      title: "Outbound Zelle needs purpose labels",
      detail: `${money(zelleOut)} across ${zelleOutCount} payment${
        zelleOutCount === 1 ? "" : "s"
      } needs reimbursement, gift, rent-share, or business-purpose evidence.`,
      amount: zelleOut,
    });
  }

  if (yearTransactions.length < 12) {
    findings.push({
      id: "tax-thin-ledger",
      severity: "info",
      title: "The year is too thin for filing confidence",
      detail:
        "Import every bank, card, payroll, and broker statement for the year before reconciling to tax forms.",
    });
  }

  const missingFacts = [
    "Actual filing status and dependent eligibility",
    "W-2 box 1 wages and boxes 3 and 7 Social Security wages and tips",
    "Federal and state withholding from every W-2 and tax form",
    "Prior-year total tax for the estimated-payment safe harbor",
    "Qualified dividends, capital gains, cost basis, and broker adjustments",
    "Documented Schedule C net profit, expenses, and the QBI deduction",
    "Credits, deductions, Additional Medicare Tax, state tax, and local tax",
  ];

  const assumptions = [
    `The only loaded federal rule set is ${TAX_RULES_YEAR}; it is not applied to other tax years.`,
    "Payroll-labelled bank deposits are cash-flow observations, never inferred W-2 wages.",
    "Only explicit 1099-NEC or business evidence enters gross business receipts; other 1099 subtypes remain separate.",
    "The gross-receipts Schedule SE stress figure assumes no expenses and no wages consume the Social Security base. It is not a liability estimate.",
    `Annualizes observed payroll cash and gross receipts over ${monthsElapsed} month${
      monthsElapsed === 1 ? "" : "s"
    }; incomplete imports can distort the pace.`,
  ];

  const sourceNotes = [
    "IRS Publication 17 (2025), p. 1: standard deduction amounts.",
    "IRS Publication 17 (2025), pp. 37-42: withholding and estimated tax.",
    "IRS Publication 17 (2025), pp. 95 and 123: standard deduction and 2025 tax computation.",
    "2025 Schedule SE: 92.35% net-earnings factor, 15.3% combined rate, and $176,100 Social Security wage base.",
  ];

  const dataConfidence: TaxBrief["dataConfidence"] =
    yearTransactions.length < 12 || unclassifiedIn > 0
      ? "low"
      : "medium";

  let order =
    "Classify every deposit, reconcile every tax form, then calculate tax.";
  if (!rulesAvailable) {
    order = `Load a verified ${taxYear} rule set before calculating any ${taxYear} tax number.`;
  } else if (unclassifiedIn > 0) {
    order = `Classify ${money(unclassifiedIn)} of unknown deposits before using any tax number.`;
  } else if (payrollDeposits > 0) {
    order =
      "Import W-2 box 1 and boxes 3 and 7; net payroll deposits are not taxable wage inputs.";
  } else if (selfEmploymentGrossReceipts > 0) {
    order =
      "Reconcile business receipts and expenses to Schedule C net profit before calculating tax.";
  } else if (cardPayments > 0) {
    order =
      "Import credit-card detail; card payoffs conceal purchase-level tax evidence.";
  } else if (
    paymentPlan.quarterlySetAside != null &&
    paymentPlan.quarterlySetAside > 0
  ) {
    order = `Reserve ${money(
      paymentPlan.quarterlySetAside
    )} per quarter as a baseline, then adjust for payment dates and uneven income.`;
  }

  return {
    taxYear,
    rulesYear: TAX_RULES_YEAR,
    ytdGrossIn: roundMoney(economicIn),
    ytdGrossOut: roundMoney(economicOut),
    ytdNet: roundMoney(ytdNet),
    buckets,
    annualizedGross: roundMoney(annualizedGross),
    annualizedPayrollDeposits: roundMoney(annualizedPayrollDeposits),
    annualizedSelfEmploymentGrossReceipts: roundMoney(
      annualizedSelfEmploymentGrossReceipts
    ),
    grossReceiptsSelfEmploymentTaxStress,
    taxableIncomeEstimate,
    estimatedIncomeTax,
    estimatedSelfEmploymentTax,
    estimatedFederal,
    quarterlySetAside: paymentPlan.quarterlySetAside,
    expectedBalanceDue: paymentPlan.expectedBalanceDue,
    safeHarborAnnualTarget: paymentPlan.safeHarborAnnualTarget,
    estimatedPaymentsStatus: paymentPlan.status,
    dataConfidence,
    assumptions,
    missingFacts,
    sourceNotes,
    findings,
    order,
  };
}

/** Plain-language tax response from the ledger brief. */
export function answerTax(question: string, tax: TaxBrief): string | null {
  if (
    !/(tax|irs|1099|w-?2|quarterly|deduct|filing|april|withhold|refund|schedule [a-z]|standard deduction|estimated payment|capital gains?|qualified dividends?|scholarships?|fellowships?|qualifying child|dependent|student loan interest|gift|inheritance)/i.test(
      question
    )
  ) {
    return null;
  }

  const top = tax.findings[0];
  if (
    /\b(missing|records?|documents?|forms?|what (?:do|will) i need|inputs? required|before i can estimate)\b/i.test(
      question
    )
  ) {
    const records = tax.missingFacts
      .slice(0, 7)
      .map((fact, index) => `${index + 1}) ${fact}`)
      .join("; ");
    const ruleYearNote =
      tax.taxYear === tax.rulesYear
        ? ""
        : ` A verified ${tax.taxYear} rule set is also required; only ${tax.rulesYear} rules are loaded.`;
    return `No quarterly-payment estimate is defensible yet.${ruleYearNote} Required records: ${records}. Next: ${tax.order}`;
  }

  const estimate =
    tax.estimatedFederal != null &&
    tax.taxableIncomeEstimate != null &&
    tax.estimatedIncomeTax != null &&
    tax.estimatedSelfEmploymentTax != null
      ? `Verified-input scenario: taxable income ${money(
          tax.taxableIncomeEstimate
        )}, income tax ${money(
          tax.estimatedIncomeTax
        )}, self-employment tax ${money(
          tax.estimatedSelfEmploymentTax
        )}, combined federal ${money(tax.estimatedFederal)}. `
      : `No precise federal liability was calculated from the bank ledger. ${
          tax.taxYear === tax.rulesYear
            ? "Net payroll deposits are not W-2 wages, and gross business receipts are not Schedule C profit. "
            : `Only ${tax.rulesYear} rules are loaded, not ${tax.taxYear} rules. `
        }`;
  const observedPace =
    tax.annualizedGross > 0
      ? `Observed annualized payroll cash plus gross business receipts: ${money(
          tax.annualizedGross
        )}. `
      : "";
  const stress =
    tax.grossReceiptsSelfEmploymentTaxStress != null
      ? `Gross-receipts Schedule SE stress ceiling: ${money(
          tax.grossReceiptsSelfEmploymentTaxStress
        )}; this assumes no expenses and no wages against the Social Security base, so it is not tax due. `
      : "";

  return (
    `Tax year ${tax.taxYear}; evidence confidence ${tax.dataConfidence}. ` +
    `Economic YTD in ${money(tax.ytdGrossIn)}, out ${money(
      tax.ytdGrossOut
    )}, net ${money(tax.ytdNet)}. ` +
    estimate +
    observedPace +
    stress +
    (tax.quarterlySetAside != null && tax.quarterlySetAside > 0
      ? `Baseline reserve ${money(
          tax.quarterlySetAside
        )}/quarter from explicitly entered total-tax, withholding, credit, payment, and safe-harbor inputs. `
      : "") +
    `Next: ${tax.order}` +
    (top ? ` Top exception: ${top.title}. ${top.detail}` : "")
  );
}

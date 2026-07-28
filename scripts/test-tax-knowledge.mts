import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const corpusPath = resolve(
  here,
  "../public/knowledge/irs/p17-2025-corpus.json"
);
const corpus = JSON.parse(readFileSync(corpusPath, "utf8"));
const originalFetch = globalThis.fetch;
let corpusFetchAttempts = 0;
globalThis.fetch = (async () => {
  corpusFetchAttempts += 1;
  if (corpusFetchAttempts === 1) {
    return {
      ok: false,
      status: 503,
      json: async () => ({}),
    } as Response;
  }
  return {
    ok: true,
    status: 200,
    json: async () => corpus,
  } as Response;
}) as typeof fetch;
const {
  buildTaxEvidencePack,
  isTaxKnowledgeQuestion,
  searchTaxCorpus,
} = await import("../src/melani/taxKnowledge.ts");
const {
  answerTax,
  buildTaxBrief,
  estimate2025SelfEmploymentTax,
  estimate2025SingleIncomeTax,
} = await import("../src/melani/financeTax.ts");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(corpus.pageCount === 142, "expected all 142 PDF pages");
assert(corpus.printedPageCount === 140, "expected all 140 printed pages");
assert(corpus.pages.length === 142, "page array is incomplete");
assert(corpus.pages.every((page: { text: string }) => page.text.length > 0), "empty page text");
assert(corpus.chunks.length === corpus.chunkCount, "chunk count mismatch");
assert(
  corpus.sha256 ===
    "2d2381d62c7c77ed4b64b83ac23c28ed85b7c8304eb580c09bd9fd660be0840b",
  "source PDF checksum mismatch"
);
assert(isTaxKnowledgeQuestion("Can I deduct IRA contributions?"), "tax router miss");
assert(!isTaxKnowledgeQuestion("chart my coffee spending"), "tax router false positive");
assert(
  isTaxKnowledgeQuestion("How are long-term capital gains taxed?"),
  "capital-gains router miss"
);
assert(
  isTaxKnowledgeQuestion("How do qualified dividends work?"),
  "qualified-dividend router miss"
);
assert(
  isTaxKnowledgeQuestion("Do I have to report scholarship income?"),
  "scholarship router miss"
);
assert(
  isTaxKnowledgeQuestion("Who is a qualifying child?"),
  "qualifying-child router miss"
);
assert(
  !isTaxKnowledgeQuestion("How can I improve my credit score?"),
  "credit-score question must not be routed into tax evidence"
);

const failedFirstLoad = await buildTaxEvidencePack(
  "What is the standard deduction?"
);
assert(
  failedFirstLoad.hits.length === 0 &&
    /temporarily unavailable/i.test(failedFirstLoad.text),
  "first corpus failure must be explicit"
);
const recoveredLoad = await buildTaxEvidencePack(
  "What is the standard deduction?"
);
assert(
  recoveredLoad.hits.length > 0 && corpusFetchAttempts === 2,
  "a transient corpus failure must be retried"
);

const boundedEvidence = await buildTaxEvidencePack(
  "What is the standard deduction?",
  600
);
assert(
  boundedEvidence.text.length > 0 && boundedEvidence.text.length <= 600,
  "tax evidence exceeded maxChars"
);
const creditEvidence = await buildTaxEvidencePack(
  "How can I improve my credit score?"
);
assert(
  creditEvidence.text === "" && creditEvidence.hits.length === 0,
  "credit-score question received tax evidence"
);

const ira = searchTaxCorpus(corpus, "traditional IRA deduction phaseout");
assert(ira.length > 0, "IRA retrieval returned no evidence");
assert(
  ira.some((hit) => /traditional IRA|individual retirement/i.test(hit.text)),
  "IRA retrieval missed the relevant source"
);

const dependents = searchTaxCorpus(corpus, "who qualifies as my dependent child?");
assert(dependents.length > 0, "dependent retrieval returned no evidence");
assert(
  dependents.some((hit) => /qualifying child|dependent/i.test(hit.text)),
  "dependent retrieval missed the relevant source"
);

const standardDeduction = searchTaxCorpus(
  corpus,
  "What is the 2025 standard deduction for a single filer?"
);
assert(
  standardDeduction[0]?.printedPage === 95 ||
    standardDeduction[0]?.printedPage === 1,
  "standard deduction retrieval missed the rule/table"
);

const estimatedPayments = searchTaxCorpus(
  corpus,
  "Do I need estimated tax payments for freelance income?"
);
assert(
  estimatedPayments[0]?.printedPage === 41,
  "estimated-payment retrieval missed the general rule"
);

const gifts = searchTaxCorpus(
  corpus,
  "Is a cash gift from my mom taxable income to me?"
);
assert(
  gifts[0]?.printedPage === 76 &&
    /gifts and inheritances/i.test(gifts[0].text),
  "gift retrieval missed the recipient-income rule"
);

const capitalGains = searchTaxCorpus(
  corpus,
  "How are long-term capital gains taxed?"
);
assert(
  capitalGains[0]?.printedPage === 106 &&
    /net capital gain|qualified dividends/i.test(capitalGains[0].text),
  "capital-gain retrieval missed Publication 17's special-method rule"
);
const capitalGainsPack = await buildTaxEvidencePack(
  "How are long-term capital gains taxed?"
);
assert(
  capitalGainsPack.hits[0]?.printedPage === 106,
  "capital-gain production evidence pack is empty or misrouted"
);

const scholarships = searchTaxCorpus(
  corpus,
  "Do I have to report scholarship income?"
);
assert(
  scholarships[0]?.printedPage === 77 &&
    /qualified scholarship/i.test(scholarships[0].text),
  "scholarship retrieval missed the qualified-expense rule"
);
const scholarshipPack = await buildTaxEvidencePack(
  "Do I have to report scholarship income?"
);
assert(
  scholarshipPack.hits[0]?.printedPage === 77,
  "scholarship production evidence pack is empty or misrouted"
);

assert(
  estimate2025SingleIncomeTax(11_925) === 1_192.5,
  "single-filer first bracket is wrong"
);
assert(
  estimate2025SingleIncomeTax(48_475) === 5_578.5,
  "single-filer second bracket is wrong"
);
assert(
  estimate2025SelfEmploymentTax(400) === 0,
  "Schedule SE threshold must use net earnings"
);
assert(
  estimate2025SelfEmploymentTax(500) === 70.65,
  "Schedule SE rate calculation is wrong"
);

const planningBrief = buildTaxBrief(
  {
    version: 2,
    accounts: [],
    budget: [],
    watchlist: [],
    txs: [
      {
        id: "wages",
        date: "2025-12-01",
        kind: "income",
        amount: 21_000,
        category: "Income",
        note: "",
        merchant: "Payroll direct deposit",
      },
      {
        id: "client",
        date: "2025-12-02",
        kind: "income",
        amount: 7_000,
        category: "Income",
        note: "Client 1099-NEC invoice",
        merchant: "Client payment",
      },
      {
        id: "family-unknown",
        date: "2025-12-03",
        kind: "income",
        amount: 5_000,
        category: "Zelle",
        note: "Family support consulting invoice",
        merchant: "Zelle from Mom",
      },
      {
        id: "gift-confirmed",
        date: "2025-12-04",
        kind: "income",
        amount: 1_000,
        category: "Gifts",
        note: "Confirmed gift",
        merchant: "Zelle from Mom",
      },
      {
        id: "dividend",
        date: "2025-12-05",
        kind: "income",
        amount: 2_000,
        category: "Income",
        note: "",
        merchant: "1099-DIV dividend",
      },
      {
        id: "interest",
        date: "2025-12-06",
        kind: "income",
        amount: 300,
        category: "Income",
        note: "",
        merchant: "Marcus interest payment",
      },
      {
        id: "transfer",
        date: "2025-12-07",
        kind: "income",
        amount: 10_000,
        category: "Transfers",
        note: "",
        merchant: "Transfer from savings",
      },
      {
        id: "payoff",
        date: "2025-12-08",
        kind: "expense",
        amount: 2_500,
        category: "Credit card payment",
        note: "",
        merchant: "Chase credit card payment",
      },
      {
        id: "utility",
        date: "2025-12-09",
        kind: "expense",
        amount: 900,
        category: "Utilities",
        note: "",
        merchant: "Electric utility autopay",
      },
    ],
  },
  "2025-12"
);

assert(planningBrief.rulesYear === 2025, "tax rules year must be explicit");
assert(
  planningBrief.ytdGrossIn === 36_300,
  "production buildTaxBrief path misclassified economic inflow"
);
assert(
  planningBrief.ytdGrossOut === 900,
  "autopay, transfer, or card-payoff handling is wrong"
);
assert(
  planningBrief.buckets.some(
    (bucket) => bucket.id === "self-employed" && bucket.total === 7_000
  ),
  "self-employment bucket is missing"
);
assert(
  planningBrief.buckets.some(
    (bucket) => bucket.id === "investment-income" && bucket.total === 2_300
  ),
  "1099-DIV or Marcus interest was not kept out of Schedule C"
);
assert(
  planningBrief.buckets.some(
    (bucket) => bucket.id === "family-unconfirmed" && bucket.total === 5_000
  ),
  "ambiguous family/Zelle receipt was silently treated as a gift"
);
assert(
  planningBrief.buckets.some(
    (bucket) => bucket.id === "family" && bucket.total === 1_000
  ),
  "explicitly confirmed gift was not preserved"
);
assert(
  planningBrief.buckets.some(
    (bucket) => bucket.id === "payroll-cash" && bucket.total === 21_000
  ),
  "payroll deposit was not retained as cash-only evidence"
);
assert(
  planningBrief.taxableIncomeEstimate === null &&
    planningBrief.estimatedIncomeTax === null &&
    planningBrief.estimatedSelfEmploymentTax === null &&
    planningBrief.estimatedFederal === null,
  "bank deposits were used to manufacture a precise tax liability"
);
assert(
  planningBrief.grossReceiptsSelfEmploymentTaxStress != null &&
    planningBrief.grossReceiptsSelfEmploymentTaxStress > 0,
  "gross-receipts stress calculation is missing"
);
assert(
  planningBrief.quarterlySetAside === null &&
    planningBrief.estimatedPaymentsStatus === "inputs-required",
  "estimated-payment reserve was inferred without safe-harbor inputs"
);
assert(
  planningBrief.missingFacts.some((fact) => /W-2 box 1/i.test(fact)),
  "model must expose missing W-2 boxes"
);
assert(
  planningBrief.findings.some((finding) => finding.id === "tax-card-opaque"),
  "card-payoff opacity was not surfaced"
);
assert(
  planningBrief.findings.some(
    (finding) => finding.id === "tax-w2-boxes-required"
  ) &&
    planningBrief.findings.some(
      (finding) => finding.id === "tax-schedule-c-net-profit-required"
    ),
  "production brief did not surface required tax-form inputs"
);
const recordsAnswer = answerTax(
  "What tax records are missing before I can estimate quarterly payments?",
  planningBrief
);
assert(
  recordsAnswer != null &&
    /W-2 box 1/i.test(recordsAnswer) &&
    /withholding/i.test(recordsAnswer) &&
    /prior-year total tax/i.test(recordsAnswer),
  "missing-records question did not return the concrete tax-form checklist"
);

const wrongRuleYear = buildTaxBrief(
  {
    version: 2,
    accounts: [],
    budget: [],
    watchlist: [],
    txs: [
      {
        id: "future-client",
        date: "2026-07-01",
        kind: "income",
        amount: 5_000,
        category: "Income",
        note: "1099-NEC",
        merchant: "Client payment",
      },
    ],
  },
  "2026-07"
);
assert(
  wrongRuleYear.estimatedFederal === null &&
    wrongRuleYear.grossReceiptsSelfEmploymentTaxStress === null &&
    wrongRuleYear.quarterlySetAside === null &&
    wrongRuleYear.estimatedPaymentsStatus === "rules-unavailable" &&
    wrongRuleYear.findings[0]?.id === "tax-rules-year-mismatch",
  "2025 rules leaked into a different tax year"
);

const paymentBrief = buildTaxBrief(
  {
    version: 2,
    accounts: [],
    budget: [],
    watchlist: [],
    txs: [],
  },
  "2025-12",
  {
    estimatedPayments: {
      projectedTotalTax: 10_000,
      federalIncomeTaxWithheld: 2_000,
      refundableCredits: 0,
      estimatedPaymentsMade: 0,
      priorYearTotalTax: 6_000,
      priorYearSafeHarborRate: 1,
    },
  }
);
assert(
  paymentBrief.expectedBalanceDue === 8_000 &&
    paymentBrief.safeHarborAnnualTarget === 6_000 &&
    paymentBrief.quarterlySetAside === 1_000 &&
    paymentBrief.estimatedPaymentsStatus === "planning-reserve",
  "explicit estimated-payment safe-harbor calculation is wrong"
);

const subThousandBalance = buildTaxBrief(
  {
    version: 2,
    accounts: [],
    budget: [],
    watchlist: [],
    txs: [],
  },
  "2025-12",
  {
    estimatedPayments: {
      projectedTotalTax: 2_500,
      federalIncomeTaxWithheld: 1_600,
      refundableCredits: 0,
      estimatedPaymentsMade: 0,
      priorYearTotalTax: 3_000,
      priorYearSafeHarborRate: 1,
    },
  }
);
assert(
  subThousandBalance.expectedBalanceDue === 900 &&
    subThousandBalance.quarterlySetAside === 0 &&
    subThousandBalance.estimatedPaymentsStatus === "not-indicated",
  "$1,000 balance-due test was not applied after withholding and credits"
);

globalThis.fetch = originalFetch;

console.log(
  `IRS Publication 17 corpus verified: ${corpus.pageCount} pages, ${corpus.chunkCount} chunks; tax planning checks passed`
);

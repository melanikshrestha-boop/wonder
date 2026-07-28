/**
 * Smart Accountant test suite — money math, imports, dedupe,
 * transfer detection, and the net-worth timeline.
 * Run: npm run test:finance
 */

// localStorage shim for store modules loaded in Node
const values = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, String(value)),
    removeItem: (key: string) => values.delete(key),
  },
});

const { parseCents, formatCents, sumCents, roundDollars } = await import(
  "../src/melani/financeMoney.ts"
);
const { parseOfx, importOfx, looksLikeOfx } = await import(
  "../src/melani/financeOfx.ts"
);
const { parseBankCsv, txFingerprint } = await import(
  "../src/melani/financeCsv.ts"
);
const { cleanMerchant } = await import("../src/melani/financeCategorize.ts");
const { mergeTxs, newTx } = await import("../src/melani/financeStore.ts");
const {
  detectTransferPairs,
  applyTransferPair,
  monthTrueIncome,
  monthTrueSpend,
} = await import("../src/melani/financeTransfers.ts");
const { buildWorthSeries, valuationAt, monthEndDates, newValuationItem } =
  await import("../src/melani/financeNetWorth.ts");
const { fitChartHoverLabel, hoverLabelPlacement } = await import(
  "../src/melani/chartLayout.ts"
);

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`, detail === undefined ? "" : detail);
  }
}

// ── Money math ──────────────────────────────────────────────
console.log("money math");
check("parseCents 12.34", parseCents("12.34") === 1234);
check("parseCents $1,234.56", parseCents("$1,234.56") === 123456);
check("parseCents (45.00) accounting negative", parseCents("(45.00)") === -4500);
check("parseCents -0.01", parseCents("-0.01") === -1);
check("parseCents unicode minus", parseCents("−5.00") === -500);
check("parseCents garbage null", parseCents("abc") === null);
check("parseCents empty null", parseCents("") === null);
check("parseCents number 0.1+0.2 rounds clean", parseCents(0.1 + 0.2) === 30);
check("formatCents 123456", formatCents(123456) === "$1,234.56");
check("formatCents -5", formatCents(-5) === "-$0.05");
check("sumCents no float dust", sumCents([10, 20, 1]) === 31);
check("roundDollars kills dust", roundDollars(0.1 + 0.2) === 0.3);

console.log("chart layout");
check(
  "chart hover: first point anchors inward",
  hoverLabelPlacement(48, 48, 628).textAnchor === "start" &&
    hoverLabelPlacement(48, 48, 628).x > 48
);
check(
  "chart hover: middle point stays centered",
  hoverLabelPlacement(338, 48, 628).textAnchor === "middle"
);
check(
  "chart hover: last point anchors inward",
  hoverLabelPlacement(628, 48, 628).textAnchor === "end" &&
    hoverLabelPlacement(628, 48, 628).x < 628
);
check(
  "chart hover: long labels are bounded",
  fitChartHoverLabel("x".repeat(200), 580).endsWith("…") &&
    fitChartHoverLabel("x".repeat(200), 580).length < 100
);

// ── CSV import ──────────────────────────────────────────────
console.log("csv import");
const chaseCsv = [
  "Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #",
  'DEBIT,07/02/2026,"STARBUCKS STORE 1234",-6.75,DEBIT_CARD,100.00,',
  'CREDIT,07/03/2026,"PAYROLL DIRECT DEP",2000.00,ACH_CREDIT,2100.00,',
].join("\n");
const csvRes = parseBankCsv(chaseCsv);
check("chase-style rows parsed", csvRes.added.length === 2, csvRes.errors);
const coffee = csvRes.added.find((t) => t.kind === "expense");
check("expense amount positive w/ kind", coffee?.amount === 6.75);
check(
  "unknown income waits for source classification",
  csvRes.added.some(
    (t) => t.kind === "income" && t.category === "Uncategorized"
  )
);

const dup = parseBankCsv(chaseCsv, {
  existingFingerprints: new Set(
    csvRes.added.map((t) => t.externalId || "")
  ),
});
check("re-import fully deduped", dup.added.length === 0 && dup.skipped === 2, dup);

const fpA = txFingerprint({ date: "2026-07-01", amount: -5, merchant: "A  B" });
const fpB = txFingerprint({ date: "2026-07-01", amount: -5, merchant: "a b" });
check("fingerprint normalizes whitespace/case", fpA === fpB);
check(
  "merchant cleaner removes Zelle confirmation tail",
  cleanMerchant("Zelle from Yuetong Liu 0Jx01B91Kkf8") ===
    "Zelle from Yuetong Liu"
);
check(
  "merchant cleaner removes mixed trailing bank token",
  cleanMerchant("Zelle from JINGTONG LUO BAClxqw9147f") ===
    "Zelle from JINGTONG LUO"
);
check(
  "merchant cleaner removes stale Zelle BAC tail",
  cleanMerchant("Zelle from JINGTONG LUO BAC") === "Zelle from JINGTONG LUO"
);
check(
  "merchant cleaner preserves names without references",
  cleanMerchant("Zelle from Bimala Shrestha") === "Zelle from Bimala Shrestha"
);

// ── OFX import ──────────────────────────────────────────────
console.log("ofx import");
const ofxSgml = `OFXHEADER:100
DATA:OFXSGML
<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><ACCTID>000123456789</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260701120000[-5:EST]
<TRNAMT>-42.50
<FITID>202607011
<NAME>TRADER JOES 552
<MEMO>POS PURCHASE
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260702
<TRNAMT>1500.00
<FITID>202607022
<NAME>PAYROLL DIRECT DEP
</STMTTRN>
</BANKTRANLIST>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;
check("looksLikeOfx", looksLikeOfx(ofxSgml) && !looksLikeOfx(chaseCsv));
const ofxParsed = parseOfx(ofxSgml);
check("ofx rows parsed", ofxParsed.rows.length === 2, ofxParsed.errors);
check("ofx date parsed", ofxParsed.rows[0]?.date === "2026-07-01");
check("ofx signed amount", ofxParsed.rows[0]?.amount === -42.5);
check("ofx account suffix", ofxParsed.accountSuffix === "6789");
check("ofx statement kind", ofxParsed.statementKind === "bank");
const ofxTxs = importOfx(ofxSgml);
check("ofx txs built", ofxTxs.added.length === 2);
check(
  "ofx expense/income kinds",
  ofxTxs.added[0]?.kind === "expense" && ofxTxs.added[1]?.kind === "income"
);
check(
  "ofx FITID provenance",
  ofxTxs.added[0]?.externalId === "ofx:202607011"
);
const ofxAgain = importOfx(ofxSgml, {
  existingFingerprints: new Set(ofxTxs.added.map((t) => t.externalId || "")),
});
check("ofx re-import deduped", ofxAgain.added.length === 0 && ofxAgain.skipped === 2);
check("ofx categorized groceries", ofxTxs.added[0]?.category === "Groceries");

// ── mergeTxs dedupe ─────────────────────────────────────────
console.log("ledger merge");
const base = [
  newTx({ date: "2026-07-01", amount: 10, externalId: "x1" }),
];
const merged = mergeTxs(base, [
  newTx({ date: "2026-07-01", amount: 10, externalId: "x1" }),
  newTx({ date: "2026-07-02", amount: 20, externalId: "x2" }),
]);
check("merge skips known externalId", merged.added === 1 && merged.skipped === 1);
check("merge newest first", merged.txs[0]?.date === "2026-07-02");

// ── Transfer detection ──────────────────────────────────────
console.log("transfer detection");
const tOut = newTx({
  date: "2026-07-05",
  kind: "expense",
  amount: 500,
  merchant: "Online Transfer to Savings",
  category: "Uncategorized",
  accountId: "acc-checking",
});
const tIn = newTx({
  date: "2026-07-06",
  kind: "income",
  amount: 500,
  merchant: "Transfer from Checking",
  category: "Uncategorized",
  accountId: "acc-savings",
});
const noise = newTx({
  date: "2026-07-05",
  kind: "expense",
  amount: 6.75,
  merchant: "Starbucks",
  category: "Restaurants / coffee",
});
const pairs = detectTransferPairs([tOut, tIn, noise]);
check("finds the pair", pairs.length === 1, pairs);
check("high confidence with text hit", (pairs[0]?.confidence || 0) >= 0.8);
check("reason is plain English", /same amount/.test(pairs[0]?.reason || ""));

// small same-amount coincidence without transfer text must NOT match
const cOut = newTx({ date: "2026-07-10", kind: "expense", amount: 12, merchant: "Lunch A" });
const cIn = newTx({ date: "2026-07-10", kind: "income", amount: 12, merchant: "Refund B" });
check("conservative on small amounts", detectTransferPairs([cOut, cIn]).length === 0);

const applied = applyTransferPair([tOut, tIn, noise], pairs[0]);
check(
  "apply marks both sides Transfers",
  applied.filter((t) => t.category === "Transfers").length === 2
);
const ymT = "2026-07";
check(
  "true income excludes transfers",
  monthTrueIncome(applied, ymT) === 0
);
check(
  "true income excludes reimbursements/paybacks",
  monthTrueIncome(
    [
      newTx({
        date: "2026-07-12",
        kind: "income",
        amount: 40,
        category: "Reimbursements",
        merchant: "Zelle from friend paying me back",
      }),
    ],
    ymT
  ) === 0
);
check(
  "true spend excludes transfers, keeps coffee",
  monthTrueSpend(applied, ymT) === 6.75
);

// ── Accounting-grade postings and period review ──────────────────
const {
  buildJournal,
  buildLedger,
  buildStatements,
  buildAccountantReview,
  buildReconciliation,
  buildBudgetVariance,
  buildRunway,
  buildMonthlyClose,
  buildTransactionInbox,
} = await import("../src/melani/financeAccounting.ts");
{
  const accountingState = {
    version: 2 as const,
    accounts: [
      { id: "checking", name: "Checking", kind: "checking" as const, balance: -50 },
      { id: "savings", name: "Savings", kind: "savings" as const, balance: 500 },
      { id: "card", name: "Chase", kind: "credit" as const, balance: 100, creditLimit: 1000, apr: 24.99, dueDay: 10, statementCloseDay: 13 },
    ],
    txs: [
      newTx({ date: "2026-07-01", kind: "income", amount: 1000, category: "Income", merchant: "PAYROLL", accountId: "checking" }),
      newTx({ date: "2026-07-02", kind: "income", amount: 500, category: "Transfers", merchant: "From checking", accountId: "savings" }),
      newTx({ date: "2026-07-03", kind: "expense", amount: 500, category: "Transfers", merchant: "To savings", accountId: "checking" }),
      newTx({ date: "2026-07-04", kind: "expense", amount: 100, category: "Groceries", merchant: "Trader Joes", accountId: "card" }),
      newTx({ date: "2026-07-05", kind: "income", amount: 80, category: "Family", merchant: "Zelle from Bimala Shrestha", note: "family support", accountId: "checking", categoryReviewed: true }),
      newTx({ date: "2026-07-05", kind: "expense", amount: 25, category: "Repayment", merchant: "Zelle to Mom", accountId: "checking", categoryReviewed: true }),
      newTx({ date: "2026-07-06", kind: "expense", amount: 30, category: "Zelle", merchant: "Zelle to friend", accountId: "checking" }),
      newTx({ date: "2026-07-07", kind: "expense", amount: 12, category: "Other", merchant: "Unknown", accountId: null }),
    ],
    budget: [{ category: "Groceries", planned: 200 }],
    watchlist: [],
    goals: [],
    creditProfile: null,
  };
  const journal = buildJournal(accountingState);
  const cardPurchase = journal.entries.find((entry) => entry.memo === "Trader Joes");
  check(
    "accounting: card purchase credits card liability",
    cardPurchase?.debitCode === "5200" && cardPurchase?.creditCode === "2000",
    cardPurchase
  );
  const gift = journal.entries.find((entry) => entry.memo === "Zelle from Bimala Shrestha");
  const familyRepayment = journal.entries.find((entry) => entry.memo === "Zelle to Mom");
  const zelleOut = journal.entries.find((entry) => entry.memo === "Zelle to friend");
  check("accounting: family Zelle income posts to family support", gift?.creditCode === "4100", gift);
  check(
    "accounting: family repayment reduces a liability instead of posting expense",
    familyRepayment?.debitCode === "2200" &&
      familyRepayment.creditCode === "1000",
    familyRepayment
  );
  check(
    "accounting: unknown outbound Zelle is an expense awaiting purpose",
    zelleOut?.debitCode === "6999",
    zelleOut
  );
  const incomePurposeJournal = buildJournal({
    ...accountingState,
    txs: [
      newTx({
        date: "2026-07-08",
        kind: "income",
        amount: 100,
        category: "Gifts",
        merchant: "Zelle from Jasis Shrestha",
        accountId: "checking",
        categoryReviewed: true,
      }),
      newTx({
        date: "2026-07-09",
        kind: "income",
        amount: 55,
        category: "Reselling",
        merchant: "Zelle from Grace Rose",
        accountId: "checking",
        categoryReviewed: true,
      }),
    ],
  });
  const birthdayGift = incomePurposeJournal.entries.find(
    (entry) => entry.memo === "Zelle from Jasis Shrestha"
  );
  const resaleIncome = incomePurposeJournal.entries.find(
    (entry) => entry.memo === "Zelle from Grace Rose"
  );
  check(
    "accounting: birthday gift posts separately from earned income",
    birthdayGift?.creditCode === "4150",
    birthdayGift
  );
  check(
    "accounting: reselling income posts to resale revenue",
    resaleIncome?.creditCode === "4300",
    resaleIncome
  );

  const statements = buildStatements(accountingState, "2026-07");
  check(
    "accounting: P&L excludes account transfers",
    statements.pnl.income === 1080 &&
      statements.pnl.expenseTotal === 142 &&
      statements.pnl.transfersIn === 500 &&
      statements.pnl.transfersOut === 525,
    statements.pnl
  );
  check(
    "accounting: overdraft is a liability",
    statements.balanceSheet.totalAssets === 500 &&
      statements.balanceSheet.totalLiabilities === 150 &&
      statements.balanceSheet.equity === 350,
    statements.balanceSheet
  );

  const emptyBooks = {
    version: 1 as const,
    payables: [],
    receivables: [],
    receipts: [],
    closedMonths: [],
  };
  const review = buildAccountantReview(accountingState, "2026-07", emptyBooks);
  check(
    "accounting: review finds weak and unassigned lines",
    review.weakCategoryLines === 3 &&
      review.unassignedLines === 1 &&
      review.items.some((item) => item.id === "review-categories"),
    review
  );

  const cashEvidenceState = {
    ...accountingState,
    accounts: [
      { id: "checking", name: "Checking", kind: "checking" as const, balance: 900 },
      { id: "card", name: "Card", kind: "credit" as const, balance: 0 },
    ],
    txs: [
      newTx({ date: "2026-07-01", kind: "income", amount: 1000, category: "Income", merchant: "PAYROLL", accountId: "checking" }),
      newTx({ date: "2026-07-02", kind: "expense", amount: 100, category: "Groceries", merchant: "Grocery on card", accountId: "card" }),
      newTx({ date: "2026-07-05", kind: "expense", amount: 100, category: "Credit card payment", merchant: "Payment to card", accountId: "checking" }),
      newTx({ date: "2026-07-05", kind: "income", amount: 100, category: "Credit card payment", merchant: "Payment received", accountId: "card" }),
      newTx({ date: "2026-07-10", kind: "expense", amount: 999, category: "Groceries", merchant: "Pending hold", accountId: "checking", pending: true }),
    ],
  };
  const cashEvidenceStatements = buildStatements(
    cashEvidenceState,
    "2026-07",
    emptyBooks,
    new Date("2026-07-27T12:00:00Z")
  );
  check(
    "accounting: card purchase does not move cash; card payment moves cash once",
    cashEvidenceStatements.cashFlow.operatingIn === 1000 &&
      cashEvidenceStatements.cashFlow.operatingOut === 0 &&
      cashEvidenceStatements.cashFlow.transfersNet === -100 &&
      cashEvidenceStatements.cashFlow.netChange === 900,
    cashEvidenceStatements.cashFlow
  );
  check(
    "accounting: pending authorizations excluded from statements",
    cashEvidenceStatements.pnl.expenseTotal === 100 &&
      cashEvidenceStatements.cashFlow.netChange === 900,
    cashEvidenceStatements
  );
  const postedLedger = buildLedger(buildJournal(cashEvidenceState));
  check(
    "accounting: pending journal entry excluded from general ledger",
    postedLedger.lines.length === 8 &&
      !postedLedger.lines.some((line) => line.memo === "Pending hold"),
    postedLedger.lines
  );
  const oneSidedCardState = {
    ...accountingState,
    accounts: [
      {
        id: "checking",
        name: "Checking",
        kind: "checking" as const,
        balance: 0,
      },
      {
        id: "card",
        name: "Chase card",
        kind: "credit" as const,
        balance: 0,
      },
    ],
    txs: [
      newTx({
        date: "2026-07-12",
        kind: "expense",
        amount: 100,
        category: "Credit card payment",
        merchant: "Payment to Chase card",
        accountId: "checking",
      }),
    ],
  };
  const oneSidedCardJournal = buildJournal(oneSidedCardState).entries[0];
  check(
    "accounting: one-sided checking card payment reduces liability",
    oneSidedCardJournal?.debitCode === "2000" &&
      oneSidedCardJournal?.creditCode === "1000",
    oneSidedCardJournal
  );
  const oneSidedCardStatements = buildStatements(
    oneSidedCardState,
    "2026-07",
    emptyBooks
  );
  check(
    "accounting: card payment is cash movement, never expense",
    oneSidedCardStatements.pnl.expenseTotal === 0 &&
      oneSidedCardStatements.pnl.transfersOut === 100 &&
      oneSidedCardStatements.cashFlow.transfersNet === -100,
    oneSidedCardStatements
  );

  const statementEvidenceState = {
    ...accountingState,
    accounts: [
      {
        id: "checking",
        name: "Checking",
        kind: "checking" as const,
        balance: 90,
      },
    ],
    txs: [
      newTx({
        date: "2026-07-01",
        kind: "expense",
        amount: 30,
        category: "Groceries",
        merchant: "Market",
        accountId: "checking",
        statementBalance: 70,
        statementOrder: 1,
      }),
      newTx({
        date: "2026-07-02",
        kind: "income",
        amount: 20,
        category: "Income",
        merchant: "Deposit",
        accountId: "checking",
        statementBalance: 90,
        statementOrder: 2,
      }),
    ],
  };
  const statementRecon = buildReconciliation(statementEvidenceState)[0];
  check(
    "accounting: bank balance endpoints reconcile from opening to ending",
    statementRecon?.status === "reconciled" &&
      statementRecon.statementOpening === 100 &&
      statementRecon.statementEnding === 90 &&
      statementRecon.drift === 0,
    statementRecon
  );

  const unknownIncome = buildJournal({
    ...accountingState,
    txs: [
      newTx({ date: "2026-07-11", kind: "income", amount: 25, category: "Other", merchant: "Unknown deposit", accountId: "checking" }),
    ],
  }).entries[0];
  check(
    "accounting: unknown income credits income, never expense",
    unknownIncome?.creditCode === "4000",
    unknownIncome
  );

  const recon = buildReconciliation(cashEvidenceState);
  check(
    "accounting: tagged activity is unverified without statement endpoints",
    recon.every((account) =>
      account.txCount > 0
        ? account.status === "unverified" && account.drift === null
        : account.status === "no-activity" && account.drift === null
    ),
    recon
  );

  const pendingOnlyState = {
    ...accountingState,
    accounts: [],
    txs: [
      newTx({ date: "2026-08-02", kind: "expense", amount: 40, category: "Groceries", merchant: "Pending grocery", pending: true }),
    ],
  };
  const pendingVariance = buildBudgetVariance(pendingOnlyState, "2026-08");
  const pendingClose = buildMonthlyClose(
    pendingOnlyState,
    "2026-08",
    emptyBooks,
    pendingVariance,
    buildReconciliation(pendingOnlyState),
    buildTransactionInbox(pendingOnlyState)
  );
  check(
    "accounting: pending-only month has no posted evidence and cannot close",
    !pendingClose.readyToClose &&
      pendingClose.checks.find((item) => item.id === "has-txs")?.ok === false &&
      pendingClose.checks.find((item) => item.id === "pending")?.critical === true &&
      pendingClose.checks.find((item) => item.id === "pending")?.ok === false,
    pendingClose
  );

  const superficiallyHealthyState = {
    ...accountingState,
    accounts: [],
    txs: [
      newTx({ date: "2026-08-02", kind: "expense", amount: 40, category: "Groceries", merchant: "Posted grocery", source: "import" }),
    ],
    budget: [{ category: "Groceries", planned: 100 }],
  };
  const healthyVariance = buildBudgetVariance(
    superficiallyHealthyState,
    "2026-08"
  );
  const gatedClose = buildMonthlyClose(
    superficiallyHealthyState,
    "2026-08",
    emptyBooks,
    healthyVariance,
    buildReconciliation(superficiallyHealthyState),
    buildTransactionInbox(superficiallyHealthyState)
  );
  check(
    "accounting: failed critical check blocks close even when score is at least 80",
    gatedClose.score >= 80 &&
      !gatedClose.readyToClose &&
      gatedClose.checks.some((item) => item.critical && !item.ok),
    gatedClose
  );

  const historicalBooks = {
    ...emptyBooks,
    payables: [
      {
        id: "ap-historical",
        what: "Vendor bill",
        amount: 50,
        dueDate: "2025-12-20",
        paid: true,
        paidDate: "2026-01-15",
        createdAt: "2025-12-01T12:00:00Z",
      },
    ],
    receivables: [
      {
        id: "ar-historical",
        who: "Client",
        amount: 80,
        dueDate: "2025-12-20",
        received: false,
        createdAt: "2025-12-01T12:00:00Z",
      },
    ],
  };
  const historicalStatements = buildStatements(
    { ...accountingState, txs: [] },
    "2025-12",
    historicalBooks,
    new Date("2026-07-27T12:00:00Z")
  );
  check(
    "accounting: historical balance sheet does not reuse current bank balances",
    historicalStatements.balanceSheet.status === "historical-unavailable" &&
      !historicalStatements.balanceSheet.bankBalancesAvailable &&
      historicalStatements.balanceSheet.asOf === "2025-12-31" &&
      historicalStatements.balanceSheet.totalAssets === 80 &&
      historicalStatements.balanceSheet.totalLiabilities === 50,
    historicalStatements.balanceSheet
  );
  check(
    "accounting: historical balance sheet labels unavailable bank evidence",
    /unavailable.*period-end statement/i.test(
      historicalStatements.balanceSheet.note
    ),
    historicalStatements.balanceSheet.note
  );

  const annualBudget = buildBudgetVariance(
    {
      ...accountingState,
      txs: [
        newTx({ date: "2026-02-02", kind: "expense", amount: 50, category: "Groceries", merchant: "Grocer" }),
      ],
      budget: [{ category: "Groceries", planned: 200 }],
    },
    "2026"
  );
  check(
    "accounting: annual Books does not repeat the current monthly budget",
    annualBudget.periodKind === "year" &&
      !annualBudget.comparable &&
      annualBudget.plannedTotal === 0 &&
      annualBudget.actualTotal === 50,
    annualBudget
  );
  const annualClose = buildMonthlyClose(
    accountingState,
    "2026",
    emptyBooks,
    annualBudget,
    buildReconciliation(accountingState),
    buildTransactionInbox(accountingState)
  );
  check(
    "accounting: annual Books is reporting-only, not a fake monthly close",
    annualClose.periodKind === "year" && !annualClose.readyToClose,
    annualClose
  );

  const runway = buildRunway({
    ...accountingState,
    accounts: [
      { id: "checking", name: "Checking", kind: "checking" as const, balance: 300 },
    ],
    txs: [
      newTx({ date: "2026-07-01", kind: "income", amount: 100, category: "Income", merchant: "Real income" }),
      newTx({ date: "2026-07-02", kind: "income", amount: 1000, category: "Transfers", merchant: "Transfer from savings" }),
      newTx({ date: "2026-07-03", kind: "income", amount: 400, category: "Credit card payment", merchant: "Card payment credit" }),
      newTx({ date: "2026-07-03", kind: "income", amount: 60, category: "Reimbursements", merchant: "Zelle payback" }),
      newTx({ date: "2026-07-04", kind: "expense", amount: 500, category: "Transfers", merchant: "Transfer to savings" }),
      newTx({ date: "2026-07-05", kind: "expense", amount: 20, category: "Groceries", merchant: "Grocer" }),
      newTx({ date: "2026-07-06", kind: "expense", amount: 10, category: "Zelle", merchant: "Zelle to barber" }),
    ],
  });
  check(
    "accounting: runway excludes transfer/card-payment/reimbursement credits but counts external Zelle spend",
    runway.avgMonthlyIncome === 100 && runway.avgMonthlyBurn === 30,
    runway
  );

  // A user-approved Zelle pair must survive the normalize/load boundary.
  values.clear();
  values.set(
    "wonder-finance-v2",
    JSON.stringify({
      version: 2,
      accounts: accountingState.accounts,
      budget: accountingState.budget,
      watchlist: [],
      goals: [],
      creditProfile: null,
      txs: [
        {
          id: "approved-zelle-out",
          date: "2026-07-08",
          kind: "expense",
          amount: 200,
          category: "Transfers",
          categoryReviewed: true,
          merchant: "Zelle to savings",
          note: "Approved own-account pair",
          accountId: "checking",
          source: "import",
        },
        {
          id: "approved-zelle-in",
          date: "2026-07-08",
          kind: "income",
          amount: 200,
          category: "Transfers",
          categoryReviewed: true,
          merchant: "Zelle from checking",
          note: "Approved own-account pair",
          accountId: "savings",
          source: "import",
        },
      ],
    })
  );
  const reloadedTransfers = (
    await import("../src/melani/financeStore.ts")
  ).loadFinance();
  check(
    "accounting: approved Zelle transfer pair survives reload",
    reloadedTransfers.txs.length === 2 &&
      reloadedTransfers.txs.every((tx) => tx.category === "Transfers"),
    reloadedTransfers.txs
  );
  values.clear();
}

// ── Net worth timeline ──────────────────────────────────────
console.log("net worth timeline");
const today = new Date(2026, 6, 24); // 2026-07-24
const ends = monthEndDates(3, today);
check(
  "month-end dates oldest→today",
  ends.length === 3 && ends[0] === "2026-05-31" && ends[2] === "2026-07-24",
  ends
);

const item = newValuationItem({
  name: "Car",
  side: "asset",
  assetClass: "vehicle",
  points: [
    { date: "2026-05-15", value: 9000, source: "KBB", confidence: "medium" },
    { date: "2026-07-20", value: 8500, source: "KBB", confidence: "medium" },
  ],
});
const vMay = valuationAt(item, "2026-05-31");
check("valuation at May carried forward", vMay?.value === 9000 && vMay?.carriedForward === true);
const vApril = valuationAt(item, "2026-04-30");
check("no valuation before first point", vApril === null);
const vJul = valuationAt(item, "2026-07-20");
check("fresh point not carried forward", vJul?.carriedForward === false);

const accounts = [
  { id: "acc-checking", name: "Checking", kind: "checking" as const, balance: 1000 },
  { id: "acc-credit", name: "Card", kind: "credit" as const, balance: 400 },
];
const txs = [
  newTx({ date: "2026-07-10", kind: "income", amount: 300, category: "Income" }),
  newTx({ date: "2026-07-12", kind: "expense", amount: 100, category: "Food / groceries" }),
  // transfer must not distort history
  newTx({ date: "2026-07-13", kind: "expense", amount: 500, category: "Transfers" }),
];
const series = buildWorthSeries(
  accounts,
  txs,
  { version: 1, items: [item] },
  3,
  today
);
// bank now = 1000 - 400 = 600; June 30 bank = 600 - (300 - 100) = 400
const june = series[1];
const jul = series[2];
check("current total = bank + valuation", jul.total === 600 + 8500, jul);
check("june reconstructed bank net", june.bankNet === 400, june);
check("june valuation carried + labeled", june.valuationNet === 9000 && june.carriedForward.includes("Car"));
check("past labeled estimated, today observed", june.status === "estimated" && jul.status === "observed");

// ── Smart budget ($500/mo engine) ──────────────────────────────────
const { analyzeSpending, forecastSpending, suggestCuts } = await import(
  "../src/melani/smartBudget.ts"
);
{
  const mid = new Date(2026, 6, 15); // Jul 15, local time
  const btxs = [
    newTx({ date: "2026-07-03", kind: "expense", amount: 100, category: "Food / groceries" }),
    newTx({ date: "2026-07-10", kind: "expense", amount: 200, category: "Shopping" }),
    newTx({ date: "2026-07-12", kind: "expense", amount: 60, category: "Transfers" }), // excluded
    newTx({ date: "2026-07-01", kind: "income", amount: 900, category: "Income" }),
    newTx({ date: "2026-06-20", kind: "expense", amount: 80, category: "Food / groceries" }),
  ];
  const an = analyzeSpending(btxs, 500, mid);
  check("budget: transfers excluded from spend", an.totalSpent === 300, an);
  check("budget: percent of $500 limit", an.percentOfBudget === 60, an);
  const fc = forecastSpending(btxs, 500, mid);
  check("budget: daily burn = 300/15", fc.dailyBurn === 20, fc);
  check("budget: forecast = burn × 31 days", fc.forecastedTotal === 620 && fc.overBudget, fc);
  check(
    "budget: safe-to-spend today = 200/(16+1)",
    fc.safeToSpendToday === Math.round((200 / 17) * 100) / 100,
    fc
  );
  const cuts = suggestCuts(an.currentMonth, 120);
  check("budget: cuts avoid essentials first", cuts.length > 0 && cuts[0].category !== "Food / groceries", cuts);
}

// ── Credit tracking: inferred paydays + utilization ────────────────
const { inferCardPaydays, creditUtilization, recordCreditScore, latestScore } =
  await import("../src/melani/creditTracking.ts");
{
  const mid = new Date(2026, 6, 15);
  const ptxs = [
    newTx({ date: "2026-05-10", kind: "expense", amount: 50, category: "Credit card payment", merchant: "Payment to Chase card 5584" }),
    newTx({ date: "2026-06-10", kind: "expense", amount: 100, category: "Credit card payment", merchant: "Payment to Chase card 5584" }),
    newTx({ date: "2026-07-11", kind: "expense", amount: 24, category: "Credit card payment", merchant: "Payment to Chase card 5584" }),
    // one-off payee never repeats — must NOT create a pattern
    newTx({ date: "2026-07-02", kind: "expense", amount: 10, category: "Other", merchant: "Random store" }),
  ];
  const learned = inferCardPaydays(ptxs, mid);
  check("payday: one card learned", learned.length === 1, learned);
  check("payday: mode day = 10", learned[0]?.dayOfMonth === 10, learned);
  check(
    "payday: next expected Aug 10 (day 10 passed this month)",
    learned[0]?.nextExpected === "2026-08-10",
    learned
  );
  const util = creditUtilization([
    { id: "c1", name: "Chase", kind: "credit", balance: 450, creditLimit: 1000 },
    { id: "c2", name: "NoLimit", kind: "credit", balance: 100 },
    { id: "b1", name: "Checking", kind: "checking", balance: 500 },
  ]);
  check("utilization: only cards with limits", util.lines.length === 1, util);
  check("utilization: 45% and pay-to-30 = $150", util.lines[0].utilization === 0.45 && util.lines[0].payToThirty === 150, util);
  let cstate = { version: 1 as const, snapshots: [] };
  cstate = recordCreditScore(cstate, 677);
  check("credit: score recorded + clamped range ok", latestScore(cstate)?.score === 677);
  const again = recordCreditScore(cstate, 700);
  check("credit: same-day duplicate ignored", latestScore(again)?.score === 677);
}

// ── Annual books grid ──────────────────────────────────────────────
const { buildAnnualBook, annualBookCsv } = await import(
  "../src/melani/annualBooks.ts"
);
{
  const atxs = [
    newTx({ date: "2026-01-05", kind: "income", amount: 1000, category: "Income", merchant: "Paycheck" }),
    newTx({ date: "2026-02-05", kind: "income", amount: 1000, category: "Income", merchant: "Paycheck" }),
    newTx({ date: "2026-01-10", kind: "expense", amount: 300, category: "Rent / housing" }),
    newTx({ date: "2026-02-15", kind: "expense", amount: 200, category: "Food / groceries" }),
    newTx({ date: "2026-01-20", kind: "expense", amount: 150, category: "Transfers", merchant: "To savings" }),
    newTx({ date: "2026-02-20", kind: "expense", amount: 75, category: "Repayment", merchant: "Zelle to Dad" }),
    newTx({ date: "2025-12-31", kind: "expense", amount: 999, category: "Shopping" }), // wrong year
  ];
  const book = buildAnnualBook(atxs, 2026);
  check("annual: income total", book.income.annualTotal === 2000, book.income);
  check("annual: expense total excludes transfers, repayments + other years", book.expenses.annualTotal === 500, book.expenses);
  check("annual: transfers counted as savings", book.savings.annualTotal === 150, book.savings);
  check("annual: potential to save = 2000-500", book.potentialToSave === 1500, book);
  check("annual: monthly placement (Jan income)", book.income.monthlyTotals[0] === 1000, book.income.monthlyTotals);
  const csv = annualBookCsv(book);
  check("annual: CSV has header + net row", csv.includes("Jan") && csv.includes("Net (income − expenses)"));
}

// ── Bank-style tx types ────────────────────────────────────────────
const { txTypeOf } = await import("../src/melani/financeStore.ts");
{
  check(
    "txType: Zelle out",
    txTypeOf(newTx({ kind: "expense", merchant: "Zelle payment to Ziyu Gao" })) === "Zelle debit"
  );
  check(
    "txType: Zelle in",
    txTypeOf(newTx({ kind: "income", merchant: "Zelle payment from BIMALA" })) === "Zelle credit"
  );
  check(
    "txType: card payment",
    txTypeOf(newTx({ kind: "expense", merchant: "Payment to Chase card 5584" })) === "Card payment"
  );
  check(
    "txType: stored OFX type wins",
    txTypeOf({ ...newTx({ kind: "expense", merchant: "Zelle to Mom" }), txType: "POS" }) === "POS"
  );
  check(
    "txType: default purchase",
    txTypeOf(newTx({ kind: "expense", merchant: "TRADER JOES" })) === "Purchase"
  );
}


// ── Subscription detection ─────────────────────────────────────────
const { detectSubscriptions, mergeConfirmedSubscriptions } = await import(
  "../src/melani/subscriptions.ts"
);
{
  const confirmedAi = mergeConfirmedSubscriptions(
    detectSubscriptions([])
  );
  check(
    "subs: confirmed AI stack appears without repeated bank charges",
    confirmedAi.count === 4 &&
      confirmedAi.subs.every((subscription) => subscription.source === "confirmed"),
    confirmedAi
  );
  check(
    "subs: AI stack totals $360/mo and $4,320/yr",
    confirmedAi.monthlyTotal === 360 && confirmedAi.yearlyTotal === 4320,
    confirmedAi
  );

  const stxs = [
    // Netflix: 3 monthly charges → detected, monthly
    newTx({ date: "2026-04-15", kind: "expense", amount: 15.49, merchant: "NETFLIX.COM", category: "Entertainment" }),
    newTx({ date: "2026-05-15", kind: "expense", amount: 15.49, merchant: "NETFLIX.COM", category: "Entertainment" }),
    newTx({ date: "2026-06-15", kind: "expense", amount: 15.49, merchant: "NETFLIX.COM", category: "Entertainment" }),
    // Spotify: single charge → NOT a subscription (could be a one-off)
    newTx({ date: "2026-06-03", kind: "expense", amount: 11.99, merchant: "Spotify USA", category: "Entertainment" }),
    // Hulu: two identical monthly charges → real subscription
    newTx({ date: "2026-05-08", kind: "expense", amount: 17.99, merchant: "HULU", category: "Entertainment" }),
    newTx({ date: "2026-06-08", kind: "expense", amount: 17.99, merchant: "HULU", category: "Entertainment" }),
    // Grocery run: two irregular charges, not a brand → NOT a subscription
    newTx({ date: "2026-06-02", kind: "expense", amount: 54.2, merchant: "TRADER JOES", category: "Food" }),
    newTx({ date: "2026-06-19", kind: "expense", amount: 88.7, merchant: "TRADER JOES", category: "Food" }),
    // Yearly Amazon Prime
    newTx({ date: "2025-06-10", kind: "expense", amount: 139, merchant: "Amazon Prime", category: "Shopping" }),
    newTx({ date: "2026-06-10", kind: "expense", amount: 139, merchant: "Amazon Prime", category: "Shopping" }),
  ];
  const scan = detectSubscriptions(stxs);
  const netflix = scan.subs.find((s) => s.merchant === "Netflix");
  const spotify = scan.subs.find((s) => s.merchant === "Spotify");
  const hulu = scan.subs.find((s) => s.merchant === "Hulu");
  const prime = scan.subs.find((s) => s.merchant === "Amazon Prime");
  const groceries = scan.subs.find((s) => /trader/i.test(s.merchant));
  check("subs: netflix detected monthly", !!netflix && netflix.cadence === "monthly", netflix);
  check("subs: netflix amount = 15.49", !!netflix && netflix.amount === 15.49, netflix);
  check("subs: single known charge is NOT a subscription", !spotify, spotify);
  check("subs: two identical known charges ARE a subscription", !!hulu, hulu);
  check("subs: prime detected yearly", !!prime && prime.cadence === "yearly", prime);
  check("subs: prime monthly cost ≈ 11.58", !!prime && Math.abs(prime.monthlyCost - 139 / 12) < 0.05, prime);
  check("subs: irregular groceries excluded", !groceries, groceries);
  check("subs: monthly total is positive", scan.monthlyTotal > 0, scan.monthlyTotal);
  check("subs: sorted by monthly cost desc", scan.subs.every((s, i, a) => i === 0 || a[i - 1].monthlyCost >= s.monthlyCost));

  // ── False-positive guards: restaurants are NOT subscriptions ──
  const restaurantTxs = [
    // Cava — visited monthly-ish, VARYING amounts (real spend, not a plan)
    newTx({ date: "2026-04-08", kind: "expense", amount: 12.4, merchant: "CAVA USC VILLAGE", category: "Food / groceries" }),
    newTx({ date: "2026-05-11", kind: "expense", amount: 18.9, merchant: "CAVA USC VILLAGE", category: "Food / groceries" }),
    newTx({ date: "2026-06-02", kind: "expense", amount: 9.75, merchant: "CAVA USC VILLAGE", category: "Food / groceries" }),
    newTx({ date: "2026-06-24", kind: "expense", amount: 21.3, merchant: "CAVA USC VILLAGE", category: "Food / groceries" }),
    // Bruxie — same story
    newTx({ date: "2026-05-03", kind: "expense", amount: 14, merchant: "BRUXIE", category: "Dining" }),
    newTx({ date: "2026-06-09", kind: "expense", amount: 27.5, merchant: "BRUXIE", category: "Dining" }),
  ];
  const rScan = detectSubscriptions(restaurantTxs);
  check("subs: Cava restaurant NOT a subscription", !rScan.subs.some((s) => /cava/i.test(s.merchant)), rScan.subs);
  check("subs: Bruxie restaurant NOT a subscription", !rScan.subs.some((s) => /bruxie/i.test(s.merchant)), rScan.subs);
  check("subs: no false positives from restaurants", rScan.count === 0, rScan);

  // ── Real ones: Claude/Cursor + a same-day identical unknown charge ──
  const realTxs = [
    newTx({ date: "2026-04-17", kind: "expense", amount: 20, merchant: "CLAUDE.AI SUBSCRIPTION", category: "Software" }),
    newTx({ date: "2026-05-17", kind: "expense", amount: 20, merchant: "CLAUDE.AI SUBSCRIPTION", category: "Software" }),
    newTx({ date: "2026-06-17", kind: "expense", amount: 20, merchant: "CLAUDE.AI SUBSCRIPTION", category: "Software" }),
    newTx({ date: "2026-05-20", kind: "expense", amount: 20, merchant: "CURSOR AI POWERED IDE", category: "Software" }),
    newTx({ date: "2026-06-20", kind: "expense", amount: 20, merchant: "CURSOR AI POWERED IDE", category: "Software" }),
    // Unknown SaaS billed the same day, identical amount → real subscription
    newTx({ date: "2026-04-05", kind: "expense", amount: 9.99, merchant: "ACME CLOUD HOSTING", category: "Software" }),
    newTx({ date: "2026-05-05", kind: "expense", amount: 9.99, merchant: "ACME CLOUD HOSTING", category: "Software" }),
    newTx({ date: "2026-06-06", kind: "expense", amount: 9.99, merchant: "ACME CLOUD HOSTING", category: "Software" }),
  ];
  const realScan = detectSubscriptions(realTxs);
  check("subs: Claude detected", realScan.subs.some((s) => /claude/i.test(s.merchant)), realScan.subs);
  check("subs: Cursor detected", realScan.subs.some((s) => s.merchant === "Cursor"), realScan.subs);
  check("subs: identical same-day unknown detected", realScan.subs.some((s) => /acme/i.test(s.merchant)), realScan.subs);
  const realPlusConfirmed = mergeConfirmedSubscriptions(realScan);
  check(
    "subs: confirmed plans replace detected duplicates instead of double-counting",
    realPlusConfirmed.subs.filter((subscription) => subscription.key === "claude code")
      .length === 1 &&
      realPlusConfirmed.subs.filter((subscription) => subscription.key === "cursor")
        .length === 1,
    realPlusConfirmed.subs
  );

  const adversarialRecurring = [
    // Habitual same-month coffee is not a fixed contract.
    newTx({ date: "2026-07-01", kind: "expense", amount: 6.25, merchant: "STARBUCKS", category: "Restaurants" }),
    newTx({ date: "2026-07-08", kind: "expense", amount: 6.25, merchant: "STARBUCKS", category: "Restaurants" }),
    newTx({ date: "2026-07-15", kind: "expense", amount: 6.25, merchant: "STARBUCKS", category: "Restaurants" }),
    newTx({ date: "2026-07-22", kind: "expense", amount: 6.25, merchant: "STARBUCKS", category: "Restaurants" }),
    // A recurring grocery merchant with unstable baskets remains variable spend.
    newTx({ date: "2026-04-05", kind: "expense", amount: 42, merchant: "WHOLE FOODS", category: "Groceries" }),
    newTx({ date: "2026-05-05", kind: "expense", amount: 91, merchant: "WHOLE FOODS", category: "Groceries" }),
    newTx({ date: "2026-06-05", kind: "expense", amount: 28, merchant: "WHOLE FOODS", category: "Groceries" }),
    // Generic Apple billing can be one-off media/app purchases.
    newTx({ date: "2026-01-03", kind: "expense", amount: 2.99, merchant: "APPLE.COM/BILL", category: "Subscriptions" }),
    newTx({ date: "2026-02-17", kind: "expense", amount: 14.99, merchant: "APPLE.COM/BILL", category: "Subscriptions" }),
    newTx({ date: "2026-04-20", kind: "expense", amount: 7.99, merchant: "APPLE.COM/BILL", category: "Subscriptions" }),
    // A real weekly service keeps its weekly cadence and monthly normalization.
    newTx({ date: "2026-06-01", kind: "expense", amount: 5, merchant: "WEEKLY CLOUD MEMBERSHIP", category: "Subscriptions" }),
    newTx({ date: "2026-06-08", kind: "expense", amount: 5, merchant: "WEEKLY CLOUD MEMBERSHIP", category: "Subscriptions" }),
    newTx({ date: "2026-06-15", kind: "expense", amount: 5, merchant: "WEEKLY CLOUD MEMBERSHIP", category: "Subscriptions" }),
    newTx({ date: "2026-06-22", kind: "expense", amount: 5, merchant: "WEEKLY CLOUD MEMBERSHIP", category: "Subscriptions" }),
    // Pending authorizations are not recurring evidence.
    newTx({ date: "2026-07-15", kind: "expense", amount: 15.49, merchant: "NETFLIX.COM", category: "Subscriptions", pending: true }),
  ];
  const adversarialScan = detectSubscriptions(adversarialRecurring);
  check("subs: same-month Starbucks is variable spend", !adversarialScan.subs.some((s) => /starbucks/i.test(s.merchant)), adversarialScan.subs);
  check("subs: unstable groceries are not fixed cost", !adversarialScan.subs.some((s) => /whole foods/i.test(s.merchant)), adversarialScan.subs);
  check("subs: irregular generic Apple purchases excluded", !adversarialScan.subs.some((s) => s.merchant === "Apple"), adversarialScan.subs);
  const weeklyService = adversarialScan.subs.find((s) => /weekly cloud/i.test(s.merchant));
  check(
    "subs: weekly cadence and monthly cost are preserved",
    weeklyService?.cadence === "weekly" &&
      Math.abs((weeklyService?.monthlyCost || 0) - 21.73) < 0.01,
    weeklyService
  );
  check("subs: pending authorization is not evidence", !adversarialScan.subs.some((s) => s.merchant === "Netflix"), adversarialScan.subs);
}

// ── Finance copilot (grounded ledger queries) ──────────────────────
const { answerCopilot } = await import("../src/melani/financeCopilotEngine.ts");
const { detectSubscriptions: detectSubs2 } = await import("../src/melani/subscriptions.ts");
{
  const ctxTxs = [
    newTx({ date: "2026-06-04", kind: "expense", amount: 60, category: "Food / groceries", merchant: "TRADER JOES" }),
    newTx({ date: "2026-06-18", kind: "expense", amount: 40, category: "Food / groceries", merchant: "WHOLE FOODS" }),
    newTx({ date: "2026-06-10", kind: "expense", amount: 120, category: "Shopping", merchant: "AMAZON" }),
    newTx({ date: "2026-06-01", kind: "income", amount: 3000, category: "Income", merchant: "PAYROLL" }),
    newTx({ date: "2026-05-15", kind: "expense", amount: 15.49, category: "Entertainment", merchant: "NETFLIX.COM" }),
    newTx({ date: "2026-06-15", kind: "expense", amount: 15.49, category: "Entertainment", merchant: "NETFLIX.COM" }),
  ];
  const stubBrief = { dataQuality: { hasTxs: true } };
  const stubCredit = { utilization: 0.2, estimate: 700, band: "good", scoreSource: "official", tips: [], };
  const baseCtx = {
    state: { version: 2, accounts: [], txs: ctxTxs, budget: [], watchlist: [], goals: [], creditProfile: null },
    brief: stubBrief,
    subs: detectSubs2(ctxTxs),
    worth: 5000, cash: 6000, debt: 1000, income: 3000, expense: 235,
    cashFlow: 2765, rate: 0.5, credit: stubCredit, ym: "2026-06",
  };

  const foodA = answerCopilot("how much did I spend on food in June?", baseCtx as any);
  check("copilot: food total = $100", foodA.text.includes("$100"), foodA.text);
  check("copilot: cites groceries category", foodA.sources.some((s) => /grocer/i.test(s)), foodA.sources);

  const incA = answerCopilot("how much did I make in June?", baseCtx as any);
  check("copilot: income = $3,000", incA.text.includes("$3,000"), incA.text);

  const merA = answerCopilot("what's my biggest merchant?", baseCtx as any);
  check("copilot: top merchant AMAZON", /amazon/i.test(merA.text), merA.text);

  const subA = answerCopilot("what subscriptions am I paying for?", baseCtx as any);
  check("copilot: finds Netflix subscription", /netflix/i.test(subA.text) || subA.data?.some((d) => /netflix/i.test(d.label)), subA);

  const nwA = answerCopilot("what's my net worth?", baseCtx as any);
  check("copilot: net worth = $5,000", nwA.text.includes("$5,000"), nwA.text);
  const unverifiedCtx = { ...baseCtx, worthVerified: false };
  const unverifiedWorthA = answerCopilot(
    "what's my net worth?",
    unverifiedCtx as any
  );
  check(
    "copilot: unverified statements never claim net worth",
    /unverified/i.test(unverifiedWorthA.text) &&
      !unverifiedWorthA.text.includes("$5,000"),
    unverifiedWorthA.text
  );
  const unverifiedDebtA = answerCopilot(
    "what is my card balance?",
    unverifiedCtx as any
  );
  check(
    "copilot: missing card statement never claims zero debt",
    /unverified/i.test(unverifiedDebtA.text) &&
      !/\$0(?:\\.00)?\\b/.test(unverifiedDebtA.text),
    unverifiedDebtA.text
  );

  const merchA = answerCopilot("how much did I spend at Amazon?", baseCtx as any);
  check("copilot: merchant Amazon = $120", merchA.text.includes("$120") && /amazon/i.test(merchA.text), merchA.text);

  const bigA = answerCopilot("what was my biggest purchase?", baseCtx as any);
  check("copilot: biggest purchase = $120 Amazon", bigA.text.includes("$120"), bigA.text);

  const avgA = answerCopilot("what's my average monthly spend?", baseCtx as any);
  check("copilot: average monthly spend answered", /average/i.test(avgA.text) && /\$/.test(avgA.text), avgA.text);

  const hiA = answerCopilot("hi", baseCtx as any);
  check("copilot: greeting is short, not a report", hiA.text.length < 140 && !/deploy|reinvest/i.test(hiA.text), hiA.text);

  const pieA = answerCopilot("pie chart of spend by category", baseCtx as any);
  check("copilot: builds a pie chart", pieA.chart?.kind === "pie" && (pieA.chart?.slices?.length || 0) > 0, pieA.chart);

  const lineA = answerCopilot("chart my spending by month", baseCtx as any);
  check("copilot: builds a line chart", lineA.chart?.kind === "line" && (lineA.chart?.points?.length || 0) > 0, lineA.chart);

  const prevA = answerCopilot("where did my money go?", baseCtx as any);
  const whichA = answerCopilot("which one", baseCtx as any, { question: "where did my money go?", answer: prevA } as any);
  const topLabel = prevA.data?.[0]?.label || "";
  check("copilot: follow-up 'which one' uses last answer", !!topLabel && whichA.text.includes(topLabel), { whichA: whichA.text, topLabel });

  const emptyCtx = { ...baseCtx, state: { ...baseCtx.state, txs: [] } };
  const emptyA = answerCopilot("how much did I spend?", emptyCtx as any);
  check("copilot: empty ledger asks for import", /import/i.test(emptyA.text), emptyA.text);
}

// ── Built-in SQL engine ────────────────────────────────────────────
const { runSql } = await import("../src/melani/financeSql.ts");
{
  const sqlTxs = [
    newTx({ date: "2026-06-04", kind: "expense", amount: 60, category: "Food", merchant: "TRADER JOES" }),
    newTx({ date: "2026-06-18", kind: "expense", amount: 40, category: "Food", merchant: "WHOLE FOODS" }),
    newTx({ date: "2026-06-10", kind: "expense", amount: 120, category: "Shopping", merchant: "AMAZON" }),
    newTx({ date: "2026-05-10", kind: "expense", amount: 200, category: "Shopping", merchant: "AMAZON" }),
    newTx({ date: "2026-06-01", kind: "income", amount: 3000, category: "Income", merchant: "PAYROLL" }),
  ];
  const r1 = runSql("SELECT SUM(amount) FROM transactions WHERE kind = 'expense'", sqlTxs);
  check("sql: total expense = 420", r1.rows[0]?.[0] === 420, r1);

  const r2 = runSql("SELECT category, SUM(amount) FROM transactions WHERE kind = 'expense' GROUP BY category ORDER BY SUM(amount) DESC", sqlTxs);
  check("sql: group by category top = Clothing 320", r2.rows[0]?.[0] === "Clothing" && r2.rows[0]?.[1] === 320, r2);

  const r3 = runSql("SELECT date, merchant, amount FROM transactions WHERE kind = 'expense' AND amount > 100 ORDER BY amount DESC", sqlTxs);
  check("sql: filter expense amount>100 returns 2", r3.rowCount === 2 && r3.rows[0]?.[2] === 200, r3);

  const r4 = runSql("SELECT merchant FROM transactions WHERE merchant LIKE '%amazon%'", sqlTxs);
  check("sql: LIKE amazon returns 2", r4.rowCount === 2, r4);

  const r5 = runSql("SELECT COUNT(*) FROM transactions WHERE month = '2026-06'", sqlTxs);
  check("sql: count June = 4", r5.rows[0]?.[0] === 4, r5);

  const r6 = runSql("DELETE FROM transactions", sqlTxs);
  check("sql: rejects non-SELECT", !!r6.error, r6);

  const r7 = runSql("SELECT * FROM transactions LIMIT 2", sqlTxs);
  check("sql: select star + limit", r7.rowCount === 2 && r7.columns.includes("merchant"), r7);
}

// ── Guard: the ledger only ever holds the user's real imported data ─
// This must stay true for every finance feature added in the future.
{
  const store = await import("../src/melani/financeStore.ts");
  // 1. There is no demo/seed transaction generator anywhere.
  check("no-fake: demoSeedTxs export is gone", !("demoSeedTxs" in store), Object.keys(store).filter((k) => /demo|seed|sample|mock/i.test(k)));

  // 2. Loading a ledger that somehow contains manual/demo rows drops them —
  //    only real imports (source import/csv/plaid) survive.
  values.clear();
  values.set(
    "wonder-finance-v2",
    JSON.stringify({
      version: 2,
      accounts: [],
      budget: [],
      watchlist: [],
      goals: [],
      creditProfile: null,
      txs: [
        { id: "fake-1", date: "2026-06-01", kind: "expense", amount: 1850, category: "Rent / housing", note: "Rent", merchant: "Rent", source: "manual" },
        { id: "import-1", date: "2026-06-02", kind: "expense", amount: 20, category: "Food", note: "TJ", merchant: "TJ", source: "import" },
      ],
    })
  );
  const loaded = store.loadFinance();
  check("no-fake: manual/demo rows are purged on load", loaded.txs.length === 1 && loaded.txs[0].source === "import", loaded.txs);
  check("no-fake: no Rent/housing survives", !loaded.txs.some((t) => t.category === "Rent / housing"), loaded.txs);
  values.clear();
}

console.log("");
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

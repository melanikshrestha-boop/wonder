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
const { mergeTxs, newTx } = await import("../src/melani/financeStore.ts");
const {
  detectTransferPairs,
  applyTransferPair,
  monthTrueIncome,
  monthTrueSpend,
} = await import("../src/melani/financeTransfers.ts");
const { buildWorthSeries, valuationAt, monthEndDates, newValuationItem } =
  await import("../src/melani/financeNetWorth.ts");

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
check("income categorized", csvRes.added.some((t) => t.category === "Income"));

const dup = parseBankCsv(chaseCsv, {
  existingFingerprints: new Set(
    csvRes.added.map((t) => t.externalId || "")
  ),
});
check("re-import fully deduped", dup.added.length === 0 && dup.skipped === 2, dup);

const fpA = txFingerprint({ date: "2026-07-01", amount: -5, merchant: "A  B" });
const fpB = txFingerprint({ date: "2026-07-01", amount: -5, merchant: "a b" });
check("fingerprint normalizes whitespace/case", fpA === fpB);

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
check("ofx categorized groceries", ofxTxs.added[0]?.category === "Food / groceries");

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
  "true spend excludes transfers, keeps coffee",
  monthTrueSpend(applied, ymT) === 6.75
);

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
    newTx({ date: "2025-12-31", kind: "expense", amount: 999, category: "Shopping" }), // wrong year
  ];
  const book = buildAnnualBook(atxs, 2026);
  check("annual: income total", book.income.annualTotal === 2000, book.income);
  check("annual: expense total excludes transfers + other years", book.expenses.annualTotal === 500, book.expenses);
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
const { detectSubscriptions } = await import("../src/melani/subscriptions.ts");
{
  const stxs = [
    // Netflix: 3 monthly charges → detected, monthly
    newTx({ date: "2026-04-15", kind: "expense", amount: 15.49, merchant: "NETFLIX.COM", category: "Entertainment" }),
    newTx({ date: "2026-05-15", kind: "expense", amount: 15.49, merchant: "NETFLIX.COM", category: "Entertainment" }),
    newTx({ date: "2026-06-15", kind: "expense", amount: 15.49, merchant: "NETFLIX.COM", category: "Entertainment" }),
    // Spotify: single known charge → detected as monthly
    newTx({ date: "2026-06-03", kind: "expense", amount: 11.99, merchant: "Spotify USA", category: "Entertainment" }),
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
  const prime = scan.subs.find((s) => s.merchant === "Amazon Prime");
  const groceries = scan.subs.find((s) => /trader/i.test(s.merchant));
  check("subs: netflix detected monthly", !!netflix && netflix.cadence === "monthly", netflix);
  check("subs: netflix amount = 15.49", !!netflix && netflix.amount === 15.49, netflix);
  check("subs: spotify single known charge detected", !!spotify, spotify);
  check("subs: prime detected yearly", !!prime && prime.cadence === "yearly", prime);
  check("subs: prime monthly cost ≈ 11.58", !!prime && Math.abs(prime.monthlyCost - 139 / 12) < 0.05, prime);
  check("subs: irregular groceries excluded", !groceries, groceries);
  check("subs: monthly total is positive", scan.monthlyTotal > 0, scan.monthlyTotal);
  check("subs: sorted by monthly cost desc", scan.subs.every((s, i, a) => i === 0 || a[i - 1].monthlyCost >= s.monthlyCost));
}

// ── Finance copilot (grounded ledger queries) ──────────────────────
const { answerCopilot } = await import("../src/melani/financeCopilot.ts");
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
  check("copilot: cites Food category", foodA.sources.some((s) => /Food/i.test(s)), foodA.sources);

  const incA = answerCopilot("how much did I make in June?", baseCtx as any);
  check("copilot: income = $3,000", incA.text.includes("$3,000"), incA.text);

  const merA = answerCopilot("what's my biggest merchant?", baseCtx as any);
  check("copilot: top merchant AMAZON", /amazon/i.test(merA.text), merA.text);

  const subA = answerCopilot("what subscriptions am I paying for?", baseCtx as any);
  check("copilot: finds Netflix subscription", /netflix/i.test(subA.text) || subA.data?.some((d) => /netflix/i.test(d.label)), subA);

  const nwA = answerCopilot("what's my net worth?", baseCtx as any);
  check("copilot: net worth = $5,000", nwA.text.includes("$5,000"), nwA.text);

  const emptyCtx = { ...baseCtx, state: { ...baseCtx.state, txs: [] } };
  const emptyA = answerCopilot("how much did I spend?", emptyCtx as any);
  check("copilot: empty ledger asks for import", /import/i.test(emptyA.text), emptyA.text);
}

console.log("");
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

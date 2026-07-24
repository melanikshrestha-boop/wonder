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

console.log("");
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

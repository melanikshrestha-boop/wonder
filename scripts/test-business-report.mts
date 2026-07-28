import {
  buildBusinessQuarterReport,
  businessQuarterReportCsv,
  type BusinessQuarterKey,
} from "../src/melani/financeBusinessReport.ts";
import type {
  FinanceAccount,
  FinanceState,
  FinanceTx,
} from "../src/melani/financeStore.ts";

let passed = 0;
let failed = 0;

function assert(name: string, condition: unknown) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
    return;
  }
  failed += 1;
  console.error(`  ✗ ${name}`);
}

function closeTo(actual: number, expected: number, tolerance = 0.001) {
  return Math.abs(actual - expected) <= tolerance;
}

const accounts: FinanceAccount[] = [
  {
    id: "checking",
    name: "Checking",
    kind: "checking",
    balance: 500,
  },
  {
    id: "savings",
    name: "Savings",
    kind: "savings",
    balance: 1_000,
  },
  {
    id: "card",
    name: "Card",
    kind: "credit",
    balance: 100,
  },
  {
    id: "invest",
    name: "Fidelity brokerage",
    kind: "invest",
    balance: 2_000,
  },
];

function tx(
  id: string,
  date: string,
  kind: "income" | "expense",
  amount: number,
  category: string,
  note: string,
  accountId = "checking",
  pending = false,
): FinanceTx {
  return {
    id,
    date,
    kind,
    amount,
    category,
    note,
    merchant: note,
    accountId,
    pending,
    source: "import",
  };
}

function state(txs: FinanceTx[]): FinanceState {
  return {
    version: 2,
    accounts,
    txs,
    budget: [],
    watchlist: [],
    goals: [],
    creditProfile: null,
  };
}

function report(
  txs: FinanceTx[],
  quarter: BusinessQuarterKey,
  asOf: string,
) {
  return buildBusinessQuarterReport(
    state(txs),
    quarter,
    {
      version: 1,
      payables: [],
      receivables: [],
      receipts: [],
      closedMonths: [],
    },
    new Date(`${asOf}T12:00:00`),
  );
}

console.log("Quarterly operating report");

{
  const txs = [
    tx(
      "purchase",
      "2026-02-10",
      "expense",
      100,
      "Business",
      "Software purchase",
      "card",
    ),
    tx(
      "payment",
      "2026-04-10",
      "expense",
      100,
      "Credit card payment",
      "Card payment",
      "checking",
    ),
  ];
  const q1 = report(txs, "2026-Q1", "2026-03-31");
  const q2 = report(txs, "2026-Q2", "2026-06-30");
  assert("card purchase is a Q1 operating expense", q1.metrics.operatingExpenses === 100);
  assert("Q2 card settlement is not a second expense", q2.metrics.operatingExpenses === 0);
  assert("card settlement remains an open classification", q2.integrity.openClassificationCount === 1);
}

{
  const txs = [
    tx(
      "transfer-out",
      "2026-01-10",
      "expense",
      500,
      "Transfers",
      "Transfer to savings",
      "checking",
    ),
    tx(
      "transfer-in",
      "2026-01-10",
      "income",
      500,
      "Transfers",
      "Transfer from checking",
      "savings",
    ),
  ];
  const q1 = report(txs, "2026-Q1", "2026-03-31");
  assert("checking-to-savings transfer is not revenue", q1.metrics.revenue === 0);
  assert("checking-to-savings transfer is not expense", q1.metrics.operatingExpenses === 0);
  assert("checking-to-savings transfer vanishes from consolidated cash flow", q1.cashFlow.netChange === 0);
}

{
  const q1 = report(
    [
      tx(
        "brokerage",
        "2026-02-01",
        "expense",
        300,
        "Transfers",
        "Transfer to Fidelity brokerage",
      ),
    ],
    "2026-Q1",
    "2026-03-31",
  );
  assert("brokerage contribution has no P&L effect", q1.metrics.operatingExpenses === 0);
  assert("brokerage contribution is investing cash outflow", q1.cashFlow.investing === -300);
}

{
  const q1 = report(
    [
      tx("loan", "2026-01-03", "income", 1_000, "Other", "Loan proceeds"),
      tx("principal", "2026-02-03", "expense", 100, "Other", "Loan principal payment"),
      tx("interest", "2026-02-03", "expense", 10, "Fees", "Loan interest"),
    ],
    "2026-Q1",
    "2026-03-31",
  );
  assert("loan proceeds are not operating income", q1.metrics.revenue === 0);
  assert("loan principal is not operating expense", q1.metrics.operatingExpenses === 10);
  assert("loan financing nets to +$900", q1.cashFlow.financing === 900);
  assert("loan interest is operating cash outflow", q1.cashFlow.operating === -10);
}

{
  const q1 = report(
    [
      tx(
        "pending",
        "2026-03-20",
        "expense",
        200,
        "Business",
        "Pending equipment",
        "checking",
        true,
      ),
    ],
    "2026-Q1",
    "2026-03-31",
  );
  assert("pending purchase is excluded from actual expenses", q1.metrics.operatingExpenses === 0);
  assert("pending activity blocks report integrity", q1.integrity.status === "blocked");
  assert("pending count is disclosed", q1.integrity.pendingTransactionCount === 1);
  assert("pending row remains in the supporting ledger", q1.supportingTransactionIds.includes("pending"));
}

{
  const q1 = report(
    [
      tx(
        "gift",
        "2026-01-05",
        "income",
        600,
        "Gifts",
        "Gift from family",
      ),
      tx(
        "payroll",
        "2026-01-15",
        "income",
        900,
        "Income",
        "Employer payroll direct deposit",
      ),
    ],
    "2026-Q1",
    "2026-03-31",
  );
  assert("family gift is excluded from operating income", q1.metrics.revenue === 900);
  assert("gift remains visible as an open classification", q1.integrity.openClassificationCount === 1);
}

{
  const qtd = report(
    [
      tx(
        "prior-qtd",
        "2026-04-20",
        "income",
        100,
        "Income",
        "Client payment",
      ),
      tx(
        "prior-late",
        "2026-06-01",
        "income",
        900,
        "Income",
        "Client payment",
      ),
      tx(
        "current-qtd",
        "2026-07-20",
        "income",
        120,
        "Income",
        "Client payment",
      ),
    ],
    "2026-Q3",
    "2026-07-27",
  );
  assert("partial quarter is labeled QTD", qtd.quarter.isPartial && qtd.quarter.comparisonBasis === "matched-qtd");
  assert("QTD compares only equal elapsed days", closeTo(qtd.metrics.revenueGrowthPct || 0, 20));
  assert("full June revenue is not in the prior QTD baseline", qtd.metrics.priorRevenue === 100);
  assert("unclosed QTD comparison is explicitly preliminary", qtd.quarter.comparisonStatus === "preliminary" && qtd.quarter.comparisonLabel.includes("preliminary"));
  assert("partial quarter cannot be final", qtd.integrity.status !== "ready");
}

{
  const q1 = report(
    [
      tx(
        "current-only",
        "2026-01-20",
        "income",
        120,
        "Income",
        "Client payment",
      ),
    ],
    "2026-Q1",
    "2026-03-31",
  );
  assert("zero prior income makes growth unavailable", q1.metrics.revenueGrowthPct === null);
}

{
  const q1 = report(
    [
      tx("food", "2026-01-02", "expense", 60, "Groceries", "Market"),
      tx("software", "2026-01-04", "expense", 40, "Business", "Software"),
      tx("move", "2026-01-05", "expense", 500, "Transfers", "Transfer to savings"),
    ],
    "2026-Q1",
    "2026-03-31",
  );
  const amount = q1.expenseBreakdown.reduce((sum, row) => sum + row.amount, 0);
  const percent = q1.expenseBreakdown.reduce((sum, row) => sum + row.percent, 0);
  assert("expense slices equal operating spend", amount === q1.metrics.operatingExpenses);
  assert("expense slice percentages total 100", closeTo(percent, 100));
  assert("transfers are absent from expense mix", q1.expenseBreakdown.every((row) => row.label !== "Transfers"));
}

{
  const q1 = report(
    [tx("zelle", "2026-01-06", "income", 300, "Zelle", "Zelle from Alex")],
    "2026-Q1",
    "2026-03-31",
  );
  assert("unknown Zelle inflow is not called revenue", q1.metrics.revenue === 0);
  assert("unknown Zelle inflow blocks the report", q1.integrity.status === "blocked");
}

{
  const q1 = report(
    [
      tx(
        "unknown-income",
        "2026-01-07",
        "income",
        400,
        "Income",
        "ACH credit from unknown origin",
      ),
    ],
    "2026-Q1",
    "2026-03-31",
  );
  assert("generic Income category alone is not called revenue", q1.metrics.revenue === 0);
  assert("unknown generic inflow remains in classification work", q1.integrity.openClassificationCount === 1);
}

{
  const q1 = report(
    [
      tx(
        "brokerage-out",
        "2026-02-01",
        "expense",
        300,
        "Transfers",
        "Transfer to Fidelity brokerage",
        "checking",
      ),
      tx(
        "brokerage-in",
        "2026-02-01",
        "income",
        300,
        "Transfers",
        "Transfer from checking",
        "invest",
      ),
    ],
    "2026-Q1",
    "2026-03-31",
  );
  assert("paired brokerage import uses only the cash leg", q1.cashFlow.investing === -300);
  assert("paired brokerage import has no operating effect", q1.metrics.revenue === 0 && q1.metrics.operatingExpenses === 0);
}

{
  const q1 = report(
    [
      tx(
        "card-crypto",
        "2026-02-03",
        "expense",
        200,
        "Investments",
        "Coinbase crypto purchase",
        "card",
      ),
    ],
    "2026-Q1",
    "2026-03-31",
  );
  assert("credit-funded investment is not reported as cash flow", q1.cashFlow.investing === 0);
}

{
  const q1 = report(
    [
      tx(
        "unknown-expense",
        "2026-01-08",
        "expense",
        100,
        "Other",
        "Mystery vendor debit",
      ),
    ],
    "2026-Q1",
    "2026-03-31",
  );
  assert("unknown Other expense is excluded from operating spend", q1.metrics.operatingExpenses === 0);
  assert("unknown Other expense remains a blocking classification", q1.integrity.openClassificationCount === 1 && q1.integrity.status === "blocked");
}

{
  const q1 = report(
    [
      tx("duplicate-a", "2026-01-09", "expense", 50, "Business", "Software license"),
      tx("duplicate-b", "2026-01-09", "expense", 50, "Business", "Software license"),
    ],
    "2026-Q1",
    "2026-03-31",
  );
  assert("possible duplicate remains in KPIs until reviewed", q1.metrics.operatingExpenses === 100);
  assert("duplicate import is disclosed and blocks final", q1.integrity.duplicateTransactionCount === 1 && q1.integrity.status === "blocked");
  assert("both duplicate rows remain inspectable in supporting ledger", q1.supportingTransactionIds.includes("duplicate-a") && q1.supportingTransactionIds.includes("duplicate-b"));
}

{
  const first = tx(
    "external-duplicate-a",
    "2026-01-10",
    "expense",
    75,
    "Business",
    "Hosting invoice",
  );
  const second = {
    ...tx(
      "external-duplicate-b",
      "2026-01-10",
      "expense",
      75,
      "Business",
      "Hosting invoice",
    ),
    externalId: "bank-fitid-123",
  };
  first.externalId = "bank-fitid-123";
  const q1 = report([first, second], "2026-Q1", "2026-03-31");
  assert("account-scoped external-ID duplicate is collapsed", q1.metrics.operatingExpenses === 75);
  assert("external-ID duplicate remains disclosed", q1.integrity.duplicateTransactionCount === 1);
}

{
  const q1 = report(
    [
      tx(
        "unmatched-transfer",
        "2026-01-10",
        "expense",
        250,
        "Transfers",
        "Online transfer",
      ),
    ],
    "2026-Q1",
    "2026-03-31",
  );
  assert("unmatched transfer remains unclassified", q1.integrity.openClassificationCount === 1);
  assert("unmatched cash transfer remains in cash movement", q1.cashFlow.unclassified === -250 && q1.cashFlow.netChange === -250);
}

{
  const q1 = report(
    [
      tx(
        "impossible-date",
        "2026-02-31",
        "expense",
        80,
        "Business",
        "Impossible calendar date",
      ),
    ],
    "2026-Q1",
    "2026-03-31",
  );
  assert("impossible calendar date is excluded from KPIs", q1.metrics.operatingExpenses === 0);
  assert("impossible calendar date is a global ledger exception", q1.integrity.incompleteTransactionCount === 1 && q1.integrity.status === "blocked");
  assert("invalid-date row remains inspectable", q1.supportingTransactionIds.includes("impossible-date"));
}

{
  const q1 = report(
    [
      tx(
        "missing-account",
        "2026-01-11",
        "income",
        500,
        "Income",
        "Client payment",
        "missing-account-id",
      ),
    ],
    "2026-Q1",
    "2026-03-31",
  );
  assert("unassigned activity is not assumed to be cash", q1.cashFlow.operating === 0);
  assert("invalid account assignment blocks final", q1.integrity.unassignedAccountCount === 1 && q1.integrity.status === "blocked");
}

{
  const q1 = report(
    [
      tx(
        "incomplete",
        "2026-01-12",
        "expense",
        25,
        "Business",
        "",
      ),
    ],
    "2026-Q1",
    "2026-03-31",
  );
  assert("incomplete row is excluded from KPIs", q1.metrics.operatingExpenses === 0);
  assert("incomplete row is disclosed and blocks final", q1.integrity.incompleteTransactionCount === 1 && q1.integrity.status === "blocked");
}

{
  const q1 = report(
    [
      tx(
        "refund",
        "2026-01-13",
        "income",
        30,
        "Other",
        "Merchant refund",
      ),
    ],
    "2026-Q1",
    "2026-03-31",
  );
  assert("unlinked refund is neither revenue nor automatic expense reduction", q1.metrics.revenue === 0 && q1.metrics.operatingExpenses === 0);
  assert("unlinked refund remains open for reviewed matching", q1.integrity.openClassificationCount === 1);
}

{
  const emptyClosed = buildBusinessQuarterReport(
    state([]),
    "2026-Q1",
    {
      version: 1,
      payables: [],
      receivables: [],
      receipts: [],
      closedMonths: ["2026-01", "2026-02", "2026-03"],
    },
    new Date("2026-03-31T12:00:00"),
  );
  assert("closed empty quarter is never called Final", emptyClosed.integrity.status === "blocked" && !emptyClosed.integrity.label.startsWith("Final"));
  assert("closed empty quarter discloses missing evidence", emptyClosed.integrity.warnings.some((warning) => warning.includes("No complete posted transaction evidence")));
}

{
  const q1 = report(
    [
      tx(
        "income",
        "2026-01-20",
        "income",
        1_000,
        "Income",
        "Client payment",
      ),
      tx("expense", "2026-01-21", "expense", 250, "Business", "Software"),
    ],
    "2026-Q1",
    "2026-03-31",
  );
  const csv = businessQuarterReportCsv(q1);
  assert("CSV names the operating report", csv.includes("Quarterly operating review"));
  assert("CSV includes operating margin and controls", csv.includes("Operating margin %") && csv.includes("Control warnings"));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);

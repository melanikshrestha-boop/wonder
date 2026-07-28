import assert from "node:assert/strict";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  clear() {
    this.values.clear();
  }
}

Object.defineProperty(globalThis, "localStorage", {
  value: new MemoryStorage(),
  configurable: true,
});

const {
  EXPENSE_CATEGORIES,
  FINANCE_CATEGORIES,
  INCOME_CATEGORIES,
  categoriesForKind,
  normalizeImportedTransactionCategory,
  normalizeTransactionCategory,
} = await import(
  "../src/melani/financeCategorize.ts"
);
const { parseBankCsv } = await import("../src/melani/financeCsv.ts");
const { CHASE_STATEMENT_ACCOUNTS, CHASE_STATEMENT_TXS } = await import(
  "../src/melani/chaseStatementData.ts"
);
const { applyChaseStatements } = await import(
  "../src/melani/chaseStatementImport.ts"
);
const { loadFinance } = await import("../src/melani/financeStore.ts");
const { buildReconciliation } = await import(
  "../src/melani/financeAccounting.ts"
);
const { runFinancePlan } = await import("../src/melani/melFinanceTools.ts");
const { buildBookPageBrief } = await import(
  "../src/melani/bookPageBrief.ts"
);
const { loadBooks } = await import("../src/melani/booksStore.ts");
const { pieSlicePath } = await import("../src/melani/pieGeometry.ts");

assert.equal(
  normalizeTransactionCategory("Zelle", "Zelle from Bimala Shrestha", "income"),
  "Family"
);
assert.equal(
  normalizeTransactionCategory("Zelle", "Zelle from Millennium", "income"),
  "Family"
);
assert.equal(
  normalizeTransactionCategory("Parents", "Legacy saved transaction", "income"),
  "Family"
);
assert.equal(
  normalizeTransactionCategory("Zelle", "Zelle to Bimala Shrestha", "expense"),
  "Uncategorized"
);
assert.equal(
  normalizeImportedTransactionCategory(
    "Transfers",
    "Zelle to Sean Filimon",
    "expense"
  ),
  "Travel"
);
assert.equal(
  normalizeImportedTransactionCategory(
    "Transfers",
    "Zelle to Ricky (Coding Guy)",
    "expense"
  ),
  "Restaurants"
);
for (const payee of [
  "Zelle to Ronni Wieman",
  "Zelle to Sam Peterson",
  "Zelle to Ani",
  "Zelle to Ella Will",
]) {
  assert.equal(
    normalizeImportedTransactionCategory("Transfers", payee, "expense"),
    "Groceries"
  );
}
for (const payee of [
  "Zelle to Sofia USC",
  "Zelle to Zeba",
  "Zelle to Ziyu Gao",
]) {
  assert.equal(
    normalizeImportedTransactionCategory("Transfers", payee, "expense"),
    "Restaurants"
  );
}
assert.equal(
  normalizeImportedTransactionCategory(
    "Income",
    "Zelle from Audrey Davis",
    "income"
  ),
  "Photography"
);
assert.equal(
  normalizeImportedTransactionCategory(
    "Income",
    "Zelle from Cedric Hong",
    "income"
  ),
  "Experiences"
);
assert.equal(
  normalizeImportedTransactionCategory(
    "Income",
    "Zelle from Jasis Shrestha",
    "income"
  ),
  "Gifts"
);
assert.equal(
  normalizeImportedTransactionCategory(
    "Income",
    "Zelle from Grace Rose Wfct0Z94G69C",
    "income"
  ),
  "Reselling"
);
assert.equal(
  normalizeImportedTransactionCategory(
    "Income",
    "Zelle from Madison Aikins Nav0Jhdzhkdf",
    "income"
  ),
  "Uncategorized",
  "Madison remains unclassified until the owner supplies a purpose"
);
assert.equal(
  normalizeImportedTransactionCategory(
    "Transfers",
    "Zelle to Unknown Friend",
    "expense"
  ),
  "Uncategorized"
);
assert.equal(
  normalizeTransactionCategory(
    "Groceries",
    "Zelle to Sean Filimon",
    "expense"
  ),
  "Groceries",
  "manual purpose overrides the built-in payee default"
);
assert.ok(!(FINANCE_CATEGORIES as readonly string[]).includes("Zelle"));
assert.ok(FINANCE_CATEGORIES.includes("Photography"));
assert.ok(FINANCE_CATEGORIES.includes("Experiences"));
assert.ok(FINANCE_CATEGORIES.includes("Gifts"));
assert.ok(FINANCE_CATEGORIES.includes("Reselling"));
assert.ok(INCOME_CATEGORIES.includes("Gifts"));
assert.ok(INCOME_CATEGORIES.includes("Reselling"));
assert.ok(!(EXPENSE_CATEGORIES as readonly string[]).includes("Gifts"));
assert.ok(!(EXPENSE_CATEGORIES as readonly string[]).includes("Reselling"));
assert.deepEqual(categoriesForKind("income"), INCOME_CATEGORIES);
assert.deepEqual(categoriesForKind("expense"), EXPENSE_CATEGORIES);
assert.equal(
  normalizeTransactionCategory("Shopping", "Wash Kiosk Mobile", "expense"),
  "Laundry"
);

const statementCsv = [
  "Date,Account,Type,Payee / Description,Category,Money In,Money Out,Amount (signed),Running Balance (statement),Notes",
  "2025-08-25,Checking,Debit card purchase,Wash Kiosk Mobile,Laundry,,10.0,-10.0,217.29,WASH KIOSK MOBILE",
].join("\n");
const parsedStatement = parseBankCsv(statementCsv, {
  accountId: "acc-chase-checking",
});
assert.equal(parsedStatement.added.length, 1);
assert.equal(parsedStatement.added[0].category, "Laundry");
assert.equal(parsedStatement.added[0].statementBalance, 217.29);
assert.equal(parsedStatement.added[0].statementOrder, 1);

assert.equal(CHASE_STATEMENT_TXS.length, 627);
assert.equal(
  CHASE_STATEMENT_TXS.filter((tx) => tx.merchant === "Wash Kiosk Mobile").length,
  8
);
assert.ok(
  CHASE_STATEMENT_TXS.filter(
    (tx) => tx.merchant === "Wash Kiosk Mobile"
  ).every((tx) => tx.category === "Laundry")
);
assert.ok(
  CHASE_STATEMENT_TXS.every(
    (tx) =>
      tx.statementBalance != null &&
      Number.isFinite(tx.statementBalance) &&
      tx.statementOrder != null
  )
);
const finalStatementRow = [...CHASE_STATEMENT_TXS].sort(
  (left, right) =>
    (right.statementOrder ?? -1) - (left.statementOrder ?? -1)
)[0];
assert.equal(finalStatementRow.statementBalance, 0.03);
const categorizedChase = applyChaseStatements({
  ...loadFinance(),
  txs: [],
}).state.txs;
const categoriesFor = (merchant: string) =>
  categorizedChase
    .filter((transaction) => transaction.merchant === merchant)
    .map((transaction) => transaction.category);
assert.deepEqual(categoriesFor("Zelle to Sean Filimon"), ["Travel"]);
assert.deepEqual(categoriesFor("Zelle to Ricky (Coding Guy)"), ["Restaurants"]);
assert.ok(
  categoriesFor("Zelle from Audrey Davis 0CA0QBJ17YG4").every(
    (category) => category === "Photography"
  )
);
assert.deepEqual(categoriesFor("Zelle from Jasis Shrestha"), ["Gifts"]);
assert.deepEqual(
  categoriesFor("Zelle from Grace Rose Wfct0Z94G69C"),
  ["Reselling"]
);
assert.deepEqual(
  categoriesFor("Zelle from Madison Aikins Nav0Jhdzhkdf"),
  ["Uncategorized"]
);
assert.ok(
  categorizedChase
    .filter((transaction) =>
      /Zelle to (Ronni Wieman|Sam Peterson|Ani|Ella Will)/.test(
        transaction.merchant || ""
      )
    )
    .every((transaction) => transaction.category === "Groceries")
);
assert.ok(
  categorizedChase
    .filter((transaction) =>
      /Zelle to (Sofia USC|Zeba|Ziyu Gao)/.test(transaction.merchant || "")
    )
    .every((transaction) => transaction.category === "Restaurants")
);
assert.ok(
  categorizedChase
    .filter((transaction) =>
      /\bZelle\b/.test(`${transaction.merchant} ${transaction.note}`)
    )
    .every((transaction) => transaction.category !== "Zelle")
);
const statementReconciliation = buildReconciliation({
  ...loadFinance(),
  accounts: CHASE_STATEMENT_ACCOUNTS,
  txs: CHASE_STATEMENT_TXS,
});
const checkingReconciliation = statementReconciliation.find(
  (report) => report.accountId === "acc-chase-checking"
);
assert.equal(checkingReconciliation?.status, "reconciled");
assert.equal(checkingReconciliation?.statementOpening, 0);
assert.equal(checkingReconciliation?.statementEnding, 0.03);
assert.equal(checkingReconciliation?.drift, 0);

runFinancePlan("I spent $6 cash for food");
runFinancePlan("log income $100 from Umesh");
const finance = loadFinance();
assert.equal(finance.txs.length, 2);
assert.equal(finance.txs[0].category, "Family");
assert.equal(finance.txs[1].category, "Cash");
assert.equal(finance.txs[1].merchant, "food");
runFinancePlan("log $12 Zelle to Sean Filimon");
runFinancePlan("recategorize Zelle to Sean Filimon to Travel");
let melReviewedFinance = loadFinance();
assert.equal(melReviewedFinance.txs[0].category, "Travel");
assert.equal(melReviewedFinance.txs[0].categoryReviewed, true);
runFinancePlan("Zelle to Sean Filimon was Experiences");
melReviewedFinance = loadFinance();
assert.equal(melReviewedFinance.txs[0].category, "Experiences");

localStorage.setItem(
  "wonder-books-library-v1",
  JSON.stringify([
    {
      id: "bk-nic-ent-01-walt-disney",
      title: "Walt Disney",
      source: "manual",
    },
    {
      id: "apple-morrie",
      sourceId: "MORRIE",
      source: "apple-books",
      title: "Tuesdays with Morrie",
    },
    {
      id: "apple-real",
      sourceId: "REAL",
      source: "apple-books",
      title: "The Innovators",
      author: "Walter Isaacson",
    },
  ])
);
const books = loadBooks();
assert.deepEqual(books.map((book) => book.title), ["The Innovators"]);

const brief = buildBookPageBrief(
  "The important lesson is that starting small removes the fear of beginning. You should choose one practical action and practice it every day. Because repetition makes the behavior easier, the habit eventually becomes automatic.",
  "Habits"
);
assert.equal(brief.heading, "Habits");
assert.ok(brief.takeaways.length >= 2);
assert.match(brief.action || "", /choose|practice/i);

const singleCategoryDonut = pieSlicePath(
  110,
  110,
  96,
  56,
  -Math.PI / 2,
  Math.PI * 1.5,
  true
);
assert.equal(
  singleCategoryDonut.match(/\bA/g)?.length,
  4,
  "a one-category donut must draw both the outside and inside circles"
);
assert.match(singleCategoryDonut, /A56,56/);

console.log("finance + bookshelf integration checks passed");

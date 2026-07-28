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

const { normalizeTransactionCategory } = await import(
  "../src/melani/financeCategorize.ts"
);
const { loadFinance } = await import("../src/melani/financeStore.ts");
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
  "Zelle"
);

runFinancePlan("I spent $6 cash for food");
runFinancePlan("log income $100 from Umesh");
const finance = loadFinance();
assert.equal(finance.txs.length, 2);
assert.equal(finance.txs[0].category, "Family");
assert.equal(finance.txs[1].category, "Cash");
assert.equal(finance.txs[1].merchant, "food");

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

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
  changeQuote,
  currentQuoteRotation,
  MANUAL_QUOTE_LIMIT,
} = await import("../src/melani/quoteRotation.ts");

const now = new Date();
const initial = currentQuoteRotation(now);
assert.equal(initial.remaining, MANUAL_QUOTE_LIMIT);
assert.equal(initial.changes, 0);

const firstChange = changeQuote(now);
assert.equal(firstChange.remaining, 1);
assert.equal(firstChange.changes, 1);
assert.notDeepEqual(firstChange.quote, initial.quote);

const secondChange = changeQuote(now);
assert.equal(secondChange.remaining, 0);
assert.equal(secondChange.changes, 2);
assert.notDeepEqual(secondChange.quote, firstChange.quote);
assert.notDeepEqual(secondChange.quote, initial.quote);

const blockedChange = changeQuote(now);
assert.equal(blockedChange.remaining, 0);
assert.deepEqual(blockedChange.quote, secondChange.quote);

const nextWindow = new Date(now.getTime() + initial.msUntilReset + 2_000);
const reset = currentQuoteRotation(nextWindow);
assert.equal(reset.remaining, MANUAL_QUOTE_LIMIT);
assert.equal(reset.changes, 0);

console.log("quote rotation checks passed");

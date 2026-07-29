import assert from "node:assert/strict";
import type { FinanceState, FinanceTx } from "../src/melani/financeStore.ts";
import {
  buildAugustPlan,
  buildOwnerReport,
  buildProfitBridge,
  buildReimbursementDesk,
  buildUnitEconomics,
  buildWasteReport,
} from "../src/melani/rockefellerFinance.ts";

function tx(
  id: string,
  date: string,
  kind: "income" | "expense",
  amount: number,
  category: string,
  merchant: string
): FinanceTx {
  return {
    id,
    date,
    kind,
    amount,
    category,
    categoryReviewed: true,
    merchant,
    note: merchant,
    accountId: "checking",
    source: "manual",
  };
}

const august = buildAugustPlan(10_000, 0.05, 0.01);
assert.equal(
  august.allocations.reduce((sum, row) => sum + row.amount, 0),
  10_000
);
assert.equal(
  august.allocations.find((row) => row.id === "personal")?.amount,
  500
);
assert.equal(
  august.personal.find((row) => row.label === "Restaurants")?.amount,
  0
);
assert.equal(
  august.reinvestment.reduce((sum, row) => sum + row.hoursPerWeek, 0),
  40
);

const discipline = buildAugustPlan(10_000, 0.01, 0.01);
assert.equal(
  discipline.allocations.find((row) => row.id === "personal")?.amount,
  100
);
assert.equal(
  discipline.allocations.reduce((sum, row) => sum + row.amount, 0),
  10_000
);

const txs: FinanceTx[] = [
  tx("online", "2026-08-02", "income", 6_000, "Online income", "Digital sales"),
  tx("tech", "2026-08-03", "income", 4_000, "Technology income", "Tech client"),
  tx("online-cost", "2026-08-04", "expense", 900, "Online business", "Ad test"),
  tx("tech-cost", "2026-08-05", "expense", 600, "Technology", "Cloud + APIs"),
  tx("restaurant-a", "2026-08-06", "expense", 25, "Restaurants", "Cava"),
  tx("restaurant-b", "2026-08-07", "expense", 8, "Restaurants", "Coffee"),
  tx("original", "2026-07-20", "expense", 88, "Travel", "Train"),
  tx("paid-back", "2026-08-08", "income", 88, "Reimbursements", "Zelle payback"),
  tx("family", "2026-08-09", "income", 500, "Family", "Zelle from Bimala"),
  tx("transfer-in", "2026-08-10", "income", 300, "Transfers", "From savings"),
  tx("transfer-out", "2026-08-10", "expense", 300, "Transfers", "To checking"),
];

const waste = buildWasteReport(txs, "2026-08");
assert.equal(waste.restaurantViolations, 2);
assert.equal(
  waste.findings.find((finding) => finding.id === "restaurant-ban")?.amount,
  33
);

const units = buildUnitEconomics(txs, "2026-08");
const online = units.find((lane) => lane.id === "online");
const technology = units.find((lane) => lane.id === "technology");
assert.deepEqual(
  [online?.revenue, online?.directCosts, online?.contributionProfit],
  [6_000, 900, 5_100]
);
assert.deepEqual(
  [technology?.revenue, technology?.directCosts, technology?.contributionProfit],
  [4_000, 600, 3_400]
);

const bridge = buildProfitBridge(txs, "2026-08");
assert.equal(bridge.rawMoneyIn, 10_888);
assert.equal(bridge.earnedRevenue, 10_000);
assert.equal(bridge.familyFunding, 500);
assert.equal(bridge.reimbursements, 88);
assert.equal(bridge.transfersIn, 300);
assert.equal(bridge.operatingExpenses, 1_533);
assert.equal(bridge.transfersOut, 300);
assert.equal(bridge.trueProfit, 8_467);

const reimbursement = buildReimbursementDesk(txs, "2026-08");
assert.equal(reimbursement.received, 88);
assert.equal(reimbursement.matched, 88);
assert.equal(reimbursement.unmatched, 0);
assert.equal(reimbursement.matches[0]?.expenseId, "original");

const state: FinanceState = {
  version: 2,
  accounts: [],
  txs,
  budget: [],
  watchlist: [],
  goals: [],
  creditProfile: null,
};
const owner = buildOwnerReport(state, "2026-08", august);
assert.equal(owner.earnedRevenue, 10_000);
assert.equal(owner.restaurantViolations, 2);
assert.ok(owner.actions.some((action) => /Restaurant rule failed/.test(action)));

console.log("Rockefeller owner-desk checks passed");

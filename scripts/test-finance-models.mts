/**
 * Financial model tests — every formula checked against a hand-computable
 * value or a known identity, not against its own output.
 * Run: npm run test:models
 */

const values = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, String(value)),
    removeItem: (key: string) => values.delete(key),
  },
});

const M = await import("../src/melani/financeModels.ts");
const { CONCEPTS, findConcept, conceptById, relevantConcepts } =
  await import("../src/melani/financeConcepts.ts");
const { explainConcept, runScenario } = await import("../src/melani/financeExplain.ts");

let passed = 0;
let failed = 0;
function assert(name: string, cond: unknown) {
  if (cond) { passed += 1; console.log(`  ✓ ${name}`); }
  else { failed += 1; console.log(`  ✗ ${name}`); }
}
const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol;

const CTX = {
  cash: 4200, debt: 1240, worth: 2960,
  income: 3000, expense: 2400, cashFlow: 600,
  utilization: 0.41, apr: 24.99,
};

console.log("\nTime value of money");
assert("FV of 100 at 10% for 1 yr = 110", near(M.futureValue(100, 0.10, 1), 110));
assert("FV of 100 at 10% for 2 yrs = 121", near(M.futureValue(100, 0.10, 2), 121));
assert("PV inverts FV", near(M.presentValue(M.futureValue(500, 0.07, 12), 0.07, 12), 500));
assert("FV at 0% is unchanged", near(M.futureValue(1000, 0, 30), 1000));

// $100/yr for 3 yrs at 10%: 100(1.1²)+100(1.1)+100 = 121+110+100 = 331
assert("annuity FV matches hand calculation", near(M.futureValueSeries(100, 0.10, 3), 331));
assert("annuity at 0% is just payment × periods", near(M.futureValueSeries(50, 0, 24), 1200));
assert("annuity-due is ordinary × (1+r)",
  near(M.futureValueSeries(100, 0.1, 3, true), M.futureValueSeries(100, 0.1, 3) * 1.1));
assert("zero periods yields nothing", M.futureValueSeries(500, 0.07, 0) === 0);

const sched = M.growthSchedule({ initial: 1000, contribution: 100, rate: 0.01, periods: 12 });
assert("schedule has one row per period", sched.length === 12);
assert("contributed tracks deposits", near(sched[11].contributed, 1000 + 1200));
assert("balance = contributed + growth",
  near(sched[11].balance, sched[11].contributed + sched[11].growth));
assert("balance grows monotonically with positive rate",
  sched.every((p, i) => i === 0 || p.balance > sched[i - 1].balance));

const r72 = M.rule72(8);
assert("rule of 72 at 8% ≈ 9 years", near(r72.approx, 9));
assert("exact doubling at 8% ≈ 9.006", near(r72.exact, 9.006, 0.01));
assert("doubling at 0% is never", !Number.isFinite(M.rule72(0).exact));

console.log("\nRates");
// (1 + 0.2499/365)^365 - 1 ≈ 28.39%
assert("24.99% APR daily ≈ 28.4% APY", near(M.aprToApy(24.99), 28.39, 0.05));
assert("APY→APR inverts APR→APY", near(M.apyToApr(M.aprToApy(18)), 18, 0.001));
assert("annual compounding leaves APR unchanged", near(M.aprToApy(10, 1), 10));

const real = M.realReturn(5, 3);
assert("real return is below naive subtraction", real.real < real.naive);
assert("5% vs 3% inflation ≈ 1.94% real", near(real.real, 1.9417, 0.001));
assert("naive subtraction is reported for comparison", near(real.naive, 2));
assert("negative real return when inflation wins", M.realReturn(0.5, 3).real < 0);
assert("purchasing power erodes", M.purchasingPower(1000, 3, 10) < 1000);

console.log("\nDebt");
// $10k, 5%, 360mo → well-known ~$53.68/100k; here ≈ $53.68
assert("loan payment on 10k/5%/30yr ≈ 53.68", near(M.loanPayment(10000, 5, 360), 53.68, 0.02));
assert("0% loan payment is principal ÷ months", near(M.loanPayment(1200, 0, 12), 100));

const am = M.amortize(10000, 5, 360);
assert("amortisation runs to term", am.rows.length === 360);
assert("final balance is zero", near(am.rows[am.rows.length - 1].balance, 0, 0.01));
assert("first payment is mostly interest", am.rows[0].interest > am.rows[0].principal);
assert("last payment is mostly principal",
  am.rows[359].principal > am.rows[359].interest);
assert("principal repaid sums to the loan",
  near(am.rows.reduce((s, r) => s + r.principal, 0), 10000, 0.01));
assert("total interest is positive and reported", am.totalInterest > 0);

const pay = M.payoffWithPayment(1000, 0, 100);
assert("0% debt, $100/mo clears in 10 months", pay.months === 10);
assert("0% debt costs no interest", near(pay.totalInterest, 0));

const slow = M.payoffWithPayment(5000, 24, 100);
assert("payment at the interest line never pays off",
  M.payoffWithPayment(5000, 24, 100).neverPaysOff === true);
assert("interest-only payment is flagged, not faked", slow.months === Infinity);
const ok = M.payoffWithPayment(5000, 24, 250);
assert("adequate payment clears the debt", ok.neverPaysOff === false && ok.months > 0);
assert("total paid = balance + interest", near(ok.totalPaid, 5000 + ok.totalInterest, 0.01));
assert("zero balance needs no months", M.payoffWithPayment(0, 24, 100).months === 0);

const mins = M.payoffWithMinimums(5000, 24.99);
assert("minimums take many years", mins.months > 200);
assert("minimums cost more than the balance", mins.totalInterest > 5000);
assert("a fixed payment beats shrinking minimums",
  M.payoffWithPayment(5000, 24.99, 150).totalInterest < mins.totalInterest);

console.log("\nPayoff strategy");
const debts = [
  { name: "A", balance: 2000, apr: 26.99, minimum: 40 },
  { name: "B", balance: 500, apr: 12.99, minimum: 25 },
  { name: "C", balance: 1500, apr: 19.99, minimum: 30 },
];
const av = M.debtStrategy(debts, 400, "avalanche");
const sn = M.debtStrategy(debts, 400, "snowball");
assert("avalanche targets the highest rate first", av.order[0] === "A");
assert("snowball targets the smallest balance first", sn.order[0] === "B");
assert("avalanche never costs more interest", av.totalInterest <= sn.totalInterest);
assert("both strategies clear every debt",
  av.clearedAt.length === 3 && sn.clearedAt.length === 3);
assert("snowball clears its first debt no later than avalanche does",
  sn.clearedAt[0].month <= av.clearedAt.find((c) => c.name === "B")!.month);
assert("no debts means no work", M.debtStrategy([], 100, "avalanche").months === 0);

console.log("\nIndependence and ratios");
const fi = M.yearsToIndependence({ annualIncome: 60000, annualSpending: 40000 });
assert("target is 25× spending", near(fi.target, 1000000));
assert("savings rate is computed", near(fi.savingsRate, 1 / 3, 0.001));
assert("a positive savings rate is reachable", fi.reachable && fi.years > 0);
assert("saving nothing never gets there",
  M.yearsToIndependence({ annualIncome: 40000, annualSpending: 40000 }).reachable === false);
assert("already-funded means zero years",
  M.yearsToIndependence({ annualIncome: 60000, annualSpending: 40000, currentSavings: 2000000 }).years === 0);
assert("a higher savings rate always shortens the timeline",
  M.yearsToIndependence({ annualIncome: 60000, annualSpending: 30000 }).years <
  M.yearsToIndependence({ annualIncome: 60000, annualSpending: 45000 }).years);

assert("runway is cash ÷ expenses", near(M.runwayMonths(6000, 2000), 3));
assert("no expenses is infinite runway", M.runwayMonths(1000, 0) === Infinity);
assert("DTI is a percentage", near(M.debtToIncome(500, 2000), 25));

const oc = M.opportunityCost(200, 10, 7);
assert("opportunity cost future value ≈ 393", near(oc.future, 393.43, 0.1));
assert("forgone is future minus the amount", near(oc.forgone, oc.future - 200));

console.log("\nNPV and IRR");
assert("NPV at 0% is the plain sum", near(M.npv(0, [-100, 50, 50, 50]), 50));
assert("NPV falls as the discount rate rises",
  M.npv(10, [-100, 50, 50, 50]) < M.npv(5, [-100, 50, 50, 50]));
const irr = M.irr([-100, 60, 60]);
assert("IRR of -100,60,60 ≈ 13.07%", irr !== null && near(irr, 13.07, 0.05));
assert("IRR zeroes the NPV", irr !== null && near(M.npv(irr, [-100, 60, 60]), 0, 0.01));
assert("no sign change means no IRR, reported as null",
  M.irr([100, 60, 60]) === null);

// $5 on $100 for 14 days = 5% × 26.07 periods ≈ 130% APR
assert("a $5 fee for 14 days is ~130% APR", near(M.feeAsApr(5, 100, 14), 130.36, 0.5));
assert("no fee is no rate", M.feeAsApr(0, 100, 14) === 0);

console.log("\nConcept library");
assert("library is substantial", CONCEPTS.length >= 25);
assert("concept ids are unique", new Set(CONCEPTS.map((c) => c.id)).size === CONCEPTS.length);
assert("every concept has a one-liner and plain explanation",
  CONCEPTS.every((c) => c.oneLine.length > 10 && c.plain.length > 40));
assert("every concept cites a source", CONCEPTS.every((c) => c.source.length > 5));
assert("finds by name", findConcept("what is compound interest")?.id === "compound-interest");
assert("finds by alias", findConcept("explain apy")?.id === "apr-apy");
assert("prefers the most specific match",
  findConcept("explain credit utilization")?.id === "credit-utilization");
assert("returns null on nonsense", findConcept("banana helicopter") === null);
assert("short aliases don't fire inside longer words",
  findConcept("what is my quarterly interest") === null ||
  findConcept("what is my quarterly interest")!.id !== "expense-ratio");
// "ter" is a real abbreviation (total expense ratio), so as a standalone
// word it should match — it just must not fire inside another word.
assert("short aliases still match as whole words",
  findConcept("explain ter")?.id === "expense-ratio");
assert("multi-word aliases match", findConcept("explain annual percentage rate")?.id === "apr-apy");
assert("worked examples run without throwing",
  CONCEPTS.every((c) => { try { c.worked?.(CTX); return true; } catch { return false; } }));
assert("worked examples produce text when they return anything",
  CONCEPTS.every((c) => { const w = c.worked?.(CTX); return !w || w.text.length > 10; }));
assert("relevant concepts respond to having debt",
  relevantConcepts(CTX, 3).some((c) => ["apr-apy", "minimum-payment", "credit-utilization"].includes(c.id)));
assert("the 4% rule cites Bengen",
  conceptById("safe-withdrawal")!.source.includes("Bengen"));
assert("loss aversion cites Kahneman & Tversky",
  conceptById("loss-aversion")!.source.includes("Kahneman"));
assert("diversification cites Markowitz",
  conceptById("diversification")!.source.includes("Markowitz"));

console.log("\nCopilot routing");
const ex = explainConcept("explain compound interest", CTX);
assert("explains a concept", ex !== null && ex.text.includes("Growth that earns growth"));
assert("explanation includes the formula", ex !== null && ex.text.includes("FV = PV"));
assert("explanation uses her own numbers", ex !== null && ex.text.includes("Your numbers"));
assert("explanation cites its source", ex !== null && ex.sources.length >= 2);
assert("a plain data question is not hijacked into a lecture",
  explainConcept("what is my net worth", CTX) === null);
assert("an unknown concept falls through", explainConcept("explain quantum mechanics", CTX) === null);

const save = runScenario("what if I save $500 a month for 10 years", CTX);
assert("runs a savings scenario", save !== null);
assert("savings scenario charts the projection", save?.chart?.kind === "line");
assert("savings chart has one point per year plus the start", (save?.chart?.points.length ?? 0) >= 10);
assert("savings scenario states its assumptions", save!.text.includes("Assumes"));
assert("savings scenario separates contributions from growth",
  save!.data!.some((d) => d.label === "Growth") && save!.data!.some((d) => d.label === "You contribute"));
assert("savings scenario adjusts for inflation",
  save!.data!.some((d) => d.label === "In today's money"));

const payoff = runScenario("how long to pay off $2000 at 24% paying $150 a month", CTX);
assert("runs a payoff scenario", payoff !== null);
assert("payoff reports months and interest",
  payoff!.data!.some((d) => d.label === "Months") && payoff!.data!.some((d) => d.label === "Interest"));

const doomed = runScenario("how long to pay off $5000 at 24% paying $100 a month", CTX);
assert("an impossible payoff is called out, not faked",
  doomed !== null && /never clears/.test(doomed.text));

const strat = runScenario("avalanche vs snowball", CTX);
assert("runs a strategy comparison", strat !== null && /Avalanche/.test(strat.text));
assert("strategy comparison quantifies the gap",
  strat!.data!.some((d) => d.label === "Avalanche saves"));
// The default budget must actually pay the debt down, or both strategies
// look identical and the comparison teaches nothing.
assert("default budget clears the debt in a sane time",
  /(\d+) months/.test(strat!.text) && Number(strat!.text.match(/— (\d+) months/)![1]) < 60);
assert("never claims an earlier snowball win that didn't happen",
  !/earlier visible win/.test(strat!.text) ||
  /month (\d+) against avalanche's month (\d+)/.test(strat!.text));

const lump = runScenario("what is $5000 worth in 20 years", CTX);
assert("runs a lump-sum projection", lump !== null && lump.chart?.kind === "line");

const dbl = runScenario("how long to double my money at 8%", CTX);
assert("answers doubling questions", dbl !== null && /doubles/.test(dbl.text));

const infl = runScenario("what is 5% worth with 3% inflation", CTX);
assert("answers real-return questions", infl !== null && /real/.test(infl.text));

assert("a ledger question is left to the query engine",
  runScenario("how much did I spend on food in June", CTX) === null);

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);

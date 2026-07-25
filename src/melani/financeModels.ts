/**
 * Financial models — the arithmetic behind every claim the copilot makes.
 *
 * Pure functions, no storage, no formatting. Everything here is testable and
 * every result is reproducible by hand, which is the point: a copilot that
 * says "you'd have $48,000" is only useful if it can also show the formula
 * that produced it.
 *
 * Money is handled in whole currency units (dollars) as floats here, not
 * cents. That is deliberate — these are projections over decades where the
 * input assumptions (a guessed 7% return) dwarf any float rounding. Ledger
 * arithmetic, where exactness matters, stays in financeMoney's cents.
 *
 * Sources for the formulas are noted per function. None are proprietary:
 * they are the standard time-value-of-money identities taught in any
 * corporate finance course.
 */

// ─── Time value of money ─────────────────────────────────────────────────────

/**
 * Future value of a lump sum: FV = PV(1 + r)^n
 *
 * @param present  amount today
 * @param rate     periodic rate as a decimal (0.07 = 7%)
 * @param periods  number of periods
 */
export function futureValue(present: number, rate: number, periods: number): number {
  return present * Math.pow(1 + rate, periods);
}

/** Present value of a future sum: PV = FV / (1 + r)^n */
export function presentValue(future: number, rate: number, periods: number): number {
  return future / Math.pow(1 + rate, periods);
}

/**
 * Future value of a series of regular deposits (an annuity).
 *
 *   ordinary (end of period):  FV = PMT × [((1+r)^n − 1) / r]
 *   due (start of period):     multiply by (1 + r)
 *
 * The r = 0 case is handled separately because the closed form divides by r.
 */
export function futureValueSeries(
  payment: number,
  rate: number,
  periods: number,
  atStartOfPeriod = false
): number {
  if (periods <= 0) return 0;
  if (rate === 0) return payment * periods;
  const base = payment * ((Math.pow(1 + rate, periods) - 1) / rate);
  return atStartOfPeriod ? base * (1 + rate) : base;
}

export type GrowthPoint = {
  period: number;
  /** Total balance at the end of this period. */
  balance: number;
  /** Cumulative money you actually put in. */
  contributed: number;
  /** Balance minus contributions — the part the market did. */
  growth: number;
};

/**
 * Period-by-period growth of a starting balance plus regular contributions.
 * Returned as a series so the copilot can chart it, and so the split between
 * "money you saved" and "money that compounded" is visible.
 */
export function growthSchedule(params: {
  initial: number;
  contribution: number;
  rate: number;
  periods: number;
}): GrowthPoint[] {
  const { initial, contribution, rate, periods } = params;
  const out: GrowthPoint[] = [];
  let balance = initial;
  let contributed = initial;
  for (let p = 1; p <= Math.max(0, Math.round(periods)); p++) {
    balance = balance * (1 + rate) + contribution;
    contributed += contribution;
    out.push({
      period: p,
      balance,
      contributed,
      growth: balance - contributed,
    });
  }
  return out;
}

/**
 * Rule of 72 — years to double at a given rate.
 * An approximation, accurate to within a few percent for rates of 5–12%.
 * Exact answer is ln(2)/ln(1+r); both are returned so the gap is visible.
 */
export function rule72(ratePercent: number): { approx: number; exact: number } {
  const r = ratePercent / 100;
  return {
    approx: ratePercent > 0 ? 72 / ratePercent : Infinity,
    exact: r > 0 ? Math.log(2) / Math.log(1 + r) : Infinity,
  };
}

// ─── Rates ───────────────────────────────────────────────────────────────────

/**
 * APR → APY. APR is the quoted simple rate; APY is what you actually pay or
 * earn once compounding is applied. Credit cards quote APR and compound
 * daily, which is why a "24.99% APR" card really costs about 28.4%.
 *
 * APY = (1 + APR/n)^n − 1
 */
export function aprToApy(aprPercent: number, compoundsPerYear = 365): number {
  const apr = aprPercent / 100;
  return (Math.pow(1 + apr / compoundsPerYear, compoundsPerYear) - 1) * 100;
}

/** APY → the equivalent quoted APR. */
export function apyToApr(apyPercent: number, compoundsPerYear = 365): number {
  const apy = apyPercent / 100;
  return (Math.pow(1 + apy, 1 / compoundsPerYear) - 1) * compoundsPerYear * 100;
}

/**
 * Real (inflation-adjusted) return, via the exact Fisher equation:
 *   (1 + nominal) / (1 + inflation) − 1
 *
 * The common shortcut "nominal − inflation" overstates the result, and the
 * error grows with the rates involved.
 */
export function realReturn(nominalPercent: number, inflationPercent: number): {
  real: number;
  naive: number;
} {
  const n = nominalPercent / 100;
  const i = inflationPercent / 100;
  return {
    real: ((1 + n) / (1 + i) - 1) * 100,
    naive: nominalPercent - inflationPercent,
  };
}

/** What a sum today is worth in purchasing power after n years of inflation. */
export function purchasingPower(amount: number, inflationPercent: number, years: number): number {
  return amount / Math.pow(1 + inflationPercent / 100, years);
}

// ─── Debt ────────────────────────────────────────────────────────────────────

/**
 * Level payment for an amortising loan:
 *   PMT = P × r / (1 − (1+r)^−n)
 */
export function loanPayment(principal: number, annualRatePercent: number, months: number): number {
  const r = annualRatePercent / 100 / 12;
  if (months <= 0) return 0;
  if (r === 0) return principal / months;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}

export type AmortRow = {
  month: number;
  payment: number;
  interest: number;
  principal: number;
  balance: number;
};

/** Full amortisation schedule, so the interest/principal split is visible. */
export function amortize(
  principal: number,
  annualRatePercent: number,
  months: number
): { rows: AmortRow[]; totalInterest: number; payment: number } {
  const payment = loanPayment(principal, annualRatePercent, months);
  const r = annualRatePercent / 100 / 12;
  const rows: AmortRow[] = [];
  let balance = principal;
  let totalInterest = 0;

  for (let m = 1; m <= months && balance > 0.005; m++) {
    const interest = balance * r;
    const toPrincipal = Math.min(payment - interest, balance);
    balance -= toPrincipal;
    totalInterest += interest;
    rows.push({ month: m, payment: interest + toPrincipal, interest, principal: toPrincipal, balance: Math.max(0, balance) });
  }
  return { rows, totalInterest, payment };
}

export type PayoffResult = {
  months: number;
  totalInterest: number;
  totalPaid: number;
  /** True when the payment never covers the interest — the balance grows. */
  neverPaysOff: boolean;
};

/**
 * How long a fixed monthly payment takes to clear a balance.
 *
 * The neverPaysOff case is the important one: if the payment is at or below
 * the monthly interest, the debt is permanent. Returning a fake number there
 * would be worse than useless.
 */
export function payoffWithPayment(
  balance: number,
  annualRatePercent: number,
  monthlyPayment: number,
  maxMonths = 1200
): PayoffResult {
  const r = annualRatePercent / 100 / 12;
  if (balance <= 0) return { months: 0, totalInterest: 0, totalPaid: 0, neverPaysOff: false };
  if (monthlyPayment <= balance * r) {
    return { months: Infinity, totalInterest: Infinity, totalPaid: Infinity, neverPaysOff: true };
  }

  let remaining = balance;
  let interestPaid = 0;
  let months = 0;
  while (remaining > 0.005 && months < maxMonths) {
    const interest = remaining * r;
    interestPaid += interest;
    remaining = remaining + interest - monthlyPayment;
    months += 1;
  }
  const totalPaid = balance + interestPaid;
  return { months, totalInterest: interestPaid, totalPaid, neverPaysOff: false };
}

/**
 * Typical credit-card minimum: the greater of a floor and a percentage of the
 * balance. Because the percentage shrinks with the balance, minimum-only
 * payoff takes far longer than people expect — which is what this shows.
 */
export function payoffWithMinimums(
  balance: number,
  annualRatePercent: number,
  percentOfBalance = 0.02,
  floor = 25,
  maxMonths = 1200
): PayoffResult {
  const r = annualRatePercent / 100 / 12;
  let remaining = balance;
  let interestPaid = 0;
  let months = 0;

  while (remaining > 0.005 && months < maxMonths) {
    const interest = remaining * r;
    const due = Math.max(floor, remaining * percentOfBalance);
    const payment = Math.min(due, remaining + interest);
    if (payment <= interest) {
      return { months: Infinity, totalInterest: Infinity, totalPaid: Infinity, neverPaysOff: true };
    }
    interestPaid += interest;
    remaining = remaining + interest - payment;
    months += 1;
  }
  return { months, totalInterest: interestPaid, totalPaid: balance + interestPaid, neverPaysOff: false };
}

export type Debt = { name: string; balance: number; apr: number; minimum: number };

export type StrategyResult = {
  order: string[];
  months: number;
  totalInterest: number;
  /** Month each debt was cleared, for the payoff narrative. */
  clearedAt: { name: string; month: number }[];
};

/**
 * Avalanche (highest APR first) vs snowball (smallest balance first).
 *
 * Avalanche always costs less in interest — that is arithmetic, not opinion.
 * Snowball clears individual debts sooner, which some people need to stay
 * with it. Both are modelled so the actual size of the trade-off is visible
 * rather than argued about.
 */
export function debtStrategy(
  debts: Debt[],
  monthlyBudget: number,
  strategy: "avalanche" | "snowball",
  maxMonths = 1200
): StrategyResult {
  const working = debts
    .filter((d) => d.balance > 0)
    .map((d) => ({ ...d }));
  if (!working.length) {
    return { order: [], months: 0, totalInterest: 0, clearedAt: [] };
  }

  const order = [...working]
    .sort((a, b) => (strategy === "avalanche" ? b.apr - a.apr : a.balance - b.balance))
    .map((d) => d.name);

  let months = 0;
  let totalInterest = 0;
  const clearedAt: { name: string; month: number }[] = [];

  while (working.some((d) => d.balance > 0.005) && months < maxMonths) {
    months += 1;
    // Interest first, on every open balance.
    for (const debt of working) {
      if (debt.balance <= 0) continue;
      const interest = debt.balance * (debt.apr / 100 / 12);
      debt.balance += interest;
      totalInterest += interest;
    }

    // Minimums on everything, then everything spare at the target debt.
    let pool = monthlyBudget;
    for (const debt of working) {
      if (debt.balance <= 0) continue;
      const pay = Math.min(debt.minimum, debt.balance, pool);
      debt.balance -= pay;
      pool -= pay;
      if (pool <= 0) break;
    }

    for (const name of order) {
      if (pool <= 0) break;
      const debt = working.find((d) => d.name === name);
      if (!debt || debt.balance <= 0) continue;
      const pay = Math.min(pool, debt.balance);
      debt.balance -= pay;
      pool -= pay;
    }

    for (const debt of working) {
      if (debt.balance <= 0.005 && !clearedAt.some((c) => c.name === debt.name)) {
        debt.balance = 0;
        clearedAt.push({ name: debt.name, month: months });
      }
    }
  }

  return { order, months, totalInterest, clearedAt };
}

// ─── Savings, runway, independence ───────────────────────────────────────────

/**
 * Years to financial independence from a savings rate alone.
 *
 * Assumes you retire on `withdrawal`% of the pot per year, and that spending
 * stays flat. The striking implication — that the answer depends on the
 * *rate* you save, not the income you earn — is the entire point.
 *
 * Solves FV(series) = target for n.
 */
export function yearsToIndependence(params: {
  annualIncome: number;
  annualSpending: number;
  returnPercent?: number;
  withdrawalPercent?: number;
  currentSavings?: number;
}): { years: number; target: number; savingsRate: number; reachable: boolean } {
  const {
    annualIncome,
    annualSpending,
    returnPercent = 7,
    withdrawalPercent = 4,
    currentSavings = 0,
  } = params;

  const saved = annualIncome - annualSpending;
  const savingsRate = annualIncome > 0 ? saved / annualIncome : 0;
  const target = annualSpending / (withdrawalPercent / 100);

  if (saved <= 0) return { years: Infinity, target, savingsRate, reachable: false };
  if (currentSavings >= target) return { years: 0, target, savingsRate, reachable: true };

  const r = returnPercent / 100;
  if (r === 0) {
    return { years: (target - currentSavings) / saved, target, savingsRate, reachable: true };
  }
  // target = current(1+r)^n + saved × ((1+r)^n − 1)/r  →  solve for n
  const numerator = target * r + saved;
  const denominator = currentSavings * r + saved;
  const years = Math.log(numerator / denominator) / Math.log(1 + r);
  return { years, target, savingsRate, reachable: true };
}

/** Months of expenses your cash covers. */
export function runwayMonths(cash: number, monthlyExpenses: number): number {
  if (monthlyExpenses <= 0) return Infinity;
  return cash / monthlyExpenses;
}

/** Debt-to-income: monthly debt payments ÷ gross monthly income, as a percent. */
export function debtToIncome(monthlyDebtPayments: number, monthlyGrossIncome: number): number {
  if (monthlyGrossIncome <= 0) return Infinity;
  return (monthlyDebtPayments / monthlyGrossIncome) * 100;
}

/**
 * What a purchase costs you if the money were invested instead.
 * The honest framing of "it's only $200".
 */
export function opportunityCost(
  amount: number,
  years: number,
  returnPercent = 7
): { future: number; forgone: number } {
  const future = futureValue(amount, returnPercent / 100, years);
  return { future, forgone: future - amount };
}

/**
 * Net present value of a cash-flow series. cashFlows[0] is period 0 and is
 * conventionally the negative up-front cost.
 */
export function npv(ratePercent: number, cashFlows: number[]): number {
  const r = ratePercent / 100;
  return cashFlows.reduce((sum, cf, t) => sum + cf / Math.pow(1 + r, t), 0);
}

/**
 * Internal rate of return — the discount rate where NPV is zero.
 * Bisection rather than Newton's method: slower, but it cannot diverge, and
 * a wrong-but-confident IRR is worse than a slow one.
 */
export function irr(cashFlows: number[], guessLow = -0.99, guessHigh = 10): number | null {
  const f = (r: number) => cashFlows.reduce((s, cf, t) => s + cf / Math.pow(1 + r, t), 0);
  let lo = guessLow;
  let hi = guessHigh;
  let flo = f(lo);
  let fhi = f(hi);
  // No sign change means no root in range — say so rather than guess.
  if (flo * fhi > 0) return null;

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fmid = f(mid);
    if (Math.abs(fmid) < 1e-9) return mid * 100;
    if (flo * fmid < 0) { hi = mid; fhi = fmid; }
    else { lo = mid; flo = fmid; }
  }
  return ((lo + hi) / 2) * 100;
}

/**
 * Effective cost of a "buy now, pay later" or fee-based advance, expressed as
 * an APR. A $5 fee on $100 for two weeks is not a 5% loan; it is ~130% APR.
 */
export function feeAsApr(fee: number, principal: number, days: number): number {
  if (principal <= 0 || days <= 0) return 0;
  return (fee / principal) * (365 / days) * 100;
}

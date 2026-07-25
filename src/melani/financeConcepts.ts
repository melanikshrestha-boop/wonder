/**
 * Finance concept library.
 *
 * Writing rules for everything in this file, which are not stylistic
 * preferences but requirements:
 *
 *   No analogies. No metaphors. No aphorisms. Describing APR as a "sticker
 *   rate" tells the reader nothing about what APR is; it substitutes a
 *   familiar image for a definition and leaves them unable to compute it.
 *   State the mechanism instead: what is measured, how it is calculated,
 *   what it does under what conditions, with specific figures.
 *
 *   Prefer more detail to less. Where a threshold exists, give the number.
 *   Where an approximation is used, give its error. Where a claim is
 *   empirical, name the study and its scope.
 *
 * Each concept carries:
 *   oneLine      — a definition, not a hook
 *   plain        — the mechanism, in full
 *   formula      — compact notation, rendered as real typeset maths
 *   formulaNote  — what every symbol denotes
 *   worked       — the same calculation run on the reader's own ledger
 *   gotcha       — the specific condition under which intuition fails
 *
 * On sources: this file encodes concepts and formulas, which are not
 * copyrightable, and cites where each is authoritatively documented. No book
 * text is reproduced anywhere. Titles under `reading` are pointers to the
 * original work, not summaries of it.
 *
 * Citations favour primary and public-domain sources — SEC investor
 * education, the CFPB, the IRS, FRED — and the original papers where one
 * exists, over secondary commentary.
 */
import { money } from "./financeStore";
import {
  aprToApy,
  debtToIncome,
  futureValue,
  opportunityCost,
  payoffWithMinimums,
  payoffWithPayment,
  realReturn,
  rule72,
  runwayMonths,
  yearsToIndependence,
} from "./financeModels";

export type ConceptContext = {
  cash: number;
  debt: number;
  worth: number;
  /** Monthly figures from the ledger. */
  income: number;
  expense: number;
  cashFlow: number;
  /** 0..1, or null when card limits are unknown. */
  utilization: number | null;
  /** Representative card APR, when known. */
  apr: number | null;
};

export type ConceptExample = {
  text: string;
  data?: { label: string; value: string }[];
};

export type Concept = {
  id: string;
  name: string;
  aliases: string[];
  oneLine: string;
  plain: string;
  /** Compact notation; rendered as typeset maths by mathml.renderFormula. */
  formula?: string;
  /** What each symbol in the formula denotes. */
  formulaNote?: string;
  gotcha?: string;
  /** Where this is authoritatively documented. */
  source: string;
  /** Further reading — pointers to the real work, not a substitute for it. */
  reading?: string;
  /** Runs the concept on the reader's own numbers; null when data is missing. */
  worked?: (ctx: ConceptContext) => ConceptExample | null;
};

const pct = (n: number) => `${n.toFixed(1)}%`;
const yrs = (n: number) => (Number.isFinite(n) ? `${n.toFixed(1)} years` : "never");

export const CONCEPTS: Concept[] = [
  // ── Time value of money ───────────────────────────────────────────────────
  {
    id: "compound-interest",
    name: "Compound interest",
    aliases: ["compounding", "compound", "interest on interest"],
    oneLine: "Interest calculated on the principal plus all interest already added to it.",
    plain:
      "Under simple interest, each period pays a fixed amount calculated only on the original principal. Under compound interest, each period's interest is added to the balance, and the next period's interest is calculated on that larger balance. The balance therefore grows by a constant percentage rather than a constant amount, which makes it an exponential function of time rather than a linear one.\n\nThe number of compounding periods matters as much as the rate. The same 12% annual rate produces 12.00% growth compounded once a year, 12.55% compounded monthly, and 12.75% compounded daily, because each additional period starts from a slightly larger balance.",
    formula: "FV = PV(1 + r)^n",
    formulaNote: "FV = ending balance · PV = starting balance · r = rate per period · n = number of periods",
    gotcha:
      "The mechanism is identical when you are the borrower. Credit card interest is compounded daily on the outstanding balance, so an unpaid balance grows exponentially at the card's rate.",
    source: "U.S. SEC, Investor.gov — compound interest calculator and definition",
    reading: "Morgan Housel, The Psychology of Money",
    worked: (ctx) => {
      const base = Math.max(1000, Math.round(ctx.cash));
      const ten = futureValue(base, 0.07, 10);
      const thirty = futureValue(base, 0.07, 30);
      return {
        text: `${money(base)} at 7% per year, compounded annually, with no further deposits: ${money(ten)} after 10 years, ${money(thirty)} after 30. The first 10 years add ${money(ten - base)}. The following 20 add ${money(thirty - ten)}, because each of those years compounds on a larger balance.`,
        data: [
          { label: "Start", value: money(base) },
          { label: "After 10 years", value: money(ten) },
          { label: "After 30 years", value: money(thirty) },
        ],
      };
    },
  },
  {
    id: "rule-72",
    name: "Rule of 72",
    aliases: ["rule of seventy two", "doubling time", "how long to double"],
    oneLine: "An approximation for the number of periods a balance takes to double: 72 divided by the rate.",
    plain:
      "The exact doubling time is ln 2 divided by ln(1 + r). Because ln(1 + r) is close to r for small r, and ln 2 is about 0.693, the exact expression is close to 69.3 divided by the rate in percent. The approximation uses 72 instead of 69.3 because 72 divides evenly by more integers, and because the substitution error and the rounding error partly cancel in the 6% to 10% range.\n\nAccuracy: at 8% the rule gives 9.00 periods against an exact 9.01. At 2% it gives 36.0 against 35.0. At 30% it gives 2.40 against 2.64.",
    formula: "n = ln(2)/ln(1 + r)",
    formulaNote: "n = periods to double · r = rate per period · approximation: n ≈ 72 ÷ rate%",
    gotcha:
      "The error grows with the rate, and it understates the true doubling time at every rate above roughly 8%.",
    source: "Standard approximation to the logarithmic doubling-time identity",
    worked: () => {
      const r7 = rule72(7);
      const r25 = rule72(25);
      return {
        text: `At 7% per year a balance doubles in ${r7.exact.toFixed(2)} years; the rule estimates ${r7.approx.toFixed(2)}. At a 25% card rate an unpaid balance doubles in ${r25.exact.toFixed(2)} years; the rule estimates ${r25.approx.toFixed(2)}.`,
        data: [
          { label: "7%, exact", value: `${r7.exact.toFixed(2)} yrs` },
          { label: "7%, rule of 72", value: `${r7.approx.toFixed(2)} yrs` },
          { label: "25%, exact", value: `${r25.exact.toFixed(2)} yrs` },
        ],
      };
    },
  },
  {
    id: "present-value",
    name: "Present value",
    aliases: ["discounting", "pv", "discount rate", "time value of money"],
    oneLine: "The amount that, invested today at a stated rate, would grow to a specified future sum.",
    plain:
      "Present value is the inverse of compounding. If $100 today grows to $107 in a year at 7%, then $107 received in a year has a present value of $100 at a 7% discount rate. Discounting converts amounts arriving at different dates into amounts at a single date, which is the only way to compare them.\n\nThe discount rate represents the return available on an alternative use of the money at comparable risk. A higher discount rate produces a lower present value, and the effect compounds with time: at 10%, a payment 20 years out is worth 15 cents on the dollar.",
    formula: "PV = FV/(1 + r)^n",
    formulaNote: "PV = value today · FV = amount received later · r = discount rate per period · n = periods until received",
    gotcha:
      "The discount rate is an assumption, not an observation, and the output is highly sensitive to it. Lowering the rate raises the valuation of any long-dated cash flow, so the choice of rate can determine the conclusion.",
    source: "Aswath Damodaran, NYU Stern — valuation lecture notes and datasets, published free",
    reading: "Aswath Damodaran, Investment Valuation",
  },
  {
    id: "opportunity-cost",
    name: "Opportunity cost",
    aliases: ["opportunity", "what else could i do with it", "cost of buying"],
    oneLine: "The value of the most valuable alternative given up when money is committed to one use.",
    plain:
      "Spending money on one thing eliminates every other use of that money, including investing it. The full cost of a purchase is therefore its price plus the return the same amount would have produced elsewhere over the period being considered.\n\nThe size of that second component depends entirely on the horizon, because it compounds. At 7%, money committed today is doubled in value forgone after 10 years and roughly septupled after 30.",
    formula: "forgone = amount(1 + r)^n − amount",
    formulaNote: "forgone = value given up · r = return available elsewhere · n = periods held",
    gotcha:
      "It applies symmetrically to money left in cash and to time. Holding cash at 0.5% while inflation runs at 3% has a measurable opportunity cost, and so does spending three hours to save $12.",
    source: "Standard economics; framing per U.S. SEC investor education",
    worked: () => {
      const ten = opportunityCost(200, 10, 7);
      const thirty = opportunityCost(200, 30, 7);
      return {
        text: `$200 committed today, against a 7% alternative return: ${money(ten.future)} forgone value after 10 years, of which ${money(ten.forgone)} is return that was given up. After 30 years the same $200 corresponds to ${money(thirty.future)}.`,
        data: [
          { label: "$200 over 10 yrs", value: money(ten.future) },
          { label: "$200 over 30 yrs", value: money(thirty.future) },
        ],
      };
    },
  },
  {
    id: "inflation",
    name: "Inflation and real return",
    aliases: ["real return", "purchasing power", "inflation adjusted", "nominal vs real"],
    oneLine: "Nominal return is the change in the number of dollars; real return is the change in what those dollars buy.",
    plain:
      "Inflation is the rate at which the general price level rises, which is the rate at which a fixed number of dollars buys less. A return of 5% while prices rise 3% leaves you able to buy about 1.94% more, not 2% more.\n\nThe exact relationship divides rather than subtracts, because both quantities are ratios: multiply the balance by (1 + nominal) and divide by (1 + inflation) to get purchasing power. Subtraction is a first-order approximation that overstates the real return, and the overstatement grows as both rates rise.",
    formula: "real = (1 + nominal)/(1 + inflation) − 1",
    formulaNote: "all three expressed as decimals · approximation: real ≈ nominal − inflation",
    gotcha:
      "Real return can be negative while nominal return is positive. A deposit account paying 0.5% against 3% inflation loses 2.43% of purchasing power per year while the statement balance increases.",
    source: "Fisher equation; U.S. inflation measured by the Federal Reserve (FRED), series CPIAUCSL",
    worked: () => {
      const r = realReturn(5, 3);
      const savings = realReturn(0.5, 3);
      return {
        text: `5% nominal against 3% inflation is ${pct(r.real)} real. Subtracting gives ${pct(r.naive)}, overstating it by ${pct(r.naive - r.real)}. A 0.5% account against the same 3% inflation returns ${pct(savings.real)} real.`,
        data: [
          { label: "5% nominal, real", value: pct(r.real) },
          { label: "Subtraction estimate", value: pct(r.naive) },
          { label: "0.5% account, real", value: pct(savings.real) },
        ],
      };
    },
  },

  // ── Rates and debt ────────────────────────────────────────────────────────
  {
    id: "apr-apy",
    name: "APR vs APY",
    aliases: ["apr", "apy", "annual percentage rate", "annual percentage yield", "effective rate"],
    oneLine: "APR is the periodic rate multiplied by the number of periods per year; APY is the actual annual growth once each period's interest compounds.",
    plain:
      "APR is a quoted rate that ignores compounding. A card at 24.99% APR charges 24.99 ÷ 365 = 0.0685% per day, and the APR is simply that daily rate multiplied back by 365.\n\nAPY is the proportion by which a balance actually changes over twelve months, with each day's interest included in the base for the next day. Because each day compounds on a slightly larger balance, APY exceeds APR for any positive rate compounded more than once a year. At 24.99% APR compounded daily, APY is 28.39%.\n\nThe two describe the same underlying rate. Lenders in the United States are required to disclose APR, which is the smaller of the two figures. Deposit accounts advertise APY, which is the larger.",
    formula: "APY = (1 + APR/n)^n − 1",
    formulaNote: "n = compounding periods per year · daily compounding is n = 365",
    gotcha:
      "The gap widens as the rate rises. At 5% APR the difference is 0.13 percentage points; at 25% it is 3.4. On a carried card balance that gap is roughly one extra month of interest per year, and it is never the number quoted to you.",
    source: "U.S. Consumer Financial Protection Bureau — APR and APY definitions (Regulation Z)",
    worked: (ctx) => {
      const apr = ctx.apr ?? 24.99;
      const apy = aprToApy(apr);
      const bal = Math.max(1000, ctx.debt);
      return {
        text: `${pct(apr)} APR compounded daily is ${pct(apy)} APY. On a ${money(bal)} balance carried for a year with no payments, that is ${money((bal * apy) / 100)} of interest rather than the ${money((bal * apr) / 100)} the quoted rate implies — a difference of ${money((bal * (apy - apr)) / 100)}.`,
        data: [
          { label: "Quoted APR", value: pct(apr) },
          { label: "Actual APY", value: pct(apy) },
          { label: `Interest on ${money(bal)}`, value: money((bal * apy) / 100) },
        ],
      };
    },
  },
  {
    id: "minimum-payment",
    name: "Minimum payments",
    aliases: ["minimum payment", "paying the minimum", "min payment"],
    oneLine: "A required monthly payment set as a percentage of the balance or a fixed floor, whichever is larger.",
    plain:
      "A typical minimum is 1% to 3% of the statement balance plus that month's interest and fees, subject to a floor of $25 to $35. Because the percentage is applied to a balance that shrinks each month, the required payment also shrinks, and the proportion of it consumed by interest stays high for years.\n\nPaying a fixed dollar amount instead — equal to today's minimum, never reduced — changes the arithmetic substantially, because every subsequent month sends a larger share to principal. The monthly cost is identical in the first month and lower in every month after.",
    formula: "minimum = max(floor, balance × rate)",
    formulaNote: "rate is typically 0.01 to 0.03 · floor is typically 25 to 35 dollars",
    gotcha:
      "If the required payment is less than or equal to the month's interest, the balance does not fall at all. This is possible at high rates on small payments, and no schedule of minimum payments will ever retire the debt.",
    source: "U.S. Consumer Financial Protection Bureau — credit card repayment disclosures (CARD Act)",
    worked: (ctx) => {
      const bal = Math.max(1000, Math.round(ctx.debt));
      const apr = ctx.apr ?? 24.99;
      const min = payoffWithMinimums(bal, apr);
      if (min.neverPaysOff) {
        return { text: `At ${pct(apr)} on ${money(bal)}, the minimum payment does not exceed the monthly interest, so the balance never reaches zero.` };
      }
      const fixed = payoffWithPayment(bal, apr, Math.max(25, bal * 0.02));
      return {
        text: `${money(bal)} at ${pct(apr)}, paying only the declining minimum: ${Math.round(min.months)} months and ${money(min.totalInterest)} of interest, for ${money(min.totalPaid)} repaid in total. Paying a fixed ${money(Math.max(25, bal * 0.02))} — the same amount as the first minimum — clears it in ${Math.round(fixed.months)} months with ${money(fixed.totalInterest)} of interest.`,
        data: [
          { label: "Declining minimum", value: `${Math.round(min.months)} mo · ${money(min.totalInterest)}` },
          { label: "Fixed payment", value: `${Math.round(fixed.months)} mo · ${money(fixed.totalInterest)}` },
          { label: "Difference", value: money(min.totalInterest - fixed.totalInterest) },
        ],
      };
    },
  },
  {
    id: "avalanche-snowball",
    name: "Avalanche and snowball",
    aliases: ["avalanche", "snowball", "debt payoff order", "which debt first"],
    oneLine: "Two orderings for directing spare payment across multiple debts: by highest interest rate, or by smallest balance.",
    plain:
      "Both methods pay the required minimum on every debt and direct all remaining money at one target debt. They differ only in which debt is targeted first.\n\nAvalanche targets the highest interest rate. This minimises total interest paid, because every spare dollar is removed from the balance accruing fastest. The result is arithmetic and holds in every case.\n\nSnowball targets the smallest balance. This clears individual debts earlier, reducing the number of open accounts sooner, at the cost of paying more total interest. The size of that cost varies: when rates across the debts are similar it is negligible, and when they differ sharply it is large.",
    formula: "spare = budget − Σ minimums",
    formulaNote: "spare is applied entirely to the target debt · order of targets is what differs",
    gotcha:
      "The comparison is only meaningful when the budget exceeds the sum of the minimums. If it does not, no spare payment exists, both methods reduce to paying minimums, and the two produce identical results.",
    source: "Avalanche follows from interest arithmetic; snowball's completion effect per behavioural research on sub-goal attainment",
    reading: "Morgan Housel, The Psychology of Money",
  },
  {
    id: "amortization",
    name: "Amortisation",
    aliases: ["amortize", "amortisation", "loan schedule", "how loans work"],
    oneLine: "Repayment of a loan through a fixed periodic payment split between interest and principal, where the split shifts toward principal over time.",
    plain:
      "The payment amount is constant. Each period, interest is calculated on the outstanding balance and deducted from the payment; the remainder reduces the balance. Because the balance is highest at the start, the interest portion is largest in the first payment and declines monotonically thereafter, while the principal portion rises.\n\nOn a 30-year loan at 5%, the first payment is roughly 78% interest. The crossover, where principal first exceeds interest, occurs around year 14. The final payment is almost entirely principal.",
    formula: "PMT = (P × r)/(1 − (1 + r)^(−n))",
    formulaNote: "PMT = payment per period · P = principal · r = rate per period · n = total periods",
    gotcha:
      "An extra payment applied early removes more total interest than the same payment applied late, because it eliminates the interest that the removed principal would have accrued in every remaining period.",
    source: "U.S. Consumer Financial Protection Bureau — loan amortisation disclosures",
  },
  {
    id: "credit-utilization",
    name: "Credit utilisation",
    aliases: ["utilization", "utilisation", "credit usage", "how much of my limit"],
    oneLine: "Reported balance divided by credit limit, accounting for approximately 30% of a FICO score.",
    plain:
      "Utilisation is calculated both per card and across all revolving accounts combined. The figure used is the balance reported to the credit bureaus, which for most issuers is the statement closing balance — not the balance after you pay, and not the balance on any particular day you check.\n\nPublished guidance places the threshold at 30%, below which scores are not materially penalised, with measurable additional benefit below 10%. Utilisation carries no memory: it is recalculated from each month's report, so a high month affects the score while it is reported and stops affecting it once a lower figure replaces it.",
    formula: "utilisation = balance/limit",
    formulaNote: "computed per card and in aggregate · balance is the amount reported to the bureaus",
    gotcha:
      "Paying the statement in full every month does not produce low utilisation, because the statement balance is what gets reported. Reducing the balance before the statement closing date is what changes the reported figure.",
    source: "FICO — published score composition; U.S. CFPB consumer guidance",
    worked: (ctx) => {
      if (ctx.utilization == null) {
        return { text: "Utilisation cannot be calculated: no credit limits are recorded against your accounts. Adding a limit to each card produces this figure." };
      }
      const u = ctx.utilization * 100;
      const band = u > 30 ? "above the 30% threshold, where scoring models apply a penalty" : u > 10 ? "below the 30% threshold but above 10%, where a further improvement is available" : "below 10%, the band that scores highest";
      return {
        text: `Reported utilisation is ${pct(u)}, ${band}.`,
        data: [{ label: "Utilisation", value: pct(u) }],
      };
    },
  },
  {
    id: "dti",
    name: "Debt-to-income",
    aliases: ["debt to income", "dti"],
    oneLine: "Total monthly debt payments divided by gross monthly income, expressed as a percentage.",
    plain:
      "The numerator counts required minimum payments on all debts, including housing, instalment loans and revolving credit. The denominator is income before tax. Lenders use it to test whether an additional payment can be sustained.\n\nCommon thresholds: 36% or below is treated as unconstrained, 43% is the upper limit for a qualified mortgage under U.S. rules, and above that most underwriting declines.",
    formula: "DTI = payments/income",
    formulaNote: "payments = required monthly minimums · income = gross, before tax",
    gotcha:
      "It measures required payments, not balances. A large balance with a small required payment produces a low ratio, so a good DTI is consistent with a large and expensive debt.",
    source: "U.S. Consumer Financial Protection Bureau — ability-to-repay standards",
    worked: (ctx) => {
      if (ctx.income <= 0) return null;
      const payments = Math.max(25, ctx.debt * 0.02);
      const ratio = debtToIncome(payments, ctx.income);
      return {
        text: `${money(payments)} of estimated minimum payments against ${money(ctx.income)} of monthly income is a ratio of ${pct(ratio)}.`,
        data: [{ label: "DTI", value: pct(ratio) }],
      };
    },
  },
  {
    id: "bnpl",
    name: "Fee-based short-term credit",
    aliases: ["bnpl", "klarna", "afterpay", "affirm", "pay in 4", "payday loan"],
    oneLine: "Credit priced as a flat fee over a short term, which converts to a high annualised rate.",
    plain:
      "A fee of $5 on $100 repaid in 14 days is a 5% charge for 1/26th of a year. Annualised, that is 130%. The fee is small in absolute terms and large as a rate, and the rate is what permits comparison against any other borrowing.\n\nConverting requires two steps: divide the fee by the principal to get the periodic rate, then multiply by the number of such periods in a year.",
    formula: "APR = (fee/principal) × (365/days) × 100",
    formulaNote: "days = length of the repayment term · result is a simple annualised rate, before compounding",
    gotcha:
      "Instalment plans advertised at 0% interest generate revenue from late fees and from increased purchase volume. The absence of interest does not make the arrangement free, and splitting a price into four payments measurably raises the amount people spend.",
    source: "U.S. Consumer Financial Protection Bureau — buy now, pay later market reports",
  },

  // ── Saving and independence ───────────────────────────────────────────────
  {
    id: "savings-rate",
    name: "Savings rate",
    aliases: ["save rate", "how much should i save", "percentage saved"],
    oneLine: "The fraction of income not spent, expressed as a percentage of income.",
    plain:
      "Savings rate determines time to financial independence more directly than income does, because it sets both quantities that matter: the amount accumulated per year, and the annual spending the accumulated amount must eventually support.\n\nA person saving 10% of income spends 90%, so each year of work funds roughly one-ninth of a year of spending. A person saving 50% spends 50%, so each year of work funds roughly one year. Investment returns shorten both timelines, but the ratio between them is set by the rate alone and is independent of the income level.",
    formula: "rate = (income − spending)/income",
    formulaNote: "measured over the same period · both figures after tax",
    gotcha:
      "The rate, not the amount, is the operative quantity. An income increase that is entirely spent raises the amount saved by zero and leaves the timeline unchanged; an income increase that is entirely saved raises the rate and shortens it.",
    source: "Arithmetic of the savings-rate and withdrawal-rate relationship",
    reading: "Vicki Robin & Joe Dominguez, Your Money or Your Life",
    worked: (ctx) => {
      if (ctx.income <= 0) return null;
      const rate = ((ctx.income - ctx.expense) / ctx.income) * 100;
      return {
        text: `${money(ctx.income - ctx.expense)} retained from ${money(ctx.income)} of monthly income is a rate of ${pct(rate)}.`,
        data: [
          { label: "Savings rate", value: pct(rate) },
          { label: "Retained monthly", value: money(ctx.income - ctx.expense) },
        ],
      };
    },
  },
  {
    id: "safe-withdrawal",
    name: "The 4% rule",
    aliases: ["safe withdrawal rate", "4 percent rule", "fire", "financial independence", "retire early", "swr"],
    oneLine: "A finding that withdrawing 4% of a portfolio's starting value, adjusted annually for inflation, survived every 30-year period in the U.S. historical record.",
    plain:
      "Bengen tested fixed withdrawal rates against actual U.S. stock and bond returns for every 30-year window since 1926. At 4% of the initial balance, increased each year by inflation, no window ran out of money. At 5%, some did.\n\nInverting the rate gives a target: annual spending divided by 0.04, which is 25 times annual spending. The test assumed a portfolio of 50% to 75% stocks and ignored taxes and investment fees.",
    formula: "target = spending/0.04",
    formulaNote: "equivalently target = spending × 25 · withdrawals rise with inflation, not with portfolio value",
    gotcha:
      "It is a statement about one country's historical record over 30-year horizons, not a guaranteed rate. A retirement longer than 30 years, poor returns in the opening years, or taxes and fees not modelled in the study all reduce the rate that would have survived.",
    source: "Bengen, W. (1994), 'Determining Withdrawal Rates Using Historical Data', Journal of Financial Planning; extended by Cooley, Hubbard & Walz (1998), the Trinity Study",
    worked: (ctx) => {
      if (ctx.expense <= 0) return null;
      const annualSpend = ctx.expense * 12;
      const fi = yearsToIndependence({
        annualIncome: ctx.income * 12,
        annualSpending: annualSpend,
        currentSavings: Math.max(0, ctx.cash),
      });
      return {
        text: `Annual spending of ${money(annualSpend)} implies a target of ${money(fi.target)}. ${fi.reachable ? `At the current savings rate of ${pct(fi.savingsRate * 100)} and a 7% assumed return, that target is reached in ${yrs(fi.years)}.` : "Current spending equals or exceeds income, so no accumulation is occurring and no timeline can be computed."}`,
        data: [
          { label: "Annual spending", value: money(annualSpend) },
          { label: "Target (25×)", value: money(fi.target) },
          { label: "Years at this rate", value: yrs(fi.years) },
        ],
      };
    },
  },
  {
    id: "emergency-fund",
    name: "Emergency fund and runway",
    aliases: ["emergency fund", "runway", "how long can i survive", "buffer"],
    oneLine: "Cash held in an immediately accessible account, measured as the number of months of expenses it covers.",
    plain:
      "The quantity held is expressed in months rather than dollars, because the requirement scales with spending. Common guidance is three to six months of expenses, extending to twelve where income is irregular.\n\nIt is held in cash or an equivalent deposit account rather than invested. The purpose is availability at a specific moment, not return, and its function is to prevent an unexpected expense from being financed at credit card rates.",
    formula: "runway = cash/monthly expenses",
    formulaNote: "expenses = required monthly outgoings · cash = balances available immediately without penalty",
    gotcha:
      "Holding it in stocks defeats the function. Job losses cluster in recessions, which is when equity prices are depressed, so the money would be withdrawn at the point of maximum loss.",
    source: "U.S. Consumer Financial Protection Bureau — emergency savings guidance",
    worked: (ctx) => {
      if (ctx.expense <= 0) return null;
      const months = runwayMonths(ctx.cash, ctx.expense);
      const band = months < 3 ? "below the three-month guideline" : months < 6 ? "within the three-to-six-month guideline" : "above the six-month guideline";
      return {
        text: `${money(ctx.cash)} of cash against ${money(ctx.expense)} of monthly expenses covers ${months.toFixed(1)} months, ${band}.`,
        data: [{ label: "Runway", value: `${months.toFixed(1)} months` }],
      };
    },
  },
  {
    id: "lifestyle-inflation",
    name: "Lifestyle inflation",
    aliases: ["lifestyle creep", "spending creep"],
    oneLine: "An increase in spending that follows an increase in income, holding the savings rate constant.",
    plain:
      "When income rises and spending rises by the same proportion, the savings rate is unchanged and the time to any accumulation target is unchanged. The absolute amount saved may rise while the timeline does not move, because the target itself rises with spending.\n\nThe documented mechanism is hedonic adaptation: satisfaction from a higher consumption level declines toward its prior baseline within months, so the increased spending produces a temporary rather than permanent change in reported wellbeing.",
    formula: "Δtimeline = 0 when Δspending/Δincome = spending/income",
    formulaNote: "spending rising in proportion to income leaves the savings rate, and therefore the timeline, unchanged",
    gotcha:
      "Because the effect operates through the savings rate, it is invisible in the account balance, which still rises. The measurement that detects it is the rate, not the amount.",
    source: "Behavioural research on hedonic adaptation and income",
    reading: "Morgan Housel, The Psychology of Money",
  },

  // ── Investing ─────────────────────────────────────────────────────────────
  {
    id: "index-fund",
    name: "Index funds",
    aliases: ["index", "etf", "s&p 500", "passive investing", "vti", "voo"],
    oneLine: "A fund that holds every security in a specified index in the index's own proportions, with no security selection.",
    plain:
      "Because holdings are determined mechanically by the index rules, no research staff is required, turnover is low, and the management fee is correspondingly small — commonly 0.03% to 0.20% per year against 0.50% to 1.00% for actively managed funds.\n\nThe empirical case rests on the S&P Dow Jones SPIVA scorecards, which measure active funds against their benchmarks. Over 15-year horizons, the large majority of active U.S. equity funds underperform their benchmark after fees, and the specific funds that will outperform are not identifiable in advance from past performance.",
    formula: "return = index return − expense ratio − tracking error",
    formulaNote: "no security selection means the only controllable term is the fee",
    gotcha:
      "It removes the risk of individual securities, not the risk of the market. An S&P 500 fund holds 500 companies and still falls by the full amount when the index falls. Diversification within one asset class is not diversification across asset classes.",
    source: "U.S. SEC, Investor.gov — mutual funds and ETFs; S&P Dow Jones Indices SPIVA scorecards",
    reading: "John Bogle, The Little Book of Common Sense Investing; Burton Malkiel, A Random Walk Down Wall Street",
  },
  {
    id: "expense-ratio",
    name: "Expense ratio",
    aliases: ["fees", "fund fees", "management fee", "ter"],
    oneLine: "The annual percentage of assets a fund deducts to cover its operating costs, charged regardless of performance.",
    plain:
      "The fee is deducted from fund assets continuously and is already reflected in the reported share price, so it never appears as a separate charge. A 1.00% ratio reduces the balance by 1.00% each year.\n\nBecause the deduction applies to the whole balance every year, its effect compounds in the same way returns do. Over 30 years, a 1.00% fee against a 0.03% fee removes roughly a quarter of the ending balance.",
    formula: "net = gross − fee",
    formulaNote: "applied every period to the full balance, so the shortfall compounds",
    gotcha:
      "Fees are certain and returns are not, which makes the fee the only term in the expression that can be controlled with certainty.",
    source: "U.S. SEC, Investor.gov — mutual fund fees and expenses",
    worked: () => {
      const cheap = futureValue(10000, 0.07 - 0.0003, 30);
      const dear = futureValue(10000, 0.07 - 0.01, 30);
      return {
        text: `$10,000 over 30 years at a 7% gross return: ${money(cheap)} at a 0.03% fee, ${money(dear)} at a 1.00% fee. The 0.97 percentage point difference removes ${money(cheap - dear)}, which is ${Math.round(((cheap - dear) / cheap) * 100)}% of the ending balance.`,
        data: [
          { label: "0.03% fee", value: money(cheap) },
          { label: "1.00% fee", value: money(dear) },
          { label: "Difference", value: money(cheap - dear) },
        ],
      };
    },
  },
  {
    id: "diversification",
    name: "Diversification",
    aliases: ["diversify", "spread risk", "portfolio", "asset allocation"],
    oneLine: "Combining assets whose returns are imperfectly correlated, which lowers portfolio variance without a proportional reduction in expected return.",
    plain:
      "Markowitz showed that portfolio variance depends on the covariance between holdings, not only on each holding's own variance. When two assets are less than perfectly correlated, the variance of the combination is lower than the weighted average of the two individual variances.\n\nExpected return, by contrast, is exactly the weighted average of the components. Because risk falls faster than return, combining imperfectly correlated assets improves the ratio of return to risk. This is the only mechanism in portfolio construction that improves that ratio without requiring a forecast.",
    formula: "σ_p^2 = w_1^2 σ_1^2 + w_2^2 σ_2^2 + 2 w_1 w_2 ρ σ_1 σ_2",
    formulaNote: "σ = standard deviation · w = portfolio weight · ρ = correlation between the two assets",
    gotcha:
      "The benefit is a function of correlation, not of the number of holdings. Thirty technology stocks are highly correlated with one another and provide little of it. Correlations also rise during market declines, which reduces the benefit at the moment it is most needed.",
    source: "Markowitz, H. (1952), 'Portfolio Selection', Journal of Finance 7(1)",
    reading: "Burton Malkiel, A Random Walk Down Wall Street",
  },
  {
    id: "dca",
    name: "Dollar-cost averaging",
    aliases: ["dca", "dollar cost averaging", "buying regularly"],
    oneLine: "Investing a fixed dollar amount at fixed intervals, independent of price.",
    plain:
      "A fixed dollar amount buys more shares when the price is low and fewer when it is high, so the average cost per share is the harmonic mean of the prices paid, which is always less than or equal to their arithmetic mean.\n\nThe effect is mechanical and modest. The larger documented benefit is procedural: a fixed schedule removes the decision of when to buy, and timing decisions are a measurable source of underperformance in retail accounts.",
    formula: "avg cost = total invested/total shares",
    formulaNote: "equals the harmonic mean of prices paid, which is at or below their arithmetic mean",
    gotcha:
      "Applied to a lump sum already held, dollar-cost averaging underperforms immediate investment about two-thirds of the time, because markets rise in most periods and the uninvested remainder earns nothing. It reduces the variance of the outcome, not its expected value.",
    source: "U.S. SEC, Investor.gov — dollar cost averaging",
  },
  {
    id: "risk-return",
    name: "Risk and return",
    aliases: ["risk", "volatility", "standard deviation", "risk tolerance"],
    oneLine: "Expected return above the risk-free rate is compensation for accepting dispersion in outcomes.",
    plain:
      "Risk in finance is measured as dispersion — the standard deviation of returns around their mean — and includes outcomes above the mean as well as below. An asset with a wider distribution must offer a higher expected return, or no one holding a diversified portfolio would choose it over the alternative.\n\nThat premium is an expectation across many outcomes, not a floor on any single one. Over any specific period, a higher-risk asset can and does return less than a lower-risk one; that possibility is what the premium is paid for.",
    formula: "expected return = risk-free rate + β × market premium",
    formulaNote: "β = sensitivity to market movements · the premium is expected, not guaranteed",
    gotcha:
      "Dispersion only translates into realised loss if the position must be sold during a decline. Over long horizons with no forced sale, holding cash carries a different and more certain risk: a negative real return every year that inflation exceeds the deposit rate.",
    source: "Aswath Damodaran, NYU Stern — equity risk premium datasets, published annually",
    reading: "Benjamin Graham, The Intelligent Investor",
  },
  {
    id: "npv-irr",
    name: "NPV and IRR",
    aliases: ["npv", "irr", "net present value", "internal rate of return", "is this worth it"],
    oneLine: "Two decision rules for a series of dated cash flows: the value created at a required rate, and the rate at which value created is zero.",
    plain:
      "Net present value discounts every cash flow to the present at a chosen rate and sums them. A positive NPV means the series produces more than the required rate, so it creates value; a negative NPV means it does not.\n\nInternal rate of return is the discount rate at which NPV equals zero. It is expressed as a single percentage and requires no rate to be chosen in advance, which is why it is widely quoted.",
    formula: "NPV = Σ_(t=0)^n (CF_t/(1 + r)^t)",
    formulaNote: "CF_t = cash flow at time t · CF_0 is normally the negative up-front cost · IRR is the r where NPV = 0",
    gotcha:
      "IRR has two defects NPV does not. A series whose cash flows change sign more than once can have multiple valid IRRs or none, and IRR implicitly assumes interim cash flows are reinvested at the IRR itself, which overstates returns on high-IRR projects. Where the two rules disagree, NPV is correct.",
    source: "Aswath Damodaran, NYU Stern — corporate finance lecture notes, published free",
    reading: "Aswath Damodaran, Investment Valuation",
  },

  // ── Tax ───────────────────────────────────────────────────────────────────
  {
    id: "marginal-tax",
    name: "Marginal and effective tax rates",
    aliases: ["tax bracket", "marginal rate", "effective rate", "tax brackets"],
    oneLine: "The marginal rate applies to the last dollar earned; the effective rate is total tax divided by total income.",
    plain:
      "Income tax is assessed in bands. Income within each band is taxed at that band's rate, and only income above a threshold is taxed at the higher rate that begins there. Crossing into a 22% band means the portion above the threshold is taxed at 22%; every dollar below it continues to be taxed at the lower rates.\n\nThe effective rate is therefore always lower than the marginal rate whenever any income falls in a lower band, which is the case for everyone above the first threshold.",
    formula: "effective = total tax/total income",
    formulaNote: "marginal = the rate applied to the next dollar earned · effective is always the lower of the two",
    gotcha:
      "A raise cannot reduce take-home pay through bracket movement. Only the income above the threshold is taxed at the higher rate, so additional gross income always produces additional net income. Benefit phase-outs, which are separate from tax brackets, can produce that effect.",
    source: "U.S. Internal Revenue Service — tax rate schedules (public domain)",
  },
  {
    id: "capital-gains",
    name: "Capital gains",
    aliases: ["capital gain", "long term gains", "short term gains", "tax on investments"],
    oneLine: "Profit realised on the sale of an asset, taxed at a lower rate if the holding period exceeded one year.",
    plain:
      "The gain is the sale price minus the cost basis. Tax is assessed only on sale; unrealised appreciation is not taxed regardless of size.\n\nAssets held one year or less produce short-term gains, taxed as ordinary income at the marginal rate. Assets held more than one year produce long-term gains, taxed at 0%, 15% or 20% depending on total income.",
    formula: "gain = sale price − cost basis",
    formulaNote: "holding period over one year qualifies for the long-term rate · measured from the day after acquisition",
    gotcha:
      "The holding period is a threshold, not a gradient. A sale one day before the one-year mark taxes the entire gain at the ordinary rate, which for most people is a difference of 10 to 20 percentage points on the whole amount.",
    source: "U.S. Internal Revenue Service, Publication 550 (public domain)",
  },
  {
    id: "tax-advantaged",
    name: "Tax-advantaged accounts",
    aliases: ["401k", "ira", "roth", "retirement account", "hsa"],
    oneLine: "Accounts in which investment growth is untaxed, in exchange for restrictions on withdrawal.",
    plain:
      "Traditional accounts deduct contributions from taxable income in the year they are made and tax withdrawals as ordinary income later. Roth accounts take contributions from after-tax income and make qualified withdrawals untaxed, including all growth.\n\nWhich is preferable depends on the marginal rate now against the expected marginal rate at withdrawal. A lower current rate favours Roth. Employer matching contributions are an immediate return equal to the match percentage, independent of investment performance.",
    formula: "Roth advantage when rate_now < rate_at_withdrawal",
    formulaNote: "traditional defers tax to withdrawal · Roth pays it now and exempts all subsequent growth",
    gotcha:
      "Withdrawals before age 59½ generally incur a 10% penalty in addition to any tax, with specific exceptions. The tax treatment is granted in exchange for that restriction.",
    source: "U.S. Internal Revenue Service, Publications 590-A and 590-B (public domain)",
  },

  // ── Reading your own books ────────────────────────────────────────────────
  {
    id: "cash-flow",
    name: "Cash flow and profit",
    aliases: ["cash flow", "profit", "burn rate", "net income"],
    oneLine: "Profit records income when earned and costs when incurred; cash flow records money on the date it moves.",
    plain:
      "Accrual accounting recognises revenue when it is earned and expenses when they are incurred, regardless of payment dates. Cash accounting records both only when money actually moves.\n\nThe two diverge whenever payment timing differs from the underlying activity. Invoiced revenue not yet collected raises profit and not cash. A prepaid annual expense reduces cash immediately and profit gradually.",
    formula: "cash flow = receipts − payments",
    formulaNote: "measured over a period · profit uses the same period but different recognition dates",
    gotcha:
      "Only the cash balance determines whether a payment can be made on a given date. A profitable position with receivables outstanding and no cash cannot meet obligations, which is the mechanism behind most insolvencies.",
    source: "Standard accounting distinction; U.S. SEC financial statement guidance",
    worked: (ctx) => ({
      text: `Recorded this month: ${money(ctx.income)} received, ${money(ctx.expense)} paid, net movement ${money(ctx.cashFlow)}. These are dates on which money actually moved.`,
      data: [
        { label: "Received", value: money(ctx.income) },
        { label: "Paid", value: money(ctx.expense) },
        { label: "Net", value: money(ctx.cashFlow) },
      ],
    }),
  },
  {
    id: "net-worth",
    name: "Net worth",
    aliases: ["networth", "what am i worth"],
    oneLine: "Total assets minus total liabilities, measured at a single point in time.",
    plain:
      "Assets are everything owned that has a market value; liabilities are everything owed. The difference is a stock, measured on a date, as distinct from income, which is a flow measured over a period.\n\nThe two are independent. High income with spending that matches it produces no change in net worth, and negative net worth is common at high income levels where borrowing funds consumption. The direction of the figure across successive measurements carries the information; its level at any one date does not.",
    formula: "net worth = assets − liabilities",
    formulaNote: "assets at current market value · liabilities at outstanding balance",
    source: "U.S. Federal Reserve — Survey of Consumer Finances methodology",
    worked: (ctx) => ({
      text: `${money(ctx.cash)} of recorded assets minus ${money(ctx.debt)} of recorded liabilities is ${money(ctx.worth)}.`,
      data: [{ label: "Net worth", value: money(ctx.worth) }],
    }),
  },
  {
    id: "sunk-cost",
    name: "Sunk cost",
    aliases: ["sunk cost", "throwing good money after bad"],
    oneLine: "Expenditure already incurred and unrecoverable, which is therefore irrelevant to any subsequent decision.",
    plain:
      "A cost is sunk when no available decision changes it. Since it is identical across every option, it cannot distinguish between them, and including it in the comparison is a logical error.\n\nThe correct comparison is between future costs and future benefits from the current position forward. Arkes and Blumer demonstrated experimentally that people systematically fail to exclude sunk costs, continuing to invest in worse options specifically because more had already been spent on them.",
    formula: "decide on: future benefit − future cost",
    formulaNote: "amounts already spent appear in neither term",
    gotcha:
      "The error is commonly expressed as commitment or consistency — 'I have already put this much in' — which makes it resistant to correction, since the reasoning presents itself as a virtue.",
    source: "Arkes, H. & Blumer, C. (1985), 'The Psychology of Sunk Cost', Organizational Behavior and Human Decision Processes 35(1)",
  },
  {
    id: "loss-aversion",
    name: "Loss aversion",
    aliases: ["loss averse", "prospect theory", "why losing hurts"],
    oneLine: "A measured asymmetry in which losses are weighted roughly twice as heavily as gains of equal size.",
    plain:
      "Kahneman and Tversky found that the disutility of a loss is approximately 2 to 2.5 times the utility of a gain of the same magnitude, and that outcomes are evaluated as changes from a reference point rather than as final states.\n\nThis predicts specific behaviours: rejecting a bet with positive expected value because the loss looms larger, selling appreciated positions early to realise a gain, and holding depreciated positions to avoid realising a loss.",
    formula: "λ ≈ 2 to 2.5",
    formulaNote: "λ = the ratio by which loss is weighted against an equal gain · outcomes measured from a reference point",
    gotcha:
      "Awareness does not remove the effect; it is a property of how outcomes are evaluated, not a reasoning error that can be corrected by knowing about it. Structural measures — automatic transfers, a written policy fixed in advance — change the behaviour where intention does not.",
    source: "Kahneman, D. & Tversky, A. (1979), 'Prospect Theory: An Analysis of Decision under Risk', Econometrica 47(2)",
    reading: "Daniel Kahneman, Thinking, Fast and Slow",
  },
  {
    id: "liquidity",
    name: "Liquidity",
    aliases: ["liquid", "illiquid", "how fast can i sell"],
    oneLine: "The speed at which an asset can be converted to cash at close to its quoted value.",
    plain:
      "Liquidity has two components: the time required to complete a sale, and the discount to quoted value required to complete it in that time. A deposit balance converts instantly at full value. A listed fund settles in one to two business days at the market price. A car sells in weeks at full value or in days at a discount.\n\nIlliquidity is compensated: illiquid assets generally offer higher expected returns because buyers require payment for accepting the constraint.",
    formula: "cost of liquidity = quoted value − price achievable now",
    formulaNote: "rises as the required sale window shortens",
    gotcha:
      "Quoted value and realisable value are different figures, and they diverge most during forced sales, when the seller's time constraint is binding and buyers are aware of it.",
    source: "U.S. SEC, Investor.gov — liquidity risk",
  },
];

const BY_ID = new Map(CONCEPTS.map((c) => [c.id, c]));

export function conceptById(id: string): Concept | undefined {
  return BY_ID.get(id);
}

/** Same normalisation for questions and aliases, so both sides compare fairly. */
function normaliseTerm(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s%]/g, " ").replace(/\s+/g, " ").trim();
}

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Find the concept a question is asking about.
 * Longer alias matches win, so "credit utilization" beats a bare "credit".
 *
 * Matching is on whole words. Substring matching looks fine until a
 * three-letter alias like "ter" fires inside "quarterly" or "helicopter".
 */
export function findConcept(question: string): Concept | null {
  const q = normaliseTerm(question);
  if (!q) return null;

  let best: { concept: Concept; score: number } | null = null;
  for (const concept of CONCEPTS) {
    for (const raw of [concept.name, ...concept.aliases]) {
      const term = normaliseTerm(raw);
      if (!term) continue;
      if (!new RegExp(`\\b${escapeRe(term)}\\b`).test(q)) continue;
      // Prefer the most specific match available.
      const score = term.length;
      if (!best || score > best.score) best = { concept, score };
    }
  }
  return best ? best.concept : null;
}

/** Concepts worth surfacing given the state of someone's actual finances. */
export function relevantConcepts(ctx: ConceptContext, limit = 3): Concept[] {
  const picks: string[] = [];
  if (ctx.debt > 0) picks.push("apr-apy", "minimum-payment", "avalanche-snowball");
  if (ctx.utilization != null && ctx.utilization > 0.3) picks.push("credit-utilization");
  if (ctx.expense > 0 && ctx.cash / ctx.expense < 3) picks.push("emergency-fund");
  if (ctx.cashFlow > 0) picks.push("compound-interest", "savings-rate", "index-fund");
  picks.push("opportunity-cost", "inflation", "safe-withdrawal");

  const seen = new Set<string>();
  const out: Concept[] = [];
  for (const id of picks) {
    if (seen.has(id)) continue;
    seen.add(id);
    const concept = conceptById(id);
    if (concept) out.push(concept);
    if (out.length >= limit) break;
  }
  return out;
}

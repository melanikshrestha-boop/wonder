/**
 * Finance concept library — explanations that use your actual numbers.
 *
 * The reason most finance explainers don't land is that they're abstract.
 * "Compound interest means your interest earns interest" is true and
 * forgettable. "Your $1,240 balance at 24.99% costs you $310 a year if you
 * never touch it" is the same idea, and it sticks.
 *
 * So every concept here carries four things:
 *   plain    — the idea, no jargon
 *   formula  — the maths, so it can be checked rather than believed
 *   worked   — the same idea run on the reader's own ledger
 *   gotcha   — the part that actually trips people up
 *
 * On sources: this file encodes *concepts and formulas*, which are not
 * copyrightable, and cites where each is authoritatively documented. No book
 * text is reproduced anywhere. Titles under `reading` are pointers to go and
 * read the real thing, not summaries of it.
 *
 * Citations favour primary and public-domain sources — the SEC's investor
 * education material, the CFPB, the IRS, and the original academic papers —
 * over secondary commentary.
 */
import { money } from "./financeStore";
import {
  aprToApy,
  debtToIncome,
  futureValue,
  opportunityCost,
  payoffWithMinimums,
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
  formula?: string;
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
    oneLine: "Growth that earns growth, so the curve bends upward instead of running straight.",
    plain:
      "Simple interest pays you on the original amount forever. Compound interest pays you on the original amount plus everything it has already earned. Early on the difference looks trivial. It is not trivial — it is the whole game, and it only pays out if you leave it alone long enough for the curve to bend.",
    formula: "FV = PV × (1 + r)^n",
    gotcha:
      "It works identically against you. A credit card is compound interest pointed in the other direction, and it compounds daily rather than yearly.",
    source: "U.S. SEC, Investor.gov — compound interest calculator and definition",
    reading: "Morgan Housel, The Psychology of Money — on why time, not returns, does the work",
    worked: (ctx) => {
      const base = Math.max(1000, Math.round(ctx.cash));
      const ten = futureValue(base, 0.07, 10);
      const thirty = futureValue(base, 0.07, 30);
      return {
        text: `Take ${money(base)} — roughly your cash on hand — at 7% a year. In 10 years it is ${money(ten)}. In 30 it is ${money(thirty)}. You added nothing; the last 20 years produced ${money(thirty - ten)} of the total.`,
        data: [
          { label: "Today", value: money(base) },
          { label: "10 years", value: money(ten) },
          { label: "30 years", value: money(thirty) },
        ],
      };
    },
  },
  {
    id: "rule-72",
    name: "Rule of 72",
    aliases: ["rule of seventy two", "doubling time", "how long to double"],
    oneLine: "Divide 72 by the rate to get the years it takes money to double.",
    plain:
      "A mental shortcut, not a law. At 8% a year, money doubles in about 9 years. At 3%, about 24. It lets you sanity-check any growth claim without a calculator.",
    formula: "years ≈ 72 ÷ rate%   (exact: ln2 ÷ ln(1+r))",
    gotcha:
      "It drifts at extreme rates. At 30% the rule says 2.4 years; the true answer is 2.6. Fine for arithmetic in your head, wrong for a spreadsheet.",
    source: "Standard approximation; exact form is the logarithmic identity",
    worked: () => {
      const r7 = rule72(7);
      const r25 = rule72(25);
      return {
        text: `At 7%, money doubles in ${r7.approx.toFixed(1)} years by the rule and ${r7.exact.toFixed(1)} in truth. At a 25% card APR your *debt* doubles in ${r25.exact.toFixed(1)} years if you never pay it.`,
        data: [
          { label: "7% — doubles in", value: `${r7.exact.toFixed(1)} yrs` },
          { label: "25% — doubles in", value: `${r25.exact.toFixed(1)} yrs` },
        ],
      };
    },
  },
  {
    id: "present-value",
    name: "Present value",
    aliases: ["discounting", "pv", "discount rate", "time value of money"],
    oneLine: "What money promised later is worth today.",
    plain:
      "A dollar next year is worth less than a dollar now, because today's dollar could be earning in the meantime. Discounting converts future money into today's money so you can compare options that pay out at different times.",
    formula: "PV = FV ÷ (1 + r)^n",
    gotcha:
      "The discount rate you pick drives the answer more than the cash flows do. Anyone can make a project look good by quietly lowering it.",
    source: "Aswath Damodaran, NYU Stern — valuation lecture notes and datasets, published free",
    reading: "Aswath Damodaran, Investment Valuation",
  },
  {
    id: "opportunity-cost",
    name: "Opportunity cost",
    aliases: ["opportunity", "what else could i do with it", "cost of buying"],
    oneLine: "The real price of anything is the best thing you gave up to get it.",
    plain:
      "A $200 purchase does not cost $200. It costs $200 plus everything that $200 would have become. This is the honest way to read a price tag — and the reason 'it's only $200' is usually wrong.",
    formula: "forgone = amount × (1 + r)^n − amount",
    gotcha:
      "It cuts both ways. Hoarding cash has an opportunity cost too, and so does spending three hours to save $12.",
    source: "Standard economics; framing per U.S. SEC investor education",
    worked: () => {
      const oc = opportunityCost(200, 10, 7);
      return {
        text: `$200 spent today, at 7% over 10 years, is really ${money(oc.future)} — you gave up ${money(oc.forgone)}. Over 30 years the same $200 is ${money(opportunityCost(200, 30, 7).future)}.`,
        data: [
          { label: "$200 in 10 yrs", value: money(oc.future) },
          { label: "$200 in 30 yrs", value: money(opportunityCost(200, 30, 7).future) },
        ],
      };
    },
  },
  {
    id: "inflation",
    name: "Inflation and real return",
    aliases: ["real return", "purchasing power", "inflation adjusted", "nominal vs real"],
    oneLine: "The return that matters is the one left after prices rise.",
    plain:
      "Earning 5% while prices rise 3% does not make you 5% richer. It makes you about 1.9% richer. Nominal is the number on the statement; real is the number that buys things.",
    formula: "real = (1 + nominal) ÷ (1 + inflation) − 1",
    gotcha:
      "Subtracting — '5% minus 3% is 2%' — overstates it, and the error grows with the rates. A savings account paying under inflation is losing money while showing a positive number.",
    source: "Fisher equation; U.S. inflation data via Federal Reserve (FRED), series CPIAUCSL",
    worked: () => {
      const r = realReturn(5, 3);
      return {
        text: `5% nominal against 3% inflation is ${pct(r.real)} real, not the ${pct(r.naive)} you get by subtracting. A 0.5% savings account against 3% inflation loses ${pct(Math.abs(realReturn(0.5, 3).real))} a year in what it can buy.`,
        data: [
          { label: "5% nominal → real", value: pct(r.real) },
          { label: "0.5% savings → real", value: pct(realReturn(0.5, 3).real) },
        ],
      };
    },
  },

  // ── Rates and debt ────────────────────────────────────────────────────────
  {
    id: "apr-apy",
    name: "APR vs APY",
    aliases: ["apr", "apy", "annual percentage rate", "annual percentage yield", "effective rate"],
    oneLine: "APR is the sticker rate; APY is what compounding actually makes it.",
    plain:
      "APR is quoted without compounding. APY includes it. Lenders advertise APR because it is the smaller number; savings accounts advertise APY because it is the bigger one. Both are describing the same underlying rate.",
    formula: "APY = (1 + APR ÷ n)^n − 1,  n = compounding periods per year",
    gotcha:
      "Credit cards compound daily. A 24.99% APR card is really costing about 28.4% a year — the gap is roughly a month's worth of interest that never gets quoted.",
    source: "U.S. Consumer Financial Protection Bureau — APR and APY definitions (Regulation Z)",
    worked: (ctx) => {
      const apr = ctx.apr ?? 24.99;
      const apy = aprToApy(apr);
      return {
        text: `A ${pct(apr)} APR card compounding daily has a true annual cost of ${pct(apy)}. On a ${money(Math.max(1000, ctx.debt))} balance that is ${money((Math.max(1000, ctx.debt) * apy) / 100)} a year, not ${money((Math.max(1000, ctx.debt) * apr) / 100)}.`,
        data: [
          { label: "Quoted APR", value: pct(apr) },
          { label: "True APY", value: pct(apy) },
        ],
      };
    },
  },
  {
    id: "minimum-payment",
    name: "The minimum payment trap",
    aliases: ["minimum payment", "paying the minimum", "min payment"],
    oneLine: "Minimums are set to keep you in debt as long as legally possible.",
    plain:
      "A minimum is typically 1–3% of the balance or a $25–35 floor, whichever is larger. Because the percentage shrinks as the balance does, the payment shrinks with it, and the tail of the debt stretches out for years.",
    formula: "minimum = max(floor, balance × rate)",
    gotcha:
      "Paying a *fixed* amount equal to today's minimum — rather than the shrinking minimum — often cuts the payoff time by more than half, at no extra monthly cost.",
    source: "U.S. Consumer Financial Protection Bureau — credit card repayment disclosures (CARD Act)",
    worked: (ctx) => {
      const bal = Math.max(1000, Math.round(ctx.debt));
      const apr = ctx.apr ?? 24.99;
      const min = payoffWithMinimums(bal, apr);
      if (min.neverPaysOff) {
        return { text: `At ${pct(apr)} on ${money(bal)}, the minimum never clears it — the interest outruns the payment.` };
      }
      return {
        text: `${money(bal)} at ${pct(apr)}, paying only minimums: ${Math.round(min.months)} months and ${money(min.totalInterest)} of interest. You would repay ${money(min.totalPaid)} for a ${money(bal)} debt.`,
        data: [
          { label: "Months on minimums", value: `${Math.round(min.months)}` },
          { label: "Interest paid", value: money(min.totalInterest) },
          { label: "Total repaid", value: money(min.totalPaid) },
        ],
      };
    },
  },
  {
    id: "avalanche-snowball",
    name: "Avalanche vs snowball",
    aliases: ["avalanche", "snowball", "debt payoff order", "which debt first"],
    oneLine: "Highest rate first is cheapest; smallest balance first is easiest to stick to.",
    plain:
      "Avalanche attacks the highest APR and always costs less in total interest — that is arithmetic, not opinion. Snowball clears the smallest balance first, which produces a visible win sooner and keeps some people going who would otherwise quit.",
    gotcha:
      "The optimal plan you abandon beats nothing, but it loses to the good plan you finish. Run both, look at the actual gap, and if it is small, pick the one you will not quit.",
    source: "Avalanche follows directly from interest arithmetic; snowball's adherence effect per behavioural research on small wins",
    reading: "Morgan Housel, The Psychology of Money — on reasonable beating optimal",
  },
  {
    id: "amortization",
    name: "Amortisation",
    aliases: ["amortize", "amortisation", "loan schedule", "how loans work"],
    oneLine: "A fixed payment that is mostly interest at the start and mostly principal at the end.",
    plain:
      "Every payment is split: interest on what you still owe, and the rest against the balance. Because the balance is largest at the beginning, early payments are almost all interest. The split flips slowly, which is why paying extra early matters so much more than paying extra late.",
    formula: "PMT = P × r ÷ (1 − (1 + r)^−n)",
    gotcha:
      "An extra payment in year one removes far more total interest than the same payment in year ten, because it deletes every future interest charge that balance would have generated.",
    source: "U.S. Consumer Financial Protection Bureau — loan amortisation disclosures",
  },
  {
    id: "credit-utilization",
    name: "Credit utilisation",
    aliases: ["utilization", "utilisation", "credit usage", "how much of my limit"],
    oneLine: "How much of your available credit you are using — about 30% of a FICO score.",
    plain:
      "Balance divided by limit. It is measured on the balance reported to the bureaus, which is usually the statement balance, not what is left after you pay. Below 30% is the usual guidance and below 10% is better.",
    formula: "utilisation = balance ÷ credit limit",
    gotcha:
      "You can pay in full every month and still show high utilisation, because the statement balance is what gets reported. Paying before the statement closes is what moves the number.",
    source: "FICO — published score composition; U.S. CFPB consumer guidance",
    worked: (ctx) => {
      if (ctx.utilization == null) {
        return { text: "Your utilisation is unknown — add credit limits to your accounts and this becomes a live number." };
      }
      const u = ctx.utilization * 100;
      return {
        text: `You are at ${pct(u)} utilisation. ${u > 30 ? "Above the 30% line, which is the band where scores start taking damage." : u > 10 ? "Inside the safe band, though under 10% scores better." : "Excellent — this is the range that scores best."}`,
        data: [{ label: "Utilisation", value: pct(u) }],
      };
    },
  },
  {
    id: "dti",
    name: "Debt-to-income",
    aliases: ["debt to income", "dti"],
    oneLine: "The share of your monthly income already promised to debt.",
    plain:
      "Lenders use it to judge whether you can take on more. Under 36% is comfortable; over 43% and most mortgage underwriting stops.",
    formula: "DTI = monthly debt payments ÷ gross monthly income",
    source: "U.S. Consumer Financial Protection Bureau — ability-to-repay standards",
    worked: (ctx) => {
      if (ctx.income <= 0) return null;
      const payments = Math.max(25, ctx.debt * 0.02);
      const ratio = debtToIncome(payments, ctx.income);
      return {
        text: `On ${money(ctx.income)} of monthly income with about ${money(payments)} of minimum debt payments, your DTI is ${pct(ratio)}.`,
        data: [{ label: "DTI", value: pct(ratio) }],
      };
    },
  },
  {
    id: "bnpl",
    name: "Buy now, pay later — the real rate",
    aliases: ["bnpl", "klarna", "afterpay", "affirm", "pay in 4", "payday loan"],
    oneLine: "A small flat fee over a short window is an enormous annual rate.",
    plain:
      "Short-term credit is quoted as a fee because the fee sounds small. Converted to an annual rate — the only way to compare it to anything else — it is usually worse than the credit card it is replacing.",
    formula: "APR = (fee ÷ principal) × (365 ÷ days) × 100",
    gotcha:
      "'0% interest' instalment plans make money on late fees and on the fact that splitting a price into four makes you buy things you would not otherwise buy.",
    source: "U.S. Consumer Financial Protection Bureau — BNPL market reports",
  },

  // ── Saving and independence ───────────────────────────────────────────────
  {
    id: "savings-rate",
    name: "Savings rate",
    aliases: ["save rate", "how much should i save", "percentage saved"],
    oneLine: "The share of income you keep — the single number that decides how long you must work.",
    plain:
      "Not the amount, the rate. Saving 50% of a modest income buys freedom far faster than saving 5% of a large one, because a high rate simultaneously builds the pot and shrinks the lifestyle the pot has to sustain. It moves both sides of the equation at once.",
    formula: "rate = (income − spending) ÷ income",
    gotcha:
      "A raise spent entirely resets your clock to zero. The rate is what matters, and lifestyle inflation attacks it directly.",
    source: "Arithmetic of the savings-rate/withdrawal-rate relationship",
    reading: "Vicki Robin & Joe Dominguez, Your Money or Your Life",
    worked: (ctx) => {
      if (ctx.income <= 0) return null;
      const rate = ((ctx.income - ctx.expense) / ctx.income) * 100;
      return {
        text: `You are keeping ${pct(rate)} of what comes in — ${money(ctx.income - ctx.expense)} of ${money(ctx.income)} a month.`,
        data: [
          { label: "Savings rate", value: pct(rate) },
          { label: "Kept per month", value: money(ctx.income - ctx.expense) },
        ],
      };
    },
  },
  {
    id: "safe-withdrawal",
    name: "The 4% rule",
    aliases: ["safe withdrawal rate", "4 percent rule", "fire", "financial independence", "retire early", "swr"],
    oneLine: "Roughly 25× your annual spending is the pot that can sustain you.",
    plain:
      "Bengen's 1994 study tested withdrawal rates against historical US market data and found about 4% of the starting balance, adjusted for inflation, survived every 30-year window in the record. Invert it and the target is 25 times annual spending.",
    formula: "target = annual spending ÷ 0.04  =  spending × 25",
    gotcha:
      "It is a finding about US history over 30-year windows, not a law of nature. It assumes a specific stock/bond mix, ignores taxes and fees, and a long retirement or a bad opening decade both strain it. Treat it as an order of magnitude.",
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
        text: `You spend about ${money(annualSpend)} a year, so the target is ${money(fi.target)}. ${fi.reachable ? `At your current savings rate of ${pct(fi.savingsRate * 100)} and 7% returns, that is ${yrs(fi.years)} away.` : "At your current rate you are not saving, so there is no timeline yet."}`,
        data: [
          { label: "Annual spending", value: money(annualSpend) },
          { label: "Target pot (25×)", value: money(fi.target) },
          { label: "Years at this rate", value: yrs(fi.years) },
        ],
      };
    },
  },
  {
    id: "emergency-fund",
    name: "Emergency fund and runway",
    aliases: ["emergency fund", "runway", "how long can i survive", "buffer"],
    oneLine: "Months you could cover with cash if income stopped tomorrow.",
    plain:
      "The standard guidance is three to six months of expenses, held in cash rather than invested. Its job is not returns; its job is to stop a bad month from becoming credit card debt at 25%.",
    formula: "runway = cash ÷ monthly expenses",
    gotcha:
      "Holding it in stocks defeats the purpose — emergencies correlate with market drops, so you sell at the worst moment.",
    source: "U.S. Consumer Financial Protection Bureau — emergency savings guidance",
    worked: (ctx) => {
      if (ctx.expense <= 0) return null;
      const months = runwayMonths(ctx.cash, ctx.expense);
      return {
        text: `${money(ctx.cash)} in cash against ${money(ctx.expense)} of monthly spend is ${months.toFixed(1)} months of runway. ${months < 3 ? "Below the three-month floor." : months < 6 ? "Inside the usual three-to-six band." : "Comfortably above six months."}`,
        data: [{ label: "Runway", value: `${months.toFixed(1)} months` }],
      };
    },
  },
  {
    id: "lifestyle-inflation",
    name: "Lifestyle inflation",
    aliases: ["lifestyle creep", "spending creep"],
    oneLine: "Spending rising to meet income, so a raise changes nothing.",
    plain:
      "Income goes up, spending quietly follows, savings rate stays flat. The raise felt like progress and moved you no closer to anything. The fix is mechanical: decide where a raise goes before it arrives.",
    source: "Behavioural finance literature on hedonic adaptation",
    reading: "Morgan Housel, The Psychology of Money",
  },

  // ── Investing ─────────────────────────────────────────────────────────────
  {
    id: "index-fund",
    name: "Index funds",
    aliases: ["index", "etf", "s&p 500", "passive investing", "vti", "voo"],
    oneLine: "Buy the whole market at near-zero cost instead of guessing which piece wins.",
    plain:
      "An index fund holds every company in an index in proportion. No manager picks stocks, so the fee is tiny. The case for it is that most active managers fail to beat their benchmark over long periods, and the ones who will are not identifiable in advance.",
    gotcha:
      "It removes company risk, not market risk. When the whole market drops 40%, so does your index fund. Diversification within stocks is not diversification across asset classes.",
    source: "U.S. SEC, Investor.gov — mutual funds and ETFs; S&P Dow Jones Indices SPIVA scorecards on active vs passive",
    reading: "John Bogle, The Little Book of Common Sense Investing; Burton Malkiel, A Random Walk Down Wall Street",
  },
  {
    id: "expense-ratio",
    name: "Expense ratio",
    aliases: ["fees", "fund fees", "management fee", "ter"],
    oneLine: "The annual percentage a fund takes, charged whether it wins or loses.",
    plain:
      "Quoted as a percentage of assets per year. It sounds negligible and compounds exactly like returns do — against you. The difference between 0.03% and 1% is decades of growth.",
    formula: "drag ≈ balance × fee, every year, compounding",
    gotcha:
      "Fees are certain; returns are not. It is the only variable in investing you control completely.",
    source: "U.S. SEC, Investor.gov — mutual fund fees and expenses",
    worked: () => {
      const cheap = futureValue(10000, 0.07 - 0.0003, 30);
      const dear = futureValue(10000, 0.07 - 0.01, 30);
      return {
        text: `$10,000 for 30 years at 7%: a 0.03% fund leaves you ${money(cheap)}; a 1% fund leaves ${money(dear)}. That 0.97% difference cost ${money(cheap - dear)}.`,
        data: [
          { label: "0.03% fee", value: money(cheap) },
          { label: "1.00% fee", value: money(dear) },
          { label: "Cost of the fee", value: money(cheap - dear) },
        ],
      };
    },
  },
  {
    id: "diversification",
    name: "Diversification",
    aliases: ["diversify", "spread risk", "portfolio", "asset allocation"],
    oneLine: "Holding things that don't fall together, so no single failure ruins you.",
    plain:
      "Markowitz showed that a portfolio's risk depends on how its holdings move relative to each other, not just on each holding's own risk. Combining assets that respond differently to the same event lowers total volatility without a matching cut to expected return.",
    gotcha:
      "Owning thirty tech stocks is not diversified; they fall together. And correlations rise in a crisis — the moment diversification is supposed to help is exactly when it helps least.",
    source: "Markowitz, H. (1952), 'Portfolio Selection', Journal of Finance 7(1)",
    reading: "Burton Malkiel, A Random Walk Down Wall Street",
  },
  {
    id: "dca",
    name: "Dollar-cost averaging",
    aliases: ["dca", "dollar cost averaging", "buying regularly"],
    oneLine: "Investing a fixed amount on a schedule regardless of price.",
    plain:
      "Buy the same dollar amount every month and you automatically buy more shares when prices are low and fewer when they're high. Its real value is behavioural: it removes the decision, and the decision is where people lose money.",
    gotcha:
      "Against a lump sum you already have, DCA usually underperforms, because markets rise more often than they fall. It buys you a smoother ride, not a better return.",
    source: "U.S. SEC, Investor.gov — dollar cost averaging",
  },
  {
    id: "risk-return",
    name: "Risk and return",
    aliases: ["risk", "volatility", "standard deviation", "risk tolerance"],
    oneLine: "Higher expected return is compensation for accepting a wider range of outcomes.",
    plain:
      "Risk in finance means dispersion, not just loss — how far results scatter around the average. You are paid an expected premium for holding assets whose outcomes are uncertain. That premium is expected, not promised.",
    gotcha:
      "Volatility and risk are only the same thing if you are forced to sell. Over a long horizon the greater risk is often holding cash and losing to inflation with certainty.",
    source: "Aswath Damodaran, NYU Stern — risk premium datasets, published annually and free",
    reading: "Benjamin Graham, The Intelligent Investor — on margin of safety",
  },
  {
    id: "npv-irr",
    name: "NPV and IRR",
    aliases: ["npv", "irr", "net present value", "internal rate of return", "is this worth it"],
    oneLine: "Two ways to judge whether a stream of future cash beats its up-front cost.",
    plain:
      "NPV discounts every future cash flow back to today and subtracts the cost; positive means it creates value at your required rate. IRR is the rate at which NPV hits zero — the project's own break-even return.",
    formula: "NPV = Σ CFt ÷ (1+r)^t   ·   IRR: the r where NPV = 0",
    gotcha:
      "IRR is seductive because it is one clean percentage, but it misbehaves when cash flows change sign more than once, and it silently assumes you can reinvest at the same rate. When they disagree, NPV is right.",
    source: "Aswath Damodaran, NYU Stern — corporate finance lecture notes, published free",
    reading: "Aswath Damodaran, Investment Valuation",
  },

  // ── Tax ───────────────────────────────────────────────────────────────────
  {
    id: "marginal-tax",
    name: "Marginal vs effective tax rate",
    aliases: ["tax bracket", "marginal rate", "effective rate", "tax brackets"],
    oneLine: "Your bracket applies to your last dollar, not to all of them.",
    plain:
      "Brackets are progressive. Crossing into the 22% bracket taxes only the income above that threshold at 22%; everything below is still taxed at the lower rates. Your effective rate — total tax ÷ total income — is always lower than your bracket.",
    formula: "effective = total tax ÷ total income",
    gotcha:
      "'A raise pushed me into a higher bracket so I take home less' is arithmetically impossible. More gross income always means more take-home.",
    source: "U.S. Internal Revenue Service — tax rate schedules (public domain)",
  },
  {
    id: "capital-gains",
    name: "Capital gains",
    aliases: ["capital gain", "long term gains", "short term gains", "tax on investments"],
    oneLine: "Profit on a sale, taxed far more kindly if you held it over a year.",
    plain:
      "Sell within a year and the gain is short-term, taxed as ordinary income. Hold beyond a year and it becomes long-term, taxed at preferential rates. Nothing is owed until you actually sell.",
    gotcha:
      "The holding period is a real cliff, not a slope. Selling a day early can move the entire gain into the higher bracket.",
    source: "U.S. Internal Revenue Service, Publication 550 (public domain)",
  },
  {
    id: "tax-advantaged",
    name: "Tax-advantaged accounts",
    aliases: ["401k", "ira", "roth", "retirement account", "hsa"],
    oneLine: "Accounts where the government stops taxing the growth, in exchange for locking it up.",
    plain:
      "Traditional accounts deduct now and tax withdrawals later; Roth accounts tax now and let withdrawals out free. An employer match is the closest thing to a guaranteed return that exists.",
    gotcha:
      "Roth is usually the better bet when your current tax rate is low — which, early in a career, it generally is.",
    source: "U.S. Internal Revenue Service, Publications 590-A and 590-B (public domain)",
  },

  // ── Reading your own books ────────────────────────────────────────────────
  {
    id: "cash-flow",
    name: "Cash flow vs profit",
    aliases: ["cash flow", "profit", "burn rate", "net income"],
    oneLine: "Profit is an opinion about timing; cash is a fact about your balance.",
    plain:
      "Profit records income when earned and costs when incurred. Cash flow records money when it actually moves. You can be profitable and still unable to pay rent, because the invoice has not cleared.",
    gotcha: "Businesses do not fail from unprofitability. They fail from running out of cash.",
    source: "Standard accounting distinction; U.S. SEC financial statement guidance",
    worked: (ctx) => ({
      text: `Your ledger shows ${money(ctx.income)} in and ${money(ctx.expense)} out this month — net ${money(ctx.cashFlow)}. That is cash movement, which is the number that can actually bounce.`,
      data: [
        { label: "In", value: money(ctx.income) },
        { label: "Out", value: money(ctx.expense) },
        { label: "Net", value: money(ctx.cashFlow) },
      ],
    }),
  },
  {
    id: "net-worth",
    name: "Net worth",
    aliases: ["networth", "what am i worth"],
    oneLine: "Everything you own minus everything you owe.",
    plain:
      "One number, measured at a point in time. Its direction over months tells you more than its size — income tells you nothing on its own, since high earners with high spending routinely have negative net worth.",
    formula: "net worth = assets − liabilities",
    source: "U.S. Federal Reserve — Survey of Consumer Finances methodology",
    worked: (ctx) => ({
      text: `${money(ctx.cash)} in assets minus ${money(ctx.debt)} owed puts you at ${money(ctx.worth)}.`,
      data: [{ label: "Net worth", value: money(ctx.worth) }],
    }),
  },
  {
    id: "sunk-cost",
    name: "Sunk cost fallacy",
    aliases: ["sunk cost", "throwing good money after bad"],
    oneLine: "Money already spent should never influence what you do next.",
    plain:
      "Spent money is gone whatever you decide, so it carries no information about the best next move. The only question is whether the future benefit beats the future cost. Everything already paid is irrelevant to that comparison.",
    gotcha:
      "It masquerades as principle — 'I've already put so much in' — which is why it survives in people who know the definition perfectly well.",
    source: "Arkes & Blumer (1985), 'The Psychology of Sunk Cost', Organizational Behavior and Human Decision Processes",
  },
  {
    id: "loss-aversion",
    name: "Loss aversion",
    aliases: ["loss averse", "prospect theory", "why losing hurts"],
    oneLine: "Losses hurt roughly twice as much as equivalent gains feel good.",
    plain:
      "Kahneman and Tversky found people weigh a loss about two to one against a gain of the same size. It explains selling winners early, holding losers too long, and refusing a coin flip that is mathematically favourable.",
    gotcha:
      "Knowing about it does not switch it off. Structural defences — automatic transfers, a written plan — work; willpower does not.",
    source: "Kahneman, D. & Tversky, A. (1979), 'Prospect Theory: An Analysis of Decision under Risk', Econometrica 47(2)",
    reading: "Daniel Kahneman, Thinking, Fast and Slow",
  },
  {
    id: "liquidity",
    name: "Liquidity",
    aliases: ["liquid", "illiquid", "how fast can i sell"],
    oneLine: "How fast something turns into spendable money without losing value.",
    plain:
      "Cash is perfectly liquid. Index funds take days. A car takes weeks and a discount. Illiquid things are not worse — they are just unavailable in the exact moment you might need them.",
    gotcha: "An asset's quoted value and its value when you need to sell it this week are different numbers.",
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

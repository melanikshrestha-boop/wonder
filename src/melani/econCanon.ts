/**
 * Economics canon for Mel + Finance Copilot.
 *
 * Same legal bar as financeConcepts.ts:
 *   - Original teaching text (mechanisms, formulas, gotchas)
 *   - No book prose reproduced
 *   - `reading` is a pointer to a real work, not a summary of its text
 *
 * Purpose: when Melani asks about markets, incentives, inflation, trade-offs,
 * agents answer with sharp frameworks AND can point at books she may own.
 */
export type EconFramework = {
  id: string;
  name: string;
  aliases: string[];
  oneLine: string;
  plain: string;
  formula?: string;
  formulaNote?: string;
  gotcha?: string;
  /** How a founder / builder uses this. */
  founderMove?: string;
  source: string;
  /** Pointer only — never a substitute for the book. */
  reading?: string;
};

export const ECON_FRAMEWORKS: EconFramework[] = [
  {
    id: "scarcity-tradeoffs",
    name: "Scarcity and trade-offs",
    aliases: ["scarcity", "tradeoff", "trade-off", "opportunity", "constraints"],
    oneLine:
      "Resources are limited relative to wants, so every choice spends something that cannot be spent twice.",
    plain:
      "Economics starts from a constraint: time, cash, attention, compute, and reputation are finite. Choosing A means not choosing B with the same unit of resource. The cost of A is therefore not only its sticker price, but the best alternative given up. Systems that ignore constraints produce wish lists. Systems that price constraints produce decisions.",
    formula: "choice cost = best forgone alternative",
    formulaNote: "Measured in the same units as the scarce resource (dollars, hours, or risk).",
    gotcha:
      "People underweight non-cash costs (sleep, focus, optionality) and then wonder why a 'cheap' path was expensive.",
    founderMove:
      "For every yes, name the no. Ship one wedge fully instead of half-shipping five.",
    source: "Core microeconomic identity: constrained optimization under scarcity",
    reading: "Thomas Sowell, Basic Economics",
  },
  {
    id: "opportunity-cost",
    name: "Opportunity cost",
    aliases: ["opp cost", "forgone", "what else could", "instead of"],
    oneLine:
      "The true cost of a choice is the value of the best alternative you did not take.",
    plain:
      "Accounting cost is cash out the door. Opportunity cost is cash out plus the best other use of that cash, time, or risk budget. Two investments with the same dollar outlay can have different opportunity costs if one blocks a better project. Rational comparison ranks options by net benefit after opportunity cost, not by sticker price alone.",
    formula: "economic profit = revenue − accounting cost − opportunity cost",
    formulaNote: "Economic profit can be zero while accounting profit is positive.",
    gotcha:
      "Sunk costs are already gone and do not belong in opportunity cost going forward.",
    founderMove:
      "Price your hours at founder rate. A 'free' task that burns a day is not free.",
    source: "Standard definition in intermediate microeconomics",
    reading: "Henry Hazlitt, Economics in One Lesson",
  },
  {
    id: "incentives",
    name: "Incentives",
    aliases: ["incentive", "aligned", "principal agent", "pay for"],
    oneLine:
      "People respond to the payoffs they face, not the payoffs you wish they faced.",
    plain:
      "If a metric is rewarded, behavior moves toward that metric, including gaming it. If a risk is socialized and upside is private, risk-taking rises. Good system design makes the private payoff match the outcome you actually want: quality, retention, safety, long-term value. Bad design optimizes the proxy and destroys the goal.",
    gotcha:
      "Stated mission without payoff structure is decoration. Watch what gets paid, promoted, or punished.",
    founderMove:
      "Align contractor, employee, and vendor incentives with the customer outcome you sell.",
    source: "Incentive theory / principal-agent problem (economics + organizational design)",
    reading: "Freakonomics (Levitt & Dubner) — as a pointer to incentive thinking",
  },
  {
    id: "marginal-thinking",
    name: "Marginal thinking",
    aliases: ["marginal", "at the margin", "one more unit", "incremental"],
    oneLine:
      "Decisions should weigh the extra benefit of one more unit against the extra cost of that unit.",
    plain:
      "Average cost and average benefit describe the past. The next decision depends on the next unit: marginal cost (MC) vs marginal benefit (MB). Expand activity while MB > MC; stop when they meet. Hiring the 5th engineer, buying the next server, or running one more ad campaign is a marginal problem, not an average problem.",
    formula: "expand while MB > MC; optimum near MB = MC",
    formulaNote: "MB = benefit of one more unit · MC = cost of one more unit",
    gotcha:
      "Fixed costs already paid do not change the marginal comparison unless they change future options.",
    founderMove:
      "Ask: does the next dollar of spend create more than a dollar of expected value?",
    source: "Neoclassical optimization at the margin",
    reading: "N. Gregory Mankiw, Principles of Economics",
  },
  {
    id: "supply-demand",
    name: "Supply and demand",
    aliases: ["supply", "demand", "equilibrium", "price signal", "clearing price"],
    oneLine:
      "Price moves to balance how much buyers want with how much sellers offer at that price.",
    plain:
      "Demand slopes down: higher price, less quantity demanded (all else equal). Supply slopes up: higher price, more quantity supplied. Where they cross is the market-clearing price. Shortages appear when price is held below clearing; surpluses when held above. Shifts in income, taste, technology, input costs, or expectations move the curves and change equilibrium.",
    formula: "Qd(P) = Qs(P) at equilibrium price P*",
    formulaNote: "Qd = quantity demanded · Qs = quantity supplied · P = price",
    gotcha:
      "A price control changes quantity and creates rationing by waiting, quality drop, or black markets. The shortage is not mysterious.",
    founderMove:
      "Your product price is a signal. If demand explodes at current price, you are under-pricing capacity or quality.",
    source: "Marshallian market model",
    reading: "Adam Smith, The Wealth of Nations (price and specialization context)",
  },
  {
    id: "elasticity",
    name: "Elasticity",
    aliases: ["price sensitive", "elastic", "inelastic", "sensitivity"],
    oneLine:
      "Elasticity measures how much quantity responds when price (or income) changes.",
    plain:
      "Price elasticity of demand is the percent change in quantity demanded divided by the percent change in price. Elastic demand (>1 in magnitude) means buyers cut quantity sharply when price rises. Inelastic demand means they barely change. Luxury substitutes, time to adjust, and budget share all raise elasticity. Revenue rises with a price increase only when demand is inelastic.",
    formula: "ε = (%ΔQ) / (%ΔP)",
    formulaNote: "ε = elasticity · Q = quantity · P = price",
    gotcha:
      "Short-run demand is often less elastic than long-run demand because substitutes take time.",
    founderMove:
      "Test price. If volume barely moves, you may have pricing power. If volume collapses, you do not.",
    source: "Standard micro definition of price elasticity",
    reading: "Mankiw, Principles of Economics",
  },
  {
    id: "comparative-advantage",
    name: "Comparative advantage",
    aliases: ["comparative", "absolute advantage", "specialize", "trade gains"],
    oneLine:
      "Trade gains come from specializing where your opportunity cost is lowest, not only where you are best in absolute terms.",
    plain:
      "Absolute advantage means producing more with the same inputs. Comparative advantage means producing at lower opportunity cost. Even if you are better at everything, you should specialize in what you are relatively best at and trade for the rest. This is why division of labor and global supply chains raise total output.",
    gotcha:
      "Ignoring transition costs (retraining, capital lock-in) makes the textbook gain look larger than the near-term path.",
    founderMove:
      "Outsource what is not your highest-leverage edge. Keep the layer where your opportunity cost is uniquely low.",
    source: "Ricardo's theory of comparative advantage",
    reading: "David Ricardo, On the Principles of Political Economy and Taxation",
  },
  {
    id: "price-signals",
    name: "Price signals",
    aliases: ["price signal", "information", "coordination", "hayek"],
    oneLine:
      "Prices compress dispersed knowledge into a single number people can act on without knowing everything.",
    plain:
      "No central planner sees every local shortage, preference, and technique. Rising prices say 'produce more / consume less' without a memo. Falling prices say the opposite. Blocking price movement destroys the information channel and forces crude rationing. Markets fail when prices cannot form (externalities, monopoly power, missing markets), not because prices are inherently evil.",
    gotcha:
      "A price can be wrong for your decision if it excludes external costs (pollution) or is set by a coerced monopoly.",
    founderMove:
      "Watch clearing prices in talent, ads, and cloud. They tell you where the world is congested.",
    source: "Hayek, 'The Use of Knowledge in Society' (1945) — idea, not a quote dump",
    reading: "F. A. Hayek, The Use of Knowledge in Society (essay)",
  },
  {
    id: "externalities",
    name: "Externalities",
    aliases: ["externality", "spillover", "social cost", "negative external"],
    oneLine:
      "An externality is a cost or benefit of an action that falls on someone not party to the decision.",
    plain:
      "Private cost is what the decision-maker pays. Social cost adds harms (or benefits) imposed on others. When social cost > private cost, markets over-produce the activity (pollution). When social benefit > private benefit, markets under-produce (basic research). Fixes include property rights, taxes/subsidies, regulation, or new markets that price the spillover.",
    formula: "social cost = private cost + external cost",
    formulaNote: "Efficient output equates marginal social cost to marginal social benefit.",
    gotcha:
      "Not every annoyance is an externality worth a law. Measure magnitude and transaction costs before intervening.",
    founderMove:
      "If your product creates a platform risk for users, that risk is a product externality. Price or design it in.",
    source: "Pigou / Coase tradition in public economics",
    reading: "Ronald Coase, The Problem of Social Cost (essay)",
  },
  {
    id: "adverse-selection-moral-hazard",
    name: "Adverse selection and moral hazard",
    aliases: ["adverse selection", "moral hazard", "asymmetric information", "lemons"],
    oneLine:
      "Hidden information before a deal is adverse selection; hidden action after a deal is moral hazard.",
    plain:
      "Adverse selection: the party who knows more about quality sorts into the contract you mispriced (used cars, insurance pools). Moral hazard: after coverage or bailout, the party takes more risk because downside is shared. Fixes include screening, signaling, deductibles, skin in the game, monitoring, and reputation.",
    gotcha:
      "Free insurance without copays almost always increases utilization. That can be policy intent, but it is not free.",
    founderMove:
      "If you insure users against failure (refunds, guarantees), design anti-abuse so moral hazard does not sink unit economics.",
    source: "Akerlof lemons model; Arrow / insurance economics",
    reading: "George Akerlof, The Market for Lemons (paper)",
  },
  {
    id: "real-vs-nominal",
    name: "Real vs nominal",
    aliases: ["real return", "nominal", "inflation adjusted", "purchasing power"],
    oneLine:
      "Nominal figures are in today's dollars; real figures remove inflation so purchasing power is comparable.",
    plain:
      "A 10% nominal return with 4% inflation is about 6% real. Wages, rents, and portfolio returns can look strong in nominal terms while real living standards stall. Debt contracts and cash balances are hurt by surprise inflation; some real assets and pricing power businesses can pass it through.",
    formula: "1 + r_real ≈ (1 + r_nominal) / (1 + inflation)",
    formulaNote: "Approximation: r_real ≈ r_nominal − inflation for small rates",
    gotcha:
      "Comparing salaries or revenue across years without a price index lies about growth.",
    founderMove:
      "Track runway and burn in real terms when inflation is high. Cash loses quiet purchasing power.",
    source: "Fisher relation / standard macro accounting",
    reading: "Milton Friedman, writings on money and inflation (pointer)",
  },
  {
    id: "interest-rates-time",
    name: "Interest rates and time preference",
    aliases: ["interest rate", "discount rate", "time preference", "present value"],
    oneLine:
      "Interest is the price of moving consumption between present and future.",
    plain:
      "A positive interest rate means a dollar today is worth more than a dollar later, because of time preference, inflation, and risk. Present value discounts future cash flows. Higher rates crush long-duration assets (cash flows far out) more than near-term cash cows. Your personal discount rate should reflect your real alternatives and risk.",
    formula: "PV = CF / (1 + r)^t",
    formulaNote: "PV = present value · CF = future cash · r = discount rate · t = periods",
    gotcha:
      "Using a tiny discount rate makes distant fantasy cash look huge. Stress-test r.",
    founderMove:
      "When rates rise, lengthen cash runway and demand faster payback on projects.",
    source: "Time value of money / Fisher effect context",
    reading: "Any standard corporate finance text; pair with your finance concept library",
  },
  {
    id: "sunk-cost",
    name: "Sunk cost discipline",
    aliases: ["sunk cost", "throwing good money", "already spent", "don't look back"],
    oneLine:
      "Costs already paid and unrecoverable should not drive the next decision.",
    plain:
      "Sunk costs are gone whether you continue or stop. Rational choice looks only at future costs and benefits. Escalating commitment ('we already spent so much') is a psychological tax, not an economic argument. Abort rules and pre-committed kill criteria exist to protect you from your past self.",
    gotcha:
      "Reputation and learning from a project can still be forward-looking benefits. Those are not sunk costs.",
    founderMove:
      "Write kill criteria before you fall in love with a build. Melani's empire needs exits, not martyrdom.",
    source: "Standard rational choice; behavioral note on escalation of commitment",
    reading: "Thinking, Fast and Slow (Kahneman) — pointer to cognitive bias literature",
  },
  {
    id: "creative-destruction",
    name: "Creative destruction",
    aliases: ["disruption", "creative destruction", "schumpeter", "incumbent"],
    oneLine:
      "Growth often requires new methods that make old capital and routines obsolete.",
    plain:
      "Innovation reallocates resources from lower-value uses to higher-value uses. Incumbents defend the old stack; founders attack with a wedge that is 10x better on one dimension. Policy that freezes the old structure protects today's jobs at the cost of tomorrow's productivity. Your strategy either rides the wave or gets crushed by it.",
    gotcha:
      "Not every 'disruption' story is real. Unit economics and distribution still decide survivors.",
    founderMove:
      "Compete like you intend to obsolete a category. Incumbent polish is not a moat against a better system.",
    source: "Schumpeterian growth / innovation economics",
    reading: "Joseph Schumpeter, Capitalism, Socialism and Democracy",
  },
  {
    id: "expected-value",
    name: "Expected value under uncertainty",
    aliases: ["expected value", "ev", "probability", "bet", "odds"],
    oneLine:
      "When outcomes are uncertain, compare options by probability-weighted value, not by the best case alone.",
    plain:
      "Expected value (EV) is the sum of each outcome's value times its probability. A 20% chance of 10x can beat a sure 1.2x if ruin is controlled. Variance and ruin risk still matter: two bets with the same EV can have different survival properties. Size positions so a streak of losses does not end the game.",
    formula: "EV = Σ p_i × v_i",
    formulaNote: "p_i = probability of outcome i · v_i = value of outcome i",
    gotcha:
      "Overconfident probabilities turn EV into fiction. Track base rates.",
    founderMove:
      "Prefer asymmetric upside with capped downside (defined-risk experiments).",
    source: "Decision theory / standard probability",
    reading: "Annie Duke, Thinking in Bets (pointer)",
  },
  {
    id: "capital-allocation",
    name: "Capital allocation",
    aliases: ["allocate capital", "reinvest", "return on capital", "deploy cash"],
    oneLine:
      "Capital allocation is choosing the highest risk-adjusted use of every spare dollar.",
    plain:
      "Options usually include: reinvest in the product, hire, buy growth, pay down high-interest debt, hold cash runway, or diversify into liquid investments. Rank by after-tax, risk-adjusted return and strategic option value. A business that earns 30% on incremental capital should usually reinvest before parking cash at 4%. A business that earns 3% should not reinvest by default.",
    gotcha:
      "Vanity growth that destroys unit economics is not allocation. It is leakage.",
    founderMove:
      "Build a simple capital waterfall: high-APR debt first, then must-have runway, then highest-ROI product bets.",
    source: "Corporate finance capital budgeting logic",
    reading: "The Intelligent Investor (Graham) — capital market temperament pointer",
  },
  {
    id: "gains-from-specialization",
    name: "Specialization and scale",
    aliases: ["specialization", "division of labor", "scale", "productivity"],
    oneLine:
      "Breaking work into specialized tasks raises output per person when coordination costs stay controlled.",
    plain:
      "Division of labor lets people accumulate skill, use better tools, and reduce switching costs. Scale multiplies that when fixed costs spread over more units. The limit is coordination: communication overhead, quality variance, and principal-agent drag. Teams and companies grow until coordination cost eats the specialization gain.",
    gotcha:
      "Specialists without an integration layer create beautiful modules that never ship.",
    founderMove:
      "Specialize roles only after the workflow is stable. Early chaos needs generalists.",
    source: "Smithian division of labor + modern firm theory",
    reading: "Adam Smith, The Wealth of Nations",
  },
  {
    id: "liquidity-vs-return",
    name: "Liquidity versus return",
    aliases: ["liquidity", "cash buffer", "illiquid", "runway"],
    oneLine:
      "More liquid assets usually pay less return; illiquidity is a price you accept for higher expected yield or strategic control.",
    plain:
      "Cash is liquidity: you can spend it tomorrow. Private projects, illiquid equity, and long bonds may pay more but can strand you when you need money. Optimal policy holds enough liquidity for shocks and known obligations, then seeks return with the rest. Founders die from illiquidity (runway) more often than from suboptimal long-run IRR.",
    gotcha:
      "Paper net worth that cannot pay next month's burn is a story, not a treasury.",
    founderMove:
      "Set a cash floor in months of burn. Never allocate below it for slightly higher yield.",
    source: "Liquidity preference / treasury management practice",
    reading: "Ray Dalio, Principles (pointer to risk and machine-like decision rules)",
  },
];

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/** Find the best matching economics framework for a question. */
export function findEconFramework(question: string): EconFramework | null {
  const q = norm(question);
  if (!q) return null;
  let best: EconFramework | null = null;
  let bestScore = 0;
  for (const fw of ECON_FRAMEWORKS) {
    let score = 0;
    const name = norm(fw.name);
    if (q.includes(name) || name.includes(q)) score += 50;
    for (const a of fw.aliases) {
      const na = norm(a);
      if (na.length >= 3 && q.includes(na)) score += 28;
    }
    // soft keyword hits from oneLine
    for (const w of norm(fw.oneLine).split(" ")) {
      if (w.length >= 6 && q.includes(w)) score += 2;
    }
    if (score > bestScore) {
      bestScore = score;
      best = fw;
    }
  }
  return bestScore >= 20 ? best : null;
}

/** Compact teaching reply for Mel / local copilot. */
export function explainEconFramework(fw: EconFramework): string {
  const bits = [
    `${fw.name}: ${fw.oneLine}`,
    "",
    fw.plain,
  ];
  if (fw.formula) {
    bits.push("");
    bits.push(`Formula: ${fw.formula}`);
    if (fw.formulaNote) bits.push(`Symbols: ${fw.formulaNote}`);
  }
  if (fw.gotcha) {
    bits.push("");
    bits.push(`Gotcha: ${fw.gotcha}`);
  }
  if (fw.founderMove) {
    bits.push("");
    bits.push(`Founder move: ${fw.founderMove}`);
  }
  if (fw.reading) {
    bits.push("");
    bits.push(`Further reading (pointer, not a substitute): ${fw.reading}`);
  }
  bits.push("");
  bits.push(`Source: ${fw.source}`);
  return bits.join("\n");
}

/**
 * Dense pack for system/live context.
 * Original frameworks only — safe to inject every finance turn.
 */
export function buildEconCanonPack(maxChars = 2800): string {
  const header = [
    "ECONOMICS CANON (built-in frameworks for Mel — original teaching text, not book copies)",
    "Use these when she asks about incentives, trade-offs, prices, inflation, capital, or strategy.",
    "If her Bookshelf contains a matching title, cite her shelf copy as the reading path.",
    "",
  ];
  const lines = [...header];
  let used = lines.join("\n").length;
  for (const fw of ECON_FRAMEWORKS) {
    const chunk = `• ${fw.name}: ${fw.oneLine}${fw.reading ? ` [read: ${fw.reading}]` : ""}`;
    if (used + chunk.length + 1 > maxChars) break;
    lines.push(chunk);
    used += chunk.length + 1;
  }
  return lines.join("\n");
}

/** Suggestions for finance copilot chips. */
export function econSuggestions(): string[] {
  return [
    "What is opportunity cost?",
    "Explain incentives like a founder",
    "Real vs nominal returns",
    "How do price signals work?",
    "Expected value under uncertainty",
    "Capital allocation waterfall",
  ];
}

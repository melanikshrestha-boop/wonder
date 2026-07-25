/**
 * Performance statistics.
 *
 * The P&L number tells you what happened. These tell you whether it was an
 * edge or a sample. That distinction is the entire value of paper trading, and
 * it is the thing retail platforms show least of — a big green number is more
 * engaging than an expectancy of −$4.20 a trade.
 *
 * Definitions used here are the standard ones:
 *
 *   expectancy    average P&L per trade. Negative means the strategy loses
 *                 money per trade regardless of how any single day looked.
 *   profit factor gross wins ÷ gross losses. Below 1.0 loses money.
 *   max drawdown  largest peak-to-trough fall in equity, the number that
 *                 decides whether a strategy is survivable rather than
 *                 merely profitable on paper.
 *   R-multiple    each trade's result expressed in units of its own risk,
 *                 which is the only way to compare trades of different size.
 */
import type { Account } from "./broker";

export type RoundTrip = {
  ticker: string;
  side: "long" | "short";
  shares: number;
  entryPrice: number;
  exitPrice: number;
  entryMinute: number;
  exitMinute: number;
  pnl: number;
  /** Holding period in minutes. */
  duration: number;
};

/**
 * Pair fills into completed round trips using FIFO matching, which is both the
 * tax convention and the intuitive one. Fills that only open exposure are not
 * round trips and are excluded rather than counted as zero-P&L trades.
 */
export function roundTrips(account: Account): RoundTrip[] {
  const open: Record<string, { shares: number; price: number; minute: number }[]> = {};
  const out: RoundTrip[] = [];

  for (const fill of account.fills) {
    const lots = (open[fill.ticker] ||= []);
    const signed = fill.side === "buy" ? fill.shares : -fill.shares;
    let remaining = signed;

    // Close against opposing lots first.
    while (remaining !== 0 && lots.length > 0 && Math.sign(lots[0].shares) !== Math.sign(remaining)) {
      const lot = lots[0];
      const closable = Math.min(Math.abs(remaining), Math.abs(lot.shares));
      const wasLong = lot.shares > 0;
      const pnl = (fill.price - lot.price) * closable * (wasLong ? 1 : -1);

      out.push({
        ticker: fill.ticker,
        side: wasLong ? "long" : "short",
        shares: closable,
        entryPrice: lot.price,
        exitPrice: fill.price,
        entryMinute: lot.minute,
        exitMinute: fill.minute,
        pnl: Math.round(pnl * 100) / 100,
        duration: Math.max(0, fill.minute - lot.minute),
      });

      lot.shares -= Math.sign(lot.shares) * closable;
      remaining -= Math.sign(remaining) * closable;
      if (lot.shares === 0) lots.shift();
    }

    // Anything left opens a new lot.
    if (remaining !== 0) {
      lots.push({ shares: remaining, price: fill.price, minute: fill.minute });
    }
  }
  return out;
}

export type Stats = {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  grossProfit: number;
  grossLoss: number;
  netPnl: number;
  avgWin: number;
  avgLoss: number;
  /** Average P&L per trade. The number that decides everything. */
  expectancy: number;
  /** Gross wins ÷ gross losses. Below 1 is a losing strategy. */
  profitFactor: number;
  largestWin: number;
  largestLoss: number;
  avgDuration: number;
  totalCommission: number;
  /** Total paid crossing the spread and in market impact. */
  totalSlippage: number;
  /** Consecutive-loss run, which is what actually breaks discipline. */
  maxLossStreak: number;
};

export function computeStats(account: Account): Stats {
  const trips = roundTrips(account);
  const wins = trips.filter((t) => t.pnl > 0);
  const losses = trips.filter((t) => t.pnl < 0);

  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));

  let streak = 0;
  let maxLossStreak = 0;
  for (const t of trips) {
    if (t.pnl < 0) {
      streak += 1;
      if (streak > maxLossStreak) maxLossStreak = streak;
    } else {
      streak = 0;
    }
  }

  const r2 = (n: number) => Math.round(n * 100) / 100;

  return {
    trades: trips.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trips.length ? r2((wins.length / trips.length) * 100) : 0,
    grossProfit: r2(grossProfit),
    grossLoss: r2(grossLoss),
    netPnl: r2(grossProfit - grossLoss),
    avgWin: wins.length ? r2(grossProfit / wins.length) : 0,
    avgLoss: losses.length ? r2(grossLoss / losses.length) : 0,
    expectancy: trips.length ? r2((grossProfit - grossLoss) / trips.length) : 0,
    // Infinity would render as nonsense; a run with no losses reports 0 losses
    // alongside it so the number is readable in context.
    profitFactor: grossLoss > 0 ? r2(grossProfit / grossLoss) : grossProfit > 0 ? Infinity : 0,
    largestWin: wins.length ? r2(Math.max(...wins.map((t) => t.pnl))) : 0,
    largestLoss: losses.length ? r2(Math.min(...losses.map((t) => t.pnl))) : 0,
    avgDuration: trips.length ? Math.round(trips.reduce((s, t) => s + t.duration, 0) / trips.length) : 0,
    totalCommission: r2(account.fills.reduce((s, f) => s + f.commission, 0)),
    totalSlippage: r2(account.fills.reduce((s, f) => s + f.slippageCost, 0)),
    maxLossStreak,
  };
}

export type EquityPoint = { minute: number; equity: number };

/**
 * Equity curve sampled per minute, marking open positions to market.
 * Needs the close for each ticker at each minute to mark against.
 */
export function equityCurve(
  account: Account,
  closesByTicker: Record<string, number[]>,
  throughMinute: number
): EquityPoint[] {
  const out: EquityPoint[] = [];
  const lots: Record<string, { shares: number; price: number }[]> = {};
  let cash = account.startingCash;
  let fillIndex = 0;
  const fills = [...account.fills].sort((a, b) => a.minute - b.minute);

  for (let m = 0; m <= throughMinute; m++) {
    // Apply every fill that happened at or before this minute.
    while (fillIndex < fills.length && fills[fillIndex].minute <= m) {
      const f = fills[fillIndex];
      const signed = f.side === "buy" ? f.shares : -f.shares;
      cash -= signed * f.price + f.commission;
      const list = (lots[f.ticker] ||= []);
      let remaining = signed;
      while (remaining !== 0 && list.length > 0 && Math.sign(list[0].shares) !== Math.sign(remaining)) {
        const lot = list[0];
        const closable = Math.min(Math.abs(remaining), Math.abs(lot.shares));
        lot.shares -= Math.sign(lot.shares) * closable;
        remaining -= Math.sign(remaining) * closable;
        if (lot.shares === 0) list.shift();
      }
      if (remaining !== 0) list.push({ shares: remaining, price: f.price });
      fillIndex += 1;
    }

    let marked = 0;
    for (const [ticker, list] of Object.entries(lots)) {
      const closes = closesByTicker[ticker];
      const price = closes?.[Math.min(m, closes.length - 1)];
      if (price == null) continue;
      for (const lot of list) marked += lot.shares * price;
    }
    out.push({ minute: m, equity: Math.round((cash + marked) * 100) / 100 });
  }
  return out;
}

export type DrawdownInfo = {
  /** Largest peak-to-trough fall, as a positive dollar amount. */
  maxDrawdown: number;
  maxDrawdownPct: number;
  peakEquity: number;
  troughEquity: number;
};

export function drawdown(curve: EquityPoint[]): DrawdownInfo {
  let peak = curve[0]?.equity ?? 0;
  let maxDd = 0;
  let peakAt = peak;
  let troughAt = peak;

  for (const point of curve) {
    if (point.equity > peak) peak = point.equity;
    const dd = peak - point.equity;
    if (dd > maxDd) {
      maxDd = dd;
      peakAt = peak;
      troughAt = point.equity;
    }
  }
  return {
    maxDrawdown: Math.round(maxDd * 100) / 100,
    maxDrawdownPct: peakAt > 0 ? Math.round((maxDd / peakAt) * 10000) / 100 : 0,
    peakEquity: Math.round(peakAt * 100) / 100,
    troughEquity: Math.round(troughAt * 100) / 100,
  };
}

/**
 * An honest read on the session.
 *
 * Deliberately not congratulatory. A profitable day on eight trades is not
 * evidence of an edge, and saying so is the most useful thing a paper trading
 * tool can do — the failure mode it exists to prevent is going to real money
 * on a small winning sample.
 */
export function verdict(stats: Stats, dd: DrawdownInfo): { tone: "good" | "warn" | "bad" | "info"; title: string; detail: string }[] {
  const out: { tone: "good" | "warn" | "bad" | "info"; title: string; detail: string }[] = [];
  if (stats.trades === 0) {
    return [{
      tone: "info",
      title: "No completed trades yet",
      detail: "Statistics appear once a position has been opened and closed.",
    }];
  }

  // Sign goes outside the currency symbol: −$126.00, not $-126.00.
  const money = (n: number) =>
    `${n < 0 ? "−" : n > 0 ? "+" : ""}$${Math.abs(n).toFixed(2)}`;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

  out.push({
    tone: stats.expectancy > 0 ? "good" : "bad",
    title: `Expectancy ${money(stats.expectancy)} per trade`,
    detail:
      stats.expectancy > 0
        ? `Across ${plural(stats.trades, "trade")}, the average one made money. Profit factor ${stats.profitFactor === Infinity ? "∞ (no losing trades yet)" : stats.profitFactor.toFixed(2)}.`
        : `Across ${plural(stats.trades, "trade")}, the average one lost money. Repeating this strategy loses $${Math.abs(stats.expectancy).toFixed(2)} per trade on average, regardless of today's total.`,
  });

  if (stats.trades < 30) {
    out.push({
      tone: "warn",
      title: `${plural(stats.trades, "trade")} is too few to conclude anything`,
      detail:
        "At this sample size the result is dominated by variance. A coin-flip strategy produces winning days routinely. Thirty-plus trades is the minimum before expectancy means much, and hundreds before it is reliable.",
    });
  }

  const costs = stats.totalCommission + stats.totalSlippage;
  if (costs > 0 && stats.grossProfit > 0) {
    const share = (costs / stats.grossProfit) * 100;
    out.push({
      tone: share > 40 ? "bad" : share > 20 ? "warn" : "info",
      title: `Costs consumed $${costs.toFixed(2)}`,
      detail: `Spread, market impact and commission came to ${share.toFixed(0)}% of gross profit. This is the cost that scales directly with how often you trade.`,
    });
  }

  if (dd.maxDrawdown > 0) {
    out.push({
      tone: dd.maxDrawdownPct > 20 ? "bad" : dd.maxDrawdownPct > 10 ? "warn" : "info",
      title: `Max drawdown $${dd.maxDrawdown.toFixed(2)} (${dd.maxDrawdownPct.toFixed(1)}%)`,
      detail: `Equity fell from $${dd.peakEquity.toFixed(2)} to $${dd.troughEquity.toFixed(2)} at its worst. With real money this is the point at which most people abandon the plan.`,
    });
  }

  if (stats.maxLossStreak >= 4) {
    out.push({
      tone: "warn",
      title: `${stats.maxLossStreak} losses in a row at worst`,
      detail: "Consecutive losses are what break position sizing discipline, not the size of any single loss.",
    });
  }

  if (stats.winRate >= 60 && stats.expectancy < 0) {
    out.push({
      tone: "bad",
      title: `Winning ${stats.winRate.toFixed(0)}% of trades and still losing money`,
      detail: `Average win $${stats.avgWin.toFixed(2)} against average loss $${stats.avgLoss.toFixed(2)}. A high win rate with losses larger than wins is a losing strategy that feels like a winning one.`,
    });
  }

  return out;
}

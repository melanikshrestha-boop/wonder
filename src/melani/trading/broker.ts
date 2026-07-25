/**
 * Paper broker — orders, fills, positions, cash.
 *
 * The design goal is that a strategy which is profitable here would still be
 * profitable with a real broker. That means charging for everything a real
 * broker charges for, even though this is fake money:
 *
 *   - You buy at the ask and sell at the bid. Never the mid. Crossing the
 *     spread is the single largest cost in frequent trading and a simulator
 *     that fills at the last price will show a profit that does not exist.
 *   - Market orders take slippage that scales with order size against
 *     available volume.
 *   - Stops are not guaranteed. A stop triggers at its level but fills at the
 *     next available price, so a gap through the stop fills worse — which is
 *     precisely the risk a stop is often wrongly assumed to remove.
 *   - Short sales are allowed and can lose more than they make, because a
 *     short's loss is unbounded above.
 *
 * Everything is integer cents internally where it touches cash, to avoid the
 * float drift that would otherwise slowly corrupt an account balance.
 */
import {
  quoteAt,
  slippageBps,
  symbolFor,
  type Candle,
  type Quote,
} from "./marketEngine";

export type Side = "buy" | "sell";
export type OrderType = "market" | "limit" | "stop" | "stop-limit" | "trailing-stop";
export type OrderStatus = "working" | "filled" | "cancelled" | "rejected";

export type Order = {
  id: string;
  ticker: string;
  side: Side;
  type: OrderType;
  shares: number;
  /** Limit price, for limit and stop-limit. */
  limitPrice?: number;
  /** Trigger price, for stop and stop-limit. */
  stopPrice?: number;
  /** Trailing distance in dollars, for trailing stops. */
  trailAmount?: number;
  /** Best price seen since placement, used to trail the stop. */
  trailAnchor?: number;
  status: OrderStatus;
  placedAtMinute: number;
  filledAtMinute?: number;
  filledPrice?: number;
  /** Why an order was rejected, shown to the trader rather than swallowed. */
  reason?: string;
  /** Attached exits placed automatically once the parent fills. */
  bracket?: { takeProfit?: number; stopLoss?: number };
};

export type Position = {
  ticker: string;
  /** Negative for a short position. */
  shares: number;
  /** Volume-weighted average entry, in dollars. */
  avgPrice: number;
  /** Realised P&L already booked on this ticker this session. */
  realized: number;
};

export type Fill = {
  id: string;
  orderId: string;
  ticker: string;
  side: Side;
  shares: number;
  price: number;
  minute: number;
  commission: number;
  /** Cost of crossing the spread plus impact, against the mid. */
  slippageCost: number;
  /** Realised P&L booked by this fill, when it closed exposure. */
  realized: number;
};

export type Account = {
  /** Uninvested cash. */
  cash: number;
  /** Cash the account started the session with. */
  startingCash: number;
  positions: Position[];
  orders: Order[];
  fills: Fill[];
};

export type BrokerSettings = {
  /** Per-trade commission. Most US brokers are zero; kept configurable. */
  commission: number;
  /** Per-share fee, as some brokers charge. */
  perShare: number;
  /** Allow short selling. */
  allowShorts: boolean;
  /** Buying power multiplier. 1 = cash account, 4 = day-trade margin. */
  leverage: number;
};

export const DEFAULT_SETTINGS: BrokerSettings = {
  commission: 0,
  perShare: 0,
  allowShorts: true,
  leverage: 4,
};

export const STARTING_CASH = 100000;

export function newAccount(startingCash = STARTING_CASH): Account {
  return {
    cash: startingCash,
    startingCash,
    positions: [],
    orders: [],
    fills: [],
  };
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function positionFor(account: Account, ticker: string): Position | undefined {
  return account.positions.find((p) => p.ticker === ticker);
}

/** Market value of open positions at current quotes. */
export function positionsValue(account: Account, quotes: Record<string, Quote>): number {
  return account.positions.reduce((sum, p) => {
    const q = quotes[p.ticker];
    if (!q) return sum;
    // A long marks at the bid and a short at the ask: what you would get out at.
    const mark = p.shares > 0 ? q.bid : q.ask;
    return sum + p.shares * mark;
  }, 0);
}

/** Cash plus the mark-to-market value of open positions. */
export function equity(account: Account, quotes: Record<string, Quote>): number {
  return round2(account.cash + positionsValue(account, quotes));
}

/** Unrealised P&L across open positions. */
export function unrealized(account: Account, quotes: Record<string, Quote>): number {
  return round2(
    account.positions.reduce((sum, p) => {
      const q = quotes[p.ticker];
      if (!q) return sum;
      const mark = p.shares > 0 ? q.bid : q.ask;
      return sum + (mark - p.avgPrice) * p.shares;
    }, 0)
  );
}

export function realizedTotal(account: Account): number {
  return round2(account.fills.reduce((sum, f) => sum + f.realized, 0));
}

/** Buying power: cash plus leverage against equity, minus what's committed. */
export function buyingPower(
  account: Account,
  quotes: Record<string, Quote>,
  settings: BrokerSettings
): number {
  const eq = equity(account, quotes);
  const gross = account.positions.reduce((sum, p) => {
    const q = quotes[p.ticker];
    return sum + Math.abs(p.shares) * (q ? q.last : p.avgPrice);
  }, 0);
  return round2(Math.max(0, eq * settings.leverage - gross));
}

// ─── Order placement ─────────────────────────────────────────────────────────

export type PlaceRequest = {
  ticker: string;
  side: Side;
  type: OrderType;
  shares: number;
  limitPrice?: number;
  stopPrice?: number;
  trailAmount?: number;
  bracket?: { takeProfit?: number; stopLoss?: number };
};

/**
 * Validate and register an order. Rejections carry a reason, because an order
 * that silently vanishes is the worst possible behaviour in a trading UI.
 */
export function placeOrder(
  account: Account,
  request: PlaceRequest,
  quote: Quote,
  minute: number,
  settings: BrokerSettings = DEFAULT_SETTINGS
): { account: Account; order: Order } {
  const shares = Math.floor(request.shares);
  const order: Order = {
    id: uid("o"),
    ticker: request.ticker,
    side: request.side,
    type: request.type,
    shares,
    limitPrice: request.limitPrice,
    stopPrice: request.stopPrice,
    trailAmount: request.trailAmount,
    trailAnchor: request.trailAmount ? quote.last : undefined,
    status: "working",
    placedAtMinute: minute,
    bracket: request.bracket,
  };

  const reject = (reason: string) => {
    order.status = "rejected";
    order.reason = reason;
    return { account: { ...account, orders: [...account.orders, order] }, order };
  };

  if (!Number.isFinite(shares) || shares <= 0) return reject("Share count must be a positive whole number");
  if (order.type === "limit" && !(order.limitPrice! > 0)) return reject("Limit order needs a limit price");
  if ((order.type === "stop" || order.type === "stop-limit") && !(order.stopPrice! > 0)) {
    return reject("Stop order needs a stop price");
  }
  if (order.type === "trailing-stop" && !(order.trailAmount! > 0)) {
    return reject("Trailing stop needs a trail amount");
  }

  const existing = positionFor(account, request.ticker);
  const held = existing?.shares ?? 0;
  const opensShort = request.side === "sell" && held - shares < 0;
  if (opensShort && !settings.allowShorts) return reject("Short selling is disabled in settings");

  // Only entries consume buying power; orders that reduce exposure never do.
  const reducing =
    (request.side === "sell" && held > 0) || (request.side === "buy" && held < 0);
  if (!reducing) {
    const estimate = shares * (request.side === "buy" ? quote.ask : quote.bid);
    const bp = buyingPower(account, { [request.ticker]: quote }, settings);
    if (estimate > bp) {
      return reject(`Not enough buying power — needs ${fmt(estimate)}, have ${fmt(bp)}`);
    }
  }

  return { account: { ...account, orders: [...account.orders, order] }, order };
}

function fmt(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function cancelOrder(account: Account, orderId: string): Account {
  return {
    ...account,
    orders: account.orders.map((o) =>
      o.id === orderId && o.status === "working" ? { ...o, status: "cancelled" as const } : o
    ),
  };
}

// ─── Execution ───────────────────────────────────────────────────────────────

/** Apply a fill to positions and cash, booking realised P&L on the closed part. */
function applyFill(
  account: Account,
  order: Order,
  rawPrice: number,
  minute: number,
  settings: BrokerSettings,
  midAtFill: number
): Account {
  // Quantise to the penny once, and use that single value for cash, the
  // position average, and the printed fill. Rounding only for display would
  // let the blotter and the cash balance drift apart trade by trade.
  const price = round2(rawPrice);
  const signed = order.side === "buy" ? order.shares : -order.shares;
  const positions = [...account.positions];
  const index = positions.findIndex((p) => p.ticker === order.ticker);
  const existing = index >= 0 ? positions[index] : undefined;
  const held = existing?.shares ?? 0;

  let realized = 0;
  let newShares = held + signed;
  let newAvg = existing?.avgPrice ?? price;

  if (existing && held !== 0 && Math.sign(signed) !== Math.sign(held)) {
    // Reducing or reversing: book P&L on the overlapping quantity.
    const closing = Math.min(Math.abs(signed), Math.abs(held));
    realized = (price - existing.avgPrice) * closing * Math.sign(held);
    if (Math.abs(signed) > Math.abs(held)) {
      // Flipped through zero — the remainder opens at the fill price.
      newAvg = price;
    }
  } else if (existing && held !== 0) {
    // Adding to the position: volume-weight the average entry.
    newAvg = (existing.avgPrice * Math.abs(held) + price * Math.abs(signed)) / Math.abs(newShares);
  } else {
    newAvg = price;
  }

  const commission = settings.commission + settings.perShare * order.shares;
  const slippageCost = Math.abs(price - midAtFill) * order.shares;

  const nextPosition: Position = {
    ticker: order.ticker,
    shares: newShares,
    avgPrice: round2(newAvg),
    realized: round2((existing?.realized ?? 0) + realized),
  };

  if (index >= 0) positions[index] = nextPosition;
  else positions.push(nextPosition);

  const fill: Fill = {
    id: uid("f"),
    orderId: order.id,
    ticker: order.ticker,
    side: order.side,
    shares: order.shares,
    price: round2(price),
    minute,
    commission: round2(commission),
    slippageCost: round2(slippageCost),
    realized: round2(realized - commission),
  };

  return {
    ...account,
    // Buying spends cash, selling raises it; shorts raise cash on the way in.
    cash: round2(account.cash - signed * price - commission),
    positions: positions.filter((p) => p.shares !== 0 || p.realized !== 0),
    orders: account.orders.map((o) =>
      o.id === order.id
        ? { ...o, status: "filled" as const, filledAtMinute: minute, filledPrice: round2(price) }
        : o
    ),
    fills: [...account.fills, fill],
  };
}

/**
 * Advance the book by one minute: check every working order against the bar
 * that just printed and fill whatever the market would have filled.
 *
 * Stops are checked against the bar's extremes, not its close, so an
 * intra-bar spike triggers them exactly as it would in the market.
 */
export function processMinute(
  account: Account,
  candlesByTicker: Record<string, Candle[]>,
  minute: number,
  settings: BrokerSettings = DEFAULT_SETTINGS
): Account {
  let next = account;

  for (const order of account.orders) {
    if (order.status !== "working") continue;
    const candles = candlesByTicker[order.ticker];
    if (!candles) continue;
    const bar = candles[Math.min(minute, candles.length - 1)];
    if (!bar) continue;

    const symbol = symbolFor(order.ticker);
    const quote = quoteAt(symbol, candles, minute);
    const mid = (quote.bid + quote.ask) / 2;
    const slipBps = slippageBps(order.shares, symbol, minute);
    const slipMult = 1 + (order.side === "buy" ? slipBps : -slipBps) / 10000;

    let fillPrice: number | null = null;

    if (order.type === "market") {
      fillPrice = (order.side === "buy" ? quote.ask : quote.bid) * slipMult;
    } else if (order.type === "limit") {
      // A buy limit fills only if the market traded at or below the limit.
      if (order.side === "buy" && bar.low <= order.limitPrice!) {
        fillPrice = Math.min(order.limitPrice!, quote.ask);
      } else if (order.side === "sell" && bar.high >= order.limitPrice!) {
        fillPrice = Math.max(order.limitPrice!, quote.bid);
      }
    } else if (order.type === "stop") {
      const triggered =
        order.side === "buy" ? bar.high >= order.stopPrice! : bar.low <= order.stopPrice!;
      if (triggered) {
        // Triggered stops become market orders — the fill is not guaranteed
        // at the stop price, which is the whole point.
        const worst = order.side === "buy" ? Math.max(order.stopPrice!, quote.ask) : Math.min(order.stopPrice!, quote.bid);
        fillPrice = worst * slipMult;
      }
    } else if (order.type === "stop-limit") {
      const triggered =
        order.side === "buy" ? bar.high >= order.stopPrice! : bar.low <= order.stopPrice!;
      if (triggered) {
        if (order.side === "buy" && bar.low <= order.limitPrice!) fillPrice = order.limitPrice!;
        if (order.side === "sell" && bar.high >= order.limitPrice!) fillPrice = order.limitPrice!;
      }
    } else if (order.type === "trailing-stop") {
      // Trail follows the favourable extreme and never retreats.
      const anchor = order.trailAnchor ?? bar.close;
      const nextAnchor =
        order.side === "sell" ? Math.max(anchor, bar.high) : Math.min(anchor, bar.low);
      const trigger =
        order.side === "sell" ? nextAnchor - order.trailAmount! : nextAnchor + order.trailAmount!;
      next = {
        ...next,
        orders: next.orders.map((o) =>
          o.id === order.id ? { ...o, trailAnchor: round2(nextAnchor) } : o
        ),
      };
      const hit = order.side === "sell" ? bar.low <= trigger : bar.high >= trigger;
      if (hit) fillPrice = (order.side === "buy" ? quote.ask : quote.bid) * slipMult;
    }

    if (fillPrice !== null) {
      next = applyFill(next, order, fillPrice, minute, settings, mid);

      // A filled parent order places its attached exits.
      if (order.bracket) {
        const exitSide: Side = order.side === "buy" ? "sell" : "buy";
        const attach = (type: OrderType, price: number) => {
          const child: Order = {
            id: uid("o"),
            ticker: order.ticker,
            side: exitSide,
            type,
            shares: order.shares,
            limitPrice: type === "limit" ? price : undefined,
            stopPrice: type === "stop" ? price : undefined,
            status: "working",
            placedAtMinute: minute,
          };
          next = { ...next, orders: [...next.orders, child] };
        };
        if (order.bracket.takeProfit) attach("limit", order.bracket.takeProfit);
        if (order.bracket.stopLoss) attach("stop", order.bracket.stopLoss);
      }
    }
  }
  return next;
}

/** Close every open position at the market — the "flatten" button. */
export function flattenAll(
  account: Account,
  candlesByTicker: Record<string, Candle[]>,
  minute: number,
  settings: BrokerSettings = DEFAULT_SETTINGS
): Account {
  let next = account;
  for (const position of account.positions) {
    if (position.shares === 0) continue;
    const candles = candlesByTicker[position.ticker];
    if (!candles) continue;
    const quote = quoteAt(symbolFor(position.ticker), candles, minute);
    const placed = placeOrder(
      next,
      {
        ticker: position.ticker,
        side: position.shares > 0 ? "sell" : "buy",
        type: "market",
        shares: Math.abs(position.shares),
      },
      quote,
      minute,
      settings
    );
    next = placed.account;
  }
  return processMinute(next, candlesByTicker, minute, settings);
}

/** Cancel every working order. */
export function cancelAll(account: Account): Account {
  return {
    ...account,
    orders: account.orders.map((o) =>
      o.status === "working" ? { ...o, status: "cancelled" as const } : o
    ),
  };
}

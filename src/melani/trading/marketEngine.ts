/**
 * Market simulation engine.
 *
 * Generates intraday price action that behaves like a real session, because a
 * simulator that is easier than the market teaches a strategy that loses money
 * the moment it meets one. Specifically it reproduces:
 *
 *   - Geometric Brownian motion, so returns compound and price cannot go
 *     negative.
 *   - A U-shaped intraday volatility curve. Real volume and volatility are
 *     highest in the first and last half hour and lowest around midday; a flat
 *     curve would make lunchtime look tradeable when it is not.
 *   - Overnight gaps, so a position held to the close does not simply resume
 *     at the same price.
 *   - Jump events at a low Poisson rate, standing in for news. Continuous
 *     diffusion alone never produces the move that takes out a stop.
 *   - A bid/ask spread that widens with volatility, which is where most of
 *     the cost of frequent trading actually comes from.
 *
 * Everything is driven by a seeded PRNG, so a session is reproducible: the
 * same seed replays the same day, which is what makes a strategy comparison
 * meaningful rather than a coin flip.
 */

export type Symbol = {
  ticker: string;
  name: string;
  /** Opening price for a fresh session. */
  basePrice: number;
  /** Annualised volatility, e.g. 0.35 = 35%. */
  volatility: number;
  /** Annualised drift. Small; direction is mostly noise intraday. */
  drift: number;
  /** Typical shares traded per minute, used to scale volume and liquidity. */
  avgVolumePerMin: number;
  /** Baseline half-spread in basis points of price. */
  spreadBps: number;
  sector: string;
};

export type Candle = {
  /** Minutes since the session open (09:30). */
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type Quote = {
  ticker: string;
  last: number;
  bid: number;
  ask: number;
  /** Change against the session's opening print. */
  change: number;
  changePct: number;
  volume: number;
  /** Session high and low so far. */
  high: number;
  low: number;
  open: number;
};

/** A trading session runs 09:30 to 16:00 — 390 one-minute bars. */
export const SESSION_MINUTES = 390;
export const SESSION_OPEN_MIN = 9 * 60 + 30;

export const SYMBOLS: Symbol[] = [
  { ticker: "NVDA", name: "NVIDIA",            basePrice: 121.4, volatility: 0.52, drift: 0.18, avgVolumePerMin: 620000, spreadBps: 1.2, sector: "Semiconductors" },
  { ticker: "AAPL", name: "Apple",             basePrice: 228.7, volatility: 0.24, drift: 0.09, avgVolumePerMin: 380000, spreadBps: 0.8, sector: "Consumer tech" },
  { ticker: "TSLA", name: "Tesla",             basePrice: 342.9, volatility: 0.61, drift: 0.05, avgVolumePerMin: 540000, spreadBps: 1.6, sector: "Autos" },
  { ticker: "SPY",  name: "S&P 500 ETF",       basePrice: 585.2, volatility: 0.14, drift: 0.08, avgVolumePerMin: 450000, spreadBps: 0.5, sector: "Index" },
  { ticker: "AMD",  name: "AMD",               basePrice: 142.3, volatility: 0.48, drift: 0.06, avgVolumePerMin: 310000, spreadBps: 1.4, sector: "Semiconductors" },
  { ticker: "MSFT", name: "Microsoft",         basePrice: 429.6, volatility: 0.22, drift: 0.10, avgVolumePerMin: 220000, spreadBps: 0.8, sector: "Software" },
  { ticker: "GME",  name: "GameStop",          basePrice: 23.8,  volatility: 1.15, drift: -0.05, avgVolumePerMin: 180000, spreadBps: 4.5, sector: "Retail" },
  { ticker: "COIN", name: "Coinbase",          basePrice: 268.4, volatility: 0.78, drift: 0.04, avgVolumePerMin: 140000, spreadBps: 2.8, sector: "Crypto" },
];

export function symbolFor(ticker: string): Symbol {
  return SYMBOLS.find((s) => s.ticker === ticker) || SYMBOLS[0];
}

// ─── Seeded randomness ───────────────────────────────────────────────────────

/**
 * mulberry32 — small, fast, and good enough for price paths. The important
 * property is reproducibility: the same seed always replays the same session.
 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller: two uniforms to one standard normal. */
function gaussian(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Intraday volatility multiplier across the session.
 *
 * Empirically volatility traces a U: elevated at the open as overnight news is
 * priced in, falling into midday, rising again into the close as positions are
 * squared. Returns roughly 1.9 at the open, 0.65 midday, 1.5 at the close.
 */
export function volatilityCurve(minute: number): number {
  const x = Math.min(1, Math.max(0, minute / SESSION_MINUTES));
  const openBurst = 1.25 * Math.exp(-x * 9);
  const closeBurst = 0.85 * Math.exp(-(1 - x) * 7);
  return 0.65 + openBurst + closeBurst;
}

/** Session minute → wall-clock label, e.g. 0 → "09:30". */
export function clockLabel(minute: number): string {
  const total = SESSION_OPEN_MIN + minute;
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ─── Path generation ─────────────────────────────────────────────────────────

/** Per-minute variance from an annualised figure: 252 sessions × 390 minutes. */
const MINUTES_PER_YEAR = 252 * SESSION_MINUTES;

/**
 * Build one full session of one-minute candles.
 *
 * Each minute is generated as several sub-steps so the high and low are real
 * extremes of the path rather than just the endpoints — a candle whose wick is
 * fabricated would make stop placement meaningless.
 */
export function generateSession(params: {
  symbol: Symbol;
  seed: number;
  /** Previous close; a gap is applied against it. Defaults to basePrice. */
  previousClose?: number;
  minutes?: number;
}): Candle[] {
  const { symbol, seed } = params;
  const minutes = params.minutes ?? SESSION_MINUTES;
  const rng = makeRng(seed);
  const prevClose = params.previousClose ?? symbol.basePrice;

  // Overnight gap: a normal move scaled by roughly a third of daily vol.
  const dailyVol = symbol.volatility / Math.sqrt(252);
  const gap = gaussian(rng) * dailyVol * 0.35;
  let price = prevClose * Math.exp(gap);

  const driftPerMin = symbol.drift / MINUTES_PER_YEAR;
  const baseSigma = symbol.volatility / Math.sqrt(MINUTES_PER_YEAR);
  const candles: Candle[] = [];
  const SUBSTEPS = 6;

  for (let m = 0; m < minutes; m++) {
    const volMult = volatilityCurve(m);
    const sigma = (baseSigma * volMult) / Math.sqrt(SUBSTEPS);
    const open = price;
    let high = price;
    let low = price;

    for (let s = 0; s < SUBSTEPS; s++) {
      // News jump: rare, and large enough to matter when it lands.
      let jump = 0;
      if (rng() < 0.0006) {
        jump = gaussian(rng) * dailyVol * 0.9;
      }
      const shock = gaussian(rng) * sigma + driftPerMin / SUBSTEPS + jump;
      price = price * Math.exp(shock);
      if (price > high) high = price;
      if (price < low) low = price;
    }

    // Volume tracks volatility, with heavy dispersion — real volume is spiky.
    const volNoise = 0.45 + rng() * 1.4;
    const volume = Math.round(symbol.avgVolumePerMin * volMult * volNoise);

    candles.push({
      t: m,
      open: round2(open),
      high: round2(high),
      low: round2(low),
      close: round2(price),
      volume,
    });
  }
  return candles;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Quote at a given minute, including the spread actually payable.
 *
 * The spread widens with the volatility curve, which is why the open looks
 * like the best opportunity and is also the most expensive time to trade.
 */
export function quoteAt(symbol: Symbol, candles: Candle[], minute: number): Quote {
  const i = Math.min(candles.length - 1, Math.max(0, minute));
  const bar = candles[i];
  const open = candles[0]?.open ?? bar.close;
  const seen = candles.slice(0, i + 1);

  const halfSpread = (bar.close * (symbol.spreadBps / 10000) * volatilityCurve(i)) / 2;
  const change = bar.close - open;

  return {
    ticker: symbol.ticker,
    last: bar.close,
    bid: round2(bar.close - halfSpread),
    ask: round2(bar.close + halfSpread),
    change: round2(change),
    changePct: round2((change / open) * 100),
    volume: seen.reduce((sum, c) => sum + c.volume, 0),
    high: round2(Math.max(...seen.map((c) => c.high))),
    low: round2(Math.min(...seen.map((c) => c.low))),
    open: round2(open),
  };
}

/**
 * Price impact of an order that is large relative to available liquidity.
 *
 * Modelled as a square-root function of participation rate, which is the
 * standard empirical shape. Trading 10% of a minute's volume costs noticeably
 * more than the quoted spread, and the simulator would be dishonest without
 * it — this is the cost that makes size hard.
 */
export function slippageBps(shares: number, symbol: Symbol, minute: number): number {
  const available = Math.max(1, symbol.avgVolumePerMin * volatilityCurve(minute));
  const participation = shares / available;
  return 12 * Math.sqrt(Math.max(0, participation)) * 100;
}

/** Aggregate 1-minute candles into a coarser timeframe. */
export function aggregate(candles: Candle[], size: number): Candle[] {
  if (size <= 1) return candles;
  const out: Candle[] = [];
  for (let i = 0; i < candles.length; i += size) {
    const group = candles.slice(i, i + size);
    if (!group.length) continue;
    out.push({
      t: group[0].t,
      open: group[0].open,
      high: Math.max(...group.map((c) => c.high)),
      low: Math.min(...group.map((c) => c.low)),
      close: group[group.length - 1].close,
      volume: group.reduce((s, c) => s + c.volume, 0),
    });
  }
  return out;
}

// ─── Market depth and tape ───────────────────────────────────────────────────

export type DepthLevel = { price: number; size: number; cumulative: number };
export type Depth = { bids: DepthLevel[]; asks: DepthLevel[] };

/**
 * Level 2 book. Size thins as you move away from the inside, which is what
 * makes a large market order walk the book instead of filling at the top.
 */
export function depthAt(
  symbol: Symbol,
  quote: Quote,
  minute: number,
  levels = 8,
  seed = 1
): Depth {
  const rng = makeRng(seed * 7919 + minute * 104729);
  const tick = quote.last > 100 ? 0.01 : 0.01;
  const baseSize = Math.max(100, symbol.avgVolumePerMin / 60);
  const bids: DepthLevel[] = [];
  const asks: DepthLevel[] = [];
  let cumBid = 0;
  let cumAsk = 0;

  for (let i = 0; i < levels; i++) {
    // Depth grows with distance from the inside, unevenly.
    const grow = 1 + i * 0.55;
    const bidSize = Math.round(baseSize * grow * (0.5 + rng()));
    const askSize = Math.round(baseSize * grow * (0.5 + rng()));
    cumBid += bidSize;
    cumAsk += askSize;
    bids.push({ price: round2(quote.bid - i * tick), size: bidSize, cumulative: cumBid });
    asks.push({ price: round2(quote.ask + i * tick), size: askSize, cumulative: cumAsk });
  }
  return { bids, asks };
}

export type TapePrint = {
  time: string;
  price: number;
  size: number;
  /** Which side the aggressor took — buys lift the ask, sells hit the bid. */
  side: "buy" | "sell";
};

/**
 * Time & sales. Prints are generated from the minute's volume, split into
 * lots with a bias toward the direction the bar actually moved, so the tape
 * agrees with the candle rather than contradicting it.
 */
export function tapeAt(
  candles: Candle[],
  minute: number,
  count = 18,
  seed = 1
): TapePrint[] {
  const out: TapePrint[] = [];
  const rng = makeRng(seed * 31337 + minute * 6673);
  for (let m = minute; m >= 0 && out.length < count; m--) {
    const bar = candles[m];
    if (!bar) continue;
    const up = bar.close >= bar.open;
    const prints = Math.min(6, count - out.length);
    for (let i = 0; i < prints; i++) {
      const span = Math.max(0.01, bar.high - bar.low);
      const price = round2(bar.low + span * rng());
      // Bias the aggressor toward the bar's direction, not 50/50.
      const side: "buy" | "sell" = rng() < (up ? 0.62 : 0.38) ? "buy" : "sell";
      const size = Math.round(Math.max(1, (bar.volume / 60) * (0.15 + rng())));
      out.push({ time: clockLabel(m), price, size, side });
    }
  }
  return out.slice(0, count);
}

// ─── Indicators ──────────────────────────────────────────────────────────────

/** Simple moving average over closes, aligned to the candle array. */
export function sma(candles: Candle[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= period) sum -= candles[i - period].close;
    out.push(i >= period - 1 ? round2(sum / period) : null);
  }
  return out;
}

/** Volume-weighted average price — the intraday benchmark most desks use. */
export function vwap(candles: Candle[]): (number | null)[] {
  const out: (number | null)[] = [];
  let pv = 0;
  let vol = 0;
  for (const c of candles) {
    const typical = (c.high + c.low + c.close) / 3;
    pv += typical * c.volume;
    vol += c.volume;
    out.push(vol > 0 ? round2(pv / vol) : null);
  }
  return out;
}

/**
 * Relative strength index, Wilder's smoothing.
 * Returns null until `period` closes are available.
 */
export function rsi(candles: Candle[], period = 14): (number | null)[] {
  const out: (number | null)[] = [];
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      out.push(null);
      continue;
    }
    const change = candles[i].close - candles[i - 1].close;
    const gain = Math.max(0, change);
    const loss = Math.max(0, -change);

    if (i <= period) {
      avgGain += gain / period;
      avgLoss += loss / period;
      out.push(i === period ? rsiFrom(avgGain, avgLoss) : null);
      continue;
    }
    // Wilder's smoothing, not a simple average.
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out.push(rsiFrom(avgGain, avgLoss));
  }
  return out;
}

function rsiFrom(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round((100 - 100 / (1 + rs)) * 10) / 10;
}

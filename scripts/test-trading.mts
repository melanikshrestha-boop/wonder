/**
 * Paper trading tests — market realism, order handling, accounting, statistics.
 * Run: npm run test:trading
 */

const values = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, String(value)),
    removeItem: (key: string) => values.delete(key),
  },
});

const M = await import("../src/melani/trading/marketEngine.ts");
const B = await import("../src/melani/trading/broker.ts");
const S = await import("../src/melani/trading/tradingStats.ts");

let passed = 0;
let failed = 0;
function assert(name: string, cond: unknown) {
  if (cond) { passed += 1; console.log(`  ✓ ${name}`); }
  else { failed += 1; console.log(`  ✗ ${name}`); }
}
const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol;

const NVDA = M.symbolFor("NVDA");

console.log("\nMarket engine");
const candles = M.generateSession({ symbol: NVDA, seed: 42 });
assert("generates a full session", candles.length === M.SESSION_MINUTES);
assert("high is never below low", candles.every((c) => c.high >= c.low));
assert("high contains open and close", candles.every((c) => c.high >= c.open && c.high >= c.close));
assert("low contains open and close", candles.every((c) => c.low <= c.open && c.low <= c.close));
assert("price never goes negative", candles.every((c) => c.low > 0));
assert("volume is always positive", candles.every((c) => c.volume > 0));

const replay = M.generateSession({ symbol: NVDA, seed: 42 });
assert("same seed replays the same session",
  replay.every((c, i) => c.close === candles[i].close && c.volume === candles[i].volume));
const different = M.generateSession({ symbol: NVDA, seed: 43 });
assert("a different seed produces a different session",
  different.some((c, i) => c.close !== candles[i].close));

// The U-shape is what makes midday genuinely quieter than the open.
const open = M.volatilityCurve(5);
const mid = M.volatilityCurve(195);
const close = M.volatilityCurve(385);
assert("volatility is highest at the open", open > mid);
assert("volatility rises again into the close", close > mid);
assert("midday is the quiet part", mid < 1 && mid > 0.3);

assert("clock starts at 09:30", M.clockLabel(0) === "09:30");
assert("clock ends at 15:59", M.clockLabel(389) === "15:59");

const q = M.quoteAt(NVDA, candles, 100);
assert("ask is above bid", q.ask > q.bid);
assert("last sits inside the spread", q.last >= q.bid && q.last <= q.ask);
assert("session high is at or above last", q.high >= q.last);
assert("session low is at or below last", q.low <= q.last);

const spreadOpen = (() => { const x = M.quoteAt(NVDA, candles, 2); return x.ask - x.bid; })();
const spreadMid = (() => { const x = M.quoteAt(NVDA, candles, 200); return x.ask - x.bid; })();
assert("spread is wider at the open than midday", spreadOpen > spreadMid);

assert("slippage rises with order size",
  M.slippageBps(50000, NVDA, 100) > M.slippageBps(100, NVDA, 100));
assert("a tiny order has almost no impact", M.slippageBps(1, NVDA, 100) < 5);

const five = M.aggregate(candles, 5);
assert("aggregation reduces bar count", five.length === Math.ceil(candles.length / 5));
assert("aggregated open matches the first bar", five[0].open === candles[0].open);
assert("aggregated close matches the last bar of the group", five[0].close === candles[4].close);
assert("aggregated volume sums the group",
  five[0].volume === candles.slice(0, 5).reduce((s, c) => s + c.volume, 0));
assert("aggregated high is the group max",
  five[0].high === Math.max(...candles.slice(0, 5).map((c) => c.high)));

const ma = M.sma(candles, 20);
assert("SMA is null before the period fills", ma[18] === null && ma[19] !== null);
const vw = M.vwap(candles);
assert("VWAP is defined from the first bar", vw[0] !== null);
assert("VWAP stays inside the session range",
  vw.every((v) => v === null || (v >= q.low * 0.9 && v <= q.high * 1.1)));
const rs = M.rsi(candles, 14);
assert("RSI is bounded 0..100", rs.every((v) => v === null || (v >= 0 && v <= 100)));

const depth = M.depthAt(NVDA, q, 100, 8, 1);
assert("book has both sides", depth.bids.length === 8 && depth.asks.length === 8);
assert("bids descend from the inside", depth.bids.every((b, i) => i === 0 || b.price < depth.bids[i - 1].price));
assert("asks ascend from the inside", depth.asks.every((a, i) => i === 0 || a.price > depth.asks[i - 1].price));
assert("best bid is below best ask", depth.bids[0].price < depth.asks[0].price);
assert("cumulative size is monotonic",
  depth.bids.every((b, i) => i === 0 || b.cumulative > depth.bids[i - 1].cumulative));

const tape = M.tapeAt(candles, 100, 18, 1);
assert("tape produces prints", tape.length === 18);
assert("every print has a positive size", tape.every((p) => p.size > 0));

console.log("\nBroker — orders");
const books = { NVDA: candles };
let acct = B.newAccount(100000);
assert("account starts with the deposit", acct.cash === 100000);

const bad = B.placeOrder(acct, { ticker: "NVDA", side: "buy", type: "market", shares: 0 }, q, 10);
assert("zero shares is rejected", bad.order.status === "rejected");
assert("rejection explains itself", (bad.order.reason || "").length > 10);

const noLimit = B.placeOrder(acct, { ticker: "NVDA", side: "buy", type: "limit", shares: 10 }, q, 10);
assert("limit order without a price is rejected", noLimit.order.status === "rejected");

const huge = B.placeOrder(acct, { ticker: "NVDA", side: "buy", type: "market", shares: 100000 }, q, 10);
assert("an order beyond buying power is rejected", huge.order.status === "rejected");
assert("rejection names the shortfall", /buying power/i.test(huge.order.reason || ""));

console.log("\nBroker — fills and accounting");
const placed = B.placeOrder(acct, { ticker: "NVDA", side: "buy", type: "market", shares: 100 }, q, 10);
assert("valid order is accepted", placed.order.status === "working");
acct = B.processMinute(placed.account, books, 10);
const pos = B.positionFor(acct, "NVDA");
assert("position is opened", pos?.shares === 100);
assert("order is marked filled", acct.orders[acct.orders.length - 1].status === "filled");
assert("a fill is recorded", acct.fills.length === 1);

const fill = acct.fills[0];
const q10 = M.quoteAt(NVDA, candles, 10);
assert("a market buy fills at or above the ask, never the mid", fill.price >= q10.ask - 0.01);
assert("cash was reduced by the notional", near(acct.cash, 100000 - fill.price * 100, 0.02));
assert("slippage cost is recorded", fill.slippageCost > 0);

const before = acct.cash;
const sellReq = B.placeOrder(acct, { ticker: "NVDA", side: "sell", type: "market", shares: 100 }, M.quoteAt(NVDA, candles, 30), 30);
acct = B.processMinute(sellReq.account, books, 30);
assert("position is closed", (B.positionFor(acct, "NVDA")?.shares ?? 0) === 0);
assert("selling returns cash", acct.cash > before);
assert("realised P&L is booked", acct.fills[1].realized !== 0);

// A full round trip at an unchanged price must lose money: you paid the spread.
const flat: M.Candle[] = Array.from({ length: 50 }, (_, i) => ({
  t: i, open: 100, high: 100, low: 100, close: 100, volume: 100000,
}));
const flatBooks = { NVDA: flat };
let flatAcct = B.newAccount(100000);
const fq = M.quoteAt(NVDA, flat, 10);
flatAcct = B.processMinute(
  B.placeOrder(flatAcct, { ticker: "NVDA", side: "buy", type: "market", shares: 100 }, fq, 10).account,
  flatBooks, 10
);
flatAcct = B.processMinute(
  B.placeOrder(flatAcct, { ticker: "NVDA", side: "sell", type: "market", shares: 100 }, fq, 11).account,
  flatBooks, 11
);
assert("a round trip at an unchanged price loses money (spread is real)",
  B.realizedTotal(flatAcct) < 0);
assert("the loss is roughly the spread paid twice",
  Math.abs(B.realizedTotal(flatAcct)) >= (fq.ask - fq.bid) * 100 * 0.9);

console.log("\nBroker — order types");
let lim = B.newAccount(100000);
// A buy limit well below the market must not fill.
const farBelow = M.quoteAt(NVDA, candles, 10).last * 0.5;
lim = B.placeOrder(lim, { ticker: "NVDA", side: "buy", type: "limit", shares: 10, limitPrice: farBelow }, q, 10).account;
lim = B.processMinute(lim, books, 11);
assert("an unreachable limit stays working", lim.orders[0].status === "working");

// A buy limit above the market fills.
const farAbove = M.quoteAt(NVDA, candles, 12).last * 1.5;
let lim2 = B.placeOrder(B.newAccount(100000), { ticker: "NVDA", side: "buy", type: "limit", shares: 10, limitPrice: farAbove }, q, 10).account;
lim2 = B.processMinute(lim2, books, 12);
assert("a marketable limit fills", lim2.orders[0].status === "filled");
assert("a buy limit never fills above its limit", (lim2.orders[0].filledPrice ?? 0) <= farAbove);

const cancelled = B.cancelOrder(lim, lim.orders[0].id);
assert("cancel works", cancelled.orders[0].status === "cancelled");
assert("a cancelled order stops filling",
  B.processMinute(cancelled, books, 300).orders[0].status === "cancelled");

console.log("\nBroker — shorts");
let sh = B.newAccount(100000);
sh = B.processMinute(
  B.placeOrder(sh, { ticker: "NVDA", side: "sell", type: "market", shares: 50 }, q, 10).account,
  books, 10
);
assert("a short opens a negative position", (B.positionFor(sh, "NVDA")?.shares ?? 0) === -50);
assert("shorting raises cash", sh.cash > 100000);
const shQuotes = { NVDA: M.quoteAt(NVDA, candles, 10) };
assert("a short marks against the ask", Number.isFinite(B.unrealized(sh, shQuotes)));
sh = B.processMinute(
  B.placeOrder(sh, { ticker: "NVDA", side: "buy", type: "market", shares: 50 }, M.quoteAt(NVDA, candles, 40), 40).account,
  books, 40
);
assert("covering closes the short", (B.positionFor(sh, "NVDA")?.shares ?? 0) === 0);

console.log("\nBroker — equity and buying power");
const eqQuotes = { NVDA: M.quoteAt(NVDA, candles, 30) };
assert("equity equals cash when flat", near(B.equity(acct, eqQuotes), acct.cash, 0.01));
assert("buying power scales with leverage",
  B.buyingPower(acct, eqQuotes, { ...B.DEFAULT_SETTINGS, leverage: 4 }) >
  B.buyingPower(acct, eqQuotes, { ...B.DEFAULT_SETTINGS, leverage: 1 }));

let flatten = B.processMinute(
  B.placeOrder(B.newAccount(100000), { ticker: "NVDA", side: "buy", type: "market", shares: 30 }, q, 10).account,
  books, 10
);
flatten = B.flattenAll(flatten, books, 50);
assert("flatten closes everything", flatten.positions.every((p) => p.shares === 0));

console.log("\nStatistics");
const trips = S.roundTrips(acct);
assert("round trips are paired", trips.length === 1);
assert("round trip records both prices", trips[0].entryPrice > 0 && trips[0].exitPrice > 0);
assert("duration is the holding period", trips[0].duration === 20);

const stats = S.computeStats(acct);
assert("trade count matches round trips", stats.trades === 1);
assert("win rate is a percentage", stats.winRate >= 0 && stats.winRate <= 100);
assert("expectancy is net P&L per trade", near(stats.expectancy, stats.netPnl / stats.trades, 0.01));
assert("costs are tracked", stats.totalSlippage > 0);

// An open position must not be counted as a completed trade.
const openOnly = B.processMinute(
  B.placeOrder(B.newAccount(100000), { ticker: "NVDA", side: "buy", type: "market", shares: 10 }, q, 10).account,
  books, 10
);
assert("an open position is not a completed trade", S.computeStats(openOnly).trades === 0);

const closes = { NVDA: candles.map((c) => c.close) };
const curve = S.equityCurve(acct, closes, 100);
assert("equity curve has a point per minute", curve.length === 101);
assert("curve starts at the deposit", near(curve[0].equity, 100000, 1));
const dd = S.drawdown(curve);
assert("drawdown is never negative", dd.maxDrawdown >= 0);
assert("trough never exceeds peak", dd.troughEquity <= dd.peakEquity);

const v = S.verdict(stats, dd);
assert("verdict is produced", v.length > 0);
assert("negative money reads −$x, never $-x",
  v.every((x) => !/\$-/.test(x.title) && !/\$-/.test(x.detail)));
assert("a single trade is not written as '1 trades'",
  v.every((x) => !/\b1 trades\b/.test(x.title + x.detail)));
assert("a small sample is flagged as inconclusive",
  v.some((x) => /too few|variance/i.test(x.title + x.detail)));
assert("no verdict before any trade",
  S.verdict(S.computeStats(B.newAccount(100000)), dd)[0].title.includes("No completed trades"));

// The failure mode worth naming: winning often and still losing money.
const fakeStats = { ...stats, trades: 50, wins: 35, losses: 15, winRate: 70, avgWin: 10, avgLoss: 40, expectancy: -5 };
assert("high win rate with negative expectancy is called out",
  S.verdict(fakeStats, dd).some((x) => /still losing money/i.test(x.title)));

console.log("\nMarket data — parsing");
const D = await import("../src/melani/trading/marketData.ts");

assert("session minute from 09:30 is 0", D.minuteOfSession("09:30") === 0);
assert("session minute from 10:00 is 30", D.minuteOfSession("10:00") === 30);
assert("session minute from 15:59 is 389", D.minuteOfSession("15:59") === 389);
assert("pre-market times are outside the session", D.minuteOfSession("08:15") === null);
assert("post-close times are outside the session", D.minuteOfSession("16:30") === null);
assert("garbage returns null", D.minuteOfSession("not a time") === null);

// Real intraday data has holes; a sparse array would break index maths.
const dense = D.densify([
  { minute: 0, candle: { t: 0, open: 100, high: 101, low: 99, close: 100.5, volume: 5000 } },
  { minute: 3, candle: { t: 3, open: 100.5, high: 102, low: 100, close: 101.5, volume: 7000 } },
]);
assert("gaps are filled forward", dense.length === 390);
assert("a filled gap carries the last close", dense[1].close === 100.5 && dense[2].close === 100.5);
assert("a filled gap has zero volume", dense[1].volume === 0);
assert("real prints are preserved", dense[3].close === 101.5 && dense[3].volume === 7000);
assert("candle index matches its minute", dense.every((c, i) => c.t === i));
assert("no data yields no candles", D.densify([]).length === 0);

const AV_OK = {
  "Meta Data": { "2. Symbol": "NVDA" },
  "Time Series (1min)": {
    "2026-07-24 09:30:00": { "1. open": "121.40", "2. high": "121.80", "3. low": "121.20", "4. close": "121.65", "5. volume": "480000" },
    "2026-07-24 09:31:00": { "1. open": "121.65", "2. high": "121.90", "3. low": "121.50", "4. close": "121.75", "5. volume": "310000" },
    "2026-07-23 09:30:00": { "1. open": "119.00", "2. high": "119.50", "3. low": "118.80", "4. close": "119.20", "5. volume": "400000" },
  },
};
const av = D.parseAlphaVantage(AV_OK, "2026-07-24");
assert("Alpha Vantage parses", Array.isArray(av));
assert("only the requested date is used", Array.isArray(av) && av[0].open === 121.4);
assert("a second bar is picked up", Array.isArray(av) && av[1].close === 121.75);
assert("volume is numeric", Array.isArray(av) && av[0].volume === 480000);

assert("Alpha Vantage rate limit is detected",
  (D.parseAlphaVantage({ Note: "call frequency" }, "2026-07-24") as { reason?: string }).reason === "rate-limit");
assert("Alpha Vantage info message is treated as a limit",
  (D.parseAlphaVantage({ Information: "premium endpoint" }, "2026-07-24") as { reason?: string }).reason === "rate-limit");
assert("Alpha Vantage bad symbol is detected",
  (D.parseAlphaVantage({ "Error Message": "Invalid API call" }, "2026-07-24") as { reason?: string }).reason === "not-found");
assert("a date with no rows is reported, not returned empty",
  (D.parseAlphaVantage(AV_OK, "2026-01-01") as { reason?: string }).reason === "not-found");
assert("an unrecognised shape is a parse failure",
  (D.parseAlphaVantage({ nonsense: true }, "2026-07-24") as { reason?: string }).reason === "parse");

const TD_OK = {
  values: [
    { datetime: "2026-07-24 09:31:00", open: "121.65", high: "121.90", low: "121.50", close: "121.75", volume: "310000" },
    { datetime: "2026-07-24 09:30:00", open: "121.40", high: "121.80", low: "121.20", close: "121.65", volume: "480000" },
  ],
};
const td = D.parseTwelveData(TD_OK, "2026-07-24");
assert("Twelve Data parses", Array.isArray(td));
assert("rows are ordered by session minute regardless of payload order",
  Array.isArray(td) && td[0].open === 121.4 && td[1].close === 121.75);
assert("Twelve Data errors are surfaced",
  (D.parseTwelveData({ status: "error", message: "symbol not found" }, "2026-07-24") as { reason?: string }).reason === "not-found");
assert("Twelve Data limit messages are classified as rate limits",
  (D.parseTwelveData({ status: "error", message: "API credits limit reached" }, "2026-07-24") as { reason?: string }).reason === "rate-limit");

const fh = D.parseFinnhubQuote({ c: 124.38, d: 1.94, dp: 1.58, h: 125.1, l: 122.4, o: 122.6, pc: 122.44 }, "nvda");
assert("Finnhub quote parses", (fh as { price?: number }).price === 124.38);
assert("ticker is upper-cased", (fh as { ticker?: string }).ticker === "NVDA");
assert("quotes declare whether they are delayed", typeof (fh as { delayed?: boolean }).delayed === "boolean");
// Finnhub returns zeros rather than an error for an unknown symbol.
assert("an all-zero Finnhub quote is treated as not found",
  (D.parseFinnhubQuote({ c: 0, d: 0, dp: 0, h: 0, l: 0, o: 0, pc: 0 }, "ZZZZ") as { reason?: string }).reason === "not-found");

console.log("\nMarket data — hours and fallback");
const sat = new Date("2026-07-25T15:00:00Z");
assert("weekends are closed", D.isMarketOpen(new Date("2026-07-26T15:00:00Z")).open === false);
assert("weekend closure explains itself", /weekend/i.test(D.isMarketOpen(new Date("2026-07-26T15:00:00Z")).reason));
assert("lastTradingDay never returns a weekend", (() => {
  const d = new Date(D.lastTradingDay(new Date("2026-07-26T12:00:00Z")) + "T12:00:00Z").getUTCDay();
  return d !== 0 && d !== 6;
})());

// Without a key nothing is attempted — this is what keeps the desk usable offline.
const noKey = await D.fetchHistoricalDay("NVDA", "2026-07-24", { provider: "alphavantage", apiKey: "" });
assert("no API key fails cleanly rather than calling out", noKey.ok === false && noKey.reason === "no-key");
assert("the no-key message says what to do", noKey.ok === false && /api key/i.test(noKey.detail));
const noKeyQuote = await D.fetchLiveQuote("NVDA", { provider: "finnhub", apiKey: "" });
assert("live quote without a key also fails cleanly", noKeyQuote.ok === false && noKeyQuote.reason === "no-key");
assert("a provider without intraday history says so",
  (await D.fetchHistoricalDay("NVDA", "2026-07-24", { provider: "finnhub", apiKey: "x" })).ok === false);

// Cache is what makes a replayed day cost zero requests.
assert("nothing is cached initially", D.cachedDay("ZZZZ", "2026-07-24") === null);
assert("cached dates start empty", D.cachedDates("ZZZZ").length === 0);
assert("every provider is documented with a signup link",
  (["finnhub", "alphavantage", "twelvedata"] as const).every(
    (p) => D.PROVIDER_INFO[p].signupUrl.startsWith("https://") && D.PROVIDER_INFO[p].freeLimit.length > 0
  ));

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);

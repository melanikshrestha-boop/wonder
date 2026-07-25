/**
 * Paper trading desk.
 *
 * Layout follows the shape a real terminal uses, because the muscle memory
 * should transfer:
 *
 *   ┌ account bar: equity, day P&L, buying power, clock, speed ─────────┐
 *   │ watchlist │ chart + tape/depth          │ order ticket            │
 *   │           │                             │ positions               │
 *   ├ blotter: working orders, fills, statistics ───────────────────────┤
 *
 * Fake money, real frictions. See broker.ts for what is charged and why.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  aggregate,
  clockLabel,
  depthAt,
  generateSession,
  quoteAt,
  SESSION_MINUTES,
  symbolFor,
  SYMBOLS,
  tapeAt,
  type Candle,
  type Quote,
} from "./marketEngine";
import {
  buyingPower,
  cancelAll,
  cancelOrder,
  equity,
  flattenAll,
  placeOrder,
  positionFor,
  processMinute,
  realizedTotal,
  unrealized,
  type Order,
  type OrderType,
  type Side,
} from "./broker";
import {
  computeStats,
  drawdown,
  equityCurve,
  roundTrips,
  verdict,
} from "./tradingStats";
import {
  loadSession,
  nextDay,
  onTradingChange,
  resetAll,
  saveSession,
  type SessionState,
} from "./tradingStore";
import { CandleChart, type ChartOverlays } from "./CandleChart";
import "./trading.css";

const SPEEDS = [
  { label: "Paused", msPerMin: 0 },
  { label: "1×", msPerMin: 1000 },
  { label: "5×", msPerMin: 200 },
  { label: "30×", msPerMin: 33 },
  { label: "60×", msPerMin: 16 },
];

const TIMEFRAMES = [
  { label: "1m", size: 1 },
  { label: "5m", size: 5 },
  { label: "15m", size: 15 },
];

function money(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function signed(n: number): string {
  return `${n >= 0 ? "+" : "−"}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function TradingDesk() {
  const [session, setSession] = useState<SessionState>(() => loadSession());
  const [ticker, setTicker] = useState("NVDA");
  const [speedIndex, setSpeedIndex] = useState(0);
  const [timeframe, setTimeframe] = useState(0);
  const [overlays, setOverlays] = useState<ChartOverlays>({ vwap: true, ma: true, maPeriod: 20 });
  const [rightTab, setRightTab] = useState<"tape" | "depth">("tape");
  const [blotterTab, setBlotterTab] = useState<"orders" | "fills" | "stats">("stats");

  // Order ticket
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [shares, setShares] = useState(100);
  const [limitPrice, setLimitPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [trailAmount, setTrailAmount] = useState("");
  const [useBracket, setUseBracket] = useState(false);
  const [takeProfit, setTakeProfit] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null);

  const sessionRef = useRef(session);
  sessionRef.current = session;

  useEffect(() => onTradingChange(() => setSession(loadSession())), []);

  // Prices are regenerated from the seed rather than stored — deterministic,
  // so the same day always replays identically.
  const candlesByTicker = useMemo(() => {
    const out: Record<string, Candle[]> = {};
    for (const symbol of SYMBOLS) {
      out[symbol.ticker] = generateSession({
        symbol,
        // Offset per ticker so symbols are not perfectly correlated.
        seed: session.seed + symbol.ticker.charCodeAt(0) * 7919,
        previousClose: session.previousCloses[symbol.ticker],
      });
    }
    return out;
  }, [session.seed, session.previousCloses]);

  const minute = session.minute;

  const quotes = useMemo(() => {
    const out: Record<string, Quote> = {};
    for (const symbol of SYMBOLS) {
      out[symbol.ticker] = quoteAt(symbol, candlesByTicker[symbol.ticker], minute);
    }
    return out;
  }, [candlesByTicker, minute]);

  const quote = quotes[ticker];
  const visibleCandles = useMemo(() => {
    const upTo = candlesByTicker[ticker].slice(0, minute + 1);
    return aggregate(upTo, TIMEFRAMES[timeframe].size);
  }, [candlesByTicker, ticker, minute, timeframe]);

  const account = session.account;
  const eq = equity(account, quotes);
  const dayPnl = eq - account.startingCash;
  const bp = buyingPower(account, quotes, session.settings);
  const openPnl = unrealized(account, quotes);
  const closedPnl = realizedTotal(account);

  const closesByTicker = useMemo(() => {
    const out: Record<string, number[]> = {};
    for (const [t, candles] of Object.entries(candlesByTicker)) out[t] = candles.map((c) => c.close);
    return out;
  }, [candlesByTicker]);

  const curve = useMemo(
    () => equityCurve(account, closesByTicker, minute),
    [account, closesByTicker, minute]
  );
  const stats = useMemo(() => computeStats(account), [account]);
  const dd = useMemo(() => drawdown(curve), [curve]);
  const insights = useMemo(() => verdict(stats, dd), [stats, dd]);
  const trips = useMemo(() => roundTrips(account), [account]);

  const markers = useMemo(
    () =>
      account.fills
        .filter((f) => f.ticker === ticker)
        .map((f) => ({
          t: Math.floor(f.minute / TIMEFRAMES[timeframe].size),
          price: f.price,
          side: f.side,
        })),
    [account.fills, ticker, timeframe]
  );

  const depth = useMemo(
    () => (quote ? depthAt(symbolFor(ticker), quote, minute, 8, session.seed) : null),
    [quote, ticker, minute, session.seed]
  );
  const tape = useMemo(
    () => tapeAt(candlesByTicker[ticker], minute, 20, session.seed),
    [candlesByTicker, ticker, minute, session.seed]
  );

  const say = useCallback((text: string, bad = false) => {
    setToast({ text, bad });
    window.setTimeout(() => setToast(null), 2600);
  }, []);

  /** Advance one simulated minute: fill resting orders, then move the clock. */
  const step = useCallback(() => {
    const current = sessionRef.current;
    if (current.minute >= SESSION_MINUTES - 1) return;
    const nextMinute = current.minute + 1;
    const withFills = processMinute(current.account, candlesByTicker, nextMinute, current.settings);
    const next = { ...current, minute: nextMinute, account: withFills };
    setSession(next);
    saveSession(next);
  }, [candlesByTicker]);

  useEffect(() => {
    const ms = SPEEDS[speedIndex].msPerMin;
    if (!ms) return;
    const id = window.setInterval(step, ms);
    return () => window.clearInterval(id);
  }, [speedIndex, step]);

  // Stop the clock at the close rather than running past it.
  useEffect(() => {
    if (minute >= SESSION_MINUTES - 1 && speedIndex !== 0) setSpeedIndex(0);
  }, [minute, speedIndex]);

  function submit(side: Side) {
    if (!quote) return;
    const request = {
      ticker,
      side,
      type: orderType,
      shares,
      limitPrice: limitPrice ? Number(limitPrice) : undefined,
      stopPrice: stopPrice ? Number(stopPrice) : undefined,
      trailAmount: trailAmount ? Number(trailAmount) : undefined,
      bracket: useBracket
        ? {
            takeProfit: takeProfit ? Number(takeProfit) : undefined,
            stopLoss: stopLoss ? Number(stopLoss) : undefined,
          }
        : undefined,
    };
    const { account: withOrder, order } = placeOrder(account, request, quote, minute, session.settings);
    if (order.status === "rejected") {
      say(order.reason || "Order rejected", true);
      const next = { ...session, account: withOrder };
      setSession(next);
      saveSession(next);
      return;
    }
    // Market orders fill against the current bar immediately.
    const settled = orderType === "market"
      ? processMinute(withOrder, candlesByTicker, minute, session.settings)
      : withOrder;
    const next = { ...session, account: settled };
    setSession(next);
    saveSession(next);
    say(
      orderType === "market"
        ? `${side === "buy" ? "Bought" : "Sold"} ${shares} ${ticker}`
        : `${orderType} order working: ${side} ${shares} ${ticker}`
    );
  }

  function endDay() {
    const closes: Record<string, number> = {};
    for (const [t, candles] of Object.entries(candlesByTicker)) {
      closes[t] = candles[candles.length - 1].close;
    }
    const next = nextDay(session, closes, eq);
    setSession(next);
    saveSession(next);
    say(`Day ${session.day} closed at ${money(eq)} — new session started`);
  }

  const workingOrders = account.orders.filter((o) => o.status === "working");
  const atClose = minute >= SESSION_MINUTES - 1;

  return (
    <div className="tr">
      {/* Account bar */}
      <header className="tr-top">
        <div className="tr-brand">
          <span className="tr-dot" aria-hidden />
          <div>
            <h1>Paper Desk</h1>
            <p>Simulated market · fake money · real costs</p>
          </div>
        </div>

        <div className="tr-stat">
          <span>Equity</span>
          <b>{money(eq)}</b>
        </div>
        <div className="tr-stat">
          <span>Day P&amp;L</span>
          <b className={dayPnl >= 0 ? "up" : "down"}>{signed(dayPnl)}</b>
        </div>
        <div className="tr-stat">
          <span>Open</span>
          <b className={openPnl >= 0 ? "up" : "down"}>{signed(openPnl)}</b>
        </div>
        <div className="tr-stat">
          <span>Closed</span>
          <b className={closedPnl >= 0 ? "up" : "down"}>{signed(closedPnl)}</b>
        </div>
        <div className="tr-stat">
          <span>Buying power</span>
          <b>{money(bp)}</b>
        </div>

        <div className="tr-clock">
          <b>{clockLabel(minute)}</b>
          <span>Day {session.day}{atClose ? " · closed" : ""}</span>
        </div>

        <div className="tr-speeds">
          {SPEEDS.map((s, i) => (
            <button
              key={s.label}
              className={i === speedIndex ? "on" : ""}
              disabled={atClose && i !== 0}
              onClick={() => setSpeedIndex(i)}
            >
              {s.label}
            </button>
          ))}
          <button className="tr-step" onClick={step} disabled={atClose}>Step ▸</button>
        </div>
      </header>

      <div className="tr-body">
        {/* Watchlist */}
        <aside className="tr-watch">
          <div className="tr-panel-title">Watchlist</div>
          <table className="tr-watch-table">
            <tbody>
              {SYMBOLS.map((s) => {
                const q = quotes[s.ticker];
                const held = positionFor(account, s.ticker);
                return (
                  <tr
                    key={s.ticker}
                    className={s.ticker === ticker ? "on" : ""}
                    onClick={() => setTicker(s.ticker)}
                  >
                    <td className="tr-w-sym">
                      <b>{s.ticker}</b>
                      <span>{s.name}</span>
                    </td>
                    <td className="tr-w-last">{q.last.toFixed(2)}</td>
                    <td className={`tr-w-chg ${q.change >= 0 ? "up" : "down"}`}>
                      {q.change >= 0 ? "+" : ""}{q.changePct.toFixed(2)}%
                    </td>
                    <td className="tr-w-pos">
                      {held && held.shares !== 0 ? (
                        <span className={held.shares > 0 ? "up" : "down"}>{held.shares > 0 ? "+" : ""}{held.shares}</span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </aside>

        {/* Chart */}
        <section className="tr-center">
          <div className="tr-chart-head">
            <div className="tr-sym-head">
              <h2>{ticker}</h2>
              <span className="tr-sym-name">{symbolFor(ticker).name}</span>
              <b className={quote.change >= 0 ? "up" : "down"}>{quote.last.toFixed(2)}</b>
              <span className={quote.change >= 0 ? "up" : "down"}>
                {quote.change >= 0 ? "+" : ""}{quote.change.toFixed(2)} ({quote.changePct.toFixed(2)}%)
              </span>
              <span className="tr-bidask">
                bid <b>{quote.bid.toFixed(2)}</b> · ask <b>{quote.ask.toFixed(2)}</b> · spread <b>{(quote.ask - quote.bid).toFixed(2)}</b>
              </span>
            </div>
            <div className="tr-chart-tools">
              {TIMEFRAMES.map((tf, i) => (
                <button key={tf.label} className={i === timeframe ? "on" : ""} onClick={() => setTimeframe(i)}>
                  {tf.label}
                </button>
              ))}
              <span className="tr-tool-sep" />
              <button className={overlays.vwap ? "on" : ""} onClick={() => setOverlays((o) => ({ ...o, vwap: !o.vwap }))}>VWAP</button>
              <button className={overlays.ma ? "on" : ""} onClick={() => setOverlays((o) => ({ ...o, ma: !o.ma }))}>MA{overlays.maPeriod}</button>
            </div>
          </div>
          <CandleChart candles={visibleCandles} overlays={overlays} markers={markers} height={360} />

          <div className="tr-sub">
            <div className="tr-sub-tabs">
              <button className={rightTab === "tape" ? "on" : ""} onClick={() => setRightTab("tape")}>Time &amp; sales</button>
              <button className={rightTab === "depth" ? "on" : ""} onClick={() => setRightTab("depth")}>Level 2</button>
            </div>
            {rightTab === "tape" ? (
              <table className="tr-tape">
                <thead><tr><th>Time</th><th>Price</th><th>Size</th></tr></thead>
                <tbody>
                  {tape.map((p, i) => (
                    <tr key={i} className={p.side}>
                      <td>{p.time}</td>
                      <td>{p.price.toFixed(2)}</td>
                      <td>{p.size.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : depth ? (
              <table className="tr-depth">
                <thead><tr><th>Bid size</th><th>Bid</th><th>Ask</th><th>Ask size</th></tr></thead>
                <tbody>
                  {depth.bids.map((b, i) => {
                    const a = depth.asks[i];
                    const maxCum = Math.max(depth.bids[depth.bids.length - 1].cumulative, depth.asks[depth.asks.length - 1].cumulative);
                    return (
                      <tr key={i}>
                        <td className="tr-d-size">
                          <span className="tr-d-bar bid" style={{ width: `${(b.cumulative / maxCum) * 100}%` }} />
                          <i>{b.size.toLocaleString()}</i>
                        </td>
                        <td className="up">{b.price.toFixed(2)}</td>
                        <td className="down">{a.price.toFixed(2)}</td>
                        <td className="tr-d-size">
                          <span className="tr-d-bar ask" style={{ width: `${(a.cumulative / maxCum) * 100}%` }} />
                          <i>{a.size.toLocaleString()}</i>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : null}
          </div>
        </section>

        {/* Ticket + positions */}
        <aside className="tr-right">
          <div className="tr-panel-title">Order ticket</div>
          <div className="tr-ticket">
            <div className="tr-types">
              {(["market", "limit", "stop", "stop-limit", "trailing-stop"] as OrderType[]).map((t) => (
                <button key={t} className={orderType === t ? "on" : ""} onClick={() => setOrderType(t)}>
                  {t === "trailing-stop" ? "trail" : t === "stop-limit" ? "stp lmt" : t}
                </button>
              ))}
            </div>

            <label className="tr-field">
              <span>Shares</span>
              <input type="number" min="1" step="1" value={shares}
                onChange={(e) => setShares(Math.max(1, Math.floor(Number(e.target.value) || 0)))} />
            </label>
            <div className="tr-quick-size">
              {[25, 50, 100, 250, 500].map((n) => (
                <button key={n} onClick={() => setShares(n)}>{n}</button>
              ))}
            </div>

            {(orderType === "limit" || orderType === "stop-limit") && (
              <label className="tr-field">
                <span>Limit</span>
                <input type="number" step="0.01" value={limitPrice} placeholder={quote.last.toFixed(2)}
                  onChange={(e) => setLimitPrice(e.target.value)} />
              </label>
            )}
            {(orderType === "stop" || orderType === "stop-limit") && (
              <label className="tr-field">
                <span>Stop</span>
                <input type="number" step="0.01" value={stopPrice} placeholder={quote.last.toFixed(2)}
                  onChange={(e) => setStopPrice(e.target.value)} />
              </label>
            )}
            {orderType === "trailing-stop" && (
              <label className="tr-field">
                <span>Trail $</span>
                <input type="number" step="0.01" value={trailAmount} placeholder="0.50"
                  onChange={(e) => setTrailAmount(e.target.value)} />
              </label>
            )}

            <label className="tr-check">
              <input type="checkbox" checked={useBracket} onChange={(e) => setUseBracket(e.target.checked)} />
              <span>Bracket (target + stop)</span>
            </label>
            {useBracket && (
              <div className="tr-bracket">
                <label className="tr-field">
                  <span>Target</span>
                  <input type="number" step="0.01" value={takeProfit} onChange={(e) => setTakeProfit(e.target.value)} />
                </label>
                <label className="tr-field">
                  <span>Stop</span>
                  <input type="number" step="0.01" value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} />
                </label>
              </div>
            )}

            <div className="tr-est">
              Est. cost <b>{money(shares * quote.ask)}</b> · spread cost <b>{money(shares * (quote.ask - quote.bid))}</b>
            </div>

            <div className="tr-actions">
              <button className="tr-buy" onClick={() => submit("buy")} disabled={atClose}>Buy</button>
              <button className="tr-sell" onClick={() => submit("sell")} disabled={atClose}>Sell</button>
            </div>
          </div>

          <div className="tr-panel-title">
            Positions
            {account.positions.some((p) => p.shares !== 0) && (
              <button className="tr-flat" onClick={() => {
                const next = { ...session, account: flattenAll(account, candlesByTicker, minute, session.settings) };
                setSession(next); saveSession(next); say("All positions flattened");
              }}>Flatten all</button>
            )}
          </div>
          <table className="tr-pos">
            <thead><tr><th>Sym</th><th>Qty</th><th>Avg</th><th>P&amp;L</th></tr></thead>
            <tbody>
              {account.positions.filter((p) => p.shares !== 0).length === 0 ? (
                <tr><td colSpan={4} className="tr-empty">No open positions</td></tr>
              ) : account.positions.filter((p) => p.shares !== 0).map((p) => {
                const q = quotes[p.ticker];
                const mark = p.shares > 0 ? q.bid : q.ask;
                const pnl = (mark - p.avgPrice) * p.shares;
                return (
                  <tr key={p.ticker} onClick={() => setTicker(p.ticker)}>
                    <td><b>{p.ticker}</b></td>
                    <td className={p.shares > 0 ? "up" : "down"}>{p.shares > 0 ? "+" : ""}{p.shares}</td>
                    <td>{p.avgPrice.toFixed(2)}</td>
                    <td className={pnl >= 0 ? "up" : "down"}>{signed(pnl)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </aside>
      </div>

      {/* Blotter */}
      <section className="tr-blotter">
        <div className="tr-blotter-tabs">
          <button className={blotterTab === "stats" ? "on" : ""} onClick={() => setBlotterTab("stats")}>Statistics</button>
          <button className={blotterTab === "orders" ? "on" : ""} onClick={() => setBlotterTab("orders")}>
            Orders {workingOrders.length ? `(${workingOrders.length})` : ""}
          </button>
          <button className={blotterTab === "fills" ? "on" : ""} onClick={() => setBlotterTab("fills")}>
            Trades {trips.length ? `(${trips.length})` : ""}
          </button>
          <span className="tr-blotter-spacer" />
          {workingOrders.length > 0 && (
            <button className="tr-ghost" onClick={() => {
              const next = { ...session, account: cancelAll(account) };
              setSession(next); saveSession(next); say("All working orders cancelled");
            }}>Cancel all</button>
          )}
          <button className="tr-ghost" onClick={endDay} disabled={!atClose && minute < 1}>End day →</button>
          <button className="tr-ghost danger" onClick={() => {
            if (!confirm("Reset the account to $100,000 and erase all trade history?")) return;
            setSession(resetAll());
            say("Account reset to $100,000");
          }}>Reset</button>
        </div>

        {blotterTab === "stats" && (
          <div className="tr-stats-wrap">
            <div className="tr-stat-grid">
              <div><span>Trades</span><b>{stats.trades}</b></div>
              <div><span>Win rate</span><b>{stats.winRate.toFixed(0)}%</b></div>
              <div><span>Expectancy</span><b className={stats.expectancy >= 0 ? "up" : "down"}>{signed(stats.expectancy)}</b></div>
              <div><span>Profit factor</span><b>{stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2)}</b></div>
              <div><span>Avg win</span><b className="up">{money(stats.avgWin)}</b></div>
              <div><span>Avg loss</span><b className="down">{money(stats.avgLoss)}</b></div>
              <div><span>Max drawdown</span><b className="down">{money(dd.maxDrawdown)}</b></div>
              <div><span>Costs paid</span><b>{money(stats.totalCommission + stats.totalSlippage)}</b></div>
            </div>
            <ul className="tr-verdict">
              {insights.map((v) => (
                <li key={v.title} className={`is-${v.tone}`}>
                  <b>{v.title}</b>
                  <span>{v.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {blotterTab === "orders" && (
          <table className="tr-table">
            <thead><tr><th>Time</th><th>Sym</th><th>Side</th><th>Type</th><th>Qty</th><th>Price</th><th>Status</th><th /></tr></thead>
            <tbody>
              {account.orders.length === 0 ? (
                <tr><td colSpan={8} className="tr-empty">No orders yet</td></tr>
              ) : [...account.orders].reverse().slice(0, 40).map((o: Order) => (
                <tr key={o.id} className={o.status === "rejected" ? "is-rejected" : ""}>
                  <td>{clockLabel(o.placedAtMinute)}</td>
                  <td><b>{o.ticker}</b></td>
                  <td className={o.side === "buy" ? "up" : "down"}>{o.side}</td>
                  <td>{o.type}</td>
                  <td>{o.shares}</td>
                  <td>{o.filledPrice ? o.filledPrice.toFixed(2) : o.limitPrice?.toFixed(2) || o.stopPrice?.toFixed(2) || "—"}</td>
                  <td>
                    <span className={`tr-badge ${o.status}`}>{o.status}</span>
                    {o.reason ? <em className="tr-reason">{o.reason}</em> : null}
                  </td>
                  <td>
                    {o.status === "working" && (
                      <button className="tr-x" onClick={() => {
                        const next = { ...session, account: cancelOrder(account, o.id) };
                        setSession(next); saveSession(next);
                      }}>✕</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {blotterTab === "fills" && (
          <table className="tr-table">
            <thead><tr><th>Sym</th><th>Side</th><th>Qty</th><th>Entry</th><th>Exit</th><th>Held</th><th>P&amp;L</th></tr></thead>
            <tbody>
              {trips.length === 0 ? (
                <tr><td colSpan={7} className="tr-empty">No completed round trips yet</td></tr>
              ) : [...trips].reverse().map((t, i) => (
                <tr key={i}>
                  <td><b>{t.ticker}</b></td>
                  <td className={t.side === "long" ? "up" : "down"}>{t.side}</td>
                  <td>{t.shares}</td>
                  <td>{t.entryPrice.toFixed(2)}</td>
                  <td>{t.exitPrice.toFixed(2)}</td>
                  <td>{t.duration}m</td>
                  <td className={t.pnl >= 0 ? "up" : "down"}>{signed(t.pnl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {toast && <div className={`tr-toast${toast.bad ? " bad" : ""}`}>{toast.text}</div>}
    </div>
  );
}

export const TRADING_PAGE_ID = "pg-paper-trading";

export function isTradingPage(id: string): boolean {
  return id === TRADING_PAGE_ID || id === "pg-trading" || id === "pg-day-trading";
}

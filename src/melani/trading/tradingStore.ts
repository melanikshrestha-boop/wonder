/**
 * Trading session persistence.
 *
 * The account, the seed, and the clock all survive a reload, so a session can
 * be left and resumed. The seed is stored rather than the generated price data
 * — regenerating from a seed is deterministic and costs nothing, while storing
 * 390 candles per symbol per day would fill localStorage within a week.
 */
import { newAccount, STARTING_CASH, type Account, type BrokerSettings, DEFAULT_SETTINGS } from "./broker";

export type SessionState = {
  /** Seed for the current trading day. Same seed replays the same prices. */
  seed: number;
  /** Which simulated day this is, counting from the account's first. */
  day: number;
  /** Current minute of the session, 0..389. */
  minute: number;
  account: Account;
  settings: BrokerSettings;
  /** Closing price per ticker from the previous day, so gaps chain properly. */
  previousCloses: Record<string, number>;
  /** Equity at the end of each completed day, for the multi-day curve. */
  dailyEquity: { day: number; equity: number }[];
};

const KEY = "wonder-trading-v1";
export const TRADING_EVENT = "wonder-trading-update";

export function emitTrading() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(TRADING_EVENT));
}

export function onTradingChange(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(TRADING_EVENT, cb);
  return () => window.removeEventListener(TRADING_EVENT, cb);
}

export function freshSession(seed = Math.floor(Math.random() * 1e9)): SessionState {
  return {
    seed,
    day: 1,
    minute: 0,
    account: newAccount(STARTING_CASH),
    settings: { ...DEFAULT_SETTINGS },
    previousCloses: {},
    dailyEquity: [],
  };
}

export function loadSession(): SessionState {
  try {
    if (typeof localStorage === "undefined") return freshSession();
    const raw = localStorage.getItem(KEY);
    if (!raw) return freshSession();
    const parsed = JSON.parse(raw) as Partial<SessionState>;
    if (!parsed || typeof parsed.seed !== "number" || !parsed.account) return freshSession();
    return {
      seed: parsed.seed,
      day: parsed.day ?? 1,
      minute: Math.min(389, Math.max(0, parsed.minute ?? 0)),
      account: parsed.account as Account,
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
      previousCloses: parsed.previousCloses || {},
      dailyEquity: parsed.dailyEquity || [],
    };
  } catch {
    return freshSession();
  }
}

export function saveSession(state: SessionState) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(KEY, JSON.stringify(state));
    }
  } catch {
    /* quota — the in-memory session continues regardless */
  }
  emitTrading();
}

/**
 * Roll to the next trading day: carry cash and positions, chain the closes so
 * tomorrow gaps from tonight's close, and record the day's ending equity.
 */
export function nextDay(state: SessionState, closes: Record<string, number>, endingEquity: number): SessionState {
  return {
    ...state,
    seed: (state.seed * 1103515245 + 12345) >>> 0,
    day: state.day + 1,
    minute: 0,
    previousCloses: closes,
    dailyEquity: [...state.dailyEquity, { day: state.day, equity: endingEquity }],
    account: {
      ...state.account,
      // Working orders do not survive the close; day orders expire.
      orders: state.account.orders.map((o) =>
        o.status === "working" ? { ...o, status: "cancelled" as const } : o
      ),
    },
  };
}

/** Wipe everything back to a fresh $100,000 account. */
export function resetAll(): SessionState {
  const fresh = freshSession();
  saveSession(fresh);
  return fresh;
}

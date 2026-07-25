/**
 * Real market data — historical replay and live quotes.
 *
 * Additive by design. The simulated engine remains the default and the
 * fallback: every function here can fail, and when it does the desk keeps
 * working on generated prices rather than showing an error page.
 *
 * ── Why these three providers ────────────────────────────────────────────
 * Wonder is a static app with no server, so any provider it calls must send
 * CORS headers. That rules out the obvious ones: Yahoo Finance's chart
 * endpoint and Stooq's CSV are both free and both blocked from a browser.
 * Finnhub, Alpha Vantage and Twelve Data all permit browser calls with a
 * free key, which is why they are the three implemented.
 *
 * ── What "real-time" actually means ──────────────────────────────────────
 * True real-time US equity data requires exchange licensing that costs real
 * money. Free tiers are typically 15-minute delayed; Finnhub's free tier is
 * the exception for US stocks. Every quote returned here carries a `delayed`
 * flag so the UI can say which it is rather than implying precision it does
 * not have.
 *
 * ── Caching ──────────────────────────────────────────────────────────────
 * A downloaded day is cached permanently. Free tiers are rate-limited
 * (Alpha Vantage allows 25 requests per day), so re-fetching a day you have
 * already replayed would burn the quota for no reason. Cached days also
 * replay with no network at all, which preserves the property that makes
 * replay useful: the same day, repeatable, at any speed.
 */
import type { Candle } from "./marketEngine";
import { SESSION_MINUTES } from "./marketEngine";

export type Provider = "finnhub" | "alphavantage" | "twelvedata";

export type ProviderConfig = {
  provider: Provider;
  apiKey: string;
};

export type LiveQuote = {
  ticker: string;
  price: number;
  change: number;
  changePct: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  /** True when the provider's free tier serves delayed data. */
  delayed: boolean;
  fetchedAt: number;
};

export type DataFailure = {
  ok: false;
  reason: "no-key" | "rate-limit" | "not-found" | "network" | "parse" | "market-closed";
  detail: string;
};

export type DataResult<T> = { ok: true; data: T; cached: boolean } | DataFailure;

export const PROVIDER_INFO: Record<Provider, {
  name: string;
  signupUrl: string;
  freeLimit: string;
  /** Whether the free tier serves real-time rather than delayed US quotes. */
  realtimeOnFree: boolean;
  supportsIntraday: boolean;
}> = {
  finnhub: {
    name: "Finnhub",
    signupUrl: "https://finnhub.io/register",
    freeLimit: "60 calls/minute",
    realtimeOnFree: true,
    supportsIntraday: false,
  },
  alphavantage: {
    name: "Alpha Vantage",
    signupUrl: "https://www.alphavantage.co/support/#api-key",
    freeLimit: "25 calls/day",
    realtimeOnFree: false,
    supportsIntraday: true,
  },
  twelvedata: {
    name: "Twelve Data",
    signupUrl: "https://twelvedata.com/pricing",
    freeLimit: "800 calls/day, 8/minute",
    realtimeOnFree: false,
    supportsIntraday: true,
  },
};

const CACHE_KEY = "wonder-market-cache-v1";
const CONFIG_KEY = "wonder-market-config-v1";
const TIMEOUT_MS = 12000;

// ─── Config ──────────────────────────────────────────────────────────────────

export function loadProviderConfig(): ProviderConfig {
  try {
    if (typeof localStorage === "undefined") return { provider: "alphavantage", apiKey: "" };
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return { provider: "alphavantage", apiKey: "" };
    const parsed = JSON.parse(raw) as Partial<ProviderConfig>;
    return {
      provider: (parsed.provider as Provider) || "alphavantage",
      apiKey: parsed.apiKey || "",
    };
  } catch {
    return { provider: "alphavantage", apiKey: "" };
  }
}

export function saveProviderConfig(config: ProviderConfig) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    }
  } catch {
    /* ignore */
  }
}

// ─── Cache ───────────────────────────────────────────────────────────────────

type Cache = Record<string, Candle[]>;

function readCache(): Cache {
  try {
    if (typeof localStorage === "undefined") return {};
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}") as Cache;
  } catch {
    return {};
  }
}

function writeCache(cache: Cache) {
  try {
    if (typeof localStorage === "undefined") return;
    const keys = Object.keys(cache);
    // A session is ~390 candles; 40 cached days is a few megabytes at most.
    const trimmed = keys.length > 40
      ? Object.fromEntries(keys.slice(-40).map((k) => [k, cache[k]]))
      : cache;
    localStorage.setItem(CACHE_KEY, JSON.stringify(trimmed));
  } catch {
    /* quota — replay still works this session, it just re-fetches next time */
  }
}

function cacheKey(ticker: string, date: string): string {
  return `${ticker.toUpperCase()}:${date}`;
}

export function cachedDay(ticker: string, date: string): Candle[] | null {
  return readCache()[cacheKey(ticker, date)] || null;
}

/** Dates already downloaded for a ticker, newest first. */
export function cachedDates(ticker: string): string[] {
  const prefix = `${ticker.toUpperCase()}:`;
  return Object.keys(readCache())
    .filter((k) => k.startsWith(prefix))
    .map((k) => k.slice(prefix.length))
    .sort()
    .reverse();
}

export function clearCache() {
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

// ─── Market hours ────────────────────────────────────────────────────────────

/**
 * Whether US equity regular hours are open right now.
 *
 * Weekends and the regular 09:30–16:00 ET window only. Market holidays are
 * not modelled — that needs a maintained calendar, and being wrong about
 * nine days a year is better than silently shipping a stale hardcoded list.
 */
export function isMarketOpen(now = new Date()): { open: boolean; reason: string } {
  // Convert to Eastern regardless of the viewer's timezone.
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = et.getDay();
  if (day === 0 || day === 6) return { open: false, reason: "Weekend — US equities are closed" };

  const minutes = et.getHours() * 60 + et.getMinutes();
  const open = 9 * 60 + 30;
  const close = 16 * 60;
  if (minutes < open) return { open: false, reason: `Pre-market — regular hours open at 09:30 ET` };
  if (minutes >= close) return { open: false, reason: `Closed — regular hours ended at 16:00 ET` };
  return { open: true, reason: "Regular hours" };
}

/** Most recent weekday on or before `date`, as an ISO date string. */
export function lastTradingDay(date = new Date()): string {
  const d = new Date(date);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

// ─── HTTP ────────────────────────────────────────────────────────────────────

async function getJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (response.status === 429) throw new RateLimit("Provider rate limit reached");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

class RateLimit extends Error {}

function failure(cause: unknown): DataFailure {
  if (cause instanceof RateLimit) {
    return { ok: false, reason: "rate-limit", detail: cause.message };
  }
  const detail = cause instanceof Error ? cause.message : String(cause);
  // A CORS rejection surfaces as an opaque TypeError with no status.
  if (/Failed to fetch|NetworkError|Load failed/i.test(detail)) {
    return {
      ok: false,
      reason: "network",
      detail: "Could not reach the provider. This is usually no connection, or the provider refusing browser requests.",
    };
  }
  return { ok: false, reason: "network", detail };
}

// ─── Normalisation ───────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** "HH:MM" within the session → minutes since 09:30, or null if outside it. */
export function minuteOfSession(hhmm: string): number | null {
  const match = hhmm.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  const offset = minutes - (9 * 60 + 30);
  if (offset < 0 || offset >= SESSION_MINUTES) return null;
  return offset;
}

/**
 * Turn provider rows into a dense session.
 *
 * Real intraday data has holes — thin minutes simply do not print. A sparse
 * array would break every index-based calculation downstream, so gaps are
 * filled forward from the last known close as a zero-volume bar, which is
 * what actually happened: no trades, price unchanged.
 */
export function densify(sparse: { minute: number; candle: Candle }[]): Candle[] {
  if (!sparse.length) return [];
  const byMinute = new Map<number, Candle>();
  for (const row of sparse) byMinute.set(row.minute, row.candle);

  const out: Candle[] = [];
  let last: Candle | null = null;
  for (let m = 0; m < SESSION_MINUTES; m++) {
    const found = byMinute.get(m);
    if (found) {
      out.push({ ...found, t: m });
      last = found;
      continue;
    }
    if (last) {
      out.push({ t: m, open: last.close, high: last.close, low: last.close, close: last.close, volume: 0 });
    }
    // Before the first print there is nothing to carry forward; skip.
  }
  return out;
}

// ─── Alpha Vantage ───────────────────────────────────────────────────────────

/** Parse an Alpha Vantage TIME_SERIES_INTRADAY payload for one date. */
export function parseAlphaVantage(payload: unknown, date: string): Candle[] | DataFailure {
  const body = payload as Record<string, unknown>;
  if (body?.["Note"] || body?.["Information"]) {
    return { ok: false, reason: "rate-limit", detail: String(body["Note"] || body["Information"]) };
  }
  if (body?.["Error Message"]) {
    return { ok: false, reason: "not-found", detail: String(body["Error Message"]) };
  }
  const seriesKey = Object.keys(body || {}).find((k) => k.startsWith("Time Series"));
  if (!seriesKey) return { ok: false, reason: "parse", detail: "No time series in the response" };

  const series = body[seriesKey] as Record<string, Record<string, string>>;
  const rows: { minute: number; candle: Candle }[] = [];

  for (const [stamp, values] of Object.entries(series)) {
    if (!stamp.startsWith(date)) continue;
    const minute = minuteOfSession(stamp.slice(11));
    if (minute === null) continue;
    rows.push({
      minute,
      candle: {
        t: minute,
        open: round2(Number(values["1. open"])),
        high: round2(Number(values["2. high"])),
        low: round2(Number(values["3. low"])),
        close: round2(Number(values["4. close"])),
        volume: Number(values["5. volume"]) || 0,
      },
    });
  }
  if (!rows.length) return { ok: false, reason: "not-found", detail: `No intraday data for ${date}` };
  return densify(rows);
}

// ─── Twelve Data ─────────────────────────────────────────────────────────────

export function parseTwelveData(payload: unknown, date: string): Candle[] | DataFailure {
  const body = payload as Record<string, unknown>;
  if (body?.status === "error") {
    const message = String(body.message || "Provider error");
    const rate = /limit/i.test(message);
    return { ok: false, reason: rate ? "rate-limit" : "not-found", detail: message };
  }
  const values = body?.values as Record<string, string>[] | undefined;
  if (!Array.isArray(values)) return { ok: false, reason: "parse", detail: "No values in the response" };

  const rows: { minute: number; candle: Candle }[] = [];
  for (const v of values) {
    const stamp = String(v.datetime || "");
    if (!stamp.startsWith(date)) continue;
    const minute = minuteOfSession(stamp.slice(11));
    if (minute === null) continue;
    rows.push({
      minute,
      candle: {
        t: minute,
        open: round2(Number(v.open)),
        high: round2(Number(v.high)),
        low: round2(Number(v.low)),
        close: round2(Number(v.close)),
        volume: Number(v.volume) || 0,
      },
    });
  }
  if (!rows.length) return { ok: false, reason: "not-found", detail: `No intraday data for ${date}` };
  return densify(rows);
}

// ─── Finnhub ─────────────────────────────────────────────────────────────────

export function parseFinnhubQuote(payload: unknown, ticker: string): LiveQuote | DataFailure {
  const q = payload as Record<string, number>;
  // Finnhub returns all-zero for an unknown symbol rather than an error.
  if (!q || typeof q.c !== "number" || q.c === 0) {
    return { ok: false, reason: "not-found", detail: `No quote for ${ticker}` };
  }
  return {
    ticker: ticker.toUpperCase(),
    price: round2(q.c),
    change: round2(q.d ?? 0),
    changePct: round2(q.dp ?? 0),
    high: round2(q.h ?? q.c),
    low: round2(q.l ?? q.c),
    open: round2(q.o ?? q.c),
    previousClose: round2(q.pc ?? q.c),
    delayed: !PROVIDER_INFO.finnhub.realtimeOnFree,
    fetchedAt: Date.now(),
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

function isFailure<T>(value: T | DataFailure): value is DataFailure {
  return typeof value === "object" && value !== null && (value as DataFailure).ok === false;
}

/**
 * One real trading day of one-minute candles, for replay.
 * Cache is consulted first — free tiers are small and a replayed day should
 * never cost a second request.
 */
export async function fetchHistoricalDay(
  ticker: string,
  date: string,
  config: ProviderConfig
): Promise<DataResult<Candle[]>> {
  const hit = cachedDay(ticker, date);
  if (hit && hit.length) return { ok: true, data: hit, cached: true };

  if (!config.apiKey) {
    return { ok: false, reason: "no-key", detail: `Add a free ${PROVIDER_INFO[config.provider].name} API key to download real days` };
  }
  if (!PROVIDER_INFO[config.provider].supportsIntraday) {
    return {
      ok: false,
      reason: "not-found",
      detail: `${PROVIDER_INFO[config.provider].name} does not serve intraday history on its free tier. Use Alpha Vantage or Twelve Data for replay.`,
    };
  }

  try {
    let candles: Candle[] | DataFailure;
    if (config.provider === "alphavantage") {
      const url =
        `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY` +
        `&symbol=${encodeURIComponent(ticker)}&interval=1min&outputsize=full&apikey=${encodeURIComponent(config.apiKey)}`;
      candles = parseAlphaVantage(await getJson(url), date);
    } else {
      const url =
        `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(ticker)}` +
        `&interval=1min&outputsize=5000&apikey=${encodeURIComponent(config.apiKey)}`;
      candles = parseTwelveData(await getJson(url), date);
    }

    if (isFailure(candles)) return candles;
    const cache = readCache();
    cache[cacheKey(ticker, date)] = candles;
    writeCache(cache);
    return { ok: true, data: candles, cached: false };
  } catch (cause) {
    return failure(cause);
  }
}

/** Current quote for the watchlist. Finnhub only — the others are delayed. */
export async function fetchLiveQuote(
  ticker: string,
  config: ProviderConfig
): Promise<DataResult<LiveQuote>> {
  if (!config.apiKey) {
    return { ok: false, reason: "no-key", detail: "Add an API key to see live quotes" };
  }
  try {
    let url: string;
    if (config.provider === "finnhub") {
      url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${encodeURIComponent(config.apiKey)}`;
      const parsed = parseFinnhubQuote(await getJson(url), ticker);
      if (isFailure(parsed)) return parsed;
      return { ok: true, data: parsed, cached: false };
    }
    if (config.provider === "twelvedata") {
      url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(ticker)}&apikey=${encodeURIComponent(config.apiKey)}`;
      const body = (await getJson(url)) as Record<string, string>;
      if (!body || body.status === "error" || !body.close) {
        return { ok: false, reason: "not-found", detail: String(body?.message || `No quote for ${ticker}`) };
      }
      return {
        ok: true,
        cached: false,
        data: {
          ticker: ticker.toUpperCase(),
          price: round2(Number(body.close)),
          change: round2(Number(body.change) || 0),
          changePct: round2(Number(body.percent_change) || 0),
          high: round2(Number(body.high) || Number(body.close)),
          low: round2(Number(body.low) || Number(body.close)),
          open: round2(Number(body.open) || Number(body.close)),
          previousClose: round2(Number(body.previous_close) || Number(body.close)),
          delayed: true,
          fetchedAt: Date.now(),
        },
      };
    }
    // Alpha Vantage GLOBAL_QUOTE
    url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(ticker)}&apikey=${encodeURIComponent(config.apiKey)}`;
    const body = (await getJson(url)) as Record<string, Record<string, string>>;
    const q = body?.["Global Quote"];
    if (!q || !q["05. price"]) {
      return { ok: false, reason: "not-found", detail: `No quote for ${ticker}` };
    }
    const price = round2(Number(q["05. price"]));
    return {
      ok: true,
      cached: false,
      data: {
        ticker: ticker.toUpperCase(),
        price,
        change: round2(Number(q["09. change"]) || 0),
        changePct: round2(Number(String(q["10. change percent"]).replace("%", "")) || 0),
        high: round2(Number(q["03. high"]) || price),
        low: round2(Number(q["04. low"]) || price),
        open: round2(Number(q["02. open"]) || price),
        previousClose: round2(Number(q["08. previous close"]) || price),
        delayed: true,
        fetchedAt: Date.now(),
      },
    };
  } catch (cause) {
    return failure(cause);
  }
}

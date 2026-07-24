/**
 * Net worth as a timeline, not a single number.
 * - Manual valuations for non-bank assets/liabilities (property, vehicle,
 *   business, collectibles…) with date/source/confidence provenance.
 * - Month-end series reconstructed from the ledger: today's account
 *   balances rolled back through recorded cash flow. Valuations carry
 *   forward from their last recorded point and are labeled as such —
 *   nothing is invented between data points.
 * - "Why did it change?" explanations show the arithmetic.
 */

import {
  cashOnHand,
  creditOwed,
  invested,
  netWorth,
  type FinanceAccount,
  type FinanceTx,
} from "./financeStore";
import { isTransferLike } from "./financeTransfers";

export type ValuationPoint = {
  date: string; // YYYY-MM-DD
  value: number; // dollars, positive
  source: string; // e.g. "Zillow estimate", "KBB", "my estimate"
  note?: string;
  confidence: "low" | "medium" | "high";
};

export type ValuationItem = {
  id: string;
  name: string;
  side: "asset" | "liability";
  assetClass:
    | "real-estate"
    | "vehicle"
    | "business"
    | "collectible"
    | "other";
  points: ValuationPoint[]; // kept sorted oldest → newest
};

export type WorthState = {
  version: 1;
  items: ValuationItem[];
};

const KEY = "wonder-finance-worth-v1";

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function loadWorth(): WorthState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { version: 1, items: [] };
    const parsed = JSON.parse(raw) as Partial<WorthState>;
    return {
      version: 1,
      items: Array.isArray(parsed.items)
        ? parsed.items.map((it) => ({
            ...it,
            points: [...(it.points || [])].sort((a, b) =>
              a.date.localeCompare(b.date)
            ),
          }))
        : [],
    };
  } catch {
    return { version: 1, items: [] };
  }
}

export function saveWorth(state: WorthState) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...state, version: 1 }));
  } catch {
    /* ignore */
  }
}

export function newValuationItem(
  partial?: Partial<ValuationItem>
): ValuationItem {
  return {
    id: uid("val"),
    name: partial?.name || "New asset",
    side: partial?.side || "asset",
    assetClass: partial?.assetClass || "other",
    points: partial?.points || [],
  };
}

/**
 * Latest recorded valuation on or before `date`.
 * carriedForward = the point is older than the date asked about.
 */
export function valuationAt(
  item: ValuationItem,
  date: string
): { value: number; point: ValuationPoint; carriedForward: boolean } | null {
  let best: ValuationPoint | null = null;
  for (const p of item.points) {
    if (p.date <= date) best = p;
    else break;
  }
  if (!best) return null;
  return {
    value: best.value,
    point: best,
    carriedForward: best.date < date,
  };
}

/** Month-end ISO dates for the last `months` calendar months, oldest first. */
export function monthEndDates(months: number, today = new Date()): string[] {
  const out: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i + 1, 0);
    // For the current month use today, not a future month-end
    const use = d > today ? today : d;
    const y = use.getFullYear();
    const m = String(use.getMonth() + 1).padStart(2, "0");
    const day = String(use.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${day}`);
  }
  return out;
}

/**
 * Signed ledger flow strictly AFTER `date` (income − expense).
 * Transfer-like rows are excluded: an internal move nets to zero across
 * the household, and one-sided card payments would distort history.
 */
function flowAfter(txs: FinanceTx[], date: string): number {
  let s = 0;
  for (const t of txs) {
    if (t.date <= date) continue;
    if (isTransferLike(t)) continue;
    s += t.kind === "income" ? t.amount : -t.amount;
  }
  return Math.round(s * 100) / 100;
}

export type WorthSnapshot = {
  date: string;
  /** Bank/card/invest net implied by today's balances minus later flows */
  bankNet: number;
  /** Sum of manual valuations in force at that date (assets − liabilities) */
  valuationNet: number;
  total: number;
  /** Names of items whose value was carried forward (not freshly recorded) */
  carriedForward: string[];
  /** Estimated (reconstructed) vs observed (today) */
  status: "observed" | "estimated";
};

/**
 * Net-worth series at month-ends.
 * Bank side: balance(D) = balance(today) − flow(D → today), an explainable
 * reconstruction from the ledger (labeled estimated for past dates).
 */
export function buildWorthSeries(
  accounts: FinanceAccount[],
  txs: FinanceTx[],
  worth: WorthState,
  months = 12,
  today = new Date()
): WorthSnapshot[] {
  const bankNow = netWorth(accounts);
  const dates = monthEndDates(months, today);
  const todayIso = today.toISOString().slice(0, 10);

  return dates.map((date) => {
    const bankNet =
      Math.round((bankNow - flowAfter(txs, date)) * 100) / 100;
    let valuationNet = 0;
    const carried: string[] = [];
    for (const item of worth.items) {
      const v = valuationAt(item, date);
      if (!v) continue;
      valuationNet += item.side === "asset" ? v.value : -v.value;
      if (v.carriedForward) carried.push(item.name);
    }
    valuationNet = Math.round(valuationNet * 100) / 100;
    return {
      date,
      bankNet,
      valuationNet,
      total: Math.round((bankNet + valuationNet) * 100) / 100,
      carriedForward: carried,
      status: date >= todayIso ? "observed" : "estimated",
    };
  });
}

export type WorthExplanation = {
  from: string;
  to: string;
  delta: number;
  flowPart: number; // ledger income − spending between the two dates
  valuationPart: number; // valuation changes between the two dates
  topDrivers: { label: string; amount: number }[]; // signed category drivers
  text: string;
};

/** "Net worth changed by X because…" with the arithmetic shown. */
export function explainWorthChange(
  series: WorthSnapshot[],
  txs: FinanceTx[]
): WorthExplanation | null {
  if (series.length < 2) return null;
  const prev = series[series.length - 2];
  const cur = series[series.length - 1];
  const delta = Math.round((cur.total - prev.total) * 100) / 100;
  const flowPart = Math.round((cur.bankNet - prev.bankNet) * 100) / 100;
  const valuationPart =
    Math.round((cur.valuationNet - prev.valuationNet) * 100) / 100;

  // Category drivers inside the window (transfers excluded)
  const byCat = new Map<string, number>();
  for (const t of txs) {
    if (t.date <= prev.date || t.date > cur.date) continue;
    if (isTransferLike(t)) continue;
    const signed = t.kind === "income" ? t.amount : -t.amount;
    byCat.set(t.category, (byCat.get(t.category) || 0) + signed);
  }
  const topDrivers = [...byCat.entries()]
    .map(([label, amount]) => ({
      label,
      amount: Math.round(amount * 100) / 100,
    }))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, 5);

  const dir = delta >= 0 ? "up" : "down";
  const parts: string[] = [];
  if (flowPart !== 0)
    parts.push(
      `$${Math.abs(flowPart).toFixed(2)} from cash flow (income minus spending, transfers excluded)`
    );
  if (valuationPart !== 0)
    parts.push(
      `$${Math.abs(valuationPart).toFixed(2)} from recorded valuation changes`
    );
  const text = `Net worth is ${dir} $${Math.abs(delta).toFixed(2)} since ${prev.date}: ${
    parts.length ? parts.join(" and ") : "no recorded movement"
  }.`;

  return { from: prev.date, to: cur.date, delta, flowPart, valuationPart, topDrivers, text };
}

export type WorthComposition = {
  liquid: number; // cash + checking + savings
  invested: number;
  otherBankAssets: number;
  valuationAssets: number;
  debt: number; // credit owed
  valuationLiabilities: number;
  total: number;
};

/** Current composition with valuations included (latest points). */
export function worthComposition(
  accounts: FinanceAccount[],
  worth: WorthState,
  today = new Date()
): WorthComposition {
  const todayIso = today.toISOString().slice(0, 10);
  const liquid = cashOnHand(accounts);
  const inv = invested(accounts);
  const debt = creditOwed(accounts);
  const bankAssets = accounts
    .filter((a) => a.kind !== "credit")
    .reduce((s, a) => s + a.balance, 0);
  const otherBankAssets = Math.round((bankAssets - liquid - inv) * 100) / 100;

  let valuationAssets = 0;
  let valuationLiabilities = 0;
  for (const item of worth.items) {
    const v = valuationAt(item, todayIso);
    if (!v) continue;
    if (item.side === "asset") valuationAssets += v.value;
    else valuationLiabilities += v.value;
  }
  const total =
    Math.round(
      (bankAssets - debt + valuationAssets - valuationLiabilities) * 100
    ) / 100;
  return {
    liquid,
    invested: inv,
    otherBankAssets,
    valuationAssets,
    debt,
    valuationLiabilities,
    total,
  };
}

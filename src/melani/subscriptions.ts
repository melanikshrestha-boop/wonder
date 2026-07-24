/**
 * Subscription finder — scans the ledger for recurring charges
 * (Netflix, Spotify, gym, insurance, etc.) and normalizes each to a
 * monthly + yearly cost so the drain is visible at a glance.
 * Not financial advice. Detection is heuristic, review before cancelling.
 */

import type { FinanceTx } from "./financeStore";
import { isTransferLike } from "./financeTransfers";

export type SubCadence =
  | "weekly"
  | "monthly"
  | "quarterly"
  | "yearly"
  | "irregular";

export type Subscription = {
  /** Display name (cleaned) */
  merchant: string;
  /** Normalized grouping key */
  key: string;
  cadence: SubCadence;
  /** Typical (median) charge */
  amount: number;
  /** Normalized to a per-month figure */
  monthlyCost: number;
  yearlyCost: number;
  /** How many charges were seen */
  count: number;
  lastDate: string; // YYYY-MM-DD
  /** Predicted next charge date */
  nextDate: string; // YYYY-MM-DD
  category: string;
  /** Matched a well-known subscription brand */
  known: boolean;
};

export type SubscriptionScan = {
  subs: Subscription[];
  monthlyTotal: number;
  yearlyTotal: number;
  count: number;
};

/** Well-known recurring brands — catch even a single charge. */
const KNOWN: { match: RegExp; name: string }[] = [
  { match: /netflix/i, name: "Netflix" },
  { match: /spotify/i, name: "Spotify" },
  { match: /hulu/i, name: "Hulu" },
  { match: /disney\s?\+?|disneyplus/i, name: "Disney+" },
  { match: /hbo|max\s*stream|hbomax/i, name: "HBO Max" },
  { match: /youtube\s?(premium|tv)?|google\s?(one|storage)/i, name: "YouTube / Google" },
  { match: /amazon\s?prime|prime\s?video/i, name: "Amazon Prime" },
  { match: /apple\.com\/bill|itunes|apple\s?(music|tv|one|icloud)/i, name: "Apple" },
  { match: /icloud/i, name: "iCloud" },
  { match: /paramount\+?/i, name: "Paramount+" },
  { match: /peacock/i, name: "Peacock" },
  { match: /audible/i, name: "Audible" },
  { match: /adobe/i, name: "Adobe" },
  { match: /microsoft|office\s?365|xbox/i, name: "Microsoft" },
  { match: /dropbox/i, name: "Dropbox" },
  { match: /notion/i, name: "Notion" },
  { match: /openai|chatgpt/i, name: "OpenAI" },
  { match: /claude|anthropic/i, name: "Anthropic" },
  { match: /github/i, name: "GitHub" },
  { match: /patreon/i, name: "Patreon" },
  { match: /substack/i, name: "Substack" },
  { match: /nyt|new york times/i, name: "NY Times" },
  { match: /wsj|wall street journal/i, name: "WSJ" },
  { match: /planet\s?fitness|equinox|blink\s?fitness|la\s?fitness|gym|crossfit|peloton|classpass/i, name: "Gym / Fitness" },
  { match: /geico|progressive|state\s?farm|allstate|insurance/i, name: "Insurance" },
  { match: /at&t|verizon|t-?mobile|sprint|comcast|xfinity|spectrum/i, name: "Phone / Internet" },
  { match: /dashpass|doordash\s?pass|uber\s?one|instacart\+?/i, name: "Delivery pass" },
  { match: /linkedin/i, name: "LinkedIn" },
  { match: /canva/i, name: "Canva" },
  { match: /figma/i, name: "Figma" },
  { match: /grammarly/i, name: "Grammarly" },
];

function matchKnown(text: string): string | null {
  for (const k of KNOWN) if (k.match.test(text)) return k.name;
  return null;
}

/** Reduce a merchant/note to a stable grouping key. */
function normalizeKey(t: FinanceTx): string {
  const raw = (t.merchant || t.note || "").toLowerCase();
  const known = matchKnown(raw);
  if (known) return known.toLowerCase();
  return raw
    .replace(/[^a-z0-9\s]/g, " ") // punctuation → space
    .replace(/\b\d{2,}\b/g, " ") // strip long digit runs (store #, ref)
    .replace(/\b(pos|ach|debit|recurring|autopay|payment|bill|www|com|inc|llc)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 3) // first few tokens keep the brand, drop location noise
    .join(" ")
    .trim();
}

function prettyName(t: FinanceTx): string {
  const raw = (t.merchant || t.note || "").trim();
  const known = matchKnown(raw);
  if (known) return known;
  if (!raw) return "Unknown";
  // Title-case the cleaned tokens
  const cleaned = raw
    .replace(/[^a-zA-Z0-9\s&']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 3)
    .join(" ");
  return cleaned
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T00:00:00");
  const db = new Date(b + "T00:00:00");
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}

function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function cadenceFor(gapDays: number): { cadence: SubCadence; perMonth: number } {
  if (gapDays >= 4 && gapDays <= 10) return { cadence: "weekly", perMonth: 4.345 };
  if (gapDays >= 24 && gapDays <= 45) return { cadence: "monthly", perMonth: 1 };
  if (gapDays >= 75 && gapDays <= 105) return { cadence: "quarterly", perMonth: 1 / 3 };
  if (gapDays >= 330 && gapDays <= 400) return { cadence: "yearly", perMonth: 1 / 12 };
  return { cadence: "irregular", perMonth: 1 };
}

/** Coefficient of variation — how consistent the charge amounts are. */
function amountConsistency(amounts: number[]): number {
  if (amounts.length < 2) return 1;
  const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  if (mean === 0) return 1;
  const variance =
    amounts.reduce((s, a) => s + (a - mean) ** 2, 0) / amounts.length;
  return Math.sqrt(variance) / mean; // lower = steadier
}

/**
 * Scan the ledger for recurring subscriptions.
 * Groups expenses by merchant, measures the gap between charges, and
 * keeps anything that repeats on a regular cadence (or matches a known brand).
 */
export function detectSubscriptions(txs: FinanceTx[]): SubscriptionScan {
  const groups = new Map<string, FinanceTx[]>();

  for (const t of txs) {
    if (t.kind !== "expense") continue;
    if (isTransferLike(t)) continue;
    if (t.amount <= 0) continue;
    const key = normalizeKey(t);
    if (!key) continue;
    const list = groups.get(key) || [];
    list.push(t);
    groups.set(key, list);
  }

  const subs: Subscription[] = [];

  for (const [key, listRaw] of groups) {
    const list = [...listRaw].sort((a, b) => a.date.localeCompare(b.date));
    const amounts = list.map((t) => t.amount);
    const amount = median(amounts);
    const last = list[list.length - 1];
    const isKnown = Boolean(matchKnown((last.merchant || last.note || "").toLowerCase()));

    // Need repetition, OR a known brand seen at least once.
    if (list.length < 2 && !isKnown) continue;

    let cadence: SubCadence = "monthly";
    let perMonth = 1;
    let gap = 30;

    if (list.length >= 2) {
      const gaps: number[] = [];
      for (let i = 1; i < list.length; i++) {
        gaps.push(daysBetween(list[i - 1].date, list[i].date));
      }
      gap = Math.round(median(gaps.filter((g) => g > 0)) || 30);
      const c = cadenceFor(gap);
      cadence = c.cadence;
      perMonth = c.perMonth;

      // Irregular + inconsistent amounts + not a known brand → not a subscription.
      const cv = amountConsistency(amounts);
      if (cadence === "irregular" && !isKnown) continue;
      if (cv > 0.35 && !isKnown && cadence !== "yearly") continue;
    } else {
      // Single known charge — assume monthly.
      cadence = "monthly";
      perMonth = 1;
      gap = 30;
    }

    const monthlyCost = amount * perMonth;
    const nextDate = addDays(last.date, gap);

    subs.push({
      merchant: prettyName(last),
      key,
      cadence,
      amount: Math.round(amount * 100) / 100,
      monthlyCost: Math.round(monthlyCost * 100) / 100,
      yearlyCost: Math.round(monthlyCost * 12 * 100) / 100,
      count: list.length,
      lastDate: last.date,
      nextDate,
      category: last.category,
      known: isKnown,
    });
  }

  subs.sort((a, b) => b.monthlyCost - a.monthlyCost);

  const monthlyTotal = Math.round(subs.reduce((s, x) => s + x.monthlyCost, 0) * 100) / 100;
  return {
    subs,
    monthlyTotal,
    yearlyTotal: Math.round(monthlyTotal * 12 * 100) / 100,
    count: subs.length,
  };
}

export const CADENCE_LABEL: Record<SubCadence, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
  irregular: "Irregular",
};

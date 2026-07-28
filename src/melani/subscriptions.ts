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
  /** Number of distinct calendar months containing a charge */
  monthsSeen: number;
  lastDate: string; // YYYY-MM-DD
  /** Predicted next charge date */
  nextDate: string; // YYYY-MM-DD
  category: string;
  /** Matched a well-known subscription brand */
  known: boolean;
  /**
   * Detected = inferred from repeated ledger charges.
   * Confirmed = explicitly supplied by the user, so it can appear on month one
   * without creating a fake bank transaction.
   */
  source?: "detected" | "confirmed";
};

export type SubscriptionScan = {
  subs: Subscription[];
  monthlyTotal: number;
  yearlyTotal: number;
  count: number;
};

export type ConfirmedSubscription = {
  merchant: string;
  key: string;
  amount: number;
  cadence: SubCadence;
  startedMonth: string; // YYYY-MM
  category: string;
};

/**
 * User-confirmed July 2026 AI stack. These are planning records, not ledger
 * entries: the checking CSV does not include the underlying card purchases.
 */
export const USER_CONFIRMED_SUBSCRIPTIONS: ConfirmedSubscription[] = [
  {
    merchant: "Grok Premium",
    key: "grok",
    amount: 300,
    cadence: "monthly",
    startedMonth: "2026-07",
    category: "Subscriptions",
  },
  {
    merchant: "Claude Code",
    key: "claude code",
    amount: 20,
    cadence: "monthly",
    startedMonth: "2026-07",
    category: "Subscriptions",
  },
  {
    merchant: "ChatGPT",
    key: "chatgpt",
    amount: 20,
    cadence: "monthly",
    startedMonth: "2026-07",
    category: "Subscriptions",
  },
  {
    merchant: "Cursor",
    key: "cursor",
    amount: 20,
    cadence: "monthly",
    startedMonth: "2026-07",
    category: "Subscriptions",
  },
];

/** Well-known recurring brands — names help classification, not proof. */
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
  // AI / dev tools
  { match: /claude\s*code|anthropic|claude\.ai|\bclaude\b/i, name: "Claude Code" },
  { match: /cursor\.?sh|\bcursor\b/i, name: "Cursor" },
  { match: /openai|chatgpt|chat\s*gpt/i, name: "ChatGPT" },
  { match: /\bgrok\b|x\.?ai|xai\b|supergrok/i, name: "Grok" },
  { match: /perplexity/i, name: "Perplexity" },
  { match: /midjourney/i, name: "Midjourney" },
  { match: /github|copilot/i, name: "GitHub" },
  { match: /vercel/i, name: "Vercel" },
  { match: /replit/i, name: "Replit" },
  { match: /patreon/i, name: "Patreon" },
  { match: /substack/i, name: "Substack" },
  { match: /nyt|new york times/i, name: "NY Times" },
  { match: /wsj|wall street journal/i, name: "WSJ" },
  { match: /planet\s?fitness|equinox|blink\s?fitness|la\s?fitness|crossfit|peloton|classpass/i, name: "Gym / Fitness" },
  { match: /geico|progressive|state\s?farm|allstate|insurance/i, name: "Insurance" },
  { match: /at&t|verizon|t-?mobile|sprint|comcast|xfinity|spectrum/i, name: "Phone / Internet" },
  { match: /dashpass|doordash\s?pass|uber\s?one|instacart\+/i, name: "Delivery pass" },
  { match: /linkedin/i, name: "LinkedIn" },
  { match: /canva/i, name: "Canva" },
  { match: /figma/i, name: "Figma" },
  { match: /grammarly/i, name: "Grammarly" },
  // Squarespace removed — user ended it (also filtered in applySubPrefs)
  { match: /shopify/i, name: "Shopify" },
  { match: /wix\.com|\bwix\b/i, name: "Wix" },
  { match: /1password|lastpass|dashlane/i, name: "Password manager" },
  { match: /google\s?(one|storage|workspace)/i, name: "Google" },
];

/**
 * Categories that are spending, not subscriptions. A restaurant you visit
 * every week is not a subscription — only known brands survive here.
 */
const NON_SUBSCRIPTION_CATEGORIES = new Set([
  "food / groceries",
  "food",
  "groceries",
  "dining",
  "restaurants",
  "restaurant",
  "coffee",
  "transport",
  "gas",
  "fuel",
  "travel",
  "shopping",
  "retail",
  "clothes",
  "atm",
  "cash",
  "transfers",
  "transfer",
  "uncategorized",
  "other",
  "misc",
]);

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

function gapsFitCadence(gaps: number[], cadence: SubCadence): boolean {
  if (!gaps.length || cadence === "irregular") return false;
  return gaps.every((gap) => {
    if (cadence === "weekly") return gap >= 4 && gap <= 10;
    if (cadence === "monthly") return gap >= 24 && gap <= 45;
    if (cadence === "quarterly") return gap >= 75 && gap <= 105;
    return gap >= 330 && gap <= 400;
  });
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

/** Merchant-name words that signal a physical place, not a subscription. */
const VENUE_WORDS = /\b(village|cafe|caf|coffee|grill|kitchen|restaurant|bar|bistro|deli|market|mart|diner|eatery|pizzeria|taqueria|sushi|bakery|juice|bowls?|tacos?|burger|thai|ramen|store|shop|salon|spa|nails?|barber)\b/i;
const SERVICE_WORDS =
  /\b(cloud|hosting|software|subscription|saas|storage|domain|server|workspace|membership)\b/i;

/** How tightly the charges land on the same day of the month (0 = identical day). */
function dayOfMonthSpread(dates: string[]): number {
  const days = dates.map((d) => Number(d.slice(8, 10)));
  const min = Math.min(...days);
  const max = Math.max(...days);
  // Handle month-end wrap (e.g. billed on the 30th shows as 1st next month)
  const wrapped = Math.min(max - min, min + 31 - max);
  return wrapped;
}

/**
 * Only a real subscription survives here. The tell that separates a
 * subscription from "a restaurant I go to a lot" is that a subscription
 * charges a near-identical amount on a regular cadence. So for anything
 * that isn't a known brand we require: a non-spending category, a tight
 * amount (charges within ~8% of each other), a monthly/quarterly/yearly
 * rhythm, and — for monthly — the same day of the month each time.
 */
const AMOUNT_CV_MAX = 0.08; // charges must be within ~8% to count
const DOM_SPREAD_MAX = 4; // monthly charges must land within 4 days

export function detectSubscriptions(txs: FinanceTx[]): SubscriptionScan {
  const groups = new Map<string, FinanceTx[]>();

  for (const t of txs) {
    if (t.kind !== "expense") continue;
    if (t.pending) continue;
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
    const rawDescription = list
      .map((t) => `${t.merchant || ""} ${t.note || ""}`)
      .join(" ");
    const isKnown = Boolean(matchKnown(rawDescription.toLowerCase()));
    const cat = (last.category || "").toLowerCase().trim();
    const monthsSeen = new Set(list.map((t) => t.date.slice(0, 7))).size;

    let cadence: SubCadence = "monthly";
    let perMonth = 1;
    let gap = 30;
    const gaps: number[] = [];

    if (list.length >= 2) {
      for (let i = 1; i < list.length; i++) {
        const days = daysBetween(list[i - 1].date, list[i].date);
        if (days > 0) gaps.push(days);
      }
      gap = Math.round(median(gaps) || 30);
      const c = cadenceFor(gap);
      cadence = c.cadence;
      perMonth = c.perMonth;
    }

    // A cadence is evidence only when every observed interval fits it. We do
    // not relabel irregular purchases as monthly merely because the merchant
    // also sells a subscription.
    if (!gapsFitCadence(gaps, cadence)) continue;

    if (isKnown) {
      if (list.length < 2) continue;
      if (cadence === "weekly" && list.length < 3) continue;
      if (cadence !== "weekly" && monthsSeen < 2) continue;
      if (amountConsistency(amounts) > 0.15) continue;
      if (
        cadence === "monthly" &&
        dayOfMonthSpread(list.map((t) => t.date)) > DOM_SPREAD_MAX
      ) {
        continue;
      }

      // APPLE.COM/BILL and iTunes include à-la-carte purchases. Without a
      // named service, require three clean recurring periods before treating
      // the charges as a fixed cost.
      const genericApple = /\b(?:apple\.com\/bill|itunes)\b/i.test(
        rawDescription
      );
      const namedAppleService =
        /\b(?:apple\s*(?:music|tv|one|icloud)|icloud)\b/i.test(
          rawDescription
        );
      if (
        genericApple &&
        !namedAppleService &&
        (list.length < 3 ||
          (cadence !== "weekly" && monthsSeen < 3) ||
          amountConsistency(amounts) > AMOUNT_CV_MAX)
      ) {
        continue;
      }
    } else {
      // Unknown merchant — must clear every strict gate to count.
      const raw = (last.merchant || last.note || "");
      if (list.length < 3) continue; // two similar charges is coincidence, not a plan
      if (NON_SUBSCRIPTION_CATEGORIES.has(cat) && !SERVICE_WORDS.test(raw)) {
        continue; // restaurants, gas, shopping…
      }
      if (VENUE_WORDS.test(raw)) continue; // "… Village", "… Cafe" → a place, not a plan
      if (cadence === "weekly") {
        // Weekly fixed costs exist, but require an explicit service signal and
        // enough history to separate them from habitual shopping.
        if (
          list.length < 4 ||
          daysBetween(list[0].date, last.date) < 21 ||
          !(SERVICE_WORDS.test(raw) || cat === "subscriptions")
        ) {
          continue;
        }
      } else if (monthsSeen < 3) {
        continue;
      }
      if (amountConsistency(amounts) > AMOUNT_CV_MAX) continue; // varies → not a plan
      if (cadence === "monthly" && dayOfMonthSpread(list.map((t) => t.date)) > DOM_SPREAD_MAX) {
        continue; // real subs bill the same day each month
      }
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
      monthsSeen,
      lastDate: last.date,
      nextDate,
      category: last.category,
      known: isKnown,
      source: "detected",
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

function nextMonthDate(startedMonth: string): string {
  const [year, month] = startedMonth.split("-").map(Number);
  if (!year || !month) return "";
  const next = new Date(Date.UTC(year, month, 1));
  return next.toISOString().slice(0, 10);
}

function totalsFor(subs: Subscription[]): SubscriptionScan {
  const sorted = [...subs].sort((a, b) => b.monthlyCost - a.monthlyCost);
  const monthlyTotal =
    Math.round(
      sorted.reduce((sum, subscription) => sum + subscription.monthlyCost, 0) *
        100
    ) / 100;
  return {
    subs: sorted,
    monthlyTotal,
    yearlyTotal: Math.round(monthlyTotal * 12 * 100) / 100,
    count: sorted.length,
  };
}

/**
 * Add plans the user explicitly confirmed. A confirmed record wins over an
 * inferred record with the same normalized key, preventing double counting.
 */
export function mergeConfirmedSubscriptions(
  scan: SubscriptionScan,
  confirmed: ConfirmedSubscription[] = USER_CONFIRMED_SUBSCRIPTIONS
): SubscriptionScan {
  const byKey = new Map(
    scan.subs.map((subscription) => [
      subscription.key.toLowerCase(),
      subscription,
    ])
  );
  for (const plan of confirmed) {
    const { monthlyCost, yearlyCost } = costsForCadence(
      plan.amount,
      plan.cadence
    );
    byKey.set(plan.key.toLowerCase(), {
      merchant: plan.merchant,
      key: plan.key.toLowerCase(),
      cadence: plan.cadence,
      amount: plan.amount,
      monthlyCost,
      yearlyCost,
      count: 1,
      monthsSeen: 1,
      lastDate: `${plan.startedMonth}-01`,
      nextDate: nextMonthDate(plan.startedMonth),
      category: plan.category,
      known: true,
      source: "confirmed",
    });
  }
  return totalsFor([...byKey.values()]);
}

export const CADENCE_LABEL: Record<SubCadence, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
  irregular: "Irregular",
};

/** Cadences you can flip in the UI (monthly ↔ yearly) */
export const TOGGLE_CADENCES: SubCadence[] = ["monthly", "yearly"];

const SUB_PREFS_KEY = "wonder-sub-prefs-v1";

export type SubPrefs = {
  /** Keys user deleted / cancelled — hidden from pie + table */
  dismissed: string[];
  /** Override detected cadence per key */
  cadence: Record<string, SubCadence>;
  /** User-corrected charge amount per key */
  amount: Record<string, number>;
};

export function loadSubPrefs(): SubPrefs {
  try {
    const raw = localStorage.getItem(SUB_PREFS_KEY);
    if (!raw) return { dismissed: ["squarespace"], cadence: {}, amount: {} };
    const p = JSON.parse(raw) as Partial<SubPrefs>;
    const dismissed = Array.isArray(p.dismissed) ? [...p.dismissed] : [];
    // Always keep Squarespace out after cancel
    if (!dismissed.some((k) => /squarespace/i.test(k))) {
      dismissed.push("squarespace");
    }
    return {
      dismissed,
      cadence: p.cadence && typeof p.cadence === "object" ? p.cadence : {},
      amount: p.amount && typeof p.amount === "object" ? p.amount : {},
    };
  } catch {
    return { dismissed: ["squarespace"], cadence: {}, amount: {} };
  }
}

function saveSubPrefs(prefs: SubPrefs) {
  try {
    localStorage.setItem(SUB_PREFS_KEY, JSON.stringify(prefs));
    window.dispatchEvent(new CustomEvent("wonder-subs-changed"));
  } catch {
    /* ignore */
  }
}

export function dismissSubscription(key: string) {
  const prefs = loadSubPrefs();
  const k = key.toLowerCase();
  if (!prefs.dismissed.includes(k)) prefs.dismissed.push(k);
  // also match merchant slug
  saveSubPrefs(prefs);
}

export function setSubscriptionCadence(key: string, cadence: SubCadence) {
  const prefs = loadSubPrefs();
  prefs.cadence[key.toLowerCase()] = cadence;
  saveSubPrefs(prefs);
}

export function setSubscriptionAmount(key: string, amount: number) {
  const prefs = loadSubPrefs();
  const cleanAmount = Math.round(Math.max(0, amount) * 100) / 100;
  prefs.amount[key.toLowerCase()] = cleanAmount;
  saveSubPrefs(prefs);
}

/** Recompute monthly/yearly from charge amount + cadence. */
export function costsForCadence(
  amount: number,
  cadence: SubCadence
): { monthlyCost: number; yearlyCost: number } {
  const a = Math.abs(amount);
  switch (cadence) {
    case "weekly":
      return {
        monthlyCost: Math.round(a * 4.345 * 100) / 100,
        yearlyCost: Math.round(a * 52 * 100) / 100,
      };
    case "yearly":
      return {
        monthlyCost: Math.round((a / 12) * 100) / 100,
        yearlyCost: Math.round(a * 100) / 100,
      };
    case "quarterly":
      return {
        monthlyCost: Math.round((a / 3) * 100) / 100,
        yearlyCost: Math.round(a * 4 * 100) / 100,
      };
    case "monthly":
    case "irregular":
    default:
      return {
        monthlyCost: Math.round(a * 100) / 100,
        yearlyCost: Math.round(a * 12 * 100) / 100,
      };
  }
}

/**
 * Apply dismissals + cadence overrides, drop Squarespace, recompute totals.
 */
export function applySubPrefs(scan: SubscriptionScan): SubscriptionScan {
  const prefs = loadSubPrefs();
  const dismissed = new Set(prefs.dismissed.map((k) => k.toLowerCase()));

  const subs = scan.subs
    .filter((s) => {
      const k = s.key.toLowerCase();
      const m = s.merchant.toLowerCase();
      if (/squarespace/i.test(k) || /squarespace/i.test(m)) return false;
      if (dismissed.has(k) || dismissed.has(m)) return false;
      for (const d of dismissed) {
        if (k.includes(d) || m.includes(d)) return false;
      }
      return true;
    })
    .map((s) => {
      const normalizedKey = s.key.toLowerCase();
      const override = prefs.cadence[normalizedKey];
      const cadence = override || s.cadence;
      const amount =
        prefs.amount[normalizedKey] != null
          ? prefs.amount[normalizedKey]
          : s.amount;
      const { monthlyCost, yearlyCost } = costsForCadence(amount, cadence);
      return { ...s, amount, cadence, monthlyCost, yearlyCost };
    })
    .sort((a, b) => b.monthlyCost - a.monthlyCost);

  const monthlyTotal =
    Math.round(subs.reduce((sum, x) => sum + x.monthlyCost, 0) * 100) / 100;

  return {
    subs,
    monthlyTotal,
    yearlyTotal: Math.round(monthlyTotal * 12 * 100) / 100,
    count: subs.length,
  };
}

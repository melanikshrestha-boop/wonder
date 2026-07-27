/**
 * Auto-categorize bank transactions from merchant names.
 * Short list of categories Melani actually uses — not a full chart of accounts.
 */

/** Fixed colors for pie / legend — same category = same color every month */
export const CATEGORY_COLORS: Record<string, string> = {
  Income: "#3d8f6e",
  Zelle: "#5b6ee1", // most P2P volume — distinct indigo
  Transfers: "#1f6f8b", // account / card moves — cool teal, not Zelle
  Groceries: "#5c8d5c",
  Restaurants: "#d64545", // "bad" discretionary — red
  Subscriptions: "#7d5ba6",
  Clothing: "#c94f7c",
  Transport: "#e8743b",
  "Credit card payment": "#6b8e9e",
  Other: "#8a8580",
  Uncategorized: "#6a6560",
};

/** Categories treated as lifestyle leaks (red cue in UI) */
export const BAD_CATEGORIES = new Set(["Restaurants"]);

/**
 * The only categories in the ledger picker.
 * No dead options for bills you don't currently track.
 */
export const FINANCE_CATEGORIES = [
  "Income",
  "Zelle",
  "Transfers",
  "Groceries",
  "Restaurants",
  "Subscriptions",
  "Clothing",
  "Transport",
  "Credit card payment",
  "Other",
] as const;

export type FinanceCategory = (typeof FINANCE_CATEGORIES)[number] | string;

/** Map legacy / bank-noise labels onto the short list */
const ALIASES: Record<string, string> = {
  "Food / groceries": "Groceries",
  Food: "Groceries",
  "Restaurants / coffee": "Restaurants",
  Restaurant: "Restaurants",
  Coffee: "Restaurants",
  Shopping: "Clothing",
  "Rent / housing": "Other",
  Cash: "Other",
  Utilities: "Other",
  Health: "Other",
  "Build / tools": "Subscriptions",
  Travel: "Other",
  "Education / school": "Other",
  Fun: "Restaurants",
  Fees: "Other",
  Uncategorized: "Other",
};

/**
 * Normalize a stored category name → short list.
 * Also peeks at merchant/note so Zelle isn't stuck under Transfers.
 */
export function normalizeCategory(
  category: string | null | undefined,
  merchantOrNote = ""
): string {
  const text = `${merchantOrNote}`.toLowerCase();
  // Zelle wins over Transfers / Other when the payee line says Zelle
  if (/\bzelle\b/.test(text)) return "Zelle";

  const raw = (category || "").trim();
  if (!raw) return "Other";
  if (ALIASES[raw]) return ALIASES[raw];
  if ((FINANCE_CATEGORIES as readonly string[]).includes(raw)) return raw;
  // Case-insensitive match against known labels
  const hit = FINANCE_CATEGORIES.find(
    (c) => c.toLowerCase() === raw.toLowerCase()
  );
  if (hit) return hit;
  return ALIASES[raw] || "Other";
}

/** Stable color for a category (after normalize when possible) */
export function categoryColor(name: string): string {
  const n = normalizeCategory(name);
  return CATEGORY_COLORS[n] || CATEGORY_COLORS.Other;
}

/** Ordered rules — first match wins. Zelle before generic Transfers. */
const RULES: { category: string; match: RegExp }[] = [
  {
    category: "Income",
    match:
      /\b(payroll|direct dep|salary|venmo cashout|irs treas|refund|interest paid|goldman sachs|marcus|cash redemption|atm cash deposit)\b/i,
  },
  {
    category: "Credit card payment",
    match:
      /\b(payment to chase card|chase credit card payment|loan_pmt|payment thank you|autopay)\b/i,
  },
  // Zelle is its own bucket — most of your payment volume lives here
  { category: "Zelle", match: /\bzelle\b/i },
  {
    category: "Transfers",
    match:
      /\b(transfer|online transfer|ach|wire|venmo|cash app|paypal|from savings|to savings|goldman sachs ba transfer)\b/i,
  },
  {
    category: "Groceries",
    match:
      /\b(whole foods|wholefds|trader joe'?s?|costco|walmart|aldi|kroger|safeway|grocery|instacart|fresh direct|wegmans|h mart|woodside grocery|g mart)\b/i,
  },
  {
    category: "Restaurants",
    match:
      /\b(starbucks|dunkin|mcdonald|chipotle|cava|doordash|uber eats|grubhub|seamless|restaurant|cafe|coffee|pizza|sushi|bagel|blue bottle|insomnia|bruxie|kobunga|wingstop|yogurtland|subway|himalayan|dulce|eats)\b/i,
  },
  {
    category: "Transport",
    match:
      /\b(uber|lyft|waymo|mta|metrocard|omny|shell|exxon|chevron|gas station|parking|toll|ezpass|citi bike|arco)\b/i,
  },
  {
    category: "Subscriptions",
    match:
      /\b(netflix|spotify|hulu|disney\+|youtube premium|icloud|google one|adobe|notion|openai|anthropic|github|cursor|midjourney|audible|apple\.com\/bill|squarespace|sqsp|aws|vercel|figma|domain)\b/i,
  },
  {
    category: "Clothing",
    match:
      /\b(nordstrom|zara|h&m|uniqlo|shein|fashion|clothing|apparel|lululemon|gap |old navy|forever 21|nepa fashion|athleta|free people|reformation|sephora|ulta)\b/i,
  },
];

/** Guess category from merchant / description text */
export function categorizeMerchant(text: string): string {
  const t = (text || "").trim();
  if (!t) return "Other";
  for (const rule of RULES) {
    if (rule.match.test(t)) return rule.category;
  }
  return "Other";
}

/** Clean bank noise from merchant names for display */
export function cleanMerchant(raw: string): string {
  return (raw || "")
    .replace(/\s+/g, " ")
    .replace(/\d{4,}/g, " ")
    .replace(/\b(POS|ACH|DEBIT|CREDIT|PURCHASE|CARD|ONLINE)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

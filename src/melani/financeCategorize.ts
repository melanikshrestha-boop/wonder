/**
 * Auto-categorize bank transactions from merchant names.
 * Short list of categories Melani actually uses — not a full chart of accounts.
 */

/** Fixed colors for pie / legend — same category = same color every month */
export const CATEGORY_COLORS: Record<string, string> = {
  Income: "#3d8f6e",
  Family: "#0f8f7d",
  Zelle: "#5b6ee1", // most P2P volume — distinct indigo
  Cash: "#b56f38",
  Transfers: "#1f6f8b", // account / card moves — cool teal, not Zelle
  Groceries: "#5c8d5c",
  Restaurants: "#d64545", // "bad" discretionary — red
  Housing: "#8b6f47",
  Utilities: "#4f7b8f",
  Laundry: "#4f8f88",
  Health: "#3f8f7b",
  Subscriptions: "#7d5ba6",
  Clothing: "#c94f7c",
  Transport: "#e8743b",
  Education: "#7766b8",
  Travel: "#2f84a6",
  Business: "#586f92",
  Fees: "#a66b52",
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
  "Family",
  "Zelle",
  "Cash",
  "Transfers",
  "Groceries",
  "Restaurants",
  "Housing",
  "Utilities",
  "Laundry",
  "Health",
  "Subscriptions",
  "Clothing",
  "Transport",
  "Education",
  "Travel",
  "Business",
  "Fees",
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
  "Rent / housing": "Housing",
  Cash: "Cash",
  Utilities: "Utilities",
  Laundry: "Laundry",
  Health: "Health",
  "Build / tools": "Business",
  Travel: "Travel",
  "Education / school": "Education",
  Gift: "Other",
  Gifts: "Other",
  "Gifts received": "Other",
  Parents: "Family",
  Fun: "Restaurants",
  Fees: "Fees",
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
  const raw = (category || "").trim();
  // A reviewed transfer classification is accounting evidence. Preserve it
  // even when the bank description contains "Zelle"; otherwise an approved
  // checking↔savings pair silently becomes income/expense again on reload.
  const explicitTransfer = FINANCE_CATEGORIES.find(
    (candidate) =>
      (candidate === "Transfers" || candidate === "Credit card payment") &&
      candidate.toLowerCase() === raw.toLowerCase()
  );
  if (explicitTransfer) return explicitTransfer;
  // One-time label migration: keep historical family funding together instead
  // of splitting old "Parents" rows from the new Family category.
  if (raw.toLowerCase() === "parents") return "Family";

  const text = `${merchantOrNote}`.toLowerCase();
  // Wash Kiosk is a laundromat service. Bank exports called it Shopping,
  // which previously pushed every historical wash into Clothing.
  if (/\b(wash kiosk|laundromat|laundry)\b/.test(text)) return "Laundry";
  // Zelle wins over unreviewed bank noise, but never over an explicit
  // Transfers / Credit card payment decision above.
  if (/\bzelle\b/.test(text)) return "Zelle";

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

const FAMILY_NAMES = /\b(bimala|umesh|millennium)\b/i;

/**
 * Normalize with transaction direction. A payment rail is not a source:
 * incoming payments from Bimala, Umesh, or Millennium are family funding,
 * while outgoing payments to a family member remain an expense/P2P payment.
 */
export function normalizeTransactionCategory(
  category: string | null | undefined,
  merchantOrNote = "",
  kind: "income" | "expense" = "expense"
): string {
  if (kind === "income" && FAMILY_NAMES.test(merchantOrNote)) return "Family";
  return normalizeCategory(category, merchantOrNote);
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
    category: "Housing",
    match:
      /\b(rent|landlord|mortgage|property management|housing|apartment|lease)\b/i,
  },
  {
    category: "Utilities",
    match:
      /\b(electric|electricity|water bill|gas bill|utility|utilities|con ed|internet|wifi|phone bill|verizon|t-mobile|at&t|spectrum|xfinity)\b/i,
  },
  {
    category: "Laundry",
    match: /\b(wash kiosk|laundromat|laundry|wash and fold|dry clean)\b/i,
  },
  {
    category: "Health",
    match:
      /\b(pharmacy|cvs|walgreens|doctor|medical|dental|dentist|hospital|therapy|health|copay|prescription)\b/i,
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
  {
    category: "Education",
    match:
      /\b(tuition|university|college|school|course|textbook|student fee|education)\b/i,
  },
  {
    category: "Travel",
    match:
      /\b(airline|flight|hotel|airbnb|booking\.com|expedia|hostel|resort)\b/i,
  },
  {
    category: "Business",
    match:
      /\b(business expense|hosting|domain|aws|cloudflare|office supplies|equipment|contractor)\b/i,
  },
  {
    category: "Fees",
    match:
      /\b(overdraft|service fee|bank fee|late fee|maintenance fee|foreign transaction fee)\b/i,
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
    .replace(/\b(Zelle\s+(?:from|to)\s+.+?)\s+BAC\b/gi, "$1")
    .replace(/\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{8,}\b/gi, " ")
    .replace(/\d{4,}/g, " ")
    .replace(/\b(POS|ACH|DEBIT|CREDIT|PURCHASE|CARD|ONLINE)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

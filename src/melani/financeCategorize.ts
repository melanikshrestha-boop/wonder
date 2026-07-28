/**
 * Auto-categorize bank transactions from merchant names.
 * Short list of categories Melani actually uses — not a full chart of accounts.
 */

/** Fixed colors for pie / legend — same category = same color every month */
export const CATEGORY_COLORS: Record<string, string> = {
  Income: "#3d8f6e",
  Family: "#0f8f7d",
  Gifts: "#d58a9a",
  Photography: "#7158a6",
  Reselling: "#2f7f91",
  Cash: "#b56f38",
  Transfers: "#1f6f8b", // account / card moves — cool teal, not Zelle
  Groceries: "#5c8d5c",
  Restaurants: "#d64545", // "bad" discretionary — red
  Experiences: "#c4832f",
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

/** Income and expense purposes stay separate in every category picker. */
export const INCOME_CATEGORIES = [
  "Uncategorized",
  "Income",
  "Family",
  "Gifts",
  "Photography",
  "Reselling",
  "Experiences",
  "Transfers",
  "Other",
] as const;

export const EXPENSE_CATEGORIES = [
  "Uncategorized",
  "Cash",
  "Transfers",
  "Groceries",
  "Restaurants",
  "Experiences",
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

/**
 * Canonical category order for filters, reports, and Mel's finance tools.
 * The direction-specific arrays above drive the ledger picker.
 */
export const FINANCE_CATEGORIES = [
  "Uncategorized",
  "Income",
  "Family",
  "Gifts",
  "Photography",
  "Reselling",
  "Cash",
  "Transfers",
  "Groceries",
  "Restaurants",
  "Experiences",
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

export function categoriesForKind(
  kind: "income" | "expense"
): readonly string[] {
  return kind === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}

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
  Gift: "Gifts",
  Gifts: "Gifts",
  "Gifts received": "Gifts",
  Resale: "Reselling",
  Reselling: "Reselling",
  "Resale income": "Reselling",
  Parents: "Family",
  Zelle: "Uncategorized",
  Fun: "Experiences",
  Leisure: "Experiences",
  Entertainment: "Experiences",
  Fees: "Fees",
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
  if (raw.toLowerCase() === "zelle") return "Uncategorized";
  if (!raw) return /\bzelle\b/.test(text) ? "Uncategorized" : "Other";
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
 * Owner-confirmed Zelle purposes. Zelle is the rail in the payee/type fields;
 * the category must describe why the money moved.
 */
export function zellePurposeCategory(
  merchantOrNote: string,
  kind: "income" | "expense"
): string | null {
  const text = merchantOrNote.replace(/\s+/g, " ");
  if (!/\bzelle\b/i.test(text)) return null;

  if (kind === "income" && FAMILY_NAMES.test(text)) return "Family";
  if (kind === "income" && /\bzelle\s+from\s+audrey\b/i.test(text))
    return "Photography";
  if (kind === "income" && /\bzelle\s+from\s+jasis\s+shrestha\b/i.test(text))
    return "Gifts";
  if (kind === "income" && /\bzelle\s+from\s+grace\s+rose\b/i.test(text))
    return "Reselling";
  if (kind === "income" && /\bzelle\s+from\s+cedric\s+hong\b/i.test(text))
    return "Experiences";

  if (kind === "expense") {
    if (/\bzelle\s+to\s+sean\s+(?:filimon|philemon)\b/i.test(text))
      return "Travel";
    if (/\bzelle\s+to\s+ricky\b/i.test(text)) return "Restaurants";
    if (
      /\bzelle\s+to\s+(?:ronni\s+wieman|sam\s+peterson|ani\b|ella\s+will)\b/i.test(
        text
      )
    )
      return "Groceries";
    if (
      /\bzelle\s+to\s+(?:sofia\s+usc|zeba(?:\s+attar)?|ziyu\s+gao)\b/i.test(
        text
      )
    )
      return "Restaurants";
    if (/\bzelle\s+to\s+(?:sunsent\s+chickne|taco)\b/i.test(text))
      return "Restaurants";
    if (/\bzelle\s+to\s+nepa\s+fashion\s+house\b/i.test(text))
      return "Clothing";
  }

  return null;
}

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
  const raw = (category || "").trim();
  if (
    /\bzelle\b/i.test(merchantOrNote) &&
    raw &&
    !/^(zelle|income|other|uncategorized)$/i.test(raw)
  ) {
    // A deliberate purpose (including an approved Transfers pair) always
    // beats the built-in merchant defaults.
    return normalizeCategory(raw, merchantOrNote);
  }
  const zellePurpose = zellePurposeCategory(merchantOrNote, kind);
  if (zellePurpose) return zellePurpose;
  if (
    /\bzelle\b/i.test(merchantOrNote) &&
    (!raw || /^(zelle|income|other|uncategorized)$/i.test(raw))
  )
    return "Uncategorized";
  if (kind === "income" && FAMILY_NAMES.test(merchantOrNote)) return "Family";
  return normalizeCategory(category, merchantOrNote);
}

/**
 * Import boundary: bank-provided "Zelle", "Transfer", and generic "Income"
 * labels are not accounting categories. Known owner rules are applied; every
 * other Zelle row waits in Uncategorized for a manual or Mel review.
 */
export function normalizeImportedTransactionCategory(
  category: string | null | undefined,
  merchantOrNote = "",
  kind: "income" | "expense" = "expense"
): string {
  if (/\bzelle\b/i.test(merchantOrNote)) {
    return zellePurposeCategory(merchantOrNote, kind) || "Uncategorized";
  }
  return normalizeTransactionCategory(category, merchantOrNote, kind);
}

/** Stable color for a category (after normalize when possible) */
export function categoryColor(name: string): string {
  const n = normalizeCategory(name);
  return CATEGORY_COLORS[n] || CATEGORY_COLORS.Other;
}

/** Ordered rules — first match wins. Payment rails never become categories. */
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
  { category: "Uncategorized", match: /\bzelle\b/i },
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
    category: "Experiences",
    match:
      /\b(concert|ticketmaster|live nation|cinema|movie theater|museum|festival|show ticket)\b/i,
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

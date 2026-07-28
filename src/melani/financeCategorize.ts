/**
 * Auto-categorize bank transactions from merchant names.
 * Short list of categories Melani actually uses — not a full chart of accounts.
 */

/** Fixed colors for pie / legend — same category = same color every month */
export const CATEGORY_COLORS: Record<string, string> = {
  Income: "#16a34a",
  Family: "#0d9488",
  Reimbursements: "#2563eb",
  Gifts: "#db2777",
  Photography: "#7c3aed",
  Reselling: "#f59e0b",
  Cash: "#a16207",
  Transfers: "#64748b", // account / card moves — neutral slate, not Zelle
  Repayment: "#475569",
  Groceries: "#22c55e",
  Restaurants: "#ef4444", // "bad" discretionary — red
  Experiences: "#f97316",
  Housing: "#8b5cf6",
  Utilities: "#06b6d4",
  Laundry: "#3b82f6",
  Health: "#14b8a6",
  Subscriptions: "#a855f7",
  Clothing: "#ec4899",
  Transport: "#eab308",
  Education: "#6366f1",
  Travel: "#0ea5e9",
  Business: "#334155",
  Fees: "#b45309",
  "Credit card payment": "#94a3b8",
};

const CUSTOM_CATEGORY_COLORS = [
  "#7c3aed",
  "#0891b2",
  "#f97316",
  "#16a34a",
  "#db2777",
  "#2563eb",
  "#ca8a04",
  "#dc2626",
  "#0d9488",
  "#9333ea",
  "#ea580c",
  "#4f46e5",
  "#059669",
  "#be185d",
  "#0284c7",
  "#b45309",
];

/** Categories treated as lifestyle leaks (red cue in UI) */
export const BAD_CATEGORIES = new Set(["Restaurants"]);

/**
 * Income and expense purposes stay separate in every category picker.
 * There is no "Uncategorized" purpose — every row needs a real why
 * (Family / Reimbursements / Housing / …). Payment rails (Zelle) are never
 * categories.
 */
export const INCOME_CATEGORIES = [
  "Family",
  "Reimbursements",
  "Gifts",
  "Photography",
  "Reselling",
  "Transfers",
] as const;

export const EXPENSE_CATEGORIES = [
  "Cash",
  "Transfers",
  "Repayment",
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
] as const;

const CATEGORY_PREFS_KEY = "wonder-finance-category-prefs-v1";

function storedCustomCategories(): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(CATEGORY_PREFS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as {
      income?: unknown;
      expense?: unknown;
    };
    return [parsed.income, parsed.expense]
      .flatMap((list) => (Array.isArray(list) ? list : []))
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function storedCategoryMatch(raw: string): string | null {
  const low = raw.toLowerCase();
  return (
    storedCustomCategories().find(
      (category) => category.toLowerCase() === low
    ) || null
  );
}

/**
 * Canonical category order for filters, reports, and Mel's finance tools.
 * The direction-specific arrays above drive the ledger picker.
 */
export const FINANCE_CATEGORIES = [
  "Income",
  "Family",
  "Reimbursements",
  "Gifts",
  "Photography",
  "Reselling",
  "Cash",
  "Transfers",
  "Repayment",
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
  Repayment: "Repayment",
  "Family repayment": "Repayment",
  "Loan payment": "Repayment",
  Reimbursement: "Reimbursements",
  Reimbursements: "Reimbursements",
  Refund: "Reimbursements",
  Refunds: "Reimbursements",
  Zelle: "Reimbursements",
  Uncategorized: "",
  Other: "",
  Fun: "Experiences",
  Leisure: "Experiences",
  Entertainment: "Experiences",
  Fees: "Fees",
  "Cash Redemption": "Reimbursements",
  "Chase CashBack": "Reimbursements",
  CashBack: "Reimbursements",
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
      (candidate === "Transfers" ||
        candidate === "Repayment" ||
        candidate === "Credit card payment") &&
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
  // Cash-back / rewards redemptions are money returned — not a mystery bucket
  if (/\b(cash redemption|cashback|cash back|chase cashback)\b/i.test(`${raw} ${text}`))
    return "Reimbursements";
  // Zelle is a rail — never a category. Default purpose without more signal:
  // incoming paybacks read as reimbursements in owner books.
  if (
    raw.toLowerCase() === "zelle" ||
    raw.toLowerCase() === "uncategorized" ||
    raw.toLowerCase() === "other"
  )
    return /\bzelle\b/.test(text) || raw.toLowerCase() === "zelle"
      ? "Reimbursements"
      : "";
  if (!raw) return /\bzelle\b/.test(text) ? "Reimbursements" : "";
  if (ALIASES[raw]) return ALIASES[raw];
  if ((FINANCE_CATEGORIES as readonly string[]).includes(raw)) return raw;
  const custom = storedCategoryMatch(raw);
  if (custom) return custom;
  // Case-insensitive match against known labels
  const hit = FINANCE_CATEGORIES.find(
    (c) => c.toLowerCase() === raw.toLowerCase()
  );
  if (hit) return hit;
  // Legacy catch-all labels become an empty review state. They are never a
  // selectable purpose and never enter charts.
  if (/^(uncategorized|other)$/i.test(raw)) return "";
  return ALIASES[raw] || "";
}

const FAMILY_NAMES = /\b(mom|dad|mother|father|bimala|umesh|millennium)\b/i;
const FAMILY_REPAYMENT_NAMES =
  /\b(mom|dad|mother|father|bimala(?:\s+shrestha)?|umesh(?:\s+shrestha)?)\b/i;

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
  // Friend/peer Zelle in without a known purpose → reimbursements (paybacks)
  if (kind === "income" && /\bzelle\s+from\s+ziyu\s+gao\b/i.test(text))
    return "Reimbursements";
  if (kind === "expense") {
    const recipient = text.match(/\bzelle\s+to\s+(.+)$/i)?.[1] || "";
    if (FAMILY_REPAYMENT_NAMES.test(recipient)) return "Repayment";
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
 * incoming payments from family are family funding. Money sent to Mom or Dad
 * is repayment of a family advance: cash goes out, but it is not consumption.
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
    !/^(zelle|income|other|uncategorized)$/i.test(raw) &&
    !(kind === "income" && /^experiences$/i.test(raw))
  ) {
    // A deliberate purpose (including an approved Transfers pair) always
    // beats the built-in merchant defaults.
    return normalizeCategory(raw, merchantOrNote);
  }
  const zellePurpose = zellePurposeCategory(merchantOrNote, kind);
  if (zellePurpose) return zellePurpose;
  if (kind === "income" && FAMILY_NAMES.test(merchantOrNote)) return "Family";
  // "Income" only repeats the transaction direction, and "Experiences" is an
  // expense purpose. Neither identifies how income was earned. Retire both
  // labels at the normalization boundary so stored, imported, and Mel-entered
  // rows all return to the review queue.
  if (kind === "income" && /^experiences$/i.test(raw))
    return /\breimburse(?:ment|d)?\b/i.test(merchantOrNote)
      ? "Reimbursements"
      : "";
  if (kind === "income" && /^(income|uncategorized|other)$/i.test(raw))
    return "";
  if (
    /\bzelle\b/i.test(merchantOrNote) &&
    (!raw || /^(zelle|income|other|uncategorized)$/i.test(raw))
  )
    return kind === "income" ? "Reimbursements" : "";
  const normalized = normalizeCategory(category, merchantOrNote);
  // Never surface the retired bucket in UI / pies
  if (!normalized || /^(uncategorized|other)$/i.test(normalized)) return "";
  return normalized;
}

/**
 * Import boundary: bank-provided "Zelle", "Transfer", and generic "Income"
 * labels are not accounting categories. Known owner rules are applied; other
 * incoming Zelle rows default to Reimbursements so paybacks are visible without
 * pretending the rail itself is an income source.
 */
export function normalizeImportedTransactionCategory(
  category: string | null | undefined,
  merchantOrNote = "",
  kind: "income" | "expense" = "expense"
): string {
  if (/\bzelle\b/i.test(merchantOrNote)) {
    return (
      zellePurposeCategory(merchantOrNote, kind) ||
      (kind === "income" ? "Reimbursements" : "")
    );
  }
  return normalizeTransactionCategory(category, merchantOrNote, kind);
}

/** Stable color for a category (after normalize when possible) */
export function categoryColor(name: string): string {
  const n = normalizeCategory(name);
  if (CATEGORY_COLORS[n]) return CATEGORY_COLORS[n];
  let hash = 0;
  const seed = (n || name || "review").toLowerCase();
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return CUSTOM_CATEGORY_COLORS[hash % CUSTOM_CATEGORY_COLORS.length];
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
  // Zelle is handled by zellePurposeCategory / Reimbursements — never a category
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
  if (!t) return "";
  for (const rule of RULES) {
    if (rule.match.test(t)) return rule.category;
  }
  return "";
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

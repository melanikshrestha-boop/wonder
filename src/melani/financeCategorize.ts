/**
 * Auto-categorize bank transactions from merchant names.
 * Mintable-style: rules first, then "Uncategorized".
 */

/** Ordered rules — first match wins */
const RULES: { category: string; match: RegExp }[] = [
  { category: "Income", match: /\b(payroll|direct dep|salary|venmo cashout|zelle from|irs treas|refund|interest paid|goldman sachs|marcus|cash redemption|atm cash deposit)\b/i },
  { category: "Credit card payment", match: /\b(payment to chase card|chase credit card payment|loan_pmt|payment thank you)\b/i },
  { category: "Rent / housing", match: /\b(rent|landlord|apartment|mortgage|hoa|property mgmt)\b/i },
  { category: "Utilities", match: /\b(con ed|coned|pseg|national grid|water bill|utility|electric|gas bill|internet|verizon|spectrum|optimum|at&t|comcast)\b/i },
  { category: "Education / school", match: /\b(univ of california|university|tuition|usc |usc\/|bookstore|follett|jones & bartlett|american databank|platinum educational|ticket office)\b/i },
  { category: "Food / groceries", match: /\b(whole foods|wholefds|trader joe'?s?|costco|walmart|aldi|kroger|safeway|grocery|instacart|fresh direct|wegmans|h mart|woodside grocery|g mart)\b/i },
  { category: "Restaurants / coffee", match: /\b(starbucks|dunkin|mcdonald|chipotle|cava|doordash|uber eats|grubhub|seamless|restaurant|cafe|coffee|pizza|sushi|bagel|blue bottle|insomnia|bruxie|kobunga|wingstop|yogurtland|subway|himalayan|dulce)\b/i },
  { category: "Transport", match: /\b(uber|lyft|waymo|mta|metrocard|omny|shell|exxon|chevron|gas station|parking|toll|ezpass|citi bike|arco)\b/i },
  { category: "Health", match: /\b(pharmacy|cvs|walgreens|rite aid|duane reade|doctor|dental|hospital|labcorp|quest diag|health|medical|insurance)\b/i },
  { category: "Subscriptions", match: /\b(netflix|spotify|hulu|disney\+|youtube premium|icloud|google one|adobe|notion|openai|anthropic|github|cursor|midjourney|audible|apple\.com\/bill|squarespace|sqsp)\b/i },
  { category: "Shopping", match: /\b(amazon|amzn|best buy|nordstrom|zara|h&m|uniqlo|ebay|etsy|shopify|target|shein|wash kiosk)\b/i },
  { category: "Build / tools", match: /\b(aws|vercel|digitalocean|figma|domain|namecheap|godaddy|cloudflare|hardware|arduino|digikey|mouser)\b/i },
  { category: "Travel", match: /\b(airline|united|delta|jetblue|airbnb|hotel|booking\.com|expedia|tsa|jfk )\b/i },
  { category: "Fun", match: /\b(cinema|amc|ticketmaster|concert|bar |club |steam |playstation|xbox|nintendo|nayax|amusement)\b/i },
  { category: "Transfers", match: /\b(transfer|online transfer|ach|wire|venmo|zelle|cash app|paypal|from savings|to savings|goldman sachs ba transfer)\b/i },
  { category: "Fees", match: /\b(fee|overdraft|atm fee|service charge|interest charge|late fee|card replacement)\b/i },
];

export const FINANCE_CATEGORIES = [
  "Income",
  "Rent / housing",
  "Utilities",
  "Food / groceries",
  "Restaurants / coffee",
  "Transport",
  "Health",
  "Shopping",
  "Subscriptions",
  "Build / tools",
  "Travel",
  "Education / school",
  "Fun",
  "Credit card payment",
  "Transfers",
  "Fees",
  "Other",
  "Uncategorized",
] as const;

export type FinanceCategory = (typeof FINANCE_CATEGORIES)[number] | string;

/** Guess category from merchant / description text */
export function categorizeMerchant(text: string): string {
  const t = (text || "").trim();
  if (!t) return "Uncategorized";
  for (const rule of RULES) {
    if (rule.match.test(t)) return rule.category;
  }
  return "Uncategorized";
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

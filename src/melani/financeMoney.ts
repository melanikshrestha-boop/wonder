/**
 * Cents-safe money arithmetic for the Smart Accountant desk.
 * All ledger math should go through integer cents so floating-point
 * dust can never fake or lose a penny.
 */

/** Parse a user/bank amount string into integer cents. null = unparseable. */
export function parseCents(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return null;
    return Math.round(raw * 100);
  }
  let s = String(raw).trim().replace(/[$£€,\s]/g, "").replace(/"/g, "");
  if (!s) return null;
  // (123.45) accounting negative
  if (/^\(.*\)$/.test(s)) s = `-${s.slice(1, -1)}`;
  // Unicode minus
  s = s.replace(/^−/, "-");
  if (!/^[-+]?\d*(\.\d+)?$/.test(s) || !/\d/.test(s)) return null;
  const neg = s.startsWith("-");
  if (neg || s.startsWith("+")) s = s.slice(1);
  const [wholeRaw, fracRaw = ""] = s.split(".");
  const whole = wholeRaw === "" ? 0 : Number(wholeRaw);
  // Round half up at the third decimal
  const frac = Math.round(Number(`0.${fracRaw || "0"}`) * 100);
  const cents = whole * 100 + frac;
  return neg ? -cents : cents;
}

/** Dollars (float, e.g. from legacy state) → integer cents. */
export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/** Integer cents → dollars number (for display/legacy interop only). */
export function fromCents(cents: number): number {
  return cents / 100;
}

/** Sum an array of cent values (plain integer add, guards non-finite). */
export function sumCents(values: number[]): number {
  let total = 0;
  for (const v of values) {
    if (Number.isFinite(v)) total += Math.round(v);
  }
  return total;
}

/** Format integer cents as "$1,234.56" (always shows cents). */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100);
  const rem = String(abs % 100).padStart(2, "0");
  return `${sign}$${dollars.toLocaleString("en-US")}.${rem}`;
}

/**
 * Round a float dollar amount to exact cents.
 * Use when legacy code must keep number-typed dollars.
 */
export function roundDollars(dollars: number): number {
  return Math.round(dollars * 100) / 100;
}

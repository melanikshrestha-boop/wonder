import {
  msUntilNextQuoteSlot,
  quoteForSlotOffset,
  quoteSlotKey,
  type DailyQuote,
} from "./dailyQuotes";

export const MANUAL_QUOTE_LIMIT = 2;
export const QUOTE_ROTATION_EVENT = "wonder-quote-rotation";

const STORAGE_KEY = "wonder-quote-manual-rotation-v1";

type StoredRotation = {
  slotKey: string;
  changes: number;
};

export type QuoteRotationSnapshot = {
  quote: DailyQuote;
  changes: number;
  remaining: number;
  limit: number;
  msUntilReset: number;
};

function readStoredRotation(): StoredRotation | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const parsed = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || "null"
    ) as Partial<StoredRotation> | null;
    if (
      !parsed ||
      typeof parsed.slotKey !== "string" ||
      !Number.isFinite(parsed.changes)
    ) {
      return null;
    }
    return {
      slotKey: parsed.slotKey,
      changes: Math.max(
        0,
        Math.min(MANUAL_QUOTE_LIMIT, Math.floor(Number(parsed.changes)))
      ),
    };
  } catch {
    return null;
  }
}

function writeStoredRotation(rotation: StoredRotation) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rotation));
  } catch {
    /* Private browsing or storage limits should not break the quote strip. */
  }
}

function notifyQuoteRotation() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(QUOTE_ROTATION_EVENT));
}

export function currentQuoteRotation(
  now = new Date()
): QuoteRotationSnapshot {
  const slotKey = quoteSlotKey(now);
  const stored = readStoredRotation();
  const changes =
    stored?.slotKey === slotKey
      ? Math.min(MANUAL_QUOTE_LIMIT, stored.changes)
      : 0;
  return {
    quote: quoteForSlotOffset(slotKey, changes),
    changes,
    remaining: MANUAL_QUOTE_LIMIT - changes,
    limit: MANUAL_QUOTE_LIMIT,
    msUntilReset: msUntilNextQuoteSlot(now),
  };
}

export function changeQuote(now = new Date()): QuoteRotationSnapshot {
  const current = currentQuoteRotation(now);
  if (current.remaining <= 0) return current;

  writeStoredRotation({
    slotKey: quoteSlotKey(now),
    changes: current.changes + 1,
  });
  const next = currentQuoteRotation(now);
  notifyQuoteRotation();
  return next;
}


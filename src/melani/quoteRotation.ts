import {
  msUntilNextQuoteSlot,
  quoteForSlotOffset,
  quoteSlotKey,
  type DailyQuote,
} from "./dailyQuotes";
import { dietQuoteForSlotOffset } from "./dietQuotes";

export const MANUAL_QUOTE_LIMIT = 2;
export const QUOTE_ROTATION_EVENT = "wonder-quote-rotation";

/** hero = Sleep/Gym founders · meals = diet / body / life (Meals tab only) */
export type QuoteChannel = "hero" | "meals";

const STORAGE_KEY: Record<QuoteChannel, string> = {
  hero: "wonder-quote-manual-rotation-v1",
  meals: "wonder-meals-quote-manual-rotation-v1",
};

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
  channel: QuoteChannel;
};

function readStoredRotation(channel: QuoteChannel): StoredRotation | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const parsed = JSON.parse(
      localStorage.getItem(STORAGE_KEY[channel]) || "null"
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

function writeStoredRotation(channel: QuoteChannel, rotation: StoredRotation) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY[channel], JSON.stringify(rotation));
  } catch {
    /* Private browsing or storage limits should not break the quote strip. */
  }
}

function notifyQuoteRotation() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(QUOTE_ROTATION_EVENT));
}

function pickQuote(
  channel: QuoteChannel,
  slotKey: string,
  changes: number
): DailyQuote {
  if (channel === "meals") {
    return dietQuoteForSlotOffset(slotKey, changes);
  }
  return quoteForSlotOffset(slotKey, changes);
}

export function currentQuoteRotation(
  now = new Date(),
  channel: QuoteChannel = "hero"
): QuoteRotationSnapshot {
  const slotKey = quoteSlotKey(now);
  const stored = readStoredRotation(channel);
  const changes =
    stored?.slotKey === slotKey
      ? Math.min(MANUAL_QUOTE_LIMIT, stored.changes)
      : 0;
  return {
    quote: pickQuote(channel, slotKey, changes),
    changes,
    remaining: MANUAL_QUOTE_LIMIT - changes,
    limit: MANUAL_QUOTE_LIMIT,
    msUntilReset: msUntilNextQuoteSlot(now),
    channel,
  };
}

export function changeQuote(
  now = new Date(),
  channel: QuoteChannel = "hero"
): QuoteRotationSnapshot {
  const current = currentQuoteRotation(now, channel);
  if (current.remaining <= 0) return current;

  writeStoredRotation(channel, {
    slotKey: quoteSlotKey(now),
    changes: current.changes + 1,
  });
  const next = currentQuoteRotation(now, channel);
  notifyQuoteRotation();
  return next;
}

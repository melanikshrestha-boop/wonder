/**
 * Transfer intelligence — deterministic, explainable, no black box.
 * Finds likely transfer pairs (money out of one account, same amount
 * into another within a few days) so transfers and card payments never
 * inflate income or spending. Proposals only — the user approves.
 */

import type { FinanceTx } from "./financeStore";

/** Categories that represent money movement, not real income/spending. */
export const TRANSFER_CATEGORIES = new Set([
  "Transfers",
  "Credit card payment",
]);

export function isTransferLike(tx: FinanceTx): boolean {
  return TRANSFER_CATEGORIES.has(tx.category);
}

export type TransferPair = {
  outTx: FinanceTx;
  inTx: FinanceTx;
  /** 0–1 conservative confidence */
  confidence: number;
  /** Plain-English evidence for the proposal */
  reason: string;
  daysApart: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(a: string, b: string): number {
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(da) || Number.isNaN(db)) return 999;
  return Math.abs(da - db) / DAY_MS;
}

const TRANSFER_TEXT =
  /\b(transfer|zelle|venmo|cash app|paypal|payment thank you|autopay|ach|wire|to savings|from savings|from checking|to checking)\b/i;

/**
 * Detect likely transfer pairs: one expense + one income, equal amount
 * (to the cent), dated within `windowDays`, in different accounts when
 * account info exists. Conservative: both sides must not already be
 * categorized as transfers, and each tx is used at most once.
 */
export function detectTransferPairs(
  txs: FinanceTx[],
  windowDays = 3
): TransferPair[] {
  const pairs: TransferPair[] = [];
  const used = new Set<string>();

  const outs = txs.filter(
    (t) => t.kind === "expense" && !isTransferLike(t) && !t.categoryReviewed
  );
  const ins = txs.filter(
    (t) => t.kind === "income" && !isTransferLike(t) && !t.categoryReviewed
  );

  // Index incomes by cent amount for quick lookup
  const byAmount = new Map<number, FinanceTx[]>();
  for (const t of ins) {
    const cents = Math.round(t.amount * 100);
    const list = byAmount.get(cents) || [];
    list.push(t);
    byAmount.set(cents, list);
  }

  for (const out of outs) {
    if (used.has(out.id)) continue;
    const cents = Math.round(out.amount * 100);
    if (cents === 0) continue;
    const candidates = (byAmount.get(cents) || []).filter(
      (inn) =>
        !used.has(inn.id) &&
        inn.id !== out.id &&
        daysBetween(out.date, inn.date) <= windowDays &&
        // different account when both sides know their account
        !(out.accountId && inn.accountId && out.accountId === inn.accountId)
    );
    if (!candidates.length) continue;
    // Closest date wins
    candidates.sort(
      (a, b) => daysBetween(out.date, a.date) - daysBetween(out.date, b.date)
    );
    const inn = candidates[0];
    const gap = daysBetween(out.date, inn.date);

    const textHit =
      TRANSFER_TEXT.test(`${out.merchant || ""} ${out.note || ""}`) ||
      TRANSFER_TEXT.test(`${inn.merchant || ""} ${inn.note || ""}`);
    const differentAccounts = Boolean(
      out.accountId && inn.accountId && out.accountId !== inn.accountId
    );

    // Conservative scoring: exact amount match is the base signal.
    let confidence = 0.5;
    if (gap === 0) confidence += 0.15;
    if (textHit) confidence += 0.25;
    if (differentAccounts) confidence += 0.1;
    confidence = Math.min(0.95, confidence);

    // Skip weak matches entirely — small everyday amounts collide often.
    if (!textHit && cents < 5000) continue;

    const reasons: string[] = [
      `same amount ($${out.amount.toFixed(2)}) out and in`,
      gap === 0 ? "same day" : `${Math.round(gap)} day(s) apart`,
    ];
    if (textHit) reasons.push("description mentions a transfer service");
    if (differentAccounts) reasons.push("between two different accounts");

    used.add(out.id);
    used.add(inn.id);
    pairs.push({
      outTx: out,
      inTx: inn,
      confidence,
      reason: reasons.join(" · "),
      daysApart: Math.round(gap),
    });
  }

  return pairs.sort((a, b) => b.confidence - a.confidence);
}

/** Apply a pair: recategorize both sides as Transfers (explicit, reversible). */
export function applyTransferPair(
  txs: FinanceTx[],
  pair: TransferPair
): FinanceTx[] {
  return txs.map((t) =>
    t.id === pair.outTx.id || t.id === pair.inTx.id
      ? { ...t, category: "Transfers", categoryReviewed: true }
      : t
  );
}

/** Income for a month excluding transfer-like categories. */
export function monthTrueIncome(txs: FinanceTx[], ym: string): number {
  let s = 0;
  for (const t of txs) {
    if (t.kind === "income" && t.date.startsWith(ym) && !isTransferLike(t))
      s += t.amount;
  }
  return Math.round(s * 100) / 100;
}

/** Spending for a month excluding transfers and card payments. */
export function monthTrueSpend(txs: FinanceTx[], ym: string): number {
  let s = 0;
  for (const t of txs) {
    if (t.kind === "expense" && t.date.startsWith(ym) && !isTransferLike(t))
      s += t.amount;
  }
  return Math.round(s * 100) / 100;
}

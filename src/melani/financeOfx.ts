/**
 * OFX / QFX import — parse bank & card exports without any API.
 * Handles both OFX 1.x (SGML, unclosed tags) and OFX 2.x (XML).
 * Provenance: FITID becomes the transaction externalId so re-imports
 * of the same statement never duplicate rows.
 */

import { categorizeMerchant, cleanMerchant } from "./financeCategorize";
import { parseCents, fromCents } from "./financeMoney";
import type { FinanceTx, TxKind } from "./financeStore";

export type OfxTxRow = {
  fitId: string;
  date: string; // YYYY-MM-DD
  /** Signed dollars: negative = money out */
  amount: number;
  name: string;
  memo: string;
  type: string; // DEBIT / CREDIT / POS / ATM / ...
};

export type OfxParseResult = {
  rows: OfxTxRow[];
  /** Account number suffix if the file declares one */
  accountSuffix: string | null;
  /** BANK or CREDITCARD statement */
  statementKind: "bank" | "credit" | "unknown";
  errors: string[];
};

export type OfxImportResult = {
  added: FinanceTx[];
  skipped: number;
  errors: string[];
};

function uid() {
  return `tx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** OFX dates look like 20240131 or 20240131120000[-5:EST] */
function parseOfxDate(raw: string): string | null {
  const m = (raw || "").trim().match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const yn = Number(y);
  const mn = Number(mo);
  const dn = Number(d);
  if (yn < 1900 || yn > 2200 || mn < 1 || mn > 12 || dn < 1 || dn > 31) return null;
  return `${y}-${mo}-${d}`;
}

/**
 * Extract the value of an SGML/XML tag. OFX 1.x leaves tags unclosed
 * (<NAME>Starbucks) so we read until the next tag or line break.
 */
function tagValue(block: string, tag: string): string {
  const re = new RegExp(`<${tag}>([^<\\r\\n]*)`, "i");
  const m = block.match(re);
  return m ? m[1].trim() : "";
}

/** True if the text looks like an OFX/QFX document at all. */
export function looksLikeOfx(text: string): boolean {
  const head = text.slice(0, 2000).toUpperCase();
  return head.includes("<OFX") || head.includes("OFXHEADER");
}

/** Parse OFX/QFX text into raw statement rows (no dedupe, no categorizing). */
export function parseOfx(text: string): OfxParseResult {
  const errors: string[] = [];
  const rows: OfxTxRow[] = [];
  if (!looksLikeOfx(text)) {
    return {
      rows,
      accountSuffix: null,
      statementKind: "unknown",
      errors: ["Not an OFX/QFX file — expected an <OFX> document."],
    };
  }

  const statementKind: OfxParseResult["statementKind"] = /<CCSTMTRS>/i.test(text)
    ? "credit"
    : /<STMTRS>/i.test(text)
      ? "bank"
      : "unknown";

  const acctRaw = tagValue(text, "ACCTID");
  const accountSuffix = acctRaw ? acctRaw.slice(-4) : null;

  // Each transaction lives in a <STMTTRN> ... </STMTTRN> block (2.x) or a
  // <STMTTRN> block ended by the next <STMTTRN> / </BANKTRANLIST> (1.x SGML).
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  let n = 0;
  for (const rawBlock of blocks) {
    n++;
    const block = rawBlock.split(/<\/STMTTRN>|<STMTTRN>/i)[0];
    const date = parseOfxDate(tagValue(block, "DTPOSTED"));
    const cents = parseCents(tagValue(block, "TRNAMT"));
    const fitId = tagValue(block, "FITID");
    if (!date) {
      errors.push(`Transaction ${n}: missing/invalid DTPOSTED date`);
      continue;
    }
    if (cents == null || cents === 0) {
      errors.push(`Transaction ${n}: missing/zero TRNAMT amount`);
      continue;
    }
    const name = tagValue(block, "NAME");
    const memo = tagValue(block, "MEMO");
    rows.push({
      fitId: fitId || `${date}:${cents}:${(name || memo).slice(0, 24)}`,
      date,
      amount: fromCents(cents),
      name,
      memo,
      type: tagValue(block, "TRNTYPE").toUpperCase(),
    });
  }

  if (!rows.length && !errors.length) {
    errors.push("No <STMTTRN> transactions found in the file.");
  }
  return { rows, accountSuffix, statementKind, errors: errors.slice(0, 20) };
}

/**
 * Convert parsed OFX rows into ledger transactions.
 * existingFingerprints: externalIds already in the books (FITID-based
 * `ofx:` keys and legacy fingerprints both respected).
 */
export function ofxRowsToTxs(
  parsed: OfxParseResult,
  opts?: {
    accountId?: string;
    existingFingerprints?: Set<string>;
  }
): OfxImportResult {
  const added: FinanceTx[] = [];
  let skipped = 0;
  const existing = opts?.existingFingerprints || new Set<string>();

  for (const row of parsed.rows) {
    const externalId = `ofx:${row.fitId}`;
    if (existing.has(externalId)) {
      skipped++;
      continue;
    }
    existing.add(externalId);

    // Credit-card statements report charges as negative TRNAMT too,
    // so sign alone is the direction: negative = money out.
    const kind: TxKind = row.amount < 0 ? "expense" : "income";
    const rawName = row.name || row.memo || "Transaction";
    const merchant = cleanMerchant(rawName) || "Transaction";
    const category =
      kind === "income" ? "Income" : categorizeMerchant(`${row.name} ${row.memo}`);

    added.push({
      id: uid(),
      date: row.date,
      kind,
      amount: Math.abs(row.amount),
      category,
      note: row.memo || merchant,
      merchant,
      accountId: opts?.accountId || null,
      source: "import",
      externalId,
      pending: false,
    });
  }

  return { added, skipped, errors: parsed.errors };
}

/** One-call helper: OFX text → ledger transactions. */
export function importOfx(
  text: string,
  opts?: { accountId?: string; existingFingerprints?: Set<string> }
): OfxImportResult {
  return ofxRowsToTxs(parseOfx(text), opts);
}

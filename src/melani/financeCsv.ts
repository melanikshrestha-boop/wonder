/**
 * Bank CSV import — Mintable-style local import without Plaid.
 * Accepts common export shapes (Chase, Amex, Capital One, generic).
 */

import {
  categorizeMerchant,
  cleanMerchant,
} from "./financeCategorize";
import type { FinanceTx, TxKind } from "./financeStore";

export type CsvImportResult = {
  added: FinanceTx[];
  skipped: number;
  errors: string[];
};

function uid() {
  return `tx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Parse one CSV line with quotes */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQ = !inQ;
      continue;
    }
    if (ch === "," && !inQ) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function parseDate(raw: string): string | null {
  const s = raw.trim().replace(/"/g, "");
  if (!s) return null;
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // MM/DD/YYYY
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    const mm = m[1].padStart(2, "0");
    const dd = m[2].padStart(2, "0");
    let yy = m[3];
    if (yy.length === 2) yy = `20${yy}`;
    return `${yy}-${mm}-${dd}`;
  }
  // DD-MM-YYYY rare
  const m2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (m2) {
    return `${m2[3]}-${m2[2].padStart(2, "0")}-${m2[1].padStart(2, "0")}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function parseAmount(raw: string): number | null {
  if (raw == null) return null;
  let s = String(raw).trim().replace(/[$£€,\s]/g, "").replace(/"/g, "");
  if (!s) return null;
  // (123.45) = negative
  if (/^\(.*\)$/.test(s)) s = `-${s.slice(1, -1)}`;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function normHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

type ColMap = {
  date?: number;
  amount?: number;
  debit?: number;
  credit?: number;
  desc?: number;
  name?: number;
  category?: number;
  /** Bank "Type" column (Zelle credit, ACH debit, DEBIT_CARD…) */
  txType?: number;
};

function mapHeaders(headers: string[]): ColMap {
  const map: ColMap = {};
  headers.forEach((h, i) => {
    const n = normHeader(h);
    if (!map.date && /^(date|transactiondate|posteddate|postingdate)$/.test(n))
      map.date = i;
    if (!map.amount && /^(amount|transactionamount|value|sum)$/.test(n))
      map.amount = i;
    if (!map.debit && /^(debit|withdrawal|out)$/.test(n)) map.debit = i;
    if (!map.credit && /^(credit|deposit|in)$/.test(n)) map.credit = i;
    if (
      !map.desc &&
      /^(description|memo|details|narrative|transactiondescription)$/.test(n)
    )
      map.desc = i;
    if (!map.name && /^(name|merchant|payee|vendor)$/.test(n)) map.name = i;
    if (!map.category && n === "category") map.category = i;
    if (!map.txType && /^(type|transactiontype|trantype)$/.test(n))
      map.txType = i;
  });
  return map;
}

/** Fingerprint for dedupe across imports */
export function txFingerprint(tx: {
  date: string;
  amount: number;
  merchant: string;
}): string {
  const m = (tx.merchant || "").toLowerCase().replace(/\s+/g, " ").trim();
  return `${tx.date}|${tx.amount.toFixed(2)}|${m.slice(0, 40)}`;
}

/**
 * Parse a bank CSV string into transactions.
 * existingFingerprints: skip rows already in the ledger.
 */
export function parseBankCsv(
  csvText: string,
  opts?: {
    accountId?: string;
    existingFingerprints?: Set<string>;
  }
): CsvImportResult {
  const errors: string[] = [];
  const added: FinanceTx[] = [];
  let skipped = 0;
  const existing = opts?.existingFingerprints || new Set<string>();

  const lines = csvText
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return { added, skipped: 0, errors: ["CSV needs a header row and data rows."] };
  }

  const headers = splitCsvLine(lines[0]);
  const col = mapHeaders(headers);
  if (col.date == null) {
    return {
      added,
      skipped: 0,
      errors: [
        "Could not find a Date column. Export from your bank as CSV with Date + Amount + Description.",
      ],
    };
  }
  if (col.amount == null && col.debit == null && col.credit == null) {
    return {
      added,
      skipped: 0,
      errors: ["Could not find Amount (or Debit/Credit) columns."],
    };
  }

  for (let r = 1; r < lines.length; r++) {
    const cells = splitCsvLine(lines[r]);
    const date = parseDate(cells[col.date!] || "");
    if (!date) {
      errors.push(`Row ${r + 1}: bad date`);
      continue;
    }

    let amount: number | null = null;
    if (col.amount != null) amount = parseAmount(cells[col.amount] || "");
    else {
      const deb = col.debit != null ? parseAmount(cells[col.debit] || "") : null;
      const cred = col.credit != null ? parseAmount(cells[col.credit] || "") : null;
      if (deb != null && deb !== 0) amount = -Math.abs(deb);
      else if (cred != null && cred !== 0) amount = Math.abs(cred);
    }
    if (amount == null || amount === 0) {
      skipped++;
      continue;
    }

    const rawName =
      (col.name != null ? cells[col.name] : "") ||
      (col.desc != null ? cells[col.desc] : "") ||
      "Transaction";
    const merchant = cleanMerchant(rawName) || "Transaction";
    const kind: TxKind = amount < 0 ? "expense" : "income";
    const abs = Math.abs(amount);
    const catRaw = col.category != null ? cells[col.category] : "";
    const category =
      (catRaw && catRaw.trim()) ||
      (kind === "income" ? "Income" : categorizeMerchant(merchant));

    const fp = txFingerprint({ date, amount: kind === "expense" ? -abs : abs, merchant });
    // store fingerprint with signed amount for expenses as negative convention in fp
    const fpKey = txFingerprint({
      date,
      amount: kind === "expense" ? -abs : abs,
      merchant,
    });
    if (existing.has(fpKey) || existing.has(fp)) {
      skipped++;
      continue;
    }
    existing.add(fpKey);

    const typeRaw = col.txType != null ? (cells[col.txType] || "").trim() : "";
    added.push({
      id: uid(),
      date,
      kind,
      amount: abs,
      category,
      note: merchant,
      merchant,
      accountId: opts?.accountId || null,
      source: "csv",
      externalId: fpKey,
      pending: false,
      txType: typeRaw || null,
    });
  }

  return { added, skipped, errors: errors.slice(0, 20) };
}

/** Export full ledger as CSV (Mintable-style dump) */
export function exportLedgerCsv(txs: FinanceTx[]): string {
  const header = "Date,Amount,Type,Category,Merchant,Note,AccountId,Source,ExternalId";
  const rows = txs.map((t) => {
    const signed = t.kind === "expense" ? -t.amount : t.amount;
    const cells = [
      t.date,
      signed.toFixed(2),
      t.kind,
      t.category,
      t.merchant || t.note || "",
      t.note || "",
      t.accountId || "",
      t.source || "manual",
      t.externalId || "",
    ].map((c) => {
      const s = String(c);
      return s.includes(",") || s.includes('"')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    });
    return cells.join(",");
  });
  return [header, ...rows].join("\n");
}

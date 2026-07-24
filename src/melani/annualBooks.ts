/**
 * Annual books grid — Smartsheet/Excel-style personal budget sheet,
 * auto-populated from the ledger. Rows = income sources / savings /
 * expense categories; columns = Jan…Dec; monthly + annual totals.
 * Everything is computed live — no manual data entry needed.
 */

import type { FinanceTx } from "./financeStore";
import { isTransferLike } from "./financeTransfers";

export type AnnualRow = {
  label: string;
  /** Dollars per month index 0–11 */
  monthly: number[];
  annual: number;
};

export type AnnualSection = {
  title: "Income" | "Savings" | "Expenses";
  rows: AnnualRow[];
  monthlyTotals: number[];
  annualTotal: number;
};

export type AnnualBook = {
  year: number;
  income: AnnualSection;
  savings: AnnualSection;
  expenses: AnnualSection;
  /** income − expenses per month */
  netByMonth: number[];
  /** Annual: income − expenses */
  potentialToSave: number;
  /** Share of annual flow (income vs expenses vs saved), for the pie */
  split: { income: number; expenses: number; saved: number };
};

const r2 = (n: number) => Math.round(n * 100) / 100;

function emptySection(title: AnnualSection["title"]): AnnualSection {
  return {
    title,
    rows: [],
    monthlyTotals: new Array(12).fill(0),
    annualTotal: 0,
  };
}

function finalize(section: AnnualSection): AnnualSection {
  const monthlyTotals = new Array(12).fill(0);
  for (const row of section.rows) {
    row.annual = r2(row.monthly.reduce((a, b) => a + b, 0));
    for (let m = 0; m < 12; m++) monthlyTotals[m] += row.monthly[m];
  }
  section.rows.sort((a, b) => b.annual - a.annual);
  section.monthlyTotals = monthlyTotals.map(r2);
  section.annualTotal = r2(monthlyTotals.reduce((a, b) => a + b, 0));
  return section;
}

/**
 * Build the annual grid for one year straight from transactions.
 * Income rows: by payer/merchant (top sources, rest grouped as Other).
 * Expense rows: by category. Savings rows: transfer-like outflows
 * (money moved to savings/investments, card payments excluded).
 */
export function buildAnnualBook(txs: FinanceTx[], year: number): AnnualBook {
  const income = emptySection("Income");
  const savings = emptySection("Savings");
  const expenses = emptySection("Expenses");

  const incomeMap = new Map<string, number[]>();
  const savingsMap = new Map<string, number[]>();
  const expenseMap = new Map<string, number[]>();

  const prefix = String(year);
  for (const t of txs) {
    if (!t.date.startsWith(prefix)) continue;
    const m = Number(t.date.slice(5, 7)) - 1;
    if (m < 0 || m > 11) continue;

    if (t.kind === "income" && !isTransferLike(t)) {
      const label = (t.merchant || t.note || "Other income").trim() || "Other income";
      if (!incomeMap.has(label)) incomeMap.set(label, new Array(12).fill(0));
      incomeMap.get(label)![m] += t.amount;
    } else if (t.kind === "expense" && t.category === "Transfers") {
      const label = (t.merchant || t.note || "Transfer").trim() || "Transfer";
      if (!savingsMap.has(label)) savingsMap.set(label, new Array(12).fill(0));
      savingsMap.get(label)![m] += t.amount;
    } else if (t.kind === "expense" && !isTransferLike(t)) {
      const label = t.category || "Uncategorized";
      if (!expenseMap.has(label)) expenseMap.set(label, new Array(12).fill(0));
      expenseMap.get(label)![m] += t.amount;
    }
  }

  /** Collapse a map into rows, keeping the top N and grouping the rest. */
  const toRows = (map: Map<string, number[]>, topN: number, otherLabel: string) => {
    const entries = [...map.entries()].map(([label, monthly]) => ({
      label,
      monthly: monthly.map(r2),
      annual: r2(monthly.reduce((a, b) => a + b, 0)),
    }));
    entries.sort((a, b) => b.annual - a.annual);
    const top = entries.slice(0, topN);
    const rest = entries.slice(topN);
    if (rest.length) {
      const monthly = new Array(12).fill(0);
      for (const e of rest) {
        for (let m = 0; m < 12; m++) monthly[m] += e.monthly[m];
      }
      top.push({
        label: `${otherLabel} (${rest.length})`,
        monthly: monthly.map(r2),
        annual: r2(monthly.reduce((a, b) => a + b, 0)),
      });
    }
    return top;
  };

  income.rows = toRows(incomeMap, 7, "Other income");
  savings.rows = toRows(savingsMap, 6, "Other transfers");
  expenses.rows = toRows(expenseMap, 14, "Other");

  finalize(income);
  finalize(savings);
  finalize(expenses);

  const netByMonth = income.monthlyTotals.map((inc, m) =>
    r2(inc - expenses.monthlyTotals[m])
  );
  const potentialToSave = r2(income.annualTotal - expenses.annualTotal);

  const flowTotal = income.annualTotal + expenses.annualTotal + Math.max(0, potentialToSave);
  const split =
    flowTotal > 0
      ? {
          income: r2(income.annualTotal / flowTotal),
          expenses: r2(expenses.annualTotal / flowTotal),
          saved: r2(Math.max(0, potentialToSave) / flowTotal),
        }
      : { income: 0, expenses: 0, saved: 0 };

  return {
    year,
    income,
    savings,
    expenses,
    netByMonth,
    potentialToSave,
    split,
  };
}

/** Export the annual book as CSV (opens in Excel/Numbers). */
export function annualBookCsv(book: AnnualBook): string {
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const lines: string[] = [];
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  lines.push([`${book.year}`, ...MONTHS, "Annual"].join(","));
  for (const section of [book.income, book.savings, book.expenses]) {
    lines.push(esc(section.title));
    for (const row of section.rows) {
      lines.push(
        [esc(row.label), ...row.monthly.map((v) => v.toFixed(2)), row.annual.toFixed(2)].join(",")
      );
    }
    lines.push(
      [esc(`${section.title} total`), ...section.monthlyTotals.map((v) => v.toFixed(2)), section.annualTotal.toFixed(2)].join(",")
    );
  }
  lines.push(
    [esc("Net (income − expenses)"), ...book.netByMonth.map((v) => v.toFixed(2)), book.potentialToSave.toFixed(2)].join(",")
  );
  return lines.join("\n");
}

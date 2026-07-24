/**
 * A tiny SQL engine over your ledger. One table — `transactions` — with the
 * columns below. Supports SELECT (columns, *, and SUM/COUNT/AVG/MIN/MAX),
 * WHERE (=, !=, >, <, >=, <=, LIKE with %, AND/OR), GROUP BY, ORDER BY, LIMIT.
 * It reads your actual rows, so the numbers are exactly your data.
 */

import { txTypeOf, type FinanceTx } from "./financeStore";
import { isTransferLike } from "./financeTransfers";

export type SqlRow = Record<string, string | number>;

export type SqlResult = {
  columns: string[];
  rows: (string | number)[][];
  rowCount: number;
  error?: string;
};

export const SQL_COLUMNS = [
  "date",
  "month",
  "year",
  "merchant",
  "category",
  "kind",
  "amount",
  "type",
  "note",
  "transfer",
] as const;

export const SQL_SAMPLES: { label: string; sql: string }[] = [
  { label: "Spend by category", sql: "SELECT category, SUM(amount) FROM transactions WHERE kind = 'expense' GROUP BY category ORDER BY SUM(amount) DESC" },
  { label: "Top merchants", sql: "SELECT merchant, SUM(amount), COUNT(*) FROM transactions WHERE kind = 'expense' GROUP BY merchant ORDER BY SUM(amount) DESC LIMIT 10" },
  { label: "Monthly spend", sql: "SELECT month, SUM(amount) FROM transactions WHERE kind = 'expense' AND transfer = 0 GROUP BY month ORDER BY month DESC" },
  { label: "Big charges", sql: "SELECT date, merchant, amount FROM transactions WHERE kind = 'expense' AND amount > 100 ORDER BY amount DESC LIMIT 20" },
  { label: "Search a payee", sql: "SELECT date, merchant, amount FROM transactions WHERE merchant LIKE '%amazon%' ORDER BY date DESC" },
  { label: "Income by month", sql: "SELECT month, SUM(amount) FROM transactions WHERE kind = 'income' GROUP BY month ORDER BY month DESC" },
];

function toRow(t: FinanceTx): SqlRow {
  return {
    date: t.date,
    month: t.date.slice(0, 7),
    year: t.date.slice(0, 4),
    merchant: (t.merchant || t.note || "").trim(),
    category: t.category || "",
    kind: t.kind,
    amount: Math.round(t.amount * 100) / 100,
    type: txTypeOf(t),
    note: t.note || "",
    transfer: isTransferLike(t) ? 1 : 0,
  };
}

type Cond = { col: string; op: string; val: string | number; wildcard?: boolean };

function parseValue(raw: string): string | number {
  const s = raw.trim();
  if (/^'.*'$/.test(s) || /^".*"$/.test(s)) return s.slice(1, -1);
  const n = Number(s);
  return Number.isFinite(n) && s !== "" ? n : s;
}

/** Parse a WHERE clause into OR-groups of AND-conditions. */
function parseWhere(where: string): Cond[][] {
  const orGroups = where.split(/\s+OR\s+/i);
  return orGroups.map((group) =>
    group.split(/\s+AND\s+/i).map((cond) => {
      const m = cond
        .trim()
        .match(/^([a-z_]+)\s*(>=|<=|!=|<>|=|>|<|\bLIKE\b|\bNOT LIKE\b)\s*(.+)$/i);
      if (!m) throw new Error(`Bad condition: ${cond.trim()}`);
      const op = m[2].toUpperCase();
      let val = parseValue(m[3]);
      let wildcard = false;
      if (op.includes("LIKE") && typeof val === "string") {
        wildcard = true;
      }
      return { col: m[1].toLowerCase(), op, val, wildcard };
    })
  );
}

function likeToRegex(pattern: string): RegExp {
  const esc = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".");
  return new RegExp(`^${esc}$`, "i");
}

function testCond(row: SqlRow, c: Cond): boolean {
  const cell = row[c.col];
  if (cell === undefined) throw new Error(`Unknown column: ${c.col}`);
  if (c.op === "LIKE" || c.op === "NOT LIKE") {
    const match = likeToRegex(String(c.val)).test(String(cell));
    return c.op === "LIKE" ? match : !match;
  }
  // Numeric compare when both sides look numeric
  const bothNum = typeof cell === "number" && typeof c.val === "number";
  const a = bothNum ? (cell as number) : String(cell).toLowerCase();
  const b = bothNum ? (c.val as number) : String(c.val).toLowerCase();
  switch (c.op) {
    case "=": return a === b;
    case "!=":
    case "<>": return a !== b;
    case ">": return a > b;
    case "<": return a < b;
    case ">=": return a >= b;
    case "<=": return a <= b;
    default: return false;
  }
}

function passesWhere(row: SqlRow, groups: Cond[][]): boolean {
  // OR of AND-groups
  return groups.some((and) => and.every((c) => testCond(row, c)));
}

type SelItem = { raw: string; fn?: string; arg?: string; alias: string };

function parseSelect(list: string): SelItem[] {
  return splitTop(list).map((item) => {
    const t = item.trim();
    const fnMatch = t.match(/^(SUM|COUNT|AVG|MIN|MAX)\s*\(\s*(\*|[a-z_]+)\s*\)$/i);
    if (fnMatch) {
      const fn = fnMatch[1].toUpperCase();
      const arg = fnMatch[2];
      return { raw: t, fn, arg, alias: `${fn}(${arg})` };
    }
    return { raw: t, alias: t };
  });
}

/** Split a comma list, ignoring commas inside parentheses. */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

function aggregate(rows: SqlRow[], fn: string, arg: string): number {
  if (fn === "COUNT") return arg === "*" ? rows.length : rows.filter((r) => r[arg] != null).length;
  const nums = rows.map((r) => Number(r[arg])).filter((n) => Number.isFinite(n));
  if (!nums.length) return 0;
  if (fn === "SUM") return Math.round(nums.reduce((s, n) => s + n, 0) * 100) / 100;
  if (fn === "AVG") return Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 100) / 100;
  if (fn === "MIN") return Math.min(...nums);
  if (fn === "MAX") return Math.max(...nums);
  return 0;
}

export function runSql(query: string, txs: FinanceTx[]): SqlResult {
  try {
    const q = query.trim().replace(/;+\s*$/, "");
    if (!q) return { columns: [], rows: [], rowCount: 0 };
    if (!/^select\b/i.test(q)) throw new Error("Only SELECT is supported.");

    const m = q.match(
      /^select\s+(.+?)\s+from\s+([a-z_]+)(?:\s+where\s+(.+?))?(?:\s+group\s+by\s+([a-z_]+))?(?:\s+order\s+by\s+(.+?)\s*(asc|desc)?)?(?:\s+limit\s+(\d+))?$/i
    );
    if (!m) throw new Error("Could not parse the query.");
    const [, selRaw, table, whereRaw, groupByRaw, orderByRaw, orderDir, limitRaw] = m;
    if (table.toLowerCase() !== "transactions") {
      throw new Error(`Unknown table "${table}". Use "transactions".`);
    }

    let rows = txs.map(toRow);

    if (whereRaw) {
      const groups = parseWhere(whereRaw);
      rows = rows.filter((r) => passesWhere(r, groups));
    }

    const select = parseSelect(selRaw);
    const hasStar = select.some((s) => s.raw === "*");
    const hasAgg = select.some((s) => s.fn);

    let outCols: string[];
    let outRows: (string | number)[][];

    if (groupByRaw || (hasAgg && !groupByRaw)) {
      const groupCol = groupByRaw ? groupByRaw.toLowerCase() : null;
      const buckets = new Map<string, SqlRow[]>();
      if (groupCol) {
        for (const r of rows) {
          const key = String(r[groupCol]);
          const arr = buckets.get(key) || [];
          arr.push(r);
          buckets.set(key, arr);
        }
      } else {
        buckets.set("__all__", rows);
      }
      outCols = select.map((s) => s.alias);
      outRows = [...buckets.entries()].map(([, groupRows]) =>
        select.map((s) => {
          if (s.fn) return aggregate(groupRows, s.fn, s.arg || "*");
          return groupRows[0]?.[s.raw.toLowerCase()] ?? "";
        })
      );
    } else {
      outCols = hasStar ? [...SQL_COLUMNS] : select.map((s) => s.alias);
      outRows = rows.map((r) =>
        hasStar ? SQL_COLUMNS.map((c) => r[c]) : select.map((s) => r[s.raw.toLowerCase()] ?? "")
      );
    }

    // ORDER BY
    if (orderByRaw) {
      const key = orderByRaw.trim();
      const idx = outCols.findIndex((c) => c.toLowerCase() === key.toLowerCase());
      const dir = (orderDir || "asc").toLowerCase() === "desc" ? -1 : 1;
      if (idx >= 0) {
        outRows.sort((a, b) => {
          const x = a[idx];
          const y = b[idx];
          if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
          return String(x).localeCompare(String(y)) * dir;
        });
      }
    }

    const limit = limitRaw ? Number(limitRaw) : undefined;
    if (limit != null) outRows = outRows.slice(0, limit);

    return { columns: outCols, rows: outRows, rowCount: outRows.length };
  } catch (e) {
    return {
      columns: [],
      rows: [],
      rowCount: 0,
      error: e instanceof Error ? e.message : "Query failed.",
    };
  }
}

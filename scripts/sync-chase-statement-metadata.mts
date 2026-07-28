import fs from "node:fs/promises";
import { CHASE_STATEMENT_TXS } from "../src/melani/chaseStatementData.ts";

const CSV_PATH = new URL("../src/melani/chase_every_purchase.csv", import.meta.url);
const DATA_PATH = new URL("../src/melani/chaseStatementData.ts", import.meta.url);

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

const csv = await fs.readFile(CSV_PATH, "utf8");
const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
const headers = splitCsvLine(lines[0]);
const column = (name: string) => {
  const index = headers.indexOf(name);
  if (index < 0) throw new Error(`Missing CSV column: ${name}`);
  return index;
};
const columns = {
  date: column("Date"),
  payee: column("Payee / Description"),
  category: column("Category"),
  signed: column("Amount (signed)"),
  balance: column("Running Balance (statement)"),
};
const csvRows = lines.slice(1).map((line, index) => {
  const cells = splitCsvLine(line);
  return {
    date: cells[columns.date],
    payee: cells[columns.payee],
    category: cells[columns.category],
    signed: Number(cells[columns.signed]),
    balance: Number(cells[columns.balance]),
    statementOrder: index + 1,
  };
});

const cents = (value: number) => Math.round(value * 100);
const beforeCents = (row: (typeof csvRows)[number]) =>
  cents(row.balance - row.signed);
const afterCents = (row: (typeof csvRows)[number]) => cents(row.balance);

function chainDay(
  rows: (typeof csvRows),
  opening: number | null
): (typeof csvRows) {
  const search = (
    current: number,
    remaining: (typeof csvRows),
    path: (typeof csvRows)
  ): (typeof csvRows) | null => {
    if (!remaining.length) return path;
    for (let index = 0; index < remaining.length; index += 1) {
      const row = remaining[index];
      if (beforeCents(row) !== current) continue;
      const result = search(
        afterCents(row),
        [...remaining.slice(0, index), ...remaining.slice(index + 1)],
        [...path, row]
      );
      if (result) return result;
    }
    return null;
  };
  if (opening != null) {
    const result = search(opening, rows, []);
    if (result) return result;
  } else {
    for (let index = 0; index < rows.length; index += 1) {
      const first = rows[index];
      const result = search(
        afterCents(first),
        [...rows.slice(0, index), ...rows.slice(index + 1)],
        [first]
      );
      if (result) return result;
    }
  }
  throw new Error(
    `Could not reconstruct statement order for ${rows[0]?.date} from ${
      opening == null ? "unknown opening" : `$${(opening / 100).toFixed(2)}`
    }`
  );
}

const byDate = new Map<string, typeof csvRows>();
for (const row of csvRows) {
  const group = byDate.get(row.date) || [];
  group.push(row);
  byDate.set(row.date, group);
}
const chronologicalOrder = new Map<number, number>();
let previousBalance: number | null = null;
let ledgerOrder = 0;
for (const date of [...byDate.keys()].sort()) {
  const chained = chainDay(byDate.get(date) || [], previousBalance);
  for (const row of chained) {
    ledgerOrder += 1;
    chronologicalOrder.set(row.statementOrder, ledgerOrder);
  }
  previousBalance = afterCents(chained.at(-1)!);
}
if (csvRows.length !== CHASE_STATEMENT_TXS.length) {
  throw new Error(
    `CSV has ${csvRows.length} rows but generated data has ${CHASE_STATEMENT_TXS.length}`
  );
}

const rowKey = (row: {
  date: string;
  signed: number;
  payee: string;
}) =>
  [
    row.date,
    row.signed < 0 ? "expense" : "income",
    Math.abs(row.signed).toFixed(2),
    row.payee,
  ].join("|");
const queues = new Map<string, typeof csvRows>();
for (const row of [...csvRows].reverse()) {
  const key = rowKey(row);
  const queue = queues.get(key) || [];
  queue.push(row);
  queues.set(key, queue);
}

const metadata = new Map<
  string,
  { category: string; balance: number; statementOrder: number }
>();
for (let index = 0; index < CHASE_STATEMENT_TXS.length; index += 1) {
  const tx = CHASE_STATEMENT_TXS[index];
  const key = [
    tx.date,
    tx.kind,
    tx.amount.toFixed(2),
    tx.merchant || tx.note || "",
  ].join("|");
  const row = queues.get(key)?.shift();
  if (!row) {
    throw new Error(
      `No matching CSV row at generated index ${index}: ${key}`
    );
  }
  metadata.set(tx.id, {
    category: row.category,
    balance: row.balance,
    statementOrder: chronologicalOrder.get(row.statementOrder)!,
  });
}
const unmatched = [...queues.values()].reduce((sum, queue) => sum + queue.length, 0);
if (unmatched) throw new Error(`${unmatched} CSV rows were not matched`);

let source = await fs.readFile(DATA_PATH, "utf8");
const startMarker = "export const CHASE_STATEMENT_TXS: FinanceTx[] = [";
const endMarker = "\n] as FinanceTx[];";
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);
if (start < 0 || end < 0) throw new Error("Could not locate Chase transaction array");

const bodyStart = start + startMarker.length;
const body = source.slice(bodyStart, end);
let replaced = 0;
let currentId = "";
const nextLines: string[] = [];
for (const line of body.split("\n")) {
  const id = line.match(/^\s+"id": "([^"]+)",$/)?.[1];
  if (id) currentId = id;
  if (/^\s+"statement(?:Balance|Order)":/.test(line)) continue;
  const item = currentId ? metadata.get(currentId) : undefined;
  if (item && /^\s+"category":/.test(line)) {
    nextLines.push(`    "category": ${JSON.stringify(item.category)},`);
    continue;
  }
  if (item && /^\s+"pending":/.test(line)) {
    nextLines.push(`    "statementBalance": ${item.balance},`);
    nextLines.push(`    "statementOrder": ${item.statementOrder},`);
    nextLines.push(line);
    replaced += 1;
    continue;
  }
  nextLines.push(line);
}
const nextBody = nextLines.join("\n");

if (replaced !== CHASE_STATEMENT_TXS.length) {
  throw new Error(`Updated ${replaced} objects; expected ${CHASE_STATEMENT_TXS.length}`);
}

source = `${source.slice(0, bodyStart)}${nextBody}${source.slice(end)}`;
await fs.writeFile(DATA_PATH, source);
console.log(
  `Synced ${replaced} Chase rows with bank balances/order; final balance $${csvRows.at(-1)?.balance.toFixed(2)}`
);

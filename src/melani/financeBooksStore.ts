/**
 * Persistent books extras (separate from the main ledger so we never break txs).
 * Payables, receivables, receipts, closed months — local only.
 * Plain English: this is the filing cabinet next to the checkbook.
 */

export type Payable = {
  id: string;
  what: string; // what you owe
  amount: number;
  dueDate: string; // YYYY-MM-DD
  paid: boolean;
  paidDate?: string | null;
  note?: string;
  createdAt: string;
};

export type Receivable = {
  id: string;
  who: string; // who owes you
  amount: number;
  dueDate: string;
  received: boolean;
  receivedDate?: string | null;
  note?: string;
  createdAt: string;
};

/** Receipt / proof file stored as small metadata (+ optional data URL for tiny files) */
export type ReceiptItem = {
  id: string;
  name: string;
  kind: "receipt" | "invoice" | "warranty" | "pdf" | "screenshot" | "other";
  /** Link to a tx id when matched */
  txId?: string | null;
  /** ISO date of the document if known */
  docDate?: string | null;
  amount?: number | null;
  note?: string;
  /** Optional tiny file as data URL (skip large files) */
  dataUrl?: string | null;
  mime?: string | null;
  createdAt: string;
};

export type BooksExtraState = {
  version: 1;
  payables: Payable[];
  receivables: Receivable[];
  receipts: ReceiptItem[];
  /** Closed months as YYYY-MM — locked after monthly close */
  closedMonths: string[];
  /** Optional: user overrides for planned monthly income */
  plannedIncomeByMonth?: Record<string, number>;
  /**
   * "Do today" checklist — forensic actions that take minutes, not a week.
   * Keys are action ids; true = done today / still done.
   */
  todayDone?: Record<string, boolean>;
  /** ISO date the checklist was last reset (new day = fresh urgents) */
  todayDoneOn?: string | null;
};

const KEY = "wonder-finance-books-v1";

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function empty(): BooksExtraState {
  return {
    version: 1,
    payables: [],
    receivables: [],
    receipts: [],
    closedMonths: [],
    plannedIncomeByMonth: {},
    todayDone: {},
    todayDoneOn: null,
  };
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function loadBooksExtra(): BooksExtraState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const p = JSON.parse(raw) as Partial<BooksExtraState>;
    const doneOn = p.todayDoneOn || null;
    // Keep checklist across the day; do not wipe mid-session
    return {
      version: 1,
      payables: Array.isArray(p.payables) ? p.payables : [],
      receivables: Array.isArray(p.receivables) ? p.receivables : [],
      receipts: Array.isArray(p.receipts) ? p.receipts : [],
      closedMonths: Array.isArray(p.closedMonths) ? p.closedMonths : [],
      plannedIncomeByMonth: p.plannedIncomeByMonth || {},
      todayDone: p.todayDone && typeof p.todayDone === "object" ? p.todayDone : {},
      todayDoneOn: doneOn || todayIso(),
    };
  } catch {
    return empty();
  }
}

export function toggleTodayDone(
  id: string,
  books = loadBooksExtra()
): BooksExtraState {
  const next = {
    ...books,
    todayDoneOn: todayIso(),
    todayDone: {
      ...(books.todayDone || {}),
      [id]: !books.todayDone?.[id],
    },
  };
  saveBooksExtra(next);
  return next;
}

export function saveBooksExtra(state: BooksExtraState) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...state, version: 1 }));
  } catch {
    /* quota — ignore */
  }
}

export function newPayable(
  partial: Partial<Payable> & { what: string; amount: number; dueDate: string }
): Payable {
  return {
    id: uid("ap"),
    what: partial.what,
    amount: Math.abs(partial.amount),
    dueDate: partial.dueDate,
    paid: !!partial.paid,
    paidDate: partial.paidDate ?? null,
    note: partial.note || "",
    createdAt: new Date().toISOString(),
  };
}

export function newReceivable(
  partial: Partial<Receivable> & { who: string; amount: number; dueDate: string }
): Receivable {
  return {
    id: uid("ar"),
    who: partial.who,
    amount: Math.abs(partial.amount),
    dueDate: partial.dueDate,
    received: !!partial.received,
    receivedDate: partial.receivedDate ?? null,
    note: partial.note || "",
    createdAt: new Date().toISOString(),
  };
}

export function newReceipt(
  partial: Partial<ReceiptItem> & { name: string; kind: ReceiptItem["kind"] }
): ReceiptItem {
  return {
    id: uid("rcpt"),
    name: partial.name,
    kind: partial.kind,
    txId: partial.txId ?? null,
    docDate: partial.docDate ?? null,
    amount: partial.amount ?? null,
    note: partial.note || "",
    dataUrl: partial.dataUrl ?? null,
    mime: partial.mime ?? null,
    createdAt: new Date().toISOString(),
  };
}

export function isMonthClosed(ym: string, books = loadBooksExtra()): boolean {
  return books.closedMonths.includes(ym);
}

export function closeMonth(ym: string, books = loadBooksExtra()): BooksExtraState {
  if (books.closedMonths.includes(ym)) return books;
  const next = {
    ...books,
    closedMonths: [...books.closedMonths, ym].sort(),
  };
  saveBooksExtra(next);
  return next;
}

export function reopenMonth(ym: string, books = loadBooksExtra()): BooksExtraState {
  const next = {
    ...books,
    closedMonths: books.closedMonths.filter((m) => m !== ym),
  };
  saveBooksExtra(next);
  return next;
}

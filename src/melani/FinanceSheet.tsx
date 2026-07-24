/**
 * FinanceSheet — spreadsheet ledger for Wonder Finances.
 * Interaction model from AstraSheet (grid, formula bar, search, inspector,
 * undo/redo, CSV). Rows map to FinanceTx; Balance is computed.
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import "./finance-sheet.css";
import { FINANCE_CATEGORIES } from "./financeCategorize";
import { exportLedgerCsv } from "./financeCsv";
import {
  moneyCents,
  newTx,
  runningBalanceMap,
  type FinanceTx,
  type TxKind,
} from "./financeStore";
import { pushUndo } from "../undoStack";
import type { TransferPair } from "./financeTransfers";

type ColId = "date" | "payee" | "category" | "flow" | "amount" | "balance" | "note";

const COLS: { id: ColId; label: string; editable: boolean; width: string }[] = [
  { id: "date", label: "Date", editable: true, width: "118px" },
  { id: "payee", label: "Payee", editable: true, width: "220px" },
  { id: "category", label: "Category", editable: true, width: "150px" },
  { id: "flow", label: "Flow", editable: true, width: "88px" },
  { id: "amount", label: "Amount", editable: true, width: "110px" },
  { id: "balance", label: "Balance", editable: false, width: "120px" },
  { id: "note", label: "Note", editable: true, width: "160px" },
];

function colLabel(index: number): string {
  let n = index + 1;
  let label = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

function cellRef(row: number, col: number): string {
  return `${colLabel(col)}${row + 1}`;
}

function parseAmountInput(raw: string): number {
  const cleaned = String(raw).replace(/[$,\s]/g, "").trim();
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

function formatAmount(n: number): string {
  if (!n) return "";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export type FinanceSheetProps = {
  txs: FinanceTx[];
  onPatchTx: (id: string, patch: Partial<FinanceTx>) => void;
  onAddRow: () => void;
  onRemoveTx: (id: string) => void;
  onReplaceTxs: (txs: FinanceTx[], label?: string) => void;
  transferPairs?: TransferPair[];
  onApplyTransfer?: (pair: TransferPair) => void;
  categories?: readonly string[];
  statusNote?: string;
};

export function FinanceSheet({
  txs,
  onPatchTx,
  onAddRow,
  onRemoveTx,
  onReplaceTxs,
  transferPairs = [],
  onApplyTransfer,
  categories = FINANCE_CATEGORIES,
  statusNote,
}: FinanceSheetProps) {
  const [selected, setSelected] = useState({ row: 0, col: 0 });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("Ready");
  const [history, setHistory] = useState<FinanceTx[][]>([]);
  const [future, setFuture] = useState<FinanceTx[][]>([]);
  const formulaRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

  const balances = useMemo(() => runningBalanceMap(txs), [txs]);

  const rows = useMemo(() => {
    return [...txs].sort((a, b) => {
      const d = b.date.localeCompare(a.date);
      if (d !== 0) return d;
      return b.id.localeCompare(a.id);
    });
  }, [txs]);

  useEffect(() => {
    if (selected.row >= rows.length && rows.length > 0) {
      setSelected((s) => ({ ...s, row: rows.length - 1 }));
    }
  }, [rows.length, selected.row]);

  useEffect(() => {
    if (!editing) return;
    const el = editRef.current;
    if (!el) return;
    el.focus();
    if ("select" in el && typeof el.select === "function") el.select();
  }, [editing, selected.row, selected.col]);

  function flash(message: string) {
    setStatus(message);
    window.setTimeout(() => setStatus("Ready"), 900);
  }

  function snapshot(label: string, next: FinanceTx[]) {
    const prev = txs.map((t) => ({ ...t }));
    setHistory((h) => [...h.slice(-24), prev]);
    setFuture([]);
    pushUndo(label, () => onReplaceTxs(prev, "Undo sheet"));
    onReplaceTxs(next, label);
  }

  function cellRaw(row: number, col: number): string {
    const tx = rows[row];
    if (!tx) return "";
    const id = COLS[col]?.id;
    switch (id) {
      case "date":
        return tx.date;
      case "payee":
        return tx.merchant || tx.note || "";
      case "category":
        return tx.category || "";
      case "flow":
        return tx.kind === "income" ? "In" : "Out";
      case "amount":
        return formatAmount(tx.amount);
      case "balance": {
        const bal = balances.get(tx.id);
        return bal == null ? "" : moneyCents(bal);
      }
      case "note":
        return tx.note || "";
      default:
        return "";
    }
  }

  function cellDisplay(row: number, col: number): string {
    const raw = cellRaw(row, col);
    if (raw.startsWith("=") && COLS[col]?.id === "amount") {
      return evaluateFormula(raw, rows);
    }
    return raw;
  }

  function evaluateFormula(raw: string, list: FinanceTx[]): string {
    const expr = raw.slice(1).trim();
    const sumMatch = /^SUM\(([^)]+)\)$/i.exec(expr);
    if (sumMatch) {
      const range = /^([A-Z]+\d+)\s*:\s*([A-Z]+\d+)$/i.exec(
        sumMatch[1].trim()
      );
      if (!range) return "#REF!";
      const start = parseCellRef(range[1]);
      const end = parseCellRef(range[2]);
      if (!start || !end) return "#REF!";
      const r1 = Math.min(start.row, end.row);
      const r2 = Math.max(start.row, end.row);
      const c1 = Math.min(start.col, end.col);
      const c2 = Math.max(start.col, end.col);
      let total = 0;
      for (let r = r1; r <= r2; r++) {
        for (let c = c1; c <= c2; c++) {
          if (COLS[c]?.id === "amount" && list[r]) {
            total += list[r].amount;
          }
        }
      }
      return formatAmount(total);
    }
    return "#ERROR!";
  }

  function parseCellRef(ref: string): { row: number; col: number } | null {
    const match = /^([A-Z]+)(\d+)$/i.exec(String(ref).trim());
    if (!match) return null;
    const letters = match[1].toUpperCase();
    const row = parseInt(match[2], 10) - 1;
    let col = 0;
    for (let i = 0; i < letters.length; i++) {
      col = col * 26 + (letters.charCodeAt(i) - 64);
    }
    return { row, col: col - 1 };
  }

  function commitDraft(value: string) {
    const tx = rows[selected.row];
    const col = COLS[selected.col];
    if (!tx || !col || !col.editable) {
      setEditing(false);
      return;
    }

    const patch: Partial<FinanceTx> = {};
    switch (col.id) {
      case "date": {
        const v = value.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(v)) patch.date = v;
        break;
      }
      case "payee":
        patch.merchant = value;
        patch.note = value;
        break;
      case "category":
        patch.category = value.trim() || "Uncategorized";
        break;
      case "flow": {
        const lower = value.trim().toLowerCase();
        const kind: TxKind =
          lower === "in" || lower === "income" ? "income" : "expense";
        patch.kind = kind;
        break;
      }
      case "amount":
        if (value.trim().startsWith("=")) {
          const resolved = evaluateFormula(value.trim(), rows);
          patch.amount = parseAmountInput(resolved);
        } else {
          patch.amount = parseAmountInput(value);
        }
        break;
      case "note":
        patch.note = value;
        break;
    }

    if (Object.keys(patch).length) {
      const prev = txs.map((t) => ({ ...t }));
      setHistory((h) => [...h.slice(-24), prev]);
      setFuture([]);
      pushUndo("Edit cell", () => onReplaceTxs(prev));
      onPatchTx(tx.id, patch);
      flash("Saved");
    }
    setEditing(false);
  }

  function beginEdit(row: number, col: number) {
    const meta = COLS[col];
    if (!meta?.editable || !rows[row]) return;
    setSelected({ row, col });
    setDraft(cellRaw(row, col));
    setEditing(true);
  }

  function moveSelection(dRow: number, dCol: number) {
    if (!rows.length) return;
    setEditing(false);
    setSelected((s) => ({
      row: Math.max(0, Math.min(rows.length - 1, s.row + dRow)),
      col: Math.max(0, Math.min(COLS.length - 1, s.col + dCol)),
    }));
  }

  function undoLocal() {
    if (!history.length) return;
    const prev = history[history.length - 1]!;
    setHistory((h) => h.slice(0, -1));
    setFuture((f) => [txs.map((t) => ({ ...t })), ...f].slice(0, 25));
    onReplaceTxs(prev);
    flash("Undone");
  }

  function redoLocal() {
    if (!future.length) return;
    const next = future[0]!;
    setFuture((f) => f.slice(1));
    setHistory((h) => [...h, txs.map((t) => ({ ...t }))].slice(-25));
    onReplaceTxs(next);
    flash("Redone");
  }

  function exportCsv() {
    const csv = exportLedgerCsv(txs);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wonder-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    flash("CSV exported");
  }

  function removeSelectedRow() {
    const tx = rows[selected.row];
    if (!tx) return;
    snapshot("Remove row", txs.filter((t) => t.id !== tx.id));
    flash("Row removed");
  }

  function addBlank() {
    onAddRow();
    setSelected({ row: 0, col: 1 });
    flash("Row added");
  }

  const searchHits = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const hits: { row: number; col: number; text: string }[] = [];
    rows.forEach((_tx, r) => {
      COLS.forEach((_col, c) => {
        const text = cellRaw(r, c);
        if (text.toLowerCase().includes(q)) {
          hits.push({ row: r, col: c, text: text || "(empty)" });
        }
      });
    });
    return hits.slice(0, 12);
    // cellRaw depends on rows/balances — intentional
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, rows, balances]);

  const stats = useMemo(() => {
    let moneyIn = 0;
    let moneyOut = 0;
    let filled = 0;
    for (const tx of rows) {
      if ((tx.merchant || tx.note || "").trim() || tx.amount > 0) filled++;
      if (tx.kind === "income") moneyIn += tx.amount;
      else moneyOut += tx.amount;
    }
    return {
      filled,
      lines: rows.length,
      moneyIn,
      moneyOut,
      net: moneyIn - moneyOut,
    };
  }, [rows]);

  const selectedTx = rows[selected.row];
  const selectedCol = COLS[selected.col];
  const selectedRaw = selectedTx ? cellRaw(selected.row, selected.col) : "";
  const selectedValue = selectedTx
    ? cellDisplay(selected.row, selected.col)
    : "";

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const inField =
        tag === "input" || tag === "textarea" || tag === "select";

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undoLocal();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redoLocal();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        flash("Autosaved");
        return;
      }

      if (inField && target !== formulaRef.current) return;
      if (!rows.length) return;

      if (e.key === "ArrowRight") {
        e.preventDefault();
        moveSelection(0, 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        moveSelection(0, -1);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        moveSelection(1, 0);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        moveSelection(-1, 0);
      } else if (e.key === "Enter" && !editing) {
        e.preventDefault();
        beginEdit(selected.row, selected.col);
      } else if (
        !editing &&
        !e.metaKey &&
        !e.ctrlKey &&
        e.key.length === 1 &&
        selectedCol?.editable
      ) {
        beginEdit(selected.row, selected.col);
        setDraft(e.key);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length, selected, editing, history, future, txs, selectedCol]);

  return (
    <div className="fs" aria-label="Finance spreadsheet ledger">
      {transferPairs.length ? (
        <section className="fs-transfer">
          <h2>Likely transfers · {transferPairs.length}</h2>
          <p>
            Matched money-out and money-in. Marking keeps income and spending
            honest — nothing changes without your click.
          </p>
          <ul>
            {transferPairs.slice(0, 4).map((pr) => (
              <li key={`${pr.outTx.id}-${pr.inTx.id}`}>
                <span>
                  {pr.outTx.date} · {pr.outTx.merchant || pr.outTx.note} →{" "}
                  {pr.inTx.merchant || pr.inTx.note} ·{" "}
                  <strong>{moneyCents(pr.outTx.amount)}</strong>
                </span>
                {onApplyTransfer ? (
                  <button
                    type="button"
                    className="fs-btn"
                    onClick={() => onApplyTransfer(pr)}
                  >
                    Mark as transfer
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <header className="fs-header">
        <div className="fs-brand">
          <div className="fs-logo" aria-hidden>
            ⌘
          </div>
          <div>
            <h2 className="fs-title">Ledger sheet</h2>
            <p className="fs-subtitle">
              Local spreadsheet books — formulas, autosave, search, CSV. Every
              dollar named on a cell.
            </p>
          </div>
        </div>
        <div className="fs-btns">
          <button type="button" className="fs-btn" onClick={undoLocal}>
            ↶ Undo
          </button>
          <button type="button" className="fs-btn" onClick={redoLocal}>
            ↷ Redo
          </button>
          <button type="button" className="fs-btn" onClick={exportCsv}>
            ⇩ Export CSV
          </button>
          <button type="button" className="fs-btn fs-btn-primary" onClick={addBlank}>
            ＋ Row
          </button>
        </div>
      </header>

      <section className="fs-toolbar">
        <div className="fs-group">
          <span className="fs-chip">Formula bar</span>
          <span className="fs-chip">
            {rows.length ? cellRef(selected.row, selected.col) : "—"}
          </span>
        </div>
        <div className="fs-formula-box">
          <span className="muted">ƒx</span>
          <input
            ref={formulaRef}
            className="fs-formula"
            value={
              editing
                ? draft
                : selectedTx
                  ? cellRaw(selected.row, selected.col)
                  : ""
            }
            placeholder="Edit cell — amounts accept =SUM(E1:E5)"
            disabled={!selectedCol?.editable || !selectedTx}
            onChange={(e) => {
              setDraft(e.target.value);
              setEditing(true);
            }}
            onFocus={() => {
              if (selectedTx && selectedCol?.editable) {
                setDraft(cellRaw(selected.row, selected.col));
                setEditing(true);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitDraft(draft);
              } else if (e.key === "Escape") {
                setEditing(false);
              }
            }}
            onBlur={() => {
              if (editing) commitDraft(draft);
            }}
          />
        </div>
        <div className="fs-group" style={{ justifyContent: "flex-end" }}>
          <input
            className="fs-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search cells"
          />
        </div>
      </section>

      <div className="fs-main">
        <section className="fs-sheet-wrap">
          <div className="fs-sheet-top">
            <div className="fs-group">
              <span className="fs-chip">Editable grid</span>
              <span className="fs-chip">Autosaves locally</span>
              <span className="fs-chip">=SUM ranges</span>
              <span className="fs-chip">CSV export</span>
            </div>
            <div className="fs-group">
              <span className={`fs-chip${status !== "Ready" ? " is-live" : ""}`}>
                {statusNote || status}
              </span>
            </div>
          </div>

          <div className="fs-table-wrap">
            <table className="fs-table">
              <thead>
                <tr>
                  <th style={{ width: 48 }}>#</th>
                  {COLS.map((c) => (
                    <th key={c.id} style={{ width: c.width }}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={COLS.length + 1}>
                      <div className="fs-cell is-empty">
                        Empty books — add a row, load Demo, or import CSV.
                      </div>
                    </td>
                  </tr>
                ) : (
                  rows.map((tx, r) => (
                    <tr key={tx.id}>
                      <th>{r + 1}</th>
                      {COLS.map((col, c) => {
                        const isSelected =
                          r === selected.row && c === selected.col;
                        const raw = cellRaw(r, c);
                        const display = cellDisplay(r, c);
                        const isMatch =
                          !!search.trim() &&
                          raw.toLowerCase().includes(search.trim().toLowerCase());
                        const showEditor = isSelected && editing && col.editable;
                        const amountClass =
                          col.id === "amount" || col.id === "balance"
                            ? tx.kind === "income"
                              ? "is-pos"
                              : "is-neg"
                            : "";
                        return (
                          <td
                            key={col.id}
                            className={`${isSelected ? "is-selected" : ""} ${
                              isMatch ? "is-match" : ""
                            } ${!col.editable ? "is-readonly" : ""}`}
                            onClick={() => {
                              setSelected({ row: r, col: c });
                              setEditing(false);
                            }}
                            onDoubleClick={() => beginEdit(r, c)}
                          >
                            {showEditor ? (
                              <div className="fs-cell-edit">
                                {col.id === "flow" ? (
                                  <select
                                    ref={
                                      editRef as RefObject<HTMLSelectElement>
                                    }
                                    value={draft === "In" ? "In" : "Out"}
                                    onChange={(e) => {
                                      setDraft(e.target.value);
                                      commitDraft(e.target.value);
                                    }}
                                  >
                                    <option value="Out">Out</option>
                                    <option value="In">In</option>
                                  </select>
                                ) : col.id === "category" ? (
                                  <select
                                    ref={
                                      editRef as RefObject<HTMLSelectElement>
                                    }
                                    value={draft}
                                    onChange={(e) => {
                                      setDraft(e.target.value);
                                      commitDraft(e.target.value);
                                    }}
                                  >
                                    {categories.map((cat) => (
                                      <option key={cat} value={cat}>
                                        {cat}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    ref={
                                      editRef as RefObject<HTMLInputElement>
                                    }
                                    type={col.id === "date" ? "date" : "text"}
                                    value={draft}
                                    onChange={(e) => setDraft(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        commitDraft(draft);
                                        moveSelection(1, 0);
                                      } else if (e.key === "Escape") {
                                        setEditing(false);
                                      } else if (e.key === "Tab") {
                                        e.preventDefault();
                                        commitDraft(draft);
                                        moveSelection(0, e.shiftKey ? -1 : 1);
                                      }
                                    }}
                                    onBlur={() => commitDraft(draft)}
                                  />
                                )}
                              </div>
                            ) : (
                              <div
                                className={`fs-cell ${
                                  display ? amountClass : "is-empty"
                                }`}
                              >
                                {display ||
                                  (col.id === "payee"
                                    ? "Payee…"
                                    : col.id === "amount"
                                      ? "0.00"
                                      : "—")}
                              </div>
                            )}
                            {isSelected ? <div className="fs-ring" /> : null}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="fs-side">
          <div className="fs-card">
            <h3>Inspector</h3>
            <div className="fs-selected-label">Selected cell</div>
            <div className="fs-selected-name">
              {rows.length ? cellRef(selected.row, selected.col) : "—"}
            </div>
            <div className="fs-selected-meta">
              Raw:{" "}
              <code>{selectedRaw || "(empty)"}</code>
            </div>
            <div className="fs-selected-meta">
              Value: <code>{selectedValue || "(empty)"}</code>
            </div>
            <div className="fs-stat-grid">
              <div className="fs-stat">
                <div className="k">Lines</div>
                <div className="v">{stats.lines}</div>
              </div>
              <div className="fs-stat">
                <div className="k">Filled</div>
                <div className="v">{stats.filled}</div>
              </div>
              <div className="fs-stat">
                <div className="k">Money in</div>
                <div className="v is-accent">{moneyCents(stats.moneyIn)}</div>
              </div>
              <div className="fs-stat">
                <div className="k">Money out</div>
                <div className="v">{moneyCents(stats.moneyOut)}</div>
              </div>
              <div className="fs-stat wide">
                <div className="k">Net</div>
                <div
                  className={`v ${stats.net >= 0 ? "is-accent" : ""}`}
                  style={stats.net < 0 ? { color: "var(--fs-neg)" } : undefined}
                >
                  {moneyCents(stats.net)}
                </div>
              </div>
            </div>
          </div>

          <div className="fs-card">
            <h4>Search results</h4>
            {searchHits.length ? (
              searchHits.map((hit) => (
                <button
                  key={`${hit.row}:${hit.col}:${hit.text}`}
                  type="button"
                  className="fs-hit"
                  onClick={() => {
                    setSelected({ row: hit.row, col: hit.col });
                    setEditing(false);
                  }}
                >
                  <span className="fs-hit-ref">
                    {cellRef(hit.row, hit.col)}
                  </span>
                  <span className="fs-hit-val">{hit.text}</span>
                </button>
              ))
            ) : (
              <div className="fs-empty-hits">
                {search.trim() ? "No matches." : "No matches yet."}
              </div>
            )}
          </div>

          <div className="fs-card">
            <h4>Sheet actions</h4>
            <div className="fs-actions">
              <button type="button" className="fs-btn fs-btn-primary" onClick={addBlank}>
                ＋ Add row
              </button>
              <button
                type="button"
                className="fs-btn"
                onClick={() => {
                  const blank = newTx({
                    kind: "income",
                    amount: 0,
                    category: "Income",
                    merchant: "",
                    note: "",
                  });
                  snapshot("Add income row", [blank, ...txs]);
                }}
              >
                ＋ Income row
              </button>
              <button
                type="button"
                className="fs-btn"
                onClick={removeSelectedRow}
                disabled={!selectedTx}
              >
                － Remove row
              </button>
              <button
                type="button"
                className="fs-btn"
                onClick={() => onRemoveTx(selectedTx?.id || "")}
                disabled={!selectedTx}
              >
                － Delete tx
              </button>
            </div>
          </div>
        </aside>
      </div>

      <footer className="fs-footer">
        <div className="fs-tags">
          <span className="fs-tag">Arrow keys move selection</span>
          <span className="fs-tag">Enter commits edit</span>
          <span className="fs-tag">=SUM(E1:E5) on Amount</span>
          <span className="fs-tag">⌘Z undo · local autosave</span>
        </div>
        <div>Wonder ledger · stays in this browser</div>
      </footer>
    </div>
  );
}

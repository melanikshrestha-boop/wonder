/**
 * Built-in SQL editor — query your real ledger like a database.
 * Table: transactions. Runs locally on your rows, no server.
 */
import { useMemo, useState } from "react";
import { runSql, SQL_COLUMNS, SQL_SAMPLES } from "./financeSql";
import type { FinanceTx } from "./financeStore";
import "./finance-sql.css";

const DEFAULT_QUERY =
  "SELECT category, SUM(amount)\nFROM transactions\nWHERE kind = 'expense' AND transfer = 0\nGROUP BY category\nORDER BY SUM(amount) DESC";

export function FinanceSqlEditor({ txs }: { txs: FinanceTx[] }) {
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [ran, setRan] = useState<string>(DEFAULT_QUERY);

  const result = useMemo(() => runSql(ran, txs), [ran, txs]);

  function run() {
    setRan(query);
  }

  return (
    <div className="fsql">
      <div className="fsql-bar">
        <span className="fsql-table">
          transactions<span className="fsql-rows">{txs.length} rows</span>
        </span>
        <div className="fsql-cols">
          {SQL_COLUMNS.map((c) => (
            <button
              key={c}
              type="button"
              className="fsql-col"
              title="Insert column"
              onClick={() => setQuery((q) => `${q}${/\s$|^$/.test(q) ? "" : " "}${c}`)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="fsql-editor">
        <textarea
          value={query}
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              run();
            }
          }}
          rows={5}
        />
        <div className="fsql-actions">
          <button type="button" className="fsql-run" onClick={run}>
            Run ▸ <span className="fsql-kbd">⌘↵</span>
          </button>
        </div>
      </div>

      <div className="fsql-samples">
        {SQL_SAMPLES.map((s) => (
          <button
            key={s.label}
            type="button"
            className="fsql-sample"
            onClick={() => {
              setQuery(s.sql);
              setRan(s.sql);
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {result.error ? (
        <div className="fsql-error">⚠ {result.error}</div>
      ) : (
        <>
          <div className="fsql-meta">{result.rowCount} rows</div>
          <div className="fsql-result">
            <table>
              <thead>
                <tr>
                  {result.columns.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.slice(0, 500).map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td
                        key={j}
                        className={typeof cell === "number" ? "fsql-num" : ""}
                      >
                        {typeof cell === "number"
                          ? cell.toLocaleString(undefined, { maximumFractionDigits: 2 })
                          : String(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {result.rowCount === 0 ? (
              <p className="fsql-empty">No rows.</p>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

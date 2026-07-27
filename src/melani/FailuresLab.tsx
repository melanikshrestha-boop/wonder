/**
 * Failures desk — log misses, own your success metrics.
 * Editorial / Sleep-page language under Learn.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FAILURE_DOMAINS,
  addFailure,
  computeSuccessMetrics,
  deleteFailure,
  loadFailures,
  markRecovered,
  reopenFailure,
  type FailureDomain,
  type FailureEntry,
} from "./failuresStore";
import "./failures-lab.css";

export function isFailuresPage(pageId: string): boolean {
  return (
    pageId === "pg-failures" ||
    pageId === "pg-failure" ||
    pageId === "pg-learn-failures"
  );
}

export function FailuresLab() {
  const [list, setList] = useState<FailureEntry[]>(() => loadFailures());
  const [title, setTitle] = useState("");
  const [lesson, setLesson] = useState("");
  const [domain, setDomain] = useState<FailureDomain>("engineering");
  const [severity, setSeverity] = useState(3);
  const [filter, setFilter] = useState<"all" | "open" | "recovered">("all");

  const refresh = useCallback(() => setList(loadFailures()), []);

  useEffect(() => {
    const on = () => refresh();
    window.addEventListener("wonder-failures-changed", on);
    return () => window.removeEventListener("wonder-failures-changed", on);
  }, [refresh]);

  const metrics = useMemo(() => computeSuccessMetrics(list), [list]);

  const shown = useMemo(() => {
    if (filter === "open") return list.filter((e) => !e.recovered);
    if (filter === "recovered") return list.filter((e) => e.recovered);
    return list;
  }, [list, filter]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    addFailure({ title, lesson, domain, severity });
    setTitle("");
    setLesson("");
    setSeverity(3);
    refresh();
  }

  return (
    <div className="flab">
      <header className="flab-head">
        <p className="flab-kicker">Learn · Failures</p>
        <h1 className="flab-title">Failures</h1>
        <p className="flab-sub">
          Log the miss. Mark the recovery. Your success metrics come from the
          loop — not from pretending you never fail.
        </p>
      </header>

      {/* Success metrics strip — derived from failure log */}
      <div className="flab-strip" aria-label="Success metrics">
        <div className="flab-strip-item">
          <span className="flab-strip-lab">Success score</span>
          <b className="flab-strip-val">
            {metrics.successScore}
            <small>/100</small>
          </b>
        </div>
        <div className="flab-strip-item">
          <span className="flab-strip-lab">Recovery rate</span>
          <b className="flab-strip-val flab-strip-val-sm">
            {Math.round(metrics.recoveryRate * 100)}
            <small>%</small>
          </b>
        </div>
        <div className="flab-strip-item">
          <span className="flab-strip-lab">Open</span>
          <b className="flab-strip-val flab-strip-val-sm">{metrics.open}</b>
        </div>
        <div className="flab-strip-item">
          <span className="flab-strip-lab">Recovered</span>
          <b className="flab-strip-val flab-strip-val-sm is-up">
            {metrics.recovered}
          </b>
        </div>
        <div className="flab-strip-item">
          <span className="flab-strip-lab">Last 7d</span>
          <b className="flab-strip-val flab-strip-val-sm">{metrics.last7}</b>
        </div>
        <div className="flab-strip-item">
          <span className="flab-strip-lab">Logged</span>
          <b className="flab-strip-val flab-strip-val-sm">{metrics.total}</b>
        </div>
      </div>

      <p className="flab-score-note">
        Score weights: recovery rate · open severity · recent volume · closed
        loops. Empty log = 50 (no fake perfection).
      </p>

      {/* Log form */}
      <section className="flab-section">
        <h2 className="flab-section-title">Log a failure</h2>
        <form className="flab-form" onSubmit={submit}>
          <label className="flab-field flab-field-grow">
            What failed
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Shipped broken contrast · missed retrain rule · …"
              required
            />
          </label>
          <label className="flab-field flab-field-grow">
            Lesson / next move
            <input
              value={lesson}
              onChange={(e) => setLesson(e.target.value)}
              placeholder="Only train on instead say: …"
            />
          </label>
          <label className="flab-field">
            Domain
            <select
              value={domain}
              onChange={(e) => setDomain(e.target.value as FailureDomain)}
            >
              {FAILURE_DOMAINS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flab-field">
            Severity
            <select
              value={severity}
              onChange={(e) => setSeverity(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="flab-btn">
            Log
          </button>
        </form>
      </section>

      {/* Domain breakdown */}
      {metrics.total > 0 ? (
        <section className="flab-section">
          <h2 className="flab-section-title">By domain</h2>
          <div className="flab-domains">
            {FAILURE_DOMAINS.filter((d) => metrics.byDomain[d.id] > 0).map(
              (d) => (
                <div key={d.id} className="flab-domain">
                  <span className="flab-domain-lab">{d.label}</span>
                  <b className="flab-domain-n">{metrics.byDomain[d.id]}</b>
                </div>
              )
            )}
          </div>
        </section>
      ) : null}

      {/* List */}
      <section className="flab-section">
        <div className="flab-list-head">
          <h2 className="flab-section-title">Log</h2>
          <div className="flab-filters">
            {(["all", "open", "recovered"] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={`flab-filter${filter === f ? " on" : ""}`}
                onClick={() => setFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {shown.length === 0 ? (
          <p className="flab-empty">
            No entries yet. Log a real miss — that is how the success score
            becomes yours.
          </p>
        ) : (
          <ul className="flab-list">
            {shown.map((e) => (
              <li
                key={e.id}
                className={`flab-item${e.recovered ? " is-recovered" : ""}`}
              >
                <div className="flab-item-top">
                  <span className="flab-item-domain">{e.domain}</span>
                  <span className="flab-item-sev">s{e.severity}</span>
                  <span className="flab-item-day">{e.day}</span>
                  {e.recovered ? (
                    <span className="flab-badge is-ok">recovered</span>
                  ) : (
                    <span className="flab-badge is-open">open</span>
                  )}
                </div>
                <p className="flab-item-title">{e.title}</p>
                {e.lesson ? (
                  <p className="flab-item-lesson">{e.lesson}</p>
                ) : null}
                <div className="flab-item-actions">
                  {e.recovered ? (
                    <button
                      type="button"
                      className="flab-link"
                      onClick={() => {
                        reopenFailure(e.id);
                        refresh();
                      }}
                    >
                      Reopen
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="flab-link is-up"
                      onClick={() => {
                        markRecovered(e.id);
                        refresh();
                      }}
                    >
                      Mark recovered
                    </button>
                  )}
                  <button
                    type="button"
                    className="flab-link is-muted"
                    onClick={() => {
                      if (window.confirm("Delete this failure log?")) {
                        deleteFailure(e.id);
                        refresh();
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="flab-foot">
        Mel: <code>log failure …</code> · <code>failures</code> ·{" "}
        <code>open Failures</code>
      </p>
    </div>
  );
}

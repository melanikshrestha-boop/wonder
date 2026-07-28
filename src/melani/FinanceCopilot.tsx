/**
 * Quant desk — elite, flat, dense.
 * No boxes. No dividers. Type + space only.
 * Empty state: hero + prompts as one block (no dead middle void).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  copilotSuggestions,
  type CopilotContext,
  type CopilotChart,
  type CopilotTurn,
} from "./financeCopilotEngine";
import { askFinanceMel, checkFinanceMelOnline } from "./financeMel";
import { money } from "./financeStore";
import { LabeledLineChart, LabeledPieChart } from "./FinCharts";
import { buildIntelligenceDigest } from "./intelligenceL3";
import "./finance-copilot.css";

type Msg = {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: string[];
  data?: { label: string; value: string }[];
  chart?: CopilotChart;
  formula?: string;
  formulaNote?: string;
  mode?: "mel-grok" | "local-ledger";
  model?: string;
};

type Desk = "ask" | "quant" | "week";

const QUANT_PROMPTS = [
  "Amortize 20000 at 6.5% for 60 months",
  "NPV at 10% of -5000, 2000, 2000, 2500",
  "Years to FI from my ledger",
  "Std dev of my monthly spend",
  "Sensitivity: 500/mo for 15 years",
  "FV of 10000 at 7% for 10 years",
];

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export function FinanceCopilot({
  open,
  onClose,
  ctx,
}: {
  open: boolean;
  onClose: () => void;
  ctx: CopilotContext;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [melOnline, setMelOnline] = useState(false);
  const [desk, setDesk] = useState<Desk>("ask");
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const historyRef = useRef<CopilotTurn[]>([]);

  const suggestions = useMemo(() => {
    if (desk === "quant") return QUANT_PROMPTS;
    return copilotSuggestions(ctx)
      .filter(
        (s) =>
          !/\b(amortize|npv|irr|monte|black|sensitivity|std dev|cagr)\b/i.test(s)
      )
      .slice(0, 5);
  }, [ctx, desk]);

  const statusLine = useMemo(() => {
    const months = new Set(ctx.state.txs.map((t) => t.date.slice(0, 7))).size;
    const bits = [
      `${ctx.state.txs.length} rows`,
      `${months || 0} mo`,
      `net ${money(ctx.worth)}`,
      `flow ${money(ctx.cashFlow)}`,
    ];
    if (ctx.subs.count) bits.push(`${ctx.subs.count} subs`);
    return bits.join(" · ");
  }, [ctx]);

  const weekPreview = useMemo(() => {
    if (!open || desk !== "week") return null;
    try {
      return buildIntelligenceDigest();
    } catch {
      return null;
    }
  }, [open, desk, msgs.length]);

  useEffect(() => {
    if (!open) return;
    // slight delay so portal paints then focus
    const id = window.setTimeout(() => inputRef.current?.focus(), 40);
    let alive = true;
    void checkFinanceMelOnline().then((ok) => {
      if (alive) setMelOnline(ok);
    });
    const t = window.setInterval(() => {
      void checkFinanceMelOnline().then((ok) => {
        if (alive) setMelOnline(ok);
      });
    }, 30_000);
    return () => {
      alive = false;
      window.clearTimeout(id);
      window.clearInterval(t);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    threadRef.current?.scrollTo({
      top: threadRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [msgs, thinking, desk]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || thinking) return;
    if (desk === "week") setDesk("ask");
    setMsgs((m) => [...m, { id: uid(), role: "user", text: q }]);
    setDraft("");
    setThinking(true);
    try {
      const result = await askFinanceMel(q, ctx, historyRef.current);
      historyRef.current = [
        ...historyRef.current,
        { question: q, answer: result.answer },
      ].slice(-8);
      setMsgs((m) => [
        ...m,
        {
          id: uid(),
          role: "assistant",
          text: result.answer.text,
          sources: result.answer.sources,
          data: result.answer.data,
          chart: result.answer.chart,
          formula: result.answer.formula,
          formulaNote: result.answer.formulaNote,
          mode: result.mode,
          model: result.model,
        },
      ]);
      if (result.mode === "mel-grok") setMelOnline(true);
    } catch {
      setMsgs((m) => [
        ...m,
        {
          id: uid(),
          role: "assistant",
          text: "Engine glitch. Try amortize or NPV offline.",
          mode: "local-ledger",
        },
      ]);
    } finally {
      setThinking(false);
    }
  }

  if (!open) return null;

  const empty = msgs.length === 0 && !thinking;
  const engine = melOnline ? "Grok" : "Local";

  const panel = (
    <>
      <button
        type="button"
        className="fc-backdrop"
        aria-label="Close quant desk"
        onClick={onClose}
      />
      <aside className="fc" role="dialog" aria-modal="true" aria-label="Quant desk">
        {/* Row 1: title · engine close */}
        <header className="fc-top">
          <h2 className="fc-title">Quant desk</h2>
          <div className="fc-top-right">
            <span className={`fc-engine${melOnline ? " is-on" : ""}`}>{engine}</span>
            {msgs.length > 0 ? (
              <button
                type="button"
                className="fc-textbtn"
                onClick={() => {
                  setMsgs([]);
                  historyRef.current = [];
                }}
              >
                Clear
              </button>
            ) : null}
            <button type="button" className="fc-textbtn" onClick={onClose}>
              Close
            </button>
          </div>
        </header>

        {/* Row 2: live facts */}
        <p className="fc-facts">{statusLine}</p>

        {/* Row 3: modes */}
        <nav className="fc-modes" aria-label="Mode">
          {(
            [
              ["ask", "Ask"],
              ["quant", "Quant"],
              ["week", "Week"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`fc-mode${desk === id ? " is-on" : ""}`}
              onClick={() => setDesk(id)}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* Scroll region: content grows from top — no void */}
        <div className="fc-scroll" ref={threadRef}>
          {desk === "week" ? (
            weekPreview ? (
              <div className="fc-week">
                <p className="fc-eyebrow">
                  {weekPreview.weekStart} → {weekPreview.weekEnd}
                </p>
                <pre className="fc-week-body">{weekPreview.fullText}</pre>
                <p className="fc-priority">
                  <span className="fc-eyebrow">Priority</span>
                  {weekPreview.priority}
                </p>
                <button
                  type="button"
                  className="fc-inline-action"
                  onClick={() => {
                    setDesk("ask");
                    void send(
                      `My Level 3 priority: ${weekPreview.priority}. What should I do first using my ledger?`
                    );
                  }}
                >
                  Ask about this week
                </button>
              </div>
            ) : (
              <p className="fc-muted">Digest unavailable.</p>
            )
          ) : (
            <>
              {empty ? (
                <div className="fc-empty-block" aria-hidden />
              ) : (
                <div className="fc-thread">
                  {msgs.map((m) => (
                    <article
                      key={m.id}
                      className={`fc-msg fc-msg-${m.role}`}
                    >
                      <p className="fc-msg-who">
                        {m.role === "user"
                          ? "You"
                          : m.mode === "mel-grok"
                            ? m.model || "Grok"
                            : "Local"}
                      </p>
                      <p className="fc-msg-text">{m.text}</p>
                      {m.formula ? (
                        <figure className="fc-formula">
                          <div
                            className="fc-formula-math"
                            dangerouslySetInnerHTML={{ __html: m.formula }}
                          />
                          {m.formulaNote ? (
                            <figcaption className="fc-formula-note">
                              {m.formulaNote}
                            </figcaption>
                          ) : null}
                        </figure>
                      ) : null}
                      {m.chart ? (
                        <div className="fc-chart">
                          {m.chart.kind === "pie" ? (
                            <LabeledPieChart
                              title={m.chart.title}
                              slices={m.chart.slices}
                              size={200}
                            />
                          ) : (
                            <LabeledLineChart
                              title={m.chart.title}
                              xLabel={m.chart.xLabel}
                              yLabel={m.chart.yLabel}
                              points={m.chart.points}
                              height={200}
                            />
                          )}
                        </div>
                      ) : null}
                      {m.data && m.data.length ? (
                        <table className="fc-table">
                          <tbody>
                            {m.data.map((d, i) => (
                              <tr key={i}>
                                <td>{d.label}</td>
                                <td className="num">{d.value}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : null}
                      {m.role === "assistant" && m.sources?.length ? (
                        <details className="fc-sources">
                          <summary>
                            Evidence · {m.sources.length} source
                            {m.sources.length === 1 ? "" : "s"}
                          </summary>
                          <ul>
                            {m.sources.map((source, index) => (
                              <li key={`${source}-${index}`}>{source}</li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </article>
                  ))}
                  {thinking ? (
                    <p className="fc-working">
                      {melOnline ? "Math, then Grok…" : "Running math…"}
                    </p>
                  ) : null}
                </div>
              )}
            </>
          )}
        </div>

        {/* Prompts sit on the type box — not under the headline */}
        {desk !== "week" && empty ? (
          <div className="fc-prompts">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                className="fc-prompt"
                onClick={() => void send(s)}
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}

        {/* Composer always bottom */}
        {desk !== "week" ? (
          <form
            className="fc-bar"
            onSubmit={(e) => {
              e.preventDefault();
              void send(draft);
            }}
          >
            <textarea
              ref={inputRef}
              value={draft}
              rows={1}
              placeholder={
                desk === "quant"
                  ? "amortize 20000 at 6.5% for 60 months"
                  : "Ask about spend, merchants, months…"
              }
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(draft);
                }
              }}
            />
            <button
              type="submit"
              className="fc-go"
              disabled={!draft.trim() || thinking}
            >
              Run
            </button>
          </form>
        ) : null}
      </aside>
    </>
  );

  return createPortal(panel, document.body);
}

/**
 * Finance Copilot — a Cursor-style AI panel docked to the money desk.
 * Multi-turn chat, a live context strip showing what it reads from your
 * ledger, grounded answers that cite their sources, and a small data
 * table when the answer has a breakdown.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  answerCopilot,
  copilotSuggestions,
  type CopilotContext,
  type CopilotChart,
  type CopilotTurn,
} from "./financeCopilot";
import { money } from "./financeStore";
import { LabeledLineChart, LabeledPieChart } from "./FinCharts";
import "./finance-copilot.css";

type Msg = {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: string[];
  data?: { label: string; value: string }[];
  chart?: CopilotChart;
  /** MathML produced by mathml.renderFormula — never user input. */
  formula?: string;
  formulaNote?: string;
};

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
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const suggestions = useMemo(() => copilotSuggestions(ctx), [ctx]);

  const contextChips = useMemo(() => {
    const txs = ctx.state.txs;
    const months = new Set(txs.map((t) => t.date.slice(0, 7)));
    const cats = new Set(txs.map((t) => t.category).filter(Boolean));
    const chips: string[] = [];
    chips.push(`${txs.length} rows`);
    if (months.size) chips.push(`${months.size} month${months.size === 1 ? "" : "s"}`);
    if (cats.size) chips.push(`${cats.size} categories`);
    if (ctx.subs.count) chips.push(`${ctx.subs.count} subscriptions`);
    chips.push(`net ${money(ctx.worth)}`);
    return chips;
  }, [ctx]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, thinking]);

  const lastTurn = useRef<CopilotTurn | undefined>(undefined);

  function send(text: string) {
    const q = text.trim();
    if (!q || thinking) return;
    const userMsg: Msg = { id: uid(), role: "user", text: q };
    setMsgs((m) => [...m, userMsg]);
    setDraft("");
    setThinking(true);
    // Small delay so the "reading your ledger" state is visible (feels alive).
    window.setTimeout(() => {
      const ans = answerCopilot(q, ctx, lastTurn.current);
      lastTurn.current = { question: q, answer: ans };
      setMsgs((m) => [
        ...m,
        {
          id: uid(),
          role: "assistant",
          text: ans.text,
          sources: ans.sources,
          data: ans.data,
          chart: ans.chart,
          formula: ans.formula,
          formulaNote: ans.formulaNote,
        },
      ]);
      setThinking(false);
    }, 240);
  }

  if (!open) return null;

  return (
    <aside className="fc" aria-label="Finance copilot">
      <header className="fc-head">
        <div className="fc-title">
          <span className="fc-spark" aria-hidden>✦</span>
          <div>
            <h2>Copilot</h2>
            <p>Understands your ledger</p>
          </div>
        </div>
        <button type="button" className="fc-x" onClick={onClose} aria-label="Close copilot">
          ×
        </button>
      </header>

      {/* Context strip — what the copilot can see, Cursor-style */}
      <div className="fc-context" title="Context the copilot reads from your ledger">
        <span className="fc-context-label">Context</span>
        {contextChips.map((c) => (
          <span key={c} className="fc-context-chip">
            {c}
          </span>
        ))}
      </div>

      <div className="fc-thread" ref={threadRef}>
        {msgs.length === 0 ? (
          <div className="fc-welcome">
            <p className="fc-welcome-h">Ask about your money.</p>
            <p className="fc-welcome-p">
              I read your actual transactions — every answer is grounded in your rows, not a guess.
            </p>
          </div>
        ) : null}

        {msgs.map((m) => (
          <div key={m.id} className={`fc-msg fc-msg-${m.role}`}>
            {m.role === "assistant" ? <span className="fc-avatar" aria-hidden>✦</span> : null}
            <div className="fc-bubble">
              <p className="fc-text">{m.text}</p>
              {m.formula ? (
                <figure className="fc-formula">
                  {/* MathML built by renderFormula from formula strings authored
                      in this repo. No user input reaches this markup. */}
                  <div
                    className="fc-formula-math"
                    dangerouslySetInnerHTML={{ __html: m.formula }}
                  />
                  {m.formulaNote ? (
                    <figcaption className="fc-formula-note">{m.formulaNote}</figcaption>
                  ) : null}
                </figure>
              ) : null}
              {m.chart ? (
                <div className="fc-chart">
                  {m.chart.kind === "pie" ? (
                    <LabeledPieChart title={m.chart.title} slices={m.chart.slices} size={190} />
                  ) : (
                    <LabeledLineChart
                      title={m.chart.title}
                      xLabel={m.chart.xLabel}
                      yLabel={m.chart.yLabel}
                      points={m.chart.points}
                      height={190}
                    />
                  )}
                </div>
              ) : null}
              {m.data && m.data.length ? (
                <table className="fc-data">
                  <tbody>
                    {m.data.map((d, i) => (
                      <tr key={i}>
                        <td>{d.label}</td>
                        <td className="fc-data-val">{d.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              {m.sources && m.sources.length ? (
                <div className="fc-sources">
                  {m.sources.map((s) => (
                    <span key={s} className="fc-source">
                      {s}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ))}

        {thinking ? (
          <div className="fc-msg fc-msg-assistant">
            <span className="fc-avatar" aria-hidden>✦</span>
            <div className="fc-bubble">
              <p className="fc-reading">
                Reading your ledger<span className="fc-dots"><i>.</i><i>.</i><i>.</i></span>
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {msgs.length === 0 ? (
        <div className="fc-suggest">
          {suggestions.map((s) => (
            <button key={s} type="button" className="fc-suggest-btn" onClick={() => send(s)}>
              {s}
            </button>
          ))}
        </div>
      ) : null}

      <form
        className="fc-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <textarea
          ref={inputRef}
          value={draft}
          rows={1}
          placeholder="Ask about your spending, subscriptions, credit…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(draft);
            }
          }}
        />
        <button type="submit" className="fc-send" disabled={!draft.trim() || thinking} aria-label="Send">
          ↑
        </button>
      </form>
    </aside>
  );
}

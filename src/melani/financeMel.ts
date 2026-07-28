/**
 * Finance Copilot → Mel (Grok) bridge.
 * Sends a grounded ledger snapshot + chat to Mel's smartest cloud model.
 * Falls back to local answerCopilot when Mel is offline / no key.
 */
import { bookshelfStats } from "./bookKnowledge";
import { buildEvidencePack } from "./evidencePack";
import {
  answerCopilot,
  type CopilotAnswer,
  type CopilotContext,
  type CopilotTurn,
} from "./financeCopilotEngine";
import { answerMathEngine } from "./financeMathEngine";
import { money, type FinanceTx } from "./financeStore";
import { isTransferLike } from "./financeTransfers";
import { buildTaxEvidencePack } from "./taxKnowledge";

/** Smartest flagship model on the xAI API (Mel bridge default). */
export const FINANCE_MEL_MODEL = "grok-4.5";

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const names = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${names[(m || 1) - 1]} ${y}`;
}

function topMerchants(txs: FinanceTx[], n = 12): string {
  const map = new Map<string, { total: number; count: number }>();
  for (const t of txs) {
    if (t.kind !== "expense" || isTransferLike(t)) continue;
    const name = (t.merchant || t.note || "Unknown").trim() || "Unknown";
    const cur = map.get(name) || { total: 0, count: 0 };
    cur.total += t.amount;
    cur.count += 1;
    map.set(name, cur);
  }
  return [...map.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, n)
    .map(([name, v]) => `${name}: ${money(v.total)} (${v.count}×)`)
    .join("\n");
}

function categoryRollup(txs: FinanceTx[], n = 12): string {
  const map = new Map<string, number>();
  for (const t of txs) {
    if (t.kind !== "expense" || isTransferLike(t)) continue;
    const c = t.category || "Other";
    map.set(c, (map.get(c) || 0) + t.amount);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, total]) => `${name}: ${money(total)}`)
    .join("\n");
}

function recentLines(txs: FinanceTx[], n = 40): string {
  return [...txs]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, n)
    .map((t) => {
      const who = (t.merchant || t.note || "—").slice(0, 48);
      const sign = t.kind === "income" ? "+" : "-";
      return `${t.date} ${sign}${money(t.amount)} ${who} [${t.category || "?"}]`;
    })
    .join("\n");
}

/** Dense ledger snapshot Mel can reason over. */
export function buildFinanceLiveContext(
  ctx: CopilotContext,
  question?: string
): string {
  const txs = ctx.state.txs;
  const months = [...new Set(txs.map((t) => t.date.slice(0, 7)))].sort();
  // V2: retrieve evidence for *this* question (highlights + concepts + frameworks)
  const pack = buildEvidencePack(question || "capital allocation money", {
    pageId: "pg-finance",
    pageTitle: "Finances",
    maxChars: 3200,
    deepShelf: true,
  });
  const lines = [
    "FINANCE LEDGER SNAPSHOT (ground truth — never invent numbers outside this)",
    `As-of month: ${monthLabel(ctx.ym)} (${ctx.ym})`,
    `Rows: ${txs.length}`,
    `Months present: ${months.map(monthLabel).join(", ") || "none"}`,
    ctx.worthVerified === false
      ? `Net worth: UNVERIFIED (missing account statement evidence) | Recorded cash: ${money(ctx.cash)} | Recorded debt: ${money(ctx.debt)}`
      : `Net worth: ${money(ctx.worth)} | Cash: ${money(ctx.cash)} | Debt: ${money(ctx.debt)}`,
    `Period flow — income ${money(ctx.income)}, expense ${money(ctx.expense)}, net ${money(ctx.cashFlow)}`,
    ctx.rate != null ? `Save rate: ${Math.round(ctx.rate * 100)}%` : "Save rate: n/a",
    `Credit score (tracked): ${ctx.credit.estimate ?? "unknown"} (${ctx.credit.band}) | utilization ${
      ctx.credit.utilization == null
        ? "unknown"
        : `${Math.round(ctx.credit.utilization * 100)}%`
    }`,
    `Subscriptions detected: ${ctx.subs.count} · monthly burn ~${money(ctx.subs.monthlyTotal)}`,
    "",
    "TOP CATEGORIES (expense, all data):",
    categoryRollup(txs) || "(none)",
    "",
    "TOP MERCHANTS (expense, all data):",
    topMerchants(txs) || "(none)",
    "",
    "RECENT TRANSACTIONS (newest first):",
    recentLines(txs) || "(none)",
    "",
    "BRIEF (local intelligence, may be partial):",
    ctx.brief.headline || "",
    ctx.brief.sub || "",
    ctx.brief.topLeak
      ? `Top leak: ${ctx.brief.topLeak.merchant} ${money(ctx.brief.topLeak.total)} (${ctx.brief.topLeak.count}x)`
      : "",
    "",
    pack.text,
  ];
  return lines.filter((x) => x != null).join("\n").slice(0, 14000);
}

const FINANCE_SYSTEM = `You are Mel, Melani's finance quant copilot inside Wonder Finances.

You receive: (1) ledger ground truth, (2) an EVIDENCE PACK, (3) optionally a LOCAL MATH RESULT already computed exactly.

Intelligence bar (non-negotiable):
- Think like a top quant + corporate finance TA + buy-side analyst, not a lifestyle coach.
- Prefer closed-form identities and reproducible arithmetic over metaphors.
- When you compute, show: formula, inputs, intermediate step, result, assumption that breaks it.
- Never invent ledger rows, balances, merchants, or APRs. If missing, say what input is missing.
- HIGHLIGHTS in the evidence pack are hers only. Never invent a quote.
- For tax questions, distinguish ledger facts, user-provided facts, assumptions, and IRS rules.
- Cite IRS Publication 17 by printed page for every material tax claim.
- Never call a rough scenario a return, filing result, or amount owed.
- Before a personal tax conclusion, identify missing facts such as filing status, age, state,
  dependents, residency, W-2/1099 forms, business status, basis, and prior payments.
- Publication 17 is a tax-year-2025 source. Say when a different year or a newer IRS source is needed.
- Do not hide behind a generic disclaimer. Give the exact rule, math, uncertainty, and next document needed.

Math you must be ready to do precisely:
TVM (FV/PV/annuity/growing annuity), APR↔APY, Fisher real returns, amortisation, payoff loops,
avalanche vs snowball, NPV, IRR (bisection), CAGR, perpetuity/Gordon, FI years from savings rate,
payment-for-target, sensitivity tables, sample μ/σ/CV and correlation on monthly ledger series,
Black-Scholes European call (educational), Monte Carlo GBM quantiles (educational).

Voice: sharp, dense, founder-grade. No fluff. No em or en dashes. Short paragraphs.
Prefer: exact numbers → formula → assumption → one next action.
If a LOCAL MATH block is present, treat those numbers as ground truth and explain them; do not re-roll random Monte Carlo.`;

export type MelFinanceResult = {
  answer: CopilotAnswer;
  mode: "mel-grok" | "local-ledger";
  model?: string;
};

/**
 * Ask Mel (Grok) with ledger context. Falls back to local grounded engine.
 */
export async function askFinanceMel(
  question: string,
  ctx: CopilotContext,
  history: CopilotTurn[] = []
): Promise<MelFinanceResult> {
  const local = () => {
    const last = history[history.length - 1];
    return {
      answer: answerCopilot(question, ctx, last),
      mode: "local-ledger" as const,
    };
  };

  try {
    const messages = [
      ...history.flatMap((t) => [
        { role: "user" as const, content: t.question },
        { role: "assistant" as const, content: t.answer.text },
      ]),
      { role: "user" as const, content: question },
    ].slice(-16);

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 45_000);
    const pack = buildEvidencePack(question, {
      pageId: "pg-finance",
      pageTitle: "Finances",
      maxChars: 3200,
    });
    const taxPack = await buildTaxEvidencePack(question);
    // Local quant always runs: exact arithmetic is not delegated to the LLM
    const grounded = answerCopilot(question, ctx, history[history.length - 1]);
    const quant = answerMathEngine(question, ctx);
    const mathBlock = quant
      ? [
          "LOCAL MATH RESULT (exact — do not recompute randomly; explain and extend if needed):",
          quant.text,
          quant.formulaNote ? `Formula note: ${quant.formulaNote}` : "",
          quant.data
            ? `Table: ${quant.data.map((d) => `${d.label}=${d.value}`).join("; ")}`
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      : grounded.data || grounded.formula
        ? [
            "LOCAL ENGINE RESULT (use numbers as ground truth):",
            grounded.text.slice(0, 2000),
          ].join("\n")
        : "";

    const res = await fetch("/api/melani-ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        messages,
        page_id: "pg-finances",
        page_title: "Finances",
        model: FINANCE_MEL_MODEL,
        live_context:
          buildFinanceLiveContext(ctx, question) +
          (mathBlock ? `\n\n${mathBlock}` : "") +
          (taxPack.text ? `\n\n${taxPack.text}` : ""),
        system_context: FINANCE_SYSTEM,
      }),
    });
    window.clearTimeout(timer);

    if (!res.ok) {
      return local();
    }
    const payload = (await res.json()) as {
      ok?: boolean;
      reply?: string;
      model?: string;
      detail?: string;
    };
    if (!payload.reply?.trim()) return local();

    // Prefer local quant charts/tables; Mel owns prose polish
    const base = quant || grounded;
    const shelf = bookshelfStats();
    const shelfSource =
      shelf.total > 0
        ? `Bookshelf · ${shelf.total} books` +
          (shelf.econ ? ` · ${shelf.econ} econ` : "") +
          (shelf.quoteCount ? ` · ${shelf.quoteCount} highlights` : "")
        : null;
    return {
      mode: "mel-grok",
      model: payload.model || FINANCE_MEL_MODEL,
      answer: {
        text: payload.reply.trim(),
        sources: [
          ...(base.sources || []),
          `Mel · ${payload.model || FINANCE_MEL_MODEL}`,
          ...(quant ? ["local quant engine"] : []),
          ...(shelfSource ? [shelfSource] : []),
          ...pack.sources.slice(0, 4),
          ...taxPack.sources,
        ],
        data: base.data,
        chart: base.chart,
        formula: base.formula,
        formulaNote: base.formulaNote,
      },
    };
  } catch {
    return local();
  }
}

export async function checkFinanceMelOnline(): Promise<boolean> {
  try {
    const res = await fetch("/api/melani-ai/health", { method: "GET" });
    if (!res.ok) return false;
    const j = (await res.json()) as { has_key?: boolean };
    return Boolean(j.has_key);
  } catch {
    return false;
  }
}

/**
 * Extremely smart financials core — transfer-aware, anomaly-aware,
 * capital-first analysis for a founder desk (not a lifestyle budget toy).
 *
 * Deterministic. Explainable. Numbers from the ledger only.
 */

import {
  cashOnHand,
  creditOwed,
  invested,
  money,
  moneyCents,
  monthKey,
  monthlySeries,
  type FinanceAccount,
  type FinanceState,
  type FinanceTx,
} from "./financeStore";
import {
  isTransferLike,
  monthTrueIncome,
  monthTrueSpend,
} from "./financeTransfers";
import { detectSubscriptions } from "./subscriptions";

export type SmartSignalSeverity = "critical" | "high" | "medium" | "low" | "good";

export type SmartSignal = {
  id: string;
  severity: SmartSignalSeverity;
  title: string;
  detail: string;
  amount?: number;
  /** Machine-readable metric for UI chips */
  metric?: string;
};

export type TrueFlow = {
  ym: string;
  /** Income excluding transfers / Zelle self-moves when categorized */
  trueIncome: number;
  /** Spend excluding card pays + transfers */
  trueSpend: number;
  trueFlow: number;
  rawIncome: number;
  rawSpend: number;
  /** How much raw spend was transfer inflation */
  transferOut: number;
  transferIn: number;
  /** True keep rate of income */
  keepRate: number | null;
};

export type Anomaly = {
  id: string;
  date: string;
  merchant: string;
  amount: number;
  /** vs recent average for that merchant or category */
  zScore: number;
  why: string;
};

export type Velocity = {
  /** Days of true burn cash covers */
  daysOfCash: number;
  /** Cash / (true monthly burn) */
  runwayMonthsTrue: number;
  trueBurnPerDay: number;
  trueBurnPerMonth: number;
};

export type Concentration = {
  topMerchantShare: number;
  top3Share: number;
  topMerchant: { merchant: string; total: number; count: number } | null;
  herfindahl: number; // 0–1, higher = more concentrated
};

export type SubDrag = {
  monthlyEstimate: number;
  shareOfTrueIncome: number | null;
  shareOfTrueSpend: number | null;
  count: number;
  names: string[];
};

export type DebtCost = {
  totalOwed: number;
  /** Rough monthly interest if revolving at card APRs (when set) */
  monthlyInterestDrag: number;
  worstApr: number | null;
  payoffPriority: { name: string; balance: number; apr: number | null }[];
};

export type CapitalScore = {
  /** 0–100 capital-formation quality this month */
  score: number;
  keepRate: number | null;
  investedBalance: number;
  investShareOfAssets: number;
  label: string;
};

export type SmartCore = {
  trueFlow: TrueFlow;
  velocity: Velocity;
  concentration: Concentration;
  subs: SubDrag;
  debt: DebtCost;
  capital: CapitalScore;
  anomalies: Anomaly[];
  /** Ranked intelligence signals (not full action queue) */
  signals: SmartSignal[];
  /** One-line operating order */
  order: string;
  /** 0–100 how much we trust the picture */
  confidence: number;
};

function daysInMonth(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function dayOfYm(ym: string, today = new Date()): number {
  const thisYm = monthKey(today);
  if (ym !== thisYm) return daysInMonth(ym);
  return Math.max(1, today.getDate());
}

function rawMonthIncome(txs: FinanceTx[], ym: string): number {
  let s = 0;
  for (const t of txs) {
    if (t.kind === "income" && t.date.startsWith(ym)) s += t.amount;
  }
  return Math.round(s * 100) / 100;
}

function rawMonthSpend(txs: FinanceTx[], ym: string): number {
  let s = 0;
  for (const t of txs) {
    if (t.kind === "expense" && t.date.startsWith(ym)) s += t.amount;
  }
  return Math.round(s * 100) / 100;
}

function transferTotals(txs: FinanceTx[], ym: string): { out: number; inn: number } {
  let out = 0;
  let inn = 0;
  for (const t of txs) {
    if (!t.date.startsWith(ym) || !isTransferLike(t)) continue;
    if (t.kind === "expense") out += t.amount;
    if (t.kind === "income") inn += t.amount;
  }
  return {
    out: Math.round(out * 100) / 100,
    inn: Math.round(inn * 100) / 100,
  };
}

/** Spike detection vs last 90 days of true expenses. */
export function detectAnomalies(
  txs: FinanceTx[],
  ym: string,
  limit = 5
): Anomaly[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  // Per-merchant history (true expenses only)
  const byMerchant = new Map<string, number[]>();
  for (const t of txs) {
    if (t.kind !== "expense" || isTransferLike(t)) continue;
    if (t.date < cutoffStr) continue;
    const key = (t.merchant || t.note || "Unknown").trim() || "Unknown";
    const list = byMerchant.get(key) || [];
    list.push(t.amount);
    byMerchant.set(key, list);
  }

  const anomalies: Anomaly[] = [];
  for (const t of txs) {
    if (t.kind !== "expense" || isTransferLike(t)) continue;
    if (!t.date.startsWith(ym)) continue;
    // Only large enough to care
    if (t.amount < 40) continue;
    const key = (t.merchant || t.note || "Unknown").trim() || "Unknown";
    const hist = byMerchant.get(key) || [];
    if (hist.length < 3) {
      // First big unknown charge this month
      if (t.amount >= 150) {
        anomalies.push({
          id: `anom-${t.id}`,
          date: t.date,
          merchant: key,
          amount: t.amount,
          zScore: 2.5,
          why: `Large one-off / rare merchant (${moneyCents(t.amount)}). Confirm it's intentional.`,
        });
      }
      continue;
    }
    const mean = hist.reduce((a, b) => a + b, 0) / hist.length;
    const variance =
      hist.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, hist.length - 1);
    const sd = Math.sqrt(variance) || 1;
    const z = (t.amount - mean) / sd;
    if (z >= 2.2 && t.amount > mean * 1.6) {
      anomalies.push({
        id: `anom-${t.id}`,
        date: t.date,
        merchant: key,
        amount: t.amount,
        zScore: Math.round(z * 10) / 10,
        why: `${moneyCents(t.amount)} vs typical ~${moneyCents(mean)} at ${key} (z≈${z.toFixed(1)}).`,
      });
    }
  }

  anomalies.sort((a, b) => b.amount - a.amount || b.zScore - a.zScore);
  return anomalies.slice(0, limit);
}

function concentrationOf(txs: FinanceTx[], ym: string): Concentration {
  // True spend only — exclude transfer-like categories from concentration
  const map = new Map<string, { total: number; count: number }>();
  for (const t of txs) {
    if (t.kind !== "expense" || !t.date.startsWith(ym) || isTransferLike(t))
      continue;
    const m = (t.merchant || t.note || "Unknown").trim() || "Unknown";
    if (/payment|transfer|zelle|venmo/i.test(m)) continue;
    const cur = map.get(m) || { total: 0, count: 0 };
    cur.total += t.amount;
    cur.count += 1;
    map.set(m, cur);
  }
  const merchants = [...map.entries()]
    .map(([merchant, v]) => ({ merchant, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 20);
  const trueSpend = monthTrueSpend(txs, ym);
  const top = merchants[0] || null;
  const top3 = merchants.slice(0, 3).reduce((s, m) => s + m.total, 0);
  let hhi = 0;
  if (trueSpend > 0) {
    for (const m of merchants) {
      const share = m.total / trueSpend;
      hhi += share * share;
    }
  }
  return {
    topMerchantShare: trueSpend > 0 && top ? top.total / trueSpend : 0,
    top3Share: trueSpend > 0 ? top3 / trueSpend : 0,
    topMerchant: top,
    herfindahl: Math.round(hhi * 1000) / 1000,
  };
}

function debtCostOf(accounts: FinanceAccount[]): DebtCost {
  const cards = accounts.filter((a) => a.kind === "credit" && a.balance > 0);
  const totalOwed = creditOwed(accounts);
  let monthlyInterestDrag = 0;
  let worstApr: number | null = null;
  const payoffPriority = cards
    .map((a) => {
      const apr = typeof a.apr === "number" && a.apr > 0 ? a.apr : null;
      if (apr != null) {
        worstApr = worstApr == null ? apr : Math.max(worstApr, apr);
        monthlyInterestDrag += (a.balance * (apr / 100)) / 12;
      }
      return {
        name: a.name,
        balance: a.balance,
        apr,
      };
    })
    .sort((a, b) => {
      // Avalanche: highest APR first; unknown APR by balance
      const aa = a.apr ?? -1;
      const bb = b.apr ?? -1;
      if (aa !== bb) return bb - aa;
      return b.balance - a.balance;
    });

  return {
    totalOwed,
    monthlyInterestDrag: Math.round(monthlyInterestDrag * 100) / 100,
    worstApr,
    payoffPriority,
  };
}

function capitalScoreOf(
  trueFlow: TrueFlow,
  accounts: FinanceAccount[]
): CapitalScore {
  const cash = cashOnHand(accounts);
  const inv = invested(accounts);
  const assets = cash + inv + accounts
    .filter((a) => a.kind !== "credit" && a.kind !== "invest" && a.kind !== "checking" && a.kind !== "savings" && a.kind !== "cash")
    .reduce((s, a) => s + Math.max(0, a.balance), 0);
  const investShare = assets + inv + cash > 0 ? inv / Math.max(1, cash + inv) : 0;
  const keep = trueFlow.keepRate;

  let score = 35;
  if (keep != null) {
    score = Math.round(Math.min(100, keep * 100 + investShare * 20));
    if (keep >= 0.5) score = Math.min(100, score + 10);
    if (keep < 0) score = Math.min(score, 20);
  }
  if (inv > 0) score = Math.min(100, score + 5);
  if (trueFlow.trueFlow < 0) score = Math.min(score, 30);

  let label = "Capital formation weak";
  if (score >= 80) label = "Capital formation elite";
  else if (score >= 60) label = "Capital formation solid";
  else if (score >= 40) label = "Capital formation building";

  return {
    score,
    keepRate: keep,
    investedBalance: inv,
    investShareOfAssets: Math.round(investShare * 1000) / 1000,
    label,
  };
}

/**
 * Full smart core for a month. Call from buildSmartBrief / UI.
 */
export function buildSmartCore(
  state: FinanceState,
  ym: string = monthKey()
): SmartCore {
  const txs = state.txs;
  const accounts = state.accounts;
  const trueIncome = monthTrueIncome(txs, ym);
  const trueSpend = monthTrueSpend(txs, ym);
  const rawIncome = rawMonthIncome(txs, ym);
  const rawSpend = rawMonthSpend(txs, ym);
  const xfer = transferTotals(txs, ym);
  const trueFlowAmt = trueIncome - trueSpend;
  const keepRate = trueIncome > 0 ? trueFlowAmt / trueIncome : null;

  const trueFlow: TrueFlow = {
    ym,
    trueIncome,
    trueSpend,
    trueFlow: trueFlowAmt,
    rawIncome,
    rawSpend,
    transferOut: xfer.out,
    transferIn: xfer.inn,
    keepRate,
  };

  const day = dayOfYm(ym);
  const dim = daysInMonth(ym);
  const trueBurnPerDay = trueSpend / day;
  const trueBurnPerMonth = trueBurnPerDay * dim;
  const cash = cashOnHand(accounts);
  const velocity: Velocity = {
    trueBurnPerDay: Math.round(trueBurnPerDay * 100) / 100,
    trueBurnPerMonth: Math.round(trueBurnPerMonth * 100) / 100,
    daysOfCash:
      trueBurnPerDay > 0 ? Math.round((cash / trueBurnPerDay) * 10) / 10 : cash > 0 ? 999 : 0,
    runwayMonthsTrue:
      trueBurnPerMonth > 0
        ? Math.round((cash / trueBurnPerMonth) * 100) / 100
        : cash > 0
          ? 99
          : 0,
  };

  const concentration = concentrationOf(txs, ym);
  const subScan = detectSubscriptions(txs);
  const subEst = subScan.monthlyTotal || 0;
  const subNames = subScan.subs.slice(0, 6).map((s) => s.merchant);

  const subs: SubDrag = {
    monthlyEstimate: Math.round(subEst * 100) / 100,
    shareOfTrueIncome: trueIncome > 0 ? subEst / trueIncome : null,
    shareOfTrueSpend: trueSpend > 0 ? subEst / trueSpend : null,
    count: subScan.count,
    names: subNames,
  };

  const debt = debtCostOf(accounts);
  const capital = capitalScoreOf(trueFlow, accounts);
  const anomalies = detectAnomalies(txs, ym, 5);

  // Trend: last 3 months true flow
  const series = monthlySeries(txs, 4);
  const lastFlows = series.slice(-3).map((r) => r.income - r.expense);

  const signals: SmartSignal[] = [];

  // Confidence
  let confidence = 20;
  if (txs.length > 20) confidence += 25;
  if (txs.length > 100) confidence += 15;
  if (trueIncome > 0) confidence += 15;
  if (accounts.some((a) => a.kind === "credit" && (a.creditLimit || 0) > 0))
    confidence += 15;
  if (accounts.some((a) => a.kind === "invest")) confidence += 10;
  confidence = Math.min(100, confidence);

  if (trueFlow.trueFlow < 0 && trueIncome > 0) {
    signals.push({
      id: "true-neg",
      severity: Math.abs(trueFlow.trueFlow) > trueIncome * 0.2 ? "critical" : "high",
      title: "True cash flow is negative",
      detail: `After stripping transfers/card pays: in ${money(trueIncome)}, out ${money(trueSpend)}, net ${money(trueFlow.trueFlow)}. Raw books can lie when transfers inflate both sides.`,
      amount: Math.abs(trueFlow.trueFlow),
      metric: money(trueFlow.trueFlow),
    });
  }

  if (xfer.out > trueSpend * 0.4 && xfer.out > 200) {
    signals.push({
      id: "xfer-heavy",
      severity: "medium",
      title: "Transfer noise is high",
      detail: `${money(xfer.out)} moved as transfers/card pays this month vs ${money(trueSpend)} true spend. Mark pairs as transfers so Books stays honest.`,
      amount: xfer.out,
      metric: money(xfer.out),
    });
  }

  if (concentration.topMerchantShare >= 0.22 && concentration.topMerchant) {
    signals.push({
      id: "conc-top",
      severity: concentration.topMerchantShare >= 0.35 ? "high" : "medium",
      title: `${concentration.topMerchant.merchant} is ${Math.round(concentration.topMerchantShare * 100)}% of true spend`,
      detail: `${money(concentration.topMerchant.total)} · ${concentration.topMerchant.count} charges. Top-3 share ${Math.round(concentration.top3Share * 100)}%. Concentration = one lever to cut.`,
      amount: concentration.topMerchant.total,
      metric: `${Math.round(concentration.topMerchantShare * 100)}%`,
    });
  }

  if (subs.shareOfTrueIncome != null && subs.shareOfTrueIncome > 0.08) {
    signals.push({
      id: "sub-drag",
      severity: subs.shareOfTrueIncome > 0.15 ? "high" : "medium",
      title: `Subscriptions eat ${Math.round(subs.shareOfTrueIncome * 100)}% of true income`,
      detail: `~${money(subs.monthlyEstimate)}/mo recurring${subs.names.length ? ` · ${subs.names.slice(0, 3).join(", ")}` : ""}. Kill or renegotiate before lifestyle debates.`,
      amount: subs.monthlyEstimate,
      metric: money(subs.monthlyEstimate) + "/mo",
    });
  }

  if (debt.monthlyInterestDrag > 5) {
    signals.push({
      id: "apr-drag",
      severity: debt.monthlyInterestDrag > 40 ? "high" : "medium",
      title: `Interest drag ~${money(debt.monthlyInterestDrag)}/mo`,
      detail: debt.payoffPriority[0]
        ? `Avalanche first: ${debt.payoffPriority[0].name} (${money(debt.payoffPriority[0].balance)}${debt.payoffPriority[0].apr != null ? ` · ${debt.payoffPriority[0].apr}% APR` : ""}).`
        : `Revolving ${money(debt.totalOwed)}. Pay before statement close.`,
      amount: debt.monthlyInterestDrag,
      metric: money(debt.monthlyInterestDrag) + "/mo",
    });
  }

  if (velocity.runwayMonthsTrue < 2 && cash > 0) {
    signals.push({
      id: "runway-true",
      severity: "critical",
      title: `True runway ${velocity.runwayMonthsTrue.toFixed(1)} months`,
      detail: `Cash ${money(cash)} at true burn ${money(velocity.trueBurnPerDay)}/day (~${money(velocity.trueBurnPerMonth)}/mo). Raise buffer or cut fixed costs this week.`,
      metric: `${velocity.runwayMonthsTrue.toFixed(1)} mo`,
    });
  } else if (velocity.runwayMonthsTrue < 4 && cash > 0) {
    signals.push({
      id: "runway-thin",
      severity: "medium",
      title: `True runway ${velocity.runwayMonthsTrue.toFixed(1)} months`,
      detail: `Aim for 6+ months at true burn ${money(velocity.trueBurnPerMonth)}/mo. Days of cash: ${velocity.daysOfCash > 200 ? "200+" : velocity.daysOfCash}.`,
      metric: `${velocity.daysOfCash}d cash`,
    });
  }

  for (const a of anomalies.slice(0, 3)) {
    signals.push({
      id: a.id,
      severity: a.amount >= 300 ? "high" : "medium",
      title: `Anomaly · ${a.merchant}`,
      detail: `${a.date}: ${a.why}`,
      amount: a.amount,
      metric: money(a.amount),
    });
  }

  if (capital.score >= 70 && trueFlow.trueFlow > 0) {
    signals.push({
      id: "capital-good",
      severity: "good",
      title: capital.label,
      detail: `Keep rate ${keepRate == null ? "—" : `${Math.round(keepRate * 100)}%`}. Invest book ${money(capital.investedBalance)}. Deploy surplus before lifestyle upgrades.`,
      metric: `${capital.score}/100`,
    });
  } else if (trueIncome > 0 && (keepRate == null || keepRate < 0.3)) {
    signals.push({
      id: "capital-weak",
      severity: "high",
      title: "Keep rate too low for empire mode",
      detail: `True keep ${keepRate == null ? "n/a" : `${Math.round(keepRate * 100)}%`}. Founder floor is 50%+ routed to capital, not vibes.`,
      metric: keepRate == null ? "—" : `${Math.round(keepRate * 100)}%`,
    });
  }

  // Deteriorating trend
  if (lastFlows.length >= 3) {
    const [a, b, c] = lastFlows;
    if (c < b && b < a && c < 0) {
      signals.push({
        id: "trend-down",
        severity: "high",
        title: "Three-month flow is worsening",
        detail: `Net trend ${money(a)} → ${money(b)} → ${money(c)}. Structural cut or income move — not one-off thrift.`,
      });
    }
  }

  signals.sort((x, y) => {
    const rank: Record<SmartSignalSeverity, number> = {
      critical: 5,
      high: 4,
      medium: 3,
      low: 2,
      good: 1,
    };
    return rank[y.severity] - rank[x.severity];
  });

  const top = signals.find((s) => s.severity !== "good") || signals[0];
  const order = top
    ? top.title
    : trueIncome > 0
      ? "Books are quiet — protect keep rate and cash floor."
      : "Import ledger history so intelligence has ground truth.";

  return {
    trueFlow,
    velocity,
    concentration,
    subs,
    debt,
    capital,
    anomalies,
    signals: signals.slice(0, 10),
    order,
    confidence,
  };
}

/** Short answer slice for Ask box */
export function answerSmartCore(question: string, core: SmartCore): string | null {
  const q = question.toLowerCase().trim();
  if (!q) return null;

  if (/true (spend|income|flow|cash)|real (spend|burn)|without transfer/.test(q)) {
    const t = core.trueFlow;
    return `True books for ${t.ym}: income ${money(t.trueIncome)} · spend ${money(t.trueSpend)} · flow ${money(t.trueFlow)} (keep ${t.keepRate == null ? "—" : `${Math.round(t.keepRate * 100)}%`}). Raw was in ${money(t.rawIncome)} / out ${money(t.rawSpend)} with ${money(t.transferOut)} transfer-out noise.`;
  }
  if (/anomal|weird|spike|unusual/.test(q)) {
    if (!core.anomalies.length) return "No large spend anomalies this month vs your 90-day pattern.";
    return core.anomalies
      .slice(0, 3)
      .map((a) => `${a.date} · ${a.merchant} · ${money(a.amount)} — ${a.why}`)
      .join(" ");
  }
  if (/subscription|recurring|netflix|saas/.test(q)) {
    const s = core.subs;
    return `Recurring ~${money(s.monthlyEstimate)}/mo${s.shareOfTrueIncome != null ? ` (${Math.round(s.shareOfTrueIncome * 100)}% of true income)` : ""}${s.names.length ? ` · ${s.names.join(", ")}` : ""}.`;
  }
  if (/concentrat|herfindahl|top merchant|leak/.test(q)) {
    const c = core.concentration;
    if (!c.topMerchant) return "Not enough true spend to measure concentration.";
    return `${c.topMerchant.merchant} is ${Math.round(c.topMerchantShare * 100)}% of true spend (${money(c.topMerchant.total)}). Top-3: ${Math.round(c.top3Share * 100)}%. HHI ${c.herfindahl}.`;
  }
  if (/capital|keep rate|formation/.test(q)) {
    const k = core.capital;
    return `${k.label} (${k.score}/100). Keep ${k.keepRate == null ? "—" : `${Math.round(k.keepRate * 100)}%`}. Invest book ${money(k.investedBalance)}.`;
  }
  if (/interest|apr|avalanche|debt cost/.test(q)) {
    const d = core.debt;
    if (d.totalOwed <= 0) return "No revolving credit balances on the books.";
    return `Owed ${money(d.totalOwed)}. Interest drag ~${money(d.monthlyInterestDrag)}/mo. Pay first: ${d.payoffPriority[0]?.name || "highest APR card"}.`;
  }
  return null;
}

/**
 * Intelligence Level 3 — Compound OS digest.
 *
 * Reads V1 body/ledger data + V2 decisions/highlights and produces one weekly
 * brief with cross-desk links and a single priority. No API required.
 * Not a diagnosis. Not financial advice.
 */
import { todayKey } from "./data";
import { dueDecisions, listDecisions, type Decision } from "./decisionsStore";
import { loadFinance, money as fmtMoney, type FinanceTx } from "./financeStore";
import { isTransferLike } from "./financeTransfers";
import { listAllHighlights } from "./highlightIndex";
import { bookshelfStats } from "./bookKnowledge";
import {
  loadBowelDetailMap,
  loadFogMap,
  loadSleepDay,
  sleepHours,
} from "./sleepStore";

export type L3BodyWeek = {
  days: string[];
  sleepLogged: number;
  sleepAvgHours: number | null;
  sleepBelow7: number;
  fogYes: number;
  bowelWent: number;
  bowelNo: number;
  waterAvgMl: number;
  waterDaysHit: number; // >= 2000 ml soft floor
};

export type L3MoneyWeek = {
  spend: number;
  income: number;
  net: number;
  txCount: number;
  topMerchant: { name: string; total: number; count: number } | null;
  cash: number;
  debt: number;
  hasLedger: boolean;
};

export type L3CrossLink = {
  id: string;
  severity: "info" | "watch" | "act";
  text: string;
};

export type IntelligenceDigest = {
  builtAt: string;
  weekStart: string;
  weekEnd: string;
  body: L3BodyWeek;
  money: L3MoneyWeek;
  decisionsDue: Decision[];
  recentDecisions: Decision[];
  highlightsThisWeek: number;
  shelfBooks: number;
  crossLinks: L3CrossLink[];
  priority: string;
  fullText: string;
};

const DIGEST_HISTORY_KEY = "wonder-l3-digest-history-v1";

function lastNDays(n: number, endIso: string = todayKey()): string[] {
  const [y, m, d] = endIso.split("-").map(Number);
  const end = new Date(y, m - 1, d);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(end);
    x.setDate(end.getDate() - i);
    const yy = x.getFullYear();
    const mm = String(x.getMonth() + 1).padStart(2, "0");
    const dd = String(x.getDate()).padStart(2, "0");
    out.push(`${yy}-${mm}-${dd}`);
  }
  return out;
}

function waterMl(day: string): number {
  try {
    return Math.max(0, Number(localStorage.getItem(`dr-melani-water-ml:${day}`)) || 0);
  } catch {
    return 0;
  }
}

function buildBodyWeek(days: string[]): L3BodyWeek {
  const fog = loadFogMap();
  const bowel = loadBowelDetailMap();
  let sleepSum = 0;
  let sleepN = 0;
  let sleepBelow7 = 0;
  let fogYes = 0;
  let bowelWent = 0;
  let bowelNo = 0;
  let waterSum = 0;
  let waterHit = 0;

  for (const day of days) {
    const s = loadSleepDay(day);
    const h =
      s.hours != null && Number.isFinite(s.hours)
        ? s.hours
        : sleepHours(s.bedtime, s.wake);
    if (h != null && h > 0) {
      sleepN += 1;
      sleepSum += h;
      if (h < 7) sleepBelow7 += 1;
    }
    if (fog[day] === true) fogYes += 1;
    if (bowel[day]?.had === true) bowelWent += 1;
    if (bowel[day]?.had === false) bowelNo += 1;
    const w = waterMl(day);
    waterSum += w;
    if (w >= 2000) waterHit += 1;
  }

  return {
    days,
    sleepLogged: sleepN,
    sleepAvgHours: sleepN ? Math.round((sleepSum / sleepN) * 10) / 10 : null,
    sleepBelow7,
    fogYes,
    bowelWent,
    bowelNo,
    waterAvgMl: Math.round(waterSum / Math.max(1, days.length)),
    waterDaysHit: waterHit,
  };
}

function buildMoneyWeek(days: string[]): L3MoneyWeek {
  let state;
  try {
    state = loadFinance();
  } catch {
    state = null;
  }
  if (!state || !state.txs?.length) {
    return {
      spend: 0,
      income: 0,
      net: 0,
      txCount: 0,
      topMerchant: null,
      cash: 0,
      debt: 0,
      hasLedger: false,
    };
  }

  const daySet = new Set(days);
  const start = days[0];
  const end = days[days.length - 1];
  let spend = 0;
  let income = 0;
  let txCount = 0;
  const merch = new Map<string, { total: number; count: number }>();

  for (const t of state.txs as FinanceTx[]) {
    if (isTransferLike(t)) continue;
    // Prefer exact day set; fall back to range if date format odd
    const inWeek =
      daySet.has(t.date) ||
      (t.date >= start && t.date <= end);
    if (!inWeek) continue;
    txCount += 1;
    if (t.kind === "expense") {
      spend += t.amount;
      const name = (t.merchant || t.note || "Unknown").trim() || "Unknown";
      const cur = merch.get(name) || { total: 0, count: 0 };
      cur.total += t.amount;
      cur.count += 1;
      merch.set(name, cur);
    } else if (t.kind === "income") {
      income += t.amount;
    }
  }

  let topMerchant: L3MoneyWeek["topMerchant"] = null;
  for (const [name, v] of merch) {
    if (!topMerchant || v.total > topMerchant.total) {
      topMerchant = { name, total: Math.round(v.total * 100) / 100, count: v.count };
    }
  }

  const cash = (state.accounts || [])
    .filter((a) => a.kind === "checking" || a.kind === "savings" || a.kind === "cash")
    .reduce((s, a) => s + (Number(a.balance) || 0), 0);
  const debt = (state.accounts || [])
    .filter((a) => a.kind === "credit")
    .reduce((s, a) => s + Math.max(0, Number(a.balance) || 0), 0);

  return {
    spend: Math.round(spend * 100) / 100,
    income: Math.round(income * 100) / 100,
    net: Math.round((income - spend) * 100) / 100,
    txCount,
    topMerchant,
    cash: Math.round(cash * 100) / 100,
    debt: Math.round(debt * 100) / 100,
    hasLedger: true,
  };
}

function highlightsInDays(days: string[]): number {
  const set = new Set(days);
  return listAllHighlights().filter((h) => {
    if (!h.createdAt) return false;
    const day = new Date(h.createdAt).toISOString().slice(0, 10);
    return set.has(day);
  }).length;
}

function buildCrossLinks(body: L3BodyWeek, money: L3MoneyWeek): L3CrossLink[] {
  const links: L3CrossLink[] = [];

  if (body.sleepBelow7 >= 3) {
    links.push({
      id: "sleep-debt",
      severity: "act",
      text: `Sleep under 7h on ${body.sleepBelow7}/7 logged nights. Protect bedtime before optimizing side projects.`,
    });
  } else if (body.sleepAvgHours != null && body.sleepAvgHours < 7.5 && body.sleepLogged >= 3) {
    links.push({
      id: "sleep-soft",
      severity: "watch",
      text: `Avg sleep ${body.sleepAvgHours}h (${body.sleepLogged} nights logged). Thin margin under an 8h target.`,
    });
  }

  if (body.fogYes >= 3) {
    links.push({
      id: "fog-cluster",
      severity: "watch",
      text: `Brain fog marked Yes ${body.fogYes} days this week. Pair with sleep and water before stacking hard cognitive work.`,
    });
  }

  if (body.bowelNo >= 2 && body.bowelWent + body.bowelNo >= 3) {
    links.push({
      id: "bowel-no",
      severity: "watch",
      text: `Bowel logged No on ${body.bowelNo} days. Keep fiber/water and type notes when Yes returns.`,
    });
  }

  if (body.waterDaysHit <= 2 && body.days.length >= 5) {
    links.push({
      id: "water-low",
      severity: "watch",
      text: `Water ≥2L only ${body.waterDaysHit}/7 days (avg ${body.waterAvgMl} ml). Cheap fix with high carryover into fog/energy.`,
    });
  }

  if (money.hasLedger && money.spend > 0) {
    if (money.net < 0) {
      links.push({
        id: "cashflow-neg",
        severity: "act",
        text: `7-day cash flow ${fmtMoney(money.net)} (in ${fmtMoney(money.income)} / out ${fmtMoney(money.spend)}). Cut or delay the top leak before new commitments.`,
      });
    }
    if (money.topMerchant && money.topMerchant.total >= money.spend * 0.25) {
      links.push({
        id: "top-leak",
        severity: "watch",
        text: `Top merchant ${money.topMerchant.name} is ${fmtMoney(money.topMerchant.total)} (${money.topMerchant.count}×) — ${Math.round((money.topMerchant.total / money.spend) * 100)}% of weekly spend.`,
      });
    }
  }

  // Cross-desk: body stress × delivery/restaurant-like spend heuristic
  if (
    money.topMerchant &&
    body.sleepBelow7 >= 2 &&
    /door|dash|uber|eats|grub|restaurant|cafe|starbucks|chipotle|delivery/i.test(
      money.topMerchant.name
    )
  ) {
    links.push({
      id: "tired-spend",
      severity: "act",
      text: `Low-sleep days + heavy ${money.topMerchant.name} (${fmtMoney(money.topMerchant.total)}). Tired spend loop: fix sleep window first, then cap delivery for 7 days.`,
    });
  }

  if (!money.hasLedger) {
    links.push({
      id: "no-ledger",
      severity: "info",
      text: "No ledger rows in range. Import a CSV so Level 3 can cross money with body.",
    });
  }

  if (body.sleepLogged === 0) {
    links.push({
      id: "no-sleep-log",
      severity: "info",
      text: "No sleep logged this week. Fitness → Sleep makes the compound brief useful.",
    });
  }

  return links;
}

function pickPriority(
  links: L3CrossLink[],
  due: Decision[],
  body: L3BodyWeek,
  money: L3MoneyWeek
): string {
  if (due.length) {
    const d = due[0];
    return `Revisit decision: “${d.choice}” (${d.domain}, due ${d.revisitAt}). Confirm keep/kill with one number.`;
  }
  const act = links.find((l) => l.severity === "act");
  if (act) return act.text;
  const watch = links.find((l) => l.severity === "watch");
  if (watch) return watch.text;
  if (body.sleepLogged < 3) {
    return "Log sleep 3+ nights this week so Level 3 can rank recovery vs spend.";
  }
  if (money.hasLedger && money.spend > 0) {
    return `Hold weekly burn near ${fmtMoney(money.spend / 7)}/day average; review top merchant once.`;
  }
  return "System is quiet. Keep logging sleep + one money check-in; compound needs data density.";
}

function renderDigest(d: Omit<IntelligenceDigest, "fullText">): string {
  const b = d.body;
  const m = d.money;
  const lines: string[] = [
    `LEVEL 3 — WEEKLY INTELLIGENCE DIGEST`,
    `${d.weekStart} → ${d.weekEnd} · built ${d.builtAt.slice(0, 16).replace("T", " ")}`,
    ``,
    `—— BODY (7d) ——`,
    b.sleepLogged
      ? `Sleep: ${b.sleepLogged}/7 nights · avg ${b.sleepAvgHours ?? "—"}h · under 7h: ${b.sleepBelow7}`
      : `Sleep: not logged`,
    `Fog Yes: ${b.fogYes} · Bowel went ${b.bowelWent} / no ${b.bowelNo}`,
    `Water avg ${b.waterAvgMl} ml/day · days ≥2L: ${b.waterDaysHit}/7`,
    ``,
    `—— MONEY (7d) ——`,
  ];

  if (m.hasLedger) {
    lines.push(
      `In ${fmtMoney(m.income)} · Out ${fmtMoney(m.spend)} · Net ${fmtMoney(m.net)} · ${m.txCount} txs`
    );
    if (m.topMerchant) {
      lines.push(
        `Top leak: ${m.topMerchant.name} ${fmtMoney(m.topMerchant.total)} (${m.topMerchant.count}×)`
      );
    }
    if (m.cash || m.debt) {
      lines.push(
        `Accounts snapshot: cash ~${fmtMoney(m.cash)} · debt ~${fmtMoney(m.debt)}`
      );
    }
  } else {
    lines.push(`Ledger empty or unloaded for this window.`);
  }

  lines.push(``);
  lines.push(`—— MIND / SHELF ——`);
  lines.push(
    `Highlights saved this week: ${d.highlightsThisWeek} · shelf books: ${d.shelfBooks}`
  );

  lines.push(``);
  lines.push(`—— DECISIONS ——`);
  if (d.decisionsDue.length) {
    for (const x of d.decisionsDue.slice(0, 5)) {
      lines.push(`DUE ${x.revisitAt}: [${x.domain}] ${x.choice}`);
    }
  } else {
    lines.push(`No revisits due.`);
  }
  if (d.recentDecisions.length) {
    lines.push(`Recent: ${d.recentDecisions[0].choice}`);
  }

  lines.push(``);
  lines.push(`—— CROSS-DESK ——`);
  if (d.crossLinks.length) {
    for (const c of d.crossLinks) {
      lines.push(`[${c.severity}] ${c.text}`);
    }
  } else {
    lines.push(`No cross-links triggered.`);
  }

  lines.push(``);
  lines.push(`—— PRIORITY (one) ——`);
  lines.push(d.priority);
  lines.push(``);
  lines.push(
    `L3 rule: one priority, proof from your data, no invented numbers. Say “decide …” to log a keep/kill.`
  );

  return lines.join("\n");
}

/** Build Level 3 weekly digest (last 7 local days ending today). */
export function buildIntelligenceDigest(endDay: string = todayKey()): IntelligenceDigest {
  const days = lastNDays(7, endDay);
  const body = buildBodyWeek(days);
  const moneyWeek = buildMoneyWeek(days);
  const decisionsDue = dueDecisions(endDay);
  const recentDecisions = listDecisions(5);
  const highlightsThisWeek = highlightsInDays(days);
  const shelfBooks = bookshelfStats().total;
  const crossLinks = buildCrossLinks(body, moneyWeek);
  const priority = pickPriority(crossLinks, decisionsDue, body, moneyWeek);

  const partial = {
    builtAt: new Date().toISOString(),
    weekStart: days[0],
    weekEnd: days[days.length - 1],
    body,
    money: moneyWeek,
    decisionsDue,
    recentDecisions,
    highlightsThisWeek,
    shelfBooks,
    crossLinks,
    priority,
  };

  const fullText = renderDigest(partial);
  const digest: IntelligenceDigest = { ...partial, fullText };

  // Keep last few digests for “what did L3 say”
  try {
    const prev = JSON.parse(localStorage.getItem(DIGEST_HISTORY_KEY) || "[]") as Array<{
      at: string;
      text: string;
    }>;
    const next = [
      ...prev.filter((p) => p.at.slice(0, 10) !== endDay),
      { at: digest.builtAt, text: fullText.slice(0, 8000) },
    ].slice(-8);
    localStorage.setItem(DIGEST_HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }

  return digest;
}

export function loadLastDigestText(): string | null {
  try {
    const prev = JSON.parse(localStorage.getItem(DIGEST_HISTORY_KEY) || "[]") as Array<{
      at: string;
      text: string;
    }>;
    return prev.at(-1)?.text || null;
  } catch {
    return null;
  }
}

/** Short chip line for UI. */
export function l3StatusLine(): string {
  const d = buildIntelligenceDigest();
  const due = d.decisionsDue.length;
  const acts = d.crossLinks.filter((c) => c.severity === "act").length;
  return `L3 · ${due} due · ${acts} act · pri: ${d.priority.slice(0, 48)}`;
}

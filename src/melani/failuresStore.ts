/**
 * Failures desk — log real misses, derive your own success metrics.
 *
 * Success here is not vibes: recovery rate, same-mistake streak break,
 * time-to-fix, domain balance. Local only.
 */

export type FailureDomain =
  | "product"
  | "engineering"
  | "health"
  | "money"
  | "people"
  | "focus"
  | "other";

export type FailureEntry = {
  id: string;
  at: string; // ISO
  day: string; // YYYY-MM-DD
  /** What failed — plain English */
  title: string;
  /** What you learned / next move */
  lesson: string;
  domain: FailureDomain;
  /** 1–5 how costly */
  severity: number;
  /** Did you fix or close the loop? */
  recovered: boolean;
  recoveredAt?: string;
};

export type SuccessMetrics = {
  total: number;
  recovered: number;
  open: number;
  /** recovered / total */
  recoveryRate: number;
  /** last 7d count */
  last7: number;
  /** last 30d */
  last30: number;
  /** average severity of open items */
  avgOpenSeverity: number;
  /** by domain counts */
  byDomain: Record<FailureDomain, number>;
  /** consecutive days without a new failure log (not the same as perfect — just logging silence) */
  quietDays: number;
  /** success score 0–100: recovery-weighted, open-severity penalized */
  successScore: number;
};

const KEY = "wonder-failures-v1";

export const FAILURE_DOMAINS: { id: FailureDomain; label: string }[] = [
  { id: "product", label: "Product" },
  { id: "engineering", label: "Engineering" },
  { id: "health", label: "Health" },
  { id: "money", label: "Money" },
  { id: "people", label: "People" },
  { id: "focus", label: "Focus" },
  { id: "other", label: "Other" },
];

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function uid(): string {
  return `fail-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function loadFailures(): FailureEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as FailureEntry[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveFailures(list: FailureEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 500)));
    window.dispatchEvent(new CustomEvent("wonder-failures-changed"));
  } catch {
    /* ignore */
  }
}

export function addFailure(input: {
  title: string;
  lesson?: string;
  domain?: FailureDomain;
  severity?: number;
}): FailureEntry {
  const entry: FailureEntry = {
    id: uid(),
    at: new Date().toISOString(),
    day: todayKey(),
    title: input.title.trim().slice(0, 280),
    lesson: (input.lesson || "").trim().slice(0, 500),
    domain: input.domain || "other",
    severity: Math.min(5, Math.max(1, Math.round(input.severity ?? 3))),
    recovered: false,
  };
  const next = [entry, ...loadFailures()];
  saveFailures(next);
  return entry;
}

export function markRecovered(id: string, lesson?: string): FailureEntry | null {
  const list = loadFailures();
  const i = list.findIndex((e) => e.id === id);
  if (i < 0) return null;
  const e = list[i]!;
  const updated: FailureEntry = {
    ...e,
    recovered: true,
    recoveredAt: new Date().toISOString(),
    lesson: lesson?.trim() ? lesson.trim().slice(0, 500) : e.lesson,
  };
  list[i] = updated;
  saveFailures(list);
  return updated;
}

export function reopenFailure(id: string): FailureEntry | null {
  const list = loadFailures();
  const i = list.findIndex((e) => e.id === id);
  if (i < 0) return null;
  list[i] = { ...list[i]!, recovered: false, recoveredAt: undefined };
  saveFailures(list);
  return list[i]!;
}

export function deleteFailure(id: string) {
  saveFailures(loadFailures().filter((e) => e.id !== id));
}

export function updateFailure(
  id: string,
  patch: Partial<Pick<FailureEntry, "title" | "lesson" | "domain" | "severity">>
): FailureEntry | null {
  const list = loadFailures();
  const i = list.findIndex((e) => e.id === id);
  if (i < 0) return null;
  list[i] = { ...list[i]!, ...patch };
  saveFailures(list);
  return list[i]!;
}

function daysBetween(a: string, b: string): number {
  const da = new Date(`${a}T12:00:00`).getTime();
  const db = new Date(`${b}T12:00:00`).getTime();
  return Math.round((db - da) / 86400000);
}

export function computeSuccessMetrics(list?: FailureEntry[]): SuccessMetrics {
  const items = list || loadFailures();
  const total = items.length;
  const recovered = items.filter((e) => e.recovered).length;
  const open = total - recovered;
  const recoveryRate = total ? recovered / total : 1;

  const today = todayKey();
  const last7 = items.filter((e) => daysBetween(e.day, today) <= 7).length;
  const last30 = items.filter((e) => daysBetween(e.day, today) <= 30).length;

  const openItems = items.filter((e) => !e.recovered);
  const avgOpenSeverity = openItems.length
    ? openItems.reduce((s, e) => s + e.severity, 0) / openItems.length
    : 0;

  const byDomain = Object.fromEntries(
    FAILURE_DOMAINS.map((d) => [d.id, 0])
  ) as Record<FailureDomain, number>;
  for (const e of items) {
    byDomain[e.domain] = (byDomain[e.domain] || 0) + 1;
  }

  const latestDay = items[0]?.day;
  const quietDays = latestDay ? Math.max(0, daysBetween(latestDay, today)) : 0;

  // Success score: start 100, penalize open high-severity, reward recovery rate
  // Empty log → neutral 50 (no data, not fake perfect)
  let successScore = 50;
  if (total > 0) {
    successScore =
      40 * recoveryRate +
      30 * Math.max(0, 1 - avgOpenSeverity / 5) +
      20 * Math.max(0, 1 - Math.min(last7, 7) / 7) +
      10 * (open === 0 ? 1 : Math.max(0, 1 - open / Math.max(total, 1)));
    successScore = Math.round(Math.max(0, Math.min(100, successScore * 100) / 100));
    // fix scale: recoveryRate is 0-1, so 40*0.8=32 etc. Total max 100
    successScore = Math.round(
      40 * recoveryRate +
        30 * Math.max(0, 1 - avgOpenSeverity / 5) +
        20 * Math.max(0, 1 - Math.min(last7, 14) / 14) +
        10 * (open === 0 ? 1 : Math.max(0, 1 - open / Math.max(total, 1)))
    );
    successScore = Math.max(0, Math.min(100, successScore));
  }

  return {
    total,
    recovered,
    open,
    recoveryRate,
    last7,
    last30,
    avgOpenSeverity,
    byDomain,
    quietDays,
    successScore,
  };
}

export function formatFailuresBrief(): string {
  const m = computeSuccessMetrics();
  const open = loadFailures().filter((e) => !e.recovered).slice(0, 5);
  const lines = [
    `Failures desk · success score ${m.successScore}/100`,
    `Logged ${m.total} · recovered ${m.recovered} (${Math.round(m.recoveryRate * 100)}%) · open ${m.open}`,
    `Last 7d: ${m.last7} · last 30d: ${m.last30}`,
  ];
  if (open.length) {
    lines.push("Open:");
    for (const e of open) {
      lines.push(`  · [${e.domain} s${e.severity}] ${e.title}`);
    }
  }
  return lines.join("\n");
}

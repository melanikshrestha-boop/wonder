/**
 * Decisions log (Intelligence V2 Phase B).
 * Compound memory: choices Melani makes with numbers, not chat vapor.
 */
export type Decision = {
  id: string;
  at: string;
  domain: "money" | "body" | "build" | "life" | "markets";
  question: string;
  choice: string;
  assumptions?: string;
  revisitAt?: string; // YYYY-MM-DD
  numbers?: { label: string; value: string }[];
};

const KEY = "wonder-decisions-v1";

function uid(): string {
  return `dec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function loadDecisions(): Decision[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as Decision[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveDecisions(list: Decision[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-200)));
  } catch {
    /* ignore */
  }
}

export function logDecision(input: {
  domain?: Decision["domain"];
  question: string;
  choice: string;
  assumptions?: string;
  revisitDays?: number;
  numbers?: { label: string; value: string }[];
}): Decision {
  const at = new Date().toISOString();
  let revisitAt: string | undefined;
  if (input.revisitDays && input.revisitDays > 0) {
    const d = new Date();
    d.setDate(d.getDate() + input.revisitDays);
    revisitAt = d.toISOString().slice(0, 10);
  }
  const row: Decision = {
    id: uid(),
    at,
    domain: input.domain || "money",
    question: input.question.trim().slice(0, 400),
    choice: input.choice.trim().slice(0, 400),
    assumptions: input.assumptions?.trim().slice(0, 400),
    revisitAt,
    numbers: input.numbers?.slice(0, 12),
  };
  const all = loadDecisions();
  all.push(row);
  saveDecisions(all);
  return row;
}

export function listDecisions(limit = 12, domain?: Decision["domain"]): Decision[] {
  let all = loadDecisions();
  if (domain) all = all.filter((d) => d.domain === domain);
  return all.slice(-limit).reverse();
}

/** Decisions whose revisitAt is today or earlier (Level 3 surface). */
export function dueDecisions(onDay: string = new Date().toISOString().slice(0, 10)): Decision[] {
  return loadDecisions()
    .filter((d) => d.revisitAt && d.revisitAt <= onDay)
    .sort((a, b) => (a.revisitAt || "").localeCompare(b.revisitAt || ""));
}

export function formatDecisions(list: Decision[]): string {
  if (!list.length) {
    return "No decisions logged yet. Say: decide money: keep Grok at $30 for 90 days (revisit 90).";
  }
  return list
    .map((d, i) => {
      const when = d.at.slice(0, 10);
      const rev = d.revisitAt ? ` · revisit ${d.revisitAt}` : "";
      const nums = d.numbers?.length
        ? `\n   ${d.numbers.map((n) => `${n.label}=${n.value}`).join(", ")}`
        : "";
      return `${i + 1}. [${d.domain}] ${when}${rev}\n   Q: ${d.question}\n   → ${d.choice}${
        d.assumptions ? `\n   assume: ${d.assumptions}` : ""
      }${nums}`;
    })
    .join("\n");
}

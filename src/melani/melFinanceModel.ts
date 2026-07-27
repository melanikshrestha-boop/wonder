/**
 * Quiet financial modeling for Mel — backbone, not a flashy desk.
 * Conservative 20s runway math: burn, save rate, months of optionality.
 */
import { listMetrics, logMetric, getMetric } from "./melMetrics";

const KEY = "wonder-mel-finance-model-v1";

export type FinanceModelState = {
  /** monthly burn you can live on (rent + food + basics) */
  monthlyBurn: number | null;
  /** monthly save / surplus */
  monthlySave: number | null;
  /** liquid cash / buffer */
  cash: number | null;
  /** income streams notes */
  notes: string;
  updatedAt: string;
};

export function loadFinanceModel(): FinanceModelState {
  return load();
}

function load(): FinanceModelState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      return {
        monthlyBurn: null,
        monthlySave: null,
        cash: null,
        notes: "",
        updatedAt: new Date().toISOString(),
      };
    }
    return { ...JSON.parse(raw) } as FinanceModelState;
  } catch {
    return {
      monthlyBurn: null,
      monthlySave: null,
      cash: null,
      notes: "",
      updatedAt: new Date().toISOString(),
    };
  }
}

function save(s: FinanceModelState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function setFinanceModel(patch: Partial<FinanceModelState>): FinanceModelState {
  const cur = load();
  const next: FinanceModelState = {
    ...cur,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  save(next);
  // Mirror into metric registry for scientist loop (backend)
  if (next.cash != null) {
    try {
      logMetric("cash", next.cash);
    } catch {
      /* ignore */
    }
  }
  if (next.monthlyBurn != null) {
    try {
      logMetric("monthly_burn", next.monthlyBurn);
    } catch {
      /* ignore */
    }
  }
  return next;
}

export function runwayMonths(s = load()): number | null {
  if (s.cash == null || s.monthlyBurn == null || s.monthlyBurn <= 0) return null;
  // if saving, effective burn is lower
  const netBurn = Math.max(0.01, s.monthlyBurn - (s.monthlySave || 0));
  if (s.monthlySave != null && s.monthlySave >= s.monthlyBurn) {
    // surplus — runway infinite for model purposes; report high
    return 999;
  }
  return s.cash / netBurn;
}

export function formatFinanceBrief(): string {
  const s = load();
  const rw = runwayMonths(s);
  const moneyMetrics = listMetrics().filter((m) => m.domain === "money");
  const lines = [
    "Finance backbone (quiet model)",
    s.cash != null ? `Cash buffer: $${s.cash.toLocaleString()}` : "Cash buffer: not set — set cash 5000",
    s.monthlyBurn != null
      ? `Monthly burn (basics): $${s.monthlyBurn.toLocaleString()}`
      : "Monthly burn: not set — set burn 2200",
    s.monthlySave != null
      ? `Monthly save/surplus: $${s.monthlySave.toLocaleString()}`
      : "Monthly save: not set — set save 400",
    rw != null
      ? rw >= 999
        ? "Runway: surplus mode (save ≥ burn) — optionality is the product"
        : `Runway: ~${rw.toFixed(1)} months at current burn`
      : "Runway: need cash + burn",
    "",
    "20s doctrine: live lean, stack optionality, fund ventures (YouTube + products).",
    "Not lifestyle inflation. One roof, real people, long game.",
    s.notes ? `Notes: ${s.notes}` : null,
    moneyMetrics.length
      ? `Money metrics: ${moneyMetrics.map((m) => m.id).join(", ")}`
      : null,
    "",
    "set cash 8000 · set burn 2400 · set save 500 · runway",
  ].filter(Boolean) as string[];
  return lines.join("\n");
}

export function tryFinanceModelCommand(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;

  if (/^(?:runway|finance\s+model|money\s+model|financial\s+model)$/i.test(t)) {
    return formatFinanceBrief();
  }

  const cash = t.match(/^set\s+cash\s+\$?(\d[\d,]*(?:\.\d+)?)\s*$/i);
  if (cash?.[1]) {
    const s = setFinanceModel({ cash: Number(cash[1].replace(/,/g, "")) });
    return formatFinanceBrief() + `\n\nUpdated cash → $${s.cash?.toLocaleString()}`;
  }

  const burn = t.match(/^set\s+burn\s+\$?(\d[\d,]*(?:\.\d+)?)\s*$/i);
  if (burn?.[1]) {
    setFinanceModel({ monthlyBurn: Number(burn[1].replace(/,/g, "")) });
    return formatFinanceBrief();
  }

  const saveM = t.match(/^set\s+save\s+\$?(\d[\d,]*(?:\.\d+)?)\s*$/i);
  if (saveM?.[1]) {
    setFinanceModel({ monthlySave: Number(saveM[1].replace(/,/g, "")) });
    return formatFinanceBrief();
  }

  if (/^set\s+finance\s+notes?\s*:?\s*(.+)$/i.test(t)) {
    const notes = t.replace(/^set\s+finance\s+notes?\s*:?\s*/i, "").trim();
    setFinanceModel({ notes });
    return formatFinanceBrief();
  }

  return null;
}

// silence unused if tree-shaken
void getMetric;

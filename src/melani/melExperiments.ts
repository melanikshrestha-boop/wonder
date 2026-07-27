/**
 * Mel experiment notebook — scientist loop:
 * hypothesis → metrics → protocol → result → keep|kill|iterate
 */
import { getMetric, listMetrics } from "./melMetrics";

const KEY = "wonder-mel-experiments-v1";

export type ExperimentMethod =
  | "crude-model"
  | "stat"
  | "rl"
  | "manual-protocol";

export type ExperimentVerdict = "keep" | "kill" | "iterate";

export type MelExperiment = {
  id: string;
  hypothesis: string;
  metrics: string[];
  method: ExperimentMethod;
  protocol: string;
  days?: number;
  result?: string;
  verdict?: ExperimentVerdict;
  createdAt: string;
  closedAt?: string;
  status: "open" | "closed";
};

type Store = {
  experiments: MelExperiment[];
  updatedAt: string;
};

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { experiments: [], updatedAt: new Date().toISOString() };
    const p = JSON.parse(raw) as Store;
    return {
      experiments: Array.isArray(p.experiments) ? p.experiments : [],
      updatedAt: p.updatedAt || new Date().toISOString(),
    };
  } catch {
    return { experiments: [], updatedAt: new Date().toISOString() };
  }
}

function save(s: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

function uid() {
  return `exp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function listExperiments(): MelExperiment[] {
  return load().experiments.slice().sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
}

export function getOpenExperiment(): MelExperiment | null {
  return listExperiments().find((e) => e.status === "open") || null;
}

export function startExperiment(input: {
  hypothesis: string;
  metrics?: string[];
  method?: ExperimentMethod;
  protocol?: string;
  days?: number;
}): MelExperiment {
  const store = load();
  // close previous open? keep multiple open allowed but surface latest
  const metricIds = (input.metrics || [])
    .map((m) => getMetric(m)?.id || m)
    .filter(Boolean);
  if (!metricIds.length && listMetrics().length === 0) {
    throw new Error(
      "No metrics registered. Add one first: add metric deep_sleep unit h"
    );
  }
  if (!metricIds.length) {
    throw new Error(
      "Name at least one metric. Example: experiment start better recovery metric sleep.hours days 14"
    );
  }
  const exp: MelExperiment = {
    id: uid(),
    hypothesis: input.hypothesis.trim(),
    metrics: metricIds,
    method: input.method || "manual-protocol",
    protocol: (input.protocol || "Track daily; compare series at end.").trim(),
    days: input.days,
    createdAt: new Date().toISOString(),
    status: "open",
  };
  store.experiments.unshift(exp);
  store.experiments = store.experiments.slice(0, 80);
  store.updatedAt = exp.createdAt;
  save(store);
  return exp;
}

export function closeExperiment(
  verdict: ExperimentVerdict,
  result: string,
  id?: string
): MelExperiment {
  const store = load();
  const exp =
    (id ? store.experiments.find((e) => e.id === id) : null) ||
    store.experiments.find((e) => e.status === "open");
  if (!exp) throw new Error("No open experiment. Start one first.");
  exp.verdict = verdict;
  exp.result = result.trim();
  exp.status = "closed";
  exp.closedAt = new Date().toISOString();
  store.updatedAt = exp.closedAt;
  save(store);
  return exp;
}

export function formatNotebook(): string {
  const all = listExperiments();
  if (!all.length) {
    return [
      "Lab notebook empty.",
      "Start: experiment start <hypothesis> metric <id> days 14",
      "Close: experiment result: <what happened> · keep|kill|iterate",
    ].join("\n");
  }
  return [
    `Lab notebook (${all.length})`,
    ...all.slice(0, 12).map((e, i) => {
      const head = `${i + 1}. [${e.status}] ${e.hypothesis}`;
      const meta = `   metrics: ${e.metrics.join(", ")} · ${e.method}${
        e.days ? ` · ${e.days}d` : ""
      }`;
      const tail = e.result
        ? `   → ${e.verdict || "?"} · ${e.result}`
        : "   (open)";
      return `${head}\n${meta}\n${tail}`;
    }),
  ].join("\n");
}

export function formatExperiment(e: MelExperiment): string {
  return [
    `Experiment ${e.id} [${e.status}]`,
    `Hypothesis: ${e.hypothesis}`,
    `Metrics: ${e.metrics.join(", ")}`,
    `Method: ${e.method}${e.days ? ` · ${e.days} days` : ""}`,
    `Protocol: ${e.protocol}`,
    e.result ? `Result: ${e.result}` : null,
    e.verdict ? `Verdict: ${e.verdict}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function tryExperimentCommand(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;

  if (/^(?:notebook|lab\s+notebook|list\s+experiments|experiments)$/i.test(t)) {
    return formatNotebook();
  }

  if (/^hypothesis\s*:?\s*(.+)$/i.test(t) && !/^experiment\b/i.test(t)) {
    const hyp = t.replace(/^hypothesis\s*:?\s*/i, "").trim();
    if (!hyp) return "hypothesis: <claim>";
    try {
      // default metric sleep if present
      const sleep = getMetric("sleep.hours");
      const metrics = sleep ? [sleep.id] : listMetrics().slice(0, 1).map((m) => m.id);
      if (!metrics.length) {
        return "Create a metric first: add metric sleep_hours unit h";
      }
      const exp = startExperiment({
        hypothesis: hyp,
        metrics,
        protocol: "Observe named metrics daily; close with experiment result.",
      });
      return formatExperiment(exp) + "\n\nClose later: experiment result: … · keep";
    } catch (e) {
      return e instanceof Error ? e.message : "Could not start.";
    }
  }

  // experiment start HYPOTHESIS metric ID [metric ID2] days N
  const start = t.match(
    /^experiment\s+start\s+(.+?)(?:\s+metric\s+(.+?))?(?:\s+days\s+(\d+))?\s*$/i
  );
  if (start?.[1]) {
    let hyp = start[1].trim();
    const metricChunk = start[2]?.trim();
    // if "metric" embedded in hyp without capture
    const inline = hyp.match(/^(.+?)\s+metric\s+(.+)$/i);
    let metrics: string[] = [];
    if (inline) {
      hyp = inline[1]!.trim();
      metrics = inline[2]!.split(/[,\s]+/).filter(Boolean);
    } else if (metricChunk) {
      metrics = metricChunk.split(/[,\s]+/).filter(Boolean);
    }
    try {
      const exp = startExperiment({
        hypothesis: hyp,
        metrics: metrics.length ? metrics : undefined,
        days: start[3] ? Number(start[3]) : undefined,
      });
      return formatExperiment(exp);
    } catch (e) {
      return e instanceof Error ? e.message : "Could not start experiment.";
    }
  }

  // experiment result: text · keep|kill|iterate
  const res = t.match(
    /^experiment\s+result\s*:?\s*(.+?)(?:\s*[·|]\s*|\s+)(keep|kill|iterate)\s*$/i
  );
  if (res?.[1] && res[2]) {
    try {
      const exp = closeExperiment(
        res[2].toLowerCase() as ExperimentVerdict,
        res[1].trim()
      );
      return formatExperiment(exp);
    } catch (e) {
      return e instanceof Error ? e.message : "Could not close experiment.";
    }
  }

  // experiment result: text (default iterate)
  const res2 = t.match(/^experiment\s+result\s*:?\s*(.+)$/i);
  if (res2?.[1]) {
    const body = res2[1].trim();
    const vMatch = body.match(/\b(keep|kill|iterate)\s*$/i);
    const verdict = (vMatch?.[1]?.toLowerCase() || "iterate") as ExperimentVerdict;
    const result = vMatch ? body.slice(0, vMatch.index).trim() : body;
    try {
      return formatExperiment(closeExperiment(verdict, result || body));
    } catch (e) {
      return e instanceof Error ? e.message : "Could not close experiment.";
    }
  }

  return null;
}

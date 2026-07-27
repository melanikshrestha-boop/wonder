/**
 * Mel metric registry — every series the scientist loop can name.
 * Manual metrics + bridges into existing Wonder stores (no wipe).
 */
import { todayKey } from "./data";
import { getMathProgress } from "./melMath";
import { loadSleepDay, sleepWeekDays } from "./sleepStore";

const KEY = "wonder-mel-metrics-v1";

export type MetricDomain =
  | "body"
  | "focus"
  | "money"
  | "wardrobe"
  | "math"
  | "custom";

export type MetricSource =
  | "manual"
  | "whoop"
  | "meals"
  | "finance"
  | "screen"
  | "sleep"
  | "math"
  | "formula";

export type MetricPoint = { t: string; v: number };

export type MelMetric = {
  id: string;
  name: string;
  unit: string;
  domain: MetricDomain;
  source: MetricSource;
  series: MetricPoint[];
  notes?: string;
  /** bridge id for auto-seeded metrics */
  bridge?: string;
  createdAt: string;
  updatedAt: string;
};

type Store = {
  metrics: MelMetric[];
  updatedAt: string;
};

function loadStore(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { metrics: [], updatedAt: new Date().toISOString() };
    const p = JSON.parse(raw) as Store;
    return {
      metrics: Array.isArray(p.metrics) ? p.metrics : [],
      updatedAt: p.updatedAt || new Date().toISOString(),
    };
  } catch {
    return { metrics: [], updatedAt: new Date().toISOString() };
  }
}

function saveStore(s: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48) || `m_${Date.now().toString(36)}`;
}

function readNumSeries(
  storageKey: string,
  pick: (raw: unknown) => MetricPoint[]
): MetricPoint[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    return pick(JSON.parse(raw)).filter(
      (p) => p && typeof p.t === "string" && Number.isFinite(p.v)
    );
  } catch {
    return [];
  }
}

/** Bridge sleep hours from sleep store week + full map */
function bridgeSleepHours(): MetricPoint[] {
  try {
    const days = sleepWeekDays();
    const fromWeek = days
      .map((d) => {
        const hours = loadSleepDay(d.iso).hours;
        return hours != null && Number.isFinite(hours)
          ? { t: d.iso, v: hours }
          : null;
      })
      .filter((p): p is MetricPoint => p != null);
    if (fromWeek.length) return fromWeek;
  } catch {
    /* fall through */
  }
  return readNumSeries("dr-melani-sleep-v1", (raw) => {
    if (!raw || typeof raw !== "object") return [];
    return Object.entries(raw as Record<string, { hours?: number | null }>)
      .map(([t, day]) => ({ t, v: Number(day?.hours) }))
      .filter((p) => Number.isFinite(p.v));
  });
}

function bridgeMathCompleted(): MetricPoint[] {
  try {
    const p = getMathProgress();
    return [
      {
        t: todayKey(),
        v: p.completed.length,
      },
    ];
  } catch {
    return [];
  }
}

function bridgeScreenMinutes(): MetricPoint[] {
  return readNumSeries("wonder-screentime-v1", (raw) => {
    const o = raw as { history?: Array<{ date?: string; minutes?: number; totalMin?: number }> };
    const hist = Array.isArray(o?.history) ? o.history : [];
    return hist.map((h) => ({
      t: String(h.date || ""),
      v: Number(h.minutes ?? h.totalMin ?? NaN),
    }));
  });
}

const SEED_BRIDGES: Array<Omit<MelMetric, "series" | "createdAt" | "updatedAt"> & {
  load: () => MetricPoint[];
}> = [
  {
    id: "sleep.hours",
    name: "Sleep hours",
    unit: "h",
    domain: "body",
    source: "sleep",
    bridge: "sleep",
    notes: "From Wonder sleep log",
    load: bridgeSleepHours,
  },
  {
    id: "math.lessons_completed",
    name: "Math lessons completed",
    unit: "count",
    domain: "math",
    source: "math",
    bridge: "math",
    notes: "Empire progress total",
    load: bridgeMathCompleted,
  },
  {
    id: "screen.minutes",
    name: "Screen time",
    unit: "min",
    domain: "focus",
    source: "screen",
    bridge: "screen",
    notes: "From screen time history when present",
    load: bridgeScreenMinutes,
  },
];

function ensureSeeds(store: Store): Store {
  const now = new Date().toISOString();
  let changed = false;
  const metrics = [...store.metrics];
  for (const seed of SEED_BRIDGES) {
    const idx = metrics.findIndex((m) => m.id === seed.id);
    const series = seed.load();
    if (idx < 0) {
      metrics.push({
        id: seed.id,
        name: seed.name,
        unit: seed.unit,
        domain: seed.domain,
        source: seed.source,
        bridge: seed.bridge,
        notes: seed.notes,
        series,
        createdAt: now,
        updatedAt: now,
      });
      changed = true;
    } else if (seed.bridge) {
      // Refresh bridge series; keep manual points if any mixed later
      const prev = metrics[idx]!;
      metrics[idx] = {
        ...prev,
        series: series.length ? series : prev.series,
        updatedAt: now,
      };
      changed = true;
    }
  }
  if (!changed) return store;
  const next = { metrics, updatedAt: now };
  saveStore(next);
  return next;
}

export function listMetrics(): MelMetric[] {
  const store = ensureSeeds(loadStore());
  return store.metrics.slice().sort((a, b) => a.name.localeCompare(b.name));
}

export function getMetric(idOrName: string): MelMetric | null {
  const q = idOrName.trim().toLowerCase();
  if (!q) return null;
  const all = listMetrics();
  return (
    all.find((m) => m.id === q) ||
    all.find((m) => m.id.endsWith(`.${q}`)) ||
    all.find((m) => m.name.toLowerCase() === q) ||
    all.find((m) => m.name.toLowerCase().includes(q)) ||
    null
  );
}

export function addMetric(input: {
  name: string;
  unit?: string;
  domain?: MetricDomain;
  notes?: string;
}): MelMetric {
  const store = ensureSeeds(loadStore());
  const name = input.name.trim();
  const id = `custom.${slug(name)}`;
  if (store.metrics.some((m) => m.id === id)) {
    throw new Error(`Metric already exists: ${id}`);
  }
  const now = new Date().toISOString();
  const metric: MelMetric = {
    id,
    name,
    unit: (input.unit || "count").trim(),
    domain: input.domain || "custom",
    source: "manual",
    series: [],
    notes: input.notes,
    createdAt: now,
    updatedAt: now,
  };
  store.metrics.push(metric);
  store.updatedAt = now;
  saveStore(store);
  return metric;
}

export function logMetric(
  idOrName: string,
  value: number,
  day = todayKey()
): MelMetric {
  if (!Number.isFinite(value)) throw new Error("Metric value must be a number");
  const store = ensureSeeds(loadStore());
  let m = store.metrics.find(
    (x) =>
      x.id === idOrName ||
      x.id === `custom.${slug(idOrName)}` ||
      x.name.toLowerCase() === idOrName.toLowerCase()
  );
  if (!m) {
    // auto-create manual metric
    m = {
      id: `custom.${slug(idOrName)}`,
      name: idOrName.trim(),
      unit: "count",
      domain: "custom",
      source: "manual",
      series: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    store.metrics.push(m);
  }
  const series = m.series.filter((p) => p.t !== day);
  series.push({ t: day, v: value });
  series.sort((a, b) => a.t.localeCompare(b.t));
  m.series = series.slice(-400);
  m.updatedAt = new Date().toISOString();
  store.updatedAt = m.updatedAt;
  saveStore(store);
  return m;
}

export function formatMetricsList(): string {
  const all = listMetrics();
  if (!all.length) return "No metrics yet. Say: add metric mood unit 1-10";
  const lines = all.map((m) => {
    const last = m.series[m.series.length - 1];
    const tail = last
      ? `last ${last.v}${m.unit ? m.unit : ""} @ ${last.t}`
      : "no points";
    return `• ${m.id} — ${m.name} (${m.domain}/${m.source}) · n=${m.series.length} · ${tail}`;
  });
  return [
    `Metrics (${all.length}) — Mel scientist registry`,
    ...lines,
    "",
    "log metric mood 7 · add metric deep_focus unit min · list metrics",
  ].join("\n");
}

export function formatMetricDetail(idOrName: string): string {
  const m = getMetric(idOrName);
  if (!m) return `No metric matches “${idOrName}”. Say: list metrics`;
  const recent = m.series.slice(-8);
  return [
    `${m.name} (${m.id})`,
    `unit ${m.unit} · ${m.domain} · ${m.source}`,
    m.notes || "",
    recent.length
      ? recent.map((p) => `  ${p.t}: ${p.v}`).join("\n")
      : "  (empty series)",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Parse Mel natural commands; null if not a metrics command. */
export function tryMetricsCommand(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;

  if (/^(?:list\s+metrics|metrics|metric\s+list)$/i.test(t)) {
    return formatMetricsList();
  }

  const show = t.match(/^(?:show|plot|metric)\s+metric\s+(.+)$/i)
    || t.match(/^metric\s+(.+)$/i);
  if (show?.[1] && !/^(list|add|log)\b/i.test(show[1])) {
    return formatMetricDetail(show[1].trim());
  }

  const add = t.match(
    /^add\s+metric\s+(.+?)(?:\s+unit\s+(\S+))?(?:\s+domain\s+(\w+))?$/i
  );
  if (add?.[1]) {
    try {
      const m = addMetric({
        name: add[1].trim(),
        unit: add[2],
        domain: (add[3] as MetricDomain) || "custom",
      });
      return `Added metric ${m.id} (${m.name}, unit ${m.unit}). Log with: log metric ${m.name} <value>`;
    } catch (e) {
      return e instanceof Error ? e.message : "Could not add metric.";
    }
  }

  const log = t.match(
    /^log\s+metric\s+(.+?)\s+(-?\d+(?:\.\d+)?)\s*$/i
  );
  if (log?.[1] && log[2] != null) {
    try {
      const m = logMetric(log[1].trim(), Number(log[2]));
      return `Logged ${m.name}: ${log[2]} ${m.unit} on ${todayKey()} (n=${m.series.length}).`;
    } catch (e) {
      return e instanceof Error ? e.message : "Could not log metric.";
    }
  }

  return null;
}

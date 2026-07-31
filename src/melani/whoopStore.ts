/**
 * Whoop RAW weekly export → full Wonder body ledger.
 *
 * Files: sleeps.csv · physiological_cycles.csv · workouts.csv · journal_entries.csv
 * Every column we see is stored. Sleep bed/wake still syncs to sleepStore.
 * 24/7 wear → weekly drop → thorough analysis in Fitness → Whoop.
 */
import {
  loadSleepDay as loadSleepDayLocal,
  saveSleepDay,
  sleepHours as sleepHoursFromHm,
} from "./sleepStore";
import { notifyHabitAutoSync } from "./habitAutoSync";

export const WHOOP_EVENT = "wonder-whoop-update";
export const WHOOP_KEY = "wonder-whoop-v2";
export const WEIGHT_KEY = "wonder-weight-log-v1";
/** Full weekly CSV text for Mel (separate key so store JSON stays lean). */
export const WHOOP_RAW_CSV_KEY = "wonder-whoop-raw-csv-v1";

// ── Types ──────────────────────────────────────────────────────────

export type WhoopSleep = {
  day: string;
  onset?: string;
  wake?: string;
  bedtimeHm?: string;
  wakeHm?: string;
  performancePct?: number | null;
  respiratoryRate?: number | null;
  asleepMin?: number | null;
  inBedMin?: number | null;
  lightMin?: number | null;
  deepMin?: number | null;
  remMin?: number | null;
  awakeMin?: number | null;
  needMin?: number | null;
  debtMin?: number | null;
  efficiencyPct?: number | null;
  consistencyPct?: number | null;
  nap?: boolean;
};

export type WhoopCycle = {
  day: string;
  cycleStart?: string;
  cycleEnd?: string;
  timezone?: string;
  recoveryPct?: number | null;
  rhrBpm?: number | null;
  hrvMs?: number | null;
  skinTempC?: number | null;
  spo2Pct?: number | null;
  dayStrain?: number | null;
  energyCal?: number | null;
  maxHr?: number | null;
  avgHr?: number | null;
  // Sleep fields sometimes live on the cycle row too
  sleep?: Partial<WhoopSleep>;
};

export type WhoopWorkout = {
  id: string;
  day: string;
  start?: string;
  end?: string;
  durationMin?: number | null;
  activity: string;
  strain?: number | null;
  energyCal?: number | null;
  maxHr?: number | null;
  avgHr?: number | null;
  zone1Pct?: number | null;
  zone2Pct?: number | null;
  zone3Pct?: number | null;
  zone4Pct?: number | null;
  zone5Pct?: number | null;
  gps?: boolean;
};

export type WhoopJournalAnswer = {
  day: string;
  question: string;
  yes: boolean | null;
  notes?: string;
  cycleStart?: string;
};

/** Day rollup — every metric we track for analysis */
export type WhoopDay = {
  day: string;
  // Convenience aliases used by Sleep panel
  bedtime?: string;
  wake?: string;
  sleepHours?: number | null;
  sleepScore?: number | null;
  hrvMs?: number | null;
  rhrBpm?: number | null;
  recoveryPct?: number | null;
  strain?: number | null;
  respiratoryRate?: number | null;
  // Full payload
  cycle?: WhoopCycle;
  sleep?: WhoopSleep;
  workouts: WhoopWorkout[];
  journal: WhoopJournalAnswer[];
  source: "whoop";
  importedAt: string;
};

export type WhoopStore = {
  version: 2;
  days: Record<string, WhoopDay>;
  workouts: WhoopWorkout[];
  journal: WhoopJournalAnswer[];
  lastImportAt: string | null;
  lastImportSummary: string | null;
  /** File names from last import */
  lastFiles: string[];
};

export type WeightEntry = {
  day: string;
  kg: number;
  note?: string;
  at: string;
};

export type MetricSeries = {
  key: string;
  label: string;
  unit: string;
  /** day → value, chronological */
  points: { day: string; value: number }[];
  avg: number | null;
  min: number | null;
  max: number | null;
  /** Most recent point value */
  latest: number | null;
  /** ISO day of latest point */
  latestDay: string | null;
  trend: "up" | "down" | "flat" | "na";
  /**
   * Optional regression overlay (Deep sleep).
   * fit = in-sample line; future = next 7 days forecast.
   */
  forecast?: {
    model: string;
    summary: string;
    formula: string;
    r2: number;
    fit: { day: string; value: number }[];
    future: { day: string; value: number }[];
    drivers?: {
      r2: number;
      formula: string;
      nextIfSameConditions: number;
      factors: string[];
    } | null;
    logistic?: {
      accuracy: number;
      thresholdMin: number;
      nextProb: number;
      formula: string;
    } | null;
    /** Tabular Q-learning tip from your history */
    rl?: {
      algorithm: string;
      actionLabel: string;
      tip: string;
      nTransitions: number;
      stateLabel: string;
    } | null;
  };
};

// Analytics lives in whoopAnalytics.ts (registry-driven). Re-export for callers.
import { buildWhoopAnalytics } from "./whoopAnalytics";
export type { WhoopAnalytics } from "./whoopAnalytics";
export { buildWhoopAnalytics };

// ── Store I/O ──────────────────────────────────────────────────

function emit() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(WHOOP_EVENT));
  }
}

function emptyStore(): WhoopStore {
  return {
    version: 2,
    days: {},
    workouts: [],
    journal: [],
    lastImportAt: null,
    lastImportSummary: null,
    lastFiles: [],
  };
}

/** In-memory cache — loadWhoopStore was re-parsing multi-MB JSON on every call. */
let whoopMem: WhoopStore | null = null;
let whoopMemRaw: string | null = null;

export function loadWhoopStore(): WhoopStore {
  try {
    const rawStr = localStorage.getItem(WHOOP_KEY);
    if (rawStr && rawStr === whoopMemRaw && whoopMem) return whoopMem;

    const raw = rawStr
      ? (JSON.parse(rawStr) as Partial<WhoopStore> | null)
      : null;
    // migrate v1
    if (!raw || typeof raw !== "object") {
      const legacy = JSON.parse(localStorage.getItem("wonder-whoop-days-v1") || "null") as {
        days?: Record<string, WhoopDay>;
        lastImportAt?: string | null;
        lastImportSummary?: string | null;
      } | null;
      if (legacy?.days) {
        const s = emptyStore();
        s.days = legacy.days;
        s.lastImportAt = legacy.lastImportAt || null;
        s.lastImportSummary = legacy.lastImportSummary || null;
        whoopMem = s;
        whoopMemRaw = rawStr;
        return s;
      }
      const empty = emptyStore();
      whoopMem = empty;
      whoopMemRaw = rawStr;
      return empty;
    }
    const store: WhoopStore = {
      version: 2,
      days: raw.days && typeof raw.days === "object" ? raw.days : {},
      workouts: Array.isArray(raw.workouts) ? raw.workouts : [],
      journal: Array.isArray(raw.journal) ? raw.journal : [],
      lastImportAt: raw.lastImportAt || null,
      lastImportSummary: raw.lastImportSummary || null,
      lastFiles: Array.isArray(raw.lastFiles) ? raw.lastFiles : [],
    };
    whoopMem = store;
    whoopMemRaw = rawStr;
    return store;
  } catch {
    const empty = emptyStore();
    whoopMem = empty;
    whoopMemRaw = null;
    return empty;
  }
}

export function saveWhoopStore(store: WhoopStore) {
  const json = JSON.stringify(store);
  localStorage.setItem(WHOOP_KEY, json);
  whoopMem = store;
  whoopMemRaw = json;
  emit();
}

export function loadRawWhoopCsv(): Record<string, string> {
  try {
    const raw = JSON.parse(
      localStorage.getItem(WHOOP_RAW_CSV_KEY) || "{}"
    ) as Record<string, string>;
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

/** Cache full CSV bodies so Mel receives entire exports, not only parsed rows. */
export function saveRawWhoopCsv(files: Array<{ name: string; text: string }>) {
  try {
    const cur = loadRawWhoopCsv();
    for (const f of files) {
      if (!f?.name || typeof f.text !== "string") continue;
      cur[f.name] = f.text.length > 400_000 ? f.text.slice(0, 400_000) : f.text;
    }
    localStorage.setItem(WHOOP_RAW_CSV_KEY, JSON.stringify(cur));
  } catch {
    /* quota */
  }
}

export function loadWhoopDay(day: string): WhoopDay | null {
  return loadWhoopStore().days[day] || null;
}

export function loadWeightLog(): WeightEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(WEIGHT_KEY) || "[]") as WeightEntry[];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function saveWeight(day: string, kg: number, note = ""): WeightEntry {
  const entry: WeightEntry = {
    day,
    kg: Math.round(kg * 100) / 100,
    note: note.trim() || undefined,
    at: new Date().toISOString(),
  };
  const list = loadWeightLog().filter((e) => e.day !== day);
  list.push(entry);
  list.sort((a, b) => (a.day < b.day ? 1 : -1));
  const next = list.slice(0, 400);
  localStorage.setItem(WEIGHT_KEY, JSON.stringify(next));
  // Data Guardian — mirror weight history to disk (never wipe prior days)
  try {
    void import("./agents/dataGuardian").then((g) => {
      g.pushGuardianKey(WEIGHT_KEY, next);
    });
  } catch {
    /* ignore */
  }
  emit();
  return entry;
}

// ── CSV ────────────────────────────────────────────────────────

export function parseCsv(text: string): Record<string, string>[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (cells[idx] || "").trim();
    });
    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQ = !inQ;
      continue;
    }
    if (c === "," && !inQ) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

function pick(row: Record<string, string>, names: string[]): string {
  for (const n of names) {
    const key = Object.keys(row).find((k) => k === n || k.includes(n));
    if (key && row[key]) return row[key];
  }
  return "";
}

function num(raw: string): number | null {
  if (!raw) return null;
  const n = Number(String(raw).replace(/[%,]/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function boolish(raw: string): boolean | null {
  if (!raw) return null;
  const t = raw.toLowerCase();
  if (t === "true" || t === "yes" || t === "1") return true;
  if (t === "false" || t === "no" || t === "0") return false;
  return null;
}

/** Parse Whoop datetime → local YYYY-MM-DD + HH:MM */
function parseWhen(raw: string): { day: string; hm: string; iso: string } | null {
  if (!raw) return null;
  // Whoop uses "2026-07-25 02:40:56" without T — Date parses as local
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) {
    const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return { day: m[1], hm: "00:00", iso: m[1] };
    return null;
  }
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return { day: `${y}-${mo}-${da}`, hm: `${hh}:${mm}`, iso: d.toISOString() };
}

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function ensureDay(store: WhoopStore, day: string): WhoopDay {
  if (!store.days[day]) {
    store.days[day] = {
      day,
      workouts: [],
      journal: [],
      source: "whoop",
      importedAt: new Date().toISOString(),
    };
  }
  return store.days[day];
}

function applySleepToDay(day: WhoopDay, sleep: WhoopSleep) {
  day.sleep = { ...day.sleep, ...sleep, day: day.day };
  day.bedtime = sleep.bedtimeHm || day.bedtime;
  day.wake = sleep.wakeHm || day.wake;
  day.sleepScore = sleep.performancePct ?? day.sleepScore;
  day.respiratoryRate = sleep.respiratoryRate ?? day.respiratoryRate;
  if (sleep.asleepMin != null) day.sleepHours = Math.round((sleep.asleepMin / 60) * 100) / 100;
}

function applyCycleToDay(day: WhoopDay, cycle: WhoopCycle) {
  day.cycle = { ...day.cycle, ...cycle, day: day.day };
  day.recoveryPct = cycle.recoveryPct ?? day.recoveryPct;
  day.hrvMs = cycle.hrvMs ?? day.hrvMs;
  day.rhrBpm = cycle.rhrBpm ?? day.rhrBpm;
  day.strain = cycle.dayStrain ?? day.strain;
  if (cycle.sleep) {
    day.sleep = { ...day.sleep, ...cycle.sleep, day: day.day } as WhoopSleep;
    if (cycle.sleep.performancePct != null) day.sleepScore = cycle.sleep.performancePct;
    if (cycle.sleep.asleepMin != null)
      day.sleepHours = Math.round((cycle.sleep.asleepMin / 60) * 100) / 100;
    if (cycle.sleep.bedtimeHm) day.bedtime = cycle.sleep.bedtimeHm;
    if (cycle.sleep.wakeHm) day.wake = cycle.sleep.wakeHm;
    if (cycle.sleep.respiratoryRate != null)
      day.respiratoryRate = cycle.sleep.respiratoryRate;
  }
}

// ── Import ─────────────────────────────────────────────────────

/**
 * Weekly Whoop export ingest (merge, never wipe).
 * Drop the four CSVs (or a folder export) each week — new nights append,
 * existing days update, workouts/journal de-dupe. Sleep clocks + graphs refresh.
 */
export function importWhoopCsvTexts(
  files: Array<{ name: string; text: string }>
): {
  daysUpdated: number;
  daysNew: number;
  sleepSynced: number;
  workouts: number;
  journal: number;
  summary: string;
} {
  const store = loadWhoopStore();
  const daysBefore = new Set(Object.keys(store.days));
  let sleepSynced = 0;
  let workoutCount = 0;
  let journalCount = 0;
  const touched = new Set<string>();
  const workoutIds = new Set(store.workouts.map((w) => w.id));

  for (const file of files) {
    const rows = parseCsv(file.text);
    if (!rows.length) continue;
    const name = file.name.toLowerCase();
    const kind = detectKind(name, rows[0]);

    if (kind === "sleeps") {
      for (const row of rows) {
        const sleep = parseSleepRow(row);
        if (!sleep) continue;
        // Skip naps for sleep-clock sync; still store if we want later — skip pure nap rows for day rollup sleep
        if (sleep.nap === true) continue;
        const day = ensureDay(store, sleep.day);
        applySleepToDay(day, sleep);
        day.importedAt = new Date().toISOString();
        if (sleep.bedtimeHm && sleep.wakeHm) {
          saveSleepDay(sleep.day, sleep.bedtimeHm, sleep.wakeHm);
          notifyHabitAutoSync(sleep.day);
          sleepSynced += 1;
        }
        touched.add(sleep.day);
      }
      continue;
    }

    if (kind === "cycles") {
      for (const row of rows) {
        const cycle = parseCycleRow(row);
        if (!cycle) continue;
        const day = ensureDay(store, cycle.day);
        applyCycleToDay(day, cycle);
        day.importedAt = new Date().toISOString();
        if (cycle.sleep?.bedtimeHm && cycle.sleep?.wakeHm && cycle.sleep.nap !== true) {
          saveSleepDay(cycle.day, cycle.sleep.bedtimeHm, cycle.sleep.wakeHm);
          notifyHabitAutoSync(cycle.day);
          sleepSynced += 1;
        }
        touched.add(cycle.day);
      }
      continue;
    }

    if (kind === "workouts") {
      for (const row of rows) {
        const w = parseWorkoutRow(row);
        if (!w) continue;
        // de-dupe by start+activity+duration (re-import same week is safe)
        const id =
          w.id ||
          `wo_${w.day}_${(w.start || "").replace(/\D/g, "")}_${w.activity}_${w.durationMin || 0}`;
        if (workoutIds.has(id)) continue;
        w.id = id;
        workoutIds.add(id);
        store.workouts.push(w);
        const day = ensureDay(store, w.day);
        day.workouts = [...(day.workouts || []).filter((x) => x.id !== id), w];
        day.importedAt = new Date().toISOString();
        touched.add(w.day);
        workoutCount += 1;
      }
      continue;
    }

    if (kind === "journal") {
      for (const row of rows) {
        const j = parseJournalRow(row);
        if (!j) continue;
        // de-dupe same day+question (latest import wins)
        store.journal = store.journal.filter(
          (x) => !(x.day === j.day && x.question === j.question)
        );
        store.journal.push(j);
        const day = ensureDay(store, j.day);
        day.journal = [
          ...(day.journal || []).filter((x) => x.question !== j.question),
          j,
        ];
        day.importedAt = new Date().toISOString();
        touched.add(j.day);
        journalCount += 1;
      }
    }
  }

  store.workouts.sort((a, b) => (a.start || a.day).localeCompare(b.start || b.day));
  store.journal.sort((a, b) => b.day.localeCompare(a.day));

  const daysUpdated = touched.size;
  let daysNew = 0;
  for (const d of touched) {
    if (!daysBefore.has(d)) daysNew += 1;
  }
  const daysRefreshed = daysUpdated - daysNew;
  const totalDays = Object.keys(store.days).length;

  const summary =
    daysUpdated === 0 && workoutCount === 0 && journalCount === 0
      ? "No Whoop rows found. Export the weekly folder: sleeps, physiological_cycles, workouts, journal_entries."
      : [
          daysNew > 0 ? `${daysNew} new day${daysNew === 1 ? "" : "s"}` : null,
          daysRefreshed > 0
            ? `${daysRefreshed} updated`
            : null,
          sleepSynced > 0 ? `${sleepSynced} sleep night${sleepSynced === 1 ? "" : "s"}` : null,
          workoutCount > 0
            ? `${workoutCount} new workout${workoutCount === 1 ? "" : "s"}`
            : null,
          journalCount > 0 ? `${journalCount} journal` : null,
          `total ${totalDays} days`,
        ]
          .filter(Boolean)
          .join(" · ");

  store.lastImportAt = new Date().toISOString();
  store.lastImportSummary = summary;
  store.lastFiles = files.map((f) => f.name);
  saveWhoopStore(store);
  // Full CSV text for Mel's live pack (raw files + parsed store)
  saveRawWhoopCsv(files);
  // Always mirror band onset/wake into Fitness → Sleep after merge
  syncAllWhoopSleepToSleepStore();

  return {
    daysUpdated,
    daysNew,
    sleepSynced,
    workouts: workoutCount,
    journal: journalCount,
    summary,
  };
}

function detectKind(
  name: string,
  sample: Record<string, string>
): "sleeps" | "cycles" | "workouts" | "journal" | "unknown" {
  if (name.includes("journal")) return "journal";
  if (name.includes("workout")) return "workouts";
  if (name.includes("sleep")) return "sleeps";
  if (name.includes("physio") || name.includes("cycle")) return "cycles";
  // header sniff
  const keys = Object.keys(sample).join(" ");
  if (keys.includes("question text") || keys.includes("answered yes")) return "journal";
  if (keys.includes("activity name") || keys.includes("workout start")) return "workouts";
  if (keys.includes("recovery score") || keys.includes("heart rate variability"))
    return "cycles";
  if (keys.includes("sleep onset") && keys.includes("nap")) return "sleeps";
  if (keys.includes("sleep onset")) return "sleeps";
  return "unknown";
}

function parseSleepRow(row: Record<string, string>): WhoopSleep | null {
  const onset = pick(row, ["sleep onset", "sleep start"]);
  const wake = pick(row, ["wake onset", "wake time", "wake"]);
  const startP = parseWhen(onset);
  const endP = parseWhen(wake);
  if (!startP && !endP) return null;
  // Whoop day = wake day when available
  const day = endP?.day || startP?.day;
  if (!day) return null;
  const asleepMin = num(pick(row, ["asleep duration (min)", "asleep duration"]));
  return {
    day,
    onset: onset || undefined,
    wake: wake || undefined,
    bedtimeHm: startP?.hm,
    wakeHm: endP?.hm,
    performancePct: num(pick(row, ["sleep performance %", "sleep performance"])),
    respiratoryRate: num(pick(row, ["respiratory rate (rpm)", "respiratory rate"])),
    asleepMin,
    inBedMin: num(pick(row, ["in bed duration (min)", "in bed duration"])),
    lightMin: num(pick(row, ["light sleep duration (min)", "light sleep"])),
    deepMin: num(pick(row, ["deep (sws) duration (min)", "deep (sws)", "deep sleep"])),
    remMin: num(pick(row, ["rem duration (min)", "rem duration"])),
    awakeMin: num(pick(row, ["awake duration (min)", "awake duration"])),
    needMin: num(pick(row, ["sleep need (min)", "sleep need"])),
    debtMin: num(pick(row, ["sleep debt (min)", "sleep debt"])),
    efficiencyPct: num(pick(row, ["sleep efficiency %", "sleep efficiency"])),
    consistencyPct: num(pick(row, ["sleep consistency %", "sleep consistency"])),
    nap: boolish(pick(row, ["nap"])) ?? false,
  };
}

function parseCycleRow(row: Record<string, string>): WhoopCycle | null {
  const cycleStart = pick(row, ["cycle start time", "cycle start"]);
  const when = parseWhen(cycleStart);
  // Recovery rows often date by cycle start; sleep rows on cycle use wake day
  const wake = parseWhen(pick(row, ["wake onset"]));
  const day = wake?.day || when?.day;
  if (!day) return null;

  const sleepOnset = pick(row, ["sleep onset"]);
  const sleepWake = pick(row, ["wake onset"]);
  const sStart = parseWhen(sleepOnset);
  const sEnd = parseWhen(sleepWake);
  const sleep: Partial<WhoopSleep> | undefined =
    sStart || sEnd
      ? {
          day,
          onset: sleepOnset || undefined,
          wake: sleepWake || undefined,
          bedtimeHm: sStart?.hm,
          wakeHm: sEnd?.hm,
          performancePct: num(pick(row, ["sleep performance %"])),
          respiratoryRate: num(pick(row, ["respiratory rate (rpm)", "respiratory rate"])),
          asleepMin: num(pick(row, ["asleep duration (min)"])),
          inBedMin: num(pick(row, ["in bed duration (min)"])),
          lightMin: num(pick(row, ["light sleep duration (min)"])),
          deepMin: num(pick(row, ["deep (sws) duration (min)"])),
          remMin: num(pick(row, ["rem duration (min)"])),
          awakeMin: num(pick(row, ["awake duration (min)"])),
          needMin: num(pick(row, ["sleep need (min)"])),
          debtMin: num(pick(row, ["sleep debt (min)"])),
          efficiencyPct: num(pick(row, ["sleep efficiency %"])),
          consistencyPct: num(pick(row, ["sleep consistency %"])),
        }
      : undefined;

  return {
    day,
    cycleStart: cycleStart || undefined,
    cycleEnd: pick(row, ["cycle end time"]) || undefined,
    timezone: pick(row, ["cycle timezone"]) || undefined,
    recoveryPct: num(pick(row, ["recovery score %", "recovery score"])),
    rhrBpm: num(pick(row, ["resting heart rate (bpm)", "resting heart rate"])),
    hrvMs: num(pick(row, ["heart rate variability (ms)", "heart rate variability"])),
    skinTempC: num(pick(row, ["skin temp (celsius)", "skin temp"])),
    spo2Pct: num(pick(row, ["blood oxygen %", "blood oxygen"])),
    dayStrain: num(pick(row, ["day strain", "strain"])),
    energyCal: num(pick(row, ["energy burned (cal)", "energy burned"])),
    maxHr: num(pick(row, ["max hr (bpm)", "max hr"])),
    avgHr: num(pick(row, ["average hr (bpm)", "average hr"])),
    sleep,
  };
}

function parseWorkoutRow(row: Record<string, string>): WhoopWorkout | null {
  const startRaw = pick(row, ["workout start time", "workout start"]);
  const start = parseWhen(startRaw);
  const endRaw = pick(row, ["workout end time", "workout end"]);
  const activity = pick(row, ["activity name", "activity"]) || "Activity";
  if (!start && !pick(row, ["duration (min)"])) return null;
  const day = start?.day || parseWhen(pick(row, ["cycle start time"]))?.day;
  if (!day) return null;
  return {
    id: uid("wo"),
    day,
    start: startRaw || undefined,
    end: endRaw || undefined,
    durationMin: num(pick(row, ["duration (min)", "duration"])),
    activity,
    strain: num(pick(row, ["activity strain", "strain"])),
    energyCal: num(pick(row, ["energy burned (cal)", "energy burned"])),
    maxHr: num(pick(row, ["max hr (bpm)", "max hr"])),
    avgHr: num(pick(row, ["average hr (bpm)", "average hr"])),
    zone1Pct: num(pick(row, ["hr zone 1 %", "zone 1"])),
    zone2Pct: num(pick(row, ["hr zone 2 %", "zone 2"])),
    zone3Pct: num(pick(row, ["hr zone 3 %", "zone 3"])),
    zone4Pct: num(pick(row, ["hr zone 4 %", "zone 4"])),
    zone5Pct: num(pick(row, ["hr zone 5 %", "zone 5"])),
    gps: boolish(pick(row, ["gps enabled"])) ?? false,
  };
}

function parseJournalRow(row: Record<string, string>): WhoopJournalAnswer | null {
  const q = pick(row, ["question text", "question"]);
  if (!q) return null;
  const start = parseWhen(pick(row, ["cycle start time", "cycle start"]));
  // Journal rows sometimes lack cycle start — attach to today of import is wrong;
  // leave day as start or "unknown" skip if no day
  const day = start?.day;
  if (!day) {
    // still keep with empty cycle — use a bucket? Skip empty-date journal noise
    // Some rows only have question+answer without date (header-like)
    if (!pick(row, ["answered yes"]) && !pick(row, ["notes"])) return null;
    return null;
  }
  return {
    day,
    question: q,
    yes: boolish(pick(row, ["answered yes", "answer", "yes"])),
    notes: pick(row, ["notes"]) || undefined,
    cycleStart: pick(row, ["cycle start time"]) || undefined,
  };
}

/**
 * Push every Whoop night’s sleep onset + wake into sleepStore
 * so Fitness → Sleep clocks and week chart use the real band times.
 */
export function syncAllWhoopSleepToSleepStore(): number {
  const store = loadWhoopStore();
  let n = 0;
  for (const day of Object.values(store.days)) {
    const bed = day.bedtime || day.sleep?.bedtimeHm || "";
    const wake = day.wake || day.sleep?.wakeHm || "";
    if (!bed || !wake) continue;
    // Skip pure naps if flagged (keep main night on the Sleep page)
    if (day.sleep?.nap === true) continue;
    // Skip unchanged nights — avoid N localStorage writes + undo noise on every open
    const prev = loadSleepDayLocal(day.day);
    if (prev.bedtime === bed && prev.wake === wake) continue;
    saveSleepDay(day.day, bed, wake);
    n += 1;
  }
  // Do not emit() here — callers already refresh UI; emit was re-entering import loops
  return n;
}

/** Bed / wake / hours for a calendar day — Whoop wins when present. */
export function resolveSleepForDay(iso: string): {
  bedtime: string;
  wake: string;
  hours: number | null;
  source: "whoop" | "manual" | "empty";
} {
  const w = loadWhoopDay(iso);
  const bed = (w?.bedtime || w?.sleep?.bedtimeHm || "").trim();
  const wake = (w?.wake || w?.sleep?.wakeHm || "").trim();
  if (bed && wake) {
    const hours =
      w?.sleepHours != null && Number.isFinite(w.sleepHours)
        ? w.sleepHours
        : sleepHoursFromHm(bed, wake);
    return { bedtime: bed, wake, hours, source: "whoop" };
  }
  const local = loadSleepDayLocal(iso);
  if (local.bedtime || local.wake) {
    return {
      bedtime: local.bedtime,
      wake: local.wake,
      hours: local.hours,
      source: "manual",
    };
  }
  return { bedtime: "", wake: "", hours: null, source: "empty" };
}

/** All nights with onset + wake (newest first) for Sleep page history. */
export function listWhoopSleepNights(limit = 60): Array<{
  day: string;
  bedtime: string;
  wake: string;
  hours: number | null;
  score: number | null;
}> {
  const store = loadWhoopStore();
  return Object.values(store.days)
    .map((d) => {
      const bedtime = (d.bedtime || d.sleep?.bedtimeHm || "").trim();
      const wake = (d.wake || d.sleep?.wakeHm || "").trim();
      if (!bedtime || !wake) return null;
      if (d.sleep?.nap === true) return null;
      return {
        day: d.day,
        bedtime,
        wake,
        hours:
          d.sleepHours != null
            ? d.sleepHours
            : sleepHoursFromHm(bedtime, wake),
        score: d.sleepScore ?? d.sleep?.performancePct ?? null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
    .sort((a, b) => b.day.localeCompare(a.day))
    .slice(0, limit);
}

/** Auto-load CSVs from /whoop/latest/ (public folder) if present. */
export async function importWhoopFromPublicLatest(): Promise<{
  ok: boolean;
  summary: string;
}> {
  const names = [
    "physiological_cycles.csv",
    "sleeps.csv",
    "workouts.csv",
    "journal_entries.csv",
  ];
  const files: Array<{ name: string; text: string }> = [];
  // Parallel fetch; allow browser cache (was no-store = slow every Sleep open)
  await Promise.all(
    names.map(async (name) => {
      try {
        const res = await fetch(`/whoop/latest/${name}`, { cache: "force-cache" });
        if (!res.ok) return;
        files.push({ name, text: await res.text() });
      } catch {
        /* skip */
      }
    })
  );
  if (!files.length) {
    return { ok: false, summary: "No /whoop/latest CSVs found" };
  }
  const result = importWhoopCsvTexts(files);
  // importWhoopCsvTexts already writes each night; re-sync covers edge merges
  const synced = syncAllWhoopSleepToSleepStore();
  return {
    ok: result.daysUpdated > 0 || result.workouts > 0,
    summary:
      synced > 0
        ? `${result.summary} · sleep times → ${synced} nights`
        : result.summary,
  };
}

export function exportWhoopJson(): string {
  const store = loadWhoopStore();
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      store,
      analytics: buildWhoopAnalytics(store),
    },
    null,
    2
  );
}

/** Merge Whoop + weight + meals into a short coach brief for Mel / UI. */
export function buildBodyIntelligenceBrief(day: string): string {
  const w = loadWhoopDay(day);
  const weights = loadWeightLog();
  const weight = weights.find((e) => e.day === day) || weights[0];
  let mealsLogged = 0;
  try {
    const raw = JSON.parse(
      localStorage.getItem(`dr-melani-meals-usuals:${day}`) || "null"
    ) as { loggedIds?: string[] } | null;
    mealsLogged = raw?.loggedIds?.length || 0;
  } catch {
    /* empty */
  }

  const lines: string[] = [`Body intelligence · ${day}`];
  if (w) {
    if (w.recoveryPct != null) lines.push(`Recovery ${Math.round(w.recoveryPct)}%`);
    if (w.hrvMs != null) lines.push(`HRV ${Math.round(w.hrvMs)} ms`);
    if (w.rhrBpm != null) lines.push(`RHR ${Math.round(w.rhrBpm)} bpm`);
    if (w.strain != null) lines.push(`Strain ${w.strain}`);
    if (w.sleepScore != null) lines.push(`Sleep score ${Math.round(w.sleepScore)}`);
    if (w.sleepHours != null) lines.push(`Sleep ${w.sleepHours}h`);
    if (w.sleep?.deepMin != null) lines.push(`Deep ${w.sleep.deepMin}m`);
    if (w.sleep?.remMin != null) lines.push(`REM ${w.sleep.remMin}m`);
    if (w.workouts?.length)
      lines.push(
        `Workouts ${w.workouts.length}: ${w.workouts.map((x) => x.activity).join(", ")}`
      );
    if (w.journal?.length) {
      const yes = w.journal.filter((j) => j.yes).map((j) => j.question);
      if (yes.length) lines.push(`Journal yes: ${yes.join("; ")}`);
    }
  } else {
    lines.push("No Whoop day yet — import weekly CSV.");
  }
  if (weight) lines.push(`Weight ${weight.kg} kg`);
  if (mealsLogged) lines.push(`Meals logged ${mealsLogged}`);
  return lines.join("\n");
}

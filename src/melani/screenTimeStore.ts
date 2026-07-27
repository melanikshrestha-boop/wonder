/**
 * Screen Time desk store — Mac (auto via /api/screentime) + phone (manual / import).
 * Local only. Your life metrics, not Apple's Settings UI.
 */

const KEY = "wonder-screentime-v1";
const PHONE_KEY = "wonder-screentime-phone-v1";
/** Forever day-by-day Mac hours — never wiped when you change 7/30/60 range */
const HISTORY_KEY = "wonder-screentime-history-v1";
/** Always pull the longest window the API allows, then merge into history */
export const SYNC_DAYS = 120;

export type ScreenDevice = "mac" | "phone" | "combined";

export type DayApp = {
  bundle: string;
  name: string;
  seconds: number;
  human: string;
  share: number;
  hours?: number;
  device?: string;
  is_safari?: boolean;
};

export type WebsiteRow = {
  domain: string;
  seconds: number;
  human: string;
  hours: number;
  share: number;
};

export type DayRow = {
  date: string;
  total_seconds: number;
  total_human: string;
  apps: DayApp[];
  device?: string;
  device_label?: string;
  intervals?: number;
};

export type SeriesPoint = {
  date: string;
  seconds: number;
  hours: number;
};

export type MacExport = {
  ok?: boolean;
  generated_at?: string;
  source?: string;
  truth?: { mac?: string; iphone?: string; ipad?: string };
  series?: {
    mac_hours: SeriesPoint[];
    phone_hours: SeriesPoint[];
    combined_hours: SeriesPoint[];
  };
  days?: DayRow[];
  apps_all?: DayApp[];
  websites?: WebsiteRow[];
  min_seconds?: number;
  totals?: {
    mac_seconds: number;
    mac_human: string;
    phone_seconds: number;
    phone_human: string;
    combined_seconds: number;
    combined_human: string;
  };
  disk?: {
    free_human: string;
    used_human: string;
    total_human: string;
    used_pct: number;
  };
  iphone_storage?: {
    connected?: boolean;
    free_human?: string | null;
    total_human?: string | null;
    detail?: string;
    name?: string;
  };
  storage?: {
    mac_available?: boolean;
    iphone_available?: boolean;
  };
  error?: string;
  detail?: string;
};

/** Manual phone day: total seconds + optional per-app notes */
export type PhoneDay = {
  date: string;
  seconds: number;
  note?: string;
  /** optional breakdown you typed */
  apps?: { name: string; seconds: number }[];
};

export type PhoneLog = {
  version: 1;
  days: PhoneDay[];
};

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadPhoneLog(): PhoneLog {
  const v = loadJson<PhoneLog>(PHONE_KEY, { version: 1, days: [] });
  return { version: 1, days: Array.isArray(v.days) ? v.days : [] };
}

export function savePhoneLog(log: PhoneLog) {
  localStorage.setItem(PHONE_KEY, JSON.stringify(log));
}

export function upsertPhoneDay(day: PhoneDay) {
  const log = loadPhoneLog();
  const rest = log.days.filter((d) => d.date !== day.date);
  rest.push(day);
  rest.sort((a, b) => a.date.localeCompare(b.date));
  savePhoneLog({ version: 1, days: rest });
  return rest;
}

export type MacDayHistory = {
  version: 1;
  /** date → seconds (only real knowledge / merged days) */
  macSeconds: Record<string, number>;
  updatedAt: string;
};

export function loadMacHistory(): MacDayHistory {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return { version: 1, macSeconds: {}, updatedAt: new Date().toISOString() };
    const p = JSON.parse(raw) as Partial<MacDayHistory>;
    return {
      version: 1,
      macSeconds:
        p.macSeconds && typeof p.macSeconds === "object" ? p.macSeconds : {},
      updatedAt: p.updatedAt || new Date().toISOString(),
    };
  } catch {
    return { version: 1, macSeconds: {}, updatedAt: new Date().toISOString() };
  }
}

function saveMacHistory(h: MacDayHistory) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
  } catch {
    /* quota */
  }
}

/**
 * Merge API points into forever history.
 * Never delete old days. Prefer higher seconds if a day is re-exported fuller.
 * Do not write 0 over a day that already has real seconds.
 */
export function mergeMacHistoryFromSeries(points: SeriesPoint[] | undefined): MacDayHistory {
  const h = loadMacHistory();
  for (const p of points || []) {
    if (!p?.date || !Number.isFinite(p.seconds)) continue;
    const prev = h.macSeconds[p.date] ?? 0;
    const next = Math.max(0, Math.round(p.seconds));
    // Keep the richer reading; never clobber real use with a zero pad
    if (next > 0 || prev === 0) {
      h.macSeconds[p.date] = Math.max(prev, next);
    }
  }
  h.updatedAt = new Date().toISOString();
  saveMacHistory(h);
  return h;
}

export function cacheMacExport(data: MacExport) {
  try {
    // Persist forever series first
    mergeMacHistoryFromSeries(data.series?.mac_hours);
    // Also fold days[] totals if series missing
    if (data.days?.length) {
      mergeMacHistoryFromSeries(
        data.days.map((d) => ({
          date: d.date,
          seconds: d.total_seconds || 0,
          hours: +((d.total_seconds || 0) / 3600).toFixed(2),
        }))
      );
    }
    localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* quota */
  }
}

export function loadCachedMacExport(): MacExport | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data?: MacExport };
    return parsed.data || null;
  } catch {
    return null;
  }
}

/** How many calendar days of Mac history we actually hold (first→last real day). */
export function macHistorySpanDays(): number {
  const dates = Object.keys(loadMacHistory().macSeconds)
    .filter((d) => (loadMacHistory().macSeconds[d] ?? 0) > 0)
    .sort();
  if (dates.length < 2) return dates.length;
  const a = new Date(`${dates[0]}T12:00:00`).getTime();
  const b = new Date(`${dates[dates.length - 1]}T12:00:00`).getTime();
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

export function firstMacDataDay(): string | null {
  const dates = Object.keys(loadMacHistory().macSeconds)
    .filter((d) => (loadMacHistory().macSeconds[d] ?? 0) > 0)
    .sort();
  return dates[0] || null;
}

export async function fetchMacScreenTime(days = SYNC_DAYS): Promise<MacExport> {
  // Always ask for the long window so history can grow; UI trims the chart.
  const n = Math.max(days, SYNC_DAYS);
  const res = await fetch(`/api/screentime?days=${n}`, {
    headers: { Accept: "application/json" },
  });
  const data = (await res.json()) as MacExport;
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || data.detail || `HTTP ${res.status}`);
  }
  cacheMacExport(data);
  return data;
}

function dayKeyOffset(today: Date, offset: number): string {
  const d = new Date(today);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - offset);
  return d.toISOString().slice(0, 10);
}

/**
 * Build chart series for the last `days` calendar days, but:
 * - Prefer forever Mac history over a single API snapshot
 * - Do NOT invent a flat zero line before the first day we ever had data
 *   (that made 30d and 60d look identical with a dead left half)
 */
export function mergeSeries(
  mac: SeriesPoint[] | undefined,
  phoneLog: PhoneLog,
  days: number
): {
  mac: SeriesPoint[];
  phone: SeriesPoint[];
  combined: SeriesPoint[];
  /** First date on the chart (after trim) */
  from: string | null;
  /** Days of real Mac history stored forever */
  historyDays: number;
} {
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  // Merge latest API into forever map, then read it
  if (mac?.length) mergeMacHistoryFromSeries(mac);
  const hist = loadMacHistory().macSeconds;
  const apiMap = new Map((mac || []).map((p) => [p.date, p.seconds]));
  const phoneMap = new Map(phoneLog.days.map((d) => [d.date, d.seconds]));

  // Earliest day we have any real Mac OR phone signal (ever)
  let firstReal: string | null = null;
  const allDates = new Set([
    ...Object.keys(hist),
    ...[...apiMap.keys()],
    ...[...phoneMap.keys()],
  ]);
  for (const d of [...allDates].sort()) {
    const m = hist[d] ?? apiMap.get(d) ?? 0;
    const p = phoneMap.get(d) ?? 0;
    if (m > 0 || p > 0) {
      firstReal = d;
      break;
    }
  }

  const windowStart = dayKeyOffset(today, Math.max(0, days - 1));
  // Chart starts at the later of: window start, first real data day
  let start = windowStart;
  if (firstReal && firstReal > windowStart) start = firstReal;
  // If no data at all, still show a short empty window (today only)
  if (!firstReal) start = dayKeyOffset(today, 0);

  const macOut: SeriesPoint[] = [];
  const phoneOut: SeriesPoint[] = [];
  const combined: SeriesPoint[] = [];

  // Iterate from start → today
  const startMs = new Date(`${start}T12:00:00`).getTime();
  const endMs = today.getTime();
  for (let t = startMs; t <= endMs; t += 86400000) {
    const d = new Date(t);
    const key = d.toISOString().slice(0, 10);
    const mSec = Math.max(hist[key] ?? 0, apiMap.get(key) ?? 0);
    const pSec = phoneMap.get(key) ?? 0;
    macOut.push({ date: key, seconds: mSec, hours: +(mSec / 3600).toFixed(2) });
    phoneOut.push({ date: key, seconds: pSec, hours: +(pSec / 3600).toFixed(2) });
    const c = mSec + pSec;
    combined.push({ date: key, seconds: c, hours: +(c / 3600).toFixed(2) });
  }

  const positiveMacDays = Object.values(hist).filter((s) => s > 0).length;

  return {
    mac: macOut,
    phone: phoneOut,
    combined,
    from: macOut[0]?.date ?? null,
    historyDays: positiveMacDays,
  };
}

export function fmtHours(seconds: number): string {
  const sec = Math.max(0, Math.round(seconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

export function parseHoursInput(raw: string): number {
  const t = raw.trim().toLowerCase();
  if (!t) return 0;
  // "5h 20m" | "5.5" | "320" (minutes if integer small?) | "5h20m"
  const hm = t.match(/^(\d+(?:\.\d+)?)\s*h(?:ours?)?\s*(\d+)?\s*m?/);
  if (hm) {
    const h = parseFloat(hm[1]);
    const m = hm[2] ? parseInt(hm[2], 10) : 0;
    return h * 3600 + m * 60;
  }
  const onlyM = t.match(/^(\d+)\s*m/);
  if (onlyM) return parseInt(onlyM[1], 10) * 60;
  const n = parseFloat(t);
  if (!Number.isFinite(n)) return 0;
  // bare number = hours
  return n * 3600;
}

/**
 * Sleep storage + helpers.
 * One night = bedtime + wake for a calendar day (local YYYY-MM-DD).
 * Overnight is normal (e.g. 23:00 → 07:00). Graph reads these hours.
 */
import { todayKey } from "./data";
import { pushUndo } from "../undoStack";
import {
  BOWEL_HISTORY_ARCHIVE,
  FOG_HISTORY_ARCHIVE,
  mergeBowelDetailPreferRicher,
  mergeFogPreferKnown,
} from "./bowelHistoryArchive";

export const SLEEP_KEY = "dr-melani-sleep-v1";
export const FOG_KEY = "dr-melani-brainfog-v1";
/** UI reloads fog map after global **U** undo */
export const FOG_EXTERNAL_RESTORE_EVENT = "wonder-fog-external-restore";
export const SLEEP_EXTERNAL_RESTORE_EVENT = "wonder-sleep-external-restore";

/** Day → true = had a bowel movement that day */
export const BOWEL_KEY = "dr-melani-bowel-v1";
export const BOWEL_EXTERNAL_RESTORE_EVENT = "wonder-bowel-external-restore";

export type SleepDay = {
  bedtime: string; // HH:MM (24h from <input type="time">)
  wake: string; // HH:MM
  hours: number | null;
};

/** Minutes from midnight for HH:MM (or HH:MM:SS) */
function toMins(t: string): number | null {
  if (!t || typeof t !== "string") return null;
  const parts = t.trim().split(":").map(Number);
  if (parts.length < 2) return null;
  const [h, m] = parts;
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

/** Duration in minutes from bed→wake (adds 24h when wake is “earlier” = overnight) */
function spanMins(bedM: number, wakeM: number): number {
  let mins = wakeM - bedM;
  if (mins <= 0) mins += 24 * 60;
  return mins;
}

function inNightRange(mins: number): boolean {
  return mins >= 60 && mins <= 16 * 60; // 1h–16h
}

/**
 * Sleep length in hours.
 * - Overnight OK: 23:00 → 07:00 = 8h
 * - If span is absurd (e.g. 01:00 → 23:00 = 22h), try fixing common mix-ups:
 *   1) flip wake AM/PM  2) flip bed AM/PM  3) swap bed↔wake
 * - Valid range: 1.0–16.0 hours so the weekly line can plot real nights
 */
export function sleepHours(bed: string, wake: string): number | null {
  if (!bed || !wake) return null;
  const b = toMins(bed);
  const w = toMins(wake);
  if (b == null || w == null) return null;

  const candidates: number[] = [];
  const push = (mins: number) => {
    if (inNightRange(mins)) candidates.push(mins);
  };

  push(spanMins(b, w));

  // Common: wake set to 11:00 PM instead of 11:00 AM
  const wakeFlip = (w + 12 * 60) % (24 * 60);
  push(spanMins(b, wakeFlip));

  // Common: bed set to 1:00 AM when they meant 1:00 PM (less common) or 11 PM typo path
  const bedFlip = (b + 12 * 60) % (24 * 60);
  push(spanMins(bedFlip, w));

  // Swapped fields
  push(spanMins(w, b));

  if (!candidates.length) return null;

  // Prefer a “normal night” (~6–10h) when several options work
  candidates.sort((a, c) => {
    const score = (m: number) => {
      const h = m / 60;
      if (h >= 6 && h <= 10) return 0;
      if (h >= 5 && h <= 12) return 1;
      return 2;
    };
    const ds = score(a) - score(c);
    if (ds !== 0) return ds;
    // closer to 8h wins
    return Math.abs(a - 8 * 60) - Math.abs(c - 8 * 60);
  });

  const mins = candidates[0];
  return Math.round((mins / 60) * 10) / 10;
}

export function loadSleepDay(iso: string): SleepDay {
  try {
    const raw = localStorage.getItem(`${SLEEP_KEY}:${iso}`);
    if (raw) {
      const d = JSON.parse(raw) as Partial<SleepDay>;
      const bedtime = d.bedtime || "";
      const wake = d.wake || "";
      // Always recompute hours so math fixes apply to old saves
      return {
        bedtime,
        wake,
        hours: sleepHours(bedtime, wake),
      };
    }
  } catch {
    /* ignore */
  }
  return { bedtime: "", wake: "", hours: null };
}

let sleepUndoQuiet = false;

export function saveSleepDay(iso: string, bedtime: string, wake: string) {
  const hours = sleepHours(bedtime, wake);
  const payload: SleepDay = { bedtime, wake, hours };
  const key = `${SLEEP_KEY}:${iso}`;
  try {
    if (!sleepUndoQuiet && typeof window !== "undefined") {
      const prevRaw = localStorage.getItem(key);
      const nextRaw = JSON.stringify(payload);
      if (prevRaw !== nextRaw) {
        const previous = prevRaw;
        pushUndo("Sleep", () => {
          sleepUndoQuiet = true;
          try {
            if (previous == null) localStorage.removeItem(key);
            else localStorage.setItem(key, previous);
            window.dispatchEvent(
              new CustomEvent(SLEEP_EXTERNAL_RESTORE_EVENT, {
                detail: { iso },
              })
            );
          } finally {
            sleepUndoQuiet = false;
          }
        });
      }
    }
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
  return payload;
}

/** Sat → Fri week containing `from` (matches brain-fog week row) */
export function sleepWeekDays(from: Date = new Date()): {
  iso: string;
  short: string;
  label: string;
}[] {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const day = d.getDay(); // 0=Sun … 6=Sat
  const back = (day + 1) % 7; // days back to Saturday
  const sat = new Date(d);
  sat.setDate(d.getDate() - back);
  const shorts = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];
  const out: { iso: string; short: string; label: string }[] = [];
  for (let i = 0; i < 7; i++) {
    const x = new Date(sat);
    x.setDate(sat.getDate() + i);
    const iso = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
    out.push({
      iso,
      short: shorts[i],
      label: x.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    });
  }
  return out;
}

/**
 * Hours for each day of the week.
 * Live day uses typed bed/wake; other days use storage.
 * Optional `hoursForDay` lets callers inject Whoop asleep hours.
 */
export function weekSleepHours(
  weekIsos: string[],
  todayIso: string,
  todayBed: string,
  todayWake: string,
  hoursForDay?: (iso: string) => number | null | undefined
): (number | null)[] {
  return weekIsos.map((iso) => {
    if (iso === todayIso) {
      const live = sleepHours(todayBed, todayWake);
      if (live != null) return live;
      const fromWhoop = hoursForDay?.(iso);
      if (fromWhoop != null && Number.isFinite(fromWhoop)) return fromWhoop;
      return loadSleepDay(iso).hours;
    }
    const fromWhoop = hoursForDay?.(iso);
    if (fromWhoop != null && Number.isFinite(fromWhoop)) return fromWhoop;
    return loadSleepDay(iso).hours;
  });
}

/** HH:MM (24h) → "12:28 a.m." for display */
export function formatHm12(hm: string): string {
  if (!hm || !hm.includes(":")) return "—";
  const [hs, ms] = hm.split(":");
  let h = Number(hs);
  const m = Number(ms);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hm;
  const ap = h >= 12 ? "p.m." : "a.m.";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, "0")} ${ap}`;
}

/** Coerce stored fog values to real booleans (old bad writes, string "true", etc.). */
function normalizeFogMap(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, boolean> = {};
  for (const [day, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    if (v === true || v === 1 || v === "true" || v === "yes" || v === "1") {
      out[day] = true;
    } else if (
      v === false ||
      v === 0 ||
      v === "false" ||
      v === "no" ||
      v === "0"
    ) {
      out[day] = false;
    }
  }
  return out;
}

export function loadFogMap(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(FOG_KEY);
    if (raw) return normalizeFogMap(JSON.parse(raw));
  } catch {
    /* ignore */
  }
  return {};
}

/**
 * Brain fog write window (local clock):
 * - Only calendar *today* is ever writable.
 * - Free to change Yes ↔ No until 11:59 PM local.
 * - At 11:59 PM and after, today's answer locks (final for that day).
 * - Past days are immutable history. Future days are closed.
 */
export const FOG_LOCK_HOUR = 23;
export const FOG_LOCK_MINUTE = 59;

export function isFogDayWritable(
  day: string,
  now: Date = new Date()
): boolean {
  // Build "today" from the same clock we lock against
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const today = `${y}-${m}-${d}`;
  if (day !== today) return false;
  const mins = now.getHours() * 60 + now.getMinutes();
  const lockMins = FOG_LOCK_HOUR * 60 + FOG_LOCK_MINUTE;
  // Writable while clock is strictly before 11:59 PM
  return mins < lockMins;
}

/** ms until fog lock today, or 0 if already locked / not today. */
export function msUntilFogLock(now: Date = new Date()): number {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const lockAt = new Date(y, m, d, FOG_LOCK_HOUR, FOG_LOCK_MINUTE, 0, 0);
  return Math.max(0, lockAt.getTime() - now.getTime());
}

/**
 * Set brain fog for one calendar day and persist immediately.
 * Pass `null` to clear that day (un-log). Refuses writes after 11:59 PM lock.
 */
export function setFogDay(
  day: string,
  value: boolean | null,
  now: Date = new Date()
): Record<string, boolean> {
  const current = loadFogMap();
  if (!isFogDayWritable(day, now)) {
    // Locked — return map unchanged (UI should disable; Mel must not rewrite history)
    return current;
  }
  const next = { ...current };
  if (value === null) delete next[day];
  else next[day] = value;
  saveFogMap(next);
  return next;
}

let fogUndoQuiet = false;
let fogLastJson: string | null = null;

/** Call once after loading so the first fog edit has a clean undo baseline */
export function seedFogUndoBaseline(map?: Record<string, boolean>) {
  try {
    fogLastJson = JSON.stringify(map ?? loadFogMap());
  } catch {
    fogLastJson = "{}";
  }
}

/**
 * Save brain-fog week map. Pushes global **U** undo so toggling T/W days
 * can be reversed by pressing U (twice undoes last two toggles).
 */
export function saveFogMap(map: Record<string, boolean>) {
  try {
    const json = JSON.stringify(map);
    if (
      !fogUndoQuiet &&
      fogLastJson != null &&
      fogLastJson !== json &&
      typeof window !== "undefined"
    ) {
      const previousJson = fogLastJson;
      pushUndo("Brain fog", () => {
        fogUndoQuiet = true;
        try {
          localStorage.setItem(FOG_KEY, previousJson);
          fogLastJson = previousJson;
          const restored = JSON.parse(previousJson) as Record<string, boolean>;
          window.dispatchEvent(
            new CustomEvent(FOG_EXTERNAL_RESTORE_EVENT, { detail: restored })
          );
        } finally {
          fogUndoQuiet = false;
        }
      });
    }
    localStorage.setItem(FOG_KEY, json);
    fogLastJson = json;
  } catch {
    /* ignore */
  }
}

export function loadBowelMap(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(BOWEL_KEY);
    if (raw) return JSON.parse(raw) as Record<string, boolean>;
  } catch {
    /* ignore */
  }
  return {};
}

let bowelUndoQuiet = false;
let bowelLastJson: string | null = null;

export function seedBowelUndoBaseline(map?: Record<string, boolean>) {
  try {
    bowelLastJson = JSON.stringify(map ?? loadBowelMap());
  } catch {
    bowelLastJson = "{}";
  }
}

/**
 * Save bowel-movement week map (true = yes that day).
 * Global **U** undo like brain fog.
 */
export function saveBowelMap(map: Record<string, boolean>) {
  try {
    const json = JSON.stringify(map);
    if (
      !bowelUndoQuiet &&
      bowelLastJson != null &&
      bowelLastJson !== json &&
      typeof window !== "undefined"
    ) {
      const previousJson = bowelLastJson;
      pushUndo("Bowel movement", () => {
        bowelUndoQuiet = true;
        try {
          localStorage.setItem(BOWEL_KEY, previousJson);
          bowelLastJson = previousJson;
          const restored = JSON.parse(previousJson) as Record<string, boolean>;
          window.dispatchEvent(
            new CustomEvent(BOWEL_EXTERNAL_RESTORE_EVENT, { detail: restored })
          );
        } finally {
          bowelUndoQuiet = false;
        }
      });
    }
    localStorage.setItem(BOWEL_KEY, json);
    bowelLastJson = json;
  } catch {
    /* ignore */
  }
}

// ── Bowel detail log (look + feel viewer) ──────────────────────────
// Yes/No still lives in BOWEL_KEY. Richer form/feel lives here.
// Not medical advice — personal baseline + change detection.

export const BOWEL_DETAIL_KEY = "dr-melani-bowel-detail-v1";
export const BOWEL_DETAIL_RESTORE_EVENT = "wonder-bowel-detail-external-restore";

/** Bristol-style look (1 hard pellets → 7 watery). 3–4 is the usual “good” band. */
export type BowelLook = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** How it felt to pass — separate from shape. */
export type BowelFeel = "easy" | "mild" | "strain" | "urgent";

/**
 * Color standout (most days are brown — only log when it stands out).
 * Red / black-tar / pale are “tell a clinician if new or repeated” flags.
 */
export type BowelColor =
  | "brown"
  | "green"
  | "gray"
  | "dark"
  | "red";

export type BowelDayLog = {
  /** true = went that day */
  had: boolean;
  look?: BowelLook;
  feel?: BowelFeel;
  color?: BowelColor;
  note?: string;
};

export type BowelQuality =
  | "on_track"
  | "hard_side"
  | "loose_side"
  | "flag"
  | "none";

/**
 * Bristol Stool Chart (classic poster).
 * Side bands are teaching labels — not a lab diagnosis.
 */
export type BowelBand =
  | "constipated"
  | "normal"
  | "lacking_fiber"
  | "inflammation";

export const BOWEL_LOOK_GUIDE: {
  look: BowelLook;
  name: string;
  plain: string;
  band: BowelBand;
  bandLabel: string;
}[] = [
  {
    look: 1,
    name: "Type 1",
    plain: "Separate hard lumps",
    band: "constipated",
    bandLabel: "Constipated",
  },
  {
    look: 2,
    name: "Type 2",
    plain: "Lumpy and sausage-like",
    band: "constipated",
    bandLabel: "Constipated",
  },
  {
    look: 3,
    name: "Type 3",
    plain: "Sausage shape with cracks in the surface",
    band: "normal",
    bandLabel: "Normal",
  },
  {
    look: 4,
    name: "Type 4",
    plain: "Like a smooth, soft sausage or snake",
    band: "normal",
    bandLabel: "Normal",
  },
  {
    look: 5,
    name: "Type 5",
    plain: "Soft blobs with clear-cut edges",
    band: "lacking_fiber",
    bandLabel: "Lacking fiber",
  },
  {
    look: 6,
    name: "Type 6",
    plain: "Mushy consistency with ragged edges",
    band: "inflammation",
    bandLabel: "Loose / fast transit",
  },
  {
    look: 7,
    name: "Type 7",
    plain: "Liquid consistency with no solid pieces",
    band: "inflammation",
    bandLabel: "Loose / fast transit",
  },
];

/**
 * Hover tip — how it looks + stool transit + what's off + how it feels.
 * (User-authored clinical plain language. Not a diagnosis.)
 */
export const BOWEL_TYPE_POPUP: Record<
  BowelLook,
  { looks: string; stool: string; wrong: string; feels: string }
> = {
  1: {
    looks: "Separate hard lumps, like nuts or pebbles.",
    stool:
      "Stool sat in the colon too long, so too much water was pulled out and it broke into hard pellets.",
    wrong:
      "Your bowel isn’t moving stool forward effectively, so it dries out and becomes difficult to pass.",
    feels: "Pebble-by-pebble, straining, incomplete, sometimes painful.",
  },
  2: {
    looks: "Sausage-shaped but lumpy.",
    stool:
      "Stool is still moving too slowly and losing too much water, but it’s clumping together instead of breaking into separate pellets.",
    wrong:
      "You’re still on the constipation side, with sluggish movement and over-drying in the colon.",
    feels: "Heavy, hard to push out, still incomplete.",
  },
  3: {
    looks: "Sausage-shaped with cracks on the surface.",
    stool:
      "Stool is mostly formed, but still a little dry from spending slightly too long in the colon.",
    wrong: "Digestion is close to normal, but transit is still a bit slow.",
    feels: "Mostly passable, slight effort, not fully ideal.",
  },
  4: {
    looks: "Like a smooth, soft sausage or snake.",
    stool:
      "Stool moved through at a balanced pace and kept enough water to stay smooth and soft.",
    wrong: "Nothing obvious — this is the ideal pattern.",
    feels: "Easy, complete, low effort.",
  },
  5: {
    looks: "Soft blobs with clear-cut edges.",
    stool:
      "Stool moved a little faster and kept more water, so it came out softer and less formed.",
    wrong:
      "Usually nothing major, but transit may be slightly fast for your normal baseline.",
    feels: "Easy and quick, sometimes mild urgency.",
  },
  6: {
    looks: "Mushy consistency with ragged edges.",
    stool:
      "Stool moved too quickly for enough water to be absorbed, so it came out loose and mushy.",
    wrong:
      "Your gut is pushing contents through too fast, often from irritation, stress, illness, food triggers, or medication effects.",
    feels: "Urgent, messy, crampy, hard to fully control.",
  },
  7: {
    looks: "Watery liquid — no solid pieces.",
    stool:
      "Stool moved through so fast that almost no water was absorbed, so it came out fully liquid.",
    wrong:
      "This is active diarrhea — your bowel is not processing or absorbing fluid normally in that moment.",
    feels: "Immediate urgency, liquid stool, cramping, possible fatigue or dehydration.",
  },
};

export const BOWEL_FEEL_GUIDE: {
  feel: BowelFeel;
  name: string;
  plain: string;
}[] = [
  { feel: "easy", name: "Easy", plain: "No push — just happened" },
  { feel: "mild", name: "Mild effort", plain: "A little work, not a battle" },
  { feel: "strain", name: "Strain", plain: "Hard push / incomplete feel" },
  { feel: "urgent", name: "Urgent", plain: "Had to go now / loose rush" },
];

// ── Append-only event log (full history for Mel + trends) ─────────
export const BOWEL_EVENTS_KEY = "dr-melani-bowel-events-v1";

export type BowelEvent = {
  id: string;
  day: string;
  at: string;
  had: boolean;
  look?: BowelLook;
  feel?: BowelFeel;
  color?: BowelColor;
  note?: string;
  source: "ui" | "mel" | "correction" | "archive";
};

export function loadBowelEvents(): BowelEvent[] {
  try {
    const raw = localStorage.getItem(BOWEL_EVENTS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as BowelEvent[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveBowelEvents(events: BowelEvent[]) {
  try {
    // Keep ~18 months of events
    const trimmed = events.slice(-800);
    localStorage.setItem(BOWEL_EVENTS_KEY, JSON.stringify(trimmed));
  } catch {
    /* ignore */
  }
}

export function appendBowelEvent(
  partial: Omit<BowelEvent, "id" | "at"> & { at?: string }
): BowelEvent {
  const event: BowelEvent = {
    id: `bm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    at: partial.at || new Date().toISOString(),
    day: partial.day,
    had: partial.had,
    look: partial.look,
    feel: partial.feel,
    color: partial.color,
    note: partial.note,
    source: partial.source,
  };
  const all = loadBowelEvents();
  all.push(event);
  saveBowelEvents(all);
  return event;
}

/** Rolling stats for “most measured” dashboard / Mel. */
export function bowelStats(days = 30): {
  days: number;
  went: number;
  withType: number;
  typeCounts: Record<number, number>;
  avgType: number | null;
  last: BowelEvent | null;
} {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString().slice(0, 10);
  const events = loadBowelEvents().filter((e) => e.day >= sinceIso && e.had);
  const typeCounts: Record<number, number> = {};
  let typeSum = 0;
  let withType = 0;
  const daysWent = new Set<string>();
  for (const e of events) {
    daysWent.add(e.day);
    if (e.look != null) {
      typeCounts[e.look] = (typeCounts[e.look] || 0) + 1;
      typeSum += e.look;
      withType += 1;
    }
  }
  const last = loadBowelEvents().filter((e) => e.had).at(-1) || null;
  return {
    days,
    went: daysWent.size,
    withType,
    typeCounts,
    avgType: withType ? Math.round((typeSum / withType) * 10) / 10 : null,
    last,
  };
}

export const BOWEL_COLOR_GUIDE: {
  color: BowelColor;
  name: string;
  plain: string;
  flag?: boolean;
}[] = [
  { color: "brown", name: "Brown", plain: "Usual" },
  { color: "green", name: "Green", plain: "Often food or speed" },
  {
    color: "gray",
    name: "Gray",
    plain: "Pale / clay gray — standout if new",
    flag: true,
  },
  {
    color: "dark",
    name: "Black / tarry",
    plain: "Standout if sticky black",
    flag: true,
  },
  {
    color: "red",
    name: "Red / maroon",
    plain: "Standout if new",
    flag: true,
  },
];

/** Map old stored "pale" / "other" into current palette. */
export function normalizeBowelColor(
  c: string | undefined | null
): BowelColor | undefined {
  if (!c) return undefined;
  if (c === "pale" || c === "other") return "gray";
  if (
    c === "brown" ||
    c === "green" ||
    c === "gray" ||
    c === "dark" ||
    c === "red"
  ) {
    return c;
  }
  return undefined;
}

/** Personal quality band from look + feel + color (not a diagnosis). */
export function bowelQuality(log: BowelDayLog | null | undefined): BowelQuality {
  if (!log?.had) return "none";
  if (log.color === "red" || log.color === "dark" || log.color === "gray") {
    return "flag";
  }
  const look = log.look;
  const feel = log.feel;
  if (look != null && look <= 2) return "hard_side";
  if (look != null && look >= 6) return "loose_side";
  if (feel === "strain") return "hard_side";
  if (feel === "urgent") return "loose_side";
  if (look === 5) return "loose_side";
  if (look === 3 || look === 4 || look == null) {
    if (feel === "easy" || feel === "mild" || feel == null) return "on_track";
  }
  return "on_track";
}

export function bowelQualityLabel(q: BowelQuality): string {
  switch (q) {
    case "on_track":
      return "On track";
    case "hard_side":
      return "Hard side";
    case "loose_side":
      return "Loose side";
    case "flag":
      return "Standout color";
    default:
      return "Not logged";
  }
}

/**
 * Strict bowel rules:
 * - Only calendar *today* may be written (UI + Mel).
 * - Past days are immutable history.
 * - Future days are never valid — strip if present (bad clicks / bugs).
 */
export function isBowelDayWritable(day: string, today: string = todayKey()): boolean {
  return day === today;
}

/** Drop future keys only — never invent or rewrite past. */
export function scrubFutureBowelDays(
  map: Record<string, BowelDayLog>,
  today: string = todayKey()
): { map: Record<string, BowelDayLog>; removed: string[] } {
  const next: Record<string, BowelDayLog> = {};
  const removed: string[] = [];
  for (const [day, log] of Object.entries(map)) {
    if (day > today) {
      removed.push(day);
      continue;
    }
    next[day] = log;
  }
  return { map: next, removed };
}

/** Push critical health maps to ~/.wonder/local — never only browser memory. */
function pushBowelToDisk(key: string, value: unknown) {
  if (typeof fetch === "undefined") return;
  try {
    void fetch("/api/wonder-state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
      keepalive: true,
    }).catch(() => {
      /* server optional */
    });
  } catch {
    /* ignore */
  }
}

let bowelArchiveMerged = false;

/**
 * Merge recovered archive + disk shared state into localStorage.
 * NEVER shrinks history — only adds/enriches days.
 */
export function ensureBowelHistoryHydrated(): Record<string, BowelDayLog> {
  let map: Record<string, BowelDayLog> = {};
  try {
    const raw = localStorage.getItem(BOWEL_DETAIL_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        map = parsed as Record<string, BowelDayLog>;
      }
    }
  } catch {
    /* ignore */
  }

  if (Object.keys(map).length === 0) {
    const legacy = loadBowelMap();
    for (const [day, had] of Object.entries(legacy)) {
      if (had === true || had === false) map[day] = { had };
    }
  }

  // Always merge archive (richer wins) — restores wiped browser storage
  map = mergeBowelDetailPreferRicher(
    map,
    BOWEL_HISTORY_ARCHIVE as Record<string, BowelDayLog>
  );

  // Fog archive (separate key — same “never wipe” rule)
  try {
    const fogRaw = localStorage.getItem(FOG_KEY);
    let fog: Record<string, boolean> = {};
    if (fogRaw) fog = normalizeFogMap(JSON.parse(fogRaw));
    fog = mergeFogPreferKnown(FOG_HISTORY_ARCHIVE, fog);
    localStorage.setItem(FOG_KEY, JSON.stringify(fog));
  } catch {
    /* ignore */
  }

  if (!bowelArchiveMerged) {
    bowelArchiveMerged = true;
    // Quiet persist restored history
    try {
      const json = JSON.stringify(map);
      localStorage.setItem(BOWEL_DETAIL_KEY, json);
      bowelDetailLastJson = json;
      const yn: Record<string, boolean> = {};
      for (const [d, log] of Object.entries(map)) yn[d] = !!log.had;
      localStorage.setItem(BOWEL_KEY, JSON.stringify(yn));
      bowelLastJson = JSON.stringify(yn);
      pushBowelToDisk(BOWEL_DETAIL_KEY, map);
      pushBowelToDisk(BOWEL_KEY, yn);
    } catch {
      /* ignore */
    }
  }

  return map;
}

export function loadBowelDetailMap(): Record<string, BowelDayLog> {
  let map = ensureBowelHistoryHydrated();

  // One-time hygiene: future marks are invalid data (week-chip bug), not history
  const today = todayKey();
  const { map: clean, removed } = scrubFutureBowelDays(map, today);
  if (removed.length > 0) {
    try {
      // Quiet persist — no undo entry for scrubbing invalid future rows
      // NEVER drop past days — only future keys were removed
      const json = JSON.stringify(clean);
      localStorage.setItem(BOWEL_DETAIL_KEY, json);
      bowelDetailLastJson = json;
      const yn: Record<string, boolean> = {};
      for (const [d, log] of Object.entries(clean)) yn[d] = !!log.had;
      // Also strip future keys from legacy yn map
      const legacyYn = loadBowelMap();
      for (const d of Object.keys(legacyYn)) {
        if (d > today) delete legacyYn[d];
      }
      for (const [d, v] of Object.entries(yn)) legacyYn[d] = v;
      localStorage.setItem(BOWEL_KEY, JSON.stringify(legacyYn));
      bowelLastJson = JSON.stringify(legacyYn);
      pushBowelToDisk(BOWEL_DETAIL_KEY, clean);
      pushBowelToDisk(BOWEL_KEY, legacyYn);
    } catch {
      /* ignore */
    }
  }
  return clean;
}

let bowelDetailUndoQuiet = false;
let bowelDetailLastJson: string | null = null;

export function seedBowelDetailUndoBaseline(map?: Record<string, BowelDayLog>) {
  try {
    bowelDetailLastJson = JSON.stringify(map ?? loadBowelDetailMap());
  } catch {
    bowelDetailLastJson = "{}";
  }
}

export function saveBowelDetailMap(map: Record<string, BowelDayLog>) {
  // SAFETY: merge with whatever is already stored so a partial write
  // can never erase other days (agent bugs, empty profile, etc.).
  let existing: Record<string, BowelDayLog> = {};
  try {
    const raw = localStorage.getItem(BOWEL_DETAIL_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        existing = parsed as Record<string, BowelDayLog>;
      }
    }
  } catch {
    /* ignore */
  }
  const safe = mergeBowelDetailPreferRicher(existing, map);
  const json = JSON.stringify(safe);

  // Undo stack first — never let undo registration block the write
  if (
    !bowelDetailUndoQuiet &&
    bowelDetailLastJson != null &&
    bowelDetailLastJson !== json &&
    typeof window !== "undefined"
  ) {
    const previousJson = bowelDetailLastJson;
    try {
      pushUndo("Bowel detail", () => {
        bowelDetailUndoQuiet = true;
        try {
          localStorage.setItem(BOWEL_DETAIL_KEY, previousJson);
          bowelDetailLastJson = previousJson;
          // Keep yes/no map aligned with restored detail
          const restored = JSON.parse(previousJson) as Record<string, BowelDayLog>;
          const yn: Record<string, boolean> = {};
          for (const [d, log] of Object.entries(restored)) yn[d] = !!log.had;
          localStorage.setItem(BOWEL_KEY, JSON.stringify(yn));
          window.dispatchEvent(
            new CustomEvent(BOWEL_DETAIL_RESTORE_EVENT, { detail: restored })
          );
          window.dispatchEvent(
            new CustomEvent(BOWEL_EXTERNAL_RESTORE_EVENT, { detail: yn })
          );
        } finally {
          bowelDetailUndoQuiet = false;
        }
      });
    } catch {
      /* undo optional — still save below */
    }
  }

  try {
    localStorage.setItem(BOWEL_DETAIL_KEY, json);
    bowelDetailLastJson = json;

    // Mirror yes/no into legacy key (Mel + week chips) — MERGE, never wipe other days
    const yn: Record<string, boolean> = { ...loadBowelMap() };
    for (const [d, log] of Object.entries(safe)) {
      yn[d] = !!log.had;
    }
    // Quiet write on boolean map (undo is on detail)
    localStorage.setItem(BOWEL_KEY, JSON.stringify(yn));
    bowelLastJson = JSON.stringify(yn);
    // Disk mirror — survives browser profile wipes
    pushBowelToDisk(BOWEL_DETAIL_KEY, safe);
    pushBowelToDisk(BOWEL_KEY, yn);
  } catch (err) {
    // Surface rare quota / private-mode failures so we can see them in console
    console.warn("[bowel] save failed", err);
  }
}

/**
 * Patch today's bowel only (default).
 * Past = immutable collected data. Future = not allowed.
 * Source "correction" may rewrite any day ≤ today (explicit fix for a missed log).
 * Returns the existing (or empty) log unchanged if write is rejected.
 */
export function upsertBowelDay(
  day: string,
  patch: Partial<BowelDayLog> & { had: boolean },
  source: "ui" | "mel" | "correction" = "ui"
): BowelDayLog {
  const today = todayKey();
  const map = loadBowelDetailMap();
  const prev = map[day] || { had: false };

  const allowed =
    source === "correction"
      ? day <= today // past + today OK; never future
      : isBowelDayWritable(day, today);

  if (!allowed) {
    // Strict: never invent or rewrite history / future
    if (typeof console !== "undefined") {
      console.warn(
        `[bowel] blocked ${source} write for ${day} (only ${today} is writable)`
      );
    }
    return prev;
  }

  const next: BowelDayLog = {
    ...prev,
    ...patch,
    had: patch.had,
  };
  if (!next.had) {
    delete next.look;
    delete next.feel;
    delete next.color;
    delete next.note;
  }
  map[day] = next;
  saveBowelDetailMap(map);

  // History: log meaningful writes (yes with detail, or no, or type/feel change)
  const meaningful =
    !next.had ||
    patch.look != null ||
    patch.feel != null ||
    patch.color != null ||
    (patch.had === true && prev.had !== true);
  if (meaningful) {
    appendBowelEvent({
      day,
      had: next.had,
      look: next.look,
      feel: next.feel,
      color: next.color,
      note: next.note,
      source,
    });
  }
  return next;
}

/**
 * One-shot explicit corrections (user forgot a day).
 * Each id applies at most once so we never re-clobber later edits.
 */
const BOWEL_CORRECTIONS_APPLIED_KEY = "dr-melani-bowel-corrections-applied-v1";

const BOWEL_PENDING_CORRECTIONS: {
  id: string;
  day: string;
  had: boolean;
  look?: BowelLook;
}[] = [
  // Melani: Sunday bowel = No (forgot to click)
  { id: "2026-07-26-no", day: "2026-07-26", had: false },
  // Owner 2026-07-30: Monday was Type 1 (most important recent log)
  { id: "2026-07-27-type1", day: "2026-07-27", had: true, look: 1 },
];

export function applyPendingBowelCorrections(): string[] {
  if (typeof localStorage === "undefined") return [];
  // Always re-merge archive first so corrections land on full history
  ensureBowelHistoryHydrated();
  let applied: string[] = [];
  try {
    applied = JSON.parse(
      localStorage.getItem(BOWEL_CORRECTIONS_APPLIED_KEY) || "[]"
    ) as string[];
    if (!Array.isArray(applied)) applied = [];
  } catch {
    applied = [];
  }
  const done = new Set(applied);
  const newly: string[] = [];
  for (const c of BOWEL_PENDING_CORRECTIONS) {
    if (done.has(c.id)) continue;
    const patch: Partial<BowelDayLog> & { had: boolean } = { had: c.had };
    if (c.look != null) patch.look = c.look;
    upsertBowelDay(c.day, patch, "correction");
    done.add(c.id);
    newly.push(c.id);
  }
  if (newly.length) {
    try {
      localStorage.setItem(
        BOWEL_CORRECTIONS_APPLIED_KEY,
        JSON.stringify([...done])
      );
    } catch {
      /* ignore */
    }
  }
  return newly;
}

export { todayKey };

/**
 * Sleep storage + helpers.
 * One night = bedtime + wake for a calendar day (local YYYY-MM-DD).
 * Overnight is normal (e.g. 23:00 → 07:00). Graph reads these hours.
 */
import { todayKey } from "./data";
import { pushUndo } from "../undoStack";

export const SLEEP_KEY = "dr-melani-sleep-v1";
export const FOG_KEY = "dr-melani-brainfog-v1";
/** UI reloads fog map after global **U** undo */
export const FOG_EXTERNAL_RESTORE_EVENT = "wonder-fog-external-restore";
export const SLEEP_EXTERNAL_RESTORE_EVENT = "wonder-sleep-external-restore";

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
 * Today uses live bed/wake so the line updates as you type.
 * Other days read from localStorage.
 */
export function weekSleepHours(
  weekIsos: string[],
  todayIso: string,
  todayBed: string,
  todayWake: string
): (number | null)[] {
  return weekIsos.map((iso) => {
    if (iso === todayIso) {
      const live = sleepHours(todayBed, todayWake);
      if (live != null) return live;
      // Fall back to whatever was last saved for today
      return loadSleepDay(iso).hours;
    }
    return loadSleepDay(iso).hours;
  });
}

export function loadFogMap(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(FOG_KEY);
    if (raw) return JSON.parse(raw) as Record<string, boolean>;
  } catch {
    /* ignore */
  }
  return {};
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

export { todayKey };

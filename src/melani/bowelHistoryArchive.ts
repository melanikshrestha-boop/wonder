/**
 * Recovered bowel history — NEVER wipe real owner weeks.
 *
 * Owner only started intentional logging the week of Jul 25–31 2026.
 * Early Melani-assistant May/June seed rows are NOT owner week truth —
 * they inflated “bowel days logged” past n=7. Archive holds the start week only.
 *
 * Week (owner 2026-08-01): **5 Yes · 2 No · n = 7**
 *   Sat 7/25 Yes Type 7 · Sun 7/26 No · Mon 7/27 Yes Type 4
 *   Tue 7/28 Yes Type 1 · Wed 7/29 Yes Type 4 · Thu 7/30 Yes Type 4
 *   Fri 7/31 No
 *
 * On load: fill missing days from archive. Local owner logs always win
 * on conflict (never re-clobber a corrected day).
 */

/** Minimal shape — matches BowelDayLog in sleepStore (kept local to avoid cycles). */
export type ArchiveBowelDay = {
  had: boolean;
  look?: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  feel?: string;
  color?: string;
  note?: string;
};

/**
 * First owner week only. Do not re-seed May/June assistant leftovers here.
 * Day → log. `had` required; look only when Yes + known type.
 */
export const BOWEL_HISTORY_ARCHIVE: Record<string, ArchiveBowelDay> = {
  // First intentional week — 5 Yes, 2 No
  "2026-07-25": { had: true, look: 7 }, // Sat — yes, type 7
  "2026-07-26": { had: false }, // Sun — no
  "2026-07-27": { had: true, look: 4 }, // Mon — yes, type 4
  "2026-07-28": { had: true, look: 1 }, // Tue — yes, type 1
  "2026-07-29": { had: true, look: 4 }, // Wed — yes, type 4
  "2026-07-30": { had: true, look: 4 }, // Thu — yes, type 4
  "2026-07-31": { had: false }, // Fri — no
};

/** Recovered brain-fog map (yes = fog that day). Unrelated to bowel prune. */
export const FOG_HISTORY_ARCHIVE: Record<string, boolean> = {
  "2026-06-01": false,
  "2026-06-02": false,
  "2026-06-03": false,
  "2026-06-25": false,
  "2026-06-26": false,
};

/**
 * Merge bowel maps without wiping history.
 * - `base` = localStorage (owner / live) — wins on conflict
 * - `incoming` = archive or disk — only fills missing days, or enriches
 *   a Yes that has no type yet
 * Never re-applies archive over a day the owner already logged.
 */
export function mergeBowelDetailPreferRicher<T extends ArchiveBowelDay>(
  base: Record<string, T>,
  incoming: Record<string, T>
): Record<string, T> {
  const out: Record<string, T> = { ...base };
  for (const [day, log] of Object.entries(incoming)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    if (!log || typeof log.had !== "boolean") continue;
    const prev = out[day];
    if (!prev) {
      // Missing day → restore from archive/disk
      out[day] = { ...log };
      continue;
    }
    // Local already has this day — keep local `had`. Only fill missing type/feel/note.
    const next = { ...log, ...prev, had: prev.had } as T;
    if (prev.had && prev.look == null && log.look != null) {
      next.look = log.look;
    }
    if (prev.had && prev.feel == null && log.feel != null) {
      next.feel = log.feel;
    }
    if (!prev.note && log.note) next.note = log.note;
    if (!next.had) {
      delete next.look;
      delete next.feel;
      delete next.color;
    }
    out[day] = next;
  }
  return out;
}

export function mergeFogPreferKnown(
  base: Record<string, boolean>,
  incoming: Record<string, boolean>
): Record<string, boolean> {
  return { ...base, ...incoming };
}

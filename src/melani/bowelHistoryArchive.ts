/**
 * Recovered bowel history — NEVER wipe this.
 * Built from:
 *   - ~/.melani_assistant/health_data/jarvis/bowel_memory.json (week rolls)
 *   - day-level bowel_movement_*.json
 *   - Chrome 127.0.0.1:5173 localStorage (2026-07-26 No, 2026-07-30 Type 4)
 *   - Owner 2026-07-30 final week: Sat No, Sun No, Mon No,
 *     Tue Type 1, Wed Type 4, Thu Type 4
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

/** Day → log. `had` required; look only when Yes + known type. */
export const BOWEL_HISTORY_ARCHIVE: Record<string, ArchiveBowelDay> = {
  // Early Melani Health / assistant
  "2026-05-31": { had: true, note: "felt bloated after lunch" },
  "2026-06-01": { had: true },
  "2026-06-02": { had: true },
  "2026-06-06": { had: false },
  "2026-06-08": { had: false },
  "2026-06-20": { had: true },
  "2026-06-24": { had: true },
  "2026-06-25": { had: true },
  "2026-06-29": { had: true },
  "2026-07-10": { had: true },
  "2026-07-18": { had: true },
  // Wonder week (Sat Jul 25 – Thu Jul 30) — owner-confirmed 2026-07-30
  "2026-07-25": { had: false }, // Saturday — no
  "2026-07-26": { had: false }, // Sunday — no
  "2026-07-27": { had: false }, // Monday — no
  "2026-07-28": { had: true, look: 1 }, // Tuesday — type 1
  "2026-07-29": { had: true, look: 4 }, // Wednesday — type 4
  "2026-07-30": { had: true, look: 4 }, // Thursday — type 4
};

/** Recovered brain-fog map (yes = fog that day). */
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

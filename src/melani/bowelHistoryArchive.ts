/**
 * Recovered bowel history — NEVER wipe this.
 * Built from:
 *   - ~/.melani_assistant/health_data/jarvis/bowel_memory.json (week rolls)
 *   - day-level bowel_movement_*.json
 *   - Chrome 127.0.0.1:5173 localStorage (2026-07-26 No, 2026-07-30 Type 4)
 *   - Owner correction 2026-07-30 session: Monday = Type 1
 *     (calendar Mon of that week = 2026-07-27)
 *
 * On load, Wonder MERGES this into localStorage (never replaces richer rows).
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
  // Wonder week (Jul 26–30)
  "2026-07-26": { had: false }, // Sunday No (prior correction)
  // Mon Jul 27 — owner: Type 1 (most important recent log)
  "2026-07-27": { had: true, look: 1 },
  // Tue Jul 28 — owner: does not think they went (leave unlogged; do not invent No)
  "2026-07-30": { had: true, look: 4 }, // today Type 4 from Chrome
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
 * Prefer richer truth when merging:
 * - keep both days
 * - if one has look and other doesn't, keep look
 * - never drop a day that already exists unless new explicitly clears via correction path
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
      out[day] = { ...log };
      continue;
    }
    // Prefer Yes + type over bare Yes or empty
    const next = { ...prev, ...log, had: log.had } as T;
    if (prev.look != null && next.look == null && next.had) {
      next.look = prev.look;
    }
    if (prev.feel != null && next.feel == null && next.had) {
      next.feel = prev.feel;
    }
    if (prev.note && !next.note) next.note = prev.note;
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

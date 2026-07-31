/**
 * Data Guardian — never wipe health history.
 *
 * Law:
 *  1. Merge only. New days add; old days stay.
 *  2. Empty browser is not truth if disk has history.
 *  3. Local owner day wins on conflict with archive/disk.
 *  4. Every save mirrors to ~/.wonder/local via API when available.
 */
import {
  BOWEL_DETAIL_KEY,
  BOWEL_EVENTS_KEY,
  BOWEL_KEY,
  FOG_KEY,
  SLEEP_KEY,
  ensureBowelHistoryHydrated,
  loadBowelDetailMap,
  loadFogMap,
} from "../sleepStore";
import { WEIGHT_KEY, loadWeightLog } from "../whoopStore";

export const GUARDIAN_EVENT = "wonder-data-guardian";

/** Exact keys we always protect */
export const GUARDIAN_EXACT_KEYS = [
  BOWEL_DETAIL_KEY,
  BOWEL_KEY,
  BOWEL_EVENTS_KEY,
  FOG_KEY,
  WEIGHT_KEY,
  "wonder-habits-v1",
  "wonder-habit-checks-v1",
] as const;

/** Prefixes — any localStorage key starting with these is protected */
export const GUARDIAN_PREFIXES = [
  "dr-melani-sleep-v1:",
  "dr-melani-meals-usuals:",
  "dr-melani-water-ml:",
  "dr-melani-water-hist:",
  "dr-melani-nutri:",
  "dr-melani-nutrition",
  "dr-melani-brainfog",
  "dr-melani-bowel",
  "wonder-weight",
  "wonder-habits",
] as const;

export type GuardianDomain =
  | "bowel"
  | "fog"
  | "meals"
  | "weight"
  | "sleep"
  | "water"
  | "habits"
  | "other";

export type DomainStatus = {
  id: GuardianDomain;
  label: string;
  blurb: string;
  keyCount: number;
  sample: string;
  ok: boolean;
};

function isProtectedKey(key: string): boolean {
  if ((GUARDIAN_EXACT_KEYS as readonly string[]).includes(key)) return true;
  return GUARDIAN_PREFIXES.some((p) => key.startsWith(p));
}

function domainForKey(key: string): GuardianDomain {
  if (key.includes("bowel")) return "bowel";
  if (key.includes("brainfog") || key.includes("fog")) return "fog";
  if (key.includes("meals") || key.includes("nutri") || key.includes("nutrition"))
    return "meals";
  if (key.includes("weight")) return "weight";
  if (key.includes("sleep")) return "sleep";
  if (key.includes("water")) return "water";
  if (key.includes("habit")) return "habits";
  return "other";
}

/** Object maps: base wins; incoming fills missing keys only (never delete base keys). */
export function mergeMapsPreferLocal<T extends Record<string, unknown>>(
  local: T,
  incoming: T | null | undefined
): T {
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
    return local;
  }
  const out = { ...incoming, ...local } as T;
  // Enrich local days that lack detail from incoming (e.g. look type)
  for (const [k, incVal] of Object.entries(incoming)) {
    const locVal = (local as Record<string, unknown>)[k];
    if (
      locVal &&
      typeof locVal === "object" &&
      !Array.isArray(locVal) &&
      incVal &&
      typeof incVal === "object" &&
      !Array.isArray(incVal)
    ) {
      const loc = locVal as Record<string, unknown>;
      const inc = incVal as Record<string, unknown>;
      const merged = { ...inc, ...loc };
      // If local had:true but no look, take look from disk
      if (loc.had === true && loc.look == null && inc.look != null) {
        merged.look = inc.look;
      }
      if (merged.had === false) {
        delete merged.look;
        delete merged.feel;
        delete merged.color;
      }
      (out as Record<string, unknown>)[k] = merged;
    }
  }
  return out;
}

/** Weight / list logs: union by day, local day wins */
export function mergeByDayKey<T extends { day: string }>(
  local: T[],
  incoming: T[] | null | undefined
): T[] {
  const map = new Map<string, T>();
  if (Array.isArray(incoming)) {
    for (const row of incoming) {
      if (row?.day) map.set(row.day, row);
    }
  }
  for (const row of local) {
    if (row?.day) map.set(row.day, row); // local overwrites
  }
  return Array.from(map.values()).sort((a, b) =>
    a.day < b.day ? 1 : a.day > b.day ? -1 : 0
  );
}

export function pushGuardianKey(key: string, value: unknown): void {
  if (typeof fetch === "undefined") return;
  if (!isProtectedKey(key)) return;
  try {
    void fetch("/api/wonder-state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
      keepalive: true,
    }).catch(() => {
      /* offline */
    });
  } catch {
    /* ignore */
  }
}

/**
 * Safe write for object-map health keys.
 * Merges with existing localStorage so a partial write cannot erase days.
 */
export function guardianSaveMap(
  key: string,
  next: Record<string, unknown>
): Record<string, unknown> {
  let existing: Record<string, unknown> = {};
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        existing = parsed as Record<string, unknown>;
      }
    }
  } catch {
    /* ignore */
  }
  // Keep every prior day; overlay the caller's map (write path owns those days)
  const final = { ...existing, ...next } as Record<string, unknown>;
  try {
    localStorage.setItem(key, JSON.stringify(final));
  } catch (e) {
    console.warn("[guardian] save failed", key, e);
  }
  pushGuardianKey(key, final);
  emitGuardian();
  return final;
}

function emitGuardian() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(GUARDIAN_EVENT));
}

/** Collect every protected key currently in localStorage */
export function collectProtectedSnapshot(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (typeof localStorage === "undefined") return out;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !isProtectedKey(key)) continue;
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) continue;
      try {
        out[key] = JSON.parse(raw);
      } catch {
        out[key] = raw;
      }
    } catch {
      /* ignore */
    }
  }
  return out;
}

export function guardianDomainStatuses(): DomainStatus[] {
  const snap = collectProtectedSnapshot();
  const buckets: Record<
    GuardianDomain,
    { keys: string[]; label: string; blurb: string }
  > = {
    bowel: {
      keys: [],
      label: "Bowel",
      blurb: "Yes/No · Bristol type · lifetime graph",
    },
    fog: {
      keys: [],
      label: "Brain fog",
      blurb: "Daily Yes/No · never blank a past day",
    },
    meals: {
      keys: [],
      label: "Meals",
      blurb: "Per-day logs · new day does not erase history",
    },
    weight: {
      keys: [],
      label: "Weight",
      blurb: "Scale history · gym body log",
    },
    sleep: {
      keys: [],
      label: "Sleep",
      blurb: "Bed · wake · hours per night",
    },
    water: {
      keys: [],
      label: "Water",
      blurb: "Daily ml toward 3.5 L",
    },
    habits: {
      keys: [],
      label: "Habits",
      blurb: "Checks and streaks",
    },
    other: {
      keys: [],
      label: "Other health",
      blurb: "Anything else under protection",
    },
  };

  for (const key of Object.keys(snap)) {
    buckets[domainForKey(key)].keys.push(key);
  }

  // Force bowel/fog hydrate counts even if empty object
  try {
    const bowel = loadBowelDetailMap();
    const n = Object.keys(bowel).length;
    if (n && !buckets.bowel.keys.length) buckets.bowel.keys.push(BOWEL_DETAIL_KEY);
  } catch {
    /* ignore */
  }

  const order: GuardianDomain[] = [
    "bowel",
    "fog",
    "meals",
    "weight",
    "sleep",
    "water",
    "habits",
    "other",
  ];

  return order
    .filter((id) => id !== "other" || buckets.other.keys.length > 0)
    .map((id) => {
      const b = buckets[id];
      let sample = "—";
      if (id === "bowel") {
        try {
          const m = loadBowelDetailMap();
          const days = Object.keys(m).length;
          sample = days ? `${days} days sealed` : "awaiting first log";
        } catch {
          sample = "—";
        }
      } else if (id === "fog") {
        try {
          const m = loadFogMap();
          sample = `${Object.keys(m).length} days`;
        } catch {
          /* ignore */
        }
      } else if (id === "weight") {
        try {
          sample = `${loadWeightLog().length} entries`;
        } catch {
          /* ignore */
        }
      } else if (id === "meals") {
        sample = `${b.keys.filter((k) => k.includes("meals-usuals")).length} day files`;
      } else if (id === "sleep") {
        sample = `${b.keys.filter((k) => k.startsWith(SLEEP_KEY)).length} nights`;
      } else {
        sample =
          b.keys.length === 1
            ? "1 key"
            : b.keys.length
              ? `${b.keys.length} keys`
              : "quiet";
      }
      return {
        id,
        label: b.label,
        blurb: b.blurb,
        keyCount: b.keys.length,
        sample,
        ok: b.keys.length > 0 || id === "bowel" || id === "fog",
      };
    });
}

/**
 * Pull disk mirrors for exact keys and merge into localStorage (local wins).
 * Call once on boot.
 */
export async function hydrateFromDisk(): Promise<{ merged: number }> {
  if (typeof fetch === "undefined" || typeof localStorage === "undefined") {
    return { merged: 0 };
  }
  // Bowel has its own archive merge
  try {
    ensureBowelHistoryHydrated();
  } catch {
    /* ignore */
  }
  // Habits: recover forensic archive + never accept empty disk overwrite
  try {
    const { ensureHabitChecksRecovered, hydrateHabitsFromShared } = await import(
      "../habitStore"
    );
    ensureHabitChecksRecovered();
    await hydrateHabitsFromShared();
  } catch {
    /* ignore */
  }

  let merged = 0;
  const keys = [...GUARDIAN_EXACT_KEYS];
  // Also discover meal/sleep keys from disk isn't possible without list endpoint —
  // pull known exact + scan local meal keys already present
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && isProtectedKey(k) && !keys.includes(k as (typeof GUARDIAN_EXACT_KEYS)[number])) {
      keys.push(k as (typeof GUARDIAN_EXACT_KEYS)[number]);
    }
  }

  await Promise.all(
    keys.map(async (key) => {
      try {
        const res = await fetch(
          `/api/wonder-state?key=${encodeURIComponent(key)}`
        );
        if (!res.ok) return;
        const body = (await res.json()) as { value?: unknown };
        if (body.value == null) return;
        const raw = localStorage.getItem(key);
        let local: unknown = null;
        if (raw) {
          try {
            local = JSON.parse(raw);
          } catch {
            local = raw;
          }
        }
        let next: unknown = body.value;
        if (
          local &&
          typeof local === "object" &&
          !Array.isArray(local) &&
          typeof body.value === "object" &&
          body.value &&
          !Array.isArray(body.value)
        ) {
          next = mergeMapsPreferLocal(
            local as Record<string, unknown>,
            body.value as Record<string, unknown>
          );
        } else if (Array.isArray(local) && Array.isArray(body.value)) {
          // weight-style lists
          if (
            local[0] &&
            typeof local[0] === "object" &&
            local[0] !== null &&
            "day" in (local[0] as object)
          ) {
            next = mergeByDayKey(
              local as { day: string }[],
              body.value as { day: string }[]
            );
          } else if (local.length >= (body.value as unknown[]).length) {
            next = local; // keep longer local array
          }
        } else if (local != null && body.value == null) {
          next = local;
        } else if (local != null) {
          // Prefer local non-null
          next = local;
        }
        const serialized = JSON.stringify(next);
        if (serialized !== raw) {
          localStorage.setItem(key, serialized);
          merged += 1;
        }
        // Always re-mirror local truth to disk
        pushGuardianKey(key, next);
      } catch {
        /* ignore one key */
      }
    })
  );

  if (merged) emitGuardian();
  return { merged };
}

/** One-shot: push entire protected snapshot to disk mirrors */
export function mirrorAllToDisk(): number {
  const snap = collectProtectedSnapshot();
  let n = 0;
  for (const [key, value] of Object.entries(snap)) {
    pushGuardianKey(key, value);
    n += 1;
  }
  return n;
}

export function onGuardianChange(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(GUARDIAN_EVENT, cb);
  return () => window.removeEventListener(GUARDIAN_EVENT, cb);
}

/**
 * Editable trash + approved diet lists.
 * Seeded from foodGuide defaults; owner can add / rename / remove.
 * Persists localStorage + ~/.wonder/local via wonder-state.
 */
import {
  APPROVED_NUTS,
  APPROVED_PROTEIN,
  APPROVED_VEGETABLES,
  PLATE_TRASH,
} from "./foodGuide";

export const DIET_LISTS_KEY = "dr-melani-diet-lists-v1";

export type ApprovedBucketId = "protein" | "vegetables" | "nuts";

export type DietListsState = {
  trash: string[];
  protein: string[];
  vegetables: string[];
  nuts: string[];
};

const DEFAULTS: DietListsState = {
  trash: [...PLATE_TRASH],
  protein: [...APPROVED_PROTEIN],
  vegetables: [...APPROVED_VEGETABLES],
  nuts: [...APPROVED_NUTS],
};

function cleanList(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    if (typeof raw !== "string") continue;
    const t = raw.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function normalize(state: Partial<DietListsState> | null | undefined): DietListsState {
  return {
    trash: cleanList(state?.trash?.length ? state.trash : DEFAULTS.trash),
    protein: cleanList(state?.protein?.length ? state.protein : DEFAULTS.protein),
    vegetables: cleanList(
      state?.vegetables?.length ? state.vegetables : DEFAULTS.vegetables
    ),
    nuts: cleanList(state?.nuts?.length ? state.nuts : DEFAULTS.nuts),
  };
}

function pushDisk(value: DietListsState) {
  if (typeof fetch === "undefined") return;
  try {
    void fetch("/api/wonder-state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: DIET_LISTS_KEY, value }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

export function loadDietLists(): DietListsState {
  if (typeof localStorage === "undefined") return { ...DEFAULTS, trash: [...DEFAULTS.trash], protein: [...DEFAULTS.protein], vegetables: [...DEFAULTS.vegetables], nuts: [...DEFAULTS.nuts] };
  try {
    const raw = localStorage.getItem(DIET_LISTS_KEY);
    if (!raw) return normalize(DEFAULTS);
    const parsed = JSON.parse(raw) as Partial<DietListsState>;
    return normalize(parsed);
  } catch {
    return normalize(DEFAULTS);
  }
}

export function saveDietLists(state: DietListsState): DietListsState {
  const next = normalize(state);
  try {
    localStorage.setItem(DIET_LISTS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  pushDisk(next);
  return next;
}

export function addDietItem(
  bucket: "trash" | ApprovedBucketId,
  item: string
): DietListsState {
  const state = loadDietLists();
  const t = item.trim();
  if (!t) return state;
  const list = state[bucket];
  if (list.some((x) => x.toLowerCase() === t.toLowerCase())) return state;
  return saveDietLists({ ...state, [bucket]: [...list, t] });
}

export function removeDietItem(
  bucket: "trash" | ApprovedBucketId,
  item: string
): DietListsState {
  const state = loadDietLists();
  const key = item.toLowerCase();
  return saveDietLists({
    ...state,
    [bucket]: state[bucket].filter((x) => x.toLowerCase() !== key),
  });
}

export function renameDietItem(
  bucket: "trash" | ApprovedBucketId,
  from: string,
  to: string
): DietListsState {
  const state = loadDietLists();
  const next = to.trim();
  if (!next) return removeDietItem(bucket, from);
  const fromKey = from.toLowerCase();
  return saveDietLists({
    ...state,
    [bucket]: state[bucket].map((x) =>
      x.toLowerCase() === fromKey ? next : x
    ),
  });
}

/** Hydrate from disk if browser empty / stale */
export async function hydrateDietListsFromDisk(): Promise<DietListsState> {
  const local = loadDietLists();
  try {
    const res = await fetch(`/api/wonder-state?key=${DIET_LISTS_KEY}`);
    if (!res.ok) return local;
    const body = (await res.json()) as { value?: Partial<DietListsState> | null };
    if (!body.value || typeof body.value !== "object") return local;
    const disk = normalize(body.value);
    // Disk is SoT: every UI edit already mirrors via saveDietLists.
    // Prefer disk whenever it has real data so deletes (shorter lists) stick.
    const score = (s: DietListsState) =>
      s.trash.length + s.protein.length + s.vegetables.length + s.nuts.length;
    if (score(disk) > 0) {
      return saveDietLists(disk);
    }
  } catch {
    /* offline */
  }
  return local;
}

export function dietListsDefaults(): DietListsState {
  return normalize(DEFAULTS);
}

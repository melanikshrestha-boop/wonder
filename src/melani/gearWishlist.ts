/**
 * Life / Blueprint gear — buy next (not wardrobe clothes).
 * Owned items are listed for memory but filtered out of the buy-next list.
 */
export type GearWishItem = {
  id: string;
  name: string;
  url: string;
  brand?: string;
  note?: string;
  /** true = already own — do not show as buy next */
  owned?: boolean;
  source: "blueprint-stack";
};

const STORAGE_KEY = "wonder-gear-wishlist-v1";

/** Bryan Johnson stack Melani pasted — buy-next only (no “own” recap). */
const SEED: GearWishItem[] = [
  {
    id: "blueprint-olive-oil",
    name: "Blueprint Extra Virgin Olive Oil",
    url: "https://blueprint.bryanjohnson.com/",
    brand: "Blueprint",
    note: "Buy next",
    source: "blueprint-stack",
  },
  {
    id: "meal-prep-tins",
    name: "Meal Prep Tins (stainless)",
    url: "https://www.amazon.com/s?k=G+HOMEFAVOR+stainless+steel+meal+prep+containers",
    brand: "G-HOMEFAVOR",
    note: "Buy next",
    source: "blueprint-stack",
  },
  {
    id: "iqair-monitor",
    name: "Air quality monitor",
    url: "https://www.iqair.com/us/products/air-quality-monitors",
    brand: "IQAir",
    note: "Buy next",
    source: "blueprint-stack",
  },
  {
    id: "parasym",
    name: "Parasym",
    url: "https://www.parasym.com/",
    brand: "Parasym",
    note: "Buy next",
    source: "blueprint-stack",
  },
  {
    id: "sensate",
    name: "Sensate",
    url: "https://www.getsensate.com/",
    brand: "Sensate",
    note: "Buy next",
    source: "blueprint-stack",
  },
  {
    id: "braun-ear-temp",
    name: "Inner-ear thermometer",
    url: "https://www.braunhealthcare.com/us_en/",
    brand: "Braun",
    note: "Buy next",
    source: "blueprint-stack",
  },
  {
    id: "withings-scale",
    name: "Withings body scale",
    url: "https://www.withings.com/us/en/scales",
    brand: "Withings",
    note: "Buy next",
    source: "blueprint-stack",
  },
  {
    id: "eightsleep",
    name: "Eight Sleep",
    url: "https://www.eightsleep.com/",
    brand: "Eight Sleep",
    note: "Buy next",
    source: "blueprint-stack",
  },
];

/** Retired from seed — strip from localStorage if still present */
const PURGE_IDS = new Set([
  "whoop-4",
  "bowflex-dumbbells",
  "blueprint-laser-cap",
]);

function readRaw(): GearWishItem[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as GearWishItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRaw(items: GearWishItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
  // Disk mirror when API available (same browser + widget)
  try {
    void fetch("/api/wonder-state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: STORAGE_KEY, value: items }),
    });
  } catch {
    /* offline */
  }
}

/** Merge seed into stored list without wiping user adds. */
export function loadGearWishlist(): GearWishItem[] {
  let items = readRaw();
  let changed = false;

  // Drop retired “already own” rows (Whoop / Bowflex / laser cap)
  const before = items.length;
  items = items.filter((x) => !PURGE_IDS.has(x.id));
  if (items.length !== before) changed = true;

  for (const seed of SEED) {
    if (!items.some((x) => x.id === seed.id)) {
      items = [...items, seed];
      changed = true;
    } else {
      // Keep owned flags + URLs fresh from seed for known ids
      items = items.map((x) =>
        x.id === seed.id
          ? {
              ...x,
              name: seed.name,
              url: seed.url,
              brand: seed.brand,
              owned: seed.owned,
              note: seed.note,
              source: seed.source,
            }
          : x
      );
    }
  }
  if (changed) writeRaw(items);
  return items;
}

/** Buy next only (not owned). */
export function loadGearBuyNext(): GearWishItem[] {
  return loadGearWishlist().filter((x) => !x.owned);
}

export function markGearOwned(id: string): GearWishItem[] {
  const next = loadGearWishlist().map((x) =>
    x.id === id ? { ...x, owned: true, note: "Already own" } : x
  );
  writeRaw(next);
  return next;
}

export function removeGearWish(id: string): GearWishItem[] {
  const next = loadGearWishlist().filter((x) => x.id !== id);
  writeRaw(next);
  return next;
}

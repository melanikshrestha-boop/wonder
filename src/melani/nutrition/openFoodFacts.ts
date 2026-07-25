/**
 * Open Food Facts client — packaged food by barcode or brand name.
 *
 * The bundled foodDb covers whole foods ("chicken breast", "blueberries").
 * It can never cover the 3 million packaged products with a barcode on them.
 * This closes that gap using the Open Food Facts public API.
 *
 * Written against the public HTTP API only. Food You (GPL-3.0) uses the same
 * service, but none of its code is used here — Wonder stays under its own
 * licence.
 *
 * Design rules, because the network is the least reliable part of this app:
 *   - Every lookup is additive. The offline database remains the primary path.
 *   - Successful lookups are cached to localStorage, so a product you scanned
 *     once resolves forever after with no network at all.
 *   - Parsing is defensive: OFF is crowd-sourced, so fields are routinely
 *     missing, misspelled, or in the wrong unit. A product missing calories is
 *     rejected rather than logged as zero.
 *
 * Data licence: Open Food Facts is ODbL. Attribution is surfaced in the UI.
 */
import type { Food, Macros } from "./foodDb";

const API = "https://world.openfoodfacts.org";
const CACHE_KEY = "wonder-off-cache-v1";
const CACHE_LIMIT = 300;
/** OFF asks every client to identify itself; anonymous traffic gets throttled. */
const USER_AGENT = "Wonder/1.0 (personal nutrition tracker)";
const TIMEOUT_MS = 9000;

export type OffProduct = {
  barcode: string;
  name: string;
  brand: string;
  /** Macros per 100 g, normalised from whatever units OFF returned. */
  per100g: Macros;
  /** Grams in one serving, when the product declares it. */
  servingGrams: number | null;
  imageUrl?: string;
};

export type OffResult =
  | { ok: true; product: OffProduct; cached: boolean }
  | { ok: false; reason: "not-found" | "no-nutrition" | "offline" | "error"; detail?: string };

type RawNutriments = Record<string, unknown>;

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/**
 * Calories per 100 g. OFF stores this under several keys and sometimes only
 * in kilojoules, so try each in order of trustworthiness.
 */
function kcalPer100g(n: RawNutriments): number | null {
  const direct = num(n["energy-kcal_100g"]) ?? num(n["energy-kcal"]);
  if (direct !== null && direct >= 0) return direct;

  const kj = num(n["energy-kj_100g"]) ?? num(n["energy-kj"]);
  if (kj !== null && kj > 0) return kj / 4.184;

  // Bare "energy_100g" is kJ unless energy_unit says otherwise.
  const bare = num(n.energy_100g) ?? num(n.energy);
  if (bare !== null && bare > 0) {
    const unit = String(n.energy_unit || n["energy_100g_unit"] || "kJ").toLowerCase();
    return unit.includes("cal") ? bare : bare / 4.184;
  }
  return null;
}

/** Serving size like "30 g", "1 cup (240ml)", "2 biscuits (25 g)". */
function parseServingGrams(raw: unknown, nutriments: RawNutriments): number | null {
  const declared = num(nutriments.serving_quantity);
  if (declared !== null && declared > 0) return declared;

  if (typeof raw !== "string") return null;
  // Prefer a gram figure inside parentheses, else the first g/ml number.
  const match =
    raw.match(/\((\d+(?:[.,]\d+)?)\s*(?:g|ml)\)/i) ||
    raw.match(/(\d+(?:[.,]\d+)?)\s*(?:g|ml)\b/i);
  if (!match) return null;
  const grams = Number(match[1].replace(",", "."));
  return Number.isFinite(grams) && grams > 0 ? grams : null;
}

/** Map a raw OFF product to our shape, or null when it lacks usable nutrition. */
export function mapOffProduct(raw: Record<string, unknown>): OffProduct | null {
  const barcode = String(raw.code || raw._id || "").trim();
  const nutriments = (raw.nutriments || {}) as RawNutriments;

  const calories = kcalPer100g(nutriments);
  // Without calories there is nothing to track; a zero would silently corrupt
  // the day's totals, so reject instead.
  if (calories === null) return null;

  const name =
    String(raw.product_name || raw.product_name_en || raw.generic_name || "").trim() ||
    "Unnamed product";
  const brand = String(raw.brands || "").split(",")[0].trim();

  const per100g: Macros = {
    calories: Math.round(calories),
    protein_g: Math.round((num(nutriments.proteins_100g) ?? 0) * 10) / 10,
    carbs_g: Math.round((num(nutriments.carbohydrates_100g) ?? 0) * 10) / 10,
    fat_g: Math.round((num(nutriments.fat_100g) ?? 0) * 10) / 10,
    fiber_g: Math.round((num(nutriments.fiber_100g) ?? 0) * 10) / 10,
  };

  return {
    barcode,
    name,
    brand,
    per100g,
    servingGrams: parseServingGrams(raw.serving_size, nutriments),
    imageUrl: typeof raw.image_front_small_url === "string" ? raw.image_front_small_url : undefined,
  };
}

/** Present an OFF product with the same surface as a bundled food. */
export function offToFood(product: OffProduct): Food {
  const portions = [
    ...(product.servingGrams
      ? [{ label: "serving", grams: product.servingGrams }]
      : []),
    { label: "100 g", grams: 100 },
    { label: "g", grams: 1 },
  ];
  return {
    id: `off-${product.barcode}`,
    name: product.brand ? `${product.name} (${product.brand})` : product.name,
    aliases: [product.barcode],
    group: "prepared",
    per100g: product.per100g,
    portions,
  };
}

// ─── Cache ───────────────────────────────────────────────────────────────────

type Cache = Record<string, OffProduct>;

function readCache(): Cache {
  try {
    if (typeof localStorage === "undefined") return {};
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}") as Cache;
  } catch {
    return {};
  }
}

function writeCache(cache: Cache) {
  try {
    if (typeof localStorage === "undefined") return;
    const keys = Object.keys(cache);
    // Bounded so a year of scanning cannot fill the storage quota.
    const trimmed = keys.length > CACHE_LIMIT
      ? Object.fromEntries(keys.slice(-CACHE_LIMIT).map((k) => [k, cache[k]]))
      : cache;
    localStorage.setItem(CACHE_KEY, JSON.stringify(trimmed));
  } catch {
    /* quota exceeded — lookups still work, they just re-fetch */
  }
}

export function cachedProduct(barcode: string): OffProduct | null {
  return readCache()[normaliseBarcode(barcode)] || null;
}

export function cacheSize(): number {
  return Object.keys(readCache()).length;
}

/** Strip spaces/hyphens people type or scanners emit. */
export function normaliseBarcode(input: string): string {
  return input.replace(/[^0-9]/g, "");
}

export function isPlausibleBarcode(input: string): boolean {
  const code = normaliseBarcode(input);
  // EAN-8, UPC-A(12), EAN-13, and ITF-14 are what food packaging uses.
  return [8, 12, 13, 14].includes(code.length);
}

// ─── Network ─────────────────────────────────────────────────────────────────

async function getJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

const FIELDS =
  "code,product_name,product_name_en,generic_name,brands,nutriments,serving_size,image_front_small_url";

/**
 * Look a barcode up. Cache first, so a product scanned once never needs the
 * network again.
 */
export async function lookupBarcode(input: string): Promise<OffResult> {
  const barcode = normaliseBarcode(input);
  if (!barcode) return { ok: false, reason: "not-found", detail: "No digits in that code" };

  const hit = cachedProduct(barcode);
  if (hit) return { ok: true, product: hit, cached: true };

  try {
    const data = (await getJson(
      `${API}/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`
    )) as { status?: number; product?: Record<string, unknown> };

    if (!data || data.status === 0 || !data.product) {
      return { ok: false, reason: "not-found" };
    }
    const product = mapOffProduct({ code: barcode, ...data.product });
    if (!product) return { ok: false, reason: "no-nutrition" };

    writeCache({ ...readCache(), [barcode]: product });
    return { ok: true, product, cached: false };
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    const offline =
      typeof navigator !== "undefined" && navigator.onLine === false;
    return { ok: false, reason: offline ? "offline" : "error", detail };
  }
}

/**
 * Search packaged products by name. Returns [] rather than throwing — this is
 * always a supplement to the local results, never the only source.
 */
export async function searchProducts(query: string, limit = 8): Promise<OffProduct[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  try {
    const url =
      `${API}/cgi/search.pl?search_terms=${encodeURIComponent(q)}` +
      `&search_simple=1&action=process&json=1&page_size=${limit}&fields=${FIELDS}`;
    const data = (await getJson(url)) as { products?: Record<string, unknown>[] };
    if (!Array.isArray(data?.products)) return [];

    const mapped = data.products
      .map(mapOffProduct)
      .filter((p): p is OffProduct => p !== null && p.name !== "Unnamed product");

    if (mapped.length) {
      const cache = readCache();
      for (const p of mapped) if (p.barcode) cache[p.barcode] = p;
      writeCache(cache);
    }
    return mapped;
  } catch {
    return [];
  }
}

/**
 * Camera scanning where the browser supports it. Safari does not implement
 * BarcodeDetector, so the UI must always keep the type-it-in path available.
 */
export function canScanBarcode(): boolean {
  return typeof window !== "undefined" && "BarcodeDetector" in window;
}

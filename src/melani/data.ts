/**
 * Snapshot of Wonder health profile data — used so exported pages look like the live app.
 * Source of truth is Wonder itself (Fitness, Labs, Hygiene, Mel).
 */

export const PROFILE = {
  name: "Melani Shrestha",
  ageDisplay: "18",
  sex: "female",
  height: "5 ft 0 in",
  provider: "Ververis, Megan",
  patientId: "2581279882",
  conditions: "migraine/chronic pain; cardio/metabolic monitoring",
  waterGoalMl: 3500, // 3.5 L — linked to Habits “3.5L water + Diet”
};

export const MACRO_GOALS = {
  protein_g: 125,
  calories: 2000,
  carbs_g: 200,
  fat_g: 65,
  fiber_g: 30,
};

/** Empty day until you log a usual (rings start at 0) */
export const MACRO_CURRENT = {
  protein_g: 0,
  calories: 0,
  carbs_g: 0,
  fat_g: 0,
  fiber_g: 0,
};

/** Optional groups under "What's in it" (Base / Seeds / Fruit / …) */
export type MealSection = {
  title?: string; // omit title for the top group (yogurt + kefir)
  items: string[];
};

/** Ingredient row tone for list color (breakfast groups). */
export type MealMeasureTone = "base" | "nuts" | "seed" | "fruit" | "default";

/**
 * Buy math for one breakfast line.
 *   Product (Source · size)
 *   dailyLabel; buy line
 *   Lasts …
 * Hover multi-buy total → per-pack · hover lasts → per-pack days
 */
export type MealShopProduct = {
  /** Full product name — e.g. Fage Total 0% Nonfat Greek Yogurt */
  product: string;
  /** e.g. Costco — omitted from parens when empty */
  source?: string;
  /** Pack size (e.g. 48 oz) */
  size: string;
  url?: string;
  /** USD per single pack */
  priceUsd?: number;
  /** Usable grams (or ml) in one pack — for math */
  packG: number;
  /** Daily use in same unit as packG */
  dailyG: number;
  buyQty?: number;
  /** tub · bag · bottle */
  unit?: string;
  /**
   * Exact line-2 daily text (no trailing buy).
   * e.g. "150 g/day" · "8 g/day (2 tsp)" · "5–6 g/day (4 whole almonds)"
   */
  dailyLabel?: string;
  /** Override line-3 when range (e.g. Lasts ~ 7–8 months) */
  lastsLabel?: string;
};

/** Macros for one ingredient line or full meal (daily amount). */
export type MealMacros = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
};

/** One line in the ingredients list */
export type MealMeasure = {
  item: string;
  /** Fallback daily label if shop.dailyLabel missing */
  amount: string;
  how?: string;
  tone?: MealMeasureTone;
  shop?: MealShopProduct;
  /**
   * Per-item macros for the daily amount (not shown on Ingredients —
   * lives under Macro breakdown toggle).
   */
  macros?: MealMacros;
};

export type MealPreset = {
  id: string;
  slot: string; // breakfast | lunch | dinner | snack
  title: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  notes?: string;
  /** Flat list (always kept for Mel + simple UIs) */
  ingredients: string[];
  /** Optional grouped list (legacy / export) */
  sections?: MealSection[];
  /** Ingredients list under one toggle */
  measures?: MealMeasure[];
};

/** Sum all measure lines that have macros (partial lists OK — e.g. lunch). */
export function sumMeasureMacros(
  measures: MealMeasure[] | undefined
): MealMacros | null {
  if (!measures?.length) return null;
  const withMacros = measures.filter((m) => m.macros);
  if (!withMacros.length) return null;

  const raw = withMacros.reduce(
    (acc, m) => ({
      calories: acc.calories + (m.macros?.calories ?? 0),
      protein_g: acc.protein_g + (m.macros?.protein_g ?? 0),
      carbs_g: acc.carbs_g + (m.macros?.carbs_g ?? 0),
      fat_g: acc.fat_g + (m.macros?.fat_g ?? 0),
      fiber_g: acc.fiber_g + (m.macros?.fiber_g ?? 0),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 }
  );
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return {
    calories: r1(raw.calories),
    protein_g: r1(raw.protein_g),
    carbs_g: r1(raw.carbs_g),
    fat_g: r1(raw.fat_g),
    fiber_g: r1(raw.fiber_g),
  };
}

/** One priced line’s burn-rate math (for spend dropdown). */
export type MealShopCostLine = {
  name: string;
  priceUsd: number;
  packG: number;
  dailyG: number;
  perDay: number;
  perMonth: number;
  perYear: number;
  /** e.g. ($9.69 ÷ 1361 g) × 180 g/day */
  formula: string;
};

/**
 * Annual / monthly spend for priced shop lines only.
 * Burn rate: (price / packG) × dailyG × 365 — bag lasts >1 yr still OK.
 */
export function mealShopYearCost(measures: MealMeasure[] | undefined): {
  perDay: number;
  perMonth: number;
  perYear: number;
  pricedCount: number;
  totalCount: number;
  unpriced: string[];
  lines: MealShopCostLine[];
} | null {
  if (!measures?.length) return null;
  let perDay = 0;
  let pricedCount = 0;
  let totalCount = 0;
  const lines: MealShopCostLine[] = [];
  const unpriced: string[] = [];
  for (const m of measures) {
    const s = m.shop;
    if (!s) continue;
    totalCount += 1;
    const name = s.product || m.item;
    if (s.priceUsd == null || s.packG <= 0 || s.dailyG <= 0) {
      unpriced.push(name);
      continue;
    }
    pricedCount += 1;
    const lineDay = (s.priceUsd / s.packG) * s.dailyG;
    perDay += lineDay;
    lines.push({
      name,
      priceUsd: s.priceUsd,
      packG: s.packG,
      dailyG: s.dailyG,
      perDay: lineDay,
      perMonth: lineDay * (365 / 12),
      perYear: lineDay * 365,
      formula: `($${s.priceUsd.toFixed(2)} ÷ ${Math.round(s.packG)} g) × ${s.dailyG} g/day`,
    });
  }
  if (pricedCount === 0) return null;
  const perYear = perDay * 365;
  const perMonth = perYear / 12;
  return {
    perDay,
    perMonth,
    perYear,
    pricedCount,
    totalCount,
    unpriced,
    lines,
  };
}

/** Short label for buy-together groups */
function shopShortName(product: string): string {
  if (/yogurt|fage/i.test(product)) return "Yogurt";
  if (/kefir/i.test(product)) return "Kefir";
  if (/chia/i.test(product)) return "Chia";
  if (/flax/i.test(product)) return "Flax";
  if (/cinnamon/i.test(product)) return "Cinnamon";
  if (/macadamia/i.test(product)) return "Macadamia";
  if (/walnut/i.test(product)) return "Walnuts";
  if (/almond/i.test(product)) return "Almonds";
  return product.split(/\s+/).slice(0, 2).join(" ");
}

export type MealShopBuyItem = {
  short: string;
  full: string;
  /** Days one purchase (× buyQty) lasts at daily burn */
  daysPerBuy: number;
  daysLabel: string;
  buyQty: number;
  unit: string;
};

export type MealShopBuyGroup = {
  /** e.g. every ~10 days */
  cadence: string;
  /** Sort key */
  days: number;
  items: MealShopBuyItem[];
  /** Short line for UI: Kefir · Yogurt */
  names: string;
};

/**
 * Group ingredients by rebuy interval so you don’t “buy everything” on one trip.
 * Cadence = (packG ÷ dailyG) × buyQty.
 */
export function mealShopBuyGroups(
  measures: MealMeasure[] | undefined
): MealShopBuyGroup[] {
  if (!measures?.length) return [];
  const items: MealShopBuyItem[] = [];
  for (const m of measures) {
    const s = m.shop;
    if (!s || s.packG <= 0 || s.dailyG <= 0) continue;
    const qty = Math.max(1, s.buyQty ?? 1);
    const daysPerBuy = (s.packG / s.dailyG) * qty;
    const full = s.product || m.item;
    items.push({
      short: shopShortName(full),
      full,
      daysPerBuy,
      daysLabel: formatDuration(daysPerBuy).replace(/^~\s*/, "~"),
      buyQty: qty,
      unit: s.unit || "pack",
    });
  }
  if (!items.length) return [];

  // Bucket by rebuy window (shopping-realistic, not “all at once”)
  type BucketId = "week" | "3wk" | "6wk" | "quarter" | "half";
  const bucketOf = (d: number): BucketId => {
    if (d <= 12) return "week";
    if (d <= 28) return "3wk";
    if (d <= 55) return "6wk";
    if (d <= 110) return "quarter";
    return "half";
  };
  const cadenceOf = (id: BucketId, avgDays: number): string => {
    if (id === "week") return `every ${formatDuration(avgDays)}`;
    if (id === "3wk") return `every ${formatDuration(avgDays)}`;
    if (id === "6wk") return `every ${formatDuration(avgDays)}`;
    if (id === "quarter") return `every ${formatDuration(avgDays)}`;
    return `every ${formatDuration(avgDays)} · pantry restock`;
  };

  const buckets = new Map<BucketId, MealShopBuyItem[]>();
  for (const it of items) {
    const id = bucketOf(it.daysPerBuy);
    const arr = buckets.get(id) || [];
    arr.push(it);
    buckets.set(id, arr);
  }

  const order: BucketId[] = ["week", "3wk", "6wk", "quarter", "half"];
  const groups: MealShopBuyGroup[] = [];
  for (const id of order) {
    const arr = buckets.get(id);
    if (!arr?.length) continue;
    arr.sort((a, b) => a.daysPerBuy - b.daysPerBuy);
    const avg =
      arr.reduce((s, x) => s + x.daysPerBuy, 0) / Math.max(1, arr.length);
    groups.push({
      cadence: cadenceOf(id, avg),
      days: avg,
      items: arr,
      names: arr
        .map((x) =>
          x.buyQty > 1 ? `${x.short} ×${x.buyQty}` : x.short
        )
        .join(" · "),
    });
  }
  return groups;
}

/**
 * Game-theory Instacart / Costco free-delivery play.
 * Costco on Instacart+: $0 delivery fee on orders $35+ (service fees/tips still apply).
 * Strategy = anchor on the shortest rebuy, never ship a lone small item, pull-forward
 * pantry only when the cart would otherwise miss $35 or waste a paid trip.
 */
export type MealShopInstacartPlay = {
  /** Shortest rebuy (days) — usually kefir */
  anchorDays: number;
  anchorName: string;
  /** Costco free-delivery floor w/ Instacart+ */
  freeShipMinUsd: number;
  /** One-line play */
  headline: string;
  /** Single-spaced rules */
  rules: string[];
};

export function mealShopInstacartPlay(
  measures: MealMeasure[] | undefined
): MealShopInstacartPlay | null {
  const groups = mealShopBuyGroups(measures);
  if (!groups.length) return null;

  const all = groups.flatMap((g) => g.items);
  all.sort((a, b) => a.daysPerBuy - b.daysPerBuy);
  const anchor = all[0];
  const freeShipMinUsd = 35; // Costco + Instacart+ threshold

  const frequent = all.filter((x) => x.daysPerBuy <= 28);
  const medium = all.filter((x) => x.daysPerBuy > 28 && x.daysPerBuy <= 110);
  const pantry = all.filter((x) => x.daysPerBuy > 110);

  const rules: string[] = [
    `Costco free delivery: Instacart+ · cart ≥ $${freeShipMinUsd} (service fee/tip still possible)`,
    `Anchor trip every ${anchor.daysLabel.replace(/^~\s*/, "~")} · always include ${anchor.short}`,
  ];

  if (frequent.length > 1) {
    const others = frequent
      .filter((x) => x.short !== anchor.short)
      .map((x) => `${x.short} (every ${x.daysLabel.replace(/^~\s*/, "~")})`)
      .join(" · ");
    if (others) {
      rules.push(
        `Same trip when due: ${others} — never pay ship for these alone`
      );
    }
  }

  if (medium.length) {
    rules.push(
      `Pull-forward on a full cart: ${medium.map((x) => x.short).join(" · ")} when ≤1 week from empty`
    );
  }

  if (pantry.length) {
    rules.push(
      `Pantry 1–2×/yr only: ${pantry.map((x) => x.short).join(" · ")} — stack on a $35+ Costco order, not a solo bag`
    );
  }

  rules.push(
    `If cart < $${freeShipMinUsd}: add next-due item or pantry, never checkout under floor`
  );

  const headline = `Every ${anchor.daysLabel.replace(/^~\s*/, "~")}: ${anchor.short} + whatever’s due · hit $${freeShipMinUsd}+`;

  return {
    anchorDays: anchor.daysPerBuy,
    anchorName: anchor.short,
    freeShipMinUsd,
    headline,
    rules,
  };
}

const OZ = 28.3495;
const LB = 453.592;

/** e.g. ~ 18 days · ~ 5.6 mo (space after ~) */
function formatDuration(days: number): string {
  if (days >= 60) {
    const mo = days / 30.44;
    return `~ ${mo.toFixed(1)} mo`;
  }
  return `~ ${Math.round(days)} days`;
}

function pluralUnit(qty: number, unit: string): string {
  if (qty === 1) return unit;
  if (unit.endsWith("s")) return unit;
  return `${unit}s`;
}

/**
 * Pack run-out for the fixed 3-line layout:
 *   Product (Source · size)
 *   150 g/day; 2 tubs at once: $19.38
 *   Lasts ~ 18 days
 */
export function shopRunOut(
  p: MealShopProduct,
  dailyAmountLabel?: string
): {
  metaParen: string;
  dailyPart: string;
  buyPart: string | null;
  lastsLine: string;
  qty: number;
  unit: string;
  pricePerPackTip: string | null;
  daysTip: string | null;
} {
  const qty = Math.max(1, p.buyQty ?? 1);
  const unit = p.unit || "pack";
  const units = pluralUnit(qty, unit);
  const daysPerPack = p.dailyG > 0 ? p.packG / p.dailyG : 0;
  const daysTotal = daysPerPack * qty;
  const metaParen = p.source ? `${p.source} · ${p.size}` : p.size;

  // Prefer explicit dailyLabel on product, then amount arg, then raw g
  let dailyPart =
    p.dailyLabel?.trim() ||
    (dailyAmountLabel && dailyAmountLabel.trim()) ||
    `${p.dailyG} g/day`;
  if (!/\/day/i.test(dailyPart)) {
    dailyPart = `${dailyPart}/day`;
  }

  // Multi-buy: "2 tubs at once: $19.38" · single: "1 bag: $11.06" or "1 bottle"
  let buyPart: string | null = null;
  if (qty > 1 && p.priceUsd != null) {
    buyPart = `; ${qty} ${units} at once: $${(p.priceUsd * qty).toFixed(2)}`;
  } else if (qty > 1) {
    buyPart = `; ${qty} ${units} at once`;
  } else if (p.priceUsd != null) {
    buyPart = `; 1 ${unit}: $${p.priceUsd.toFixed(2)}`;
  } else {
    buyPart = `; 1 ${unit}`;
  }

  const pricePerPackTip =
    p.priceUsd != null ? `$${p.priceUsd.toFixed(2)} / ${unit}` : null;
  const daysTip =
    qty > 1 ? `${formatDuration(daysPerPack)} / ${unit}` : null;

  const lastsLine =
    p.lastsLabel?.trim() || `Lasts ${formatDuration(daysTotal)}`;

  return {
    metaParen,
    dailyPart,
    buyPart,
    lastsLine,
    qty,
    unit,
    pricePerPackTip,
    daysTip,
  };
}

/**
 * Melani locked meals for the trial.
 * Breakfast = exact 8-product Costco / brand list (order locked).
 * Lunch = Super Veggie.
 */
export const MEAL_PRESETS: MealPreset[] = [
  {
    id: "breakfast_usual",
    slot: "breakfast",
    title: "Breakfast",
    // Locked totals (+ blueberries 60g · strawberries 30g)
    calories: 410.2,
    protein_g: 29.6,
    carbs_g: 31.2,
    fat_g: 20.2,
    fiber_g: 8.2,
    notes: "Locked 8-product breakfast · pack math · macro breakdown",
    ingredients: [
      "Fage Total 0% Nonfat Greek Yogurt: 180 g/day",
      "Mayorga Organic Chia Seeds: 8 g/day (2 tsp)",
      "Spectrum Cold Milled Organic Ground Flaxseed: 2.7 g/day (1 tsp)",
      "Simply Organic Ceylon Cinnamon: 1.3 g/day (½ tsp)",
      "Kirkland Signature Dry Roasted Macadamia Nuts: 1 nut/day (3.5 g)",
      "Kirkland Signature Walnut Halves: 3 walnuts/day (15 g)",
      "Kirkland Signature Supreme Whole Almonds: 5 almonds/day (6 g)",
      "Lifeway Plain Unsweetened Kefir: 100 ml/day",
      "Blueberries: 60 g/day",
      "Strawberries: 30 g/day",
    ],
    measures: [
      {
        item: "Fage Total 0% Nonfat Greek Yogurt",
        amount: "180 g/day",
        tone: "base",
        macros: {
          calories: 106.2,
          protein_g: 18.5,
          carbs_g: 6.5,
          fat_g: 0.0,
          fiber_g: 0.0,
        },
        shop: {
          product: "Fage Total 0% Nonfat Greek Yogurt",
          source: "Costco",
          size: "48 oz",
          url: "https://www.instacart.com/products/123053-fage-total-0-milkfat-all-natural-nonfat-greek-strained-yogurt-48-oz?retailerSlug=costco",
          priceUsd: 9.69,
          packG: 48 * OZ,
          dailyG: 180,
          buyQty: 3,
          unit: "tub",
          dailyLabel: "180 g/day",
          // 3 × 48 oz ÷ 180 g/day ≈ 22.7 d
          lastsLabel: "Lasts ~ 23 days",
        },
      },
      {
        item: "Mayorga Organic Chia Seeds",
        amount: "8 g/day (2 tsp)",
        tone: "seed",
        macros: {
          calories: 38.9,
          protein_g: 1.4,
          carbs_g: 3.4,
          fat_g: 2.5,
          fiber_g: 2.7,
        },
        shop: {
          product: "Mayorga Organic Chia Seeds",
          source: "Costco",
          size: "3 lb",
          url: "https://www.instacart.com/products/19649120-mayorga-organics-organic-chia-3-lb-3-lb?retailerSlug=costco",
          priceUsd: 11.06,
          packG: 3 * LB,
          dailyG: 8,
          buyQty: 1,
          unit: "bag",
          dailyLabel: "8 g/day (2 tsp)",
          lastsLabel: "Lasts ~ 5.5 months",
        },
      },
      {
        item: "Spectrum Cold Milled Organic Ground Flaxseed",
        amount: "2.7 g/day (1 tsp)",
        tone: "seed",
        macros: {
          calories: 14.4,
          protein_g: 0.5,
          carbs_g: 0.8,
          fat_g: 1.1,
          fiber_g: 0.7,
        },
        shop: {
          product: "Spectrum Cold Milled Organic Ground Flaxseed",
          size: "14 oz",
          url: "https://www.instacart.com/products/50549-spectrum-cold-milled-organic-ground-premium-flaxseed-dietary-supplement-14-oz",
          packG: 14 * OZ,
          dailyG: 2.7,
          buyQty: 1,
          unit: "bag",
          dailyLabel: "2.7 g/day (1 tsp)",
          lastsLabel: "Lasts ~ 5 months",
        },
      },
      {
        item: "Simply Organic Ceylon Cinnamon",
        amount: "1.3 g/day (½ tsp)",
        tone: "seed",
        macros: {
          calories: 3.2,
          protein_g: 0.1,
          carbs_g: 1.0,
          fat_g: 0.0,
          fiber_g: 0.7,
        },
        shop: {
          product: "Simply Organic Ceylon Cinnamon",
          size: "2.08 oz",
          url: "https://www.instacart.com/products/2889569-simply-organic-ceylon-cinnamon-2-08-oz",
          packG: 2.08 * OZ,
          dailyG: 1.3,
          buyQty: 1,
          unit: "bottle",
          dailyLabel: "1.3 g/day (½ tsp)",
          lastsLabel: "Lasts ~ 45 days",
        },
      },
      {
        item: "Kirkland Signature Dry Roasted Macadamia Nuts",
        amount: "1 macadamia nut/day (3.5 g)",
        tone: "nuts",
        macros: {
          calories: 25.1,
          protein_g: 0.3,
          carbs_g: 0.5,
          fat_g: 2.7,
          fiber_g: 0.3,
        },
        shop: {
          product: "Kirkland Signature Dry Roasted Macadamia Nuts",
          source: "Costco",
          size: "24 oz",
          url: "https://www.instacart.com/products/18475083-kirkland-signature-dry-roasted-macadamia-nuts-with-sea-salt-24-oz?retailerSlug=costco",
          priceUsd: 19.52,
          packG: 24 * OZ,
          dailyG: 3.5,
          buyQty: 1,
          unit: "bag",
          dailyLabel: "1 macadamia nut/day",
          lastsLabel: "Lasts ~ 6.4 months",
        },
      },
      {
        item: "Kirkland Signature Walnut Halves",
        amount: "3 walnuts/day (15 g)",
        tone: "nuts",
        macros: {
          calories: 98.1,
          protein_g: 2.3,
          carbs_g: 2.1,
          fat_g: 9.8,
          fiber_g: 1.0,
        },
        shop: {
          product: "Kirkland Signature Walnut Halves",
          source: "Costco",
          size: "3 lb",
          url: "https://www.instacart.com/products/57207-kirkland-signature-walnuts-3-lb-3-lb?retailerSlug=costco",
          priceUsd: 17.15,
          packG: 3 * LB,
          dailyG: 15,
          buyQty: 1,
          unit: "bag",
          dailyLabel: "3 walnuts/day",
          lastsLabel: "Lasts ~ 3 months",
        },
      },
      {
        item: "Kirkland Signature Supreme Whole Almonds",
        amount: "5 almonds/day (6 g)",
        tone: "nuts",
        macros: {
          calories: 34.7,
          protein_g: 1.3,
          carbs_g: 1.3,
          fat_g: 3.0,
          fiber_g: 0.8,
        },
        shop: {
          product: "Kirkland Signature Supreme Whole Almonds",
          source: "Costco",
          size: "3 lb",
          url: "https://www.instacart.com/products/19231219-kirkland-signature-whole-almonds-3-lb-3-lb?retailerSlug=costco",
          priceUsd: 17.15,
          packG: 3 * LB,
          dailyG: 6,
          buyQty: 1,
          unit: "bag",
          dailyLabel: "5 almonds/day",
          // 3 lb ÷ 6 g ≈ 227 d ≈ 7.5 mo
          lastsLabel: "Lasts ~ 7.5 months",
        },
      },
      {
        item: "Lifeway Plain Unsweetened Kefir",
        amount: "100 ml/day",
        tone: "base",
        macros: {
          calories: 45.8,
          protein_g: 4.6,
          carbs_g: 4.6,
          fat_g: 0.8,
          fiber_g: 0.0,
        },
        shop: {
          product: "Lifeway Plain Unsweetened Kefir",
          size: "32 fl oz",
          url: "https://www.instacart.com/products/72068-lifeway-kefir-plain-unsweetened-cultured-lowfat-milk-32-fl-oz",
          packG: 32 * 29.5735, // fl oz → ml
          dailyG: 100,
          // 2 bottles → ~19 d, stacks with yogurt ×3 (~23 d) on same trip
          buyQty: 2,
          unit: "bottle",
          dailyLabel: "100 ml/day",
          lastsLabel: "Lasts ~ 19 days",
        },
      },
      {
        item: "Blueberries",
        amount: "60 g/day",
        tone: "fruit",
        macros: {
          calories: 34.2,
          protein_g: 0.4,
          carbs_g: 8.7,
          fat_g: 0.2,
          fiber_g: 1.4,
        },
      },
      {
        item: "Strawberries",
        amount: "30 g/day",
        tone: "fruit",
        macros: {
          calories: 9.6,
          protein_g: 0.2,
          carbs_g: 2.3,
          fat_g: 0.1,
          fiber_g: 0.6,
        },
      },
    ],
  },
  {
    id: "lunch_super_veggie",
    slot: "lunch",
    title: "Lunch · Quinoa bowl",
    // Easy path: quinoa + frozen broccoli + frozen asparagus + eggs + pantry
    // Protein floor ≥35 g → 3 large eggs (easiest lever; no extra cooking skill)
    calories: 498,
    protein_g: 35.5,
    carbs_g: 49.9,
    fat_g: 19.5,
    fiber_g: 13.9,
    notes:
      "Easiest plate · 3 eggs to clear 35 g protein · frozen broccoli + asparagus + quinoa",
    ingredients: [
      "Quinoa: 45 g dry (≈ 135–150 g cooked)",
      "Kirkland Organic Broccoli Florets (frozen): 250 g",
      "Frozen asparagus: 150 g",
      "Eggs: 3 large",
      "Garlic: 1 clove (jarred minced / frozen cube — no peel)",
      "Cumin: 1 Tbsp",
      "Apple cider vinegar: 1 Tbsp",
      "Lime: 1 Tbsp juice (bottled ok)",
      "Hemp seeds: 1 Tbsp (topping)",
      "Extra virgin olive oil: 1 Tbsp (topping)",
      "Optional: pinch of potassium salt (Nu-Salt)",
    ],
    measures: [
      {
        item: "Quinoa",
        amount: "45 g dry (≈ 135–150 g cooked)",
        macros: {
          // USDA dry quinoa scaled to 45 g
          calories: 166,
          protein_g: 6.1,
          carbs_g: 29.3,
          fat_g: 2.7,
          fiber_g: 3.1,
        },
      },
      {
        item: "Kirkland Organic Broccoli Florets",
        amount: "250 g (frozen)",
        macros: {
          calories: 65,
          protein_g: 7.0,
          carbs_g: 12.0,
          fat_g: 0.7,
          fiber_g: 7.5,
        },
      },
      {
        // Frozen asparagus = easiest second veg (no chop; microwave/steam/roast from frozen)
        item: "Asparagus",
        amount: "150 g (frozen)",
        macros: {
          calories: 30,
          protein_g: 3.3,
          carbs_g: 5.9,
          fat_g: 0.2,
          fiber_g: 3.2,
        },
      },
      {
        item: "Eggs",
        amount: "3 large",
        macros: {
          // 2 large was 155 / 12.6 → ×1.5 for 3
          calories: 233,
          protein_g: 18.9,
          carbs_g: 1.7,
          fat_g: 15.9,
          fiber_g: 0,
        },
      },
      {
        item: "Garlic",
        amount: "1 clove (jarred or frozen minced)",
        macros: {
          calories: 4,
          protein_g: 0.2,
          carbs_g: 1.0,
          fat_g: 0,
          fiber_g: 0.1,
        },
      },
      {
        item: "Cumin",
        amount: "1 Tbsp",
        tone: "seed",
      },
      {
        item: "Apple cider vinegar",
        amount: "1 Tbsp",
      },
      {
        item: "Lime juice",
        amount: "1 Tbsp (bottled ok)",
        tone: "fruit",
      },
      {
        item: "Hemp seeds",
        amount: "1 Tbsp (topping)",
        tone: "seed",
      },
      {
        item: "Extra virgin olive oil",
        amount: "1 Tbsp (topping)",
      },
      {
        item: "Potassium salt (Nu-Salt)",
        amount: "pinch (optional)",
      },
    ],
  },
  {
    id: "dinner_sockeye",
    slot: "dinner",
    title: "Dinner · Sockeye salmon",
    // Macros locked first — full ingredient/shop list later
    calories: 319,
    protein_g: 47.0,
    carbs_g: 19.3,
    fat_g: 10.1,
    fiber_g: 9.3,
    notes: "Sockeye plate · macros locked · ingredients list later",
    ingredients: [
      "Sockeye salmon: 1 portion",
      "Spinach: 120 g",
      "Asparagus: 200 g",
      "Red bell pepper: 120 g",
    ],
    measures: [
      {
        item: "Sockeye salmon",
        amount: "1 portion",
        macros: {
          calories: 220,
          protein_g: 38.0,
          carbs_g: 0,
          fat_g: 9.0,
          fiber_g: 0,
        },
      },
      {
        item: "Spinach",
        amount: "120 g",
        tone: "default",
        macros: {
          calories: 28,
          protein_g: 3.4,
          carbs_g: 4.3,
          fat_g: 0.5,
          fiber_g: 2.6,
        },
      },
      {
        item: "Asparagus",
        amount: "200 g",
        macros: {
          calories: 40,
          protein_g: 4.4,
          carbs_g: 7.8,
          fat_g: 0.2,
          fiber_g: 4.2,
        },
      },
      {
        item: "Red bell pepper",
        amount: "120 g",
        tone: "fruit",
        macros: {
          calories: 31,
          protein_g: 1.2,
          carbs_g: 7.2,
          fat_g: 0.4,
          fiber_g: 2.5,
        },
      },
    ],
  },
];

/** Locked slots in the trial (B + L + D). */
export const CORE_DAY_MEAL_IDS = [
  "breakfast_usual",
  "lunch_super_veggie",
  "dinner_sockeye",
] as const;

/** Active meal ids. */
export const FIXED_DAY_MEAL_IDS = MEAL_PRESETS.map((m) => m.id);

/** Planned macros for locked meals. */
export function plannedCoreDayMacros() {
  return MEAL_PRESETS.filter((m) =>
    (CORE_DAY_MEAL_IDS as readonly string[]).includes(m.id)
  ).reduce(
    (acc, m) => ({
      calories: acc.calories + m.calories,
      protein_g: acc.protein_g + m.protein_g,
      carbs_g: acc.carbs_g + m.carbs_g,
      fat_g: acc.fat_g + m.fat_g,
      fiber_g: acc.fiber_g + m.fiber_g,
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 }
  );
}

/** One-line summary for Mel. */
export function fixedDayMenuSummary(): string {
  return MEAL_PRESETS.map(
    (m) => `${m.title}: ${m.protein_g}g protein · ${m.calories} cal`
  ).join(" · ");
}

/** Optional pack math for a supplement (same burn-rate idea as breakfast). */
export type SupplementShop = {
  /** Shown in double-tap buy panel (linked) */
  product: string;
  url?: string;
  source?: string;
  size: string;
  /** Grams in one pack */
  packG: number;
  /** Grams per day */
  dailyG: number;
  priceUsd?: number;
  buyQty?: number;
  unit?: string;
  /** Override e.g. Lasts ~ 1 year */
  lastsLabel?: string;
};

export type DailySupplement = {
  id: string;
  name: string;
  dose: string;
  when: string;
  shop?: SupplementShop;
};

/** Daily stack — name · brand/dose · when to take */
export const DAILY_SUPPLEMENTS: DailySupplement[] = [
  {
    id: "vit-d",
    name: "Vitamin D",
    dose: "",
    when: "right after breakfast",
  },
  {
    id: "ashwa",
    name: "Ashwagandha",
    dose: "",
    when: "after dinner",
  },
  {
    id: "creatine",
    name: "Creatine",
    dose: "5 g/day",
    when: "any time · with water",
    shop: {
      // Thorne online — 2 tubs once/year · $80 total ($40/tub)
      product: "Thorne Creatine",
      size: "tub",
      packG: 1.48 * 453.592, // keep burn math · 5 g/day · 2 tubs ≈ year
      dailyG: 5,
      buyQty: 2,
      priceUsd: 40, // per tub · ×2 = $80/year
      unit: "tub",
      url: "https://www.thorne.com/products/dp/creatine",
      lastsLabel: "Lasts ~ 1 year",
    },
  },
];

/** Days / months one purchase lasts at dailyG */
export function supplementPackLasts(shop: SupplementShop): {
  days: number;
  daysLabel: string;
  buyLine: string;
} {
  const qty = Math.max(1, shop.buyQty ?? 1);
  const days = shop.dailyG > 0 ? (shop.packG / shop.dailyG) * qty : 0;
  let daysLabel: string;
  if (shop.lastsLabel) {
    daysLabel = shop.lastsLabel;
  } else if (days >= 60) {
    daysLabel = `Lasts ~ ${(days / 30.44).toFixed(1)} months`;
  } else {
    daysLabel = `Lasts ~ ${Math.round(days)} days`;
  }
  const unit = shop.unit || "pack";
  const units = qty > 1 ? `${qty} ${unit}s at once` : `1 ${unit}`;
  const price =
    shop.priceUsd != null
      ? `: $${(shop.priceUsd * qty).toFixed(0)}`
      : "";
  return {
    days,
    daysLabel,
    buyLine: `${units}${price}`,
  };
}

export type ConsumeLog = {
  done: boolean;
  time: string;
};

export function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const LAB_STATUS = [
  { short: "LDL", value: "120", unit: "mg/dL", badge: "HIGH", chip: "high" },
  { short: "TC", value: "207", unit: "mg/dL", badge: "HIGH", chip: "high" },
  { short: "TG", value: "119", unit: "mg/dL", badge: "HIGH", chip: "high" },
  { short: "Non-HDL", value: "143", unit: "mg/dL", badge: "HIGH", chip: "high" },
  { short: "HDL", value: "64", unit: "mg/dL", badge: "OK", chip: "ok" },
  { short: "A1c", value: "5.3", unit: "%", badge: "OK", chip: "ok" },
  { short: "TSH", value: "1.06", unit: "mIU/L", badge: "OK", chip: "ok" },
];

export const LAB_DRAWS = [
  {
    title: "Quest · 2026-03-26 · Lipids + A1C",
    lines: [
      "Total Cholesterol: 207 mg/dL · HIGH",
      "HDL: 64 mg/dL · OK",
      "Triglycerides: 119 mg/dL · HIGH",
      "LDL: 120 mg/dL · HIGH",
      "Non-HDL: 143 mg/dL · HIGH",
      "A1c: 5.3%",
    ],
  },
  {
    title: "Quest · 2026-04-07 · Thyroid",
    lines: ["TSH: 1.06 mIU/L"],
  },
  {
    title: "USC · 2026-03-25 · CBC + CMP",
    lines: ["WBC 9.3 · RBC 4.94 · HGB 13.6 · HCT 40.2 · PLT 223", "Albumin 4.8 · ALT 14 · ALP 66 · AST 22"],
  },
];

export const GYM_WEEK = [
  { day: "Mon", title: "Glutes + Abs" },
  { day: "Tue", title: "Lower / plan" },
  { day: "Wed", title: "Plan day" },
  { day: "Thu", title: "Upper + Abs" },
  { day: "Fri", title: "Glutes + Abs" },
  { day: "Sat", title: "Glutes + Abs" },
  { day: "Sun", title: "Rest / cardio" },
];

export const CYCLE = {
  lastPeriodStart: "2026-06-07",
  cycleLengthDays: 28,
  periodLengthDays: 5,
  estimated: false,
  phase: "Luteal",
  statusLine: "Cycle day tracking · last period Jun 7, 2026",
  lastPeriodDisplay: "Jun 7, 2026",
  predictedNextDisplay: "Jul 5, 2026",
  predictedOvulationDisplay: "Jun 21, 2026",
  flowLevels: ["spotting", "light", "medium", "heavy"] as const,
  loggedFlow: {
    "2026-06-07": "medium",
    "2026-06-08": "medium",
    "2026-06-09": "light",
    "2026-06-10": "light",
    "2026-06-11": "spotting",
  } as Record<string, string>,
};

export const PHASES = [
  { id: "period", label: "Period" },
  { id: "follicular", label: "Follicular" },
  { id: "ovulation", label: "Ovulation" },
  { id: "luteal", label: "Luteal" },
  { id: "pre_period", label: "Pre-period" },
];

export type CycleDay = {
  iso: string;
  weekday: string;
  label: string;
  flow: string | null;
  isToday: boolean;
  isPeriodStart: boolean;
  isPredicted: boolean;
  isOvulation: boolean;
};

function parseISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function fmtISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** ~1 cycle of days like My Data period calendar */
export function buildCycleCalendar(today = new Date()): CycleDay[] {
  const start = parseISO(CYCLE.lastPeriodStart);
  const days: CycleDay[] = [];
  const todayIso = fmtISO(today);
  const wd = ["S", "M", "T", "W", "T", "F", "S"];

  for (let i = 0; i < CYCLE.cycleLengthDays; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = fmtISO(d);
    const dayNum = i + 1;
    const ovStart = 13;
    const ovEnd = 15;
    const isPeriod = dayNum <= CYCLE.periodLengthDays;
    const flow =
      CYCLE.loggedFlow[iso] ||
      (isPeriod ? (dayNum <= 2 ? "medium" : dayNum <= 4 ? "light" : "spotting") : null);

    days.push({
      iso,
      weekday: wd[d.getDay()],
      label: String(d.getDate()),
      flow,
      isToday: iso === todayIso,
      isPeriodStart: dayNum === 1,
      isPredicted: false,
      isOvulation: dayNum >= ovStart && dayNum <= ovEnd,
    });
  }
  return days;
}

export function pct(current: number, goal: number): number {
  if (goal <= 0) return 0;
  return Math.min(100, Math.max(0, (current / goal) * 100));
}

export const CIRC = {
  cal: 2 * Math.PI * 88,
  protein: 2 * Math.PI * 77,
  carbs: 2 * Math.PI * 66,
  fat: 2 * Math.PI * 55,
  fiber: 2 * Math.PI * 44,
};

/** Wonder app origin (single app — no separate Dr. Melani tab). */
export const LIVE_APP = "http://127.0.0.1:5173";

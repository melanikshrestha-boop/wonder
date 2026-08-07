/**
 * Snapshot of Wonder health profile data — used so exported pages look like the live app.
 * Source of truth is Wonder itself (Fitness, Labs, Hygiene, Mel).
 */

export const PROFILE = {
  name: "Melani Shrestha",
  ageDisplay: "19",
  ageYears: 19,
  sex: "female" as const,
  height: "5 ft 0 in",
  provider: "Ververis, Megan",
  patientId: "2581279882",
  conditions:
    "migraine/chronic pain; cardio/metabolic monitoring; sugar-sensitive (avoid added sugar); quarterly blood tests",
  waterGoalMl: 3500, // 3.5 L — linked to Habits “3.5L water + Diet”
};

export const MACRO_GOALS = {
  protein_g: 150,
  /**
   * Calorie deficit target (19F). Was 2000; Melani locked 1800 for now.
   * Locked full steak day still ~1950 — salmon dinner or smaller oil lands closer.
   */
  calories: 1800,
  carbs_g: 250, // max
  /**
   * Fat ceiling for deficit (was 110 g).
   * Plan: 1 tbsp Snake Oil on dinner only + eggs + steak/nuts.
   * Steak day ~78 g · sockeye day ~70 g — sockeye fits under 75 cleanly.
   */
  fat_g: 75,
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

/**
 * Daily vitamin *targets* for Melani: 19-year-old female.
 *
 * These are “daily need” amounts from U.S. nutrition science
 * (Dietary Reference Intakes for women ages 19–30 — same band as age 19).
 *
 * Plain English:
 * - Daily need = how much a healthy 19-year-old woman should get most days
 *   so her body is covered (bones, blood, thyroid, etc.).
 * - This is NOT a “max / do not exceed” line. The safe upper limit is higher
 *   and lives in VITAMIN_SAFE_UPPER if we show it later.
 *
 * Ring fills toward daily need. If her stack gives more than need, the ring
 * stays full (100%) — that is OK, not an error.
 */
export const VITAMIN_GOALS = {
  /** Vitamin D — daily need 15 mcg (600 IU) for women 19–30 */
  d_mcg: 15,
  /** Vitamin C — daily need 75 mg for women 19+ */
  c_mg: 75,
  /** Folate — daily need 400 mcg for women 19+ (important in childbearing years) */
  folate_mcg: 400,
  /** Calcium — daily need 1000 mg for women 19–50 (peak bone years) */
  ca_mg: 1000,
  /** Magnesium — daily need 310 mg for women 19–30 (320 if 31+) */
  mg_mg: 310,
  /** Vitamin B12 — daily need 2.4 mcg for women 19+ */
  b12_mcg: 2.4,
  /** Zinc — daily need 8 mg for women 19+ */
  zn_mg: 8,
  /** Iodine — daily need 150 mcg for women 19+ */
  iodine_mcg: 150,
  /** Selenium — daily need 55 mcg for women 19+ */
  se_mcg: 55,
  /** Vitamin K — adequate intake 90 mcg for women 19+ (no formal “need” number) */
  k_mcg: 90,
} as const;

/**
 * Safe upper daily amounts (food + pills) for adult women — do not treat as goals.
 * Only for warnings later. Not shown as the ring denominator.
 */
export const VITAMIN_SAFE_UPPER = {
  d_mcg: 100, // 4000 IU
  c_mg: 2000,
  folate_mcg: 1000, // from fortified/supplement forms
  ca_mg: 2500,
  /** Magnesium from *pills* only (food magnesium has no upper like this) */
  mg_mg: 350,
  // B12: no official upper for healthy people
  zn_mg: 40,
  iodine_mcg: 1100,
  se_mcg: 400,
  // Vitamin K: no official upper for healthy people not on blood thinners
} as const;

export type VitaminTotals = {
  d_mcg: number;
  c_mg: number;
  folate_mcg: number;
  ca_mg: number;
  mg_mg: number;
  b12_mcg: number;
  zn_mg: number;
  iodine_mcg: number;
  se_mcg: number;
  k_mcg: number;
};

/** Zero until morning stack is logged */
export const VITAMIN_EMPTY: VitaminTotals = {
  d_mcg: 0,
  c_mg: 0,
  folate_mcg: 0,
  ca_mg: 0,
  mg_mg: 0,
  b12_mcg: 0,
  zn_mg: 0,
  iodine_mcg: 0,
  se_mcg: 0,
  k_mcg: 0,
};

/**
 * Blueprint morning stack vitamins — Essential Capsules + Softgel K1 + Longevity Mix.
 * Sources: NIH DSLD 328204 + Blueprint Product Nutrition PDF.
 *
 * Vitamin K on the ring = **K1 only** (softgel 1500 mcg).
 * MK-4 / MK-7 stay on the Softgel actives list — do NOT sum them into k_mcg
 * (that made the ring look like “7100 mcg K” vs a 90 mcg K1 AI).
 */
export const VITAMIN_STACK_ON_MORNING: VitaminTotals = {
  d_mcg: 50, // 2000 IU Essential Capsules
  c_mg: 250, // Longevity Mix ascorbic acid
  folate_mcg: 200, // L-5-MTHF Essential Capsules
  ca_mg: 600, // 250 capsules + 350 CaAKG mix
  mg_mg: 150, // Longevity Mix
  b12_mcg: 125,
  zn_mg: 15,
  iodine_mcg: 200,
  se_mcg: 30,
  k_mcg: 1500, // Softgel K1 only (not MK-4 + MK-7)
};

/** Partial vitamin slice on a measure line (food or pill). */
export type VitaminSlice = Partial<VitaminTotals>;

export function emptyVitamins(): VitaminTotals {
  return { ...VITAMIN_EMPTY };
}

export function addVitamins(
  a: VitaminTotals,
  b: VitaminSlice | null | undefined
): VitaminTotals {
  if (!b) return a;
  return {
    d_mcg: a.d_mcg + (b.d_mcg || 0),
    c_mg: a.c_mg + (b.c_mg || 0),
    folate_mcg: a.folate_mcg + (b.folate_mcg || 0),
    ca_mg: a.ca_mg + (b.ca_mg || 0),
    mg_mg: a.mg_mg + (b.mg_mg || 0),
    b12_mcg: a.b12_mcg + (b.b12_mcg || 0),
    zn_mg: a.zn_mg + (b.zn_mg || 0),
    iodine_mcg: a.iodine_mcg + (b.iodine_mcg || 0),
    se_mcg: a.se_mcg + (b.se_mcg || 0),
    k_mcg: a.k_mcg + (b.k_mcg || 0),
  };
}

export function vitaminsMeaningful(v: VitaminSlice | null | undefined): boolean {
  if (!v) return false;
  return (
    (v.d_mcg || 0) > 0 ||
    (v.c_mg || 0) > 0 ||
    (v.folate_mcg || 0) > 0 ||
    (v.ca_mg || 0) > 0 ||
    (v.mg_mg || 0) > 0 ||
    (v.b12_mcg || 0) > 0 ||
    (v.zn_mg || 0) > 0 ||
    (v.iodine_mcg || 0) > 0 ||
    (v.se_mcg || 0) > 0 ||
    (v.k_mcg || 0) > 0
  );
}

/** Sum per-measure vitamin slices (food + stack lines). */
export function vitaminsFromMeasures(
  measures: MealMeasure[] | undefined
): VitaminTotals {
  let t = emptyVitamins();
  if (!measures?.length) return t;
  for (const m of measures) t = addVitamins(t, m.vitamins);
  return t;
}

/** 5 outer rings (same radii as macro CIRC) */
export const VITAMIN_RING_TRACKS = [
  {
    key: "d_mcg" as const,
    label: "Vitamin D",
    short: "D",
    unit: "mcg",
    className: "ring-vit-d",
    dot: "dot-vit-d",
  },
  {
    key: "c_mg" as const,
    label: "Vitamin C",
    short: "C",
    unit: "mg",
    className: "ring-vit-c",
    dot: "dot-vit-c",
  },
  {
    key: "folate_mcg" as const,
    label: "Folate",
    short: "Folate",
    unit: "mcg",
    className: "ring-vit-folate",
    dot: "dot-vit-folate",
  },
  {
    key: "ca_mg" as const,
    label: "Calcium",
    short: "Ca",
    unit: "mg",
    className: "ring-vit-ca",
    dot: "dot-vit-ca",
  },
  {
    key: "mg_mg" as const,
    label: "Magnesium",
    short: "Mg",
    unit: "mg",
    className: "ring-vit-mg",
    dot: "dot-vit-mg",
  },
] as const;

/** Extra rows under the ring (not drawn as concentric arcs) */
export const VITAMIN_LIST_EXTRA = [
  {
    key: "b12_mcg" as const,
    label: "B12",
    unit: "mcg",
    dot: "dot-vit-b12",
  },
  {
    key: "zn_mg" as const,
    label: "Zinc",
    unit: "mg",
    dot: "dot-vit-zn",
  },
  {
    key: "iodine_mcg" as const,
    label: "Iodine",
    unit: "mcg",
    dot: "dot-vit-iodine",
  },
  {
    key: "se_mcg" as const,
    label: "Selenium",
    unit: "mcg",
    dot: "dot-vit-se",
  },
  {
    key: "k_mcg" as const,
    label: "Vitamin K",
    unit: "mcg",
    dot: "dot-vit-k",
  },
] as const;

/** Ring + list rows for UI (same order everywhere). */
export const VITAMIN_DISPLAY_ROWS = [
  ...VITAMIN_RING_TRACKS.map((r) => ({
    key: r.key,
    label: r.label,
    unit: r.unit,
  })),
  ...VITAMIN_LIST_EXTRA.map((r) => ({
    key: r.key,
    label: r.label,
    unit: r.unit,
  })),
] as const;

/**
 * Vitamins from every logged meal’s measure lines (food B/L/D + morning stack).
 * Dinner uses active variant (steak/salmon). Falls back to stack constant if
 * morning measures lack vitamin slices.
 */
export function vitaminTotalsFromLogged(
  loggedIds: readonly string[],
  dinnerVariantId?: string | null
): VitaminTotals {
  let total = emptyVitamins();
  let sawMorningMeasures = false;
  for (const rawId of loggedIds) {
    const id =
      rawId === "morning" || rawId === "morning_blueprint"
        ? "morning_blueprint"
        : rawId === "dinner_grass_fed_steak" || rawId === "dinner_sockeye"
          ? "dinner_main"
          : rawId;
    const base = MEAL_PRESETS.find((p) => p.id === id);
    if (!base) continue;
    const preset =
      base.id === "dinner_main"
        ? resolveMealPreset(base, dinnerVariantId)
        : base.variants?.length
          ? resolveMealPreset(base)
          : base;
    const fromFood = vitaminsFromMeasures(preset.measures);
    if (vitaminsMeaningful(fromFood)) {
      total = addVitamins(total, fromFood);
      if (id === "morning_blueprint") sawMorningMeasures = true;
    }
  }
  // Legacy: morning logged but no vitamin slices on measures yet
  if (
    !sawMorningMeasures &&
    loggedIds.some((id) => id === "morning_blueprint" || id === "morning")
  ) {
    total = addVitamins(total, VITAMIN_STACK_ON_MORNING);
  }
  return total;
}

/** Average % of the 5 ring vitamins toward daily need for a 19-year-old woman (0–100). */
export function vitaminRingAveragePct(totals: VitaminTotals): number {
  const keys = VITAMIN_RING_TRACKS.map((t) => t.key);
  if (!keys.length) return 0;
  const sum = keys.reduce(
    (acc, k) => acc + pct(totals[k], VITAMIN_GOALS[k]),
    0
  );
  return Math.round(sum / keys.length);
}

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
  /**
   * What to do (action). UI color: action blue.
   * Example: "Swallow two capsules with 250 ml water first thing in the morning."
   */
  how?: string;
  /**
   * Money / subscription / pack note. UI color: sub amber (not action).
   * Example: "Included in Blueprint Big Stack."
   */
  meta?: string;
  /**
   * Vitamins / actives for zero-cal (or near-zero) stack lines.
   * Prefer `actives` / `activesGroups` (toggle + hover). `nutrients` is a plain fallback string.
   */
  nutrients?: string;
  /** Toggle label, e.g. "Essential vitamins" */
  activesLabel?: string;
  /**
   * Bullet list; hover each for full meaning.
   * `amount` = label dose for that serving (mg/mcg/g/CFU) when known.
   */
  actives?: { name: string; amount?: string; role: string; detail: string }[];
  /**
   * Multiple toggles (e.g. Vitamins extracted vs other Actives).
   * When set, preferred over single `actives` / `activesLabel`.
   */
  activesGroups?: {
    label: string;
    actives: { name: string; amount?: string; role: string; detail: string }[];
  }[];
  tone?: MealMeasureTone;
  shop?: MealShopProduct;
  /**
   * Per-item macros for the daily amount (not shown on Ingredients —
   * lives under Macro breakdown toggle).
   */
  macros?: MealMacros;
  /**
   * Micronutrients for this line (USDA-scale food or label stack).
   * Day total = sum of logged meals’ measure vitamins.
   * Vitamin K here = phylloquinone (K1) / food K only — not MK-4 megadoses.
   */
  vitamins?: VitaminSlice;
};

/**
 * One protein option under a meal (e.g. dinner steak vs salmon).
 * Active variant drives title · macros · ingredients · shop.
 */
export type MealVariant = {
  id: string;
  /** Short swap label — "Steak" · "Salmon" */
  label: string;
  title: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  notes?: string;
  ingredients: string[];
  measures: MealMeasure[];
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
  /**
   * One shared instruction under the ingredients list
   * (do not repeat on every measure line).
   */
  ingredientsNote?: string;
  /** Flat list (always kept for Mel + simple UIs) */
  ingredients: string[];
  /** Optional grouped list (legacy / export) */
  sections?: MealSection[];
  /** Ingredients list under one toggle */
  measures?: MealMeasure[];
  /**
   * Optional swap options (dinner steak ↔ salmon).
   * When set, base title/macros/measures are the default variant’s copy.
   */
  variants?: MealVariant[];
  defaultVariantId?: string;
};

const DINNER_VARIANT_KEY = "wonder.meals.dinnerVariant.v1";

/** Persist dinner protein choice (steak | salmon). */
export function loadMealVariantId(preset: MealPreset): string | null {
  if (!preset.variants?.length) return null;
  if (typeof localStorage === "undefined") {
    return preset.defaultVariantId || preset.variants[0].id;
  }
  try {
    const raw = localStorage.getItem(`${DINNER_VARIANT_KEY}:${preset.id}`);
    if (raw && preset.variants.some((v) => v.id === raw)) return raw;
  } catch {
    /* ignore */
  }
  return preset.defaultVariantId || preset.variants[0].id;
}

export function saveMealVariantId(presetId: string, variantId: string) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(`${DINNER_VARIANT_KEY}:${presetId}`, variantId);
  } catch {
    /* ignore */
  }
}

/** Apply active variant onto a preset (no-op if no variants). */
export function resolveMealPreset(
  preset: MealPreset,
  variantId?: string | null
): MealPreset {
  if (!preset.variants?.length) return preset;
  const id =
    variantId ||
    loadMealVariantId(preset) ||
    preset.defaultVariantId ||
    preset.variants[0].id;
  const v =
    preset.variants.find((x) => x.id === id) ||
    preset.variants.find((x) => x.id === preset.defaultVariantId) ||
    preset.variants[0];
  return {
    ...preset,
    title: v.title,
    calories: v.calories,
    protein_g: v.protein_g,
    carbs_g: v.carbs_g,
    fat_g: v.fat_g,
    fiber_g: v.fiber_g,
    notes: v.notes ?? preset.notes,
    ingredients: v.ingredients,
    measures: v.measures,
  };
}

/** True if any macro is non-zero (skip empty cal lines in the UI). */
export function macrosMeaningful(mac: MealMacros | undefined | null): boolean {
  if (!mac) return false;
  return (
    mac.calories !== 0 ||
    mac.protein_g !== 0 ||
    mac.carbs_g !== 0 ||
    mac.fat_g !== 0 ||
    mac.fiber_g !== 0
  );
}

/**
 * Lines that belong in Macro breakdown.
 * Water never appears (logged on the water bar). Softgel is vitamins-only
 * and lives under Essential vitamins, not its own zero-macro row.
 */
export function measureInMacroBreakdown(m: MealMeasure): boolean {
  if (/^water\b/i.test(m.item.trim())) return false;
  if (/softgel/i.test(m.item)) return false;
  if (macrosMeaningful(m.macros)) return true;
  // Vitamins / actives with no food macros (e.g. Essential Capsules)
  if (m.actives && m.actives.length > 0) return true;
  return false;
}

/** Sum all measure lines that have macros (partial lists OK — e.g. lunch). */
export function sumMeasureMacros(
  measures: MealMeasure[] | undefined
): MealMacros | null {
  if (!measures?.length) return null;
  // Only sum meaningful food macros (skip all-zero water/capsule stubs)
  const withMacros = measures.filter((m) => macrosMeaningful(m.macros));
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
    // Blueprint subscription is automatic — never roll into meal spend totals
    if (
      /blueprint/i.test(s.source || "") ||
      /blueprint|big stack/i.test(s.product || "")
    ) {
      continue;
    }
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
  if (/sockeye|salmon/i.test(product)) return "Sockeye";
  if (/steak|grass.?fed/i.test(product)) return "Steak";
  if (/blueberry|blueberries/i.test(product)) return "Blueberries";
  if (/strawberry|strawberries/i.test(product)) return "Strawberries";
  if (/kiwi/i.test(product)) return "Kiwi";
  if (/sweet potato/i.test(product)) return "Sweet potato";
  if (/carrot/i.test(product)) return "Carrots";
  if (/spinach/i.test(product)) return "Spinach";
  if (/broccoli/i.test(product)) return "Broccoli";
  if (/zucchini|courgette/i.test(product)) return "Zucchini";
  if (/asparagus/i.test(product)) return "Asparagus";
  if (/bell pepper|pepper/i.test(product)) return "Bell pepper";
  if (/snake oil|olive oil|evoo/i.test(product)) return "Snake Oil";
  if (/\beggs?\b/i.test(product)) return "Eggs";
  if (/big stack/i.test(product)) return "Big Stack";
  if (/longevity mix/i.test(product)) return "Longevity Mix";
  if (/metabolic protein/i.test(product)) return "Metabolic";
  if (/collagen/i.test(product)) return "Collagen";
  if (/blueprint|longevity protein/i.test(product)) return "Blueprint protein";
  if (/\bag1\b|athletic greens/i.test(product)) return "AG1";
  if (/malk/i.test(product)) return "MALK";
  if (/silk/i.test(product) && /almond/i.test(product)) return "Silk almond";
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
 * Melani shop channels (locked preference):
 * - Trader Joe’s in person = berries + vegetables only
 * - Costco / Instacart = dairy, nuts, seeds, fish, pantry bulk
 */
export const MEAL_SHOP_CHANNELS = {
  produce: "Trader Joe's",
  bulk: "Costco",
  produceKinds: "berries · vegetables",
  bulkKinds: "dairy · nuts · seeds · fish · pantry",
} as const;

function isTraderJoesSource(source?: string): boolean {
  return /trader\s*joe/i.test(source || "");
}

/**
 * Game-theory Instacart / Costco free-delivery play.
 * Costco on Instacart+: $0 delivery fee on orders $35+ (service fees/tips still apply).
 * Berries + veg are Trader Joe’s in-person — never in this free-ship math.
 * Strategy = anchor on the shortest Costco rebuy, never ship a lone small item.
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
  // Costco free-ship play only — TJ produce is a separate in-store trip
  const bulkMeasures = measures?.filter(
    (m) => m.shop && !isTraderJoesSource(m.shop.source)
  );
  const groups = mealShopBuyGroups(bulkMeasures);
  if (!groups.length) return null;

  const all = groups.flatMap((g) => g.items);
  all.sort((a, b) => a.daysPerBuy - b.daysPerBuy);
  const anchor = all[0];
  const freeShipMinUsd = 35; // Costco + Instacart+ threshold

  const frequent = all.filter((x) => x.daysPerBuy <= 28);
  const medium = all.filter((x) => x.daysPerBuy > 28 && x.daysPerBuy <= 110);
  const pantry = all.filter((x) => x.daysPerBuy > 110);

  const rules: string[] = [
    `Trader Joe’s in person: berries + vegetables only (not on Costco delivery)`,
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
    `If Costco cart < $${freeShipMinUsd}: add next-due bulk item or pantry, never checkout under floor`
  );

  const headline = `Costco every ${anchor.daysLabel.replace(/^~\s*/, "~")}: ${anchor.short} + bulk due · hit $${freeShipMinUsd}+ · produce = TJ`;

  return {
    anchorDays: anchor.daysPerBuy,
    anchorName: anchor.short,
    freeShipMinUsd,
    headline,
    rules,
  };
}

// ─── Buy schedule (game theory) ─────────────────────────────────────────────
// Weekly TJ produce trip is the calendar spine.
// Costco / direct bulk only lands on a weekly trip when it would empty before the next one.
// Free-ship floor: never checkout Costco under $35 — pull-forward next pantry if short.

export type ShopChannel = "tj" | "costco" | "direct";

export type MealShopScheduleItem = {
  id: string;
  short: string;
  full: string;
  source: string;
  channel: ShopChannel;
  mealTitle: string;
  /** Grams (or units) in one pack */
  packG: number;
  dailyG: number;
  buyQty: number;
  unit: string;
  priceUsd?: number;
  url?: string;
  /** Days one multi-buy lasts at daily burn */
  daysPerBuy: number;
  daysLabel: string;
  /** Packs needed to cover one week of burn (produce weekly basket) */
  packsPerWeek: number;
  /** Always on every weekly TJ run (berries · veg · short fridge life) */
  weeklyAlways: boolean;
};

export type MealShopTripLine = {
  short: string;
  full: string;
  buyQty: number;
  unit: string;
  daysLabel: string;
  priceLine: string | null;
  /** Why this trip: always weekly · runs out day N · free-ship pull */
  reason: string;
};

export type MealShopTrip = {
  weekIndex: number;
  /** Calendar day offset from restock (0, 7, 14, …) */
  day: number;
  label: string;
  tj: MealShopTripLine[];
  costco: MealShopTripLine[];
  direct: MealShopTripLine[];
  costcoUsd: number;
  freeShipOk: boolean;
  freeShipNote: string | null;
};

export type MealShopGamePlan = {
  freeShipMinUsd: number;
  items: MealShopScheduleItem[];
  trips: MealShopTrip[];
  /** Per-item buy weeks (0-based) */
  buyWeeks: { short: string; daysPerBuy: number; weeks: number[] }[];
  headline: string;
  rules: string[];
};

function shopChannelOf(source?: string): ShopChannel {
  if (isTraderJoesSource(source)) return "tj";
  if (/costco|instacart/i.test(source || "")) return "costco";
  // AG1 / Blueprint / unlabeled dairy often Costco-adjacent — treat as bulk ship
  if (/ag1|blueprint|lifeway|spectrum|simply organic/i.test(source || ""))
    return "direct";
  if (!source || source.trim() === "") return "costco"; // kefir etc. default bulk
  return "direct";
}

/** Fridge/produce spine — always on the weekly run regardless of pack math. */
function isWeeklyAlwaysProduce(product: string, channel: ShopChannel): boolean {
  if (channel !== "tj") return false;
  // Pantry bottles at TJ (vinegar, oil) are not weekly produce
  if (/vinegar|olive oil|evoo|snake oil/i.test(product)) return false;
  return true;
}

/**
 * Collect every shop line on the locked day (steak dinner default + sockeye protein).
 */
export function collectCoreDayShopItems(): MealShopScheduleItem[] {
  const out: MealShopScheduleItem[] = [];
  const seen = new Set<string>();

  const pushFrom = (preset: MealPreset) => {
    for (const m of preset.measures || []) {
      const s = m.shop;
      if (!s || s.packG <= 0 || s.dailyG <= 0) continue;
      const full = s.product || m.item;
      const id = full.toLowerCase().replace(/\s+/g, "-");
      if (seen.has(id)) continue;
      seen.add(id);
      const qty = Math.max(1, s.buyQty ?? 1);
      const daysPerBuy = (s.packG / s.dailyG) * qty;
      const channel = shopChannelOf(s.source);
      const packsPerWeek = Math.max(
        1,
        Math.ceil((7 * s.dailyG) / s.packG)
      );
      out.push({
        id,
        short: shopShortName(full),
        full,
        source: s.source || "Shop",
        channel,
        mealTitle: preset.title,
        packG: s.packG,
        dailyG: s.dailyG,
        buyQty: qty,
        unit: s.unit || "pack",
        priceUsd: s.priceUsd,
        url: s.url,
        daysPerBuy,
        daysLabel: formatDuration(daysPerBuy).replace(/^~\s*/, "~"),
        packsPerWeek,
        weeklyAlways: isWeeklyAlwaysProduce(full, channel),
      });
    }
  };

  for (const id of CORE_DAY_MEAL_IDS) {
    const raw = MEAL_PRESETS.find((m) => m.id === id);
    if (!raw) continue;
    pushFrom(resolveMealPreset(raw, raw.defaultVariantId || null));
    // Salmon week protein — so sockeye shows on the schedule too
    if (raw.variants?.some((v) => v.id === "salmon")) {
      pushFrom(resolveMealPreset(raw, "salmon"));
    }
  }

  out.sort((a, b) => a.daysPerBuy - b.daysPerBuy);
  return out;
}

/**
 * Melani grocery budget (food only — not Blueprint Big Stack subscription).
 * Shop board aims to keep burn rate at or under this each month.
 */
export const GROCERY_MONTHLY_BUDGET_USD = 600;

export type GroceryBudgetLine = {
  name: string;
  short: string;
  perDay: number;
  perMonth: number;
  channel: ShopChannel;
  priced: boolean;
};

export type GroceryBudgetReport = {
  /** Cap Melani locked — food only */
  budgetUsd: number;
  /** Burn rate from priced shop lines on the locked day */
  perDay: number;
  perMonth: number;
  /** budget − perMonth (negative = over) */
  remainingUsd: number;
  /** 0–100+ how full the budget is */
  pctOfBudget: number;
  /** Dinner used for the estimate (default steak) */
  dinnerVariant: string;
  lines: GroceryBudgetLine[];
  unpriced: string[];
  /** True when perMonth > budget */
  overBudget: boolean;
};

function isBlueprintShopLine(source?: string, product?: string): boolean {
  return (
    /blueprint/i.test(source || "") ||
    /blueprint|big stack|snake oil|longevity mix|longevity protein|metabolic protein|collagen/i.test(
      product || ""
    )
  );
}

/**
 * Monthly grocery burn from the locked day (default dinner protein).
 * Does not double-count steak + salmon. Blueprint stack is excluded.
 */
export function coreDayGroceryBudget(
  dinnerVariantId: "steak" | "salmon" = "steak"
): GroceryBudgetReport {
  const daysPerMonth = 365 / 12;
  const lines: GroceryBudgetLine[] = [];
  const unpriced: string[] = [];
  const seen = new Set<string>();
  let perDay = 0;

  for (const id of CORE_DAY_MEAL_IDS) {
    const raw = MEAL_PRESETS.find((m) => m.id === id);
    if (!raw) continue;
    const variant =
      id === "dinner_main"
        ? dinnerVariantId
        : raw.defaultVariantId || null;
    const preset = resolveMealPreset(raw, variant);
    for (const m of preset.measures || []) {
      const s = m.shop;
      if (!s || s.packG <= 0 || s.dailyG <= 0) continue;
      if (isBlueprintShopLine(s.source, s.product)) continue;
      const full = s.product || m.item;
      const key = full.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const short = shopShortName(full);
      const channel = shopChannelOf(s.source);
      if (s.priceUsd == null) {
        unpriced.push(full);
        lines.push({
          name: full,
          short,
          perDay: 0,
          perMonth: 0,
          channel,
          priced: false,
        });
        continue;
      }
      const lineDay = (s.priceUsd / s.packG) * s.dailyG;
      perDay += lineDay;
      lines.push({
        name: full,
        short,
        perDay: lineDay,
        perMonth: lineDay * daysPerMonth,
        channel,
        priced: true,
      });
    }
  }

  lines.sort((a, b) => b.perMonth - a.perMonth);
  const perMonth = perDay * daysPerMonth;
  const budgetUsd = GROCERY_MONTHLY_BUDGET_USD;
  const remainingUsd = budgetUsd - perMonth;
  const pctOfBudget =
    budgetUsd > 0 ? Math.round((perMonth / budgetUsd) * 100) : 0;

  return {
    budgetUsd,
    perDay,
    perMonth,
    remainingUsd,
    pctOfBudget,
    dinnerVariant: dinnerVariantId,
    lines,
    unpriced,
    overBudget: perMonth > budgetUsd + 0.5,
  };
}

function lineFromItem(
  it: MealShopScheduleItem,
  reason: string,
  qtyOverride?: number
): MealShopTripLine {
  const qty = qtyOverride ?? it.buyQty;
  const lineCost =
    it.priceUsd != null ? it.priceUsd * qty : null;
  return {
    short: it.short,
    full: it.full,
    buyQty: qty,
    unit: it.unit,
    daysLabel: it.daysLabel,
    priceLine:
      lineCost != null
        ? `$${lineCost.toFixed(2)}${qty > 1 ? ` (${qty}×$${it.priceUsd!.toFixed(2)})` : ""}`
        : null,
    reason,
  };
}

export type MealShopPlanOpts = {
  /** How many weekly shop days to project (default 52) */
  weekCount?: number;
  /**
   * true = you already bought everything today.
   * Plan starts with full stock; first trips are *next* rebuys only.
   */
  stockedToday?: boolean;
  /** Anchor calendar date (default = today local) */
  anchorDate?: Date;
};

/**
 * Exact buy calendar from pack burn rates.
 * Spine = weekly shopping day (0, 7, 14…).
 * stockedToday: emptyAt = daysPerBuy (next due), not forced week-0 restock dump.
 */
export function buildMealShopGamePlan(
  weekCountOrOpts: number | MealShopPlanOpts = 52
): MealShopGamePlan {
  const opts: MealShopPlanOpts =
    typeof weekCountOrOpts === "number"
      ? { weekCount: weekCountOrOpts, stockedToday: true }
      : weekCountOrOpts;
  const freeShipMinUsd = 35;
  const items = collectCoreDayShopItems();
  const weeks = Math.max(1, Math.min(52, opts.weekCount ?? 52));
  const stockedToday = opts.stockedToday !== false;
  const anchor = opts.anchorDate ? new Date(opts.anchorDate) : new Date();
  anchor.setHours(12, 0, 0, 0);

  // Inventory: day empty (after last buy). stockedToday → full shelves now.
  const emptyAt = new Map<string, number>();
  for (const it of items) {
    if (stockedToday) {
      // Bought today: next empty after this pack lasts
      // Weekly produce covers ~1 week, then every shop day again
      emptyAt.set(
        it.id,
        it.weeklyAlways ? 7 : Math.max(1, it.daysPerBuy)
      );
    } else {
      emptyAt.set(it.id, 0); // empty → buy on week 0
    }
  }

  const buyWeeksMap = new Map<string, number[]>();
  for (const it of items) buyWeeksMap.set(it.id, []);

  const trips: MealShopTrip[] = [];

  for (let w = 0; w < weeks; w++) {
    const shopDay = w * 7;
    const nextShop = shopDay + 7;
    const tj: MealShopTripLine[] = [];
    const costco: MealShopTripLine[] = [];
    const direct: MealShopTripLine[] = [];
    const boughtIds = new Set<string>();

    // Due if empties before the following weekly shop
    const needsBuy = (it: MealShopScheduleItem): boolean => {
      const empty = emptyAt.get(it.id) ?? 0;
      return empty <= nextShop - 1;
    };

    for (const it of items) {
      if (!needsBuy(it)) continue;
      boughtIds.add(it.id);
      const reason = it.weeklyAlways
        ? "weekly"
        : `out day ${Math.round(emptyAt.get(it.id) ?? 0)}`;
      const qty =
        it.weeklyAlways && it.daysPerBuy < 7
          ? it.packsPerWeek
          : it.buyQty;
      const line = lineFromItem(it, reason, qty);
      if (it.channel === "tj") tj.push(line);
      else if (it.channel === "costco") costco.push(line);
      else direct.push(line);

      const coverDays = (it.packG / it.dailyG) * qty;
      emptyAt.set(it.id, shopDay + coverDays);
      buyWeeksMap.get(it.id)!.push(w);
    }

    // Free-ship pad: only near-empty Costco, only if cart under $35
    let costcoUsd = costco.reduce((s, l) => {
      const it = items.find(
        (x) => x.full === l.full || (x.short === l.short && x.channel === "costco")
      );
      return s + (it?.priceUsd != null ? it.priceUsd * l.buyQty : 0);
    }, 0);

    if (costco.length > 0 && costcoUsd > 0 && costcoUsd < freeShipMinUsd) {
      const candidates = items
        .filter((it) => {
          if (it.channel !== "costco" || boughtIds.has(it.id)) return false;
          if (it.priceUsd == null) return false;
          const empty = emptyAt.get(it.id) ?? 0;
          return empty - shopDay <= 7;
        })
        .map((it) => ({
          it,
          urgency: (emptyAt.get(it.id) ?? 0) - shopDay,
        }))
        .sort((a, b) => a.urgency - b.urgency);

      for (const { it } of candidates) {
        if (costcoUsd >= freeShipMinUsd) break;
        costco.push(lineFromItem(it, "free-ship"));
        boughtIds.add(it.id);
        costcoUsd += (it.priceUsd ?? 0) * it.buyQty;
        emptyAt.set(it.id, shopDay + it.daysPerBuy);
        buyWeeksMap.get(it.id)!.push(w);
      }
    }

    const freeShipOk =
      costco.length === 0 || costcoUsd >= freeShipMinUsd || costcoUsd === 0;

    // Real calendar label: "Apr 12" · week index for sorting
    const d = new Date(anchor);
    d.setDate(d.getDate() + shopDay);
    const dateLabel = d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });

    trips.push({
      weekIndex: w,
      day: shopDay,
      label: dateLabel,
      tj,
      costco,
      direct,
      costcoUsd,
      freeShipOk,
      freeShipNote: null,
    });
  }

  const buyWeeks = items.map((it) => ({
    short: it.short,
    daysPerBuy: Math.round(it.daysPerBuy * 10) / 10,
    weeks: buyWeeksMap.get(it.id) || [],
  }));

  return {
    freeShipMinUsd,
    items,
    trips,
    buyWeeks,
    headline: "52 weeks · stocked today",
    rules: [],
  };
}

/** Cadence band for color chips */
export function shopCadenceBand(
  daysPerBuy: number,
  weeklyAlways: boolean
): "wk" | "bi" | "mo" | "yr" {
  if (weeklyAlways || daysPerBuy <= 8) return "wk";
  if (daysPerBuy <= 21) return "bi";
  if (daysPerBuy <= 50) return "mo";
  return "yr";
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
  const metaParen = p.source ? `${p.source}, ${p.size}` : p.size;

  // Prefer explicit dailyLabel on product, then amount arg, then raw g
  let dailyPart =
    p.dailyLabel?.trim() ||
    (dailyAmountLabel && dailyAmountLabel.trim()) ||
    `${p.dailyG} g/day`;
  // Only append /day for bare quantity labels (not "daily protocol" or full sentences)
  if (
    !/day|month|protocol|subscription|lasts|stack/i.test(dailyPart) &&
    !/\/day/i.test(dailyPart)
  ) {
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
 * Melani locked meals for the day.
 * Blueprint routine (Big Stack $373/mo for 30 days covers all stack products):
 * Morning (caps + Longevity Mix + creatine) → Post (Longevity Protein + collagen) →
 * Late Metabolic → Breakfast 12:00 → Lunch → Dinner.
 * Snake Oil: dinner only (1 tbsp). Off breakfast + lunch for 1800 cal / 75 g fat goals.
 * Grocery food budget: $600/mo (Blueprint sub separate).
 * Copy rule: clear instructions, no en-dashes, no fake "Big Stack" as a food name.
 */

/**
 * Official Blueprint Big Stack (live site research):
 * Includes (30-day supply each): Longevity Mix, Snake Oil EVOO, Longevity Protein,
 * Metabolic Protein, Advanced Antioxidants, Collagen Peptides, Essential Capsules.
 * Does NOT include: Essential Softgel (user bottle), Creatine (Thorne separate).
 * Site one-time $449 · Subscribe & Save ~$426.55. Melani locks $373/mo for her sub rate.
 * One price covers the whole stack — never charge $373 per product line.
 */
export const BLUEPRINT_BIG_STACK = {
  name: "Blueprint Big Stack",
  /** Melani locked monthly rate (official site: $449 one-time / ~$426.55 subscribe) */
  priceUsd: 373,
  lastsDays: 30,
  /**
   * Pack unit for spend math: 1 month of daily use so
   * (price / packG) * dailyG * (365/12) ≈ price per month exactly.
   */
  packMonth: 365 / 12,
  url: "https://blueprint.bryanjohnson.com/products/big-stack?variant=50498189132061",
  size: "30 day subscription",
  includes: [
    "Longevity Mix",
    "Snake Oil",
    "Longevity Protein",
    "Metabolic Protein",
    "Advanced Antioxidants",
    "Collagen Peptides",
    "Essential Capsules",
  ] as const,
  /**
   * Subscription $ is automatic for Melani — never show monthly stack cost in Meals UI.
   * Keep constants for shop calendar / internal math only when needed elsewhere.
   */
  includedMeta: "",
  softgelMeta: "",
  creatineMeta: "",
} as const;

/**
 * Snake Oil (Blueprint EVOO) · 1 tbsp (13.5 g):
 * ~119 cal · 13.5 g fat (mostly monounsaturated) · 0P · 0C · 0 fiber.
 * Label claim ~400 mg polyphenols per kg oil → about 5 mg polyphenols per tbsp.
 */
const SNAKE_OIL_TBSP: MealMacros = {
  calories: 119,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 13.5,
  fiber_g: 0,
};

type StackActive = {
  name: string;
  amount: string;
  role: string;
  detail: string;
};

/**
 * Essential Capsules · vitamins + minerals only (2 capsules).
 * Extracted from Blueprint Bryan Johnson stack — not mixed with longevity actives.
 * Sources: NIH DSLD 328204 + Blueprint Product Nutrition PDF.
 */
const ESSENTIAL_CAPSULE_VITAMINS: StackActive[] = [
  {
    name: "Vitamin D3",
    amount: "50 mcg (2000 IU)",
    role: "bones and mood",
    detail:
      "Form: plant-source cholecalciferol (D3). Fat-soluble hormone-vitamin that raises calcium absorption in the gut and signals immune + mood pathways in the brain.\n\nFor women: ages ~18–30 are peak bone-mass years — D3 is non-negotiable for locking calcium into bone before density slowly declines later. Low D is also linked to low mood, fatigue, and weaker immune response; women are often lower than men because of less sun exposure and higher indoor time.\n\nPairs with: calcium + K2 (softgel) so calcium goes into bone, not soft tissue. Take with the morning fat-soluble stack.",
  },
  {
    name: "Vitamin E",
    amount: "67 mg",
    role: "protects cells",
    detail:
      "Form: d-alpha-tocopherol. Fat-soluble antioxidant that sits in cell membranes and stops lipid peroxidation (rusting of fats in skin, nerves, and blood vessels).\n\nFor women: supports skin barrier resilience, cycle-related oxidative load, and red-blood-cell membrane integrity when iron turnover is higher. Helps protect polyunsaturated fats (including Snake Oil / EVOO on your plates) from oxidizing in tissue.\n\nNote: this is a solid maintenance dose, not a mega-E protocol. Works alongside C, selenium, and CoQ10 in the same morning stack.",
  },
  {
    name: "B1 Thiamine",
    amount: "1.1 mg",
    role: "energy from food",
    detail:
      "Form: thiamine HCl. Turns carbs into usable ATP so nerves and muscles fire cleanly. First step of several energy enzymes (PDH, alpha-KGDH).\n\nFor women: low thiamine shows up as brain fog, heavy legs, irritability, and poor exercise tolerance — easy to miss when you train hard and eat a high-protein, moderate-carb day. Supports steady energy across a full Blueprint morning → training → noon breakfast schedule.\n\nPairs with: other B vitamins (B2, B3, B5) that share the same energy pathways.",
  },
  {
    name: "B2 Riboflavin",
    amount: "1.4 mg",
    role: "energy enzymes",
    detail:
      "Form: riboflavin. Builds FAD/FMN cofactors for mitochondrial energy and for recycling glutathione (your main antioxidant system).\n\nFor women: well-studied for migraine-prone nervous systems — riboflavin supports energy in brain cells that run hot under stress, light, or cycle shifts. Also helps skin and eye tissue stay resilient under training and screen load.\n\nPairs with: magnesium (Longevity Mix) and B6 for nerve calm; glutathione and selenium for antioxidant recycle.",
  },
  {
    name: "B3 Niacinamide",
    amount: "15 mg",
    role: "cellular energy",
    detail:
      "Form: niacinamide (not flushing niacin). Building block for NAD+ — the molecule cells use for energy, DNA repair, and stress response.\n\nFor women: supports metabolic flexibility (using food for fuel cleanly), skin barrier calm (niacinamide is a classic skin-support form), and recovery after training without the flush some people get from nicotinic acid.\n\nPairs with: NR (also in this capsule) which further feeds NAD+ pathways — different entries to the same cellular energy network.",
  },
  {
    name: "B5 Pantothenate",
    amount: "6 mg",
    role: "metabolism",
    detail:
      "Form: d-calcium pantothenate. Core of coenzyme A — required to burn fat and carbs and to make some stress and sex-steroid precursors.\n\nFor women: helps adrenal and energy metabolism under load (training, travel, short sleep). Supports skin lipid production so barrier doesn’t feel stripped when you train and sweat daily.\n\nPairs with: B1/B2/B3 for full energy enzyme coverage; Snake Oil fats at meals need CoA pathways to be used cleanly.",
  },
  {
    name: "B6",
    amount: "1.4 mg",
    role: "protein and nerves",
    detail:
      "Form: pyridoxine HCl. Processes amino acids, builds neurotransmitters (serotonin, GABA, dopamine pathways), and supports hemoglobin.\n\nFor women: B6 is tightly tied to PMS-related mood, water retention, and cycle comfort in research literature; it also helps you run a high-protein day (steak, eggs, yogurt, shakes) without bottlenecking amino-acid handling. Supports calm nerves when training + work stack high.\n\nPairs with: magnesium (Longevity Mix) and folate/B12 for methylation and mood chemistry.",
  },
  {
    name: "B7 Biotin",
    amount: "50 mcg",
    role: "hair skin nails",
    detail:
      "Form: biotin (vitamin B7). Cofactor for carboxylase enzymes that handle fat and carb metabolism; structural support for keratin pathways.\n\nFor women: classic hair–skin–nail nutrient. 50 mcg is a physiologic label dose (not a 5,000–10,000 mcg megadose) — enough to cover daily needs without flooding labs. Helps when training, heat, and frequent wash cycles stress hair and nails.\n\nNote: very high biotin can interfere with some lab assays — this stack stays at a sane daily amount.",
  },
  {
    name: "Folate (L-5-MTHF)",
    amount: "200 mcg DFE",
    role: "homocysteine",
    detail:
      "Form: calcium L-5-methyltetrahydrofolate — the active folate your body can use directly (not folic acid that some people convert poorly).\n\nFor women: folate is foundational for DNA synthesis, red blood cells, and methylation. Critical if you are or could become pregnant (neural-tube development), and useful every cycle for cell turnover in the uterine lining and skin. Helps keep homocysteine in a healthier range with B12 and B6 — relevant for long-term heart and brain health.\n\nPairs with: B12 methylcobalamin in this same capsule.",
  },
  {
    name: "B12 Methylcobalamin",
    amount: "125 mcg",
    role: "nerves and energy",
    detail:
      "Form: methylcobalamin (active B12). Builds red blood cells, insulates nerves (myelin), and partners folate in methylation.\n\nFor women: low B12 shows up as crushing fatigue, brain fog, tingling, and low mood — easy to blame on “just busy.” Even with animal protein in the plan (eggs, steak, salmon), a reliable daily dose protects energy and nerve function, especially under training load and high output weeks.\n\nPairs with: folate (L-5-MTHF) and iron-rich meals (steak, eggs) so oxygen delivery and methylation stay aligned.",
  },
  {
    name: "Calcium",
    amount: "250 mg",
    role: "bones",
    detail:
      "Form: calcium carbonate + dicalcium phosphate in the capsule blend (~250 mg elemental Ca per Blueprint nutrition PDF). Structural mineral for bone matrix, muscle contraction, and nerve signaling.\n\nFor women: pairs with ~350 mg calcium from CaAKG in Longevity Mix (stack total ~600 mg) plus food calcium from yogurt. Ages 18–30 are when you bank peak bone density.\n\nPairs with: vitamin D3 (this capsule) + K2 (softgel) + magnesium (mix).",
  },
  {
    name: "Iodine",
    amount: "200 mcg",
    role: "thyroid",
    detail:
      "Form: potassium iodide. Raw material for thyroid hormones T4/T3 that set metabolic rate, temperature, and energy.\n\nFor women: thyroid disorders are far more common in women than men. Steady iodine supports hormone production that drives metabolism, cycle regularity, hair density, and cold tolerance. 200 mcg is a solid daily amount (around the adult RDA range) — not a high-dose kelp protocol.\n\nPairs with: selenium (this capsule) which helps convert T4 → active T3 and protects the thyroid from oxidative stress while it works.",
  },
  {
    name: "Zinc",
    amount: "15 mg",
    role: "immune",
    detail:
      "Form: zinc bisglycinate (well-absorbed, gentler on the stomach). Runs hundreds of enzymes for immunity, wound healing, DNA synthesis, and hormone receptors.\n\nFor women: supports immune defense, clear skin pathways, and reproductive hormone signaling. Training + sweat increases zinc loss; 15 mg covers a full daily need without mega-dosing that can crowd out copper long-term.\n\nPairs with: vitamin A pathways (softgel carotenoids), collagen + protein meals for tissue repair after hikes and lifts.",
  },
  {
    name: "Selenium",
    amount: "30 mcg",
    role: "antioxidant thyroid",
    detail:
      "Form: L-selenomethionine. Builds glutathione peroxidase enzymes and is required for thyroid deiodinase enzymes (T4 → T3).\n\nFor women: dual job — thyroid conversion and antioxidant defense. Women have higher autoimmune thyroid risk; selenium supports the gland while it makes hormone. Also protects cell membranes when training raises oxidative load.\n\nPairs with: iodine (this capsule) and glutathione (Longevity Mix).",
  },
  {
    name: "Manganese",
    amount: "1 mg",
    role: "enzymes bones",
    detail:
      "Form: manganese citrate. Cofactor for bone-matrix enzymes, cartilage metabolism, and mitochondrial antioxidant SOD2.\n\nFor women: supports bone and connective tissue quality during the peak bone-building decade, and helps joint/cartilage chemistry when you hike and lift. Small but real piece of the bone stack with calcium, D, K2, boron, and magnesium.\n\nDose: 1 mg is a careful daily amount (manganese is essential but not something to mega-dose).",
  },
  {
    name: "Boron",
    amount: "3 mg",
    role: "bone support",
    detail:
      "Form: boron glycinate. Trace mineral that influences how the body uses calcium, magnesium, and vitamin D, and how sex-steroid pathways are handled.\n\nFor women: researched for bone mineral support and free-testosterone / estrogen balance in a healthy range — relevant for strength, recovery, and bone density. Helps the rest of the mineral stack (Ca, Mg, D) work as a system, not as isolated pills.\n\nPairs with: calcium (capsule + mix), magnesium (mix), vitamin D3.",
  },
  {
    name: "Lithium orotate",
    amount: "1 mg lithium",
    role: "trace mineral",
    detail:
      "Form: lithium orotate providing 1 mg elemental lithium — a trace nutritional dose, not a psychiatric drug dose (those are hundreds of mg under medical care).\n\nFor women: studied at low levels for mood stability and cognitive support in nutritional contexts. Useful as a tiny daily signal for calm, clear headspace when life + training run intense — not a treatment for clinical mood disorders.\n\nBoundary: if you ever take prescription lithium or have kidney issues, this is a clinician conversation. Otherwise this is a micro-dose stack ingredient only.",
  },
];

/**
 * Essential Capsules · non-vitamin longevity actives (same 2-capsule serving).
 * Kept separate so “Vitamins” means vitamins/minerals only.
 */
const ESSENTIAL_CAPSULE_OTHER: StackActive[] = [
  {
    name: "NR (nicotinamide riboside)",
    amount: "300 mg",
    role: "NAD+ energy",
    detail:
      "Form: nicotinamide riboside chloride. A vitamin B3-related precursor that cells can use to raise NAD+, the currency of cellular energy and repair.\n\nFor women: supports mitochondrial output — how hard your cells can work during training, deep work, and recovery. NAD+ pathways also matter for stress resilience and healthy aging of skin and muscle tissue over decades, starting the habits now.\n\nPairs with: niacinamide (this capsule) and CoQ10 / ubiquinol for mitochondrial energy chain coverage.",
  },
  {
    name: "Ubiquinol (CoQ10)",
    amount: "50 mg",
    role: "mitochondria",
    detail:
      "Form: ubiquinol — the reduced, ready-to-use form of CoQ10. Sits in the mitochondrial electron transport chain where ATP is made; also a fat-soluble antioxidant in membranes.\n\nFor women: heart muscle and brain are energy-hungry; CoQ10 supports that output. Helpful under training load and when you want clean cellular energy without stimulants. Some research also links CoQ10 with migraine and fatigue support contexts.\n\nPairs with: NR, B2, and your whole morning mitochondrial stack. Fat-soluble — morning softgel + oil-containing meals help absorption of related compounds.",
  },
  {
    name: "Fisetin",
    amount: "100 mg",
    role: "plant antioxidant",
    detail:
      "Form: fisetin from smoketree (Cotinus) stem extract. A flavonoid studied for cellular stress defense and senescent-cell signaling pathways.\n\nFor women: long-game cellular maintenance — supports how cells handle oxidative stress from training, UV, and daily metabolism. Complements food polyphenols (berries, Snake Oil EVOO) rather than replacing them.\n\nNot a meal replacement: still eat blueberries and strawberries on the locked breakfast.",
  },
  {
    name: "Luteolin",
    amount: "100 mg",
    role: "plant antioxidant",
    detail:
      "Form: luteolin from Sophora japonica bud extract. Flavonoid that supports antioxidant pathways and calmer inflammatory signaling in lab and human-nutrition research.\n\nFor women: relevant when the nervous system and immune system run “loud” (stress, cycle shifts, hard training weeks). Supports cellular calm alongside lutein/zeaxanthin in the softgel for eye and brain tissue defense.\n\nPairs with: fisetin, glucoraphanin, and food polyphenols.",
  },
  {
    name: "Glucoraphanin",
    amount: "20 mg",
    role: "cellular defense",
    detail:
      "Form: from broccoli seed extract (~200 mg extract yielding 20 mg glucoraphanin). Precursor the body converts toward sulforaphane pathways that turn on Nrf2 — your built-in antioxidant and detox enzyme switch.\n\nFor women: supports the liver’s phase-II detox enzymes that process hormones, training byproducts, and everyday exposures. A clean cellular-defense lever without relying on juice cleanses.\n\nPairs with: glutathione (Longevity Mix) and selenium for the full antioxidant recycle chain.",
  },
  {
    name: "Spermidine",
    amount: "10 mg",
    role: "cellular cleanup",
    detail:
      "Form: spermidine trihydrochloride. Polyamine linked to autophagy — the process cells use to recycle worn proteins and organelles.\n\nFor women: cellular housekeeping for long-term tissue quality (skin, muscle, brain). Think “maintenance mode” while you still train hard and recover fast in your teens/twenties — stacking longevity habits early, not waiting until systems break.\n\nWorks best with: sleep, protein, and training stimulus (autophagy is a lifestyle system, not only a pill).",
  },
  {
    name: "Lactobacillus acidophilus",
    amount: "4 billion CFU",
    role: "gut",
    detail:
      "Form: probiotic blend labeled 4 billion CFU (acidophilus-forward). Supports the gut microbiome that digests food, trains immunity, and talks to the brain via the gut–brain axis.\n\nFor women: gut balance affects bloating, regularity, immune tone, and even how estrogens are recirculated (estrobolome). Helpful when the day is high-protein and high-fiber (yogurt, veg, berries) so digestion stays smooth.\n\nNote: stack also covers cultures so breakfast skips kefir — this capsule is part of that coverage. Take with the morning water pour.",
  },
];

/** Longevity Mix · doses per 1 scoop (name clean, amount separate for right-column scan) */
const LONGEVITY_MIX_ACTIVES: StackActive[] = [
  {
    name: "Creatine monohydrate",
    amount: "2.5 g",
    role: "muscle and brain energy",
    detail:
      "Already inside Longevity Mix. Recycles ATP in muscle and brain so you get stronger contractions and clearer high-intensity thinking.\n\nFor women: creatine is one of the most evidence-backed supplements for female strength, power, and lean mass — myths that it is “only for men” are wrong. Also supports brain energy under stress and short sleep. Your extra 5 g scoop raises total day creatine toward ~7.5 g.\n\nPairs with: resistance training + protein (post shake, eggs, steak). Drink water with it.",
  },
  {
    name: "CaAKG",
    amount: "2 g",
    role: "cellular energy",
    detail:
      "Calcium alpha-ketoglutarate — a Krebs-cycle intermediate used in cellular energy and studied in longevity research.\n\nFor women: supports metabolic engine efficiency (how cleanly cells burn fuel) while also contributing calcium toward the bone stack. Fits a founder + training day where mitochondria need to stay online for hours.\n\nPairs with: calcium (this scoop + capsules), vitamin D3, and K2 for bone-directed calcium use.",
  },
  {
    name: "Taurine",
    amount: "1.5 g",
    role: "heart and nerves",
    detail:
      "Conditionally essential amino acid concentrated in heart, brain, and retina. Supports electrical stability, bile acids, and cell hydration.\n\nFor women: cardiovascular and nerve calm under training; helps cells hold water and electrolytes when you sweat (hikes, lifts). Supports eye and heart tissue that run constant electrical and metabolic load.\n\nPairs with: magnesium and electrolytes from food; hydration goal 3.5 L.",
  },
  {
    name: "Glycine",
    amount: "1.2 g",
    role: "collagen sleep",
    detail:
      "Amino acid that builds collagen and glutathione, and is studied for calmer sleep architecture and overnight recovery.\n\nFor women: collagen synthesis for skin firmness, joint comfort, and connective tissue when you train; also a quiet sleep-support lever so recovery hormones can do their job. Women often under-eat glycine-rich connective cuts — this covers a daily base.\n\nPairs with: collagen peptides (post-workout), vitamin C (this scoop), lysine.",
  },
  {
    name: "L-lysine",
    amount: "1 g",
    role: "collagen absorption",
    detail:
      "Essential amino acid. Cross-links collagen fibers and supports calcium absorption and immune peptide production.\n\nFor women: stronger collagen matrix for skin, hair, and joints; helpful when the day already uses collagen peptides and training stress. Complements a high-output week so soft tissue keeps up with muscle.\n\nPairs with: glycine, vitamin C, collagen scoop, and food protein.",
  },
  {
    name: "Glucosamine",
    amount: "750 mg",
    role: "joints",
    detail:
      "Building block for glycosaminoglycans in cartilage — the cushioning matrix in joints.\n\nFor women: joint comfort under hiking, lifting, and long days on your feet. Cartilage has little blood supply; consistent daily substrate matters more than occasional mega-doses. Especially useful if knees/hips feel training volume.\n\nPairs with: collagen, hyaluronate (this scoop), and strength work that actually loads bone and tendon.",
  },
  {
    name: "Vitamin C",
    amount: "250 mg",
    role: "immune collagen",
    detail:
      "Ascorbic acid. Required enzyme cofactor to build collagen; regenerates vitamin E; supports immune cells and iron absorption from food.\n\nFor women: collagen + skin + gum + vessel integrity; helps absorb non-heme iron on plant-forward plates and supports immune defense when training hard. Also recycles vitamin E so membrane antioxidants stay active.\n\nPairs with: collagen peptides, lysine, glycine, and iron-containing meals (steak, eggs).",
  },
  {
    name: "L-glutathione",
    amount: "250 mg",
    role: "master antioxidant",
    detail:
      "Tripeptide antioxidant your cells use to neutralize oxidative stress and recycle other antioxidants.\n\nFor women: buffers training stress, supports liver detox pathways that process hormones, and helps skin tone pathways under UV and heat. Your endogenous glutathione system works harder when sleep is short or mileage is high.\n\nPairs with: selenium, B2, vitamin C, and glucoraphanin (capsules) for the full defense chain.",
  },
  {
    name: "L-theanine",
    amount: "200 mg",
    role: "calm focus",
    detail:
      "Amino acid from tea. Raises calm alpha-wave focus without sedation — smooth alertness for deep work.\n\nFor women: takes the edge off stimulant-like stress (deadlines, travel, hard mornings) without killing drive. Helpful for founder focus while cortisol and training stress compete for attention.\n\nPairs with: morning routine, magnesium, and optional coffee later — theanine is the “calm” half of classic focus stacks.",
  },
  {
    name: "Magnesium",
    amount: "150 mg",
    role: "muscle sleep",
    detail:
      "Essential mineral for 300+ enzymes: muscle relaxation, nerve calm, ATP use, glucose handling, and sleep quality.\n\nFor women: top-tier nutrient for cramps, tension, PMS-related irritability, migraine-prone systems, and deep sleep. Training and stress increase magnesium burn; many women chronically under-eat it. 150 mg here is a meaningful daily base (food still counts).\n\nPairs with: B6, calcium, vitamin D, and evening wind-down. Don’t chase diarrhea from mega-dosing — steady daily wins.",
  },
  {
    name: "Sodium hyaluronate",
    amount: "120 mg",
    role: "skin joints",
    detail:
      "A bioavailable form of hyaluronic acid — the water-holding molecule in skin and joint fluid.\n\nFor women: skin plumpness and hydration from within, plus joint cushioning when you hike and lift. Complements topical skincare (your AM/PM routines) so barrier care is inside-out, not only creams.\n\nPairs with: collagen, vitamin C, glycine, and water goal (HA needs fluid to work).",
  },
  {
    name: "Calcium",
    amount: "350 mg",
    role: "bones",
    detail:
      "From CaAKG in Longevity Mix (~350 mg elemental Ca per Blueprint nutrition PDF). Capsules add ~250 mg → morning stack ~600 mg total before food.\n\nFor women: bone-banking dose during peak bone-mass years. With D3 + K2 + magnesium + boron, calcium is directed into skeleton rather than floating unused. Also supports clean muscle contractions in training.\n\nPairs with: vitamin D3 and K2 (softgel), magnesium, yogurt at noon, and impact/strength training which actually signals bone to get denser.",
  },
];

/**
 * Essential Softgel / Advanced Antioxidants (fat-soluble morning softgel).
 * One softgel with MCT oil. Doses match Blueprint Advanced Antioxidants /
 * Product Nutrition PDF: K1, K2 MK4 + MK7, lutein, zeaxanthin, lycopene, astaxanthin.
 * Melani’s “Essential Softgel” bottle is this fat-soluble vision/bone/antioxidant slot.
 */
const SOFTGEL_ACTIVES: StackActive[] = [
  {
    name: "Lutein",
    amount: "15 mg",
    role: "vision filter",
    detail:
      "From marigold flower extract. Concentrates in the macula (center of sharp vision) and filters high-energy blue light from screens and sun.\n\nFor women: protects long-term visual performance under heavy screen + outdoor life. Macular pigment is built from diet/supplements — it does not make itself. Also studied for skin tone under light exposure.\n\nPairs with: zeaxanthin (15 mg : 3 mg here). Take with fat (softgel oil + later Snake Oil meals).",
  },
  {
    name: "Zeaxanthin",
    amount: "3 mg",
    role: "macular support",
    detail:
      "From marigold. Sits with lutein in retinal macular pigment for contrast sensitivity and light handling.\n\nFor women: same long-game eye investment as lutein — critical if you live on screens (coding, content, flights). Supports visual comfort and macular density over decades.\n\nPairs with: lutein in this softgel. Fat-soluble — morning softgel is the right vehicle.",
  },
  {
    name: "Lycopene",
    amount: "15 mg",
    role: "antioxidant",
    detail:
      "Carotenoid antioxidant (classically from tomato). Circulates in blood and tissues to quench singlet oxygen and support vessel and skin defense.\n\nFor women: researched for cardiovascular and skin photoprotection contexts — relevant for heart-health monitoring and outdoor training. Complements food carotenoids; not a “prostate-only” nutrient despite older marketing aimed at men.\n\nPairs with: astaxanthin, lutein/zeaxanthin, and vitamin E for fat-soluble antioxidant coverage.",
  },
  {
    name: "Astaxanthin",
    amount: "12 mg",
    role: "cell defense",
    detail:
      "From Haematococcus pluvialis microalgae. One of the strongest natural fat-soluble antioxidants; spans cell membranes.\n\nFor women: standout for skin elasticity/moisture under UV and training stress, exercise recovery, and eye fatigue. Helps when you hike hard and still want skin and eyes to keep up.\n\nPairs with: lutein/zeaxanthin (eyes), vitamin E, and Snake Oil polyphenols at meals.",
  },
  {
    name: "Vitamin K1",
    amount: "1500 mcg",
    role: "clotting bones",
    detail:
      "Form: phytonadione. Required to activate clotting factors and works with K2 for calcium-handling proteins.\n\nThis is the only K form counted on the day ring / meal Vitamins total (food K + K1). MK-4 and MK-7 below are separate K2 forms — not added into that number.\n\nPairs with: K2 MK-4 + MK-7 in this softgel, plus D3 and calcium for the bone system.",
  },
  {
    name: "Vitamin K2 (MK-4)",
    amount: "5 mg",
    role: "bone calcium",
    detail:
      "Form: menaquinone-4. Activates osteocalcin and matrix Gla protein — proteins that put calcium into bone and keep it out of arteries and soft tissue.\n\nNot summed into the Vitamin K day total (that track is K1 + food K only). Listed here so you still see the full softgel dose.\n\nPairs with: K1, MK-7, D3, calcium (mix + capsules).",
  },
  {
    name: "Vitamin K2 (MK-7)",
    amount: "600 mcg",
    role: "long-acting K2",
    detail:
      "Form: menaquinone-7. Longer half-life than MK-4 — stays in circulation to support bone density and vascular calcium balance across the day.\n\nNot summed into the Vitamin K day total (K1 + food only).\n\nPairs with: MK-4, K1, D3, magnesium, and strength training.",
  },
];

export const MEAL_PRESETS: MealPreset[] = [
  {
    id: "morning_blueprint",
    slot: "snack",
    title: "First thing in the morning (pre-workout)",
    // Capsules 0 + Longevity Mix ~20 + creatine scoop 0. Same 250 ml pour.
    calories: 20,
    protein_g: 0,
    carbs_g: 3,
    fat_g: 0,
    fiber_g: 0,
    notes:
      "First thing in the morning before training. Take with 250 ml water.",
    // Shown above the numbered list (not numbered)
    ingredientsNote: "Take with 250 ml of water",
    ingredients: [
      "Essential Capsules: 2 capsules",
      "Essential Softgel: 1 capsule",
      "Longevity Mix Blood Orange: 1 scoop",
      "Creatine monohydrate: 1 scoop",
    ],
    measures: [
      {
        // Auto water log only — not shown in Details (see ingredientsNote)
        item: "Water",
        amount: "250 ml",
        tone: "base",
      },
      {
        item: "Essential Capsules",
        amount: "2 capsules",
        activesGroups: [
          { label: "Vitamins", actives: ESSENTIAL_CAPSULE_VITAMINS },
          { label: "Actives", actives: ESSENTIAL_CAPSULE_OTHER },
        ],
        vitamins: {
          d_mcg: 50,
          folate_mcg: 200,
          ca_mg: 250,
          b12_mcg: 125,
          zn_mg: 15,
          iodine_mcg: 200,
          se_mcg: 30,
        },
      },
      {
        item: "Essential Softgel",
        amount: "1 capsule",
        activesLabel: "Softgel",
        actives: SOFTGEL_ACTIVES,
        // K1 only for totals (MK-4 / MK-7 listed under Softgel actives, not summed here)
        vitamins: { k_mcg: 1500 },
      },
      {
        item: "Longevity Mix Blood Orange",
        amount: "1 scoop",
        activesLabel: "Actives",
        actives: LONGEVITY_MIX_ACTIVES,
        macros: {
          calories: 20,
          protein_g: 0,
          carbs_g: 3,
          fat_g: 0,
          fiber_g: 0,
        },
        vitamins: {
          c_mg: 250,
          ca_mg: 350,
          mg_mg: 150,
        },
      },
      {
        // Single line only — no nested list
        item: "Creatine monohydrate",
        amount: "1 scoop",
      },
    ],
  },
  {
    id: "post_workout_shake",
    slot: "snack",
    title: "Post-workout",
    // Longevity Protein 200/26/15/8 + full collagen scoop 80/20 (no Snake Oil here)
    calories: 280,
    protein_g: 46,
    carbs_g: 15,
    fat_g: 8,
    fiber_g: 0,
    notes:
      "Right after training. Mix 1 scoop Longevity Protein and 1 full scoop Collagen into 250 ml water. Snake Oil is on dinner only, not in this shake, breakfast, or lunch.",
    ingredients: [
      "Mix 1 scoop Longevity Protein into 250 ml water",
      "Add 1 full scoop Collagen Peptides",
      "Shake or stir and drink",
      "Water: 250 ml",
    ],
    measures: [
      {
        item: "Longevity Protein",
        amount: "1 scoop mixed into 250 ml water",
        how: "Right after training. Chocolate scoop from the Blueprint stack.",
        tone: "seed",
        macros: {
          calories: 200,
          protein_g: 26,
          carbs_g: 15,
          fat_g: 8,
          fiber_g: 0,
        },
      },
      {
        item: "Collagen Peptides",
        amount: "1 full scoop in the same shake",
        how: "Right after training. Full daily collagen here (not split with pre-workout).",
        nutrients:
          "About 20 g collagen peptides (types I and III). Supports skin, joints, bones, and recovery. About 80 calories and 20 g protein.",
        tone: "seed",
        macros: {
          calories: 80,
          protein_g: 20,
          carbs_g: 0,
          fat_g: 0,
          fiber_g: 0,
        },
      },
      {
        item: "Water",
        amount: "250 ml",
        how: "One pour for the whole post-workout shake.",
        tone: "base",
      },
    ],
  },
  {
    id: "midday_metabolic",
    slot: "snack",
    title: "Late morning Metabolic Protein",
    // 2 scoops · 30 g plant protein + 8 g fiber
    calories: 200,
    protein_g: 30,
    carbs_g: 18,
    fat_g: 5,
    fiber_g: 8,
    notes:
      "Late morning, before noon breakfast. Mix 2 scoops Metabolic Protein into 250 ml water and drink.",
    ingredients: [
      "Mix 2 scoops Metabolic Protein into 250 ml water",
      "Drink before 12:00 breakfast",
      "Water: 250 ml",
    ],
    measures: [
      {
        item: "Metabolic Protein",
        amount: "2 scoops mixed into 250 ml water",
        how: "Late morning, before breakfast at noon.",
        tone: "seed",
        macros: {
          calories: 200,
          protein_g: 30,
          carbs_g: 18,
          fat_g: 5,
          fiber_g: 8,
        },
      },
      {
        item: "Water",
        amount: "250 ml",
        how: "One pour for Metabolic Protein.",
        tone: "base",
      },
    ],
  },
  {
    id: "breakfast_usual",
    slot: "breakfast",
    title: "Breakfast",
    // No kefir · no Snake Oil (fat budget — oil stays on lunch + dinner only)
    // 150 g Fage · berries · seeds · nuts
    // Macros = sum of measures (was 454.5/30.4F with 1 tbsp oil; oil removed −119 cal / −13.5 F)
    calories: 335.5,
    protein_g: 21.7,
    carbs_g: 31.2,
    fat_g: 16.9,
    fiber_g: 8.9,
    notes:
      "Starts 12:00 noon. 150 g Fage Total 0%, berries, seeds, and nuts. No Snake Oil, no kefir, no kiwi.",
    ingredients: [
      "Fage Total 0% Greek Yogurt: 150 g",
      "Mayorga Organic Chia Seeds: 2 tsp ~ 7 g",
      "Spectrum Cold Milled Organic Ground Flaxseed: 1 tsp ~ 3 g",
      "Simply Organic Ceylon Cinnamon: ½ tsp ~ 1.3 g",
      "Kirkland Signature Dry Roasted Macadamia Nuts: 6 g (1 nut)",
      "Kirkland Signature Walnut Halves: 10 g (2 halves)",
      "Kirkland Signature Supreme Whole Almonds: 3.6 g (3 almonds)",
      "Blueberries: 100 g",
      "Strawberries: 50 g",
    ],
    measures: [
      {
        item: "Fage Total 0% Greek Yogurt",
        amount: "150 g/day",
        tone: "base",
        macros: {
          // Fage USA label · 1 container 150 g = 80 cal / 16 P / 5 C / 0 F
          calories: 80,
          protein_g: 16,
          carbs_g: 5,
          fat_g: 0,
          fiber_g: 0,
        },
        // USDA-style greek yogurt 0% · 150 g
        vitamins: {
          ca_mg: 180,
          b12_mcg: 0.8,
          zn_mg: 0.8,
          mg_mg: 16,
          se_mcg: 4,
          folate_mcg: 12,
          iodine_mcg: 20,
          k_mcg: 0.5,
        },
        shop: {
          product: "Fage Total 0% Nonfat Greek Yogurt",
          source: "Costco",
          size: "35.3 oz",
          url: "https://www.instacart.com/store/s?k=fage+total+0+greek+yogurt",
          priceUsd: 8.99,
          packG: 35.3 * OZ,
          dailyG: 150,
          buyQty: 3, // always 3 tubs at once (bulk · same trip as weekly)
          unit: "tub",
          dailyLabel: "150 g/day",
          // 35.3 oz × 3 ÷ 150 g/day ≈ 20 d
          lastsLabel: "Lasts ~ 20 days",
        },
      },
      {
        item: "Mayorga Organic Chia Seeds",
        // 1 tsp ≈ 3.5 g → 2 tsp = 7 g
        amount: "2 tsp ~ 7 g",
        tone: "seed",
        macros: {
          calories: 34.0,
          protein_g: 1.2,
          carbs_g: 3.0,
          fat_g: 2.2,
          fiber_g: 2.4,
        },
        vitamins: {
          ca_mg: 44,
          mg_mg: 23,
          zn_mg: 0.3,
          se_mcg: 4,
          folate_mcg: 3,
        },
        shop: {
          product: "Mayorga Organic Chia Seeds",
          source: "Costco",
          size: "3 lb",
          url: "https://www.instacart.com/products/19649120-mayorga-organics-organic-chia-3-lb-3-lb?retailerSlug=costco",
          priceUsd: 11.06,
          packG: 3 * LB,
          dailyG: 7,
          buyQty: 1,
          unit: "bag",
          dailyLabel: "7 g/day (2 tsp)",
          lastsLabel: "Lasts ~ 6 months",
        },
      },
      {
        item: "Spectrum Cold Milled Organic Ground Flaxseed",
        // 1 tsp ≈ 3 g
        amount: "1 tsp ~ 3 g",
        tone: "seed",
        macros: {
          calories: 16.0,
          protein_g: 0.6,
          carbs_g: 0.8,
          fat_g: 1.2,
          fiber_g: 0.8,
        },
        vitamins: {
          ca_mg: 8,
          mg_mg: 12,
          zn_mg: 0.1,
          se_mcg: 0.8,
          folate_mcg: 2,
          k_mcg: 0.1,
        },
        shop: {
          product: "Spectrum Cold Milled Organic Ground Flaxseed",
          size: "14 oz",
          url: "https://www.instacart.com/products/50549-spectrum-cold-milled-organic-ground-premium-flaxseed-dietary-supplement-14-oz",
          packG: 14 * OZ,
          dailyG: 3,
          buyQty: 1,
          unit: "bag",
          dailyLabel: "3 g/day (1 tsp)",
          lastsLabel: "Lasts ~ 4 months",
        },
      },
      {
        item: "Simply Organic Ceylon Cinnamon",
        amount: "½ tsp ~ 1.3 g",
        tone: "seed",
        macros: {
          calories: 3.2,
          protein_g: 0.1,
          carbs_g: 1.0,
          fat_g: 0.0,
          fiber_g: 0.7,
        },
        vitamins: {
          ca_mg: 13,
          mg_mg: 1,
          k_mcg: 0.4,
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
        amount: "6 g (1 nut)",
        tone: "nuts",
        macros: {
          calories: 43.0,
          protein_g: 0.5,
          carbs_g: 0.9,
          fat_g: 4.6,
          fiber_g: 0.5,
        },
        vitamins: {
          ca_mg: 5,
          mg_mg: 8,
          zn_mg: 0.1,
          se_mcg: 0.2,
        },
        shop: {
          product: "Kirkland Signature Dry Roasted Macadamia Nuts",
          source: "Costco",
          size: "24 oz",
          url: "https://www.instacart.com/products/18475083-kirkland-signature-dry-roasted-macadamia-nuts-with-sea-salt-24-oz?retailerSlug=costco",
          priceUsd: 19.52,
          packG: 24 * OZ,
          dailyG: 6,
          buyQty: 1,
          unit: "bag",
          dailyLabel: "6 g/day (1 nut)",
          lastsLabel: "Lasts ~ 3.5 months",
        },
      },
      {
        item: "Kirkland Signature Walnut Halves",
        // 2 halves ≈ 10 g
        amount: "10 g (2 halves)",
        tone: "nuts",
        macros: {
          calories: 65.4,
          protein_g: 1.5,
          carbs_g: 1.4,
          fat_g: 6.5,
          fiber_g: 0.7,
        },
        vitamins: {
          ca_mg: 10,
          mg_mg: 16,
          zn_mg: 0.3,
          folate_mcg: 10,
          se_mcg: 0.5,
          k_mcg: 0.3,
        },
        shop: {
          product: "Kirkland Signature Walnut Halves",
          source: "Costco",
          size: "3 lb",
          url: "https://www.instacart.com/products/57207-kirkland-signature-walnuts-3-lb-3-lb?retailerSlug=costco",
          priceUsd: 17.15,
          packG: 3 * LB,
          dailyG: 10,
          buyQty: 1,
          unit: "bag",
          dailyLabel: "10 g/day (2 halves)",
          lastsLabel: "Lasts ~ 4.5 months",
        },
      },
      {
        item: "Kirkland Signature Supreme Whole Almonds",
        // 5 almonds ≈ 6 g → 3 almonds ≈ 3.6 g
        amount: "3.6 g (3 almonds)",
        tone: "nuts",
        macros: {
          calories: 20.9,
          protein_g: 0.8,
          carbs_g: 0.8,
          fat_g: 1.8,
          fiber_g: 0.5,
        },
        vitamins: {
          ca_mg: 10,
          mg_mg: 10,
          zn_mg: 0.1,
          folate_mcg: 2,
          se_mcg: 0.1,
        },
        shop: {
          product: "Kirkland Signature Supreme Whole Almonds",
          source: "Costco",
          size: "3 lb",
          url: "https://www.instacart.com/products/19231219-kirkland-signature-whole-almonds-3-lb-3-lb?retailerSlug=costco",
          priceUsd: 17.15,
          packG: 3 * LB,
          dailyG: 3.6,
          buyQty: 1,
          unit: "bag",
          dailyLabel: "3.6 g/day (3 almonds)",
          lastsLabel: "Lasts ~ 12 months",
        },
      },
      {
        item: "Fresh Blueberries",
        amount: "100 g",
        tone: "fruit",
        macros: {
          // Scaled from 150 g line × 100/150
          calories: 57,
          protein_g: 0.7,
          carbs_g: 14.5,
          fat_g: 0.3,
          fiber_g: 2.3,
        },
        vitamins: {
          c_mg: 10,
          k_mcg: 19,
          folate_mcg: 6,
          ca_mg: 6,
          mg_mg: 6,
        },
        shop: {
          product: "Fresh Blueberries",
          source: "Trader Joe's",
          size: "1 pint (~6 oz)",
          url: "https://www.traderjoes.com/home/search?qText=blueberries",
          priceUsd: 3.99,
          packG: 6 * OZ,
          dailyG: 100,
          buyQty: 2,
          unit: "pint",
          dailyLabel: "100 g/day",
          lastsLabel: "Lasts ~ 3 days",
        },
      },
      {
        item: "Fresh Strawberries",
        amount: "50 g",
        tone: "fruit",
        macros: {
          calories: 16,
          protein_g: 0.3,
          carbs_g: 3.8,
          fat_g: 0.3,
          fiber_g: 1.0,
        },
        vitamins: {
          c_mg: 29,
          k_mcg: 1,
          folate_mcg: 12,
          ca_mg: 8,
          mg_mg: 6.5,
        },
        shop: {
          product: "Fresh Strawberries",
          source: "Trader Joe's",
          size: "1 lb",
          url: "https://www.traderjoes.com/home/search?qText=strawberries",
          priceUsd: 4.49,
          packG: 1 * LB,
          dailyG: 50,
          buyQty: 1,
          unit: "clamshell",
          dailyLabel: "50 g/day",
          lastsLabel: "Lasts ~ 9 days",
        },
      },
    ],
  },
  {
    id: "lunch_super_veggie",
    slot: "lunch",
    title: "Lunch · Super Veggie",
    // No Snake Oil here (fat deficit) — oil only on dinner. Grocery budget $600/mo.
    // Was 553.8 cal / 29.2 F with 1 tbsp oil; oil removed −119 cal / −13.5 F
    // Cucumber → broccoli (owner lock). Macros re-summed from measures.
    calories: 474.7,
    protein_g: 29.3,
    carbs_g: 58.2,
    fat_g: 16.3,
    fiber_g: 13.1,
    notes:
      "Super Veggie: 150 g frozen sweet potato (small side, not a pile), broccoli, carrots, 3 eggs, garlic, cumin, and pure lime juice. No Snake Oil on lunch.",
    ingredients: [
      "Frozen sweet potato cubes: 150 g",
      "Broccoli: 210 g",
      "Carrots: 80 g",
      "Eggs (boiled): 3 large",
      "Garlic: 1 clove",
      "Cumin powder: 1.5 tsp (Trader Joe's)",
      "Pure lime juice: 1 tablespoon",
    ],
    measures: [
      {
        item: "Frozen sweet potato cubes",
        amount: "150 g",
        how: "Microwave or roast from frozen. Small side only — not 400 g.",
        tone: "default",
        macros: {
          // Scaled from 400 g line × 150/400
          calories: 135.0,
          protein_g: 3.0,
          carbs_g: 31.0,
          fat_g: 0.3,
          fiber_g: 5.0,
        },
        vitamins: {
          c_mg: 4,
          ca_mg: 45,
          mg_mg: 38,
          folate_mcg: 17,
          k_mcg: 3,
          zn_mg: 0.5,
          se_mcg: 0.9,
        },
        shop: {
          product: "Frozen Sweet Potato Cubes",
          source: "Trader Joe's",
          size: "16 oz bag",
          url: "https://www.traderjoes.com/home/search?qText=sweet+potato",
          priceUsd: 2.99,
          packG: 16 * OZ,
          dailyG: 150,
          buyQty: 1,
          unit: "bag",
          dailyLabel: "150 g/day",
          // ~454 g bag ÷ 150 ≈ 3 days
          lastsLabel: "Lasts ~ 3 days",
        },
      },
      {
        item: "Broccoli",
        amount: "210 g",
        how: "Steam, roast, or microwave florets",
        macros: {
          // USDA raw broccoli ~ per 100 g × 2.1
          calories: 71.4,
          protein_g: 5.9,
          carbs_g: 14.7,
          fat_g: 0.8,
          fiber_g: 5.5,
        },
        // Biggest food K hit on the day (real phylloquinone — not softgel MK forms)
        vitamins: {
          c_mg: 187,
          k_mcg: 213,
          folate_mcg: 132,
          ca_mg: 99,
          mg_mg: 44,
          zn_mg: 0.9,
          se_mcg: 5,
        },
        shop: {
          product: "Broccoli florets",
          source: "Trader Joe's",
          size: "12 oz bag",
          url: "https://www.traderjoes.com/home/search?qText=broccoli",
          priceUsd: 2.49,
          packG: 12 * OZ,
          dailyG: 210,
          buyQty: 1,
          unit: "bag",
          dailyLabel: "210 g/day",
          lastsLabel: "Lasts ~ 1–2 days",
        },
      },
      {
        item: "Carrots",
        amount: "80 g",
        how: "Steam, roast, microwave, or raw coins",
        macros: {
          calories: 32.8,
          protein_g: 0.7,
          carbs_g: 7.7,
          fat_g: 0.2,
          fiber_g: 2.2,
        },
        vitamins: {
          c_mg: 5,
          k_mcg: 11,
          folate_mcg: 15,
          ca_mg: 26,
          mg_mg: 10,
        },
        shop: {
          product: "Carrots",
          source: "Trader Joe's",
          size: "1 lb bag",
          url: "https://www.traderjoes.com/home/search?qText=carrots",
          priceUsd: 1.49,
          packG: 1 * LB,
          dailyG: 80,
          buyQty: 1,
          unit: "bag",
          dailyLabel: "80 g/day",
          lastsLabel: "Lasts ~ 5 days",
        },
      },
      {
        item: "Cage Free Large Eggs",
        amount: "3 large",
        how: "Hard-boil ahead · peel at lunch",
        macros: {
          calories: 215,
          protein_g: 18.9,
          carbs_g: 1.1,
          fat_g: 14.3,
          fiber_g: 0,
        },
        vitamins: {
          d_mcg: 3,
          b12_mcg: 1.7,
          folate_mcg: 71,
          ca_mg: 84,
          mg_mg: 18,
          zn_mg: 1.9,
          se_mcg: 46,
          k_mcg: 0.9,
          iodine_mcg: 72,
        },
        shop: {
          product: "Cage Free Large Eggs",
          source: "Trader Joe's",
          size: "1 dozen",
          url: "https://www.traderjoes.com/home/search?qText=eggs+dozen",
          priceUsd: 3.99,
          packG: 12,
          dailyG: 3,
          buyQty: 1,
          unit: "dozen",
          dailyLabel: "3 large eggs/day",
          lastsLabel: "Lasts ~ 4 days",
        },
      },
      {
        item: "Fresh Garlic",
        amount: "1 clove",
        how: "Mince into the plate",
        macros: {
          calories: 4.5,
          protein_g: 0.2,
          carbs_g: 1.0,
          fat_g: 0,
          fiber_g: 0.1,
        },
        vitamins: {
          c_mg: 0.9,
          ca_mg: 5,
          k_mcg: 0.1,
        },
        shop: {
          product: "Fresh Garlic",
          source: "Trader Joe's",
          size: "1 bulb (~10 cloves)",
          url: "https://www.traderjoes.com/home/search?qText=garlic",
          priceUsd: 0.79,
          packG: 10, // cloves
          dailyG: 1,
          buyQty: 1,
          unit: "bulb",
          dailyLabel: "1 clove/day",
          lastsLabel: "Lasts ~ 10 days",
        },
      },
      {
        item: "Cumin powder",
        amount: "1.5 tsp",
        how: "Sprinkle all over the plate. Trader Joe's cumin.",
        tone: "seed",
        macros: {
          // ~1.5 tsp ground cumin
          calories: 12,
          protein_g: 0.6,
          carbs_g: 1.4,
          fat_g: 0.7,
          fiber_g: 0.3,
        },
        vitamins: {
          ca_mg: 28,
          mg_mg: 12,
        },
        shop: {
          product: "Ground Cumin",
          source: "Trader Joe's",
          size: "spice jar",
          url: "https://www.traderjoes.com/home/search?qText=cumin",
          priceUsd: 1.99,
          packG: 45,
          dailyG: 3.2,
          buyQty: 1,
          unit: "jar",
          dailyLabel: "1.5 tsp/day",
          lastsLabel: "Lasts ~ 2 weeks",
        },
      },
      {
        item: "Pure lime juice",
        amount: "1 tablespoon",
        how: "Squeeze or pour over the plate instead of lemon.",
        macros: {
          calories: 4,
          protein_g: 0,
          carbs_g: 1.3,
          fat_g: 0,
          fiber_g: 0,
        },
        vitamins: { c_mg: 4.5 },
        shop: {
          product: "Pure Lime Juice",
          source: "Trader Joe's",
          size: "bottle",
          url: "https://www.traderjoes.com/home/search?qText=lime+juice",
          priceUsd: 2.49,
          packG: 473,
          dailyG: 15,
          buyQty: 1,
          unit: "bottle",
          dailyLabel: "1 tbsp/day",
          lastsLabel: "Lasts ~ 1 month",
        },
      },
    ],
  },
  // Dinner: steak or sockeye + asparagus + 1 tbsp Snake Oil (only oil meal now)
  (() => {
    // Snake Oil on dinner only (off breakfast + lunch for calorie/fat deficit)
    const snakeOil: MealMeasure = {
      item: "Snake Oil",
      amount: "1 tbsp (15 ml)",
      tone: "nuts",
      macros: { ...SNAKE_OIL_TBSP },
    };

    const asparagus: MealMeasure = {
      item: "Asparagus",
      amount: "180 g",
      how: "Steam, microwave, or roast next to the protein",
      macros: {
        calories: 40,
        protein_g: 4.3,
        carbs_g: 7.4,
        fat_g: 0.4,
        fiber_g: 3.6,
      },
      vitamins: {
        k_mcg: 75,
        folate_mcg: 94,
        c_mg: 10,
        ca_mg: 43,
        mg_mg: 25,
        se_mcg: 4,
        zn_mg: 1,
      },
      shop: {
        product: "Asparagus",
        source: "Trader Joe's",
        size: "1 bunch (about 1 lb)",
        url: "https://www.traderjoes.com/home/search?qText=asparagus",
        priceUsd: 2.99,
        packG: 1 * LB,
        dailyG: 180,
        buyQty: 1,
        unit: "bunch",
        dailyLabel: "180 g/day",
        lastsLabel: "Lasts about 2 to 3 days",
      },
    };

    const steakProtein: MealMeasure = {
      item: "Grass-Fed Steak",
      amount: "7 oz (200 g)",
      how: "Pan-sear or grill, rest, salt. Finish with 1 tablespoon Snake Oil on the plate.",
      macros: {
        calories: 400,
        protein_g: 51.6,
        carbs_g: 0,
        fat_g: 18.0,
        fiber_g: 0,
      },
      vitamins: {
        b12_mcg: 2.5,
        zn_mg: 7.5,
        se_mcg: 36,
        d_mcg: 0.2,
        ca_mg: 12,
        mg_mg: 34,
        folate_mcg: 12,
        k_mcg: 2.4,
      },
      shop: {
        product: "Grass-Fed Steak",
        source: "Trader Joe's",
        size: "about 1 lb pack",
        url: "https://www.traderjoes.com/home/search?qText=grass+fed+steak",
        priceUsd: 14.0,
        packG: 1 * LB,
        dailyG: 200,
        buyQty: 1,
        unit: "pack",
        dailyLabel: "200 g cooked/day (7 oz)",
        lastsLabel: "Lasts about 2 days",
      },
    };

    const salmonProtein: MealMeasure = {
      item: "Sockeye salmon",
      amount: "1 Costco pack (about 5 to 6 oz)",
      how: "Pan-sear or air-fry, skin-side first. Finish with 1 tablespoon Snake Oil on the plate.",
      macros: {
        calories: 235,
        protein_g: 34.0,
        carbs_g: 0,
        fat_g: 10.0,
        fiber_g: 0,
      },
      vitamins: {
        d_mcg: 14.5,
        b12_mcg: 4.8,
        se_mcg: 56,
        zn_mg: 0.7,
        ca_mg: 14,
        mg_mg: 42,
        folate_mcg: 10,
        k_mcg: 0.2,
      },
      shop: {
        product: "Kirkland Signature Wild Alaskan Sockeye Salmon",
        source: "Costco",
        size: "3 lb (5 to 7 oz portions)",
        url: "https://www.instacart.com/products/19232630-kirkland-signature-wild-sockeye-salmon-individually-wrapped-3-lbs-3-lb?retailerSlug=costco",
        priceUsd: 53.48,
        packG: 3 * LB,
        dailyG: 155,
        buyQty: 2,
        unit: "bag",
        dailyLabel: "1 portion/day (about 5 to 6 oz)",
        lastsLabel: "Lasts about 16 days",
      },
    };

    const steakMeasures = [snakeOil, steakProtein, asparagus];
    const salmonMeasures = [snakeOil, salmonProtein, asparagus];

    // Steak 400 + asp 40 + oil 119 = 559 · P 55.9 · C 7.4 · F 31.9 · fiber 3.6
    const steakVariant: MealVariant = {
      id: "steak",
      label: "Steak",
      title: "Dinner · Grass-fed steak",
      calories: 559.0,
      protein_g: 55.9,
      carbs_g: 7.4,
      fat_g: 31.9,
      fiber_g: 3.6,
      notes:
        "Dinner: 1 tablespoon Snake Oil, 7 oz grass fed steak, 180 g asparagus.",
      ingredients: [
        "Snake Oil: 1 tbsp (15 ml)",
        "Grass fed steak: 7 oz (200 g) cooked",
        "Asparagus: 180 g",
      ],
      measures: steakMeasures,
    };

    // Salmon 235 + asp 40 + oil 119 = 394 · P 38.3 · C 7.4 · F 23.9 · fiber 3.6
    const salmonVariant: MealVariant = {
      id: "salmon",
      label: "Sockeye",
      title: "Dinner · Sockeye salmon",
      calories: 394.0,
      protein_g: 38.3,
      carbs_g: 7.4,
      fat_g: 23.9,
      fiber_g: 3.6,
      notes:
        "Dinner: 1 tablespoon Snake Oil, one Costco sockeye portion, 180 g asparagus.",
      ingredients: [
        "Snake Oil: 1 tbsp (15 ml)",
        "Sockeye salmon: 1 Costco pack (about 5 to 6 oz)",
        "Asparagus: 180 g",
      ],
      measures: salmonMeasures,
    };

    const dinner: MealPreset = {
      id: "dinner_main",
      slot: "dinner",
      title: steakVariant.title,
      calories: steakVariant.calories,
      protein_g: steakVariant.protein_g,
      carbs_g: steakVariant.carbs_g,
      fat_g: steakVariant.fat_g,
      fiber_g: steakVariant.fiber_g,
      notes: steakVariant.notes,
      ingredients: steakVariant.ingredients,
      measures: steakVariant.measures,
      defaultVariantId: "steak",
      variants: [steakVariant, salmonVariant],
    };
    return dinner;
  })(),
];

/** Locked day slots (Blueprint card → B → L → D). */
export const CORE_DAY_MEAL_IDS = [
  "morning_blueprint",
  "post_workout_shake",
  "midday_metabolic",
  "breakfast_usual",
  "lunch_super_veggie",
  "dinner_main",
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

/** Daily stack — name · brand/dose · when to take (0-cal pills; powders are meals) */
export const DAILY_SUPPLEMENTS: DailySupplement[] = [
  // Capsules also listed on Morning meal for log flow · 0 cal
  {
    id: "bp-essentials",
    name: "Essential Capsules",
    dose: "swallow 2 capsules",
    when: "first thing in the morning with Longevity Mix and 250 ml water (Big Stack)",
  },
  {
    id: "bp-softgel",
    name: "Essential Softgel",
    dose: "swallow 1 softgel",
    when: "first thing in the morning with Longevity Mix and 250 ml water",
  },
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
  // Creatine is logged on Pre-workout meal (1 scoop) — not a separate pill row
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

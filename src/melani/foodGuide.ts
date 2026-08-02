/**
 * Melani's plate law — Don't Die composition for Meals.
 *
 * ## Cut-out law (non-negotiable)
 * The trash bin is not decoration. Anything on PLATE_TRASH is **completely cut out**:
 * - Never put it on the plate examples or meal plan
 * - Never put it on the Shop / TJ buy list
 * - Never seed it into the log automatically
 * - If Melani logs it anyway, **flag immediately** (Wonder must notice)
 *
 * ## Color law (purpose only)
 * - Plate teal / blue / purple = **plants · protein · fats** (one color per wedge, nothing else)
 * - `--fx-cutout` red = **cut-out / banned / flagged** (only meaning of that red on Meals)
 * - Macro ring dots = which macro ring (cal/protein/carbs/fat/fiber) — not mood colors
 * Do not add extra rainbow colors “for polish.”
 */

export type PlateWedgeId = "plants" | "protein" | "fats";

export type PlateWedge = {
  id: PlateWedgeId;
  label: string;
  legend: string;
  share: number;
  color: string;
  examples: string[];
};

/** Target plate only — no animal sat fat, no junk. */
export const PLATE_WEDGES: PlateWedge[] = [
  {
    id: "plants",
    label: "Plants",
    legend: "Complex carbs & fruits / veg",
    share: 0.45,
    color: "#7dd3c0",
    examples: [
      "berries",
      "root veg",
      "alliums",
      "leafy greens",
      "cruciferous",
      "lentils",
      "tomatoes",
      "bell peppers",
      "eggplant",
      "zucchini",
      "fermented foods",
      "whole oats",
      "quinoa",
      "manuka honey (trace)",
    ],
  },
  {
    id: "protein",
    label: "Protein",
    legend: "Protein",
    share: 0.3,
    color: "#7eb6e8",
    examples: [
      "pea / hemp protein",
      "legumes",
      "chicken & turkey breast",
      "fatty fish",
      "eggs",
      "whey / casein",
      "unsweetened yogurt 0%",
      "Greek yogurt 0%",
      "kefir 0%",
    ],
  },
  {
    id: "fats",
    label: "Fats",
    legend: "Healthy fats (unsaturated)",
    share: 0.25,
    color: "#c4a0d8",
    examples: [
      "extra virgin olive oil",
      "avocado",
      "macadamia",
      "almonds",
      "walnuts",
      "hazelnuts",
      "sesame",
      "chia",
      "pumpkin seeds",
      "flax",
      "hemp",
      "cocoa",
    ],
  },
];

export const PLATE_DRINKS = [
  "Water",
  "Coffee",
  "Tea",
  "Unsweetened beverage",
] as const;

/**
 * Completely cut out — trash. Includes sat animal fat & co.
 * Shown in the can; any logged meal matching these is flagged immediately.
 */
export const PLATE_TRASH = [
  "Added sugar",
  "High-fructose corn syrup",
  "Junk food",
  "Fried food",
  "Deli meats",
  "Processed meats",
  "Gums",
  "Aspartame",
  "Other artificial sweeteners",
  "Hydrogenated oils",
  "Partially hydrogenated oils",
  "Corn oil",
  "Soybean oil",
  "Canola oil (seed oils you cut)",
  "Trans fats",
  "Saturated animal fats",
  "Butter",
  "Lard",
  "Tallow",
  "Cream / heavy cream",
  "Full-fat cheese for fat load",
  "Animal fat cooking",
  "Red meat",
  "Organ meat",
  "Bacon / sausage",
  "Rice (refined)",
  "Pasta (refined)",
  "White bread",
  "Alcohol",
  "Soda / energy drinks",
  "Candy / pastry",
  "Ultra-processed snacks",
] as const;

export type CutoutLabel = (typeof PLATE_TRASH)[number];

export type CutoutHit = {
  /** Canonical trash label (e.g. Added sugar) */
  label: CutoutLabel;
  /** Snippet / keyword that matched in the meal text */
  matched: string;
};

/**
 * Match phrases for each cut-out (lowercase).
 * Order matters within a label — longer phrases first when we sort.
 * Honey / fruit sugars are NOT “added sugar.”
 */
const CUTOUT_ALIASES: Record<CutoutLabel, string[]> = {
  "Added sugar": [
    "added sugar",
    "cane sugar",
    "brown sugar",
    "powdered sugar",
    "confectioners sugar",
    "table sugar",
    "white sugar",
    "sucrose",
    "dextrose",
    "maltose",
    "maltodextrin",
    "corn syrup",
    "simple syrup",
    "sugar syrup",
  ],
  "High-fructose corn syrup": [
    "high-fructose corn syrup",
    "high fructose corn syrup",
    "hfcs",
  ],
  "Junk food": ["junk food", "fast food", "mcdonald", "doritos", "cheetos"],
  "Fried food": [
    "fried",
    "deep fried",
    "deep-fried",
    "french fry",
    "french fries",
    "onion ring",
    "tempura",
  ],
  "Deli meats": [
    "deli meat",
    "deli meats",
    "cold cut",
    "cold cuts",
    "lunch meat",
  ],
  "Processed meats": [
    "processed meat",
    "hot dog",
    "hotdog",
    "pepperoni",
    "salami",
    "mortadella",
    "bologna",
  ],
  Gums: [
    "xanthan gum",
    "guar gum",
    "gellan gum",
    "locust bean gum",
    "carrageenan",
  ],
  Aspartame: ["aspartame", "nutrasweet", "equal sweetener"],
  "Other artificial sweeteners": [
    "sucralose",
    "splenda",
    "saccharin",
    "acesulfame",
    "ace-k",
    "neotame",
    "artificial sweetener",
  ],
  "Hydrogenated oils": ["hydrogenated oil", "hydrogenated oils"],
  "Partially hydrogenated oils": [
    "partially hydrogenated",
    "partially-hydrogenated",
  ],
  "Corn oil": ["corn oil"],
  "Soybean oil": ["soybean oil", "soy oil"],
  "Canola oil (seed oils you cut)": [
    "canola oil",
    "rapeseed oil",
    "vegetable oil",
    "seed oil",
  ],
  "Trans fats": ["trans fat", "trans fats", "trans-fat"],
  "Saturated animal fats": [
    "saturated animal",
    "animal fat",
    "beef fat",
    "pork fat",
  ],
  Butter: ["butter", "ghee"],
  Lard: ["lard"],
  Tallow: ["tallow"],
  "Cream / heavy cream": [
    "heavy cream",
    "whipping cream",
    "double cream",
    "heavy whipping",
  ],
  "Full-fat cheese for fat load": [
    "full-fat cheese",
    "full fat cheese",
    "cheddar",
    "brie",
    "camembert",
    "cream cheese",
  ],
  "Animal fat cooking": ["cooked in animal fat", "fried in lard", "duck fat"],
  "Red meat": [
    "red meat",
    "beef",
    "steak",
    "lamb",
    "veal",
    "mutton",
    "ground beef",
    "hamburger",
    "burger patty",
  ],
  "Organ meat": [
    "organ meat",
    "liver",
    "kidney",
    "heart offal",
    "sweetbread",
    "tripe",
  ],
  "Bacon / sausage": ["bacon", "sausage", "pancetta", "prosciutto"],
  "Rice (refined)": ["white rice", "jasmine rice", "basmati white", "rice white"],
  "Pasta (refined)": [
    "white pasta",
    "spaghetti",
    "penne",
    "macaroni",
    "fettuccine",
    "linguine",
    "pasta",
  ],
  "White bread": [
    "white bread",
    "white toast",
    "baguette",
    "brioche",
    "hot dog bun",
    "hamburger bun",
  ],
  // Whole-word only in scanCutouts (never substring: ginger≠gin, vinegar≠wine)
  Alcohol: [
    "alcohol",
    "beer",
    "wine",
    "vodka",
    "whiskey",
    "whisky",
    "cocktail",
    "tequila",
    "rum",
    "gin",
    "liqueur",
    "boozy",
    "ipa",
  ],
  "Soda / energy drinks": [
    "soda",
    "cola",
    "pepsi",
    "sprite",
    "energy drink",
    "red bull",
    "monster energy",
    "soft drink",
  ],
  "Candy / pastry": [
    "candy",
    "pastry",
    "donut",
    "doughnut",
    "cookie",
    "cake",
    "brownie",
    "croissant",
    "muffin",
    "pie crust",
  ],
  "Ultra-processed snacks": [
    "ultra-processed",
    "chip bag",
    "potato chip",
    "potato chips",
    "crisps",
    "pocky",
    "protein bar candy",
  ],
};

function normalizeMealText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Scan free text (meal name, ingredients, notes) for cut-out hits.
 * Returns unique labels, first match wins per label.
 */
/** Escape regex special chars in a plain alias string. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Match alias in hay.
 * Short drink words use word boundaries so:
 *   ginger ≠ gin · chocolate ≠ cola · vinegar ≠ wine
 */
function hayHasAlias(
  hay: string,
  alias: string,
  label: CutoutLabel
): boolean {
  const a = alias.trim().toLowerCase();
  if (!a) return false;

  if (label === "Alcohol") {
    // Kitchen strings that are not drinking alcohol
    const safe = hay
      .replace(/\bapple\s+cider\s+vinegar\b/g, " ")
      .replace(/\bcider\s+vinegar\b/g, " ")
      .replace(/\bginger(\s+root)?\b/g, " ")
      .replace(/\bextra\s+virgin\b/g, " ")
      .replace(/\bvirgin\s+olive\b/g, " ");
    return new RegExp(`\\b${escapeRegExp(a)}\\b`, "i").test(safe);
  }

  // "cola" is inside "chocolate" — always whole-word for soda aliases
  if (label === "Soda / energy drinks") {
    return new RegExp(`\\b${escapeRegExp(a)}\\b`, "i").test(hay);
  }

  // Default: substring (phrases like "added sugar", "hot dog bun")
  return hay.includes(a);
}

export function scanCutouts(text: string): CutoutHit[] {
  if (!text?.trim()) return [];
  const hay = normalizeMealText(text);
  // Honey is allowed on the plate (trace) — strip so it never trips “sugar”
  const hayNoHoney = hay.replace(/\b(raw\s+|manuka\s+)?honey\b/g, " ");
  const hits: CutoutHit[] = [];
  const seen = new Set<string>();

  for (const label of PLATE_TRASH) {
    const aliases = CUTOUT_ALIASES[label] || [label.toLowerCase()];
    const sorted = [...aliases].sort((a, b) => b.length - a.length);
    let found: string | null = null;
    const searchIn = label === "Added sugar" ? hayNoHoney : hay;
    for (const a of sorted) {
      if (!a) continue;
      if (hayHasAlias(searchIn, a, label)) {
        found = a.trim();
        break;
      }
    }
    // Bare word “sugar” / “sugars” → Added sugar (after honey stripped)
    if (
      !found &&
      label === "Added sugar" &&
      /\bsugars?\b/.test(hayNoHoney)
    ) {
      found = "sugar";
    }
    if (found && !seen.has(label)) {
      seen.add(label);
      hits.push({ label, matched: found });
    }
  }
  return hits;
}

/** Scan several strings (name + ingredients + notes). */
export function scanCutoutsMany(parts: Array<string | undefined | null>): CutoutHit[] {
  const merged = parts.filter(Boolean).join(" \n ");
  return scanCutouts(merged);
}

export type MealCutoutReport = {
  name: string;
  hits: CutoutHit[];
  /** true if any cut-out present */
  flagged: boolean;
};

export function reportMealCutouts(
  name: string,
  extraParts: Array<string | undefined | null> = []
): MealCutoutReport {
  const hits = scanCutoutsMany([name, ...extraParts]);
  return { name, hits, flagged: hits.length > 0 };
}

/** True if text is free of every PLATE_TRASH hit. */
export function isCutoutClean(
  ...parts: Array<string | undefined | null>
): boolean {
  return scanCutoutsMany(parts).length === 0;
}

/**
 * Throw in dev / log if a planned food string fails the cut-out law.
 * Used to keep Shop + presets from ever introducing trash-bin items.
 */
export function assertCutoutClean(
  label: string,
  ...parts: Array<string | undefined | null>
): void {
  const hits = scanCutoutsMany(parts);
  if (!hits.length) return;
  const msg = `[cut-out law] "${label}" introduces banned items: ${hits
    .map((h) => h.label)
    .join(", ")}`;
  if (typeof console !== "undefined") console.warn(msg);
}

export type MacroSlice = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
};

export function plateFillFromMacros(m: MacroSlice): Record<PlateWedgeId, number> {
  const pCal = Math.max(0, m.protein_g) * 4;
  const cCal = Math.max(0, m.carbs_g) * 4;
  const fCal = Math.max(0, m.fat_g) * 9;
  const fiberBoost = Math.max(0, m.fiber_g) * 1.5;
  const plants = cCal + fiberBoost;
  const protein = pCal;
  const fats = fCal;
  const sum = plants + protein + fats;
  if (sum < 1) {
    return { plants: 0, protein: 0, fats: 0 };
  }
  return {
    plants: plants / sum,
    protein: protein / sum,
    fats: fats / sum,
  };
}

export function plateMatchScore(
  fill: Record<PlateWedgeId, number>
): number | null {
  const sum = fill.plants + fill.protein + fill.fats;
  if (sum < 0.05) return null;
  let err = 0;
  for (const w of PLATE_WEDGES) {
    err += Math.abs((fill[w.id] || 0) - w.share);
  }
  return Math.max(0, Math.min(100, Math.round((1 - err / 2) * 100)));
}

export type PlateCoach = {
  /** e.g. Fat heavy · plants light */
  status: string;
  /** One next move for the day */
  move: string;
  rows: Array<{
    id: PlateWedgeId;
    label: string;
    color: string;
    /** 0–100 today share */
    now: number;
    /** 0–100 target share */
    target: number;
    delta: number; // now - target (pp)
    tone: "over" | "under" | "ok";
  }>;
};

/**
 * Plain coach from macro→wedge fill vs Don't Die targets.
 * Threshold ~6pp so noise doesn't yell.
 */
export function plateCoach(
  fill: Record<PlateWedgeId, number>
): PlateCoach | null {
  const sum = fill.plants + fill.protein + fill.fats;
  if (sum < 0.05) return null;

  const rows = PLATE_WEDGES.map((w) => {
    const now = Math.round((fill[w.id] || 0) * 100);
    const target = Math.round(w.share * 100);
    const delta = now - target;
    const tone: "over" | "under" | "ok" =
      delta >= 6 ? "over" : delta <= -6 ? "under" : "ok";
    return {
      id: w.id,
      label: w.label,
      color: w.color,
      now,
      target,
      delta,
      tone,
    };
  });

  const over = rows.filter((r) => r.tone === "over").sort((a, b) => b.delta - a.delta);
  const under = rows
    .filter((r) => r.tone === "under")
    .sort((a, b) => a.delta - b.delta);

  let status = "On target";
  if (over.length && under.length) {
    status = `${over[0].label} heavy · ${under[0].label.toLowerCase()} light`;
  } else if (over.length) {
    status = `${over[0].label} heavy`;
  } else if (under.length) {
    status = `${under[0].label} light`;
  }

  let move = "Keep logging — plate looks balanced";
  if (over[0]?.id === "fats" && under[0]?.id === "plants") {
    move = "Next meal: plants (veg · lentils · fruit) — hold extra nuts/oil";
  } else if (over[0]?.id === "fats" && under[0]?.id === "protein") {
    move = "Next meal: protein first (fish · yogurt · lentils) — hold nuts";
  } else if (over[0]?.id === "fats") {
    move = "Next meal: pull fat down — more plants/protein, fewer nuts/oils";
  } else if (under[0]?.id === "protein") {
    move = "Next meal: add protein (fish · yogurt · egg white · lentils)";
  } else if (under[0]?.id === "plants") {
    move = "Next meal: stack plants (broccoli · berries · lentils)";
  } else if (over[0]?.id === "plants") {
    move = "Next meal: add protein or healthy fat if still hungry";
  } else if (over[0]?.id === "protein") {
    move = "Next meal: keep plants/fats steady — protein already high";
  }

  return { status, move, rows };
}

export function wedgePath(
  cx: number,
  cy: number,
  r: number,
  startFrac: number,
  endFrac: number
): string {
  const a0 = -Math.PI / 2 + startFrac * Math.PI * 2;
  const a1 = -Math.PI / 2 + endFrac * Math.PI * 2;
  const x0 = cx + r * Math.cos(a0);
  const y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  const large = endFrac - startFrac > 0.5 ? 1 : 0;
  return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
}
